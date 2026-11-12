/**
 * Ajuda da readequação ("Editar rubricas"): a soma das rubricas tem que fechar
 * no total aprovado. Estas funções sugerem os valores; quem salva é a pessoa.
 */

export type ReallocLine = {
  id: string;
  value: number;
  /** Mínimo: o que já foi reservado ou pago na rubrica. */
  min: number;
  max: number;
  /** Bloqueada ou custo vinculado: não entra no ajuste automático. */
  fixed: boolean;
  /** Já mexida pela pessoa: o ajuste automático não mexe nela. */
  edited: boolean;
};

const cents = (n: number) => Math.round(n * 100);

/**
 * Fecha a soma no alvo mexendo só nas rubricas livres (não fixas e não editadas):
 * - soma acima do alvo: tira das que têm mais saldo livre (valor − mínimo);
 * - soma abaixo do alvo: devolve às que têm mais espaço até o máximo.
 * Sempre proporcional e em centavos. Devolve os novos valores e o que sobrou
 * sem conseguir distribuir (0 quando fechou).
 */
export function autoBalance(
  lines: ReallocLine[],
  target: number,
): { values: Record<string, number>; remaining: number } {
  const values = Object.fromEntries(lines.map((l) => [l.id, cents(l.value)]));
  const sum = lines.reduce((s, l) => s + cents(l.value), 0);
  let diff = sum - cents(target);
  if (diff === 0) return { values: toReais(values), remaining: 0 };

  const pool = lines.filter((l) => !l.fixed && !l.edited);
  const room = (l: ReallocLine) =>
    diff > 0 ? values[l.id]! - cents(l.min) : cents(l.max) - values[l.id]!;
  const candidates = pool.filter((l) => room(l) > 0).sort((a, b) => room(b) - room(a));
  const totalRoom = candidates.reduce((s, l) => s + room(l), 0);
  if (totalRoom <= 0) return { values: toReais(values), remaining: diff / 100 };

  const need = Math.min(Math.abs(diff), totalRoom);
  const sign = diff > 0 ? -1 : 1;
  let moved = 0;
  const shares = candidates.map((l) => {
    const part = Math.min(room(l), Math.floor((need * room(l)) / totalRoom));
    moved += part;
    return { l, part };
  });
  // Centavos que sobraram do arredondamento: nas que ainda têm espaço.
  let rest = need - moved;
  for (const sh of shares) {
    if (rest <= 0) break;
    const extra = Math.min(rest, room(sh.l) - sh.part);
    sh.part += extra;
    rest -= extra;
  }
  for (const { l, part } of shares) values[l.id] = values[l.id]! + sign * part;
  diff = diff > 0 ? diff - need : diff + need;
  return { values: toReais(values), remaining: diff / 100 };
}

function toReais(values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v / 100]));
}
