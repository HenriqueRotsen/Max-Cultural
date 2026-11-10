# MAX Indicadores (antigo SigaCultural)

Sistema Integrado de Gestão e Acompanhamento Cultural — padronização de inscrições em oficinas no esquema oficial de **35 colunas** (PRONAC / Lei Rouanet).

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- **Supabase** (PostgreSQL) + Prisma ORM
- Ollama local (ETL inteligente)
- SheetJS / PapaParse

## Rodar localmente

Na raiz do repo: `npm run dev` (banco local com dados demo). Ver o README da raiz. O banco de produção é bloqueado fora da Vercel.

## Base completa (`/dashboard`)

Filtros em cascata: cada filtro (Projeto, Ação, Proponente, PRONAC, Ano) mostra só as
opções que combinam com os outros já escolhidos. As opções saem das próprias inscrições,
com um `groupBy` por filtro usando "todos os filtros menos o próprio" — o mesmo padrão da
Análise (`listInscricoesAction` em `app/actions/inscricoes.ts`).

## Proponentes

Proponente é texto livre (no projeto e na planilha de inscrições), então o mesmo
proponente pode aparecer escrito de vários jeitos. `lib/proponente.ts` resolve isso:

- `proponenteKey`: compara sem acento, caixa, pontuação, CNPJ/CPF no nome e sufixos
  jurídicos (LTDA, ME, EPP, EIRELI, S/A…).
- `PROPONENTE_APELIDOS`: nomes diferentes que a equipe confirmou serem o mesmo
  proponente (ex.: "Instituto Vivas" → "Instituto Morada Vivas"). Para juntar um par novo,
  inclua a chave aqui.
- Fica sempre o nome mais completo (`nomeCanonico`).

Onde vale: os filtros da Base e da Análise mostram uma opção por proponente e encontram
todas as grafias; projeto novo ou editado reaproveita a grafia já cadastrada
(`proponenteParaGravar`).

Para unificar o que já está gravado, use `scripts/unificar-proponentes.ts`. Sem
`--aplicar` ele só mostra o que faria (dry-run); com `--aplicar` grava e salva antes um
backup JSON em `backups/` (fora do git). Nomes de teste ("Teste", "Demo"…) não são
alterados, e pares parecidos aparecem como "possíveis duplicados" para revisão.

```bash
npm run dev -- run indicadores npx tsx scripts/unificar-proponentes.ts            # local, dry-run
npm run indicadores:unificar-proponentes:producao                                # produção, dry-run (na raiz)
npm run indicadores:unificar-proponentes:producao -- --aplicar                   # produção, grava (pede "producao")
```

Na produção, só com autorização. A primeira unificação foi aplicada em 10/11/2026
(Ateliê 22, Instituto Morada Vivas e Vivas Cultura e Esporte LTDA).

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
npx tsx scripts/seed-auth.ts
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
| `BOOTSTRAP_ADMIN_EMAIL` | E-mail do superadmin (`scripts/seed-auth.ts`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | Senha inicial do superadmin (`scripts/seed-auth.ts`) |
| `BOOTSTRAP_ADMIN_RESET` | Se `true`, redefine a senha do superadmin no seed |
