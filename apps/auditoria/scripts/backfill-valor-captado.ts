/**
 * Preenche valorCaptado/valorAprovado nos projetos ainda sem captado,
 * via API pública SALIC (1 chamada por PRONAC distinto).
 */
import { prisma } from "@/lib/db";
import { getProjetoByPronac, parseSalicMoney } from "@/lib/salic/api";

async function main() {
  const projects = await prisma.project.findMany({
    where: {
      OR: [{ valorCaptado: null }, { valorCaptado: 0 }],
    },
    select: { id: true, pronac: true },
    orderBy: { pronac: "asc" },
  });

  const byPronac = new Map<string, string[]>();
  for (const p of projects) {
    const list = byPronac.get(p.pronac) || [];
    list.push(p.id);
    byPronac.set(p.pronac, list);
  }

  console.log(`PRONACs sem captado: ${byPronac.size} (${projects.length} linhas)`);

  let ok = 0;
  let miss = 0;
  let fail = 0;

  for (const [pronac, ids] of byPronac) {
    try {
      const projeto = await getProjetoByPronac(pronac);
      const valorCaptado = parseSalicMoney(projeto?.valor_captado);
      const valorAprovado = parseSalicMoney(projeto?.valor_aprovado);
      if (valorCaptado == null || valorCaptado <= 0) {
        miss += 1;
        console.log(`PRONAC ${pronac}: sem valor_captado na API`);
        continue;
      }
      await prisma.project.updateMany({
        where: { id: { in: ids } },
        data: {
          valorCaptado,
          ...(valorAprovado != null ? { valorAprovado } : {}),
        },
      });
      ok += 1;
      console.log(
        `PRONAC ${pronac}: captado=${valorCaptado} · ${ids.length} projeto(s)`,
      );
      await new Promise((r) => setTimeout(r, 120));
    } catch (error) {
      fail += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`PRONAC ${pronac}: falhou — ${message}`);
    }
  }

  console.log(`Fim: ok=${ok} miss=${miss} fail=${fail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
