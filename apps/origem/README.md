# Salink

Auditoria de gastos SALIC por fornecedor (multi-proponente).

## Stack

- Next.js (App Router) + TypeScript
- Prisma + Postgres (local Docker ou Supabase)
- Playwright (crawler fallback)
- API pública: https://api.salic.cultura.gov.br/docs

## Setup local

```bash
cp .env.example .env
npm install
npm run db:up          # Postgres em localhost:5433
npx prisma migrate dev
npm run dev
```

Abra http://localhost:3000

Sem variáveis Supabase (ou com `SALINK_DEV_OPEN=1`), o app fica aberto em local — entre em `/painel` sem login.

Com **`SALINK_DEMO=1`**: landing mostra **Experimentar demo**, app sem login, amostra de ~10% dos projetos/pagamentos; sync e cadastros ficam bloqueados.

Com Auth real (`SALINK_DEV_OPEN=0`, `SALINK_DEMO=0` + keys do Supabase):

1. Coloque seu e-mail em `ADMIN_EMAILS`
2. Crie o usuário no Supabase (ou em **Usuários**) e entre em `/login`
3. Troque a senha temporária quando pedido

Fluxo de uso:

1. Cadastre contas (CNPJ) em **Contas**
2. Rode **Atualizar** (em segundo plano, com progresso)
3. Marque fornecedores em **Fornecedores**
4. Audite em **Insights** / **Por PRONAC** (IN por projeto + briefing de auditoria + PDF)

### Escolha de IN (automática)

Cada projeto recebe uma IN **uma vez**, por ranking determinístico: cobertura dos pagamentos na vigência da IN, depois tetos/margem e vínculos. Sync não sobrescreve; override manual na tela do PRONAC.

Backfill de projetos antigos sem IN:

```bash
npx tsx scripts/backfill-project-rulesets.ts
```

## Conformidade (IN MinC nº 23/2025)

O Salink alerta quando um fornecedor (ou o próprio proponente) ultrapassa **20%** do **valor captado** do PRONAC no SALIC (base da norma; não a soma dos comprovados).

- Art. 27 — mesmo fornecedor ≤ 20%
- Art. 26 — remuneração do proponente ≤ 20% (PF/MEI até 30%)
- Exceções (restauro, obra, gráfica de livros etc.) não são aplicadas automaticamente — o alerta é preventivo

## Segurança das credenciais SALIC

- **Em repouso:** login e senha são criptografados com **AES-256-GCM** (`CREDENTIALS_SECRET`) antes de gravar no banco (`salicUsernameEnc` / `salicPasswordEnc`). A senha nunca volta em texto puro para a tela.
- **Em transporte:** em produção o app redireciona para **HTTPS** e envia **HSTS**. Use sempre HTTPS no domínio público (Vercel já fornece TLS).
- Contas antigas com login em texto puro: `npx tsx scripts/encrypt-credentials.ts`

## Performance do sync

O gargalo é a API SALIC. Otimizações seguras (sem perder dados):

- **Cache de `/produtos` por fornecedor** na mesma rodada
- **Paralelismo** via `SYNC_CONCURRENCY` (neste notebook: `4`)
- **Modo `full`** (local) / **`chunked`** (Vercel)

## Deploy sugerido: Vercel + Supabase

1. Crie o projeto no Supabase (Auth + Postgres)
2. Connection string pooler `:6543` + `?pgbouncer=true` em `DATABASE_URL`
3. `npx prisma migrate deploy`
4. Em **Authentication → URL Configuration**: Site URL = domínio Vercel; Redirect URLs inclua `https://SEU_DOMINIO/auth/callback`
5. Env no Vercel (além do sync): ver tabela abaixo — Auth + Resend + `NEXT_PUBLIC_SITE_URL`
6. Desative cadastro público no Auth (só o admin cria usuários pelo Salink / API)

## Variáveis

| Var | Uso |
|-----|-----|
| `SALINK_DEV_OPEN` | `1` = app sem login (só local). Em produção use `0` |
| `SALINK_DEMO` | `1` = demo pública (~10% dados, CTA na landing, sem login) |
| `DATABASE_URL` | Postgres / Supabase |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon (client + SSR) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (criar/resetar usuários no servidor) |
| `ADMIN_EMAILS` | Lista CSV de e-mails admin |
| `NEXT_PUBLIC_SITE_URL` | URL canônica (links de recuperação) |
| `RESEND_API_KEY` | Envio do formulário `/contato` |
| `CONTACT_TO_EMAIL` | Destino do contato (default `contato@henriquerotsen.com.br`) |
| `CREDENTIALS_SECRET` | Chave AES-256-GCM para criptografar login e senha SALIC em repouso |
| `SYNC_CONCURRENCY` | 2–8 no sync (default 4) |
| `SYNC_MODE` | `full` \| `chunked` |

## Fase 2 (não incluída)

Importação de planilhas e reconciliação com dados do SALIC. Contrapartidas/acessibilidade (checklist) ficam para fase seguinte.
