"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { cancelPedido } from "@/lib/planning/pedido";
import type { ActionState } from "@/lib/planning/action-state";

const initial: ActionState = {};

export function CancelPedidoButton({ pedidoId }: { pedidoId: string }) {
  const router = useRouter();
  const action = cancelPedido.bind(null, pedidoId);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    initial,
  );

  return (
    <form action={formAction} className="inline">
      <button
        type="submit"
        className="btn btn-ghost text-sm text-red-700"
        disabled={pending}
        onClick={(e) => {
          if (!confirm("Cancelar este pedido e liberar as reservas?")) {
            e.preventDefault();
          }
        }}
      >
        {pending ? "Cancelando…" : "Cancelar pedido"}
      </button>
      {state.error ? (
        <p className="mt-1 text-xs text-red-700">{state.error}</p>
      ) : null}
    </form>
  );
}
