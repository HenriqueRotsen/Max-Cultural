"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { SimpleSelect } from "@/components/ui/simple-select";
import { cn } from "@/lib/utils";
import { salvarFichaEquipeAction, salvarFichaGestaoAction } from "@/app/actions/prestacao";
import { EQUIPES, minutosEmHoras, type EquipePrestacao } from "@/lib/prestacao/regras";
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

/** Dados do projeto, da agenda e das inscrições; a gestão escolhe o produto e corrige os números. */
function DoSistema({ ficha }: { ficha: FichaDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const s = ficha.sistema;
  const [produtoId, setProdutoId] = useState(ficha.produtoId ?? "");
  const [ajustes, setAjustes] = useState<Record<string, string>>(
    Object.fromEntries(s.numeros.filter((n) => n.ajustado).map((n) => [n.chave, String(n.valor)])),
  );
  const pode = ficha.pode.GESTAO;

  function salvar() {
    const nums: Record<string, number | null> = {};
    for (const n of s.numeros) {
      const t = (ajustes[n.chave] ?? "").trim();
      nums[n.chave] = t === "" ? null : Number(t);
      if (t !== "" && !Number.isInteger(Number(t))) return void toast.error(`${n.rotulo}: número inválido.`);
    }
    startTransition(async () => {
      const r = await salvarFichaGestaoAction(ficha.agendaId, { produtoId: produtoId || null, ajustes: nums });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Produto e números salvos");
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand-deep">Do sistema</h2>
        <p className="text-sm text-muted-foreground">Vem do cadastro do projeto, da ação, da agenda e das inscrições.</p>
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
      </div>

      <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Números das inscrições</div>
          {s.numerosDaAcaoToda ? (
            <span className="text-xs text-amber-800">
              A ação tem mais de uma execução: os números são da ação toda. Corrija aqui se precisar separar.
            </span>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          {s.numeros.map((n) => (
            <div key={n.chave} className="space-y-1">
              <Label className="text-xs">{n.rotulo}</Label>
              {pode ? (
                <Input
                  inputMode="numeric"
                  value={ajustes[n.chave] ?? ""}
                  placeholder={String(n.doSistema)}
                  onChange={(e) => setAjustes((a) => ({ ...a, [n.chave]: e.target.value.replace(/\D/g, "") }))}
                  className="h-9 bg-white tabular-nums"
                  aria-label={n.rotulo}
                />
              ) : (
                <div className="text-lg font-semibold tabular-nums text-brand-deep">{n.valor}</div>
              )}
              <div className="text-[11px] text-muted-foreground">
                {n.ajustado ? `corrigido (sistema: ${n.doSistema})` : "do sistema"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm space-y-1.5">
          <Label>Produto</Label>
          <SimpleSelect
            value={produtoId}
            onChange={setProdutoId}
            disabled={!pode}
            className="h-9 w-full"
            aria-label="Produto"
            options={[
              { value: "", label: ficha.produtos.length ? "Sem produto" : "Nenhum produto cadastrado" },
              ...ficha.produtos.map((p) => ({ value: p.id, label: p.nome })),
            ]}
          />
        </div>
        {pode ? (
          <Button disabled={pending} onClick={salvar}>
            Salvar produto e números
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function ParteEquipe({ ficha, equipe }: { ficha: FichaDTO; equipe: EquipePrestacao }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const campos = ficha.campos.filter((c) => c.equipe === equipe);
  const [entrada, setEntrada] = useState<Entrada>(() =>
    Object.fromEntries(
      campos.map((c) => {
        const v = ficha.valores[c.chave];
        return [c.chave, { v: v?.v != null ? String(v.v) : "", na: Boolean(v?.na) }];
      }),
    ),
  );
  const pode = ficha.pode[equipe];
  const prog = ficha.progresso[equipe];
  if (!campos.length) return null;

  const set = (chave: string, patch: Partial<{ v: string; na: boolean }>) =>
    setEntrada((e) => ({ ...e, [chave]: { ...e[chave]!, ...patch } }));

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
              ? `Equipe de ${EQUIPE_LABEL[equipe]} preenche. Marque "Não se aplica" quando o campo não fizer sentido nesta ação.`
              : `Só consulta: quem preenche é a equipe de ${EQUIPE_LABEL[equipe]}.`}
          </p>
        </div>
        <div className="w-40">
          <BarraEquipe equipe={equipe} pct={prog.pct} compacta />
          {prog.faltando.length ? (
            <div className="mt-0.5 text-right text-[11px] text-amber-800">{prog.faltando.length} em aberto</div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-x-4 gap-y-4 md:grid-cols-2">
        {campos.map((c) => (
          <Campo
            key={c.chave}
            campo={c}
            valor={entrada[c.chave]!}
            disabled={!pode}
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

function Campo({
  campo,
  valor,
  disabled,
  onChange,
}: {
  campo: CampoDTO;
  valor: { v: string; na: boolean };
  disabled: boolean;
  onChange: (patch: Partial<{ v: string; na: boolean }>) => void;
}) {
  const off = disabled || valor.na;
  const largo = campo.tipo === "TEXTO_LONGO";
  let controle: React.ReactNode;
  switch (campo.tipo) {
    case "TEXTO_LONGO":
      controle = <Textarea rows={3} value={valor.v} disabled={off} onChange={(e) => onChange({ v: e.target.value })} />;
      break;
    case "DATA":
      controle = <DatePicker value={valor.v} onChange={(v) => onChange({ v })} disabled={off} className="w-52" aria-label={campo.rotulo} />;
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
            placeholder="https://drive.google.com/…"
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
        <Input
          inputMode="decimal"
          value={valor.v}
          disabled={off}
          onChange={(e) => onChange({ v: e.target.value.replace(/[^\d.,]/g, "") })}
          className="tabular-nums"
          aria-label={campo.rotulo}
        />
      );
      break;
    default:
      controle = <Input value={valor.v} disabled={off} onChange={(e) => onChange({ v: e.target.value })} aria-label={campo.rotulo} />;
  }
  const horas = campo.chave === "carga_horaria_min" && valor.v ? minutosEmHoras(Number(valor.v.replace(",", "."))) : "";

  return (
    <div className={cn("space-y-1.5", largo && "md:col-span-2")}>
      <div className="flex items-start justify-between gap-2">
        <Label className="leading-snug">
          {campo.rotulo}
          {campo.obrigatorio ? <span className="text-red-600"> *</span> : null}
        </Label>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5"
            checked={valor.na}
            disabled={disabled}
            onChange={(e) => onChange({ na: e.target.checked })}
          />
          Não se aplica
        </label>
      </div>
      {controle}
      {campo.ajuda || horas ? (
        <p className="text-xs text-muted-foreground">
          {campo.ajuda}
          {horas ? `${campo.ajuda ? " " : ""}= ${horas}` : ""}
        </p>
      ) : null}
    </div>
  );
}
