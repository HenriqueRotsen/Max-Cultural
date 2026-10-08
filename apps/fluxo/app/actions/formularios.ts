"use server";

import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { revalidatePath } from "next/cache";
import type { FormularioCampoTipo, Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { assertDataAccess } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { normalizeRow, normalizeCpf } from "@/lib/normalize";
import { rowToPrisma, type BatchContext } from "@/lib/schema";
import {
  defaultFormularioModelos,
  defaultInscricaoCampos,
} from "@/lib/formularios/template";
import {
  FORMULARIO_CAMPO_TIPOS,
  slugifyTitulo,
  type FormularioCampoDraft,
  type FormularioCampoTipoCode,
} from "@/lib/formularios/types";
import type { FormularioTipo } from "@prisma/client";
import { validateFormularioAnswers } from "@/lib/formularios/validate-response";
import { canReviewFormulario } from "@/lib/formularios/access";
import { verifyRecaptchaToken } from "@/lib/recaptcha";
import { clientIpFromHeaders } from "@/lib/client-ip";
import {
  checkFormularioRateLimit,
  formularioRateLimitRequired,
} from "@/lib/rate-limit";
import { uploadPublicImage } from "@/lib/storage/object-store";
import {
  catalogFromOficinaParts,
  resolveOficinaTerritorioChoice,
  territorioOficinaFieldMeta,
  type OficinaTerritorioCatalog,
} from "@/lib/oficina-territorio";

async function loadOficinaTerritorioCatalog(
  oficinaId: string,
): Promise<OficinaTerritorioCatalog | null> {
  const oficina = await prisma.oficina.findUnique({
    where: { id: oficinaId },
    select: {
      ofereceOnline: true,
      oferecePresencial: true,
      territorios: {
        orderBy: { ordem: "asc" },
        select: { id: true, nome: true, cidade: true, estado: true },
      },
      territorioAliases: {
        select: {
          rawNormalized: true,
          online: true,
          oficinaTerritorioId: true,
          cidade: true,
          estado: true,
          territorio: true,
        },
      },
    },
  });
  if (!oficina) return null;
  return catalogFromOficinaParts({
    ofereceOnline: oficina.ofereceOnline,
    oferecePresencial: oficina.oferecePresencial,
    territorios: oficina.territorios,
    aliases: oficina.territorioAliases,
  });
}

function hydrateTerritorioOficinaCampos<
  T extends {
    tipo: string;
    obrigatorio: boolean;
    opcoes: string[] | null;
    config: Record<string, unknown> | null;
    sigaColumn: string | null;
  },
>(campos: T[], catalog: OficinaTerritorioCatalog | null): T[] {
  if (!catalog) return campos;
  const meta = territorioOficinaFieldMeta(catalog);
  return campos.map((c) => {
    if (c.tipo !== "TERRITORIO_OFICINA") return c;
    return {
      ...c,
      obrigatorio: meta.obrigatorio,
      opcoes: meta.opcoes,
      sigaColumn: c.sigaColumn ?? "Territorio",
      config: {
        ...(c.config ?? {}),
        hidden: !meta.showField,
        autoChoice: meta.autoChoice,
      },
    };
  });
}

function applyTerritorioChoiceToSiga(
  sigaPartial: Record<string, unknown>,
  choice: string,
  catalog: OficinaTerritorioCatalog,
): { oficinaTerritorioId: string | null; online: boolean } {
  const resolved = resolveOficinaTerritorioChoice(choice, catalog);
  if (resolved.online) {
    sigaPartial.Cidade = "";
    sigaPartial.Estado = "";
    sigaPartial.Territorio = resolved.territorio;
  } else if (resolved.matched || resolved.cidade || resolved.territorio) {
    sigaPartial.Cidade = resolved.cidade;
    sigaPartial.Estado = resolved.estado;
    sigaPartial.Territorio = resolved.territorio;
  }
  return {
    oficinaTerritorioId: resolved.oficinaTerritorioId,
    online: resolved.online,
  };
}

const CAPA_MAX_BYTES = 5 * 1024 * 1024;
const CAPA_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/** Aceita URL http(s). Paths `/uploads/...` antigos ainda são lidos. */
function sanitizeCapaUrl(raw: string | undefined | null): string {
  const u = (raw ?? "").trim();
  if (!u) return "";
  if (u.startsWith("/uploads/formularios/") && !u.includes("..")) {
    return u.slice(0, 500);
  }
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return u.slice(0, 2000);
    }
  } catch {
    /* inválida */
  }
  throw new Error(
    "URL de capa inválida. Use http(s) ou envie a imagem pelo upload.",
  );
}

function looksLikeImage(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === "image/png") {
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    );
  }
  if (mime === "image/gif") {
    return buf.slice(0, 3).toString("ascii") === "GIF";
  }
  if (mime === "image/webp") {
    return (
      buf.slice(0, 4).toString("ascii") === "RIFF" &&
      buf.slice(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

/** Upload de arte de capa → Supabase Storage (público) ou disco local em dev. */
export async function uploadFormularioCapaAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("formularios:write");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo de imagem." };
  }
  if (file.size > CAPA_MAX_BYTES) {
    return { ok: false, error: "Imagem muito grande (máx. 5 MB)." };
  }
  const mime = (file.type || "").toLowerCase();
  const extFromMime = CAPA_MIME[mime];
  if (!extFromMime) {
    return { ok: false, error: "Use JPG, PNG, WebP ou GIF." };
  }
  const nameExt = extname(file.name || "").toLowerCase();
  const ext =
    nameExt === ".jpeg" ||
    nameExt === ".jpg" ||
    nameExt === ".png" ||
    nameExt === ".webp" ||
    nameExt === ".gif"
      ? nameExt === ".jpeg"
        ? ".jpg"
        : nameExt
      : extFromMime;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    if (!looksLikeImage(buf, mime)) {
      return { ok: false, error: "Arquivo não parece uma imagem válida." };
    }
    // Sem recompressão: mantém definição da arte.
    const url = await uploadPublicImage({
      folder: "fluxo/capas",
      filename: `${randomUUID()}${ext}`,
      buffer: buf,
      contentType: mime,
    });
    return { ok: true, url };
  } catch (err) {
    console.error("[uploadFormularioCapa]", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Não foi possível enviar a capa. Tente novamente ou use uma URL.",
    };
  }
}

const TIPOS_PERMITIDOS = new Set<string>(FORMULARIO_CAMPO_TIPOS);

function asCampoTipo(t: string): FormularioCampoTipo {
  if (!TIPOS_PERMITIDOS.has(t)) {
    throw new Error(`Tipo de campo inválido: ${t}`);
  }
  return t as FormularioCampoTipo;
}

function cleanOpcoes(opcoes: string[] | null | undefined) {
  if (!opcoes?.length) return undefined;
  const cleaned = opcoes.map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

/** Modelos antigos ainda têm SHORT_TEXT em Territorio — promove para o tipo tipado. */
function upgradeTerritorioOficinaCampos(
  campos: FormularioCampoDraft[],
): FormularioCampoDraft[] {
  return campos.map((c) => {
    if (c.sigaColumn !== "Territorio") return c;
    if (c.tipo === "TERRITORIO_OFICINA") return c;
    if (c.tipo !== "SHORT_TEXT" && c.tipo !== "DROPDOWN") return c;
    return {
      ...c,
      tipo: "TERRITORIO_OFICINA",
      rotulo:
        c.rotulo.includes("comunidade") || c.rotulo === "Território / comunidade"
          ? "Em qual território você quer se inscrever?"
          : c.rotulo,
      descricao:
        c.descricao?.trim() ||
        "Escolha Online ou o território presencial (cidade/UF). As opções vêm do cadastro da oficina.",
      obrigatorio: true,
      opcoes: null,
    };
  });
}

function mapCamposCreate(campos: FormularioCampoDraft[]) {
  return upgradeTerritorioOficinaCampos(campos).map((c, i) => ({
    ordem: c.ordem ?? i,
    rotulo: c.rotulo.trim(),
    descricao: c.descricao ?? "",
    obrigatorio: Boolean(c.obrigatorio),
    tipo: asCampoTipo(c.tipo),
    sigaColumn:
      c.tipo === "TERRITORIO_OFICINA"
        ? c.sigaColumn ?? "Territorio"
        : c.sigaColumn,
    opcoes: cleanOpcoes(c.opcoes) as Prisma.InputJsonValue | undefined,
    config:
      c.config == null ? undefined : (c.config as Prisma.InputJsonValue),
  }));
}

async function oficinaBatch(oficinaId: string): Promise<BatchContext> {
  const oficina = await prisma.oficina.findUnique({
    where: { id: oficinaId },
    include: { projeto: { include: { contexto: true } } },
  });
  if (!oficina) throw new Error("Oficina não encontrada");
  return {
    contextoId: oficina.projeto.contextoId,
    Nome_contexto: oficina.projeto.contexto.nome,
    id_projeto: oficina.projetoId,
    id_oficina: oficina.id,
    PROPONENTE: oficina.projeto.proponente,
    PRONAC: oficina.projeto.pronac,
    Nome_projeto: oficina.projeto.nome,
    Identificacao_ano_projeto: oficina.projeto.ano || String(new Date().getFullYear()),
    Nome_oficina: oficina.nome,
  };
}

export async function listFormulariosAction() {
  const user = await requirePermission("dashboard:access");
  const { getEffectivePermissions } = await import("@/lib/permissions");
  const {
    isProfessorOnlyMode,
    listProfessorOficinaIds,
  } = await import("@/lib/formularios/access");
  const perms = await getEffectivePermissions(user.id);
  const canWrite = perms.has("formularios:write");
  const canReview = perms.has("formularios:review");
  const canMerge = perms.has("formularios:merge");
  if (!canWrite && !canReview && !canMerge) {
    throw new Error("Sem permissão.");
  }

  let oficinaFilter: string[] | null = null;
  if (isProfessorOnlyMode(user, perms)) {
    oficinaFilter = await listProfessorOficinaIds(user.id);
    if (oficinaFilter.length === 0) return [];
  }

  const rows = await prisma.formulario.findMany({
    where: oficinaFilter ? { oficinaId: { in: oficinaFilter } } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { respostas: true, campos: true } },
    },
  });
  const oficinaIds = [...new Set(rows.map((r) => r.oficinaId))];
  const oficinas = await prisma.oficina.findMany({
    where: { id: { in: oficinaIds } },
    include: { projeto: { include: { contexto: true } } },
  });
  const byId = new Map(oficinas.map((o) => [o.id, o]));
  return rows.map((r) => ({
    ...r,
    oficina: byId.get(r.oficinaId) ?? null,
  }));
}

export async function getFormularioAction(id: string) {
  const user = await requirePermission("dashboard:access");
  const { getEffectivePermissions } = await import("@/lib/permissions");
  const perms = await getEffectivePermissions(user.id);
  const canSee =
    perms.has("formularios:write") ||
    perms.has("formularios:review") ||
    perms.has("formularios:merge");
  if (!canSee) throw new Error("Sem permissão.");

  const form = await prisma.formulario.findUnique({
    where: { id },
    include: {
      campos: { orderBy: { ordem: "asc" } },
    },
  });
  if (!form) throw new Error("Formulário não encontrado");

  if (!perms.has("formularios:write") && !perms.has("formularios:merge")) {
    const asProfessor = await canReviewFormulario(user, form.oficinaId);
    if (!asProfessor) throw new Error("Sem permissão para este formulário.");
  } else if (!(await assertDataAccess(user.id, { idOficina: form.oficinaId }))) {
    throw new Error("Oficina fora do seu escopo de dados.");
  }

  const professores = await prisma.oficinaProfessor.findMany({
    where: { oficinaId: form.oficinaId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const oficina = await prisma.oficina.findUnique({
    where: { id: form.oficinaId },
    include: { projeto: { include: { contexto: true } } },
  });
  return { form, professores, oficina };
}

export async function createFormularioAction(input: {
  oficinaId: string;
  titulo: string;
  descricao?: string;
  abreEm?: string | null;
  encerraEm?: string | null;
  capaUrl?: string;
  mensagemConfirmacao?: string;
  campos?: FormularioCampoDraft[];
  tipo?: "INSCRICAO" | "AVALIACAO";
}) {
  const user = await requirePermission("formularios:write");
  if (!(await assertDataAccess(user.id, { idOficina: input.oficinaId }, { write: true }))) {
    throw new Error("Oficina fora do seu escopo de dados.");
  }

  const oficina = await prisma.oficina.findUnique({ where: { id: input.oficinaId } });
  if (!oficina) throw new Error("Oficina não encontrada");

  const titulo = input.titulo.trim();
  if (!titulo) throw new Error("Título obrigatório");

  const tipo = (input.tipo ?? "INSCRICAO") as FormularioTipo;
  const campos =
    input.campos?.length
      ? input.campos
      : ((await getFormularioModeloByTipoAction(tipo)).campos as FormularioCampoDraft[]);
  const slug = slugifyTitulo(titulo);

  const created = await prisma.formulario.create({
    data: {
      oficinaId: input.oficinaId,
      titulo,
      descricao: input.descricao?.trim() ?? "",
      slug,
      tipo,
      abreEm: input.abreEm ? new Date(input.abreEm) : null,
      encerraEm: input.encerraEm ? new Date(input.encerraEm) : null,
      capaUrl: sanitizeCapaUrl(input.capaUrl),
      mensagemConfirmacao:
        input.mensagemConfirmacao?.trim() ||
        (tipo === "AVALIACAO"
          ? "Avaliação enviada. Obrigado por participar e contribuir!"
          : "Inscrição enviada com sucesso. Aguarde o contato da equipe."),
      createdByUserId: user.id,
      campos: { create: mapCamposCreate(campos) },
    },
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "formulario.created",
    entityType: "formulario",
    entityId: created.id,
    meta: { oficinaId: input.oficinaId, slug, tipo },
  });

  revalidatePath("/dashboard/formularios");
  return { id: created.id, slug: created.slug };
}

export async function updateFormularioAction(
  id: string,
  input: {
    titulo?: string;
    descricao?: string;
    abreEm?: string | null;
    encerraEm?: string | null;
    ativo?: boolean;
    capaUrl?: string;
    mensagemConfirmacao?: string;
    campos?: FormularioCampoDraft[];
  },
) {
  const user = await requirePermission("formularios:write");
  const existing = await prisma.formulario.findUnique({ where: { id } });
  if (!existing) throw new Error("Formulário não encontrado");
  if (!(await assertDataAccess(user.id, { idOficina: existing.oficinaId }, { write: true }))) {
    throw new Error("Oficina fora do seu escopo de dados.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.formulario.update({
      where: { id },
      data: {
        ...(input.titulo != null ? { titulo: input.titulo.trim() } : {}),
        ...(input.descricao != null ? { descricao: input.descricao } : {}),
        ...(input.abreEm !== undefined
          ? { abreEm: input.abreEm ? new Date(input.abreEm) : null }
          : {}),
        ...(input.encerraEm !== undefined
          ? { encerraEm: input.encerraEm ? new Date(input.encerraEm) : null }
          : {}),
        ...(input.ativo != null ? { ativo: input.ativo } : {}),
        ...(input.capaUrl != null
          ? { capaUrl: sanitizeCapaUrl(input.capaUrl) }
          : {}),
        ...(input.mensagemConfirmacao != null
          ? { mensagemConfirmacao: input.mensagemConfirmacao.trim() }
          : {}),
      },
    });

    if (input.campos) {
      await tx.formularioCampo.deleteMany({ where: { formularioId: id } });
      await tx.formularioCampo.createMany({
        data: mapCamposCreate(input.campos).map((c) => ({
          ...c,
          formularioId: id,
        })),
      });
    }
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "formulario.updated",
    entityType: "formulario",
    entityId: id,
  });

  revalidatePath("/dashboard/formularios");
  revalidatePath(`/dashboard/formularios/${id}`);
  return { ok: true as const };
}

export async function setOficinaProfessoresAction(
  oficinaId: string,
  userIds: string[],
) {
  const user = await requirePermission("formularios:write");
  if (!(await assertDataAccess(user.id, { idOficina: oficinaId }, { write: true }))) {
    throw new Error("Oficina fora do seu escopo de dados.");
  }

  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length) {
    const found = await prisma.user.findMany({
      where: { id: { in: unique }, deactivatedAt: null },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new Error("Um ou mais usuários são inválidos ou estão inativos.");
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.oficinaProfessor.deleteMany({ where: { oficinaId } });
    if (unique.length) {
      await tx.oficinaProfessor.createMany({
        data: unique.map((userId) => ({ oficinaId, userId })),
      });
    }
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "formulario.professores_set",
    entityType: "oficina",
    entityId: oficinaId,
    meta: { userIds: unique },
  });

  revalidatePath("/dashboard/formularios");
  return { ok: true as const };
}

export async function listUsersForProfessorPickerAction(
  extraUserIds: string[] = [],
) {
  await requirePermission("formularios:write");
  const { PROFESSOR_ROLE_NAME } = await import("@/lib/permission-catalog");
  const extra = [...new Set(extraUserIds.filter(Boolean))];

  return prisma.user.findMany({
    where: {
      deactivatedAt: null,
      OR: [
        { role: { name: PROFESSOR_ROLE_NAME } },
        ...(extra.length ? [{ id: { in: extra } }] : []),
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
    take: 500,
  });
}

/** Página pública — sem auth */
export async function getPublicFormularioBySlugAction(slug: string) {
  const form = await prisma.formulario.findUnique({
    where: { slug },
    include: { campos: { orderBy: { ordem: "asc" } } },
  });
  if (!form || !form.ativo) {
    return { ok: false as const, error: "Formulário não encontrado." };
  }
  const now = new Date();
  if (form.abreEm && now < form.abreEm) {
    return { ok: false as const, error: "As inscrições ainda não abriram." };
  }
  if (form.encerraEm && now > form.encerraEm) {
    return { ok: false as const, error: "As inscrições estão encerradas." };
  }
  const oficina = await prisma.oficina.findUnique({
    where: { id: form.oficinaId },
    include: { projeto: { include: { contexto: true } } },
  });
  const catalog = await loadOficinaTerritorioCatalog(form.oficinaId);
  const campos = hydrateTerritorioOficinaCampos(
    form.campos.map((c) => ({
      id: c.id,
      ordem: c.ordem,
      rotulo: c.rotulo,
      descricao: c.descricao,
      obrigatorio: c.obrigatorio,
      tipo: c.tipo as FormularioCampoTipoCode,
      sigaColumn: c.sigaColumn,
      opcoes: (c.opcoes as string[] | null) ?? null,
      config: (c.config as Record<string, unknown> | null) ?? null,
    })),
    catalog,
  );
  return {
    ok: true as const,
    form: {
      id: form.id,
      titulo: form.titulo,
      descricao: form.descricao,
      slug: form.slug,
      tipo: form.tipo as "INSCRICAO" | "AVALIACAO",
      capaUrl: form.capaUrl,
      mensagemConfirmacao: form.mensagemConfirmacao,
      campos,
    },
    oficinaNome: oficina?.nome ?? "",
    projetoNome: oficina?.projeto.nome ?? "",
  };
}

export async function submitPublicFormularioAction(input: {
  slug: string;
  answers: Record<string, unknown>;
  recaptchaToken?: string;
}): Promise<
  | { ok: true; mensagemConfirmacao: string; capaUrl: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  const form = await prisma.formulario.findUnique({
    where: { slug: input.slug },
    include: { campos: { orderBy: { ordem: "asc" } } },
  });
  if (!form || !form.ativo) {
    return { ok: false, error: "Formulário não encontrado." };
  }
  const now = new Date();
  if (form.abreEm && now < form.abreEm) {
    return { ok: false, error: "As inscrições ainda não abriram." };
  }
  if (form.encerraEm && now > form.encerraEm) {
    return { ok: false, error: "As inscrições estão encerradas." };
  }

  const ip = await clientIpFromHeaders();
  if (formularioRateLimitRequired()) {
    const limited = await checkFormularioRateLimit(`${ip}:${input.slug}`);
    if (!limited.allowed) {
      return {
        ok: false,
        error: `Muitas tentativas. Aguarde ${limited.retryAfterSec}s e tente novamente.`,
      };
    }
  }

  const captcha = await verifyRecaptchaToken(
    input.recaptchaToken,
    "formulario_inscricao",
    ip,
  );
  if (!captcha.ok) return { ok: false, error: captcha.error };

  const catalog = await loadOficinaTerritorioCatalog(form.oficinaId);
  const camposHydrated = hydrateTerritorioOficinaCampos(
    form.campos.map((c) => ({
      id: c.id,
      rotulo: c.rotulo,
      obrigatorio: c.obrigatorio,
      tipo: c.tipo as FormularioCampoTipoCode,
      sigaColumn: c.sigaColumn,
      opcoes: (c.opcoes as string[] | null) ?? null,
      config: (c.config as Record<string, unknown> | null) ?? null,
    })),
    catalog,
  );

  const answers = { ...input.answers };
  for (const c of camposHydrated) {
    if (c.tipo !== "TERRITORIO_OFICINA") continue;
    const auto = c.config?.autoChoice;
    if (typeof auto === "string" && auto && !String(answers[c.id] ?? "").trim()) {
      answers[c.id] = auto;
    }
  }

  const validated = validateFormularioAnswers(
    camposHydrated.map((c) => ({
      id: c.id,
      rotulo: c.rotulo,
      obrigatorio: c.obrigatorio,
      tipo: c.tipo,
      sigaColumn: c.sigaColumn,
      opcoes: c.opcoes,
    })),
    answers,
  );
  if (!validated.ok) {
    return {
      ok: false,
      error: validated.errors._cpf || "Corrija os campos destacados.",
      fieldErrors: validated.errors,
    };
  }

  let oficinaTerritorioId: string | null = null;
  let territorioOnline = false;
  if (catalog) {
    for (const c of camposHydrated) {
      if (c.tipo !== "TERRITORIO_OFICINA") continue;
      const choice = String(validated.values[c.id] ?? "").trim();
      if (!choice) continue;
      const applied = applyTerritorioChoiceToSiga(
        validated.sigaPartial,
        choice,
        catalog,
      );
      oficinaTerritorioId = applied.oficinaTerritorioId;
      territorioOnline = applied.online;
    }
  }

  const existingInscricao = await prisma.inscricao.findFirst({
    where: { cpf: validated.cpf, idOficina: form.oficinaId },
    select: { id: true },
  });
  if (form.tipo === "INSCRICAO" && existingInscricao) {
    return {
      ok: false,
      error: "Já existe uma inscrição deste CPF nesta oficina.",
    };
  }
  if (form.tipo === "AVALIACAO" && !existingInscricao) {
    return {
      ok: false,
      error: "Não encontramos inscrição deste CPF nesta oficina.",
    };
  }

  try {
    await prisma.formularioResposta.create({
      data: {
        formularioId: form.id,
        cpf: validated.cpf,
        payload: {
          answers: validated.values,
          sigaPartial: validated.sigaPartial,
          oficinaTerritorioId,
          territorioOnline,
        } as Prisma.InputJsonValue,
        status: "PENDING",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique") || msg.includes("unique")) {
      return {
        ok: false,
        error: "Você já enviou uma inscrição neste formulário com este CPF.",
      };
    }
    throw err;
  }

  return {
    ok: true,
    mensagemConfirmacao: form.mensagemConfirmacao,
    capaUrl: form.capaUrl,
  };
}

export async function listRespostasAction(formularioId: string) {
  const user = await requirePermission("dashboard:access");
  const form = await prisma.formulario.findUnique({
    where: { id: formularioId },
    include: {
      campos: {
        select: { id: true, tipo: true, rotulo: true, sigaColumn: true, config: true },
      },
    },
  });
  if (!form) throw new Error("Formulário não encontrado");
  const { getEffectivePermissions } = await import("@/lib/permissions");
  const {
    isProfessorOnlyMode,
    redactPayloadForProfessor,
    cpfOcultoParaProfessor,
  } = await import("@/lib/formularios/access");
  const p = await getEffectivePermissions(user.id);
  const asProfessor = await canReviewFormulario(user, form.oficinaId);
  if (!asProfessor && !p.has("formularios:write") && !p.has("formularios:merge")) {
    throw new Error("Sem permissão para ver estas respostas.");
  }
  if (!asProfessor) {
    if (!(await assertDataAccess(user.id, { idOficina: form.oficinaId }))) {
      throw new Error("Oficina fora do seu escopo de dados.");
    }
  }

  const rows = await prisma.formularioResposta.findMany({
    where: { formularioId },
    orderBy: { submittedAt: "desc" },
  });

  if (!isProfessorOnlyMode(user, p)) return rows;

  const campos = form.campos.map((c) => ({
    id: c.id,
    tipo: c.tipo,
    rotulo: c.rotulo,
    sigaColumn: c.sigaColumn,
    config: (c.config as Record<string, unknown> | null) ?? null,
  }));
  const hideCpf = cpfOcultoParaProfessor(campos);

  return rows.map((r) => ({
    ...r,
    cpf: hideCpf ? "" : r.cpf,
    payload: redactPayloadForProfessor(
      (r.payload as {
        answers?: Record<string, unknown>;
        sigaPartial?: Record<string, unknown>;
      }) ?? {},
      campos,
    ),
  }));
}

export async function updateRespostaReviewAction(
  respostaId: string,
  input: {
    answers?: Record<string, unknown>;
    selecionados?: number;
    participacao?: string;
    status?: "PENDING" | "READY" | "REJECTED";
    /** Checkbox professor: true preenche com o nome do usuário; false limpa. */
    professor?: boolean;
  },
) {
  const user = await requirePermission("dashboard:access");
  const resposta = await prisma.formularioResposta.findUnique({
    where: { id: respostaId },
    include: { formulario: { include: { campos: true } } },
  });
  if (!resposta) throw new Error("Resposta não encontrada");
  if (resposta.status === "MERGED") {
    throw new Error("Resposta já mesclada na base — não pode editar.");
  }

  const { getEffectivePermissions } = await import("@/lib/permissions");
  const { isProfessorOnlyMode } = await import("@/lib/formularios/access");
  const p = await getEffectivePermissions(user.id);
  const canEditData = user.isSuperAdmin || p.has("formularios:write");
  const asProfessor = await canReviewFormulario(
    user,
    resposta.formulario.oficinaId,
  );

  if (canEditData) {
    if (
      !user.isSuperAdmin &&
      !(await assertDataAccess(
        user.id,
        { idOficina: resposta.formulario.oficinaId },
        { write: true },
      ))
    ) {
      throw new Error("Oficina fora do seu escopo de dados.");
    }
  } else if (!asProfessor) {
    throw new Error("Sem permissão para avaliar esta oficina.");
  }

  const professorOnly = isProfessorOnlyMode(user, p);

  if (professorOnly) {
    if (
      input.answers != null ||
      input.participacao != null ||
      input.status != null
    ) {
      throw new Error(
        "Professor só pode alterar Selecionado e a coluna Professor.",
      );
    }
  }

  if (
    (input.answers != null ||
      input.participacao != null ||
      input.status != null) &&
    !canEditData
  ) {
    throw new Error(
      "Sem permissão para editar dados, participação ou descartar inscrição.",
    );
  }

  let payload = resposta.payload as {
    answers?: Record<string, unknown>;
    sigaPartial?: Record<string, unknown>;
  };
  let selecionados = resposta.selecionados;
  let participantes = resposta.participantes;
  let certificado = resposta.certificado;
  let professorNome =
    typeof resposta.professorNome === "string" ? resposta.professorNome : "";

  if (canEditData && input.answers) {
    const validated = validateFormularioAnswers(
      resposta.formulario.campos.map((c) => ({
        id: c.id,
        rotulo: c.rotulo,
        obrigatorio: c.obrigatorio,
        tipo: c.tipo as FormularioCampoTipoCode,
        sigaColumn: c.sigaColumn,
        opcoes: (c.opcoes as string[] | null) ?? null,
      })),
      input.answers,
    );
    if (!validated.ok) {
      throw new Error(Object.values(validated.errors)[0] || "Dados inválidos");
    }
    payload = {
      answers: validated.values,
      sigaPartial: validated.sigaPartial,
    };
  }

  if (input.selecionados != null) {
    selecionados = input.selecionados ? 1 : 0;
  }
  if (canEditData && input.participacao) {
    const { parseParticipacaoStatus } = await import("@/lib/normalize");
    const parsed = parseParticipacaoStatus(input.participacao);
    if (parsed) {
      participantes = parsed.participante;
      certificado = parsed.certificado;
    }
  }
  if (input.professor != null) {
    professorNome = input.professor ? user.name.trim() : "";
  }

  const status = canEditData
    ? (input.status ?? (resposta.status as "PENDING" | "READY" | "REJECTED"))
    : (resposta.status as "PENDING" | "READY" | "REJECTED" | "MERGED");

  const nextStatus = status === "MERGED" ? resposta.status : status;

  await prisma.formularioResposta.update({
    where: { id: respostaId },
    data: {
      payload: payload as Prisma.InputJsonValue,
      selecionados,
      participantes,
      certificado,
      status: nextStatus,
      reviewedByUserId: user.id,
      reviewedAt: new Date(),
      ...(input.professor != null ? { professorNome } : {}),
    },
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "formulario.resposta_reviewed",
    entityType: "formulario_resposta",
    entityId: respostaId,
    meta: { status: nextStatus, professorOnly, canEditData },
  });

  revalidatePath(`/dashboard/formularios/${resposta.formularioId}/respostas`);
  return {
    ok: true as const,
    professorNome,
  };
}

export async function mergeRespostasAction(input: {
  formularioId: string;
  respostaIds: string[];
  confirmText: string;
}) {
  const user = await requirePermission("formularios:merge");
  const confirm = input.confirmText.trim().toUpperCase();
  if (confirm !== "ENVIAR" && confirm !== "MERGE") {
    throw new Error('Digite ENVIAR para confirmar o envio à base completa.');
  }

  const form = await prisma.formulario.findUnique({
    where: { id: input.formularioId },
  });
  if (!form) throw new Error("Formulário não encontrado");
  if (!(await assertDataAccess(user.id, { idOficina: form.oficinaId }, { write: true }))) {
    throw new Error("Oficina fora do seu escopo de dados.");
  }

  const batch = await oficinaBatch(form.oficinaId);
  const respostas = await prisma.formularioResposta.findMany({
    where: {
      id: { in: input.respostaIds },
      formularioId: form.id,
      status: "READY",
    },
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "formulario.merge_requested",
    entityType: "formulario",
    entityId: form.id,
    meta: { count: respostas.length, ids: input.respostaIds },
  });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const resp of respostas) {
    try {
      const payload = resp.payload as {
        sigaPartial?: Record<string, unknown>;
      };
      const existing = await prisma.inscricao.findFirst({
        where: { cpf: resp.cpf, idOficina: form.oficinaId },
        select: { id: true },
      });

      if (form.tipo === "AVALIACAO") {
        if (!existing) {
          results.push({
            id: resp.id,
            ok: false,
            error: "CPF não encontrado na base desta oficina",
          });
          continue;
        }
        await prisma.inscricao.update({
          where: { id: existing.id },
          data: {
            selecionados: resp.selecionados,
            participantes: resp.participantes,
            certificado: resp.certificado,
          },
        });
        await prisma.formularioResposta.update({
          where: { id: resp.id },
          data: {
            status: "MERGED",
            mergedInscricaoId: existing.id,
          },
        });
        results.push({ id: resp.id, ok: true });
        continue;
      }

      if (existing) {
        results.push({
          id: resp.id,
          ok: false,
          error: "CPF já existe na base desta oficina",
        });
        continue;
      }

      const row = normalizeRow(
        {
          ...(payload.sigaPartial ?? {}),
          CPF: normalizeCpf(resp.cpf),
          Inscritos: 1,
          Selecionados: resp.selecionados,
          Participantes: resp.participantes,
          Certificado: resp.certificado,
        },
        batch,
      );
      const data = rowToPrisma(row, {
        contextoId: batch.contextoId,
        nomeContexto: batch.Nome_contexto,
      });
      const created = await prisma.inscricao.create({ data });
      await prisma.formularioResposta.update({
        where: { id: resp.id },
        data: {
          status: "MERGED",
          mergedInscricaoId: created.id,
        },
      });
      results.push({ id: resp.id, ok: true });
    } catch (err) {
      results.push({
        id: resp.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  await writeAuditLog({
    actorUserId: user.id,
    action: "formulario.merged",
    entityType: "formulario",
    entityId: form.id,
    meta: { okCount, results },
  });

  revalidatePath(`/dashboard/formularios/${form.id}/respostas`);
  revalidatePath("/dashboard");
  return { results, okCount };
}

export async function defaultCamposTemplateAction(tipo: "INSCRICAO" | "AVALIACAO" = "INSCRICAO") {
  await requirePermission("formularios:write");
  const modelo = await getFormularioModeloByTipoAction(tipo);
  return modelo.campos as FormularioCampoDraft[];
}

function parseModeloCampos(raw: unknown): FormularioCampoDraft[] {
  if (!Array.isArray(raw)) return defaultInscricaoCampos();
  return raw.map((item, i) => {
    const c = item as Partial<FormularioCampoDraft>;
    return {
      id: c.id,
      ordem: typeof c.ordem === "number" ? c.ordem : i,
      rotulo: String(c.rotulo ?? "Pergunta"),
      descricao: String(c.descricao ?? ""),
      obrigatorio: Boolean(c.obrigatorio),
      tipo: (c.tipo as FormularioCampoTipoCode) || "SHORT_TEXT",
      sigaColumn: c.sigaColumn ?? null,
      opcoes: Array.isArray(c.opcoes) ? c.opcoes.map(String) : null,
      config:
        c.config && typeof c.config === "object"
          ? (c.config as Record<string, unknown>)
          : null,
    };
  });
}

/** Garante os 2 modelos padrão (inscrição / avaliação) no banco. */
export async function ensureFormularioModelosAction() {
  await requirePermission("formularios:write");
  const seeds = defaultFormularioModelos();
  for (const seed of seeds) {
    const existing = await prisma.formularioModelo.findUnique({
      where: { tipo: seed.tipo },
    });
    if (existing) continue;
    await prisma.formularioModelo.create({
      data: {
        tipo: seed.tipo,
        nome: seed.nome,
        tituloDefault: seed.tituloDefault,
        descricaoDefault: seed.descricaoDefault,
        mensagemConfirmacao: seed.mensagemConfirmacao,
        capaUrlDefault: seed.capaUrlDefault,
        campos: seed.campos as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return prisma.formularioModelo.findMany({ orderBy: { tipo: "asc" } });
}

export async function listFormularioModelosAction() {
  await requirePermission("formularios:write");
  await ensureFormularioModelosAction();
  const rows = await prisma.formularioModelo.findMany({ orderBy: { tipo: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo as "INSCRICAO" | "AVALIACAO",
    nome: r.nome,
    tituloDefault: r.tituloDefault,
    descricaoDefault: r.descricaoDefault,
    mensagemConfirmacao: r.mensagemConfirmacao,
    capaUrlDefault: r.capaUrlDefault,
    campos: parseModeloCampos(r.campos),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getFormularioModeloByTipoAction(
  tipo: "INSCRICAO" | "AVALIACAO",
) {
  await requirePermission("formularios:write");
  await ensureFormularioModelosAction();
  const row = await prisma.formularioModelo.findUnique({ where: { tipo } });
  if (!row) throw new Error("Modelo não encontrado");
  return {
    id: row.id,
    tipo: row.tipo as "INSCRICAO" | "AVALIACAO",
    nome: row.nome,
    tituloDefault: row.tituloDefault,
    descricaoDefault: row.descricaoDefault,
    mensagemConfirmacao: row.mensagemConfirmacao,
    capaUrlDefault: row.capaUrlDefault,
    campos: parseModeloCampos(row.campos),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateFormularioModeloAction(
  tipo: "INSCRICAO" | "AVALIACAO",
  input: {
    nome?: string;
    tituloDefault?: string;
    descricaoDefault?: string;
    mensagemConfirmacao?: string;
    capaUrlDefault?: string;
    campos?: FormularioCampoDraft[];
  },
) {
  const user = await requirePermission("formularios:write");
  await ensureFormularioModelosAction();
  const updated = await prisma.formularioModelo.update({
    where: { tipo },
    data: {
      ...(input.nome != null ? { nome: input.nome.trim() } : {}),
      ...(input.tituloDefault != null
        ? { tituloDefault: input.tituloDefault.trim() }
        : {}),
      ...(input.descricaoDefault != null
        ? { descricaoDefault: input.descricaoDefault }
        : {}),
      ...(input.mensagemConfirmacao != null
        ? { mensagemConfirmacao: input.mensagemConfirmacao }
        : {}),
      ...(input.capaUrlDefault != null
        ? { capaUrlDefault: sanitizeCapaUrl(input.capaUrlDefault) }
        : {}),
      ...(input.campos
        ? { campos: input.campos as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "formulario.modelo_updated",
    entityType: "formulario_modelo",
    entityId: updated.id,
    meta: { tipo },
  });
  revalidatePath("/dashboard/formularios/modelos");
  revalidatePath(`/dashboard/formularios/modelos/${tipo.toLowerCase()}`);
  return { ok: true as const };
}

export async function listOficinasParaFormularioAction() {
  const user = await requirePermission("formularios:write");
  const oficinas = await prisma.oficina.findMany({
    orderBy: { nome: "asc" },
    include: { projeto: { include: { contexto: true } } },
  });
  const out = [];
  for (const o of oficinas) {
    const ok = await assertDataAccess(
      user.id,
      {
        contextoId: o.projeto.contextoId,
        idProjeto: o.projetoId,
        idOficina: o.id,
      },
      { write: true },
    );
    if (!ok) continue;
    out.push({
      id: o.id,
      nome: o.nome,
      projetoId: o.projetoId,
      projetoNome: o.projeto.nome,
      contextoNome: o.projeto.contexto.nome,
      label: `${o.projeto.contexto.nome} · ${o.projeto.nome} · ${o.nome}`,
    });
  }
  return out;
}
