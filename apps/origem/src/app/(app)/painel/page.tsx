import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

type ModuleTheme = {
  topBar: string;
  cardGlow: string;
  iconBg: string;
  iconRing: string;
  iconColor: string;
  ctaBg: string;
  ctaHover: string;
  ctaText: string;
  hoverBorder: string;
};

type ModuleCard = {
  href: string;
  title: string;
  description: string;
  cta: string;
  theme: ModuleTheme;
  icon: ReactNode;
};

const MODULES: ModuleCard[] = [
  {
    href: "/planejamento",
    title: "Planejamento",
    description:
      "Planilha homologada, reservas por NF e gestão inteligente de rubricas.",
    cta: "Abrir",
    theme: {
      topBar: "bg-[linear-gradient(90deg,#6b4fc9_0%,#3b82d6_100%)]",
      cardGlow: "bg-[radial-gradient(circle_at_top_right,rgba(107,79,201,0.14),transparent_58%)]",
      iconBg: "bg-[linear-gradient(135deg,#ebe9f8_0%,#ddd6fe_100%)]",
      iconRing: "ring-[#d4cff0]",
      iconColor: "text-[#5b52c9]",
      ctaBg: "bg-[#ebe9f8]",
      ctaHover: "group-hover:bg-[linear-gradient(90deg,#6b4fc9_0%,#3b82d6_100%)]",
      ctaText: "text-[#5b52c9] group-hover:text-white",
      hoverBorder: "hover:border-[#b8b0e8]",
    },
    icon: (
      <>
        <path
          d="M5 4h14v16H5V4Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M8 8h8M8 12h8M8 16h5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          className="opacity-70"
        />
      </>
    ),
  },
  {
    href: "/contas",
    title: "Proponentes",
    description: "Cadastro SALIC, credenciais e mapa societário dos proponentes.",
    cta: "Abrir",
    theme: {
      topBar: "bg-[linear-gradient(90deg,#4a1d6e_0%,#7c3aed_100%)]",
      cardGlow: "bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.12),transparent_58%)]",
      iconBg: "bg-[linear-gradient(135deg,#f3eef8_0%,#ede9fe_100%)]",
      iconRing: "ring-[#e9d5ff]",
      iconColor: "text-[#4a1d6e]",
      ctaBg: "bg-[#f3eef8]",
      ctaHover: "group-hover:bg-[linear-gradient(90deg,#4a1d6e_0%,#7c3aed_100%)]",
      ctaText: "text-[#6d28d9] group-hover:text-white",
      hoverBorder: "hover:border-[#d8c4f0]",
    },
    icon: (
      <>
        <path
          d="M4 20V7l8-3 8 3v13"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M9 20v-5h6v5" stroke="currentColor" strokeWidth="1.7" className="opacity-70" />
      </>
    ),
  },
  {
    href: "/inicio",
    title: "Auditoria",
    description: "Sync SALIC, insights por fornecedor e relatório de auditoria.",
    cta: "Abrir",
    theme: {
      topBar: "bg-[linear-gradient(90deg,#2563eb_0%,#0ea5e9_100%)]",
      cardGlow: "bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_58%)]",
      iconBg: "bg-[linear-gradient(135deg,#e8f2ff_0%,#dbeafe_100%)]",
      iconRing: "ring-[#bfdbfe]",
      iconColor: "text-[#1d4ed8]",
      ctaBg: "bg-[#e8f2ff]",
      ctaHover: "group-hover:bg-[linear-gradient(90deg,#2563eb_0%,#0ea5e9_100%)]",
      ctaText: "text-[#2563eb] group-hover:text-white",
      hoverBorder: "hover:border-[#93c5fd]",
    },
    icon: (
      <>
        <path
          d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M14 3v5h5M8 12h8M8 15h8M8 18h5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          className="opacity-70"
        />
      </>
    ),
  },
  {
    href: "/fornecedores",
    title: "Fornecedores",
    description:
      "Banco de preços: cadastro, serviços, contratações, avaliações e análises.",
    cta: "Abrir",
    theme: {
      topBar: "bg-[linear-gradient(90deg,#0d9488_0%,#14b8a6_100%)]",
      cardGlow: "bg-[radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_58%)]",
      iconBg: "bg-[linear-gradient(135deg,#e6f7f4_0%,#ccfbf1_100%)]",
      iconRing: "ring-[#99f6e4]",
      iconColor: "text-[#0f766e]",
      ctaBg: "bg-[#e6f7f4]",
      ctaHover: "group-hover:bg-[linear-gradient(90deg,#0d9488_0%,#14b8a6_100%)]",
      ctaText: "text-[#0d9488] group-hover:text-white",
      hoverBorder: "hover:border-[#99f6e4]",
    },
    icon: (
      <>
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M3.5 18.5c.8-2.6 2.9-4 5.5-4s4.7 1.4 5.5 4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle
          cx="17"
          cy="9"
          r="2.2"
          stroke="currentColor"
          strokeWidth="1.7"
          className="opacity-70"
        />
      </>
    ),
  },
];

export default function ModulesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumb="MAX Origem"
        title="Escolha o módulo"
        description="Proponentes, planejamento de rubricas, auditoria SALIC e banco de preços — no mesmo acesso."
      />

      <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {MODULES.map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className={`group card relative flex h-full min-h-[19rem] flex-col overflow-hidden p-6 transition hover:-translate-y-0.5 hover:shadow-lg ${mod.theme.hoverBorder}`}
          >
            <span
              className={`pointer-events-none absolute inset-0 ${mod.theme.cardGlow}`}
              aria-hidden
            />
            <span
              className={`absolute inset-x-0 top-0 h-1.5 ${mod.theme.topBar}`}
              aria-hidden
            />

            <span
              className={`relative inline-flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${mod.theme.iconBg} ${mod.theme.iconRing} ${mod.theme.iconColor} shadow-sm`}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                {mod.icon}
              </svg>
            </span>

            <h2 className="relative mt-5 text-xl font-semibold text-[var(--navy)]">
              {mod.title}
            </h2>
            <p className="relative mt-2 flex-1 text-sm leading-relaxed text-[var(--gray-500)]">
              {mod.description}
            </p>

            <span
              className={`relative mt-6 inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${mod.theme.ctaBg} ${mod.theme.ctaHover} ${mod.theme.ctaText}`}
            >
              <span>{mod.cta}</span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                className="shrink-0 transition group-hover:translate-x-0.5"
              >
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
