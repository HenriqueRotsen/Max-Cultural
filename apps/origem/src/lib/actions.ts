"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { relationGeneratesBond } from "@/lib/compliance/defaults";
import { corporateMapCopy } from "@/lib/corporate/copy";
import { CORPORATE_MAP_NOTE } from "@/lib/corporate/map-bonds";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { RelatedPartyRelation } from "@/generated/prisma/enums";
import { encryptCredential, normalizeCgccpf } from "@/lib/crypto";
import { cgccpfValidationError, formatCgccpf, isValidCgccpf } from "@/lib/format";

const accountSchema = z.object({
  name: z.string().min(2, "Informe o nome"),
  cgccpf: z.string().min(11, "Informe CPF ou CNPJ"),
  salicUsername: z.string().optional(),
  salicPassword: z.string().optional(),
  extraPronacs: z.string().optional(),
  personType: z.enum(["PJ", "PF", "MEI"]).optional(),
  active: z.boolean().optional(),
});

function parseAccountForm(formData: FormData, syncEnabled: boolean) {
  const personTypeRaw = String(formData.get("personType") || "PJ");
  return accountSchema.safeParse({
    name: formData.get("name"),
    cgccpf: formData.get("cgccpf"),
    salicUsername: syncEnabled
      ? String(formData.get("salicUsername") || "") || undefined
      : undefined,
    salicPassword: syncEnabled
      ? String(formData.get("salicPassword") || "") || undefined
      : undefined,
    extraPronacs: String(formData.get("extraPronacs") || "") || undefined,
    personType: personTypeRaw === "PF" || personTypeRaw === "MEI" ? personTypeRaw : "PJ",
    active:
      formData.get("active") === "on" ||
      formData.get("active") === "true" ||
      formData.get("active") !== "false",
  });
}

export async function createAccount(formData: FormData) {
  const { assertNotDemo } = await import("@/lib/demo");
  try {
    assertNotDemo("Cadastro de contas");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indisponível na demo";
    redirect("/contas?tab=nova&error=" + encodeURIComponent(message));
  }

  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertCanCreateAccount } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();

  try {
    await assertCanCreateAccount(entitlements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Limite de contas atingido";
    redirect("/contas?tab=nova&error=" + encodeURIComponent(message));
  }

  const result = parseAccountForm(formData, entitlements.syncEnabled);
  if (!result.success) {
    const message = result.error.issues[0]?.message || "Dados inválidos";
    redirect("/contas?tab=nova&error=" + encodeURIComponent(message));
  }
  const parsed = result.data;

  await prisma.salicAccount.create({
    data: {
      name: parsed.name,
      cgccpf: normalizeCgccpf(parsed.cgccpf),
      salicUsernameEnc: entitlements.syncEnabled
        ? encryptCredential(parsed.salicUsername)
        : null,
      salicPasswordEnc: entitlements.syncEnabled
        ? encryptCredential(parsed.salicPassword)
        : null,
      extraPronacs: parsed.extraPronacs || null,
      personType: parsed.personType || "PJ",
      active: true,
      workspaceId: entitlements.workspaceId,
    },
  });

  revalidatePath("/contas");
  revalidatePath("/painel");
  redirect("/contas?tab=suas-contas&created=1");
}

export async function updateAccount(id: string, formData: FormData) {
  const { assertNotDemo } = await import("@/lib/demo");
  try {
    assertNotDemo("Edição de contas");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indisponível na demo";
    redirect(`/contas?tab=suas-contas&error=${encodeURIComponent(message)}#account-${id}`);
  }

  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertAccountInWorkspace } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();
  await assertAccountInWorkspace(id, entitlements.workspaceId);

  const clearPassword = formData.get("clearPassword") === "1";
  const result = parseAccountForm(formData, entitlements.syncEnabled);
  if (!result.success) {
    const message = result.error.issues[0]?.message || "Dados inválidos";
    redirect(`/contas?tab=suas-contas&error=${encodeURIComponent(message)}#account-${id}`);
  }
  const parsed = result.data;

  await prisma.salicAccount.update({
    where: { id },
    data: {
      name: parsed.name,
      cgccpf: normalizeCgccpf(parsed.cgccpf),
      extraPronacs: parsed.extraPronacs || null,
      personType: parsed.personType || "PJ",
      active: formData.get("active") === "on" || formData.get("active") === "true",
      ...(entitlements.syncEnabled
        ? {
            salicUsernameEnc: encryptCredential(parsed.salicUsername),
            ...(clearPassword
              ? { salicPasswordEnc: null }
              : parsed.salicPassword
                ? { salicPasswordEnc: encryptCredential(parsed.salicPassword) }
                : {}),
          }
        : {}),
    },
  });

  revalidatePath("/contas");
  revalidatePath("/painel");
  redirect("/contas?tab=suas-contas&updated=1");
}

export async function clearAccountPassword(id: string) {
  const { assertNotDemo } = await import("@/lib/demo");
  try {
    assertNotDemo("Alteração de credenciais");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indisponível na demo";
    redirect(`/contas?tab=suas-contas&error=${encodeURIComponent(message)}`);
  }

  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertAccountInWorkspace, assertCanSync } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();
  await assertCanSync(entitlements);
  await assertAccountInWorkspace(id, entitlements.workspaceId);

  await prisma.salicAccount.update({
    where: { id },
    data: { salicPasswordEnc: null },
  });
  revalidatePath("/contas");
  redirect("/contas?tab=suas-contas&passwordCleared=1");
}

export async function deleteAccount(id: string) {
  const { assertNotDemo } = await import("@/lib/demo");
  try {
    assertNotDemo("Exclusão de contas");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indisponível na demo";
    redirect(`/contas?tab=suas-contas&error=${encodeURIComponent(message)}`);
  }

  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertAccountInWorkspace } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();
  await assertAccountInWorkspace(id, entitlements.workspaceId);

  await prisma.salicAccount.delete({ where: { id } });
  revalidatePath("/contas");
  revalidatePath("/painel");
  redirect("/contas?tab=suas-contas");
}

const RELATION_VALUES = Object.values(RelatedPartyRelation);

/** Define ou remove aresta A↔B (proponente ↔ parte) — usado na lista de observados. */
export async function setPartyRelation(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertAccountInWorkspace } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();

  const salicAccountId = String(formData.get("salicAccountId") || "").trim();
  const cgccpfRaw = String(formData.get("cgccpf") || "");
  const name = String(formData.get("name") || "").trim();
  const relationRaw = String(formData.get("relation") || "").trim();
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!salicAccountId) {
    return { ok: false as const, error: "Proponente obrigatório" };
  }
  await assertAccountInWorkspace(salicAccountId, entitlements.workspaceId);

  const cgccpf = normalizeCgccpf(cgccpfRaw);
  if (!cgccpf || !isValidCgccpf(cgccpf)) {
    return {
      ok: false as const,
      error: "CNPJ/CPF da outra parte é obrigatório para o relacionamento",
    };
  }

  const existing = await prisma.relatedParty.findUnique({
    where: { salicAccountId_cgccpf: { salicAccountId, cgccpf } },
    select: { notes: true },
  });
  if ((existing?.notes || "").includes(CORPORATE_MAP_NOTE)) {
    const account = await prisma.salicAccount.findUnique({
      where: { id: salicAccountId },
      select: { institutionalMap: true },
    });
    return {
      ok: false as const,
      error: corporateMapCopy(Boolean(account?.institutionalMap))
        .mapLockedRelation,
    };
  }

  if (!relationRaw) {
    await prisma.relatedParty.deleteMany({
      where: { salicAccountId, cgccpf },
    });
  } else {
    if (!RELATION_VALUES.includes(relationRaw as RelatedPartyRelation)) {
      return { ok: false as const, error: "Tipo de relacionamento inválido" };
    }
    const relation = relationRaw as RelatedPartyRelation;
    const partyName = name || cgccpf;
    const countsTowardProponentCap = relationGeneratesBond(relation);
    await prisma.relatedParty.upsert({
      where: {
        salicAccountId_cgccpf: { salicAccountId, cgccpf },
      },
      create: {
        salicAccountId,
        cgccpf,
        name: partyName,
        relation,
        notes,
        countsTowardProponentCap,
        artisticGroupException: false,
      },
      update: {
        name: partyName,
        relation,
        countsTowardProponentCap,
        // Edição manual deixa de ser “só do mapa”
        notes: notes !== null ? notes : null,
      },
    });
  }

  revalidatePath("/observados");
  revalidatePath("/contas");
  revalidatePath("/panorama");
  revalidatePath("/panorama/pronac");
  return { ok: true as const };
}

/** Liga/desliga vínculo do observado com o proponente sob uma IN (vale p/ todos os PRONACs dessa conta+IN). */
export async function setObservadoBond(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertAccountInWorkspace } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();

  const salicAccountId = String(formData.get("salicAccountId") || "").trim();
  const cgccpfRaw = String(formData.get("cgccpf") || "");
  const rulesetVersion = String(formData.get("rulesetVersion") || "").trim();
  const enabled = String(formData.get("enabled") || "") === "1";

  if (!salicAccountId || !rulesetVersion) {
    return { ok: false as const, error: "Proponente e IN são obrigatórios" };
  }
  await assertAccountInWorkspace(salicAccountId, entitlements.workspaceId);

  const cgccpf = normalizeCgccpf(cgccpfRaw);
  if (!cgccpf || (cgccpf.length !== 11 && cgccpf.length !== 14)) {
    return { ok: false as const, error: "CNPJ/CPF do observado inválido" };
  }

  await prisma.observadoBond.upsert({
    where: {
      salicAccountId_cgccpf_rulesetVersion: {
        salicAccountId,
        cgccpf,
        rulesetVersion,
      },
    },
    create: {
      workspaceId: entitlements.workspaceId,
      salicAccountId,
      cgccpf,
      rulesetVersion,
      enabled,
    },
    update: { enabled },
  });

  // Atualiza o briefing dos PRONACs deste proponente com a mesma IN
  const projects = await prisma.project.findMany({
    where: {
      salicAccountId,
      complianceRuleset: { version: rulesetVersion },
    },
    select: { id: true, pronac: true },
  });
  if (projects.length) {
    const { ensureProjectRuleset } = await import(
      "@/lib/compliance/choose-ruleset"
    );
    await Promise.all(
      projects.map((p) =>
        ensureProjectRuleset(p.id, { forceBriefRefresh: true }).catch((err) => {
          console.warn(
            "[bond] falha ao atualizar briefing",
            p.id,
            err instanceof Error ? err.message : err,
          );
        }),
      ),
    );
  }

  revalidatePath("/observados");
  revalidatePath("/panorama");
  revalidatePath("/panorama/pronac");
  revalidatePath("/auditoria");
  for (const p of projects) {
    revalidatePath(`/panorama/pronac/${p.pronac}`);
  }
  return { ok: true as const };
}

/** Ativa/desativa se um tipo de relacionamento gera vínculo art. 23 sob uma IN (workspace). */
export async function setRelationBondOverride(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();
  const workspaceId = entitlements.workspaceId;

  const rulesetVersion = String(formData.get("rulesetVersion") || "").trim();
  const relation = String(formData.get("relation") || "").trim();
  const enabled = String(formData.get("enabled") || "") === "1";

  if (!rulesetVersion || !relation) {
    return { ok: false as const, error: "IN e relacionamento são obrigatórios" };
  }

  const {
    getRulesetByVersion,
    getWorkspaceRelationBondOverrides,
  } = await import("@/lib/compliance/rules");

  const catalog = await getRulesetByVersion(rulesetVersion);
  if (!catalog) {
    return { ok: false as const, error: "IN não encontrada" };
  }

  const overrides = await getWorkspaceRelationBondOverrides(workspaceId);
  const current =
    overrides[rulesetVersion] ??
    [...catalog.caps.relationRules.countsTowardProponentCap];

  const set = new Set(current);
  if (enabled) set.add(relation as (typeof current)[number]);
  else set.delete(relation as (typeof current)[number]);

  const next = { ...overrides, [rulesetVersion]: Array.from(set) };

  // Se igual ao catálogo, remove a chave (volta ao padrão)
  const catalogSet = new Set(catalog.caps.relationRules.countsTowardProponentCap);
  const nextSet = new Set(next[rulesetVersion]);
  const same =
    catalogSet.size === nextSet.size &&
    [...catalogSet].every((x) => nextSet.has(x));
  if (same) delete next[rulesetVersion];

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      relationBondOverrides:
        Object.keys(next).length === 0
          ? Prisma.DbNull
          : (next as Prisma.InputJsonValue),
    },
  });

  revalidatePath("/observados");
  revalidatePath("/panorama");
  revalidatePath("/panorama/pronac");
  return { ok: true as const };
}

export async function resetRelationBondOverrides(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();
  const workspaceId = entitlements.workspaceId;
  const rulesetVersion = String(formData.get("rulesetVersion") || "").trim();

  const { getWorkspaceRelationBondOverrides } = await import(
    "@/lib/compliance/rules"
  );

  const overrides = await getWorkspaceRelationBondOverrides(workspaceId);
  if (rulesetVersion) {
    delete overrides[rulesetVersion];
  } else {
    for (const key of Object.keys(overrides)) delete overrides[key];
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      relationBondOverrides:
        Object.keys(overrides).length === 0
          ? Prisma.DbNull
          : (overrides as Prisma.InputJsonValue),
    },
  });

  revalidatePath("/observados");
  revalidatePath("/panorama");
  revalidatePath("/panorama/pronac");
  return { ok: true as const };
}

export async function lookupProponenteByCgccpf(cgccpfRaw: string) {
  const cgccpf = normalizeCgccpf(cgccpfRaw);
  if (cgccpf.length < 11) {
    return { found: false as const, error: "Informe um CNPJ/CPF válido" };
  }

  try {
    const { searchProponentes } = await import("@/lib/salic/api");
    const items = await searchProponentes({ cgccpf });
    const exact =
      items.find((p) => normalizeCgccpf(p.cgccpf || "") === cgccpf) || items[0];

    if (!exact?.nome) {
      // Fallback: try first project for this CNPJ to get proponente name
      const { listProjetosByCgccpf } = await import("@/lib/salic/api");
      const projetos = await listProjetosByCgccpf(cgccpf);
      const fromProject = projetos[0]?.proponente;
      if (fromProject) {
        return {
          found: true as const,
          nome: fromProject.trim(),
          cgccpf,
          source: "projetos" as const,
        };
      }
      return { found: false as const, error: "Proponente não encontrado na API SALIC" };
    }

    return {
      found: true as const,
      nome: exact.nome.trim(),
      cgccpf: normalizeCgccpf(exact.cgccpf || cgccpf),
      source: "proponentes" as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { found: false as const, error: message };
  }
}

/** Autocomplete de endereço via ViaCEP. */
export async function lookupCep(cepRaw: string) {
  try {
    const { fetchViaCep } = await import("@/lib/lookup/viacep");
    const result = await fetchViaCep(cepRaw);
    if (!result) {
      return { found: false as const, error: "CEP não encontrado" };
    }
    return { found: true as const, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { found: false as const, error: message };
  }
}

/**
 * CNPJ: BrasilAPI (nome / tipo).
 * CPF: só tenta nome no SALIC.
 */
export async function lookupAccountByCgccpf(cgccpfRaw: string) {
  const cgccpf = normalizeCgccpf(cgccpfRaw);
  if (cgccpf.length !== 11 && cgccpf.length !== 14) {
    return { found: false as const, error: "Informe um CNPJ (14) ou CPF (11) válido" };
  }

  if (cgccpf.length === 14) {
    try {
      const { fetchCnpjCompany } = await import("@/lib/lookup/cnpj");
      const company = await fetchCnpjCompany(cgccpf);
      if (company) {
        return {
          found: true as const,
          source: "brasilapi" as const,
          cgccpf: company.cnpj,
          name: company.name,
          personType: company.personType,
        };
      }
    } catch (error) {
      // Continua no SALIC; se ambos falharem, devolve o erro da BrasilAPI no final
      const salic = await lookupProponenteByCgccpf(cgccpf);
      if (salic.found) {
        return {
          found: true as const,
          source: "salic" as const,
          cgccpf: salic.cgccpf,
          name: salic.nome,
          personType: "PJ" as const,
        };
      }
      const message = error instanceof Error ? error.message : "Consulta CNPJ indisponível";
      return { found: false as const, error: message };
    }
  }

  const salic = await lookupProponenteByCgccpf(cgccpf);
  if (!salic.found) {
    return {
      found: false as const,
      error:
        cgccpf.length === 14
          ? salic.error || "CNPJ não encontrado"
          : "CPF não encontrado. Informe o nome manualmente.",
    };
  }

  return {
    found: true as const,
    source: "salic" as const,
    cgccpf: salic.cgccpf,
    name: salic.nome,
    personType: (cgccpf.length === 14 ? "PJ" : "PF") as "PJ" | "PF",
  };
}

/** Compara CPF/CNPJ aceitando máscara da API SALIC (`***110973**`). */
function cgccpfMatchesQuery(candidate: string | null | undefined, query: string) {
  const want = normalizeCgccpf(query);
  if (!want) return false;
  const raw = String(candidate || "").trim();
  if (!raw) return false;

  const digits = normalizeCgccpf(raw);
  if (digits && digits === want) return true;

  // Máscara: * = qualquer dígito; demais dígitos precisam bater na mesma posição
  if (raw.includes("*")) {
    const mask = raw.replace(/[^\d*]/g, "");
    if (mask.length !== want.length) {
      // Fallback: dígitos visíveis contidos no documento digitado
      return Boolean(digits && digits.length >= 4 && want.includes(digits));
    }
    for (let i = 0; i < mask.length; i++) {
      const ch = mask[i];
      if (ch !== "*" && ch !== want[i]) return false;
    }
    return true;
  }

  // Só veio o miolo do CPF
  if (want.length === 11 && digits && digits.length >= 4 && digits.length < 11) {
    return want.includes(digits);
  }

  return false;
}

function pickFornecedorNome(
  items: Array<{ nome?: string; cgccpf?: string }>,
  query: string,
) {
  const matched =
    items.find((f) => cgccpfMatchesQuery(f.cgccpf, query) && f.nome?.trim()) ||
    items.find((f) => (f.nome || "").includes(query) && f.nome?.trim());

  if (matched?.nome?.trim()) return matched.nome.trim();

  // Busca por documento costuma devolver 1 resultado (CPF mascarado)
  if (items.length === 1 && items[0]?.nome?.trim()) {
    return items[0].nome.trim();
  }

  return null;
}

export async function lookupFornecedorByCgccpf(cgccpfRaw: string) {
  const cgccpf = normalizeCgccpf(cgccpfRaw);
  if (cgccpf.length !== 11 && cgccpf.length !== 14) {
    return { found: false as const, error: "Informe um CNPJ (14) ou CPF (11) válido" };
  }
  const invalid = cgccpfValidationError(cgccpf);
  if (invalid) {
    return { found: false as const, error: invalid };
  }

  try {
    const { getWorkspaceContext } = await import("@/lib/auth/session");
    const { entitlements } = await getWorkspaceContext();
    const alreadyWatched = await prisma.watchedSupplier.findFirst({
      where: {
        workspaceId: entitlements.workspaceId,
        OR: [{ cgccpf }, { supplier: { cgccpf } }],
      },
      select: { id: true, label: true, nameQuery: true, supplier: { select: { name: true } } },
    });
    if (alreadyWatched) {
      const nome =
        alreadyWatched.label ||
        alreadyWatched.nameQuery ||
        alreadyWatched.supplier?.name ||
        null;
      return {
        found: true as const,
        nome: nome || formatCgccpf(cgccpf),
        cgccpf,
        source: "watched" as const,
        alreadyWatched: true as const,
        error: "Este fornecedor já está na lista de observados.",
      };
    }

    // 1) Já sincronizado no Salink — mais rápido e com CPF completo
    const local = await prisma.supplier.findUnique({ where: { cgccpf } });
    if (local?.name?.trim()) {
      return {
        found: true as const,
        nome: local.name.trim(),
        cgccpf,
        source: "local" as const,
      };
    }

    const { searchFornecedores } = await import("@/lib/salic/api");
    let items = await searchFornecedores({ cgccpf });
    let nome = pickFornecedorNome(items, cgccpf);

    // PF: às vezes a API só acha buscando o CPF como nome
    if (!nome && cgccpf.length === 11) {
      items = await searchFornecedores({ nome: cgccpf });
      nome = pickFornecedorNome(items, cgccpf);
    }

    if (!nome) {
      if (cgccpf.length === 11) {
        return {
          found: false as const,
          error:
            "CPF não encontrado automaticamente na API. Informe o nome manualmente.",
        };
      }
      return { found: false as const, error: "Fornecedor não encontrado na API SALIC" };
    }

    // Sempre devolve o documento digitado — a API mascara CPF e não deve sobrescrever o campo.
    return {
      found: true as const,
      nome,
      cgccpf,
      source: "api" as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { found: false as const, error: message };
  }
}

export async function addWatchedSupplier(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();

  const cgccpfRaw = String(formData.get("cgccpf") || "");
  const nameQuery = String(formData.get("nameQuery") || "").trim() || null;
  const label = String(formData.get("label") || "").trim() || null;
  const cgccpf = cgccpfRaw ? normalizeCgccpf(cgccpfRaw) : null;

  if (!cgccpf && !nameQuery) {
    return { ok: false as const, error: "Informe CNPJ/CPF ou nome do fornecedor" };
  }

  if (cgccpf && !isValidCgccpf(cgccpf)) {
    return {
      ok: false as const,
      error: cgccpfValidationError(cgccpf) || "CPF/CNPJ inválido",
    };
  }

  if (cgccpf) {
    const duplicateByDoc = await prisma.watchedSupplier.findFirst({
      where: {
        workspaceId: entitlements.workspaceId,
        OR: [{ cgccpf }, { supplier: { cgccpf } }],
      },
      select: { id: true, label: true, nameQuery: true },
    });
    if (duplicateByDoc) {
      return {
        ok: false as const,
        error: "Este fornecedor já está na lista de observados.",
        alreadyWatched: true as const,
      };
    }
  } else if (nameQuery) {
    const duplicateByName = await prisma.watchedSupplier.findFirst({
      where: {
        workspaceId: entitlements.workspaceId,
        OR: [
          { nameQuery: { equals: nameQuery, mode: "insensitive" } },
          { label: { equals: nameQuery, mode: "insensitive" } },
          { supplier: { name: { equals: nameQuery, mode: "insensitive" } } },
        ],
      },
      select: { id: true },
    });
    if (duplicateByName) {
      return {
        ok: false as const,
        error: "Este fornecedor já está na lista de observados.",
        alreadyWatched: true as const,
      };
    }
  }

  let supplierId: string | null = null;
  if (cgccpf) {
    const existing = await prisma.supplier.findUnique({ where: { cgccpf } });
    if (existing) {
      supplierId = existing.id;
    } else if (nameQuery) {
      const created = await prisma.supplier.create({
        data: { cgccpf, name: nameQuery },
      });
      supplierId = created.id;
    }
  }

  await prisma.watchedSupplier.create({
    data: {
      cgccpf,
      nameQuery,
      label: label || nameQuery || cgccpf,
      supplierId,
      workspaceId: entitlements.workspaceId,
    },
  });

  revalidatePath("/observados");
  revalidatePath("/contas");
  revalidatePath("/panorama");
  revalidatePath("/panorama/pronac");
  revalidatePath("/fornecedores");
  revalidatePath("/fornecedores/empresas");
  return { ok: true as const };
}

export async function removeWatchedSupplier(id: string) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();

  await prisma.watchedSupplier.deleteMany({
    where: { id, workspaceId: entitlements.workspaceId },
  });
  revalidatePath("/observados");
  revalidatePath("/panorama");
  revalidatePath("/panorama/pronac");
}

export async function startSync(formData: FormData) {
  const { assertNotDemo } = await import("@/lib/demo");
  try {
    assertNotDemo("Sincronização");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indisponível na demo";
    redirect("/sync?error=" + encodeURIComponent(message));
  }

  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { assertAccountInWorkspace, assertCanSync } = await import("@/lib/auth/workspace");
  const { entitlements } = await getWorkspaceContext();
  await assertCanSync(entitlements);

  const accountId = String(formData.get("accountId") || "") || undefined;
  if (accountId) {
    await assertAccountInWorkspace(accountId, entitlements.workspaceId);
  }

  const forceCrawler = true;
  const pronacRaw = String(formData.get("pronac") || "");
  const pronacs = pronacRaw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const { after } = await import("next/server");
  const { enqueueSync, executeSyncRun } = await import("@/lib/sync/run");

  const options = {
    salicAccountId: accountId,
    forceCrawler,
    pronacs,
    workspaceId: entitlements.workspaceId,
  };

  const syncRun = await enqueueSync(options);

  after(() => {
    void executeSyncRun(syncRun.id, options).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "error",
          finishedAt: new Date(),
          errorMessage: message,
          progressMessage: "Falhou",
        },
      });
    });
  });

  revalidatePath("/sync");
  return { syncRunId: syncRun.id, mode: "full" };
}

async function assertAccountInWorkspace(accountId: string, workspaceId: string) {
  const account = await prisma.salicAccount.findFirst({
    where: { id: accountId, workspaceId },
  });
  if (!account) {
    throw new Error("Proponente não encontrado neste workspace");
  }
  return account;
}

async function afterCorporateMapChange(accountId: string) {
  revalidatePath(`/contas/mapa/${accountId}`);
  revalidatePath("/contas");
  revalidatePath("/observados");
  revalidatePath("/panorama");
  revalidatePath("/panorama/pronac");
  revalidatePath("/auditoria");
}

async function refreshAccountBriefs(accountId: string) {
  const projects = await prisma.project.findMany({
    where: { salicAccountId: accountId },
    select: { id: true },
  });
  if (!projects.length) return;
  const { ensureProjectRuleset } = await import(
    "@/lib/compliance/choose-ruleset"
  );
  await Promise.all(
    projects.map((p) =>
      ensureProjectRuleset(p.id, { forceBriefRefresh: true }).catch((err) => {
        console.warn(
          "[map] falha ao atualizar briefing",
          p.id,
          err instanceof Error ? err.message : err,
        );
      }),
    ),
  );
}

export async function setAccountInstitutionalMap(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "").trim();
  const enabled = String(formData.get("institutionalMap") || "") === "1";
  if (!accountId) return { ok: false as const, error: "Proponente obrigatório" };

  try {
    await assertAccountInWorkspace(accountId, entitlements.workspaceId);
    await prisma.salicAccount.update({
      where: { id: accountId },
      data: { institutionalMap: enabled },
    });
    if (enabled) {
      await prisma.corporatePeriodMember.updateMany({
        where: { period: { salicAccountId: accountId } },
        data: { role: "ADMINISTRATOR" },
      });
    }
    await refreshAccountBriefs(accountId);
    await afterCorporateMapChange(accountId);
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao salvar o modo do mapa",
    };
  }
}

async function assertPeriodInWorkspace(periodId: string, workspaceId: string) {
  const period = await prisma.corporatePeriod.findFirst({
    where: { id: periodId, salicAccount: { workspaceId } },
    include: { salicAccount: true },
  });
  if (!period) throw new Error("Intervalo não encontrado neste workspace");
  return period;
}

/** Importa QSA como um intervalo vigente (da abertura até hoje). */
export async function importAccountCorporateMap(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "").trim();
  const replace = String(formData.get("replace") || "") === "1";

  if (!accountId) return { ok: false as const, error: "Proponente obrigatório" };

  try {
    const account = await assertAccountInWorkspace(
      accountId,
      entitlements.workspaceId,
    );
    const digits = account.cgccpf.replace(/\D/g, "");
    if (digits.length !== 14) {
      return {
        ok: false as const,
        error: corporateMapCopy(account.institutionalMap).autoImportError,
      };
    }

    const { fetchCnpjCompany } = await import("@/lib/lookup/cnpj");
    const company = await fetchCnpjCompany(digits);
    if (!company) {
      return { ok: false as const, error: "CNPJ não encontrado na Receita Federal" };
    }

    if (company.foundedAt) {
      await prisma.salicAccount.update({
        where: { id: accountId },
        data: {
          foundedAt: company.foundedAt,
          foundedAtPrecision: "DAY",
          foundedAtSource: "brasilapi",
          name: account.name || company.name,
        },
      });
    }

    const existingCount = await prisma.corporatePeriod.count({
      where: { salicAccountId: accountId },
    });
    if (existingCount > 0 && !replace) {
      return {
        ok: true as const,
        imported: 0,
        foundedAt: company.foundedAt?.toISOString() || null,
        skipped: true as const,
        message:
          "Já existem intervalos cadastrados. Use o botão de novo e confirme para substituir.",
      };
    }

    if (replace) {
      await prisma.corporatePeriod.deleteMany({ where: { salicAccountId: accountId } });
    }

    const validFrom = company.foundedAt || account.foundedAt || new Date();
    if (company.qsa.length) {
      await prisma.corporatePeriod.create({
        data: {
          salicAccountId: accountId,
          validFrom,
          validFromPrecision: "DAY",
          validTo: null,
          source: "brasilapi",
          label: "Composição atual (Receita Federal)",
          members: {
            create: company.qsa.map((m) => ({
              name: m.name,
              cgccpf: m.cgccpf,
              personType: m.personType,
              role: account.institutionalMap ? "ADMINISTRATOR" : m.role,
              source: "brasilapi",
            })),
          },
        },
      });
    }

    await afterCorporateMapChange(accountId);
    return {
      ok: true as const,
      imported: company.qsa.length,
      foundedAt: company.foundedAt?.toISOString() || null,
      skipped: false as const,
    };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof Error
          ? e.message
          : corporateMapCopy(false).failImport,
    };
  }
}

export async function upsertCorporatePeriod(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "").trim();
  const periodId = String(formData.get("periodId") || "").trim() || null;
  const label = String(formData.get("label") || "").trim() || null;
  const openEnded = String(formData.get("openEnded") || "") === "1";

  if (!accountId) return { ok: false as const, error: "Proponente obrigatório" };

  try {
    const account = await assertAccountInWorkspace(
      accountId,
      entitlements.workspaceId,
    );
    const { parsePrecisionForm, assertNotBeforeFounded } = await import(
      "@/lib/corporate/dates"
    );
    const fromParsed = parsePrecisionForm({
      precision: String(formData.get("validFromPrecision") || "DAY"),
      year: String(formData.get("validFromYear") || ""),
      month: String(formData.get("validFromMonth") || ""),
      day: String(formData.get("validFromDay") || ""),
    });
    if (!fromParsed) {
      return { ok: false as const, error: "Início do intervalo inválido" };
    }
    const fromErr = assertNotBeforeFounded(fromParsed.date, account.foundedAt);
    if (fromErr) return { ok: false as const, error: fromErr };

    let validTo: Date | null = null;
    let validToPrecision: "DAY" | "MONTH" | "YEAR" = "DAY";
    if (!openEnded) {
      const toParsed = parsePrecisionForm({
        precision: String(formData.get("validToPrecision") || "DAY"),
        year: String(formData.get("validToYear") || ""),
        month: String(formData.get("validToMonth") || ""),
        day: String(formData.get("validToDay") || ""),
      });
      if (!toParsed) {
        return { ok: false as const, error: "Fim do intervalo inválido" };
      }
      if (toParsed.date.getTime() < fromParsed.date.getTime()) {
        return {
          ok: false as const,
          error: "O fim do intervalo deve ser ≥ ao início",
        };
      }
      validTo = toParsed.date;
      validToPrecision = toParsed.precision;
    }

    const data = {
      validFrom: fromParsed.date,
      validFromPrecision: fromParsed.precision,
      validTo,
      validToPrecision,
      label,
      source: "manual" as const,
    };

    if (periodId) {
      await assertPeriodInWorkspace(periodId, entitlements.workspaceId);
      await prisma.corporatePeriod.update({ where: { id: periodId }, data });
    } else {
      await prisma.corporatePeriod.create({
        data: { salicAccountId: accountId, ...data },
      });
    }

    await afterCorporateMapChange(accountId);
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Falha ao salvar intervalo",
    };
  }
}

export async function deleteCorporatePeriod(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "").trim();
  const periodId = String(formData.get("periodId") || "").trim();
  if (!accountId || !periodId) {
    return { ok: false as const, error: "Dados incompletos" };
  }
  await assertPeriodInWorkspace(periodId, entitlements.workspaceId);
  await prisma.corporatePeriod.delete({ where: { id: periodId } });
  await afterCorporateMapChange(accountId);
  return { ok: true as const };
}

export async function upsertCorporatePeriodMember(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "").trim();
  const periodId = String(formData.get("periodId") || "").trim();
  const memberId = String(formData.get("memberId") || "").trim() || null;
  const name = String(formData.get("name") || "").trim();
  const cgccpf = normalizeCgccpf(String(formData.get("cgccpf") || ""));
  const personType: "PF" | "PJ" | "MEI" =
    cgccpf.length === 14 ? "PJ" : "PF";
  const roleRaw = String(formData.get("role") || "PARTNER");

  if (!accountId || !periodId || !name) {
    return { ok: false as const, error: "Intervalo e nome são obrigatórios" };
  }

  try {
    const account = await assertAccountInWorkspace(
      accountId,
      entitlements.workspaceId,
    );
    await assertPeriodInWorkspace(periodId, entitlements.workspaceId);
    if (cgccpf && cgccpf.length !== 11 && cgccpf.length !== 14) {
      return {
        ok: false as const,
        error: "Informe um CPF (11) ou CNPJ (14) válido",
      };
    }

    const role = account.institutionalMap
      ? "ADMINISTRATOR"
      : roleRaw === "ADMINISTRATOR" || roleRaw === "BOTH"
        ? roleRaw
        : "PARTNER";

    const data = {
      name,
      cgccpf,
      personType,
      role: role as "PARTNER" | "ADMINISTRATOR" | "BOTH",
      source: "manual" as const,
    };

    if (memberId) {
      await prisma.corporatePeriodMember.update({
        where: { id: memberId },
        data,
      });
    } else {
      await prisma.corporatePeriodMember.create({
        data: { periodId, ...data },
      });
    }

    await afterCorporateMapChange(accountId);
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      error:
        e instanceof Error
          ? e.message
          : corporateMapCopy(false).failSaveMember,
    };
  }
}

export async function deleteCorporatePeriodMember(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "").trim();
  const memberId = String(formData.get("memberId") || "").trim();
  if (!accountId || !memberId) {
    return { ok: false as const, error: "Dados incompletos" };
  }
  const member = await prisma.corporatePeriodMember.findFirst({
    where: {
      id: memberId,
      period: { salicAccount: { workspaceId: entitlements.workspaceId } },
    },
  });
  if (!member) {
    return {
      ok: false as const,
      error: corporateMapCopy(false).memberNotFound,
    };
  }
  await prisma.corporatePeriodMember.delete({ where: { id: memberId } });
  await afterCorporateMapChange(accountId);
  return { ok: true as const };
}

export async function setAccountFoundedAt(formData: FormData) {
  const { getWorkspaceContext } = await import("@/lib/auth/session");
  const { entitlements } = await getWorkspaceContext();
  const accountId = String(formData.get("accountId") || "").trim();
  if (!accountId) return { ok: false as const, error: "Proponente obrigatório" };

  await assertAccountInWorkspace(accountId, entitlements.workspaceId);
  const { parsePrecisionForm } = await import("@/lib/corporate/dates");
  const parsed = parsePrecisionForm({
    precision: String(formData.get("foundedPrecision") || "DAY"),
    year: String(formData.get("foundedYear") || ""),
    month: String(formData.get("foundedMonth") || ""),
    day: String(formData.get("foundedDay") || ""),
  });
  if (!parsed) return { ok: false as const, error: "Data de abertura inválida" };

  await prisma.salicAccount.update({
    where: { id: accountId },
    data: {
      foundedAt: parsed.date,
      foundedAtPrecision: parsed.precision,
      foundedAtSource: "manual",
    },
  });
  revalidatePath(`/contas/mapa/${accountId}`);
  return { ok: true as const };
}



