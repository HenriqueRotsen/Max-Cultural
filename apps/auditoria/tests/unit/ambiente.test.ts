import { afterEach, describe, expect, it, vi } from "vitest";
import { bloquearProducao } from "@/lib/ambiente";

const PROD = "postgresql://postgres.maogvvcvrgokfcpjqksv:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
const HOMOLOG = "postgresql://postgres.hsmwokdibjoraoqliwtv:x@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";

describe("bloquearProducao", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("recusa o banco de produção fora da Vercel", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MAX_AMBIENTE", "teste");
    expect(() => bloquearProducao(PROD)).toThrow(/produção bloqueado/);
  });

  it("aceita homologação e banco local", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MAX_AMBIENTE", "homolog");
    expect(() => bloquearProducao(HOMOLOG, "postgresql://postgres:postgres@localhost:5436/max_local")).not.toThrow();
  });

  it("aceita a produção na Vercel e no db:migrate:producao", () => {
    vi.stubEnv("VERCEL", "1");
    expect(() => bloquearProducao(PROD)).not.toThrow();
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("MAX_AMBIENTE", "producao");
    expect(() => bloquearProducao(PROD)).not.toThrow();
  });
});
