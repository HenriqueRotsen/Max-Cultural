"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createInscricaoPublicAction } from "@/app/actions/inscricoes";
import { ETNIAS, GENEROS, type BatchContext } from "@/lib/schema";
import { digitsOnly, normalizeSimComDetalhe } from "@/lib/normalize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function maskCpf(value: string) {
  const d = digitsOnly(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function maskPhone(value: string) {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  }
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
}

function maskCep(value: string) {
  const d = digitsOnly(value).slice(0, 8);
  return d.replace(/(\d{5})(\d{0,3})/, "$1-$2");
}

type Props = {
  context: BatchContext;
};

export function InscricaoForm({ context }: Props) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    Nome: "",
    Apelido: "",
    CPF: "",
    Data_nascimento: "",
    Genero: "",
    Etnia: "",
    "E-mail": "",
    Telefone: "",
    Possui_deficiencia: "Não",
    RestricaoAlimentar: "Não",
    Ficousabendo: "",
    Lougradouro: "",
    Numero: "",
    Complemento: "",
    Bairro: "",
    CEP: "",
    Cidade: "",
    Estado: "",
    Redesocial: "",
    Escolaridade: "",
    Territorio: "",
  });

  const title = useMemo(
    () => context.Nome_oficina || context.id_oficina,
    [context],
  );

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function lookupCep(cepMasked: string) {
    const cep = digitsOnly(cepMasked);
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setForm((prev) => ({
        ...prev,
        Lougradouro: data.logradouro || prev.Lougradouro,
        Bairro: data.bairro || prev.Bairro,
        Cidade: data.localidade || prev.Cidade,
        Estado: data.uf || prev.Estado,
      }));
    } catch {
      toast.error("Falha ao consultar ViaCEP");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createInscricaoPublicAction({
        ...context,
        ...form,
        CPF: digitsOnly(form.CPF),
        CEP: digitsOnly(form.CEP),
        Telefone: digitsOnly(form.Telefone),
        Possui_deficiencia: normalizeSimComDetalhe(form.Possui_deficiencia),
        RestricaoAlimentar: normalizeSimComDetalhe(form.RestricaoAlimentar),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDone(true);
      toast.success("Inscrição enviada com sucesso!");
    });
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-xl border-emerald-200 bg-white/80">
        <CardHeader>
          <CardTitle>Inscrição recebida</CardTitle>
          <CardDescription>
            Seus dados foram registrados no padrão SigaCultural.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-3xl border-border/50 bg-white/85 shadow-sm">
      <CardHeader>
        <CardTitle className="text-2xl tracking-tight text-emerald-950">
          Inscrição — {title}
        </CardTitle>
        <CardDescription>
          {context.Nome_projeto
            ? `${context.Nome_projeto} · PRONAC ${context.PRONAC || "—"}`
            : "Preencha seus dados para se inscrever na oficina."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="Nome">Nome completo *</Label>
            <Input
              id="Nome"
              required
              value={form.Nome}
              onChange={(e) => setField("Nome", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Apelido">Apelido</Label>
            <Input
              id="Apelido"
              value={form.Apelido}
              onChange={(e) => setField("Apelido", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="CPF">CPF *</Label>
            <Input
              id="CPF"
              required
              inputMode="numeric"
              value={form.CPF}
              onChange={(e) => setField("CPF", maskCpf(e.target.value))}
              placeholder="000.000.000-00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Data_nascimento">Data de nascimento</Label>
            <Input
              id="Data_nascimento"
              type="date"
              value={form.Data_nascimento}
              onChange={(e) => setField("Data_nascimento", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Gênero</Label>
            <Select
              value={form.Genero || undefined}
              onValueChange={(v) => setField("Genero", v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {GENEROS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Etnia</Label>
            <Select
              value={form.Etnia || undefined}
              onValueChange={(v) => setField("Etnia", v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {ETNIAS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={form["E-mail"]}
              onChange={(e) => setField("E-mail", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Telefone">Telefone</Label>
            <Input
              id="Telefone"
              inputMode="tel"
              value={form.Telefone}
              onChange={(e) => setField("Telefone", maskPhone(e.target.value))}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Possui_deficiencia">Possui deficiência</Label>
            <Input
              id="Possui_deficiencia"
              value={form.Possui_deficiencia}
              placeholder="Não ou Sim, <deficiência>"
              onChange={(e) => setField("Possui_deficiencia", e.target.value)}
              onBlur={(e) =>
                setField(
                  "Possui_deficiencia",
                  normalizeSimComDetalhe(e.target.value),
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="RestricaoAlimentar">Restrição alimentar</Label>
            <Input
              id="RestricaoAlimentar"
              value={form.RestricaoAlimentar}
              placeholder="Não ou Sim, <restrição>"
              onChange={(e) => setField("RestricaoAlimentar", e.target.value)}
              onBlur={(e) =>
                setField(
                  "RestricaoAlimentar",
                  normalizeSimComDetalhe(e.target.value),
                )
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="Ficousabendo">Como ficou sabendo</Label>
            <Input
              id="Ficousabendo"
              value={form.Ficousabendo}
              onChange={(e) => setField("Ficousabendo", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="CEP">CEP</Label>
            <Input
              id="CEP"
              inputMode="numeric"
              value={form.CEP}
              onChange={(e) => setField("CEP", maskCep(e.target.value))}
              onBlur={(e) => lookupCep(e.target.value)}
              placeholder="00000-000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Lougradouro">Logradouro</Label>
            <Input
              id="Lougradouro"
              value={form.Lougradouro}
              onChange={(e) => setField("Lougradouro", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Numero">Número</Label>
            <Input
              id="Numero"
              value={form.Numero}
              onChange={(e) => setField("Numero", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Complemento">Complemento</Label>
            <Input
              id="Complemento"
              value={form.Complemento}
              onChange={(e) => setField("Complemento", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Bairro">Bairro</Label>
            <Input
              id="Bairro"
              value={form.Bairro}
              onChange={(e) => setField("Bairro", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Cidade">Cidade</Label>
            <Input
              id="Cidade"
              value={form.Cidade}
              onChange={(e) => setField("Cidade", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Estado">Estado (UF)</Label>
            <Input
              id="Estado"
              maxLength={2}
              value={form.Estado}
              onChange={(e) => setField("Estado", e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Redesocial">Rede social</Label>
            <Input
              id="Redesocial"
              value={form.Redesocial}
              onChange={(e) => setField("Redesocial", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="Escolaridade">Escolaridade</Label>
            <Input
              id="Escolaridade"
              value={form.Escolaridade}
              onChange={(e) => setField("Escolaridade", e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="Territorio">Território (comunidade)</Label>
            <Input
              id="Territorio"
              value={form.Territorio}
              onChange={(e) => setField("Territorio", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 pt-2">
            <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
              {pending ? "Enviando…" : "Enviar inscrição"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
