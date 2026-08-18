"use client";

import { useActionState } from "react";
import {
  completePasswordChangeAction,
  type AuthActionState,
} from "@/app/actions/auth";
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

export function OnboardingPasswordForm() {
  const [state, action, pending] = useActionState(
    completePasswordChangeAction,
    initial,
  );

  return (
    <Card className="w-full max-w-md border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Crie sua senha</CardTitle>
        <CardDescription>
          Substitua a senha provisória por uma senha forte (mín. 10 caracteres,
          maiúscula, minúscula, dígito e símbolo).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              disabled={pending}
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Salvando…" : "Continuar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
