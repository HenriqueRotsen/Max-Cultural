import Link from "next/link";
import { isDemoMode } from "@/lib/auth/config";

export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div
      className="border-b border-[#e5d3bb] bg-[var(--gold-soft)] px-4 py-2.5 text-center text-sm text-[var(--navy)]"
      role="status"
    >
      <strong>Modo demonstração</strong>
      {" — "}
      amostra de cerca de 10% dos dados. Algumas ações (sync, cadastros) ficam bloqueadas.{" "}
      <Link href="/contato" className="font-semibold underline underline-offset-2">
        Solicitar acesso completo
      </Link>
    </div>
  );
}
