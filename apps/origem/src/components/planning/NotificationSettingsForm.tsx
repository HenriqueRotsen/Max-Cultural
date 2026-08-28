"use client";

import { useActionState } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  saveNotificationSettings,
  type ActionState,
} from "@/lib/planning/actions";
import type { NotificationPrefs } from "@/lib/planning/notification-settings";

const initial: ActionState = {};

export function NotificationSettingsForm({
  prefs,
  userEmail,
}: {
  prefs: NotificationPrefs;
  userEmail?: string | null;
}) {
  const [state, action, pending] = useActionState(
    saveNotificationSettings,
    initial,
  );

  return (
    <form action={action} className="card space-y-5 p-5">
      <div>
        <h2 className="font-semibold text-[var(--navy)]">Configurações</h2>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          Escolha quais avisos deseja receber neste workspace.
        </p>
      </div>

      <div className="space-y-4">
        <ToggleSwitch
          name="paymentDueSoon"
          defaultChecked={prefs.paymentDueSoon}
          label="Pagamento previsto"
          description="Aviso na data que você escolher ao confirmar a NF/RPA."
        />

        <label className="field max-w-[12rem]">
          <span>Dias de antecedência</span>
          <input
            type="number"
            name="dueSoonDaysAhead"
            min={1}
            max={30}
            defaultValue={prefs.dueSoonDaysAhead}
            className="w-full"
          />
        </label>

        <ToggleSwitch
          name="paymentOverdue"
          defaultChecked={prefs.paymentOverdue}
          label="Pagamento em atraso"
          description="Aviso quando o prazo do pagamento já venceu."
        />

        <ToggleSwitch
          name="rubricNear"
          defaultChecked={prefs.rubricNear}
          label="Rubrica quase esgotada"
          description="Aviso quando o saldo disponível da rubrica estiver baixo."
        />

        <ToggleSwitch
          name="nfPending"
          defaultChecked={prefs.nfPending}
          label="NF pendente após pagamento"
          description="Lembrete na data escolhida ao registrar pagamento sem NF."
        />

        <label className="field max-w-[12rem]">
          <span>Sugestão padrão (dias após pagamento)</span>
          <input
            type="number"
            name="nfPendingDaysAfterPaid"
            min={1}
            max={90}
            defaultValue={prefs.nfPendingDaysAfterPaid}
            className="w-full"
          />
        </label>

        <ToggleSwitch
          name="taxDueIss"
          defaultChecked={prefs.taxDueIss}
          label="ISS retido (dia 10)"
          description="Aviso no dia 10 do mês seguinte à NF (vencimento típico municipal)."
        />

        <ToggleSwitch
          name="taxDueFederal"
          defaultChecked={prefs.taxDueFederal}
          label="Impostos federais (dia 20)"
          description="IRRF, PIS, COFINS, CSLL e INSS retidos — vencimento típico no dia 20."
        />
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <ToggleSwitch
          name="emailEnabled"
          defaultChecked={prefs.emailEnabled}
          label="Enviar por e-mail"
          description={
            userEmail
              ? `Também envia para ${userEmail} quando um aviso novo for gerado.`
              : "Também envia para o e-mail da sua conta quando um aviso novo for gerado."
          }
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-[var(--gold)]">Preferências salvas.</p>
      ) : null}

      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Salvando…" : "Salvar configurações"}
      </button>
    </form>
  );
}
