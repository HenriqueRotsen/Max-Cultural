import type { ReactNode } from "react";
import { Section } from "@/components/ui";

/** Bloco que começa fechado — mesmo visual de `Section`. */
export function CollapsibleSection({
  step,
  title,
  description,
  summary,
  help,
  children,
  defaultOpen = false,
}: {
  step?: number | string;
  title: ReactNode;
  description?: ReactNode;
  summary?: ReactNode;
  help?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Section
      collapsible
      step={step}
      title={title}
      description={description}
      summary={summary}
      help={help}
      defaultOpen={defaultOpen}
    >
      {children}
    </Section>
  );
}
