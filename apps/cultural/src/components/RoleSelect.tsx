"use client";

import { useRef } from "react";
import { updateUserRoleAction } from "@/lib/actions/iam";

export function RoleSelect({
  userId,
  roleId,
  roles,
  userName,
  locked = false,
  lockedLabel,
}: {
  userId: string;
  roleId: string;
  roles: { id: string; name: string }[];
  userName: string;
  /** Conta protegida: papel não pode ser alterado. */
  locked?: boolean;
  lockedLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (locked) {
    return (
      <span
        className="inline-flex min-w-[8.5rem] items-center rounded-lg border border-[var(--border)] bg-[var(--gray-50)] px-2.5 py-1.5 text-sm font-medium text-[var(--navy)]"
        title="Papel Superadmin protegido — não pode ser alterado"
      >
        {lockedLabel || "Superadmin"}
      </span>
    );
  }

  return (
    <form ref={formRef} action={updateUserRoleAction} className="m-0">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="roleId"
        defaultValue={roleId}
        aria-label={`Papel de ${userName}`}
        className="min-w-[8.5rem] max-w-[11rem] rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm text-[var(--navy)]"
        onChange={(e) => {
          if (e.target.value === roleId) return;
          formRef.current?.requestSubmit();
        }}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </form>
  );
}
