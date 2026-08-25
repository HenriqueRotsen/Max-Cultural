import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { fetchHubProjects } from "@/lib/origem-projects";

export const metadata = { title: "Projetos" };
export const dynamic = "force-dynamic";

export default async function ProjetosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { projects, error } = await fetchHubProjects();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Hub
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Projetos</h1>
        <p className="mt-1 text-sm text-[var(--gray-500)]">
          Projetos em andamento. Abra um item para ver o resumo completo.
        </p>
      </div>

      {error ? <p className="auth-alert">{error}</p> : null}

      {!error && projects.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-[var(--gray-500)]">
          Nenhum projeto em andamento no momento.
        </div>
      ) : null}

      {projects.length > 0 ? (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projetos/${p.slug}`}
                className="card flex flex-wrap items-baseline justify-between gap-3 px-5 py-4 transition hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--navy)]">{p.name}</p>
                  <p className="mt-0.5 text-sm text-[var(--gray-500)]">
                    {p.code}
                    {p.accountName ? ` · ${p.accountName}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-sm text-[var(--gray-600)]">{p.lawLabel}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
