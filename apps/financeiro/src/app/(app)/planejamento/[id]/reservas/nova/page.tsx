import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type ReservationType = {
  key: string;
  title: string;
  when: string;
  needs: string;
  after: string;
  href: (id: string) => string;
};

/**
 * Tipos de reserva. Todos reservam o valor na rubrica com as mesmas travas
 * (saldo, limites do projeto, PRONAC, duplicidade); muda o documento de
 * entrada e o que fica pendente depois.
 */
const TYPES: ReservationType[] = [
  {
    key: "NF",
    title: "Nota fiscal",
    when: "A nota chegou antes de pagar.",
    needs: "PDF ou XML da NF.",
    after: "Depois: comprovante, guia dos impostos retidos e envio ao SALIC.",
    href: (id) => `/planejamento/${id}/nf/nova?tipo=NF`,
  },
  {
    key: "RPA",
    title: "RPA",
    when: "Pagamento a pessoa física (recibo de autônomo).",
    needs: "PDF do RPA.",
    after: "Depois: comprovante, guias de INSS/IRRF e envio ao SALIC.",
    href: (id) => `/planejamento/${id}/nf/nova?tipo=RPA`,
  },
  {
    key: "COMPROVANTE",
    title: "Comprovante (já pago, sem NF)",
    when: "O pagamento já foi feito e a nota ainda não chegou.",
    needs: "Comprovante do pagamento, valor, fornecedor e rubrica.",
    after: "Entra como pago, com NF pendente. Depois: NF/RPA (ou fatura, recibo ou apólice).",
    href: (id) => `/planejamento/${id}/pagamento-antecipado`,
  },
  {
    key: "BOLETO",
    title: "Boleto",
    when: "Chegou uma cobrança para pagar: passagem, seguro, serviço.",
    needs: "PDF do boleto. O sistema lê valor, vencimento e beneficiário.",
    after: "Reserva até o vencimento. Depois: comprovante, NF ou apólice e envio ao SALIC.",
    href: (id) => `/planejamento/${id}/reservas/boleto`,
  },
  {
    key: "CONTRATO",
    title: "Contrato",
    when: "Locação ou serviço pago em parcelas.",
    needs: "Contrato assinado, valor total e as parcelas (data e rubrica de cada uma).",
    after: "Uma reserva por parcela. Depois: comprovante e NF de cada parcela (ou o contrato no lugar da NF).",
    href: (id) => `/planejamento/${id}/pedidos/novo?contrato=1`,
  },
];

export default async function NovaReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { entitlements } = await getWorkspaceContext();
  const project = await prisma.planningProject.findFirst({
    where: { id, workspaceId: entitlements.workspaceId },
    select: { id: true, externalCode: true },
  });
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/planejamento/${project.id}`}
        breadcrumb={
          <>
            <Link href="/planejamento">Planejamento</Link> /{" "}
            <Link href={`/planejamento/${project.id}`}>{project.externalCode}</Link> / Nova reserva
          </>
        }
        title="Nova reserva"
        description="Escolha pelo documento que você tem agora. Todos reservam o valor na rubrica e passam pelas mesmas travas: saldo da rubrica, limites do projeto, PRONAC e documento repetido."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TYPES.map((t) => (
          <Link
            key={t.key}
            href={t.href(project.id)}
            className="card flex flex-col gap-2 p-5 transition hover:border-[var(--navy)] hover:shadow-md"
          >
            <span className="text-lg font-semibold text-[var(--navy)]">{t.title}</span>
            <span className="text-sm text-[var(--gray-700)]">{t.when}</span>
            <span className="text-sm text-[var(--gray-600)]">
              <strong className="font-semibold">Precisa:</strong> {t.needs}
            </span>
            <span className="mt-auto pt-2 text-xs text-[var(--gray-500)]">{t.after}</span>
          </Link>
        ))}
      </div>
      <p className="text-sm text-[var(--gray-500)]">
        Apólice, fatura, recibo e orçamento podem ser anexados a qualquer reserva, no lançamento, em
        &quot;Outros documentos&quot;.
      </p>
    </div>
  );
}
