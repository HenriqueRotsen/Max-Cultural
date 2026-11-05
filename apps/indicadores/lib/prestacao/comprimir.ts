"use client";

/** No máximo 2000 px no lado maior, JPEG ~82%: ≈ 300 KB por foto, boa para relatório. */
const LADO_MAX = 2000;
const QUALIDADE = 0.82;

export type FotoComprimida = { blob: Blob; largura: number; altura: number; nome: string };

/** Comprime a foto no navegador antes de enviar (o servidor recebe só o JPEG final). */
export async function comprimirFoto(arquivo: File): Promise<FotoComprimida> {
  const bitmap = await createImageBitmap(arquivo).catch(() => {
    throw new Error(`Não foi possível ler "${arquivo.name}". Envie JPG, PNG ou WebP (fotos HEIC do iPhone: exporte como JPG).`);
  });
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Navegador sem suporte a imagens.");
  // Fundo branco: PNG com transparência vira JPEG sem fundo preto.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE));
  if (!blob) throw new Error(`Não foi possível comprimir "${arquivo.name}".`);
  const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { blob, largura, altura, nome };
}
