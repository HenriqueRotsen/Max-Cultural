/**
 * Mensagem para falhas de transporte de Server Actions. Quando a página ficou
 * aberta de uma versão anterior do app (deploy novo) ou a sessão expirou, o
 * servidor devolve HTML em vez da resposta da ação — o erro cru é
 * "Unexpected token '<' … is not valid JSON", que não diz nada a quem usa.
 */
export const STALE_PAGE_MESSAGE =
  "A página ficou desatualizada ou sua sessão expirou. Recarregue a página (F5) e tente de novo.";

export function actionErrorMessage(error: unknown, fallback: string): string {
  const msg = error instanceof Error ? error.message : "";
  if (
    /unexpected token|not valid json|failed to fetch|server action|networkerror|load failed|failed to find/i.test(
      msg,
    )
  ) {
    return STALE_PAGE_MESSAGE;
  }
  return msg || fallback;
}
