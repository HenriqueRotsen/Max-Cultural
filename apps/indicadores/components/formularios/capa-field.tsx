"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadFormularioCapaAction } from "@/app/actions/formularios";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [showUrl, setShowUrl] = useState(() =>
    Boolean(value && value.startsWith("http")),
  );

  function onFile(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const result = await uploadFormularioCapaAction(fd);
      if (!result.ok) {
        toast.error(result.error);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      onChange(result.url);
      setShowUrl(false);
      toast.success("Capa enviada");
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={`${id}-file`}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          id={`${id}-file`}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={pending}
          className="block w-full max-w-md text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        {value ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              onChange("");
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Remover
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowUrl((v) => !v)}
        >
          {showUrl ? "Ocultar URL" : "Usar URL"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        JPG, PNG, WebP ou GIF · máx. 5&nbsp;MB (sem perda de qualidade). Ou cole
        uma URL pública.
      </p>
      {showUrl ? (
        <Input
          id={`${id}-url`}
          placeholder="https://…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
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
      {pending ? (
        <p className="text-xs text-muted-foreground">Enviando capa…</p>
      ) : null}
    </div>
  );
}
