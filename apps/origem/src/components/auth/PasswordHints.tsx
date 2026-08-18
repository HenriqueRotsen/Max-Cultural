export function PasswordHints() {
  return (
    <ul className="rounded-xl bg-[var(--gray-50)] px-3 py-3 text-xs text-[var(--gray-500)] space-y-1">
      <li>Mínimo de 10 caracteres</li>
      <li>Letras maiúsculas e minúsculas</li>
      <li>Pelo menos um número</li>
      <li>Pelo menos um símbolo (!@#$…)</li>
    </ul>
  );
}
