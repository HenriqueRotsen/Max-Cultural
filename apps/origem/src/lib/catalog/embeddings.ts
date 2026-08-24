import { prisma } from "@/lib/db";

export const EMBEDDING_DIMS = 768;
export const NAME_SIM_WEIGHT = 0.7;
export const DESCRIPTION_SIM_WEIGHT = 0.3;

export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export function parseVectorLiteral(literal: string | null | undefined): number[] | null {
  if (!literal) return null;
  const nums = literal
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n));
  return nums.length > 0 ? nums : null;
}

export function distanceToSimilarity(distance: number): number {
  return 1 - distance;
}

export function weightedSimilarity(
  nameDistance: number,
  descriptionDistance: number | null,
): number {
  if (descriptionDistance == null || !Number.isFinite(descriptionDistance)) {
    return distanceToSimilarity(nameDistance);
  }
  const combined =
    NAME_SIM_WEIGHT * nameDistance + DESCRIPTION_SIM_WEIGHT * descriptionDistance;
  return distanceToSimilarity(combined);
}

export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

  try {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: trimmed }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("Ollama embeddings error:", res.status, err.slice(0, 200));
      return null;
    }
    const payload = (await res.json()) as { embedding?: number[] };
    const embedding = payload.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) return null;
    if (embedding.length !== EMBEDDING_DIMS) {
      console.error(`Unexpected embedding dims ${embedding.length}; expected ${EMBEDDING_DIMS}`);
      return null;
    }
    return embedding;
  } catch (error) {
    console.error("Ollama embeddings failed:", error);
    return null;
  }
}

export async function persistServiceEmbeddings(
  serviceId: string,
  nameEmbedding: number[],
  descriptionEmbedding: number[] | null,
) {
  if (descriptionEmbedding) {
    await prisma.$executeRawUnsafe(
      `UPDATE catalog_services
       SET "nameEmbedding" = $1::vector,
           "descriptionEmbedding" = $2::vector,
           "embeddingUpdatedAt" = NOW()
       WHERE id = $3`,
      vectorLiteral(nameEmbedding),
      vectorLiteral(descriptionEmbedding),
      serviceId,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE catalog_services
       SET "nameEmbedding" = $1::vector,
           "descriptionEmbedding" = NULL,
           "embeddingUpdatedAt" = NOW()
       WHERE id = $2`,
      vectorLiteral(nameEmbedding),
      serviceId,
    );
  }
}

export async function indexServiceEmbedding(input: {
  id: string;
  name: string;
  description?: string | null;
}): Promise<boolean> {
  try {
    const nameEmbedding = await embedText(input.name);
    if (!nameEmbedding) return false;
    const desc = (input.description || "").trim();
    const descriptionEmbedding = desc ? await embedText(desc) : null;
    await persistServiceEmbeddings(input.id, nameEmbedding, descriptionEmbedding);
    return true;
  } catch (error) {
    console.error("indexServiceEmbedding failed:", error);
    return false;
  }
}
