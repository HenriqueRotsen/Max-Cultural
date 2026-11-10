"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, UserRound, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { buscarPessoasAction } from "@/app/actions/prestacao";
import { enderecoLabel, formatarNumero, type Endereco } from "@/lib/prestacao/regras";

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function lerLista(valor: string): string[] {
  try {
    const x = JSON.parse(valor || "[]");
    return Array.isArray(x) ? x.map(String) : valor ? [valor] : [];
  } catch {
    return valor ? [valor] : [];
  }
}

/**
 * Vários nomes em etiquetas. Escreve-se livremente (Enter adiciona); enquanto
 * digita, aparecem os usuários do sistema e os nomes já usados para escolher.
 */
export function PessoasInput({
  valor,
  disabled,
  alternativas,
  onChange,
  ariaLabel,
}: {
  valor: string;
  disabled: boolean;
  alternativas: string[];
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  const nomes = lerLista(valor);
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) return;
    let vivo = true;
    const id = setTimeout(() => {
      setBuscando(true);
      void buscarPessoasAction(t)
        .then((r) => vivo && setUsuarios(r))
        .finally(() => vivo && setBuscando(false));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [texto]);

  const filtro = semAcento(texto.trim());
  const ja = new Set(nomes.map(semAcento));
  const doSistema = filtro.length >= 2 ? usuarios.filter((u) => !ja.has(semAcento(u))) : [];
  const usados = alternativas
    .filter((a) => !ja.has(semAcento(a)) && !doSistema.some((u) => semAcento(u) === semAcento(a)))
    .filter((a) => !filtro || semAcento(a).includes(filtro))
    .slice(0, 6);

  function adicionar(nome: string) {
    const n = nome.trim().replace(/\s+/g, " ");
    if (!n || ja.has(semAcento(n))) return;
    onChange(JSON.stringify([...nomes, n]));
    setTexto("");
  }

  function remover(n: string) {
    onChange(JSON.stringify(nomes.filter((x) => x !== n)));
  }

  const mostrar = aberto && !disabled && (doSistema.length > 0 || usados.length > 0 || (filtro.length >= 2 && buscando));

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          disabled && "opacity-50",
        )}
      >
        {nomes.map((n) => (
          <span key={n} className="inline-flex items-center gap-1 rounded-full bg-brand-mist px-2 py-0.5 text-xs font-medium text-brand-deep">
            {n}
            {!disabled ? (
              <button type="button" aria-label={`Tirar ${n}`} onClick={() => remover(n)} className="rounded-full hover:text-red-600">
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
        <input
          value={texto}
          disabled={disabled}
          aria-label={ariaLabel}
          placeholder={nomes.length ? "Adicionar outro nome" : "Escreva o nome e tecle Enter"}
          className="min-w-[10rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              adicionar(texto);
            } else if (e.key === "Backspace" && !texto && nomes.length) {
              remover(nomes[nomes.length - 1]!);
            }
          }}
        />
      </div>
      {mostrar ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
          {doSistema.length ? (
            <div className="p-1">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Usuários do sistema</div>
              {doSistema.map((u) => (
                <button
                  key={u}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => adicionar(u)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <UserRound className="size-4 text-teal-700" /> {u}
                </button>
              ))}
            </div>
          ) : null}
          {usados.length ? (
            <div className="border-t border-border/60 p-1 first:border-t-0">
              <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Já usados</div>
              {usados.map((u) => (
                <button
                  key={u}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => adicionar(u)}
                  className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {u}
                </button>
              ))}
            </div>
          ) : null}
          {buscando && !doSistema.length ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Procurando usuários…
            </div>
          ) : null}
          {texto.trim() ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => adicionar(texto)}
              className="w-full border-t border-border/60 px-3 py-2 text-left text-xs text-teal-800 hover:bg-accent"
            >
              Adicionar “{texto.trim()}” como escrito
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function lerEndereco(valor: string): Endereco {
  try {
    const x = JSON.parse(valor || "{}");
    return x && typeof x === "object" && !Array.isArray(x) ? (x as Endereco) : {};
  } catch {
    return valor ? { logradouro: valor } : {};
  }
}

const mascaraCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

/** Local: nome, CEP (preenche o endereço), número, complemento; cidade e UF do território. */
export function EnderecoInput({
  valor,
  disabled,
  locais,
  onChange,
}: {
  valor: string;
  disabled: boolean;
  locais: Endereco[];
  onChange: (v: string) => void;
}) {
  const e = lerEndereco(valor);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState("");
  const ultimoCep = useRef("");
  const set = (patch: Endereco) => onChange(JSON.stringify({ ...e, ...patch }));

  async function buscarCep(cep: string) {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8 || d === ultimoCep.current) return;
    ultimoCep.current = d;
    setBuscandoCep(true);
    setErroCep("");
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (j.erro) return setErroCep("CEP não encontrado.");
      onChange(
        JSON.stringify({
          ...e,
          cep: mascaraCep(d),
          logradouro: j.logradouro || e.logradouro || "",
          bairro: j.bairro || e.bairro || "",
          cidade: j.localidade || e.cidade || "",
          uf: j.uf || e.uf || "",
        }),
      );
    } catch {
      setErroCep("Não foi possível consultar o CEP agora.");
    } finally {
      setBuscandoCep(false);
    }
  }

  const campo = (k: keyof Endereco, ph: string, className = "") => (
    <Input
      value={e[k] ?? ""}
      disabled={disabled}
      placeholder={ph}
      aria-label={ph}
      onChange={(ev) => set({ [k]: k === "uf" ? ev.target.value.toUpperCase().slice(0, 2) : ev.target.value })}
      className={className}
    />
  );

  return (
    <div className="space-y-2">
      {locais.length && !disabled ? (
        <div className="flex flex-wrap gap-1.5">
          {locais.slice(0, 4).map((l) => (
            <button
              key={enderecoLabel(l)}
              type="button"
              onClick={() => onChange(JSON.stringify(l))}
              className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-white px-2.5 py-1 text-xs text-brand-deep hover:border-brand/40 hover:bg-brand-mist/40"
              title={enderecoLabel(l)}
            >
              <MapPin className="size-3 shrink-0" /> <span className="truncate">{l.nome || l.logradouro}</span>
            </button>
          ))}
        </div>
      ) : null}
      {campo("nome", "Nome do local (ex.: Escola Estadual Afonso Pena)")}
      <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
        <div className="relative">
          <Input
            value={e.cep ?? ""}
            disabled={disabled}
            placeholder="CEP"
            aria-label="CEP"
            inputMode="numeric"
            onChange={(ev) => {
              const c = mascaraCep(ev.target.value);
              set({ cep: c });
              void buscarCep(c);
            }}
            className="tabular-nums"
          />
          {buscandoCep ? <Loader2 className="absolute right-2 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
        </div>
        {campo("logradouro", "Rua, avenida…")}
      </div>
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
        {campo("numero", "Número")}
        {campo("complemento", "Complemento")}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-2">
        {campo("bairro", "Bairro")}
        {campo("cidade", "Cidade")}
        {campo("uf", "UF")}
      </div>
      {erroCep ? <p className="text-xs text-amber-800">{erroCep}</p> : null}
    </div>
  );
}

/** Número inteiro com separador de milhar enquanto digita (1.250). */
export function NumeroInput({
  valor,
  disabled,
  onChange,
  ariaLabel,
  sufixo,
}: {
  valor: string;
  disabled: boolean;
  onChange: (v: string) => void;
  ariaLabel: string;
  sufixo?: string;
}) {
  const digitos = valor.replace(/\D/g, "");
  const mostrado = digitos ? formatarNumero(Number(digitos)) : "";
  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        value={mostrado}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
        className="w-36 text-right tabular-nums"
      />
      {sufixo ? <span className="text-sm text-muted-foreground">{sufixo}</span> : null}
    </div>
  );
}
