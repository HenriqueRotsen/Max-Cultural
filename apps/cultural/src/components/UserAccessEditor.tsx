"use client";

import { useMemo, useState } from "react";
import {
  productSections,
  type AccessCatalogEntry,
  type AccessPermissionId,
} from "@max/auth";
import { saveUserPermissionsAction } from "@/lib/actions/iam";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

export type PermissionOverrideEffect = "GRANT" | "DENY";

type Props = {
  userId: string;
  userName: string;
  roleName: string;
  canEdit: boolean;
  /** IDs concedidos pelo papel (padrão). */
  roleGranted: string[];
  /** Overrides atuais: screen → GRANT|DENY. */
  initialOverrides: Array<{ screen: string; effect: PermissionOverrideEffect }>;
};

type EffectChoice = "" | "GRANT" | "DENY";

export function UserAccessEditor({
  userId,
  userName,
  roleName,
  canEdit,
  roleGranted,
  initialOverrides,
}: Props) {
  const roleSet = useMemo(() => new Set(roleGranted), [roleGranted]);
  const [overrides, setOverrides] = useState(() => {
    const m = new Map<string, PermissionOverrideEffect>();
    for (const o of initialOverrides) m.set(o.screen, o.effect);
    return m;
  });
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    cultural: true,
    origem: true,
    fluxo: true,
  });
  const sections = useMemo(() => productSections(), []);

  function choiceFor(id: string): EffectChoice {
    return overrides.get(id) ?? "";
  }

  function effectiveOn(id: string) {
    const o = overrides.get(id);
    if (o === "GRANT") return true;
    if (o === "DENY") return false;
    return roleSet.has(id);
  }

  function setChoice(id: string, value: EffectChoice, dependents: string[] = []) {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (!value) next.delete(id);
      else next.set(id, value);
      if (value === "DENY" || value === "") {
        // Ao negar ou voltar a herdar, limpa overrides órfãos de filhos se ficarem inconsistentes.
        for (const d of dependents) {
          if (value === "DENY") next.set(d, "DENY");
        }
      }
      return next;
    });
  }

  const overrideCount = overrides.size;

  return (
    <form action={saveUserPermissionsAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      {[...overrides.entries()].map(([screen, effect]) => (
        <input
          key={`${screen}:${effect}`}
          type="hidden"
          name={`override:${screen}`}
          value={effect}
        />
      ))}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--navy-soft)]/40 px-4 py-3 text-sm text-[var(--gray-600)]">
        O papel <strong className="text-[var(--navy)]">{roleName}</strong> define o
        padrão. Em cada item você pode <strong>Herdar</strong> o papel,{" "}
        <strong>Conceder</strong> ou <strong>Negar</strong> só para esta pessoa.
        {overrideCount > 0
          ? ` · ${overrideCount} ajuste${overrideCount === 1 ? "" : "s"} ativo${overrideCount === 1 ? "" : "s"}`
          : " · sem ajustes — só o papel"}
      </div>

      {sections.map((section) => {
        const productId = section.productId;
        const productOn = productId ? effectiveOn(productId) : true;
        const open = openMap[section.product] ?? true;
        return (
          <section
            key={section.product}
            className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)]"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 bg-[var(--navy-soft)]/45 px-5 py-4 text-left"
              onClick={() =>
                setOpenMap((m) => ({ ...m, [section.product]: !open }))
              }
              aria-expanded={open}
            >
              <div>
                <h2 className="text-base font-semibold text-[var(--navy)]">
                  {section.label}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--gray-500)]">
                  {section.productId
                    ? "Entrada no produto, telas e funcionalidades"
                    : "Telas e ações do hub"}
                </p>
              </div>
              <span className="text-lg leading-none text-[var(--gray-500)]">
                {open ? "−" : "+"}
              </span>
            </button>

            {open ? (
              <div className="space-y-3 px-5 py-5">
                {productId ? (
                  <OverrideRow
                    id={productId}
                    label="Entrar no produto"
                    description="Sem isto, a pessoa não acessa o app mesmo com telas marcadas."
                    roleDefault={roleSet.has(productId)}
                    choice={choiceFor(productId)}
                    effective={effectiveOn(productId)}
                    disabled={!canEdit}
                    onChange={(v) =>
                      setChoice(
                        productId,
                        v,
                        section.entries.map((e) => e.id),
                      )
                    }
                  />
                ) : null}

                <div
                  className={
                    productId && !productOn
                      ? "pointer-events-none space-y-3 opacity-45"
                      : "space-y-3"
                  }
                >
                  {section.entries
                    .filter((e) => e.kind === "screen")
                    .map((screen) => (
                      <ScreenOverrideBlock
                        key={screen.id}
                        screen={screen}
                        capabilities={section.entries.filter(
                          (e) =>
                            e.kind === "capability" && e.parentId === screen.id,
                        )}
                        roleSet={roleSet}
                        choiceFor={choiceFor}
                        effectiveOn={effectiveOn}
                        canEdit={canEdit && productOn}
                        onChange={setChoice}
                      />
                    ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <ConfirmSubmitButton
            className="btn"
            message={`Salvar acessos de ${userName}? A sessão atual desta pessoa será encerrada.`}
            confirmLabel="Salvar"
          >
            Salvar acessos
          </ConfirmSubmitButton>
          {overrideCount > 0 ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOverrides(new Map())}
            >
              Limpar ajustes (voltar ao papel)
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function ScreenOverrideBlock({
  screen,
  capabilities,
  roleSet,
  choiceFor,
  effectiveOn,
  canEdit,
  onChange,
}: {
  screen: AccessCatalogEntry;
  capabilities: AccessCatalogEntry[];
  roleSet: Set<string>;
  choiceFor: (id: string) => EffectChoice;
  effectiveOn: (id: string) => boolean;
  canEdit: boolean;
  onChange: (id: string, value: EffectChoice, dependents?: string[]) => void;
}) {
  const screenOn = effectiveOn(screen.id);
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border)] px-4 py-3">
      <OverrideRow
        id={screen.id}
        label={screen.label}
        description={screen.description || "Acesso à tela"}
        roleDefault={roleSet.has(screen.id)}
        choice={choiceFor(screen.id)}
        effective={screenOn}
        disabled={!canEdit}
        onChange={(v) =>
          onChange(
            screen.id,
            v,
            capabilities.map((c) => c.id),
          )
        }
      />
      {capabilities.length > 0 ? (
        <div className="ml-1 space-y-2 border-l border-[var(--border)] pl-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
            Funcionalidades
          </p>
          {capabilities.map((cap) => (
            <OverrideRow
              key={cap.id}
              id={cap.id as AccessPermissionId}
              label={cap.label}
              description={cap.description || ""}
              roleDefault={roleSet.has(cap.id)}
              choice={choiceFor(cap.id)}
              effective={effectiveOn(cap.id)}
              disabled={!canEdit || !screenOn}
              onChange={(v) => onChange(cap.id, v)}
              compact
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OverrideRow({
  id,
  label,
  description,
  roleDefault,
  choice,
  effective,
  disabled,
  onChange,
  compact,
}: {
  id: string;
  label: string;
  description: string;
  roleDefault: boolean;
  choice: EffectChoice;
  effective: boolean;
  disabled: boolean;
  onChange: (value: EffectChoice) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 ${
        compact ? "" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className={`font-medium text-[var(--navy)] ${compact ? "text-sm" : "text-sm"}`}>
          {label}
        </p>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--gray-500)]">{description}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-[var(--gray-400)]">
          Papel: {roleDefault ? "concede" : "não concede"}
          {" · "}
          Efetivo:{" "}
          <span
            className={
              effective ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"
            }
          >
            {effective ? "sim" : "não"}
          </span>
          {choice ? (
            <span className="ml-1 text-[var(--navy)]">
              ({choice === "GRANT" ? "concedido" : "negado"} aqui)
            </span>
          ) : null}
        </p>
      </div>
      <select
        className="shrink-0 rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
        value={choice}
        disabled={disabled}
        aria-label={`Acesso a ${label}`}
        onChange={(e) => onChange(e.target.value as EffectChoice)}
      >
        <option value="">Herdar papel</option>
        <option value="GRANT">Conceder</option>
        <option value="DENY">Negar</option>
      </select>
      {/* id unused visually but keeps React key context clear */}
      <span className="sr-only">{id}</span>
    </div>
  );
}
