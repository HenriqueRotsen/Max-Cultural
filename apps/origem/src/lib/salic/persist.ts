import { prisma } from "@/lib/db";
import { formatCgccpf, normalizeCgccpf } from "@/lib/crypto";
import {
  getProjetoByPronac,
  listFornecedoresByPronac,
  listProjetosByCgccpf,
  parseSalicMoney,
  type SalicFornecedor,
  type SalicProduto,
  type SalicProjeto,
} from "@/lib/salic/api";
import { getSyncConcurrency, mapPool } from "@/lib/salic/concurrency";
import { ProdutosCache } from "@/lib/salic/produtos-cache";

export type ProgressFn = (
  message: string,
  meta?: { current?: number; total?: number },
) => void | Promise<void>;

function parseSalicDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Extrai valor captado/aprovado de um registro da API SALIC. */
export function financialsFromProjeto(projeto?: SalicProjeto | null) {
  return {
    valorCaptado: parseSalicMoney(projeto?.valor_captado),
    valorAprovado: parseSalicMoney(projeto?.valor_aprovado),
  };
}

/** Atualiza captado/aprovado no projeto (API pública). */
export async function refreshProjectFinancials(params: {
  projectId: string;
  pronac: string;
  fromProjeto?: SalicProjeto | null;
}) {
  const projeto =
    params.fromProjeto ?? (await getProjetoByPronac(params.pronac).catch(() => null));
  const { valorCaptado, valorAprovado } = financialsFromProjeto(projeto);
  if (valorCaptado == null && valorAprovado == null) {
    return { valorCaptado: null, valorAprovado: null };
  }
  await prisma.project.update({
    where: { id: params.projectId },
    data: {
      ...(valorCaptado != null ? { valorCaptado } : {}),
      ...(valorAprovado != null ? { valorAprovado } : {}),
    },
  });
  return { valorCaptado, valorAprovado };
}

async function upsertSupplier(input: {
  cgccpf?: string | null;
  name?: string | null;
  email?: string | null;
  salicId?: string | null;
}) {
  const cgccpf = normalizeCgccpf(input.cgccpf || "0") || "0";
  const name = (input.name || "Fornecedor sem nome").trim();

  return prisma.supplier.upsert({
    where: { cgccpf },
    create: {
      cgccpf,
      name,
      email: input.email || null,
      salicId: input.salicId || null,
    },
    update: {
      name,
      email: input.email || undefined,
      salicId: input.salicId || undefined,
    },
  });
}

async function upsertPaymentFromProduto(params: {
  projectId: string;
  supplierId: string;
  produto: SalicProduto;
  source: "api" | "crawler";
}) {
  const { projectId, supplierId, produto, source } = params;
  const externalId =
    produto.id_comprovante_pagamento != null
      ? String(produto.id_comprovante_pagamento)
      : null;

  const data = {
    itemName: produto.nome || null,
    documentType: produto.tipo_documento || null,
    documentNumber: produto.nr_comprovante || null,
    paymentDate: parseSalicDate(produto.data_pagamento),
    approvalDate: parseSalicDate(produto.data_aprovacao),
    paymentMethod: produto.tipo_forma_pagamento || null,
    paymentDocumentNumber: produto.nr_documento_pagamento || null,
    amount: produto.valor_pagamento ?? 0,
    fileId: produto.id_arquivo != null ? String(produto.id_arquivo) : null,
    fileName: produto.nm_arquivo || null,
    justification: produto.justificativa || null,
    planilhaAprovacaoId:
      produto.id_planilha_aprovacao != null
        ? String(produto.id_planilha_aprovacao)
        : null,
    projectId,
    supplierId,
  };

  const payment = externalId
    ? await prisma.payment.upsert({
        where: {
          source_externalId: { source, externalId },
        },
        create: { ...data, source, externalId },
        update: data,
      })
    : await prisma.payment.create({
        data: { ...data, source, externalId },
      });

  // Uma fonte de verdade: remove o mesmo comprovante gravado por outra origem (api vs crawler).
  if (externalId) {
    await prisma.payment.deleteMany({
      where: {
        externalId,
        source: { not: source },
        id: { not: payment.id },
      },
    });
  }

  return payment;
}

/**
 * Espelha o SALIC no projeto: só permanecem comprovantes vistos nesta sincronização.
 * Prefere externalId (idComprovantePagamento); fallback para ids internos.
 */
export async function reconcileProjectPayments(
  projectId: string,
  seenPaymentIds: Set<string>,
  seenExternalIds?: Set<string>,
) {
  const externalIds = seenExternalIds
    ? [...seenExternalIds].filter((id) => id.length > 0)
    : [];

  if (externalIds.length > 0) {
    const result = await prisma.payment.deleteMany({
      where: {
        projectId,
        OR: [{ externalId: null }, { externalId: { notIn: externalIds } }],
      },
    });
    return result.count;
  }

  if (seenPaymentIds.size === 0) {
    const result = await prisma.payment.deleteMany({ where: { projectId } });
    return result.count;
  }

  const result = await prisma.payment.deleteMany({
    where: {
      projectId,
      id: { notIn: Array.from(seenPaymentIds) },
    },
  });
  return result.count;
}

/**
 * Em sync completo da conta, remove projetos que não existem mais no SALIC.
 */
export async function reconcileAccountProjects(
  salicAccountId: string,
  seenPronacs: Set<string>,
) {
  if (seenPronacs.size === 0) return 0;

  const result = await prisma.project.deleteMany({
    where: {
      salicAccountId,
      pronac: { notIn: Array.from(seenPronacs) },
    },
  });
  return result.count;
}

type FornecedorRef = SalicFornecedor & { salicId?: string };

async function persistProdutosForPronac(params: {
  projectId: string;
  pronac: string;
  fornecedores: FornecedorRef[];
  cache: ProdutosCache;
  onProgress?: ProgressFn;
}) {
  const { projectId, pronac, fornecedores, cache, onProgress } = params;
  let paymentsUpserted = 0;
  let paymentsDeleted = 0;
  let hadFetchError = false;
  const seenPaymentIds = new Set<string>();
  const seenExternalIds = new Set<string>();
  const concurrency = getSyncConcurrency();

  // Dedupa por CNPJ/CPF dentro do PRONAC (API às vezes repete IDs/hashes)
  const unique = new Map<string, FornecedorRef>();
  for (const f of fornecedores) {
    if (!f.salicId) continue;
    const key = normalizeCgccpf(f.cgccpf || "") || f.salicId;
    if (!unique.has(key)) unique.set(key, f);
  }
  const list = Array.from(unique.values());
  let done = 0;

  await mapPool(list, concurrency, async (fornecedor) => {
    const supplier = await upsertSupplier({
      cgccpf: fornecedor.cgccpf,
      name: fornecedor.nome,
      email: fornecedor.email,
      salicId: fornecedor.salicId,
    });

    try {
      const produtos = await cache.get(fornecedor.salicId!, fornecedor.cgccpf);
      const forPronac = produtos.filter((p) => String(p.PRONAC) === String(pronac));
      for (const produto of forPronac) {
        const externalId =
          produto.id_comprovante_pagamento != null
            ? String(produto.id_comprovante_pagamento)
            : null;
        // Sem id do comprovante não dá para espelhar remoções com segurança
        if (!externalId) continue;
        if (seenExternalIds.has(externalId)) continue;
        const payment = await upsertPaymentFromProduto({
          projectId,
          supplierId: supplier.id,
          produto,
          source: "api",
        });
        seenPaymentIds.add(payment.id);
        seenExternalIds.add(externalId);
        paymentsUpserted += 1;
      }
    } catch (error) {
      hadFetchError = true;
      console.warn(
        `Falha produtos ${fornecedor.salicId}:`,
        error instanceof Error ? error.message : error,
      );
    } finally {
      done += 1;
      await onProgress?.(
        `PRONAC ${pronac}: ${done}/${list.length} fornecedores`,
        { current: done, total: list.length },
      );
    }
  });

  // Só reconcilia se a listagem completa dos fornecedores deu certo
  // (lista vazia de fornecedores também é válida → zera pagamentos do projeto).
  if (!hadFetchError) {
    paymentsDeleted = await reconcileProjectPayments(
      projectId,
      seenPaymentIds,
      seenExternalIds,
    );
  }

  return {
    paymentsUpserted,
    paymentsDeleted,
    fornecedoresCount: list.length,
    reconciled: !hadFetchError,
  };
}

export async function syncProjectViaApi(params: {
  salicAccountId: string;
  pronac: string;
  projectName?: string | null;
  onProgress?: ProgressFn;
  cache?: ProdutosCache;
  valorCaptado?: number | null;
  valorAprovado?: number | null;
}) {
  const { salicAccountId, pronac, projectName } = params;
  const cache = params.cache ?? new ProdutosCache();

  const project = await prisma.project.upsert({
    where: {
      salicAccountId_pronac: { salicAccountId, pronac },
    },
    create: {
      salicAccountId,
      pronac,
      name: projectName || null,
      valorCaptado: params.valorCaptado ?? null,
      valorAprovado: params.valorAprovado ?? null,
      lastSyncedAt: new Date(),
    },
    update: {
      name: projectName || undefined,
      ...(params.valorCaptado != null ? { valorCaptado: params.valorCaptado } : {}),
      ...(params.valorAprovado != null ? { valorAprovado: params.valorAprovado } : {}),
      lastSyncedAt: new Date(),
    },
  });

  if (params.valorCaptado == null) {
    await refreshProjectFinancials({ projectId: project.id, pronac });
  }

  if (!project.complianceRulesetId) {
    const { scheduleProjectRulesetChoice } = await import("@/lib/compliance/choose-ruleset");
    scheduleProjectRulesetChoice(project.id);
  }

  await params.onProgress?.(`PRONAC ${pronac}: buscando fornecedores…`);
  const fornecedores = await listFornecedoresByPronac(pronac);
  await params.onProgress?.(
    `PRONAC ${pronac}: ${fornecedores.length} fornecedores (concorrência ${getSyncConcurrency()})`,
    { total: fornecedores.length, current: 0 },
  );

  const result = await persistProdutosForPronac({
    projectId: project.id,
    pronac,
    fornecedores,
    cache,
    onProgress: params.onProgress,
  });

  return { project, ...result };
}

export async function resolvePronacsForAccount(params: {
  salicAccountId: string;
  pronacs?: string[];
  onProgress?: ProgressFn;
}) {
  const account = await prisma.salicAccount.findUniqueOrThrow({
    where: { id: params.salicAccountId },
  });

  const toSync = new Map<
    string,
    { name: string | null; valorCaptado: number | null; valorAprovado: number | null }
  >();

  if (params.pronacs && params.pronacs.length > 0) {
    for (const pronac of params.pronacs) {
      toSync.set(pronac, { name: null, valorCaptado: null, valorAprovado: null });
    }
    await params.onProgress?.(`PRONACs explícitos: ${params.pronacs.join(", ")}`);
  } else {
    await params.onProgress?.(`Buscando projetos na API para ${formatCgccpf(account.cgccpf)}`);
    const projetos = await listProjetosByCgccpf(account.cgccpf);
    await params.onProgress?.(`API listou ${projetos.length} projetos`);
    for (const projeto of projetos) {
      if (!projeto.PRONAC) continue;
      const fin = financialsFromProjeto(projeto);
      toSync.set(String(projeto.PRONAC), {
        name: projeto.nome || null,
        valorCaptado: fin.valorCaptado,
        valorAprovado: fin.valorAprovado,
      });
    }

    // Não reinsere projetos só porque estão no banco — o espelho do SALIC manda.
    // extrasPronacs ainda entram (cadastro manual de PRONACs fora da listagem).

    const extras = (account.extraPronacs || "")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const pronac of extras) {
      if (!toSync.has(pronac)) {
        toSync.set(pronac, { name: null, valorCaptado: null, valorAprovado: null });
        await params.onProgress?.(`PRONAC extra: ${pronac}`);
      }
    }
  }

  return {
    account,
    items: Array.from(toSync.entries()).map(([pronac, meta]) => ({
      accountId: account.id,
      accountName: account.name,
      pronac,
      name: meta.name,
      valorCaptado: meta.valorCaptado,
      valorAprovado: meta.valorAprovado,
    })),
  };
}

/**
 * Sync por PRONAC (sem prefetch global).
 * Cache por CNPJ entre projetos — mesmos dados, sem pré-carregar milhares de IDs.
 */
export async function syncAccountViaApi(params: {
  salicAccountId: string;
  pronacs?: string[];
  onProgress?: ProgressFn;
}) {
  const { account, items } = await resolvePronacsForAccount(params);
  const cache = new ProdutosCache();
  const concurrency = getSyncConcurrency();

  await params.onProgress?.(
    `Total: ${items.length} projeto(s) · concorrência ${concurrency} · sync por PRONAC`,
    { current: 0, total: items.length },
  );

  let projectsSynced = 0;
  let paymentsUpserted = 0;
  let paymentsDeleted = 0;
  let projectsDeleted = 0;
  const errors: string[] = [];
  const seenPronacs = new Set<string>();
  const fullAccountSync = !params.pronacs || params.pronacs.length === 0;

  for (const item of items) {
    try {
      await params.onProgress?.(
        `Sincronizando PRONAC ${item.pronac} — ${item.name || ""}`,
        { current: projectsSynced, total: items.length },
      );

      const project = await prisma.project.upsert({
        where: {
          salicAccountId_pronac: { salicAccountId: account.id, pronac: item.pronac },
        },
        create: {
          salicAccountId: account.id,
          pronac: item.pronac,
          name: item.name,
          valorCaptado: item.valorCaptado,
          valorAprovado: item.valorAprovado,
          lastSyncedAt: new Date(),
        },
        update: {
          name: item.name || undefined,
          ...(item.valorCaptado != null ? { valorCaptado: item.valorCaptado } : {}),
          ...(item.valorAprovado != null ? { valorAprovado: item.valorAprovado } : {}),
          lastSyncedAt: new Date(),
        },
      });

      if (item.valorCaptado == null) {
        await refreshProjectFinancials({ projectId: project.id, pronac: item.pronac });
      }

      if (!project.complianceRulesetId) {
        const { scheduleProjectRulesetChoice } = await import("@/lib/compliance/choose-ruleset");
        scheduleProjectRulesetChoice(project.id);
      }

      await params.onProgress?.(`PRONAC ${item.pronac}: listando fornecedores…`);
      const fornecedores = await listFornecedoresByPronac(item.pronac);

      const result = await persistProdutosForPronac({
        projectId: project.id,
        pronac: item.pronac,
        fornecedores,
        cache,
        onProgress: params.onProgress,
      });

      projectsSynced += 1;
      paymentsUpserted += result.paymentsUpserted;
      paymentsDeleted += result.paymentsDeleted;
      seenPronacs.add(item.pronac);
      await params.onProgress?.(
        `PRONAC ${item.pronac}: ${result.paymentsUpserted} pagamentos` +
          (result.paymentsDeleted ? `, ${result.paymentsDeleted} removidos` : "") +
          `, ${result.fornecedoresCount} fornecedores · cache hits=${cache.stats.hits}`,
        { current: projectsSynced, total: items.length },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "SyncCancelledError") throw error;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`PRONAC ${item.pronac}: ${message}`);
      await params.onProgress?.(
        `PRONAC ${item.pronac}: falhou — ${message}`,
        { current: projectsSynced, total: items.length },
      );
    }
  }

  if (projectsSynced === 0 && errors.length > 0) {
    throw new Error(errors.join(" | "));
  }

  if (fullAccountSync && errors.length === 0 && seenPronacs.size > 0) {
    projectsDeleted = await reconcileAccountProjects(account.id, seenPronacs);
    if (projectsDeleted > 0) {
      await params.onProgress?.(
        `Removidos ${projectsDeleted} projeto(s) que não constam mais no SALIC`,
      );
    }
  }

  return {
    projectsSynced,
    paymentsUpserted,
    paymentsDeleted,
    projectsDeleted,
    log: [
      `conta=${account.name}`,
      `projetos=${projectsSynced}`,
      `pagamentos=${paymentsUpserted}`,
      `pagamentosRemovidos=${paymentsDeleted}`,
      `projetosRemovidos=${projectsDeleted}`,
      `cacheHits=${cache.stats.hits}`,
      `cacheMisses=${cache.stats.misses}`,
      `cacheCnpjs=${cache.stats.cnpjKeys}`,
      ...(errors.length ? [`erros=${errors.length}`, ...errors] : []),
    ],
  };
}

export { upsertPaymentFromProduto, upsertSupplier, parseSalicDate };
