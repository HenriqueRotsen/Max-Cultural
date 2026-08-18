import { redirect } from "next/navigation";
import { can, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "Logs" };
export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const user = await getSessionUser();
  if (!user || !can(user, "cultural.logs", "view")) redirect("/");
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { email: true, name: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gray-400)]">
          Acesso
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--navy)]">Logs</h1>
      </div>
      <section className="card overflow-hidden">
        <table className="data w-full text-sm">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>Ação</th>
              <th>Tela</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.createdAt.toLocaleString("pt-BR")}</td>
                <td>{log.actor?.email ?? "—"}</td>
                <td>{log.action}</td>
                <td>{log.screen || "—"}</td>
                <td>{log.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
