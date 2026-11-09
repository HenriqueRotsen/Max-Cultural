"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { SimpleSelect } from "@/components/ui/simple-select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { salvarFichaEquipeAction } from "@/app/actions/prestacao";
import {
  enderecoLabel,
  EQUIPES,
  formatarNumero,
  minutosEmHoras,
  sugerir,
  type Endereco,
  type EquipePrestacao,
  type Sugestao,
} from "@/lib/prestacao/regras";
import { EnderecoInput, NumeroInput, PessoasInput } from "@/components/prestacao/campos-inteligentes";
import { EQUIPE_LABEL, type CampoDTO, type FichaDTO } from "@/lib/prestacao/types";
import { BarraEquipe } from "@/components/prestacao/progresso";
import { FotosDocumentos } from "@/components/prestacao/fotos-documentos";

function fmtDia(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type Entrada = Record<string, { v: string; na: boolean }>;

export function FichaView({ ficha }: { ficha: FichaDTO }) {
  const s = ficha.sistema;
  const periodo = s.dataFim !== s.dataInicio ? `${fmtDia(s.dataInicio)} a ${fmtDia(s.dataFim)}` : fmtDia(s.dataInicio);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/dashboard/prestacao/${encodeURIComponent(ficha.projetoId)}`}
          className="text-xs text-muted-foreground hover:text-brand-deep"
        >
          ← {ficha.projetoNome}
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-brand-deep">{s.acao}</h1>
        <p className="text-sm text-muted-foreground">
          {s.tipoAcao} · {periodo} · {s.local}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {EQUIPES.map((e) => (
          <div key={e} className="rounded-2xl border border-border/70 bg-white p-3 shadow-sm">
            <BarraEquipe equipe={e} pct={ficha.progresso[e].pct} />
          </div>
        ))}
      </div>

      <DoSistema ficha={ficha} />

      <FotosDocumentos ficha={ficha} />

      {EQUIPES.map((e) => (
        <ParteEquipe key={e} ficha={ficha} equipe={e} />
      ))}
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className="truncate text-sm text-foreground" title={String(valor)}>
        {valor === "" ? "—" : valor}
      </div>
    </div>
  );
}

/** Dados do projeto, da ação, da agenda e das inscrições: só leitura (corrige-se na origem). */
function DoSistema({ ficha }: { ficha: FichaDTO }) {
  const s = ficha.sistema;
  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand-deep">Do sistema</h2>
        <p className="text-sm text-muted-foreground">
          Vem do cadastro do projeto, da ação, da agenda e das inscrições. Para mudar, altere lá.
        </p>
      </div>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <Item rotulo="Ano" valor={s.ano} />
        <Item rotulo="Proponente" valor={s.proponente} />
        <Item rotulo="Identificação" valor={s.identificacao} />
        <Item rotulo="Tipo de ação" valor={s.tipoAcao} />
        <Item rotulo="Local" valor={s.local} />
        <Item rotulo="Cidade/Estado" valor={s.cidadeUf} />
        <Item rotulo="Mês" valor={s.meses} />
        <Item rotulo="Quantidade de meses" valor={s.quantidadeMeses} />
        <div className="min-w-0 sm:col-span-2 lg:col-span-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Produto do projeto</div>
          <div className="text-sm text-foreground">
            {ficha.produtoNome ?? (
              <span className="text-muted-foreground">
                Esta ação ainda não está em nenhum produto.{" "}
                <Link
                  href={`/dashboard/prestacao/${encodeURIComponent(ficha.projetoId)}?aba=produtos`}
                  className="font-medium text-teal-800 hover:underline"
                >
                  Definir em Produtos e metas
                </Link>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Números das inscrições</div>
          {s.numerosDaAcaoToda ? (
            <span className="text-xs text-muted-foreground">A ação tem mais de uma execução: os números são da ação toda.</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {s.numeros.map((n) => (
            <div key={n.chave}>
              <div className="text-xs text-muted-foreground">{n.rotulo}</div>
              <div className="text-lg font-semibold tabular-nums text-brand-deep">{formatarNumero(n.valor)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const diaDe = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Valor do campo como o formulário guarda (texto; várias opções em JSON). */
function paraEntrada(v: unknown): string {
  if (Array.isArray(v) || (v && typeof v === "object")) return JSON.stringify(v);
  return v != null ? String(v) : "";
}

function textoSugestao(campo: CampoDTO, valor: Sugestao["valor"]): string {
  if (Array.isArray(valor)) return valor.join(", ");
  if (valor && typeof valor === "object") return enderecoLabel(valor);
  if (campo.chave === "carga_horaria_min" && typeof valor === "number") return `${valor} min (${minutosEmHoras(valor)})`;
  return String(valor);
}

function ParteEquipe({ ficha, equipe }: { ficha: FichaDTO; equipe: EquipePrestacao }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const campos = ficha.campos.filter((c) => c.equipe === equipe);
  const [entrada, setEntrada] = useState<Entrada>(() =>
    Object.fromEntries(
      campos.map((c) => {
        const v = ficha.valores[c.chave];
        return [c.chave, { v: paraEntrada(v?.v), na: Boolean(v?.na) }];
      }),
    ),
  );
  const pode = ficha.pode[equipe];
  const prog = ficha.progresso[equipe];

  // Horário preenchido nesta ficha (de qualquer parte) para a carga horária.
  const campoHorario = ficha.campos.find((c) => c.tipo === "HORARIO");
  const horario = (campoHorario && (entrada[campoHorario.chave]?.v ?? paraEntrada(ficha.valores[campoHorario.chave]?.v))) || "";
  const ctx = ficha.sugestoes;
  const sugestoes = new Map(
    campos.map((c) => [
      c.chave,
      sugerir(c, {
        hoje: diaDe(ctx.hoje),
        inicio: diaDe(ctx.inicio),
        fim: ctx.fim ? diaDe(ctx.fim) : null,
        participantes: ctx.participantes,
        responsaveis: ctx.responsaveis,
        historico: ctx.historico[c.chave] ?? [],
        perfil: ctx.perfil,
        horario,
        locais: ctx.locais[c.chave] ?? [],
        cidade: ctx.cidade,
        uf: ctx.uf,
      }),
    ]),
  );
  if (!campos.length) return null;

  const set = (chave: string, patch: Partial<{ v: string; na: boolean }>) =>
    setEntrada((e) => ({ ...e, [chave]: { ...e[chave]!, ...patch } }));
  const vazio = (chave: string) => {
    const e = entrada[chave];
    return !e || (!e.na && (e.v.trim() === "" || e.v === "[]" || e.v === "{}"));
  };
  const aplicaveis = campos.filter((c) => vazio(c.chave) && sugestoes.get(c.chave));

  function usarTodas() {
    setEntrada((e) => {
      const n = { ...e };
      for (const c of aplicaveis) n[c.chave] = { v: paraEntrada(sugestoes.get(c.chave)!.valor), na: false };
      return n;
    });
    toast.success(`${aplicaveis.length} sugestão(ões) aplicada(s). Confira e salve.`);
  }

  function salvar() {
    startTransition(async () => {
      const r = await salvarFichaEquipeAction(ficha.agendaId, equipe, entrada);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Parte da ${EQUIPE_LABEL[equipe]} salva`);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-brand-deep">{EQUIPE_LABEL[equipe]}</h2>
          <p className="text-sm text-muted-foreground">
            {pode
              ? `Equipe de ${EQUIPE_LABEL[equipe]} preenche. Ligue "Não se aplica" quando o campo não fizer sentido nesta ação.`
              : `Só consulta: quem preenche é a equipe de ${EQUIPE_LABEL[equipe]}.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pode && aplicaveis.length ? (
            <Button variant="outline" size="sm" onClick={usarTodas}>
              <Sparkles className="size-4 text-amber-500" /> Usar {aplicaveis.length === 1 ? "a sugestão" : `as ${aplicaveis.length} sugestões`}
            </Button>
          ) : null}
          <div className="w-40">
            <BarraEquipe equipe={equipe} pct={prog.pct} compacta />
            {prog.faltando.length ? (
              <div className="mt-0.5 text-right text-[11px] text-amber-800">{prog.faltando.length} em aberto</div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
        {campos.map((c) => (
          <Campo
            key={c.chave}
            campo={c}
            valor={entrada[c.chave]!}
            disabled={!pode}
            sugestao={vazio(c.chave) ? (sugestoes.get(c.chave) ?? null) : null}
            alternativas={sugestoes.get(c.chave)?.alternativas ?? ctx.historico[c.chave] ?? []}
            locais={ctx.locais[c.chave] ?? []}
            onChange={(patch) => set(c.chave, patch)}
          />
        ))}
      </div>

      {pode ? (
        <div className="flex justify-end border-t border-border/60 pt-3">
          <Button disabled={pending} onClick={salvar}>
            Salvar parte da {EQUIPE_LABEL[equipe]}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Várias opções marcáveis (etiquetas). */
function Multipla({
  opcoes,
  valor,
  disabled,
  onChange,
}: {
  opcoes: string[];
  valor: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  let marcadas: string[] = [];
  try {
    const x = JSON.parse(valor || "[]");
    if (Array.isArray(x)) marcadas = x.map(String);
  } catch {
    marcadas = [];
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map((o) => {
        const ativa = marcadas.includes(o);
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            aria-pressed={ativa}
            onClick={() => onChange(JSON.stringify(ativa ? marcadas.filter((x) => x !== o) : [...marcadas, o]))}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50",
              ativa
                ? "border-brand-deep bg-brand-deep text-white"
                : "border-border bg-white text-foreground hover:border-brand/40 hover:bg-brand-mist/40",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Horário de início e fim, guardado como "HH:MM-HH:MM". */
function Horario({ valor, disabled, onChange }: { valor: string; disabled: boolean; onChange: (v: string) => void }) {
  const [ini = "", fim = ""] = valor ? valor.split("-") : [];
  const montar = (a: string, b: string) => onChange(a || b ? `${a}-${b}` : "");
  // Campo de hora nativo: o Input do base-ui não repassa bem a mudança do seletor de hora.
  const estilo =
    "h-9 w-32 rounded-lg border border-input bg-transparent px-2.5 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";
  return (
    <div className="flex items-center gap-2">
      <input type="time" value={ini} disabled={disabled} onChange={(e) => montar(e.target.value, fim)} className={estilo} aria-label="Início" />
      <span className="text-sm text-muted-foreground">às</span>
      <input type="time" value={fim} disabled={disabled} onChange={(e) => montar(ini, e.target.value)} className={estilo} aria-label="Fim" />
    </div>
  );
}

function Campo({
  campo,
  valor,
  disabled,
  sugestao,
  alternativas,
  locais,
  onChange,
}: {
  campo: CampoDTO;
  valor: { v: string; na: boolean };
  disabled: boolean;
  sugestao: Sugestao | null;
  alternativas: string[];
  locais: Endereco[];
  onChange: (patch: Partial<{ v: string; na: boolean }>) => void;
}) {
  const off = disabled || valor.na;
  const largo = ["TEXTO_LONGO", "MULTIPLA", "PESSOAS", "ENDERECO"].includes(campo.tipo);
  const listaId = `sug-${campo.chave}`;
  let controle: React.ReactNode;
  switch (campo.tipo) {
    case "TEXTO_LONGO":
      controle = <Textarea rows={3} value={valor.v} disabled={off} onChange={(e) => onChange({ v: e.target.value })} />;
      break;
    case "DATA":
      controle = <DatePicker value={valor.v} onChange={(v) => onChange({ v })} disabled={off} className="w-52" aria-label={campo.rotulo} />;
      break;
    case "MULTIPLA":
      controle = <Multipla opcoes={campo.opcoes} valor={valor.v} disabled={off} onChange={(v) => onChange({ v })} />;
      break;
    case "HORARIO":
      controle = <Horario valor={valor.v} disabled={off} onChange={(v) => onChange({ v })} />;
      break;
    case "PESSOAS":
      controle = (
        <PessoasInput valor={valor.v} disabled={off} alternativas={alternativas} onChange={(v) => onChange({ v })} ariaLabel={campo.rotulo} />
      );
      break;
    case "ENDERECO":
      controle = <EnderecoInput valor={valor.v} disabled={off} locais={locais} onChange={(v) => onChange({ v })} />;
      break;
    case "OPCOES":
    case "SIM_NAO": {
      const opcoes = campo.tipo === "SIM_NAO" ? ["Sim", "Não"] : campo.opcoes;
      controle = (
        <SimpleSelect
          value={valor.v}
          onChange={(v) => onChange({ v })}
          disabled={off}
          className="h-9 w-full"
          aria-label={campo.rotulo}
          options={[{ value: "", label: "Escolha" }, ...opcoes.map((o) => ({ value: o, label: o }))]}
        />
      );
      break;
    }
    case "LINK":
      controle = (
        <div className="flex gap-2">
          <Input
            value={valor.v}
            disabled={off}
            placeholder={campo.chave === "instagram" ? "https://www.instagram.com/p/…" : "https://…"}
            onChange={(e) => onChange({ v: e.target.value })}
            aria-label={campo.rotulo}
          />
          {/^https?:\/\//i.test(valor.v) && !valor.na ? (
            <a
              href={valor.v}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-xs text-teal-800 hover:bg-muted/40"
            >
              <ExternalLink className="size-3.5" /> Abrir
            </a>
          ) : null}
        </div>
      );
      break;
    case "NUMERO":
      controle = (
        <NumeroInput
          valor={valor.v}
          disabled={off}
          onChange={(v) => onChange({ v })}
          ariaLabel={campo.rotulo}
          sufixo={campo.chave === "carga_horaria_min" ? "minutos" : undefined}
        />
      );
      break;
    default:
      controle = (
        <>
          <Input
            value={valor.v}
            disabled={off}
            onChange={(e) => onChange({ v: e.target.value })}
            aria-label={campo.rotulo}
            list={alternativas.length ? listaId : undefined}
            autoComplete="off"
          />
          {alternativas.length ? (
            <datalist id={listaId}>
              {alternativas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          ) : null}
        </>
      );
  }
  const horas = campo.chave === "carga_horaria_min" && valor.v ? minutosEmHoras(Number(valor.v.replace(/\D/g, ""))) : "";

  return (
    <div className={cn("space-y-1.5", largo && "md:col-span-2")}>
      <div className="flex items-start justify-between gap-2">
        <Label className="leading-snug">
          {campo.rotulo}
          {campo.obrigatorio ? <span className="text-red-600"> *</span> : null}
        </Label>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <Switch
            checked={valor.na}
            disabled={disabled}
            aria-label={`${campo.rotulo}: não se aplica`}
            onCheckedChange={(na) => onChange({ na })}
          />
          Não se aplica
        </label>
      </div>
      {controle}
      {sugestao && !disabled && !valor.na ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50/70 px-2 py-1 text-xs text-amber-900">
          <Sparkles className="size-3.5 shrink-0 text-amber-500" />
          <span>
            Sugestão: <strong className="font-semibold">{textoSugestao(campo, sugestao.valor)}</strong>
            <span className="text-amber-800/80"> · {sugestao.motivo}</span>
          </span>
          <button
            type="button"
            className="font-semibold text-teal-800 underline-offset-2 hover:underline"
            onClick={() => onChange({ v: paraEntrada(sugestao.valor) })}
          >
            Usar
          </button>
        </div>
      ) : null}
      {campo.ajuda || horas ? (
        <p className="text-xs text-muted-foreground">
          {campo.ajuda}
          {horas ? `${campo.ajuda ? " " : ""}= ${horas}` : ""}
        </p>
      ) : null}
    </div>
  );
}
