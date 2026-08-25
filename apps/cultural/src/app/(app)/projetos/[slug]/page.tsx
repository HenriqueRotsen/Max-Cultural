import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FluxoPanel, OrigemPanel } from "@/components/projetos/ProductPanels";
import { getSessionUser } from "@/lib/auth";
import { fetchFluxoByPronac } from "@/lib/fluxo-projects";
import { fetchHubProject } from "@/lib/origem-projects";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { project } = await fetchHubProject(slug);
  return { title: project ? project.name : "Projeto" };
}

export default async function ProjetoSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { slug } = await params;
  const { project, error } = await fetchHubProject(slug);
  if (!project) {
    if (error) {
      return (
        <div className="space-y-4">
          <Link href="/projetos" className="text-sm text-[var(--gray-500)] hover:text-[var(--navy)]">
            ← Projetos
          </Link>
          <p className="auth-alert">{error}</p>
        </div>
      );
    }
    notFound();
  }

  const fluxoResult = await fetchFluxoByPronac(project.code);
  const closed = project.lifecycleStatus === "ENCERRADO";
  const origem = (process.env.NEXT_PUBLIC_ORIGEM_URL || "http://localhost:3001").replace(
    /\/$/,
    "",
  );
  const fluxoBase = (process.env.NEXT_PUBLIC_FLUXO_URL || "http://localhost:3002").replace(
    /\/$/,
    "",
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projetos" className="text-sm text-[var(--gray-500)] hover:text-[var(--navy)]">
          ← Projetos
        </Link>
        <div className="mt-3 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
            {project.code}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">{project.name}</h1>
          <p className="mt-1 text-sm text-[var(--gray-500)]">
            <span
              className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                closed
                  ? "bg-[var(--gray-100)] text-[var(--gray-500)]"
                  : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {project.lifecycleLabel}
            </span>
            {project.accountName}
            {project.lawLabel ? ` · ${project.lawLabel}` : ""}
          </p>
        </div>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <OrigemPanel project={project} origemBase={origem} />
        <FluxoPanel
          fluxo={fluxoResult.data}
          error={fluxoResult.error}
          fluxoBase={fluxoBase}
        />
      </div>
    </div>
  );
}
