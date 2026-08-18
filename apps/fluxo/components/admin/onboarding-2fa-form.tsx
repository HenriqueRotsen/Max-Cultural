"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  confirmTotpSetupAction,
  startTotpSetupAction,
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

export function Onboarding2faForm() {
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [state, action, pending] = useActionState(
    confirmTotpSetupAction,
    initial,
  );

  useEffect(() => {
    startLoad(async () => {
      const r = await startTotpSetupAction();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setQr(r.qrDataUrl);
      setSecret(r.secret);
    });
  }, []);

  return (
    <Card className="w-full max-w-md border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl">Ativar verificação em 2 etapas</CardTitle>
        <CardDescription>
          Escaneie o QR no Google Authenticator / Authy e confirme com o código.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Gerando QR…</p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR Code TOTP" className="mx-auto rounded-lg border" />
        ) : null}
        {secret ? (
          <p className="break-all text-center text-xs text-muted-foreground">
            Chave manual: <code>{secret}</code>
          </p>
        ) : null}
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Código de 6 dígitos</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              disabled={pending || !secret}
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={pending || !secret}
          >
            {pending ? "Confirmando…" : "Ativar 2FA"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
