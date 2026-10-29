import { createHash } from "crypto";

/** SHA-256 hex do conteúdo original (antes de compressão). */
export function hashDocumentContent(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
