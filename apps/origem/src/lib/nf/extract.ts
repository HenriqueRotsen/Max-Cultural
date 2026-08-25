/**
 * Extração de NF (estilo Suply): XML NF-e, texto DANFSe/heurística, Ollama opcional.
 */

export type ExtractedItem = {
  name: string;
  category?: string | null;
  price?: number | null;
  quantity?: number | null;
};

export type ExtractedNf = {
  cnpj?: string | null;
  supplierName?: string | null;
  tradeName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  hiredAt?: string | null;
  location?: string | null;
  serviceDescription?: string | null;
  pronac?: string | null;
  items: ExtractedItem[];
  totalPrice?: number | null;
  notes?: string | null;
};

function digits(v: string) {
  return v.replace(/\D/g, "");
}

function pickPronac(text: string): string | null {
  const m =
    text.match(/PRONAC[:\s]*([0-9]{4,8})/i) ||
    text.match(/Pronac[:\s]*([0-9]{4,8})/) ||
    text.match(/\b([0-9]{6,7})\b/);
  return m?.[1] || null;
}

function pickMoney(text: string): number | null {
  const m = text.match(
    /(?:valor\s*(?:total|l[ií]quido|da\s*nfs-?e)?|total)[^\d]{0,20}R\$\s*([\d.]+,\d{2})/i,
  );
  if (!m?.[1]) {
    const m2 = text.match(/R\$\s*([\d.]+,\d{2})/);
    if (!m2?.[1]) return null;
    return Number(m2[1].replace(/\./g, "").replace(",", "."));
  }
  return Number(m[1].replace(/\./g, "").replace(",", "."));
}

function pickCnpj(text: string): string | null {
  const m = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  return m ? digits(m[0]) : null;
}

function pickDate(text: string): string | null {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function heuristicFromText(text: string): ExtractedNf {
  const cnpj = pickCnpj(text);
  const totalPrice = pickMoney(text);
  const hiredAt = pickDate(text);
  const pronac = pickPronac(text);
  const desc =
    text.match(/Descri[cç][aã]o\s+do\s+[Ss]ervi[cç]o[:\s]*([\s\S]{10,400})/i)?.[1]?.trim() ||
    null;
  const nameMatch =
    text.match(/Nome\s*(?:Empresarial)?[:\s]*([^\n]{3,120})/i) ||
    text.match(/Raz[aã]o\s+Social[:\s]*([^\n]{3,120})/i);
  const supplierName = nameMatch?.[1]?.trim() || null;
  const items: ExtractedItem[] = desc
    ? [{ name: desc.slice(0, 200), price: totalPrice, quantity: 1 }]
    : totalPrice
      ? [{ name: "Serviço", price: totalPrice, quantity: 1 }]
      : [];

  return {
    cnpj,
    supplierName,
    serviceDescription: desc,
    pronac,
    hiredAt,
    totalPrice,
    items,
    notes: "extraído por heurística",
  };
}

function parseNfeXml(xml: string): ExtractedNf | null {
  if (!/<nfeProc|<NFe[\s>]/i.test(xml)) return null;
  const cnpj = xml.match(/<emit>[\s\S]*?<CNPJ>(\d+)<\/CNPJ>/i)?.[1] || null;
  const supplierName =
    xml.match(/<emit>[\s\S]*?<xNome>([^<]+)<\/xNome>/i)?.[1] || null;
  const tradeName =
    xml.match(/<emit>[\s\S]*?<xFant>([^<]+)<\/xFant>/i)?.[1] || null;
  const total =
    xml.match(/<ICMSTot>[\s\S]*?<vNF>([^<]+)<\/vNF>/i)?.[1] ||
    xml.match(/<vNF>([^<]+)<\/vNF>/i)?.[1];
  const dh =
    xml.match(/<dhEmi>([^<]+)<\/dhEmi>/i)?.[1] ||
    xml.match(/<dEmi>([^<]+)<\/dEmi>/i)?.[1];
  const items: ExtractedItem[] = [];
  const prodRe = /<det[\s\S]*?<xProd>([^<]+)<\/xProd>[\s\S]*?<vProd>([^<]+)<\/vProd>/gi;
  let m: RegExpExecArray | null;
  while ((m = prodRe.exec(xml))) {
    items.push({
      name: m[1]!,
      price: Number(m[2]),
      quantity: 1,
    });
  }
  const hiredAt = dh ? dh.slice(0, 10) : null;
  return {
    cnpj,
    supplierName,
    tradeName,
    totalPrice: total ? Number(total) : null,
    hiredAt,
    serviceDescription: items[0]?.name || null,
    pronac: pickPronac(xml),
    items,
    notes: "NF-e XML",
  };
}

async function extractWithOllama(text: string): Promise<ExtractedNf | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL || "llama3.2";
  try {
    const prompt = `Extraia JSON de nota fiscal brasileira. Campos: cnpj, supplierName, tradeName, hiredAt (YYYY-MM-DD), serviceDescription, pronac, totalPrice, items[{name,price,quantity}]. Texto:\n${text.slice(0, 12000)}`;
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    const match = data.response?.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as ExtractedNf;
    return {
      ...parsed,
      cnpj: parsed.cnpj ? digits(String(parsed.cnpj)) : null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      notes: "ollama",
    };
  } catch {
    return null;
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse v2 API (PDFParse) — fallback para require legado
    const mod = await import("pdf-parse").catch(() => null);
    if (!mod) return "";
    const PDFParse = (mod as { PDFParse?: new (o: { data: Buffer }) => { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> } }).PDFParse;
    if (PDFParse) {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text?.trim() || "";
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    }
    const fn = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default;
    if (typeof fn === "function") {
      const r = await fn(buffer);
      return r.text?.trim() || "";
    }
  } catch {
    return "";
  }
  return "";
}

export async function extractNfFromBuffer(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<ExtractedNf> {
  const isXml =
    params.mimeType.includes("xml") || /\.xml$/i.test(params.filename);
  if (isXml) {
    const xml = params.buffer.toString("utf8");
    return parseNfeXml(xml) || heuristicFromText(xml);
  }

  let text = "";
  if (params.mimeType.includes("pdf") || /\.pdf$/i.test(params.filename)) {
    text = await extractPdfText(params.buffer);
    if (!text) {
      return {
        items: [],
        notes: "PDF sem texto extraível",
      };
    }
  } else {
    text = params.buffer.toString("utf8");
  }

  const ollama = await extractWithOllama(text);
  if (ollama?.cnpj || ollama?.supplierName || ollama?.totalPrice) {
    return {
      ...ollama,
      pronac: ollama.pronac || pickPronac(text),
      serviceDescription:
        ollama.serviceDescription ||
        ollama.items?.[0]?.name ||
        null,
    };
  }
  return heuristicFromText(text);
}
