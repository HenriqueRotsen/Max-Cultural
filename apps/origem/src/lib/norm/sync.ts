import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import {
  DEFAULT_SOURCE_URL,
  DEFAULT_LEGISLATION_INDEX_URL,
  type ComplianceCaps,
} from "@/lib/compliance/defaults";
import { capsEqual, extractCapsFromNormText } from "@/lib/compliance/extract";
import { ensureDefaultRuleset } from "@/lib/compliance/rules";

export type NormSyncResult = {
  fetchedAt: string;
  url: string;
  title: string | null;
  contentHash: string;
  changed: boolean;
  action: "noop" | "activated" | "draft" | "unchanged-caps";
  sourceCode: string | null;
  notes: string[];
  rulesetId?: string;
};

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "SalinkNormSync/1.0 (+https://localhost)",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar norma: HTTP ${res.status} ${url}`);
  }
  return res.text();
}

/** Detecta link "Revogada pela IN nº X" apontando para nova IN na página. */
function findSuccessorUrl(html: string, baseUrl: string): string | null {
  const revoked = html.match(
    /Revogada pela\s*<a[^>]+href="([^"]+)"[^>]*>\s*Instru[cç][aã]o Normativa[^<]*n[ºo°]?\s*(\d+)/i,
  );
  if (revoked?.[1]) {
    try {
      return new URL(revoked[1], baseUrl).toString();
    } catch {
      return revoked[1];
    }
  }
  return null;
}

function extractTitle(html: string, text: string) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) return stripHtml(h1[1]).slice(0, 200);
  const m = text.match(/INSTRU[CÇ][AÃ]O NORMATIVA MINC N[ºo°]?\s*\d+[^\.]{0,80}/i);
  return m?.[0]?.slice(0, 200) || null;
}

async function resolveCanonicalUrl(): Promise<string> {
  const start = process.env.NORM_SOURCE_URL || DEFAULT_SOURCE_URL;
  try {
    const html = await fetchText(start);
    const successor = findSuccessorUrl(html, start);
    if (successor) return successor;
    return start;
  } catch {
    // Tenta índice de legislação como fallback de descoberta
    try {
      const indexHtml = await fetchText(DEFAULT_LEGISLATION_INDEX_URL);
      const latest = indexHtml.match(
        /href="(https?:\/\/www\.gov\.br\/cultura[^"]*instrucao-normativa-minc-no-\d+[^"]*)"/i,
      );
      if (latest?.[1]) return latest[1];
    } catch {
      /* keep start */
    }
    return start;
  }
}

export async function runNormSync(): Promise<NormSyncResult> {
  const notes: string[] = [];
  const active = await ensureDefaultRuleset();
  const url = await resolveCanonicalUrl();
  const html = await fetchText(url);
  const successor = findSuccessorUrl(html, url);
  const finalUrl = successor || url;
  const finalHtml = successor ? await fetchText(successor) : html;
  const rawText = stripHtml(finalHtml);
  const contentHash = hashText(rawText);
  const title = extractTitle(finalHtml, rawText);
  const fetchedAt = new Date();

  const last = await prisma.normDocumentSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
  });

  const changed = !last || last.contentHash !== contentHash;

  await prisma.normDocumentSnapshot.create({
    data: {
      url: finalUrl,
      title,
      contentHash,
      rawText: rawText.slice(0, 500_000),
      fetchedAt,
      changed,
      notes: changed ? "Conteúdo diferente do snapshot anterior" : "Sem alteração",
    },
  });

  if (!changed) {
    return {
      fetchedAt: fetchedAt.toISOString(),
      url: finalUrl,
      title,
      contentHash,
      changed: false,
      action: "noop",
      sourceCode: active.sourceCode,
      notes: ["Texto oficial inalterado"],
    };
  }

  const extracted = extractCapsFromNormText(rawText);
  notes.push(...extracted.notes);

  const sourceCode = extracted.sourceCode || active.sourceCode;
  const version =
    extracted.versionHint ||
    `in-minc-sync-${fetchedAt.toISOString().slice(0, 10).replace(/-/g, "")}`;

  if (extracted.confidence === "high") {
    if (capsEqual(extracted.caps, active.caps)) {
      return {
        fetchedAt: fetchedAt.toISOString(),
        url: finalUrl,
        title,
        contentHash,
        changed: true,
        action: "unchanged-caps",
        sourceCode,
        notes: [...notes, "Documento mudou, mas tetos extraídos permanecem iguais"],
      };
    }

    await prisma.complianceRuleset.updateMany({
      where: { status: "active" },
      data: { status: "superseded" },
    });

    const created = await prisma.complianceRuleset.create({
      data: {
        version,
        sourceCode,
        sourceUrl: finalUrl,
        effectiveFrom: fetchedAt,
        caps: extracted.caps as ComplianceCaps,
        contentHash,
        status: "active",
        needsReview: false,
        notes: `Ativado automaticamente pelo norm-sync. ${notes.join(" · ")}`,
      },
    });

    return {
      fetchedAt: fetchedAt.toISOString(),
      url: finalUrl,
      title,
      contentHash,
      changed: true,
      action: "activated",
      sourceCode,
      notes,
      rulesetId: created.id,
    };
  }

  const draft = await prisma.complianceRuleset.create({
    data: {
      version,
      sourceCode,
      sourceUrl: finalUrl,
      effectiveFrom: fetchedAt,
      caps: extracted.caps as ComplianceCaps,
      contentHash,
      status: "draft",
      needsReview: true,
      notes: `Draft — extração com baixa confiança. ${notes.join(" · ")}`,
    },
  });

  return {
    fetchedAt: fetchedAt.toISOString(),
    url: finalUrl,
    title,
    contentHash,
    changed: true,
    action: "draft",
    sourceCode,
    notes: [...notes, "Revisão humana recomendada antes de ativar"],
    rulesetId: draft.id,
  };
}
