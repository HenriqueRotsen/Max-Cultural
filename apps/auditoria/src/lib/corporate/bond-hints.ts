import { normalizeCgccpf } from "@/lib/format";
import { normalizePersonName } from "@/lib/corporate/qsa-import";

/**
 * Pistas de vínculo tiradas dos mapas societários, nos anos do PRONAC. Não
 * liga nada sozinho: a pessoa decide no "Tem vínculo?". Servem para não deixar
 * passar o que o mapa já mostra.
 */
export type MapMember = { name: string; cgccpf: string };

export type BondHint = {
  /** Forte: mesmo CPF/CNPJ. Fraca: só o mesmo nome (sócio sem CPF completo). */
  strength: "doc" | "name";
  text: string;
};

const docOf = (m: MapMember) => {
  const d = normalizeCgccpf(m.cgccpf);
  return d.length === 11 || d.length === 14 ? d : "";
};

export function findBondHints(params: {
  proponentDoc: string;
  proponentName: string;
  /** Sócios/administradores do proponente nos anos do PRONAC. */
  proponentMembers: MapMember[];
  observado: { doc: string; name: string };
  /** Sócios da empresa observada nos anos do PRONAC (vazio se for pessoa). */
  observadoMembers: MapMember[];
}): BondHint[] {
  const hints: BondHint[] = [];
  const seen = new Set<string>();
  const add = (h: BondHint) => {
    if (seen.has(h.text)) return;
    seen.add(h.text);
    hints.push(h);
  };

  const propDoc = normalizeCgccpf(params.proponentDoc);
  const obsDoc = normalizeCgccpf(params.observado.doc);
  const propByDoc = new Map(
    params.proponentMembers.filter(docOf).map((m) => [docOf(m), m] as const),
  );
  const propByName = new Map(
    params.proponentMembers.map((m) => [normalizePersonName(m.name), m] as const),
  );

  // 1) O próprio observado está no quadro do proponente.
  if (obsDoc && propByDoc.has(obsDoc)) {
    add({ strength: "doc", text: `É sócio ou administrador de ${params.proponentName}.` });
  } else if (!obsDoc || obsDoc.length === 11) {
    const byName = propByName.get(normalizePersonName(params.observado.name));
    if (byName && !docOf(byName)) {
      add({
        strength: "name",
        text: `Mesmo nome de um sócio de ${params.proponentName} (sem CPF no mapa para confirmar).`,
      });
    }
  }

  for (const m of params.observadoMembers) {
    const d = docOf(m);
    // 2) O proponente é sócio da empresa observada.
    if (d && propDoc && d === propDoc) {
      add({ strength: "doc", text: `${params.proponentName} é sócio desta empresa.` });
      continue;
    }
    // 3) Sócio em comum.
    if (d && propByDoc.has(d)) {
      add({ strength: "doc", text: `Sócio em comum com o proponente: ${m.name}.` });
      continue;
    }
    const sameName = propByName.get(normalizePersonName(m.name));
    if (sameName && (!d || !docOf(sameName))) {
      add({
        strength: "name",
        text: `Mesmo nome de sócio nos dois mapas: ${m.name} (sem CPF completo para confirmar).`,
      });
    }
  }
  return hints;
}
