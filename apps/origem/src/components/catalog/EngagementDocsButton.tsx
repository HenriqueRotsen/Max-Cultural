"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { linkEngagementDocument, type ActionState } from "@/lib/planning/actions";

export type EngagementDocItem = {
  id: string;
  kind: "NF" | "PAYMENT_PROOF" | "TAX_PROOF" | string;
  filename: string;
  mimeType: string;
};

const initial: ActionState = {};

function kindLabel(kind: string) {
  if (kind === "NF") return "Nota fiscal";
  if (kind === "PAYMENT_PROOF") return "Comprovante";
  if (kind === "TAX_PROOF") return "Comprovante fiscal";
  return kind;
}

function canPreview(mime: string, filename: string) {
  const m = mime.toLowerCase();
  const f = filename.toLowerCase();
  return (
    m.includes("pdf") ||
    f.endsWith(".pdf") ||
    m.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp)$/i.test(f)
  );
}

function isXml(mime: string, filename: string) {
  const m = mime.toLowerCase();
  const f = filename.toLowerCase();
  return m.includes("xml") || f.endsWith(".xml");
}

function isImage(mime: string, filename: string) {
  const m = mime.toLowerCase();
  const f = filename.toLowerCase();
  return m.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f);
}

function previewMime(doc: EngagementDocItem) {
  if (doc.filename.toLowerCase().endsWith(".pdf")) return "application/pdf";
  if (isImage(doc.mimeType, doc.filename)) {
    const f = doc.filename.toLowerCase();
    if (f.endsWith(".png")) return "image/png";
    if (f.endsWith(".webp")) return "image/webp";
    if (f.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
  }
  return doc.mimeType || "application/octet-stream";
}

function isPdf(mime: string, filename: string) {
  const m = mime.toLowerCase();
  const f = filename.toLowerCase();
  return m.includes("pdf") || f.endsWith(".pdf");
}

/** Chrome/Edge: sem barra lateral, zoom na largura da página. */
function pdfEmbedSrc(url: string) {
  return `${url}#navpanes=0&view=FitH&zoom=page-width`;
}

function DocumentPreview({ doc }: { doc: EngagementDocItem }) {
  const previewUrl = `/api/planning/documents/${doc.id}`;
  const downloadUrl = `${previewUrl}?download=1`;
  const pdfOrImage = canPreview(doc.mimeType, doc.filename);
  const pdf = isPdf(doc.mimeType, doc.filename);
  const xml = isXml(doc.mimeType, doc.filename);
  const image = isImage(doc.mimeType, doc.filename);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [xmlText, setXmlText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setBlobUrl(null);
    setXmlText(null);

    fetch(previewUrl, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(body || `Erro ${res.status} ao carregar o documento.`);
        }
        if (xml) return res.text();
        return res.blob();
      })
      .then((payload) => {
        if (typeof payload === "string") {
          setXmlText(payload.slice(0, 120_000));
          return;
        }
        const typed =
          payload.type && payload.type !== "application/octet-stream"
            ? payload
            : new Blob([payload], { type: previewMime(doc) });
        objectUrl = URL.createObjectURL(typed);
        setBlobUrl(objectUrl);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Não foi possível carregar.");
      })
      .finally(() => setLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id, previewUrl, xml, doc]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-[var(--navy)]">
          {kindLabel(doc.kind)} · {doc.filename}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={pdf ? pdfEmbedSrc(previewUrl) : previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost text-xs"
          >
            Abrir em nova aba
          </a>
          <a href={downloadUrl} className="btn btn-ghost text-xs">
            Baixar
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1">
      {loading ? (
        <div className="flex h-full min-h-[72vh] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--gray-50)]">
          <p className="text-sm text-[var(--gray-500)]">Carregando documento…</p>
        </div>
      ) : error ? (
        <div className="flex h-full min-h-[72vh] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--gray-50)] p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <a href={downloadUrl} className="btn">
            Baixar arquivo
          </a>
        </div>
      ) : xml && xmlText != null ? (
        <div className="h-full min-h-[72vh] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--gray-50)] p-3">
          <pre className="whitespace-pre-wrap break-all text-xs text-[var(--navy)]">{xmlText}</pre>
        </div>
      ) : pdfOrImage && blobUrl ? (
        image ? (
          <div className="flex h-full min-h-[72vh] items-center justify-center overflow-auto rounded-xl border border-[var(--border)] bg-[var(--gray-50)] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blobUrl} alt={doc.filename} className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <iframe
            title={doc.filename}
            src={pdfEmbedSrc(blobUrl)}
            className="h-full min-h-[72vh] w-full rounded-xl border border-[var(--border)] bg-[var(--gray-50)]"
          />
        )
      ) : (
        <div className="flex h-full min-h-[72vh] flex-col items-center justify-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--gray-50)] p-6 text-center">
          <p className="text-sm text-[var(--gray-500)]">
            Pré-visualização indisponível para este formato.
          </p>
          <a href={downloadUrl} className="btn">
            Baixar arquivo
          </a>
        </div>
      )}
      </div>
    </div>
  );
}

function DocChip({
  ok,
  label,
  missing,
}: {
  ok: boolean;
  label: string;
  missing?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        ok
          ? "bg-emerald-50 text-emerald-800"
          : missing
            ? "bg-amber-50 text-amber-800"
            : "bg-[var(--gray-100)] text-[var(--gray-500)]"
      }`}
    >
      <span aria-hidden>{ok ? "●" : "○"}</span>
      {label}
    </span>
  );
}

function LinkForm({
  engagementId,
  kind,
  label,
  onDone,
}: {
  engagementId: string;
  kind: "NF" | "PAYMENT_PROOF";
  label: string;
  onDone: () => void;
}) {
  const action = linkEngagementDocument.bind(null, engagementId);
  const [state, formAction, pending] = useActionState(action, initial);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once on success
  }, [state.ok]);

  const accept = kind === "NF" ? ".pdf,.xml,application/pdf,text/xml" : ".pdf,image/*";
  const hint = kind === "NF" ? "PDF ou XML" : "PDF ou imagem";

  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--gray-50)] p-3">
      <input type="hidden" name="kind" value={kind} />
      <p className="text-xs font-semibold text-[var(--navy)]">{label}</p>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-700">Arquivo vinculado.</p> : null}

      <label className="btn btn-ghost w-full cursor-pointer gap-2 border border-[var(--border)] bg-white py-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 16V4m0 0 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{fileName ? "Trocar arquivo" : "Escolher arquivo"}</span>
        <input
          name="docFile"
          type="file"
          accept={accept}
          required
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        />
      </label>

      {fileName ? (
        <p className="truncate text-xs text-[var(--gray-500)]" title={fileName}>
          {fileName}
        </p>
      ) : (
        <p className="text-xs text-[var(--gray-400)]">{hint}</p>
      )}

      <button type="submit" className="btn w-full" disabled={pending || !fileName}>
        {pending ? "Enviando…" : "Vincular"}
      </button>
    </form>
  );
}

export function EngagementDocsButton({
  engagementId,
  serviceName,
  documents,
}: {
  engagementId: string;
  serviceName: string;
  documents: EngagementDocItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const nfs = useMemo(() => documents.filter((d) => d.kind === "NF"), [documents]);
  const proofs = useMemo(
    () => documents.filter((d) => d.kind === "PAYMENT_PROOF" || d.kind === "TAX_PROOF"),
    [documents],
  );
  const hasNf = nfs.length > 0;
  const hasProof = proofs.length > 0;
  const all = useMemo(() => [...nfs, ...proofs], [nfs, proofs]);

  useEffect(() => {
    if (!open) return;
    setSelectedId((prev) => {
      if (prev && all.some((d) => d.id === prev)) return prev;
      return all[0]?.id ?? null;
    });
  }, [open, all]);

  const selected = all.find((d) => d.id === selectedId) || null;

  function afterLink() {
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-2.5 py-1.5 text-left shadow-sm transition hover:border-[var(--navy)] hover:bg-[var(--navy-soft)]"
        title="Notas fiscais e comprovantes"
        aria-label="Documentos da contratação"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{
            background: hasNf && hasProof ? "#059669" : "#d97706",
          }}
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-6Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="hidden min-w-0 flex-col sm:flex">
          <span className="text-[11px] font-semibold text-[var(--navy)]">Docs</span>
          <span className="flex gap-1">
            <DocChip ok={hasNf} label="NF" missing={!hasNf} />
            <DocChip ok={hasProof} label="Pgto" missing={!hasProof} />
          </span>
        </span>
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 sm:p-3"
              role="presentation"
              onClick={() => setOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Documentos da contratação"
                className="flex h-[min(96vh,960px)] w-[min(98vw,1440px)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--navy)]">
                      Documentos · {serviceName}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <DocChip ok={hasNf} label="NF" missing={!hasNf} />
                      <DocChip ok={hasProof} label="Comprovante" missing={!hasProof} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-white text-[var(--gray-500)] transition hover:border-[var(--navy)] hover:bg-[var(--gray-50)] hover:text-[var(--navy)]"
                    onClick={() => setOpen(false)}
                    aria-label="Fechar"
                  >
                    <span aria-hidden className="text-lg leading-none">
                      ×
                    </span>
                  </button>
                </div>

                <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[240px_1fr]">
                  <aside className="max-h-[40vh] space-y-3 overflow-y-auto border-b border-[var(--border)] p-3 lg:max-h-none lg:border-b-0 lg:border-r">
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                        Arquivos
                      </p>
                      {all.length === 0 ? (
                        <p className="text-xs text-[var(--gray-500)]">Nenhum documento ainda.</p>
                      ) : (
                        <ul className="space-y-1">
                          {all.map((d) => (
                            <li key={d.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedId(d.id)}
                                className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                                  selectedId === d.id
                                    ? "bg-[var(--navy-soft)] font-semibold text-[var(--navy)]"
                                    : "text-[var(--gray-600)] hover:bg-[var(--gray-50)]"
                                }`}
                              >
                                <span className="block truncate">{kindLabel(d.kind)}</span>
                                <span className="block truncate opacity-70">{d.filename}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {(!hasNf || !hasProof) && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--gray-400)]">
                          Vincular
                        </p>
                        {!hasNf ? (
                          <LinkForm
                            engagementId={engagementId}
                            kind="NF"
                            label="Vincular nota fiscal"
                            onDone={afterLink}
                          />
                        ) : null}
                        {!hasProof ? (
                          <LinkForm
                            engagementId={engagementId}
                            kind="PAYMENT_PROOF"
                            label="Vincular comprovante de pagamento"
                            onDone={afterLink}
                          />
                        ) : null}
                      </div>
                    )}
                  </aside>

                  <div className="flex min-h-0 flex-1 flex-col p-4">
                    {selected ? (
                      <DocumentPreview doc={selected} />
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--gray-50)] p-6 text-center">
                        <p className="text-sm text-[var(--gray-500)]">
                          Vincule a NF e o comprovante para visualizar aqui.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
