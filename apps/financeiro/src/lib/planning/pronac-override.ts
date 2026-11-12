import { canOverridePronac } from "@/lib/planning/acl";

export const PRONAC_OVERRIDE_FIELD = "pronacOverrideReason";

/**
 * Trava do PRONAC: documento (NF/RPA ou comprovante) que menciona outro projeto
 * não entra. Quem tem a permissão "Liberar documento de outro PRONAC" pode
 * seguir escrevendo o motivo; quem chama grava o motivo no log.
 */
export async function enforcePronacMatch(params: {
  mismatch: string | null | undefined;
  formData: FormData;
}): Promise<
  | { ok: true; overrideReason: string | null }
  | { ok: false; error: string; pronacOverride: boolean }
> {
  if (!params.mismatch) return { ok: true, overrideReason: null };
  const allowed = await canOverridePronac();
  if (!allowed) {
    return {
      ok: false,
      pronacOverride: false,
      error: `${params.mismatch} Só quem tem a permissão "Liberar documento de outro PRONAC" pode seguir com este arquivo.`,
    };
  }
  const reason = String(params.formData.get(PRONAC_OVERRIDE_FIELD) || "").trim();
  if (reason.length < 5) {
    return {
      ok: false,
      pronacOverride: true,
      error: `${params.mismatch} Para seguir mesmo assim, escreva o motivo da liberação (fica registrado).`,
    };
  }
  return { ok: true, overrideReason: reason };
}

/**
 * Aviso de outro PRONAC guardado na NF/RPA em revisão. NFs enviadas antes da
 * trava só têm o texto na lista de avisos.
 */
export function pronacMismatchOf(extractedJson: unknown): string | null {
  const j = (extractedJson ?? {}) as { pronacMismatch?: unknown; warnings?: unknown };
  if (typeof j.pronacMismatch === "string" && j.pronacMismatch) return j.pronacMismatch;
  if (Array.isArray(j.warnings)) {
    const w = j.warnings.find(
      (x): x is string => typeof x === "string" && x.includes("mas você está no projeto"),
    );
    if (w) return w;
  }
  return null;
}
