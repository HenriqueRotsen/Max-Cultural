import Link from "next/link";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ModulesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumb="MAX Origem"
        title="Escolha o módulo"
        description="Execução de rubricas, auditoria SALIC e banco de preços — no mesmo acesso."
      />

      <div className="grid gap-5 md:grid-cols-3">
        <Link
          href="/planejamento"
          className="group card relative overflow-hidden p-8 transition hover:border-[#c5d0e4] hover:shadow-md"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--gold-soft)] text-[var(--navy)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M5 4h14v16H5V4Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path d="M8 8h8M8 12h8M8 16h5" stroke="#c4a574" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <h2 className="mt-5 text-2xl font-semibold text-[var(--navy)]">Planejamento</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--gray-500)]">
            Planilha homologada, reservas por NF e gestão inteligente de rubricas.
          </p>
          <p className="mt-6 text-sm font-semibold text-[var(--gold)] group-hover:underline">
            Abrir planejamento →
          </p>
        </Link>

        <Link
          href="/inicio"
          className="group card relative overflow-hidden p-8 transition hover:border-[#c5d0e4] hover:shadow-md"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--navy-soft)] text-[var(--navy)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path d="M14 3v5h5M8 12h8M8 15h8M8 18h5" stroke="#c4a574" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <h2 className="mt-5 text-2xl font-semibold text-[var(--navy)]">Auditoria</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--gray-500)]">
            Sync SALIC, insights, relatório e mapa societário dos proponentes.
          </p>
          <p className="mt-6 text-sm font-semibold text-[var(--gold)] group-hover:underline">
            Abrir auditoria →
          </p>
        </Link>

        <Link
          href="/fornecedores"
          className="group card relative overflow-hidden p-8 transition hover:border-[#c5d0e4] hover:shadow-md"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--navy-soft)] text-[var(--navy)]">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M3.5 18.5c.8-2.6 2.9-4 5.5-4s4.7 1.4 5.5 4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
              <circle cx="17" cy="9" r="2.2" stroke="#c4a574" strokeWidth="1.7" />
            </svg>
          </span>
          <h2 className="mt-5 text-2xl font-semibold text-[var(--navy)]">Fornecedores</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--gray-500)]">
            Banco de preços: cadastro, serviços, contratações, avaliações e análises.
          </p>
          <p className="mt-6 text-sm font-semibold text-[var(--gold)] group-hover:underline">
            Abrir fornecedores →
          </p>
        </Link>
      </div>
    </div>
  );
}
