import type { ComponentType } from "react";
import { Award, CheckCircle2, CircleDashed, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusKind = "selecionado" | "participante" | "certificado" | "nao_selecionado";

const STATUS_META: Record<
  StatusKind,
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  selecionado: {
    label: "Selecionado",
    icon: CheckCircle2,
    className: "border-transparent bg-sky-100 text-sky-900 hover:bg-sky-100",
  },
  participante: {
    label: "Participante",
    icon: Users,
    className: "border-transparent bg-teal-100 text-teal-900 hover:bg-teal-100",
  },
  certificado: {
    label: "Certificado",
    icon: Award,
    className: "border-transparent bg-amber-100 text-amber-950 hover:bg-amber-100",
  },
  nao_selecionado: {
    label: "Não selecionado",
    icon: CircleDashed,
    className: "",
  },
};

type StatusKindBadgeProps = {
  kind: StatusKind;
  className?: string;
  /** Sobrescreve o texto (ex.: rótulo em KPI). */
  label?: string;
};

/** Chip colorido padrão: Selecionado / Participante / Certificado. */
export function StatusKindBadge({
  kind,
  className,
  label,
}: StatusKindBadgeProps) {
  const meta = STATUS_META[kind];
  const Icon = meta.icon;
  if (kind === "nao_selecionado") {
    return (
      <Badge variant="secondary" className={cn("gap-1", className)}>
        <Icon className="size-3" />
        {label ?? meta.label}
      </Badge>
    );
  }
  return (
    <Badge className={cn("gap-1", meta.className, className)}>
      <Icon className="size-3" />
      {label ?? meta.label}
    </Badge>
  );
}

type StatusBadgesProps = {
  selecionado: boolean;
  participante: boolean;
  certificado: boolean;
  /** Mostra "Não selecionado" quando não há seleção. */
  showNaoSelecionado?: boolean;
  className?: string;
};

export function StatusBadges({
  selecionado,
  participante,
  certificado,
  showNaoSelecionado = false,
  className,
}: StatusBadgesProps) {
  const empty = !selecionado && !participante && !certificado;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {selecionado ? (
        <StatusKindBadge kind="selecionado" />
      ) : showNaoSelecionado ? (
        <StatusKindBadge kind="nao_selecionado" />
      ) : null}
      {participante ? <StatusKindBadge kind="participante" /> : null}
      {certificado ? <StatusKindBadge kind="certificado" /> : null}
      {empty && !showNaoSelecionado ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : null}
    </div>
  );
}
