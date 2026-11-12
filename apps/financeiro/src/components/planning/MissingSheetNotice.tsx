import Link from "next/link";
import { PageHeader } from "@/components/ui";

/**
 * Página de NF/RPA ou de pagamento sem NF aberta num projeto que ainda não tem
 * a planilha importada: explica o motivo em vez de mostrar "página não encontrada".
 */
export function MissingSheetNotice({
  projectId,
  externalCode,
  title,
}: {
  projectId: string;
  externalCode: string;
  title: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${projectId}`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${projectId}`}>{externalCode}</Link>
          </>
        }
        title={title}
      />
      <div className="card space-y-2 p-5 text-sm text-[var(--gray-600)]">
        <p className="font-medium text-[var(--navy)]">
          Este projeto ainda não tem a planilha orçamentária importada.
        </p>
        <p>
          Sem a planilha não há rubricas para reservar o valor nem como conferir os limites do
          projeto. Use{" "}
          <Link href="/planejamento/novo" className="text-[var(--gold)] hover:underline">
            Novo projeto
          </Link>{" "}
          com o mesmo PRONAC para importar a planilha homologada pela área logada e depois volte
          aqui.
        </p>
      </div>
    </div>
  );
}
