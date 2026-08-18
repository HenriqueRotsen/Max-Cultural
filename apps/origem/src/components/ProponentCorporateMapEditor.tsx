"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteCorporatePeriod,
  deleteCorporatePeriodMember,
  importAccountCorporateMap,
  lookupAccountByCgccpf,
  setAccountInstitutionalMap,
  upsertCorporatePeriod,
  upsertCorporatePeriodMember,
} from "@/lib/actions";
import { corporateMapCopy, corporateRoleLabel } from "@/lib/corporate/copy";
import { formatPrecisionDate } from "@/lib/corporate/dates";
import { formatCgccpf } from "@/lib/format";

type PeriodMember = {
  id: string;
  name: string;
  cgccpf: string;
  personType: string;
  role: string;
  source: string | null;
};

type Period = {
  id: string;
  label: string | null;
  source: string | null;
  validFrom: string;
  validFromPrecision: string;
  validTo: string | null;
  validToPrecision: string;
  members: PeriodMember[];
};

function PrecisionFields({
  prefix,
  defaultPrecision = "YEAR",
  defaultYear,
  defaultMonth = 1,
  defaultDay = 1,
  minYear = 1800,
  required = true,
}: {
  prefix: string;
  defaultPrecision?: string;
  defaultYear?: number;
  defaultMonth?: number;
  defaultDay?: number;
  minYear?: number;
  required?: boolean;
}) {
  const [precision, setPrecision] = useState(defaultPrecision);
  const yearNow = new Date().getFullYear();
  const yearValue = defaultYear ?? yearNow;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="field">
        <label htmlFor={`${prefix}-precision`}>Precisão</label>
        <select
          id={`${prefix}-precision`}
          name={`${prefix}Precision`}
          value={precision}
          onChange={(e) => setPrecision(e.target.value)}
        >
          <option value="YEAR">Ano</option>
          <option value="MONTH">Mês/ano</option>
          <option value="DAY">Dia/mês/ano</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${prefix}-year`}>Ano</label>
        <input
          id={`${prefix}-year`}
          name={`${prefix}Year`}
          type="number"
          min={minYear}
          max={yearNow}
          required={required}
          defaultValue={yearValue}
          className="w-24"
        />
      </div>
      {(precision === "MONTH" || precision === "DAY") && (
        <div className="field">
          <label htmlFor={`${prefix}-month`}>Mês</label>
          <input
            id={`${prefix}-month`}
            name={`${prefix}Month`}
            type="number"
            min={1}
            max={12}
            defaultValue={defaultMonth}
            className="w-20"
          />
        </div>
      )}
      {precision === "DAY" && (
        <div className="field">
          <label htmlFor={`${prefix}-day`}>Dia</label>
          <input
            id={`${prefix}-day`}
            name={`${prefix}Day`}
            type="number"
            min={1}
            max={31}
            defaultValue={defaultDay}
            className="w-20"
          />
        </div>
      )}
    </div>
  );
}

function partsFromIso(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function formatInterval(p: Period) {
  const from = formatPrecisionDate(
    p.validFrom,
    p.validFromPrecision as "DAY" | "MONTH" | "YEAR",
  );
  const to = p.validTo
    ? formatPrecisionDate(
        p.validTo,
        p.validToPrecision as "DAY" | "MONTH" | "YEAR",
      )
    : "vigente";
  return `${from} → ${to}`;
}

function personTypeFromDoc(raw: string): "PF" | "PJ" {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 14 ? "PJ" : "PF";
}

function MemberForm({
  accountId,
  periodId,
  member,
  pending,
  institutional,
  onSubmit,
  onCancel,
}: {
  accountId: string;
  periodId: string;
  member?: PeriodMember | null;
  pending: boolean;
  institutional: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel?: () => void;
}) {
  const copy = corporateMapCopy(institutional);
  const [name, setName] = useState(member?.name || "");
  const [cgccpf, setCgccpf] = useState(
    member?.cgccpf ? formatCgccpf(member.cgccpf) : "",
  );
  const [role, setRole] = useState(
    institutional ? "ADMINISTRATOR" : member?.role || "PARTNER",
  );
  const [lookingUp, setLookingUp] = useState(false);
  const formId = member?.id || `new-${periodId}`;

  async function lookupDoc(raw: string) {
    const digits = raw.replace(/\D/g, "");
    // Só consulta nome para CNPJ — nunca altera o documento digitado
    if (digits.length !== 14) return;
    setLookingUp(true);
    try {
      const result = await lookupAccountByCgccpf(digits);
      if (result.found) setName(result.name);
    } catch {
      // nome continua manual
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--gray-50)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const digits = cgccpf.replace(/\D/g, "");
        const fd = new FormData();
        fd.set("accountId", accountId);
        fd.set("periodId", periodId);
        if (member?.id) fd.set("memberId", member.id);
        fd.set("name", name);
        fd.set("cgccpf", digits);
        fd.set("personType", personTypeFromDoc(digits));
        fd.set("role", institutional ? "ADMINISTRATOR" : role);
        onSubmit(fd);
      }}
    >
      <h4 className="text-sm font-semibold text-[var(--navy)]">
        {member ? copy.editMember : copy.addMember}
      </h4>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="field">
          <label htmlFor={`doc-${formId}`}>CPF/CNPJ</label>
          <input
            id={`doc-${formId}`}
            value={cgccpf}
            onChange={(e) => setCgccpf(e.target.value)}
            onBlur={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              if (digits.length === 11 || digits.length === 14) {
                const formatted = formatCgccpf(digits);
                if (formatted !== "—") setCgccpf(formatted);
              }
              void lookupDoc(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`name-${formId}`}>Nome</label>
          <input
            id={`name-${formId}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        {institutional ? (
          <div className="field">
            <label htmlFor={`role-${formId}`}>Papel</label>
            <input
              id={`role-${formId}`}
              value="Administrador"
              readOnly
              className="bg-[var(--gray-50)]"
            />
          </div>
        ) : (
          <div className="field">
            <label htmlFor={`role-${formId}`}>Papel</label>
            <select
              id={`role-${formId}`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="PARTNER">Sócio</option>
              <option value="ADMINISTRATOR">Administrador</option>
              <option value="BOTH">Sócio e administrador</option>
            </select>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn" disabled={pending || lookingUp}>
          {member ? copy.saveMember : copy.addMemberBtn}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={onCancel}
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function PeriodForm({
  accountId,
  period,
  foundedYear,
  pending,
  onSubmit,
  onCancel,
}: {
  accountId: string;
  period?: Period | null;
  foundedYear?: number;
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel?: () => void;
}) {
  const fromParts = partsFromIso(period?.validFrom);
  const toParts = partsFromIso(period?.validTo);
  const [openEnded, setOpenEnded] = useState(!period?.validTo);
  const formKey = period?.id || "new";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("accountId", accountId);
        if (period?.id) fd.set("periodId", period.id);
        if (openEnded) fd.set("openEnded", "1");
        onSubmit(fd);
      }}
    >
      <div className="field">
        <label htmlFor={`period-label-${formKey}`}>Nota (opcional)</label>
        <input
          id={`period-label-${formKey}`}
          name="label"
          defaultValue={period?.label || ""}
          placeholder="Ex.: após alteração contratual"
        />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--gray-500)]">
          Início
        </p>
        <PrecisionFields
          key={`from-${formKey}-${period?.validFrom || "new"}`}
          prefix="validFrom"
          defaultPrecision={period?.validFromPrecision || "YEAR"}
          defaultYear={fromParts?.year ?? foundedYear}
          defaultMonth={fromParts?.month}
          defaultDay={fromParts?.day}
          minYear={foundedYear || 1800}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--navy)]">
        <input
          type="checkbox"
          checked={openEnded}
          onChange={(e) => setOpenEnded(e.target.checked)}
        />
        Sem data fim (ainda vigente)
      </label>
      {!openEnded ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--gray-500)]">
            Fim
          </p>
          <PrecisionFields
            key={`to-${formKey}-${period?.validTo || "new"}`}
            prefix="validTo"
            defaultPrecision={period?.validToPrecision || "YEAR"}
            defaultYear={toParts?.year ?? foundedYear}
            defaultMonth={toParts?.month}
            defaultDay={toParts?.day}
            minYear={foundedYear || 1800}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {period ? "Salvar intervalo" : "Criar intervalo"}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={onCancel}
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function ProponentCorporateMapEditor({
  accountId,
  accountCgccpf,
  foundedAt,
  foundedAtPrecision,
  periods,
  matchedSupplierDocs,
  institutionalMap = false,
}: {
  accountId: string;
  accountName: string;
  accountCgccpf: string;
  foundedAt: string | null;
  foundedAtPrecision: string;
  foundedAtSource?: string | null;
  periods: Period[];
  matchedSupplierDocs?: Set<string>;
  institutionalMap?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [addFormKey, setAddFormKey] = useState(0);
  const [newPeriodKey, setNewPeriodKey] = useState(0);
  const copy = corporateMapCopy(institutionalMap);
  const digits = accountCgccpf.replace(/\D/g, "");
  const isPj = digits.length === 14;
  const foundedParts = partsFromIso(foundedAt);
  const foundedYear = foundedParts?.year;

  function run(
    action: (
      fd: FormData,
    ) => Promise<{
      ok: boolean;
      error?: string;
      message?: string;
      imported?: number;
      skipped?: boolean;
    }>,
    fd: FormData,
  ) {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error || "Falha");
        return;
      }
      if ("message" in result && result.message) setStatus(result.message);
      else if ("imported" in result)
        setStatus(
          result.skipped
            ? result.message || "Já havia intervalos salvos."
            : copy.imported(result.imported || 0),
        );
      else setStatus("Salvo.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-[#8a4b12]">{error}</p> : null}
      {status ? <p className="text-sm text-[#176b3a]">{status}</p> : null}

      <section className="card p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={institutionalMap}
            disabled={pending}
            onChange={(e) => {
              const fd = new FormData();
              fd.set("accountId", accountId);
              fd.set("institutionalMap", e.target.checked ? "1" : "0");
              run(setAccountInstitutionalMap, fd);
            }}
          />
          <span>
            <span className="block text-sm font-semibold text-[var(--navy)]">
              {copy.checkboxLabel}
            </span>
            <span className="mt-0.5 block text-sm text-[var(--gray-500)]">
              {copy.checkboxHelp}
            </span>
          </span>
        </label>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-[var(--navy)]">
          Data de abertura
        </h2>
        <p className="mt-3 text-lg font-semibold text-[var(--navy)]">
          {foundedAt
            ? formatPrecisionDate(
                foundedAt,
                (foundedAtPrecision as "DAY" | "MONTH" | "YEAR") || "DAY",
              )
            : "Ainda não informada — use a busca na Receita abaixo."}
        </p>
        {isPj ? (
          <div className="mt-4">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => {
                const hasPeriods = periods.length > 0;
                if (hasPeriods && !confirm(copy.importConfirm)) {
                  return;
                }
                const fd = new FormData();
                fd.set("accountId", accountId);
                if (hasPeriods) fd.set("replace", "1");
                run(importAccountCorporateMap, fd);
              }}
            >
              {copy.importBtn}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--gray-500)]">
            {copy.pfHint}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--navy)]">
            {copy.compositionTitle}
          </h2>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            {copy.compositionHint}
          </p>
        </div>

        {periods.map((p) => (
          <article key={p.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--navy-soft)]/50 px-5 py-4">
              <div className="min-w-0 flex-1">
                {editingPeriodId === p.id ? (
                  <PeriodForm
                    key={`edit-${p.id}`}
                    accountId={accountId}
                    period={p}
                    foundedYear={foundedYear}
                    pending={pending}
                    onCancel={() => setEditingPeriodId(null)}
                    onSubmit={(fd) => {
                      run(upsertCorporatePeriod, fd);
                      setEditingPeriodId(null);
                    }}
                  />
                ) : (
                  <>
                    <h3 className="font-semibold text-[var(--navy)]">
                      {formatInterval(p)}
                    </h3>
                    {p.label ? (
                      <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                        {p.label}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              {editingPeriodId === p.id ? null : (
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={pending}
                    onClick={() => {
                      setEditingMemberId(null);
                      setEditingPeriodId(p.id);
                    }}
                  >
                    Editar datas
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(copy.removePeriodConfirm))
                        return;
                      const fd = new FormData();
                      fd.set("accountId", accountId);
                      fd.set("periodId", p.id);
                      run(deleteCorporatePeriod, fd);
                    }}
                  >
                    Remover intervalo
                  </button>
                </div>
              )}
            </div>

            <div className="p-5">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Tipo</th>
                      <th>CPF/CNPJ</th>
                      <th>Papel</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {p.members.map((m) => (
                      <tr key={m.id}>
                        {editingMemberId === m.id ? (
                          <td colSpan={5} className="!p-3">
                            <MemberForm
                              key={m.id}
                              accountId={accountId}
                              periodId={p.id}
                              member={m}
                              pending={pending}
                              institutional={institutionalMap}
                              onCancel={() => setEditingMemberId(null)}
                              onSubmit={(fd) => {
                                run(upsertCorporatePeriodMember, fd);
                                setEditingMemberId(null);
                              }}
                            />
                          </td>
                        ) : (
                          <>
                            <td className="font-medium text-[var(--navy)]">
                              {m.name}
                              {matchedSupplierDocs?.has(
                                m.cgccpf.replace(/\D/g, ""),
                              ) ? (
                                <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-[#176b3a]">
                                  · consta como observado
                                </span>
                              ) : null}
                            </td>
                            <td>{personTypeFromDoc(m.cgccpf)}</td>
                            <td>
                              {m.cgccpf ? formatCgccpf(m.cgccpf) : "—"}
                            </td>
                            <td>
                              {corporateRoleLabel(m.role, institutionalMap)}
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  className="btn btn-ghost text-xs"
                                  disabled={pending}
                                  onClick={() => setEditingMemberId(m.id)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost text-xs"
                                  disabled={pending}
                                  onClick={() => {
                                    if (!confirm(copy.removeMemberConfirm))
                                      return;
                                    const fd = new FormData();
                                    fd.set("accountId", accountId);
                                    fd.set("memberId", m.id);
                                    run(deleteCorporatePeriodMember, fd);
                                  }}
                                >
                                  Remover
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {p.members.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-[var(--gray-500)]">
                          {copy.emptyMembers}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {editingMemberId &&
              p.members.some((m) => m.id === editingMemberId) ? null : (
                <div className="mt-4">
                  <MemberForm
                    key={`add-${p.id}-${addFormKey}`}
                    accountId={accountId}
                    periodId={p.id}
                    pending={pending}
                    institutional={institutionalMap}
                    onSubmit={(fd) => {
                      run(upsertCorporatePeriodMember, fd);
                      setAddFormKey((k) => k + 1);
                    }}
                  />
                </div>
              )}
            </div>
          </article>
        ))}

        {periods.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--gray-500)]">
            Nenhum intervalo ainda. Busque na Receita ou crie um abaixo.
          </div>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-[var(--navy)]">
          Novo intervalo
        </h2>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          {copy.newPeriodHint}
        </p>
        <div className="mt-4">
          <PeriodForm
            key={`new-${newPeriodKey}`}
            accountId={accountId}
            foundedYear={foundedYear}
            pending={pending}
            onSubmit={(fd) => {
              run(upsertCorporatePeriod, fd);
              setNewPeriodKey((k) => k + 1);
            }}
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <a
          className="btn"
          href={`/api/reports/account/${accountId}/mapa-societario`}
        >
          {copy.pdfBtn}
        </a>

      </div>
    </div>
  );
}
