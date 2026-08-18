"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteInscricaoAction,
  updateInscricaoAction,
} from "@/app/actions/inscricoes";
import {
  ETNIAS,
  GENEROS,
  type SigaCulturalColumn,
  type SigaCulturalRow,
} from "@/lib/schema";
import { columnLabel } from "@/lib/column-labels";
import { normalizeSimComDetalhe } from "@/lib/normalize";
import { formatCellDisplay, parseCellInput } from "@/lib/validate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FLAG_COLS = new Set<SigaCulturalColumn>([
  "Selecionados",
  "Participantes",
  "Certificado",
]);

const INT_COLS = new Set<SigaCulturalColumn>([
  "Inscritos",
  "idade_atual",
  "idade_inscricao",
  ...FLAG_COLS,
]);

const SIM_DETALHE_COLS = new Set<SigaCulturalColumn>([
  "Possui_deficiencia",
  "RestricaoAlimentar",
]);

const LOCKED_COLS = new Set<SigaCulturalColumn>([
  "id_projeto",
  "id_oficina",
  "PROPONENTE",
  "PRONAC",
  "Nome_projeto",
  "Identificacao_ano_projeto",
  "Nome_oficina",
  "Data_inscricao",
]);

const SECTIONS: Array<{
  title: string;
  cols: SigaCulturalColumn[];
}> = [
  {
    title: "Projeto e oficina",
    cols: [
      "id_projeto",
      "id_oficina",
      "PROPONENTE",
      "PRONAC",
      "Nome_projeto",
      "Identificacao_ano_projeto",
      "Nome_oficina",
      "Data_inscricao",
    ],
  },
  {
    title: "Pessoa",
    cols: [
      "Nome",
      "Apelido",
      "CPF",
      "Data_nascimento",
      "Genero",
      "Etnia",
      "idade_atual",
      "idade_inscricao",
      "Escolaridade",
    ],
  },
  {
    title: "Contato",
    cols: ["E-mail", "Telefone", "Redesocial", "Ficousabendo"],
  },
  {
    title: "Endereço e território",
    cols: [
      "Lougradouro",
      "Numero",
      "Complemento",
      "Bairro",
      "CEP",
      "Cidade",
      "Estado",
      "Territorio",
    ],
  },
  {
    title: "Acessibilidade e alimentação",
    cols: ["Possui_deficiencia", "RestricaoAlimentar"],
  },
  {
    title: "Status na oficina",
    cols: ["Inscritos", "Selecionados", "Participantes", "Certificado"],
  },
];

type Props = {
  open: boolean;
  record: (SigaCulturalRow & { id: string }) | null;
  onOpenChange: (open: boolean) => void;
};

export function EditInscricaoDialog({ open, record, onOpenChange }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<Partial<SigaCulturalRow>>({});

  useEffect(() => {
    if (record) {
      const { id: _id, ...rest } = record;
      setForm(rest);
    }
  }, [record]);

  function setField(col: SigaCulturalColumn, value: string) {
    setForm((prev) => {
      const next = { ...prev };
      if (SIM_DETALHE_COLS.has(col)) {
        (next as Record<string, unknown>)[col] = value;
      } else {
        (next as Record<string, unknown>)[col] = parseCellInput(col, value);
      }
      return next;
    });
  }

  function commitSimDetalhe(col: SigaCulturalColumn, value: string) {
    setForm((prev) => ({
      ...prev,
      [col]: normalizeSimComDetalhe(value),
    }));
  }

  function handleSave() {
    if (!record) return;
    startTransition(async () => {
      const normalized = { ...form };
      for (const col of LOCKED_COLS) {
        delete (normalized as Record<string, unknown>)[col];
      }
      for (const col of SIM_DETALHE_COLS) {
        (normalized as Record<string, unknown>)[col] = normalizeSimComDetalhe(
          form[col],
        );
      }
      const result = await updateInscricaoAction({
        id: record.id,
        row: normalized,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Registro atualizado");
      onOpenChange(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!record) return;
    if (
      !confirm(
        "Excluir este registro da base? Essa ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteInscricaoAction(record.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Registro excluído");
      onOpenChange(false);
      router.refresh();
    });
  }

  function renderField(col: SigaCulturalColumn) {
    const value = form[col];
    const strValue =
      value === null || value === undefined ? "" : String(value);
    const locked = LOCKED_COLS.has(col);

    if (col === "Genero") {
      return (
        <Field key={col} label={columnLabel(col)} locked={locked}>
          <Select
            value={strValue || undefined}
            onValueChange={(v) => setField(col, v ?? "")}
            disabled={locked}
          >
            <SelectTrigger className="w-full" disabled={locked}>
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
        </Field>
      );
    }

    if (col === "Etnia") {
      return (
        <Field key={col} label={columnLabel(col)} locked={locked}>
          <Select
            value={strValue || undefined}
            onValueChange={(v) => setField(col, v ?? "")}
            disabled={locked}
          >
            <SelectTrigger className="w-full" disabled={locked}>
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
        </Field>
      );
    }

    if (SIM_DETALHE_COLS.has(col)) {
      return (
        <Field
          key={col}
          label={columnLabel(col)}
          className="sm:col-span-2 lg:col-span-2"
          locked={locked}
        >
          <Input
            id={`edit-${col}`}
            value={strValue}
            placeholder="Não ou Sim, <detalhe>"
            disabled={locked}
            readOnly={locked}
            onChange={(e) => setField(col, e.target.value)}
            onBlur={(e) => commitSimDetalhe(col, e.target.value)}
          />
        </Field>
      );
    }

    if (FLAG_COLS.has(col)) {
      return (
        <Field key={col} label={columnLabel(col)} locked={locked}>
          <Select
            value={strValue === "1" ? "1" : "0"}
            onValueChange={(v) => setField(col, v ?? "0")}
            disabled={locked}
            items={{ "1": "Sim", "0": "Não" }}
          >
            <SelectTrigger className="w-full" disabled={locked}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Sim</SelectItem>
              <SelectItem value="0">Não</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      );
    }

    const wide =
      col === "Nome" ||
      col === "Nome_projeto" ||
      col === "Nome_oficina" ||
      col === "E-mail" ||
      col === "Lougradouro" ||
      col === "Territorio" ||
      col === "Ficousabendo";

    return (
      <Field
        key={col}
        label={columnLabel(col)}
        className={wide ? "sm:col-span-2" : undefined}
        locked={locked}
      >
        <Input
          id={`edit-${col}`}
          value={formatCellDisplay(col, value)}
          inputMode={INT_COLS.has(col) ? "numeric" : undefined}
          disabled={locked}
          readOnly={locked}
          onChange={(e) => {
            if (!locked) setField(col, e.target.value);
          }}
        />
      </Field>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(92vh,56rem)] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="font-heading text-xl tracking-tight">
            Editar registro
          </DialogTitle>
          <DialogDescription className="text-sm">
            {record?.Nome
              ? `${record.Nome}${record.CPF ? ` · CPF ${record.CPF}` : ""}`
              : "Altere os campos e salve."}
            {record?.Nome_oficina ? (
              <span className="mt-0.5 block text-muted-foreground">
                {record.Nome_oficina}
                {record.Nome_projeto ? ` · ${record.Nome_projeto}` : ""}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <section key={section.title} className="space-y-3">
                <h3 className="border-b border-brand/10 pb-1.5 text-sm font-medium text-brand-deep">
                  {section.title}
                  {section.title === "Projeto e oficina" ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (somente leitura)
                    </span>
                  ) : null}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.cols.map((col) => renderField(col))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="border-destructive/40 text-destructive"
            onClick={handleDelete}
            disabled={pending}
          >
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
  locked = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  locked?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label
        className={`text-xs ${locked ? "text-muted-foreground/80" : "text-muted-foreground"}`}
      >
        {label}
      </Label>
      <div className={locked ? "opacity-70" : undefined}>{children}</div>
    </div>
  );
}
