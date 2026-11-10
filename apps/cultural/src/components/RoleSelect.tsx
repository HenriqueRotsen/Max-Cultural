"use client";

import { SearchSelect } from "@max/ui";
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
    <form action={updateUserRoleAction} className="m-0">
      <input type="hidden" name="userId" value={userId} />
      <SearchSelect
        name="roleId"
        defaultValue={roleId}
        aria-label={`Papel de ${userName}`}
        className="min-w-[8.5rem] max-w-[11rem]"
        submitOnChange
        options={roles.map((r) => ({ value: r.id, label: r.name }))}
      />
    </form>
  );
}
