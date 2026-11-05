# Git flow, commits e homologação

## Branches

| Branch | Para quê | Publica em |
|---|---|---|
| `main` | Produção | `maxcultural.com.br`, `financeiro.`, `indicadores.`, `auditoria.` |
| `develop` | Integração e testes | `homolog.maxcultural.com.br`, `financeiro.homolog.`, `indicadores.homolog.`, `auditoria.homolog.` |
| `feature/<nome>` | Uma funcionalidade | Prévia da Vercel (sem banco) |
| `release/<app>-<versão>` | Preparar uma versão para a produção | — |
| `hotfix/<nome>` | Correção urgente na produção | — |

Fluxo:

1. `feature/…` sai da `develop` e volta por **PR para a `develop`**.
2. Depois do merge, a `develop` publica na homologação. Quem pediu testa lá.
3. Aprovado, abre-se `release/…` a partir da `develop` e um **PR para a `main`**. No merge:
   - as migrações vão para a produção, **com autorização**;
   - a `main` recebe a tag `<app>-vX.Y.Z`;
   - a `main` volta para a `develop` (merge de volta).
4. `hotfix/…` sai da `main`, vai por PR para a `main` e depois é levado para a `develop`.

## Conventional Commits

```
<tipo>(<escopo>): <resumo no imperativo>

<corpo opcional: o porquê>

BREAKING CHANGE: <o que quebra> (quando houver)
```

- **Tipos:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `build`.
- **Escopo:** o app ou pacote: `indicadores`, `financeiro`, `auditoria`, `cultural`, `auth`, `ui`.
- **`!`** depois do escopo (`refactor(indicadores)!: …`) indica mudança que quebra compatibilidade.

## Ambiente local (antes da homologação)

Cada etapa é desenvolvida e testada localmente. Só vai para `develop` (homologação) quando estiver ok.

```bash
npm run db:local:up -w max-cultural-app   # Postgres local (localhost:5436), uma vez
npm run dev:local -- setup                # banco max_local: migrações, contas e dados demo
npm run dev:local                         # MAX Cultural :3000 + MAX Indicadores :3002
npm run dev:local -- liberar              # simula "recurso liberado" em todos os projetos
npm run dev:local -- reset                # apaga o banco local e refaz o setup
```

- **Login:** `admin@maxcultural.local` em http://localhost:3000. A senha está em `.env.dev-local`, na raiz, criado no primeiro setup e ignorado pelo git. Existem também `operador@` e `professor@maxcultural.local`, com a mesma senha.
- **Segurança:**
  - os `.env.local` continuam apontando para a produção e não são alterados;
  - o script zera todas as variáveis deles no processo e liga `MAX_LOCAL_STACK=1`, que impede o Prisma, os seeds e o hub de recarregarem o `.env.local`;
  - o script aborta se algum endereço apontar para fora do localhost.

## Homologação

- **Banco:** projeto Supabase `max-homolog`, separado da produção. As credenciais ficam em `.env.homolog` na raiz, arquivo ignorado pelo git.
- **Vercel:** variáveis só da branch `develop`, nos 4 projetos.
  - Cookie de sessão em `.homolog.maxcultural.com.br`, então o login não interfere na produção.
  - 2FA e envio de e-mail desligados.
- **Proteção da Vercel:** os 4 endereços `homolog` têm exceção (abrem direto no login do MAX). As outras prévias continuam protegidas.
- **Migrações:**

  ```bash
  npm run db:migrate:homolog -- status   # o que falta
  npm run db:migrate:homolog             # aplica nos 3 apps (Auditoria usa as do Financeiro)
  ```

  Os `prisma.homolog.config.ts` não leem o `.env.local`, que aponta para a produção. O script se recusa a rodar se o `.env.homolog` apontar para o host da produção.
- **Dados:** seeds de demonstração; nada de dados pessoais da produção.

## CI (`.github/workflows`)

- **`ci.yml`:** `prisma generate`, `tsc` e `vitest` dos 4 apps. Roda na `main`, na `develop`, em `release/**`, em `hotfix/**` e em todo PR.
- **`security.yml`:** audit, ESLint, gitleaks, CodeQL e semgrep. Roda na `main`, na `develop` e em todo PR.
