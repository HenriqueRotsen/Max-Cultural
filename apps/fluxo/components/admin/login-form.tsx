"use client";

import { useActionState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction, type AuthActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initial: AuthActionState = {};
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "SigaCultural";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <Card className="w-full max-w-md border-border/60 shadow-sm">
      <CardHeader className="items-center text-center">
        <Image
          src="/logo-mark.png"
          alt=""
          width={56}
          height={56}
          className="mb-2 rounded-[22%] shadow-sm"
          aria-hidden
          priority
        />
        <Image
          src="/logo-wordmark-dark.png"
          alt={appName}
          width={200}
          height={38}
          className="mx-auto h-auto w-auto max-w-[12rem]"
          priority
        />
        <CardTitle className="mt-3 text-xl tracking-tight">Entrar</CardTitle>
        <CardDescription>
          Acesse o painel com o e-mail e a senha da sua conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={pending}
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/dashboard/recuperar"
              className="text-emerald-800 underline-offset-2 hover:underline"
            >
              Esqueci minha senha
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
