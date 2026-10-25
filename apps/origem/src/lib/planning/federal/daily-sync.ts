import { syncCaptacaoForWorkspace } from "@/lib/planning/federal/captacao-salic";
import { refreshPlanningSheetsForWorkspace } from "@/lib/planning/federal/sync-sheet";

/**
 * Rotina diária do Planejamento, pela sessão SALIC do próprio proponente (não lê a
 * Auditoria): planilha preferida (readequada → homologada) + situação do projeto
 * → captação. Projetos novos entram pelo /planejamento/novo.
 */
export async function syncPlanningForWorkspace(
  workspaceId: string,
  accountId?: string,
  log: (message: string) => Promise<void> = async () => {},
) {
  // Reimporta planilha preferida (readequada → homologada), situação e comprovado.
  const sheets = await refreshPlanningSheetsForWorkspace(workspaceId, accountId);
  await log(
    `Planejamento: ${sheets.refreshed} planilha(s) atualizada(s)` +
      (sheets.created ? ` · ${sheets.created} criada(s)` : "") +
      (sheets.skipped ? ` · ${sheets.skipped} ignorada(s)` : "") +
      (sheets.errors.length ? ` · ${sheets.errors.slice(0, 3).join(" · ")}` : ""),
  );

  const captacao = await syncCaptacaoForWorkspace(workspaceId, accountId);
  await log(
    `Planejamento: captação atualizada em ${captacao.synced} projeto(s)` +
      (captacao.errors.length ? ` · ${captacao.errors.slice(0, 3).join(" · ")}` : ""),
  );

  return { sheets, captacao };
}
