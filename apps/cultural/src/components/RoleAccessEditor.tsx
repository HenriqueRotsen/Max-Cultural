"use client";

import { useMemo, useState } from "react";
import {
  productSections,
  type AccessCatalogEntry,
  type AccessPermissionId,
} from "@max/auth";
import { saveRolePermissionsAction } from "@/lib/actions/iam";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

type Props = {
  roleId: string;
  roleName: string;
  canEdit: boolean;
  initialGranted: string[];
};

export function RoleAccessEditor({
  roleId,
  roleName,
  canEdit,
  initialGranted,
}: Props) {
  const [granted, setGranted] = useState(() => new Set(initialGranted));
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    cultural: true,
    origem: true,
    fluxo: true,
  });
  const sections = useMemo(() => productSections(), []);

  function isOn(id: string) {
    return granted.has(id);
  }

  function toggle(id: string, on: boolean, dependents: string[] = []) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else {
        next.delete(id);
        for (const d of dependents) next.delete(d);
      }
      return next;
    });
  }

  return (
    <form action={saveRolePermissionsAction} className="space-y-4">
      <input type="hidden" name="roleId" value={roleId} />
      {[...granted].map((id) => (
        <input key={id} type="hidden" name={`grant:${id}`} value="on" />
      ))}

      {sections.map((section) => {
        const productOn = section.productId ? isOn(section.productId) : true;
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
              <div className="space-y-4 px-5 py-5">
                {section.productId ? (
                  <ProductToggle
                    id={section.productId}
                    checked={isOn(section.productId)}
                    disabled={!canEdit}
                    dependents={section.entries.map((e) => e.id)}
                    onToggle={toggle}
                  />
                ) : null}

                <div
                  className={
                    section.productId && !productOn
                      ? "pointer-events-none space-y-3 opacity-45"
                      : "space-y-3"
                  }
                >
                  {section.entries
                    .filter((e) => e.kind === "screen")
                    .map((screen) => (
                      <ScreenBlock
                        key={screen.id}
                        screen={screen}
                        capabilities={section.entries.filter(
                          (e) =>
                            e.kind === "capability" && e.parentId === screen.id,
                        )}
                        screenOn={isOn(screen.id)}
                        isOn={isOn}
                        canEdit={canEdit}
                        productOn={productOn}
                        onToggle={toggle}
                      />
                    ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      {canEdit ? (
        <div className="flex items-center gap-3 pt-2">
          <ConfirmSubmitButton
            className="btn"
            message={`Salvar acessos de ${roleName}?`}
            confirmLabel="Salvar"
          >
            Salvar acessos
          </ConfirmSubmitButton>
        </div>
      ) : null}
    </form>
  );
}

function ProductToggle({
  id,
  checked,
  disabled,
  dependents,
  onToggle,
}: {
  id: AccessPermissionId | string;
  checked: boolean;
  disabled: boolean;
  dependents: string[];
  onToggle: (id: string, on: boolean, dependents?: string[]) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)]/70 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(id, e.target.checked, dependents)}
        className="mt-1"
      />
      <span>
        <span className="block text-sm font-medium text-[var(--navy)]">
          Entrar no produto
        </span>
        <span className="mt-0.5 block text-xs text-[var(--gray-500)]">
          Sem isto, o usuário não acessa o app mesmo com telas marcadas.
        </span>
      </span>
    </label>
  );
}

function ScreenBlock({
  screen,
  capabilities,
  screenOn,
  isOn,
  canEdit,
  productOn,
  onToggle,
}: {
  screen: AccessCatalogEntry;
  capabilities: AccessCatalogEntry[];
  screenOn: boolean;
  isOn: (id: string) => boolean;
  canEdit: boolean;
  productOn: boolean;
  onToggle: (id: string, on: boolean, dependents?: string[]) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] px-4 py-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={screenOn}
          disabled={!canEdit || !productOn}
          onChange={(e) =>
            onToggle(
              screen.id,
              e.target.checked,
              capabilities.map((c) => c.id),
            )
          }
          className="mt-1"
        />
        <span>
          <span className="block text-sm font-medium text-[var(--navy)]">
            {screen.label}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--gray-500)]">
            {screen.description || "Acesso à tela"}
          </span>
        </span>
      </label>

      {capabilities.length > 0 ? (
        <div className="mt-3 ml-7 space-y-2 border-l border-[var(--border)] pl-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
            Funcionalidades
          </p>
          {capabilities.map((cap) => (
            <label key={cap.id} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isOn(cap.id)}
                disabled={!canEdit || !screenOn || !productOn}
                onChange={(e) => onToggle(cap.id, e.target.checked)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm text-[var(--navy)]">{cap.label}</span>
                {cap.description ? (
                  <span className="mt-0.5 block text-xs text-[var(--gray-500)]">
                    {cap.description}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
