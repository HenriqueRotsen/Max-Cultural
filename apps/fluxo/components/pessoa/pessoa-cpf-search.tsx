"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { digitsOnly } from "@/lib/normalize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function maskCpf(value: string) {
  const d = digitsOnly(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function PessoaCpfSearch({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [cpf, setCpf] = useState(initial);
  const [error, setError] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = digitsOnly(cpf);
    if (digits.length !== 11) {
      setError("Informe um CPF com 11 dígitos.");
      return;
    }
    setError("");
    router.push(`/pessoa/${digits}`);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cpf-busca">CPF</Label>
        <Input
          id="cpf-busca"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => {
            setCpf(maskCpf(e.target.value));
            setError("");
          }}
          className="h-11 bg-white"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <Button type="submit" size="lg" className="w-full gap-2">
        <Search className="size-4" />
        Ver histórico
      </Button>
    </form>
  );
}
