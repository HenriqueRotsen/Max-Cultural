"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  saveNotificationSettings,
  type ActionState,
} from "@/lib/planning/actions";
import type { NotificationPrefs } from "@/lib/planning/notification-settings";

const initial: ActionState = {};

type ToggleKey =
  | "paymentDueSoon"
  | "paymentOverdue"
  | "nfPending"
  | "taxDueIss"
  | "taxDueFederal"
  | "rubricNear"
  | "readequadaApplied"
  | "salicDiligencia"
  | "evaluationPending";

type Item = { key: ToggleKey; label: string; description: string };

const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Pagamentos",
    items: [
      {
        key: "paymentDueSoon",
        label: "Pagamento previsto",
        description: "Lembra antes da data de pagamento informada na NF/RPA.",
      },
      {
        key: "paymentOverdue",
        label: "Pagamento em atraso",
        description: "Quando a data de pagamento já passou.",
      },
      {
        key: "nfPending",
        label: "NF pendente",
        description: "Pagamento registrado sem nota fiscal.",
      },
    ],
  },
  {
    title: "Impostos retidos",
    items: [
      {
        key: "taxDueIss",
        label: "ISS (dia 10)",
        description: "Vencimento municipal típico, no mês seguinte à NF.",
      },
      {
        key: "taxDueFederal",
        label: "Federais (dia 20)",
        description: "IRRF, PIS, COFINS, CSLL e INSS.",
      },
    ],
  },
  {
    title: "Orçamento e planilha",
    items: [
      {
        key: "rubricNear",
        label: "Rubrica quase esgotada",
        description: "Saldo disponível da rubrica baixo.",
      },
      {
        key: "readequadaApplied",
        label: "Planilha readequada aplicada",
        description: "O SALIC publicou a readequada e o projeto passou a usá-la.",
      },
    ],
  },
  {
    title: "SALIC e fornecedores",
    items: [
      {
        key: "salicDiligencia",
        label: "Diligência no SALIC",
        description: "Um PRONAC do workspace entrou em diligência.",
      },
      {
        key: "evaluationPending",
        label: "Avaliar fornecedor",
        description: "Depois do pagamento, para dar nota e registrar atraso.",
      },
    ],
  },
];

const TOTAL = GROUPS.reduce((n, g) => n + g.items.length, 0);

/** Campo de dias que aparece na própria linha do aviso (fica no form mesmo oculto). */
function DaysField({
  name,
  defaultValue,
  min,
  max,
  before,
  after,
  visible,
}: {
  name: string;
  defaultValue: number;
  min: number;
  max: number;
  before: string;
  after: string;
  visible: boolean;
}) {
  return (
    <div
      className={`mt-2 items-center gap-2 text-sm text-[var(--gray-600)] ${visible ? "flex" : "hidden"}`}
    >
      <span>{before}</span>
      <input
        type="number"
        name={name}
        min={min}
        max={max}
        defaultValue={defaultValue}
        inputMode="numeric"
        className="w-16 text-center"
        aria-label={`${before} ${after}`}
      />
      <span>{after}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
        {title}
      </h3>
      <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-white">
        {children}
      </div>
    </section>
  );
}

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
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [on, setOn] = useState<Record<ToggleKey, boolean>>(() =>
    Object.fromEntries(
      GROUPS.flatMap((g) => g.items).map((i) => [i.key, Boolean(prefs[i.key])]),
    ) as Record<ToggleKey, boolean>,
  );
  const [dirty, setDirty] = useState(false);
  const activeCount = Object.values(on).filter(Boolean).length;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Salva sozinho: cada mudança agenda um envio (números esperam a digitação parar).
  function scheduleSave(delay = 400) {
    setDirty(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setDirty(false);
      formRef.current?.requestSubmit();
    }, delay);
  }

  function setAll(value: boolean) {
    setOn((prev) =>
      Object.fromEntries(Object.keys(prev).map((k) => [k, value])) as Record<ToggleKey, boolean>,
    );
    // Espera o React aplicar o novo estado nos switches antes de enviar.
    scheduleSave(50);
  }

  const status = pending || dirty
    ? "Salvando…"
    : state.error
      ? state.error
      : state.ok
        ? "Salvo"
        : "As alterações são salvas automaticamente.";

  return (
    <form
      ref={formRef}
      action={action}
      onChange={(e) => {
        const target: EventTarget = e.target;
        const isNumber = target instanceof HTMLInputElement && target.type === "number";
        scheduleSave(isNumber ? 900 : 400);
      }}
      className="card space-y-5 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-[var(--navy)]">Avisos</h2>
          <p className="mt-0.5 text-sm text-[var(--gray-500)]">
            {activeCount} de {TOTAL} ligados neste workspace
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="btn btn-ghost px-2.5 py-1 text-xs"
            onClick={() => setAll(true)}
            disabled={activeCount === TOTAL}
          >
            Ligar todos
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2.5 py-1 text-xs"
            onClick={() => setAll(false)}
            disabled={activeCount === 0}
          >
            Desligar todos
          </button>
        </div>
      </div>

      <Section title="Como avisar">
        <div className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
          <span className="min-w-0">
            <span className="font-medium text-[var(--navy)]">No sino do MAX</span>
            <span className="mt-0.5 block text-[var(--gray-500)]">
              Sempre ligado para os avisos escolhidos abaixo.
            </span>
          </span>
          <span className="mt-0.5 rounded-full bg-[var(--navy-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--navy)]">
            Sempre
          </span>
        </div>
        <ToggleSwitch
          name="emailEnabled"
          defaultChecked={prefs.emailEnabled}
          label="Por e-mail"
          description={
            userEmail
              ? `Também envia para ${userEmail}.`
              : "Também envia para o e-mail da sua conta."
          }
          className="px-4 py-3"
        />
      </Section>

      {GROUPS.map((group) => (
        <Section key={group.title} title={group.title}>
          {group.items.map((item) => (
            <div key={item.key} className="px-4 py-3">
              <ToggleSwitch
                name={item.key}
                checked={on[item.key]}
                onCheckedChange={(v) => setOn((prev) => ({ ...prev, [item.key]: v }))}
                label={item.label}
                description={item.description}
              />
              {item.key === "paymentDueSoon" ? (
                <DaysField
                  name="dueSoonDaysAhead"
                  defaultValue={prefs.dueSoonDaysAhead}
                  min={1}
                  max={30}
                  before="Avisar"
                  after="dias antes"
                  visible={on.paymentDueSoon}
                />
              ) : null}
              {item.key === "nfPending" ? (
                <DaysField
                  name="nfPendingDaysAfterPaid"
                  defaultValue={prefs.nfPendingDaysAfterPaid}
                  min={1}
                  max={90}
                  before="Sugerir lembrete"
                  after="dias após o pagamento"
                  visible={on.nfPending}
                />
              ) : null}
            </div>
          ))}
        </Section>
      ))}

      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${
          state.error && !pending && !dirty
            ? "text-red-600"
            : state.ok && !pending && !dirty
              ? "font-medium text-[var(--navy)]"
              : "text-[var(--gray-500)]"
        }`}
      >
        {status === "Salvo" ? "✓ Salvo" : status}
      </p>
    </form>
  );
}
