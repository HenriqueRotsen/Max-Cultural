"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, FileText, ImagePlus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { atualizarArquivoAction, moverArquivoAction, removerArquivoAction } from "@/app/actions/prestacao";
import { comprimirFoto } from "@/lib/prestacao/comprimir";
import { CATEGORIA_LABEL, CATEGORIAS_DOC, CATEGORIAS_FOTO, type ArquivoDTO, type FichaDTO } from "@/lib/prestacao/types";
import { useConfirm } from "@/components/ui/confirm";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

async function enviar(form: FormData): Promise<string | null> {
  const r = await fetch("/api/prestacao/arquivos", { method: "POST", body: form });
  if (r.ok) return null;
  const j = (await r.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? `Falha no envio (${r.status}).`;
}

/** Fotos (com categoria e descrição, que vira a legenda no relatório) e documentos da ficha. */
export function FotosDocumentos({ ficha }: { ficha: FichaDTO }) {
  const router = useRouter();
  const pode = ficha.pode.PRODUCAO || ficha.pode.COMUNICACAO || ficha.pode.GESTAO;
  const [categoriaFoto, setCategoriaFoto] = useState<string>("comprovacao");
  const [categoriaDoc, setCategoriaDoc] = useState<string>("presenca");
  const [enviando, setEnviando] = useState<string | null>(null);
  const fotosRef = useRef<HTMLInputElement>(null);
  const docsRef = useRef<HTMLInputElement>(null);
  const fotos = ficha.arquivos.filter((a) => a.tipo === "FOTO");
  const docs = ficha.arquivos.filter((a) => a.tipo === "DOCUMENTO");

  async function enviarFotos(lista: FileList | null) {
    if (!lista?.length) return;
    const arquivos = [...lista];
    let ok = 0;
    for (const [i, f] of arquivos.entries()) {
      setEnviando(`Enviando foto ${i + 1} de ${arquivos.length}…`);
      try {
        const c = await comprimirFoto(f);
        const form = new FormData();
        form.set("agendaId", ficha.agendaId);
        form.set("tipo", "FOTO");
        form.set("categoria", categoriaFoto);
        form.set("largura", String(c.largura));
        form.set("altura", String(c.altura));
        form.set("arquivo", new File([c.blob], c.nome, { type: "image/jpeg" }));
        const erro = await enviar(form);
        if (erro) toast.error(`${f.name}: ${erro}`);
        else ok += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    }
    setEnviando(null);
    if (fotosRef.current) fotosRef.current.value = "";
    if (ok) toast.success(`${ok} foto(s) enviada(s). Escreva a descrição de cada uma.`);
    router.refresh();
  }

  async function enviarDocs(lista: FileList | null) {
    if (!lista?.length) return;
    let ok = 0;
    for (const f of [...lista]) {
      setEnviando(`Enviando ${f.name}…`);
      const form = new FormData();
      form.set("agendaId", ficha.agendaId);
      form.set("tipo", "DOCUMENTO");
      form.set("categoria", categoriaDoc);
      form.set("arquivo", f);
      const erro = await enviar(form);
      if (erro) toast.error(`${f.name}: ${erro}`);
      else ok += 1;
    }
    setEnviando(null);
    if (docsRef.current) docsRef.current.value = "";
    if (ok) toast.success(`${ok} documento(s) enviado(s).`);
    router.refresh();
  }

  const porCategoria = CATEGORIAS_FOTO.map((c) => ({
    ...c,
    itens: fotos.filter((f) => f.categoria === c.value).sort((a, b) => a.ordem - b.ordem),
  })).filter((c) => c.itens.length);

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand-deep">Fotos e documentos</h2>
        <p className="text-sm text-muted-foreground">
          Todas as equipes enviam aqui. As fotos entram no relatório agrupadas pela categoria, com a descrição como
          legenda (são comprimidas no envio, ≈ 300 KB cada). Os documentos em PDF, até 4 MB (lista de presença,
          certificados, release, clipping, relatórios de redes e de mídia paga, apostila), entram como anexos.
        </p>
      </div>

      {pode ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-dashed border-brand/30 bg-brand-mist/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fotos</div>
            <SimpleSelect
              value={categoriaFoto}
              onChange={setCategoriaFoto}
              className="h-9 w-full"
              aria-label="Categoria das fotos"
              options={CATEGORIAS_FOTO.map((c) => ({ value: c.value, label: c.label }))}
            />
            <input
              ref={fotosRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => void enviarFotos(e.target.files)}
            />
            <Button variant="outline" className="w-full" disabled={Boolean(enviando)} onClick={() => fotosRef.current?.click()}>
              <ImagePlus className="size-4" /> Escolher fotos
            </Button>
          </div>
          <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documentos (PDF)</div>
            <SimpleSelect
              value={categoriaDoc}
              onChange={setCategoriaDoc}
              className="h-9 w-full"
              aria-label="Categoria dos documentos"
              options={CATEGORIAS_DOC.map((c) => ({ value: c.value, label: c.label }))}
            />
            <input
              ref={docsRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => void enviarDocs(e.target.files)}
            />
            <Button variant="outline" className="w-full" disabled={Boolean(enviando)} onClick={() => docsRef.current?.click()}>
              <Upload className="size-4" /> Escolher PDFs
            </Button>
          </div>
        </div>
      ) : null}
      {enviando ? <p className="text-sm font-medium text-teal-800">{enviando}</p> : null}

      {porCategoria.length ? (
        <div className="space-y-4">
          {porCategoria.map((c) => (
            <div key={c.value} className="space-y-2">
              <h3 className="text-sm font-semibold text-brand-deep">
                {c.label} <span className="font-normal text-muted-foreground">· {c.itens.length}</span>
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {c.itens.map((f, i) => (
                  <FotoCard key={f.id} foto={f} pode={pode} primeira={i === 0} ultima={i === c.itens.length - 1} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma foto ainda.
        </p>
      )}

      {docs.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-brand-deep">Documentos</h3>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
            {docs.map((d) => (
              <DocLinha key={d.id} doc={d} pode={pode} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FotoCard({ foto, pode, primeira, ultima }: { foto: ArquivoDTO; pode: boolean; primeira: boolean; ultima: boolean }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [pending, startTransition] = useTransition();
  const [descricao, setDescricao] = useState(foto.descricao);

  function salvar(patch: Partial<{ categoria: string; descricao: string; noRelatorio: boolean }>) {
    startTransition(async () => {
      const r = await atualizarArquivoAction(foto.id, {
        categoria: patch.categoria ?? foto.categoria,
        descricao: patch.descricao ?? descricao,
        noRelatorio: patch.noRelatorio ?? foto.noRelatorio,
      });
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border/70 bg-white", !foto.noRelatorio && "opacity-60")}>
      <a href={foto.url} target="_blank" rel="noreferrer" className="block bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element -- rota protegida, sem otimização do Next */}
        <img src={foto.url} alt={foto.descricao || foto.nomeOriginal} className="aspect-[4/3] w-full object-cover" loading="lazy" />
      </a>
      <div className="space-y-2 p-2.5">
        <Textarea
          rows={2}
          value={descricao}
          disabled={!pode}
          placeholder="Descrição (legenda no relatório)"
          onChange={(e) => setDescricao(e.target.value)}
          onBlur={() => descricao !== foto.descricao && salvar({ descricao })}
          className="text-sm"
          aria-label="Descrição da foto"
        />
        {!foto.descricao && !descricao ? <p className="text-[11px] text-amber-800">Falta a descrição.</p> : null}
        {pode ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SimpleSelect
              value={foto.categoria}
              onChange={(categoria) => salvar({ categoria })}
              size="sm"
              className="h-7 max-w-[11rem] text-xs"
              aria-label="Categoria"
              options={CATEGORIAS_FOTO.map((c) => ({ value: c.value, label: c.label }))}
            />
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label="Antes" disabled={pending || primeira} onClick={() => startTransition(async () => { await moverArquivoAction(foto.id, -1); router.refresh(); })}>
                <ArrowLeft className="size-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Depois" disabled={pending || ultima} onClick={() => startTransition(async () => { await moverArquivoAction(foto.id, 1); router.refresh(); })}>
                <ArrowRight className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remover foto"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirmar({
                    title: "Remover esta foto?",
                    description: "Ela sai da ficha e do relatório. Essa ação não pode ser desfeita.",
                    destructive: true,
                    preview: (
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- rota protegida */}
                        <img src={foto.url} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0 text-sm">
                          <div className="font-medium text-brand-deep">{CATEGORIA_LABEL[foto.categoria]}</div>
                          <div className="line-clamp-2 text-muted-foreground">{foto.descricao || "Sem descrição"}</div>
                        </div>
                      </div>
                    ),
                  });
                  if (!ok) return;
                  startTransition(async () => {
                    const r = await removerArquivoAction(foto.id);
                    if (!r.ok) return void toast.error(r.error);
                    router.refresh();
                  });
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{CATEGORIA_LABEL[foto.categoria]}</div>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5"
            checked={foto.noRelatorio}
            disabled={!pode || pending}
            onChange={(e) => salvar({ noRelatorio: e.target.checked })}
          />
          Entra no relatório
        </label>
      </div>
    </div>
  );
}

function DocLinha({ doc, pode }: { doc: ArquivoDTO; pode: boolean }) {
  const router = useRouter();
  const confirmar = useConfirm();
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <a href={doc.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-2 text-brand-deep hover:underline">
        <FileText className="size-4 shrink-0" />
        <span className="truncate">{doc.nomeOriginal}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          · {CATEGORIA_LABEL[doc.categoria]} · {kb(doc.tamanho)}
        </span>
      </a>
      {pode ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remover documento"
          disabled={pending}
          onClick={async () => {
            const ok = await confirmar({
              title: "Remover este documento?",
              description: "Ele sai da ficha e dos anexos do relatório. Essa ação não pode ser desfeita.",
              destructive: true,
              preview: (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="size-5 shrink-0 text-brand-deep" />
                  <span className="min-w-0 truncate font-medium text-brand-deep">{doc.nomeOriginal}</span>
                  <span className="shrink-0 text-muted-foreground">· {kb(doc.tamanho)}</span>
                </div>
              ),
            });
            if (!ok) return;
            startTransition(async () => {
              const r = await removerArquivoAction(doc.id);
              if (!r.ok) return void toast.error(r.error);
              router.refresh();
            });
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}
