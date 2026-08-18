"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  changeOwnPasswordAction,
  confirmTotpSetupAction,
  disableOwnTotpAction,
  startTotpSetupAction,
  updateOwnProfileAction,
  type AuthActionState,
} from "@/app/actions/auth";
import type { ProfileSummary } from "@/lib/profile-summary";
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

type Props = {
  name: string;
  email: string;
  totpEnabled: boolean;
  twoFaDisabledEnv: boolean;
  summary: ProfileSummary;
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

function accessLabel(access: "viewer" | "editor") {
  return access === "editor" ? "Editar" : "Ver";
}

function kindLabel(kind: ProfileSummary["scopeItems"][number]["kind"]) {
  if (kind === "CONTEXTO") return "Contexto";
  if (kind === "PROJETO") return "Projeto";
  return "Oficina";
}

export function ProfileForm({
  name,
  email,
  totpEnabled,
  twoFaDisabledEnv,
  summary,
}: Props) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateOwnProfileAction,
    initial,
  );
  const [passState, passAction, passPending] = useActionState(
    changeOwnPasswordAction,
    initial,
  );
  const [disableState, disableAction, disablePending] = useActionState(
    disableOwnTotpAction,
    initial,
  );
  const [setupState, setupAction, setupPending] = useActionState(
    confirmTotpSetupAction,
    initial,
  );
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [loadingQr, startQr] = useTransition();

  useEffect(() => {
    if (totpEnabled || twoFaDisabledEnv) return;
    startQr(async () => {
      const r = await startTotpSetupAction();
      if (r.ok) {
        setQr(r.qrDataUrl);
        setSecret(r.secret);
      }
    });
  }, [totpEnabled, twoFaDisabledEnv]);

  const twoFaStatus = twoFaDisabledEnv
    ? "Desativado neste ambiente"
    : totpEnabled
      ? "Ativo"
      : "Pendente de configuração";

  const scopeModeLabel =
    summary.dataScopeMode === "ALL"
      ? "Acesso completo a todos os dados"
      : "Acesso limitado a contextos, projetos e oficinas";

  const scopeSourceLabel =
    summary.dataScopeMode === "ALL"
      ? summary.isSuperAdmin
        ? "Conta privilegiada (superadmin)"
        : "Definido no papel ou na conta"
      : summary.scopeSource === "user"
        ? "Escopo definido na sua conta"
        : "Herdado do seu papel";

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Meu perfil</CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={profileAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                name="name"
                defaultValue={name}
                required
                disabled={profilePending}
              />
            </div>
            {profileState.message ? (
              <p className="text-sm text-emerald-800">{profileState.message}</p>
            ) : null}
            {profileState.error ? (
              <p className="text-sm text-destructive">{profileState.error}</p>
            ) : null}
            <Button type="submit" disabled={profilePending}>
              Salvar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meu acesso</CardTitle>
          <CardDescription>
            Papel, escopo de dados e permissões efetivas (somente leitura).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Papel</dt>
              <dd className="font-medium text-brand-deep">
                {summary.roleName}
                {summary.isSuperAdmin ? (
                  <span className="ml-1 text-xs font-normal text-brand">
                    (privilegiado)
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Dados</dt>
              <dd className="font-medium">{scopeModeLabel}</dd>
              <dd className="text-xs text-muted-foreground">{scopeSourceLabel}</dd>
            </div>
          </dl>

          {summary.dataScopeMode === "LIMITED" ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Escopo liberado
              </p>
              {summary.scopeItems.length === 0 ? (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground">
                  Nenhum contexto, projeto ou oficina liberado no momento.
                </p>
              ) : (
                <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                  {summary.scopeItems.map((item) => (
                    <li
                      key={`${item.kind}:${item.id}`}
                      className="flex items-start justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">
                          {kindLabel(item.kind)}
                          {item.parentLabel ? ` · ${item.parentLabel}` : ""}
                        </div>
                        <div className="truncate font-medium">{item.label}</div>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-brand-deep">
                        {accessLabel(item.access)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Permissões de tela
            </p>
            {summary.permissionsByGroup.length === 0 ? (
              <p className="text-muted-foreground">
                Nenhuma permissão além do perfil.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {summary.permissionsByGroup.map((g) => (
                  <div key={g.group} className="rounded-lg border px-3 py-2">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      {g.group}
                    </p>
                    <ul className="space-y-1">
                      {g.labels.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conta</CardTitle>
          <CardDescription>
            Informações da sua sessão e cadastro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">E-mail</dt>
              <dd className="font-medium">{email}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">2FA</dt>
              <dd className="font-medium">{twoFaStatus}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Último login</dt>
              <dd className="font-medium">{formatWhen(summary.lastLoginAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Conta criada em</dt>
              <dd className="font-medium">{formatWhen(summary.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Perfil atualizado em
              </dt>
              <dd className="font-medium">{formatWhen(summary.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Criada por</dt>
              <dd className="font-medium">
                {summary.createdByName ?? "Sistema / seed"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alterar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={passAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current">Senha atual</Label>
              <Input
                id="current"
                name="current"
                type="password"
                required
                disabled={passPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                disabled={passPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                required
                disabled={passPending}
              />
            </div>
            {passState.message ? (
              <p className="text-sm text-emerald-800">{passState.message}</p>
            ) : null}
            {passState.error ? (
              <p className="text-sm text-destructive">{passState.error}</p>
            ) : null}
            <Button type="submit" disabled={passPending}>
              Atualizar senha
            </Button>
          </form>
        </CardContent>
      </Card>

      {!twoFaDisabledEnv ? (
        <Card>
          <CardHeader>
            <CardTitle>Verificação em duas etapas</CardTitle>
            <CardDescription>
              {totpEnabled
                ? "TOTP ativo neste dispositivo."
                : "Configure um app autenticador."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {totpEnabled ? (
              <form action={disableAction} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password-disable">Senha para desativar</Label>
                  <Input
                    id="password-disable"
                    name="password"
                    type="password"
                    required
                    disabled={disablePending}
                  />
                </div>
                {disableState.message ? (
                  <p className="text-sm text-emerald-800">
                    {disableState.message}
                  </p>
                ) : null}
                {disableState.error ? (
                  <p className="text-sm text-destructive">
                    {disableState.error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={disablePending}
                >
                  Desativar 2FA
                </Button>
              </form>
            ) : (
              <>
                {loadingQr ? (
                  <p className="text-sm text-muted-foreground">Gerando QR…</p>
                ) : null}
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr}
                    alt="QR TOTP"
                    className="mx-auto rounded-lg border"
                  />
                ) : null}
                {secret ? (
                  <p className="break-all text-center text-xs text-muted-foreground">
                    <code>{secret}</code>
                  </p>
                ) : null}
                <form action={setupAction} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Código</Label>
                    <Input
                      id="code"
                      name="code"
                      inputMode="numeric"
                      required
                      disabled={setupPending || !secret}
                    />
                  </div>
                  {setupState.error ? (
                    <p className="text-sm text-destructive">
                      {setupState.error}
                    </p>
                  ) : null}
                  <Button type="submit" disabled={setupPending || !secret}>
                    Ativar 2FA
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          2FA desativado neste ambiente (AUTH_2FA_DISABLED).
        </p>
      )}
    </div>
  );
}
