import {
  listProdutosByFornecedor,
  type SalicProduto,
} from "@/lib/salic/api";
import { getSyncConcurrency, mapPool } from "@/lib/salic/concurrency";
import { normalizeCgccpf } from "@/lib/crypto";

/**
 * Cache de /produtos por fornecedorId e por CNPJ/CPF.
 * IDs do SALIC às vezes mudam; o CNPJ é a chave estável entre PRONACs.
 */
export class ProdutosCache {
  private byId = new Map<string, Promise<SalicProduto[]>>();
  private byCnpj = new Map<string, Promise<SalicProduto[]>>();
  private hits = 0;
  private misses = 0;

  get stats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.byId.size,
      cnpjKeys: this.byCnpj.size,
    };
  }

  get(fornecedorId: string, cgccpf?: string | null): Promise<SalicProduto[]> {
    const cnpj = cgccpf ? normalizeCgccpf(cgccpf) : "";
    if (cnpj && this.byCnpj.has(cnpj)) {
      this.hits += 1;
      return this.byCnpj.get(cnpj)!;
    }
    const existing = this.byId.get(fornecedorId);
    if (existing) {
      this.hits += 1;
      return existing;
    }

    this.misses += 1;
    const promise = listProdutosByFornecedor(fornecedorId).catch((error) => {
      this.byId.delete(fornecedorId);
      if (cnpj) this.byCnpj.delete(cnpj);
      throw error;
    });

    this.byId.set(fornecedorId, promise);
    if (cnpj) this.byCnpj.set(cnpj, promise);
    return promise;
  }

  async prefetch(
    entries: Array<{ id: string; cgccpf?: string | null }>,
    onProgress?: (done: number, total: number) => void | Promise<void>,
  ) {
    const seen = new Set<string>();
    const unique: Array<{ id: string; cgccpf?: string | null }> = [];
    for (const e of entries) {
      const key = e.cgccpf ? normalizeCgccpf(e.cgccpf) : e.id;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(e);
    }

    const concurrency = getSyncConcurrency();
    let done = 0;
    await mapPool(unique, concurrency, async (entry) => {
      try {
        await this.get(entry.id, entry.cgccpf);
      } catch {
        // caller trata miss
      } finally {
        done += 1;
        await onProgress?.(done, unique.length);
      }
    });
  }
}
