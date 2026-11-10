/**
 * Proponentes são texto livre (projeto e planilhas de inscrição), então o mesmo
 * proponente aparece escrito de vários jeitos: "Vivas Cultura e Esporte LTDA" e
 * "Vivas Cultura e Esporte", com CNPJ no nome, com ou sem acento…
 *
 * `proponenteKey` reduz o nome a uma chave comparável; `PROPONENTE_APELIDOS`
 * junta nomes diferentes que a equipe confirmou serem o mesmo proponente.
 */

/** Sufixos de natureza jurídica que não mudam quem é o proponente. */
const SUFIXOS_JURIDICOS = new Set([
  "ltda",
  "ltd",
  "me",
  "epp",
  "eireli",
  "mei",
  "sa",
  "s a",
  "slu",
  "ss",
]);

/** Palavras que não identificam o proponente sozinhas. */
const PALAVRAS_GENERICAS = new Set([
  "a",
  "o",
  "e",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "instituto",
  "associacao",
  "fundacao",
  "cultura",
  "cultural",
  "centro",
  "grupo",
  "cia",
  "companhia",
  "empresa",
  "producoes",
  "producao",
]);

function semAcento(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Chave sem acento, caixa, pontuação, CNPJ/CPF e sufixos jurídicos (LTDA, ME, EIRELI…). */
export function proponenteKeyBase(nome: string): string {
  let s = semAcento(nome ?? "").toLowerCase();
  // CNPJ/CPF dentro do nome (com ou sem máscara) e a palavra "CNPJ"/"CPF".
  s = s.replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, " ");
  s = s.replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, " ");
  s = s.replace(/\b(cnpj|cpf)\b\s*:?/g, " ");
  s = s.replace(/\bs\s*\/\s*a\b/g, " sa ");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  const partes = s.split(/\s+/).filter(Boolean);
  // Tira sufixos jurídicos do fim (pode haver mais de um: "… LTDA ME").
  while (partes.length > 1) {
    const ult = partes[partes.length - 1]!;
    const ult2 = partes.length > 2 ? `${partes[partes.length - 2]} ${ult}` : "";
    if (ult2 && SUFIXOS_JURIDICOS.has(ult2)) partes.splice(-2, 2);
    else if (SUFIXOS_JURIDICOS.has(ult)) partes.pop();
    else break;
  }
  return partes.join(" ");
}

/**
 * Nomes diferentes que são o mesmo proponente (confirmado pela equipe).
 * Chave base (`proponenteKeyBase`) do apelido → chave base do nome oficial.
 */
export const PROPONENTE_APELIDOS: Record<string, string> = {
  "instituto vivas": "instituto morada vivas",
  "atelie 22": "atelie 22 arte e cultura",
};

/** Chave que identifica o proponente (normalizada + apelidos confirmados). */
export function proponenteKey(nome: string): string {
  const base = proponenteKeyBase(nome);
  return PROPONENTE_APELIDOS[base] ?? base;
}

/** Nome de teste/demonstração (não entra na unificação nem nos filtros). */
export function isProponenteDeTeste(nome: string): boolean {
  const s = semAcento(nome ?? "").toLowerCase();
  return /\b(teste?s?|test|demo|demonstracao|exemplo|fake|ficticio|xxx+|asdf|qwerty)\b/.test(s);
}

/**
 * Nome a exibir para um grupo de variantes: o mais completo (mais palavras,
 * ex.: com "LTDA"), e entre iguais o mais usado.
 */
export function nomeCanonico(variantes: Array<{ nome: string; usos: number }>): string {
  const limpas = variantes
    .map((v) => ({ nome: v.nome.trim().replace(/\s+/g, " "), usos: v.usos }))
    .filter((v) => v.nome);
  if (!limpas.length) return "";
  const palavras = (n: string) => proponenteKeyBase(n).split(" ").length;
  const temSufixo = (n: string) =>
    semAcento(n).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").length >
    proponenteKeyBase(n).split(" ").length;
  return limpas.sort(
    (a, b) =>
      palavras(b.nome) - palavras(a.nome) ||
      Number(temSufixo(b.nome)) - Number(temSufixo(a.nome)) ||
      b.usos - a.usos ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  )[0]!.nome;
}

export type GrupoProponente = {
  key: string;
  /** Nome que fica. */
  nome: string;
  /** Todas as grafias encontradas (inclui o nome que fica). */
  variantes: Array<{ nome: string; usos: number }>;
};

/** Agrupa grafias do mesmo proponente. Nomes de teste ficam de fora. */
export function agruparProponentes(
  nomes: Array<{ nome: string; usos: number }>,
): { grupos: GrupoProponente[]; teste: Array<{ nome: string; usos: number }> } {
  const porKey = new Map<string, Map<string, number>>();
  const teste = new Map<string, number>();
  for (const { nome, usos } of nomes) {
    const n = (nome ?? "").trim();
    if (!n) continue;
    if (isProponenteDeTeste(n)) {
      teste.set(n, (teste.get(n) ?? 0) + usos);
      continue;
    }
    const key = proponenteKey(n);
    if (!key) continue;
    const m = porKey.get(key) ?? new Map<string, number>();
    m.set(n, (m.get(n) ?? 0) + usos);
    porKey.set(key, m);
  }
  const grupos = [...porKey.entries()].map(([key, m]) => {
    const variantes = [...m.entries()].map(([nome, usos]) => ({ nome, usos }));
    return { key, nome: nomeCanonico(variantes), variantes };
  });
  grupos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    grupos,
    teste: [...teste.entries()].map(([nome, usos]) => ({ nome, usos })),
  };
}

/**
 * Pares que talvez sejam o mesmo proponente, mas não são juntados sozinhos
 * (ex.: "Instituto Vivas" × "Instituto Morada Vivas"): as palavras que
 * identificam o menor estão todas no maior. Só para revisão humana.
 */
export function possiveisDuplicados(grupos: GrupoProponente[]): Array<[string, string]> {
  const sig = (key: string) =>
    new Set(key.split(" ").filter((p) => p.length > 1 && !PALAVRAS_GENERICAS.has(p)));
  const out: Array<[string, string]> = [];
  for (let i = 0; i < grupos.length; i++) {
    for (let j = i + 1; j < grupos.length; j++) {
      const a = sig(grupos[i]!.key);
      const b = sig(grupos[j]!.key);
      if (!a.size || !b.size) continue;
      const [menor, maior] = a.size <= b.size ? [a, b] : [b, a];
      if ([...menor].every((p) => maior.has(p))) out.push([grupos[i]!.nome, grupos[j]!.nome]);
    }
  }
  return out;
}
