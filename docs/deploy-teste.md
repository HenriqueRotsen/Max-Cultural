# Deploy de teste — MAX Cultural (Vercel + Supabase)

Ambiente vivo nos hosts de produção. Dados podem ser limpos. SSO requer o mesmo domínio-pai.

| App | Host | Vercel Root Directory |
|-----|------|------------------------|
| Cultural | `https://maxcultural.com.br` | `apps/cultural` |
| Origem | `https://origem.maxcultural.com.br` | `apps/origem` |
| Fluxo | `https://fluxo.maxcultural.com.br` | `apps/fluxo` |

## 1. Supabase (1 projeto)

1. Crie o projeto.
2. **SQL Editor:** rode [`docs/supabase-bootstrap.sql`](./supabase-bootstrap.sql) (`vector` + schemas `origem` / `fluxo`).
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
   - Redirects: `https://maxcultural.com.br/**`, `https://origem.maxcultural.com.br/**`, `https://fluxo.maxcultural.com.br/**`, `/auth/callback`, `/login/2fa`

### Schemas

| App | `?schema=` |
|-----|------------|
| Cultural | `public` (default) |
| Origem | `origem` |
| Fluxo | `fluxo` |

## 2. Migrations + seed (one-shot, fora do build Vercel)

Na máquina local (ou CI), com as `DATABASE_URL` / `DIRECT_URL` de produção:

```bash
# Cultural (public)
cd apps/cultural && npx prisma migrate deploy && npm run db:seed

# Origem (schema origem) — NÃO rode db:seed cego (é destrutivo)
cd ../origem && npx prisma migrate deploy

# Fluxo (schema fluxo)
cd ../fluxo && npx prisma migrate deploy && npm run db:seed-auth
```

Bootstrap admin: `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` no seed do Cultural.

## 3. Vercel (4 projetos, mesmo repo)

Para cada projeto:

- **Root Directory:** `apps/cultural` | `apps/origem` | `apps/fluxo` | `apps/auditoria`
- **Install Command:** `cd ../.. && npm ci` (ou `npm install` na raiz do monorepo)
- **Build Command:** default do app (`prisma generate && next build`)
- **Não** rode migrate no build

### Envs comuns (iguais nos 4)

| Var | Valor teste |
|-----|-------------|
| `AUTH_SECRET` | mesmo segredo longo nos 4 |
| `AUTH_COOKIE_DOMAIN` | `.maxcultural.com.br` |
| `NEXT_PUBLIC_CULTURAL_URL` | `https://maxcultural.com.br` |
| `NEXT_PUBLIC_ORIGEM_URL` | `https://origem.maxcultural.com.br` |
| `NEXT_PUBLIC_FLUXO_URL` | `https://fluxo.maxcultural.com.br` |
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

### Origem

| Var | Nota |
|-----|------|
| `DATABASE_URL` / `DIRECT_URL` | `schema=origem` |
| `CREDENTIALS_SECRET` | obrigatório |
| `SYNC_MODE` | `chunked` |
| `SYNC_CONCURRENCY` | `2` |
| `CRON_SECRET` | Bearer do cron `/api/cron/sync-salic` (08:00 BRT) |
| `NEXT_PUBLIC_SITE_URL` | `https://origem.maxcultural.com.br` |
| `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` | Storage (NF/RPA) + Auth legado |
| `SUPABASE_STORAGE_BUCKET_DOCS` | opcional; default `max-docs` |
| `RESEND_API_KEY` | opcional (e-mail de diligência / avisos) |

Storage: ver [`docs/supabase-storage.md`](./supabase-storage.md). Após deploy, `npm run storage:ensure-buckets` no Origem (ou o 1º upload cria os buckets).

### Fluxo

| Var | Nota |
|-----|------|
| `DATABASE_URL` / `DIRECT_URL` | `schema=fluxo` |
| `NEXT_PUBLIC_APP_URL` | `https://fluxo.maxcultural.com.br` |
| `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` | capas no Storage público |
| `SUPABASE_STORAGE_BUCKET_PUBLIC` | opcional; default `max-public` |
| `NEXT_PUBLIC_HIDE_FLUXO_IAM` | `true` por padrão no código (≠ `"false"`): IAM de telas no hub; Operador com `fluxo.operacao` vê os dados |
| `AUTH_2FA_DISABLED` | `true` (login fica no Cultural; ignore no Fluxo) |
| `BOOTSTRAP_ADMIN_*` | seed-auth local |

### Auditoria (antigo Salink)

| Var | Nota |
|-----|------|
| `DATABASE_URL` / `DIRECT_URL` | até a virada: **iguais às do Origem** (`schema=origem`) |
| `CREDENTIALS_SECRET` | **o mesmo do Origem** (lê o login SALIC dos proponentes compartilhados) |
| `SYNC_MODE` / `SYNC_CONCURRENCY` | `chunked` / `2` |
| `CRON_SECRET` | Bearer de `/api/cron/sync-salic` e `/api/cron/sync-resume` |
| `NEXT_PUBLIC_SITE_URL` | `https://auditoria.maxcultural.com.br` |
| `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` | iguais ao Origem |

Acesso: permissão `auditoria.app` no hub (na transição o app também aceita `origem.auditoria`).

## 4. Smoke test

1. Login no Cultural → cookie abre Origem e Fluxo sem re-login.
2. Criar usuário + papel → permissões refletem nos satélites.
3. Ação de planejamento no Origem → aparece em Cultural `/logs`.
4. Ação no Fluxo (ex. import) → aparece em Cultural `/logs`.
5. Schemas sem colisão; admin do seed entra.

## Auditoria

- Fonte da verdade: **Cultural `/logs`** (+ CSV).
- Origem/Fluxo enviam via `POST /api/audit` (Bearer / `x-max-session`).
- Fluxo mantém cópia local em `/dashboard/acesso/auditoria` (legado; nav IAM oculta por padrão).

## 5. Virada da Auditoria (antigo Salink) para app próprio

A Auditoria é o espelho do SALIC e **não alimenta** Planejamento nem Fornecedores
(isolado desde o PR "Isolar a Auditoria"). O app `apps/auditoria` já existe; até a
virada ele lê as mesmas tabelas do schema `origem` e o Origem continua com as telas
e o cron de sync.

Passos (quem tem acesso à Vercel/DNS):

1. Vercel → novo projeto do repo, Root Directory `apps/auditoria`, Install `cd ../.. && npm ci`,
   envs da tabela acima.
2. DNS: CNAME `auditoria.maxcultural.com.br` → Vercel; domínio no projeto.
3. `NEXT_PUBLIC_AUDITORIA_URL` no Cultural e no Origem (o card aparece no hub).
4. No hub, dar `auditoria.app` aos papéis que usam a Auditoria.

Depois disso (PR de virada, código + banco):

- Tabelas da Auditoria → schema `auditoria` (`ALTER TABLE ... SET SCHEMA`, mantém dados):
  `Project`, `Payment`, `Supplier`, `SyncRun`, `WatchedSupplier`, `ObservadoBond`,
  `RelatedParty`, `CorporatePeriod`, `CorporatePeriodMember`, `NormDocumentSnapshot`.
  Proponentes (`SalicAccount`), `Workspace`, `AppUser` e `ComplianceRuleset` ficam no `origem`
  (compartilhados) — Prisma `multiSchema` no app Auditoria.
- Crons `sync-salic` + `sync-resume` saem do `apps/origem/vercel.json` e entram no
  `apps/auditoria/vercel.json`.
- Origem remove as telas/libs da Auditoria (`/inicio`, `/panorama`, `/auditoria`,
  `/fornecedores-pagos`, `/observados`, `/contas/mapa`) e passa a linkar para o app novo.

