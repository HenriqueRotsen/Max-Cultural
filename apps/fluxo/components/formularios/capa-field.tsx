"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  id?: string;
  className?: string;
};

export function CapaField({
  value,
  onChange,
  label = "Arte de capa",
  id = "capa",
  className,
}: Props) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={`${id}-url`}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`${id}-url`}
          className="max-w-xl"
          placeholder="https://…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange("")}
          >
            Remover
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Cole a URL pública da imagem (http ou https).
      </p>
      {value ? (
        <div className="overflow-hidden rounded-lg border border-border/80 bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Prévia da capa"
            className="max-h-40 w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
