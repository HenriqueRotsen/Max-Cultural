import Link from "next/link";
import { DeleteNfButton } from "@/components/planning/DeleteNfButton";
import { canDeleteNf } from "@/lib/planning/acl";

export async function PendingFiscalDocuments({
  planningProjectId,
  documents,
}: {
  planningProjectId: string;
  documents: Array<{
    id: string;
    kind: string;
    status: string;
    filename: string;
    createdAt: Date;
  }>;
}) {
  if (documents.length === 0) return null;

  const allowDelete = await canDeleteNf();

  return (
    <div className="card space-y-3 border-amber-200 bg-amber-50/40 p-5">
      <div>
        <h2 className="font-semibold text-amber-950">
          Notas aguardando ação ({documents.length})
        </h2>
        <p className="mt-1 text-sm text-amber-900/80">
          Estes arquivos já foram enviados e ainda estão no sistema. Para subir o
          mesmo PDF de novo, continue a revisão ou exclua a nota abaixo.
        </p>
      </div>
      <ul className="space-y-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-white px-3 py-2.5 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium text-[var(--navy)]">
                {doc.kind} ·{" "}
                {doc.status === "REVIEW"
                  ? "Em revisão"
                  : doc.status === "IMPORTED"
                    ? "Já reservada"
                    : doc.status}
              </p>
              <p className="truncate text-xs text-[var(--gray-500)]">
                {doc.filename}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {doc.status === "REVIEW" ? (
                <Link
                  href={`/planejamento/${planningProjectId}/nf/${doc.id}/revisar`}
                  className="btn btn-ghost text-xs"
                >
                  Continuar revisão
                </Link>
              ) : null}
              {allowDelete ? (
                <DeleteNfButton
                  documentId={doc.id}
                  documentKind={doc.kind === "RPA" ? "RPA" : "NF"}
                  filename={doc.filename}
                  redirectTo={`/planejamento/${planningProjectId}/nf/nova`}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
