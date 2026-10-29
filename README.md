# MAX Cultural

Suíte: **MAX Cultural** (hub) · **MAX Financeiro** (auditoria SALIC + fornecedores) · **MAX Indicadores** (execução e inscrições).

Princípio: portar o que já funciona (Salink, Suply no Salink, SigaCultural) e mudar só a casca — marca MAX, sidebar clara, confirmação em editar/excluir, IAM no hub.


| App      | Host (prod)                 | Dev                            | Root Directory (Vercel) |
| -------- | --------------------------- | ------------------------------ | ----------------------- |
| Cultural | `maxcultural.com.br`        | `npm run dev:cultural` → :3000 | `apps/cultural`         |
| Origem   | `financeiro.maxcultural.com.br` | `npm run dev:financeiro` → :3001   | `apps/financeiro`           |
| Fluxo    | `indicadores.maxcultural.com.br`  | `npm run dev:indicadores` → :3002    | `apps/indicadores`            |




## Financeiro — módulos

1. **Planejamento** — planilha homologada, NF/RPA, rubricas e readequação.
2. **Proponentes** — contas SALIC, credenciais e mapa societário.
3. **Auditoria** — sync SALIC, panorama, conformidade e relatório.
4. **Fornecedores** — banco de preços, serviços, contratações e análises.

Tagline Financeiro: Criação · Planejamento · Auditoria. Indicadores: Execução · Gestão · Acompanhamento.

## Fundação (contas do cliente)

Estes passos usam as contas Vercel / Supabase / Resend / DNS do cliente — o código já espera os hosts abaixo.

1. **GitHub** `HenriqueRotsen/max-cultural` — este repositório.
2. **DNS** (`maxcultural.com.br`): apex A/ALIAS Vercel; `www`, `financeiro`, `indicadores` CNAME `cname.vercel-dns.com`.
3. **Três projetos Vercel** no mesmo repo, Root Directory por app. Production URLs nos hosts da tabela. `SYNC_MODE=chunked` e `SYNC_CONCURRENCY=2` no Financeiro.
4. **Um projeto Supabase** (Auth + Postgres). Site URL = `https://maxcultural.com.br`. Redirect allow list: os três hosts + `/auth/callback` + `/login/2fa`. Schemas: `public` (Cultural), `financeiro`, `indicadores`. Bootstrap SQL: [`docs/supabase-bootstrap.sql`](docs/supabase-bootstrap.sql). Checklist completo: [`docs/deploy-teste.md`](docs/deploy-teste.md). Pooler `:6543?pgbouncer=true` + `DIRECT_URL` `:5432`.
5. **Resend** com domínio autenticado. `EMAIL_FROM=MAX Cultural <noreply@maxcultural.com.br>`.

Cookie de sessão: `max_session`, `domain=.maxcultural.com.br`, `Secure`, `HttpOnly`, `SameSite=Lax`. Preview `*.vercel.app` não compartilha sessão com produção.

**Auditoria:** trilha central no Cultural (`/logs`). Financeiro e Indicadores enviam eventos via `POST /api/audit`.

## Auth e 2FA

Login único no Cultural: senha → TOTP (app autenticador, 6 dígitos, janela ±1). Sem 2FA configurado, o setup é obrigatório antes de Financeiro/Indicadores. `AUTH_2FA_DISABLED=true` só em dev.

Até o hub estar no ar, Financeiro e Indicadores ainda autenticam sozinhos (não bloquear o port). Com `NEXT_PUBLIC_CULTURAL_URL` + `AUTH_SECRET` iguais, Financeiro/Indicadores aceitam o cookie do hub e redirecionam quem não tem sessão para `https://maxcultural.com.br/login?next=`.

Usuários, papéis (view/edit por tela) e logs ficam só no Cultural. O grupo Acesso do Indicadores some quando o SSO estiver estável.

## Envs (resumo)

Ver `.env.example` na raiz e em cada app.

**Cultural:** `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_COOKIE_DOMAIN`, `CREDENTIALS_SECRET` (cifrar TOTP), `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_2FA_DISABLED=false`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_FINANCEIRO_URL`, `NEXT_PUBLIC_INDICADORES_URL`.

**Financeiro:** `DATABASE_URL` + `DIRECT_URL` (dados SALIC), `CREDENTIALS_SECRET`, `SYNC_*`. SSO: `AUTH_SECRET` e `NEXT_PUBLIC_CULTURAL_URL`. Login/2FA só no Cultural (`AUTH_2FA_DISABLED`).

**Indicadores:** `DATABASE_URL` do schema Siga; depois do SSO, as mesmas keys públicas de sessão.

Service role e connection strings nunca no client.

## Segurança

CI: ESLint, `npm audit`, Gitleaks, CodeQL, Semgrep. Não commitar `.env`. HSTS/CSP headers nos apps.

## Local

```bash
npm install
cp apps/cultural/.env.example apps/cultural/.env.local
# idem financeiro e indicadores
npm run dev:cultural
npm run dev:financeiro
npm run dev:indicadores
```

