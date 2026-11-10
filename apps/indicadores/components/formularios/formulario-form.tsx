"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { Textarea } from "@/components/ui/textarea";
import { CampoEditor } from "@/components/formularios/campo-editor";
import { CapaField } from "@/components/formularios/capa-field";
import {
  ProfessorPicker,
  type ProfessorUserOpt,
} from "@/components/formularios/professor-picker";
import type { FormularioCampoDraft } from "@/lib/formularios/types";
import {
  createFormularioAction,
  updateFormularioAction,
  setAcaoResponsavelesAction,
} from "@/app/actions/formularios";
type AcaoOpt = {
  id: string;
  label: string;
};

type UserOpt = ProfessorUserOpt;

type Props = {
  mode: "create" | "edit";
  acoes?: AcaoOpt[];
  initial?: {
    id: string;
    acaoId: string;
    titulo: string;
    descricao: string;
    abreEm: string;
    encerraEm: string;
    ativo: boolean;
    capaUrl: string;
    mensagemConfirmacao: string;
    slug: string;
    campos: FormularioCampoDraft[];
  };
  professorUsers?: UserOpt[];
  selectedProfessorIds?: string[];
};

export function FormularioForm({
  mode,
  acoes = [],
  initial,
  professorUsers = [],
  selectedProfessorIds = [],
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [acaoId, setAcaoId] = useState(initial?.acaoId ?? "");
  const [titulo, setTitulo] = useState(initial?.titulo ?? "");
  const [descricao, setDescricao] = useState(initial?.descricao ?? "");
  const [abreEm, setAbreEm] = useState(initial?.abreEm ?? "");
  const [encerraEm, setEncerraEm] = useState(initial?.encerraEm ?? "");
  const [ativo, setAtivo] = useState(initial?.ativo ?? true);
  const [capaUrl, setCapaUrl] = useState(initial?.capaUrl ?? "");
  const [mensagemConfirmacao, setMensagemConfirmacao] = useState(
    initial?.mensagemConfirmacao ??
      "Inscrição enviada com sucesso. Aguarde o contato da equipe.",
  );
  const [campos, setCampos] = useState<FormularioCampoDraft[]>(
    initial?.campos ?? [],
  );
  const [professores, setProfessores] = useState<string[]>(selectedProfessorIds);

  const publicPath = initial?.slug ? `/f/${initial.slug}` : "";
  const publicUrl = useMemo(() => {
    if (!publicPath) return "";
    const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    return base ? `${base}${publicPath}` : publicPath;
  }, [publicPath]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        if (mode === "create") {
          if (!acaoId) {
            toast.error("Selecione a ação");
            return;
          }
          const created = await createFormularioAction({
            acaoId,
            titulo,
            descricao,
            abreEm: abreEm || null,
            encerraEm: encerraEm || null,
            capaUrl,
            mensagemConfirmacao,
            campos,
          });
          if (professores.length) {
            await setAcaoResponsavelesAction(acaoId, professores);
          }
          toast.success("Formulário criado");
          router.push(`/dashboard/formularios/${created.id}`);
        } else if (initial) {
          await updateFormularioAction(initial.id, {
            titulo,
            descricao,
            abreEm: abreEm || null,
            encerraEm: encerraEm || null,
            ativo,
            capaUrl,
            mensagemConfirmacao,
            campos,
          });
          await setAcaoResponsavelesAction(initial.acaoId, professores);
          toast.success("Formulário atualizado");
          router.refresh();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao salvar");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-4 rounded-lg border border-border/80 bg-card p-4">
        <h2 className="font-heading text-lg font-semibold text-brand-deep">
          Dados do formulário
        </h2>
        {mode === "create" ? (
          <div className="space-y-1">
            <Label>Ação *</Label>
            <SearchSelect
              className="h-9 w-full"
              aria-label="Ação"
              value={acaoId}
              onValueChange={setAcaoId}
              required
              placeholder="Selecione…"
              options={acoes.map((o) => ({ value: o.id, label: o.label }))}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Link público:{" "}
            <a className="text-brand-deep underline" href={publicUrl} target="_blank" rel="noreferrer">
              {publicUrl}
            </a>
          </p>
        )}
        <div className="space-y-1">
          <Label>Título *</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Descrição / introdução</Label>
          <Textarea rows={5} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Abre em</Label>
            <Input
              type="datetime-local"
              value={abreEm}
              onChange={(e) => setAbreEm(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Encerra em</Label>
            <Input
              type="datetime-local"
              value={encerraEm}
              onChange={(e) => setEncerraEm(e.target.value)}
            />
          </div>
        </div>
        <CapaField value={capaUrl} onChange={setCapaUrl} />
        <div className="space-y-1">
          <Label>Mensagem de confirmação</Label>
          <Textarea
            rows={3}
            value={mensagemConfirmacao}
            onChange={(e) => setMensagemConfirmacao(e.target.value)}
          />
        </div>
        {mode === "edit" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            Formulário ativo
          </label>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold text-brand-deep">
          Perguntas
        </h2>
        <CampoEditor campos={campos} onChange={setCampos} />
      </section>

      <section className="space-y-3 rounded-lg border border-border/80 bg-card p-4">
        <h2 className="font-heading text-lg font-semibold text-brand-deep">
          Professores da ação
        </h2>
        <p className="text-sm text-muted-foreground">
          Usuários com o papel <strong>Professor</strong>. Eles só veem as
          respostas desta ação e podem marcar Selecionado / Professor — sem
          remover dados.
        </p>
        <ProfessorPicker
          users={professorUsers}
          value={professores}
          onChange={setProfessores}
        />
        {professorUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum usuário com papel Professor. Crie o login no hub e atribua o
            papel Professor.
          </p>
        ) : null}
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : mode === "create" ? "Criar formulário" : "Salvar"}
        </Button>
        {mode === "edit" && initial && (
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/formularios/${initial.id}/respostas`)}
          >
            Ver respostas
          </Button>
        )}
      </div>
    </form>
  );
}

export { toLocalInput } from "@/lib/formularios/datetime-local";
