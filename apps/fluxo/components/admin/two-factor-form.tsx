"use client";

import { useActionState, useState, useTransition } from "react";
import {
  sendEmailOtpLoginAction,
  verifyEmailOtpLoginAction,
  verifyTotpLoginAction,
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

export function TwoFactorForm() {
  const [mode, setMode] = useState<"totp" | "email">("totp");
  const [totpState, totpAction, totpPending] = useActionState(
    verifyTotpLoginAction,
    initial,
  );
  const [emailState, emailAction, emailPending] = useActionState(
    verifyEmailOtpLoginAction,
    initial,
  );
  const [sendState, setSendState] = useState<AuthActionState>({});
  const [sending, startSend] = useTransition();

  return (
    <Card className="w-full max-w-md border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Verificação em duas etapas</CardTitle>
        <CardDescription>
          Confirme com o app autenticador ou receba um código por e-mail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "totp" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setMode("totp")}
          >
            Autenticador
          </Button>
          <Button
            type="button"
            variant={mode === "email" ? "default" : "outline"}
            className="flex-1"
            onClick={() => setMode("email")}
          >
            E-mail
          </Button>
        </div>

        {mode === "totp" ? (
          <form action={totpAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código do app</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                disabled={totpPending}
              />
            </div>
            {totpState.error ? (
              <p className="text-sm text-destructive">{totpState.error}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={totpPending}>
              {totpPending ? "Verificando…" : "Confirmar"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={sending}
              onClick={() =>
                startSend(async () => {
                  setSendState(await sendEmailOtpLoginAction());
                })
              }
            >
              {sending ? "Enviando…" : "Enviar código por e-mail"}
            </Button>
            {sendState.message ? (
              <p className="text-sm text-emerald-800">{sendState.message}</p>
            ) : null}
            {sendState.error ? (
              <p className="text-sm text-destructive">{sendState.error}</p>
            ) : null}
            <form action={emailAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-code">Código recebido</Label>
                <Input
                  id="email-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  disabled={emailPending}
                />
              </div>
              {emailState.error ? (
                <p className="text-sm text-destructive">{emailState.error}</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={emailPending}>
                {emailPending ? "Verificando…" : "Confirmar"}
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
