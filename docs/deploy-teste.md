# Deploy de teste — MAX Cultural (Vercel + Supabase)

Ambiente vivo nos hosts de produção. Dados podem ser limpos. SSO requer o mesmo domínio-pai.

| App | Host | Vercel Root Directory |
|-----|------|------------------------|
| Cultural | `https://maxcultural.com.br` | `apps/cultural` |
| Origem | `https://financeiro.maxcultural.com.br` | `apps/financeiro` |
| Fluxo | `https://indicadores.maxcultural.com.br` | `apps/indicadores` |

## 1. Supabase (1 projeto)

1. Crie o projeto.
2. **SQL Editor:** rode [`docs/supabase-bootstrap.sql`](./supabase-bootstrap.sql) (`vector` + schemas `financeiro` / `indicadores`).
3. **Settings → API:** copie URL, anon key, service role.
4. **Settings → Database:** connection strings
   - Pooler Transaction `:6543` → `DATABASE_URL` (+ `?pgbouncer=true` e `schema=` quando aplicável)
   - Direct `:5432` → `DIRECT_URL`
5. **Security (Data API):**
   - Enable Data API: on
   - Automatically expose new tables: **off**
   - Enable automatic RLS: **on**
6. **Authentication → URL Configuration**
   - Site URL: `https://maxcultural.com.br`
   - Redirects: `https://maxcultural.com.br/**`, `https://financeiro.maxcultural.com.br/**`, `https://indicadores.maxcultural.com.br/**`, `/auth/callback`, `/login/2fa`

### Schemas

| App | `?schema=` |
|-----|------------|
| Cultural | `public` (default) |
| Origem | `financeiro` |
| Fluxo | `indicadores` |

## 2. Migrations + seed (one-shot, fora do build Vercel)

Na máquina local (ou CI), com as `DATABASE_URL` / `DIRECT_URL` de produção:

```bash
# Cultural (public)
cd apps/cultural && npx prisma migrate deploy && npm run db:seed

# Financeiro (schema financeiro) — NÃO rode db:seed cego (é destrutivo)
cd ../financeiro && npx prisma migrate deploy

# Indicadores (schema indicadores)
cd ../indicadores && npx prisma migrate deploy && npm run db:seed-auth
```

Bootstrap admin: `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` no seed do Cultural.

## 3. Vercel (4 projetos, mesmo repo)

Para cada projeto:

- **Root Directory:** `apps/cultural` | `apps/financeiro` | `apps/indicadores` | `apps/auditoria`
- **Install Command:** `cd ../.. && npm ci` (ou `npm install` na raiz do monorepo)
- **Build Command:** default do app (`prisma generate && next build`)
- **Não** rode migrate no build

### Envs comuns (iguais nos 4)

| Var | Valor teste |
|-----|-------------|
| `AUTH_SECRET` | mesmo segredo longo nos 4 |
| `AUTH_COOKIE_DOMAIN` | `.maxcultural.com.br` |
| `NEXT_PUBLIC_CULTURAL_URL` | `https://maxcultural.com.br` |
| `NEXT_PUBLIC_FINANCEIRO_URL` | `https://financeiro.maxcultural.com.br` |
| `NEXT_PUBLIC_INDICADORES_URL` | `https://indicadores.maxcultural.com.br` |
| `NEXT_PUBLIC_AUDITORIA_URL` | `https://auditoria.maxcultural.com.br` (vazio = card escondido no hub) |

### Cultural

| Var | Nota |
|-----|------|
| `DATABASE_URL` / `DIRECT_URL` | schema public |
| `CREDENTIALS_SECRET` | cifrar TOTP |
| `NEXT_PUBLIC_SITE_URL` | `https://maxcultural.com.br` |
| `AUTH_2FA_DISABLED` | `false` (2FA obrigatório no login) |
| `AUTH_EMAIL_SIMULATE` | `true` se sem Resend |
| `RESEND_API_KEY` / `EMAIL_FROM` | opcional no teste |
| `BOOTSTRAP_ADMIN_*` | só para seed local/CI |

### Financeiro

| Var | Nota |
|-----|------|
| `DATABASE_URL` / `DIRECT_URL` | `schema=financeiro` |
| `CREDENTIALS_SECRET` | obrigatório |
| `SYNC_MODE` | `chunked` |
| `SYNC_CONCURRENCY` | `2` |
| `CRON_SECRET` | Bearer do cron `/api/cron/sync-salic` (08:00 BRT) |
| `NEXT_PUBLIC_SITE_URL` | `https://financeiro.maxcultural.com.br` |
| `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` | Storage (NF/RPA) + Auth legado |
| `SUPABASE_STORAGE_BUCKET_DOCS` | opcional; default `max-docs` |
| `RESEND_API_KEY` | opcional (e-mail de diligência / avisos) |

Storage: ver [`docs/supabase-storage.md`](./supabase-storage.md). Após deploy, `npm run storage:ensure-buckets` no Financeiro (ou o 1º upload cria os buckets).

### Indicadores

| Var | Nota |
|-----|------|
| `DATABASE_URL` / `DIRECT_URL` | `schema=indicadores` |
| `NEXT_PUBLIC_APP_URL` | `https://indicadores.maxcultural.com.br` |
| `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` | capas no Storage público |
| `SUPABASE_STORAGE_BUCKET_PUBLIC` | opcional; default `max-public` |
| `NEXT_PUBLIC_HIDE_INDICADORES_IAM` | `true` por padrão no código (≠ `"false"`): IAM de telas no hub; Operador com `indicadores.operacao` vê os dados |
| `AUTH_2FA_DISABLED` | `true` (login fica no Cultural; ignore no Indicadores) |
| `BOOTSTRAP_ADMIN_*` | seed-auth local |

### Auditoria (antigo Salink)

| Var | Nota |
|-----|------|
| `DATABASE_URL` / `DIRECT_URL` | até a virada: **iguais às do Financeiro** (`schema=financeiro`) |
| `CREDENTIALS_SECRET` | **o mesmo do Financeiro** (lê o login SALIC dos proponentes compartilhados) |
| `SYNC_MODE` / `SYNC_CONCURRENCY` | `chunked` / `2` |
| `CRON_SECRET` | Bearer de `/api/cron/sync-salic` e `/api/cron/sync-resume` |
| `NEXT_PUBLIC_SITE_URL` | `https://auditoria.maxcultural.com.br` |
| `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` | iguais ao Financeiro |

Acesso: permissão `auditoria.app` no hub (na transição o app também aceita `financeiro.auditoria`).

## 4. Smoke test

1. Login no Cultural → cookie abre Financeiro e Indicadores sem re-login.
2. Criar usuário + papel → permissões refletem nos satélites.
3. Ação de planejamento no Financeiro → aparece em Cultural `/logs`.
4. Ação no Indicadores (ex. import) → aparece em Cultural `/logs`.
5. Schemas sem colisão; admin do seed entra.

## Auditoria

- Fonte da verdade: **Cultural `/logs`** (+ CSV).
- Financeiro/Indicadores enviam via `POST /api/audit` (Bearer / `x-max-session`).
- Indicadores mantém cópia local em `/dashboard/acesso/auditoria` (legado; nav IAM oculta por padrão).

## 5. Auditoria (antigo Salink) — app próprio

A Auditoria é o espelho do SALIC e **não alimenta** Planejamento nem Fornecedores.
Roda no app `apps/auditoria` (`https://auditoria.maxcultural.com.br`, projeto Vercel
`max-auditoria`), com os crons de sync (`sync-salic` + `sync-resume`).

- Tabelas da Auditoria no schema `auditoria` (`Project`, `Payment`, `Supplier`, `SyncRun`,
  `WatchedSupplier`, `ObservadoBond`, `RelatedParty`, `CorporatePeriod`,
  `CorporatePeriodMember`, `NormDocumentSnapshot`) — movidas pela migration
  `20261025010000_move_audit_to_auditoria_schema` do Financeiro.
- Proponentes (`SalicAccount`), `Workspace`, `AppUser`, `ComplianceRuleset` e os enums
  ficam em `financeiro` (compartilhados). Cadastro de proponentes: MAX Financeiro `/contas`.
- O app Auditoria não roda migrations; o Financeiro continua dono da pasta de migrations.
- Links antigos do Financeiro (`/inicio`, `/panorama`, `/auditoria`, `/fornecedores-pagos`,
  `/observados`, `/contas/mapa`) redirecionam para o app Auditoria.
