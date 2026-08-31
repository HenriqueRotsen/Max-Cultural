import { revalidatePath } from "next/cache";
import { provisionFluxoProjeto } from "@/lib/fluxo/provision-projeto";

export function revalidatePlanning(id?: string) {
  revalidatePath("/planejamento");
  revalidatePath("/planejamento/buscar");
  revalidatePath("/fornecedores");
  revalidatePath("/fornecedores/contratacoes");
  if (id) {
    revalidatePath(`/planejamento/${id}`);
    revalidatePath(`/planejamento/${id}/nf/nova`);
    revalidatePath(`/planejamento/${id}/reservas`);
    revalidatePath(`/planejamento/${id}/importar-produtor`);
  }
}

/** Espelha no Fluxo (não bloqueia o Origem). Retorna erro para exibir na UI. */
export async function syncFluxoProjeto(params: {
  pronac: string;
  nome: string;
  proponente?: string;
  fluxoContextMode?: string;
  fluxoContextoId?: string;
  fluxoContextoNome?: string;
  autoMatchContexto?: boolean;
  /** Importação em lote: cria contexto se não houver match; falhas só logam. */
  bulk?: boolean;
}): Promise<string | null> {
  const mode = params.fluxoContextMode || "auto";
  const result = await provisionFluxoProjeto({
    pronac: params.pronac,
    nome: params.nome,
    proponente: params.proponente,
    contextoId: mode === "link" ? params.fluxoContextoId : undefined,
    contextoNome: mode === "create" ? params.fluxoContextoNome : undefined,
    createContexto: mode === "create" || Boolean(params.bulk),
    autoMatchContexto: mode === "auto" || Boolean(params.bulk),
  });
  if (!result.ok) {
    if (params.bulk) {
      console.warn("[planning→fluxo]", result.error);
      return null;
    }
    return result.error;
  }
  return null;
}

export function readFluxoContextFromForm(formData: FormData) {
  return {
    fluxoContextMode: String(formData.get("fluxoContextMode") || "auto"),
    fluxoContextoId: String(formData.get("fluxoContextoId") || "").trim(),
    fluxoContextoNome: String(formData.get("fluxoContextoNome") || "").trim(),
  };
}
