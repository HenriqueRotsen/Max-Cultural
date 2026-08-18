# SigaCultural

Sistema Integrado de Gestão e Acompanhamento Cultural — padronização de inscrições em oficinas no esquema oficial de **35 colunas** (PRONAC / Lei Rouanet).

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- **Supabase** (PostgreSQL) + Prisma ORM
- Ollama local (ETL inteligente)
- SheetJS / PapaParse

## Setup com Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).

2. Copie o ambiente:

```bash
cp .env.example .env.local
```

3. Em **Project Settings → API**, preencha:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (só servidor)

4. Em **Project Settings → Database → Connection string**, preencha:

- `DATABASE_URL` — URI do **pooler** (Transaction, porta `6543`, com `?pgbouncer=true`)
- `DIRECT_URL` — URI **direta / Session** (porta `5432`) para migrations do Prisma

5. Ajuste `AUTH_SECRET`, `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` (só para o seed do superadmin).

6. Aplique o schema no banco Supabase:

```bash
npx prisma db push
# ou, com histórico de migrations:
npx prisma migrate deploy
```

7. Crie papéis/permissões e o admin inicial:

```bash
npm run db:seed-auth
```

8. (Opcional) Ollama local:

```bash
ollama pull llama3.2
ollama serve
```

9. Rode o app:

```bash
npm run dev
```

- Home: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard (login = usuário do banco; seed cria o superadmin `BOOTSTRAP_ADMIN_EMAIL`)
- Importar: http://localhost:3000/dashboard/importar
- Inscrição pública: http://localhost:3000/inscricao/[oficinaId]

## Arquitetura de dados

| Camada | Uso |
|--------|-----|
| Supabase Postgres | Banco hospedado |
| Prisma | Schema das 35 colunas, queries, migrations |
| `@supabase/ssr` / `@supabase/supabase-js` | Clients em [`lib/supabase/`](lib/supabase/) |
| Auth admin | Cookie HMAC + usuários/papéis no Postgres |

## Variáveis

| Variável | Descrição |
|----------|-----------|
| `NEXT_PUBLIC_APP_NAME` | Nome do sistema |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon (pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (somente servidor) |
| `DATABASE_URL` | Postgres pooler (Prisma app) |
| `DIRECT_URL` | Postgres direto (Prisma migrate) |
| `OLLAMA_HOST` | Default `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Default `llama3.2` |
| `AUTH_SECRET` | Segredo HMAC do cookie de sessão |
| `BOOTSTRAP_ADMIN_EMAIL` | E-mail do superadmin (`db:seed-auth`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Senha inicial do superadmin (`db:seed-auth`) |
| `BOOTSTRAP_ADMIN_RESET` | Se `true`, redefine a senha do superadmin no seed |
