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

## 3. Vercel (3 projetos, mesmo repo)

Para cada projeto:

- **Root Directory:** `apps/cultural` | `apps/origem` | `apps/fluxo`
- **Install Command:** `cd ../.. && npm ci` (ou `npm install` na raiz do monorepo)
- **Build Command:** default do app (`prisma generate && next build`)
- **Não** rode migrate no build

### Envs comuns (iguais nos 3)

| Var | Valor teste |
|-----|-------------|
| `AUTH_SECRET` | mesmo segredo longo nos 3 |
| `AUTH_COOKIE_DOMAIN` | `.maxcultural.com.br` |
| `NEXT_PUBLIC_CULTURAL_URL` | `https://maxcultural.com.br` |
| `NEXT_PUBLIC_ORIGEM_URL` | `https://origem.maxcultural.com.br` |
| `NEXT_PUBLIC_FLUXO_URL` | `https://fluxo.maxcultural.com.br` |

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
| `NEXT_PUBLIC_SITE_URL` | `https://origem.maxcultural.com.br` |
| `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` | se ainda usar Auth legado |

### Fluxo

| Var | Nota |
|-----|------|
| `DATABASE_URL` / `DIRECT_URL` | `schema=fluxo` |
| `NEXT_PUBLIC_APP_URL` | `https://fluxo.maxcultural.com.br` |
| `NEXT_PUBLIC_HIDE_FLUXO_IAM` | `true` (IAM no hub) |
| `AUTH_2FA_DISABLED` | `true` (login fica no Cultural; ignore no Fluxo) |
| `BOOTSTRAP_ADMIN_*` | seed-auth local |

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
