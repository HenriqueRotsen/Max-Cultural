import { PASSWORD_RULES } from "@/lib/password-rules";

/** Lista estática dos requisitos — para avisar antes de o usuário criar a senha. */
export function PasswordRulesPreview({ title }: { title: string }) {
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--gray-50)] px-3 py-2.5">
      <p className="text-xs font-semibold text-[var(--gray-600)]">{title}</p>
      <ul className="mt-1.5 grid gap-1 text-xs text-[var(--gray-500)] sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => (
          <li key={rule.id} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block w-3 text-center font-bold">•</span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
