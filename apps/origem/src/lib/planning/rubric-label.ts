/** Número exibido do item na planilha (1-based, ordem de importação). */
export function rubricItemNumber(sortOrder: number): number {
  return sortOrder + 1;
}

export function formatRubricItemLabel(input: {
  sortOrder: number;
  itemName: string;
  stageName?: string;
  productName?: string;
}): string {
  const n = rubricItemNumber(input.sortOrder);
  const parts = [`${n}. ${input.itemName}`];
  if (input.stageName) parts.push(input.stageName);
  if (input.productName) parts.push(input.productName);
  return parts.join(" · ");
}

export function formatRubricShortLabel(input: {
  sortOrder: number;
  itemName: string;
}): string {
  return `${rubricItemNumber(input.sortOrder)}. ${input.itemName}`;
}

export function rubricSelectLabel(input: {
  sortOrder: number;
  itemName: string;
  stageName: string;
}): string {
  return `${rubricItemNumber(input.sortOrder)}. ${input.stageName} · ${input.itemName}`;
}
