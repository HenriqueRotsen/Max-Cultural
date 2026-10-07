"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateFormularioModeloAction } from "@/app/actions/formularios";
import { CampoEditor } from "@/components/formularios/campo-editor";
import { CapaField } from "@/components/formularios/capa-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormularioCampoDraft } from "@/lib/formularios/types";

type Props = {
  tipo: "INSCRICAO" | "AVALIACAO";
  initial: {
    nome: string;
    tituloDefault: string;
    descricaoDefault: string;
    mensagemConfirmacao: string;
    capaUrlDefault: string;
    campos: FormularioCampoDraft[];
  };
};

export function ModeloForm({ tipo, initial }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState(initial.nome);
  const [tituloDefault, setTituloDefault] = useState(initial.tituloDefault);
  const [descricaoDefault, setDescricaoDefault] = useState(initial.descricaoDefault);
  const [mensagemConfirmacao, setMensagemConfirmacao] = useState(
    initial.mensagemConfirmacao,
  );
  const [capaUrlDefault, setCapaUrlDefault] = useState(initial.capaUrlDefault);
  const [campos, setCampos] = useState(initial.campos);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await updateFormularioModeloAction(tipo, {
          nome,
          tituloDefault,
          descricaoDefault,
          mensagemConfirmacao,
          capaUrlDefault,
          campos,
        });
        toast.success("Modelo salvo");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao salvar");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-4 rounded-lg border border-border/80 bg-card p-4">
        <h2 className="font-heading text-lg font-semibold text-brand-deep">
          Dados do modelo
        </h2>
        <p className="text-sm text-muted-foreground">
          Estes valores são pré-carregados ao criar um formulário novo deste tipo.
        </p>
        <div className="space-y-1">
          <Label>Nome do modelo</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Título padrão</Label>
          <Input
            value={tituloDefault}
            onChange={(e) => setTituloDefault(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Descrição / introdução padrão</Label>
          <Textarea
            rows={4}
            value={descricaoDefault}
            onChange={(e) => setDescricaoDefault(e.target.value)}
          />
        </div>
        <CapaField
          label="Capa padrão"
          id="modelo-capa"
          value={capaUrlDefault}
          onChange={setCapaUrlDefault}
        />
        <div className="space-y-1">
          <Label>Mensagem de confirmação padrão</Label>
          <Textarea
            rows={3}
            value={mensagemConfirmacao}
            onChange={(e) => setMensagemConfirmacao(e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold text-brand-deep">
          Perguntas do modelo
        </h2>
        <CampoEditor campos={campos} onChange={setCampos} />
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar modelo"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/dashboard/formularios/modelos")}
        >
          Voltar
        </Button>
      </div>
    </form>
  );
}
