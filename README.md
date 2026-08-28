# MAX Cultural

Suíte: **MAX Cultural** (hub) · **MAX Origem** (auditoria SALIC + fornecedores) · **MAX Fluxo** (execução e inscrições).

Princípio: portar o que já funciona (Salink, Suply no Salink, SigaCultural) e mudar só a casca — marca MAX, sidebar clara, confirmação em editar/excluir, IAM no hub.


| App      | Host (prod)                 | Dev                            | Root Directory (Vercel) |
| -------- | --------------------------- | ------------------------------ | ----------------------- |
| Cultural | `maxcultural.com.br`        | `npm run dev:cultural` → :3000 | `apps/cultural`         |
| Origem   | `origem.maxcultural.com.br` | `npm run dev:origem` → :3001   | `apps/origem`           |
| Fluxo    | `fluxo.maxcultural.com.br`  | `npm run dev:fluxo` → :3002    | `apps/fluxo`            |




## Origem — módulos

1. **Planejamento** — planilha homologada, NF/RPA, rubricas e readequação.
2. **Proponentes** — contas SALIC, credenciais e mapa societário.
3. **Auditoria** — sync SALIC, panorama, conformidade e relatório.
4. **Fornecedores** — banco de preços, serviços, contratações e análises.

Tagline Origem: Criação · Planejamento · Auditoria. Fluxo: Execução · Gestão · Acompanhamento.

## Fundação (contas do cliente)

Estes passos usam as contas Vercel / Supabase / Resend / DNS do cliente — o código já espera os hosts abaixo.

1. **GitHub** `HenriqueRotsen/max-cultural` — este repositório.
2. **DNS** (`maxcultural.com.br`): apex A/ALIAS Vercel; `www`, `origem`, `fluxo` CNAME `cname.vercel-dns.com`.
3. **Três projetos Vercel** no mesmo repo, Root Directory por app. Production URLs nos hosts da tabela. `SYNC_MODE=chunked` e `SYNC_CONCURRENCY=2` no Origem.
4. **Um projeto Supabase** (Auth + Postgres). Site URL = `https://maxcultural.com.br`. Redirect allow list: os três hosts + `/auth/callback` + `/login/2fa`. Origem: `DATABASE_URL` pooler `:6543?pgbouncer=true`, `DIRECT_URL` `:5432`. Fluxo: mesmo projeto, schema `fluxo` (ou segundo database).
5. **Resend** com domínio autenticado. `EMAIL_FROM=MAX Cultural <noreply@maxcultural.com.br>`.

Cookie de sessão: `max_session`, `domain=.maxcultural.com.br`, `Secure`, `HttpOnly`, `SameSite=Lax`. Preview `*.vercel.app` não compartilha sessão com produção.

## Auth e 2FA

Login único no Cultural: senha → TOTP (app autenticador, 6 dígitos, janela ±1). Sem 2FA configurado, o setup é obrigatório antes de Origem/Fluxo. `AUTH_2FA_DISABLED=true` só em dev.

Até o hub estar no ar, Origem e Fluxo ainda autenticam sozinhos (não bloquear o port). Com `NEXT_PUBLIC_CULTURAL_URL` + `AUTH_SECRET` iguais, Origem/Fluxo aceitam o cookie do hub e redirecionam quem não tem sessão para `https://maxcultural.com.br/login?next=`.

Usuários, papéis (view/edit por tela) e logs ficam só no Cultural. O grupo Acesso do Fluxo some quando o SSO estiver estável.

## Envs (resumo)

Ver `.env.example` na raiz e em cada app.

**Cultural:** `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_COOKIE_DOMAIN`, `CREDENTIALS_SECRET` (cifrar TOTP), `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_2FA_DISABLED=false`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ORIGEM_URL`, `NEXT_PUBLIC_FLUXO_URL`.

**Origem:** `DATABASE_URL` + `DIRECT_URL` (dados SALIC), `CREDENTIALS_SECRET`, `SYNC_`*, `SALINK_DEV_OPEN=0`. Depois do SSO: `AUTH_SECRET` e `NEXT_PUBLIC_CULTURAL_URL`.

**Fluxo:** `DATABASE_URL` do schema Siga; depois do SSO, as mesmas keys públicas de sessão.

Service role e connection strings nunca no client.

## Segurança

CI: ESLint, `npm audit`, Gitleaks, CodeQL, Semgrep. Não commitar `.env`. HSTS/CSP headers nos apps. Sem `SALINK_DEV_OPEN` em produção.

## Local

```bash
npm install
cp apps/cultural/.env.example apps/cultural/.env.local
# idem origem e fluxo
npm run dev:cultural
npm run dev:origem
npm run dev:fluxo
```

