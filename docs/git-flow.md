# Git flow e commits

## Branches

| Branch | Para quê | Publica em |
|---|---|---|
| `main` | Sistema publicado (os usuários testam aqui) | `maxcultural.com.br`, `financeiro.`, `indicadores.`, `auditoria.` |
| `develop` | Integração | Prévia da Vercel |
| `feature/<nome>` | Uma funcionalidade | Prévia da Vercel (sem banco) |
| `release/<app>-<versão>` | Preparar uma versão para a produção | — |
| `hotfix/<nome>` | Correção urgente na produção | — |

Fluxo:

1. `feature/…` sai da `develop` e volta por **PR para a `develop`**.
2. Cada funcionalidade é testada localmente (`npm run dev`) antes do PR.
3. Para publicar, abre-se um **PR da `develop` (ou de uma `release/…`) para a `main`**. No merge:
   - as migrações vão para a produção, **com autorização e antes do merge na `main`**: o código novo é publicado assim que o merge acontece e pode depender da tabela ou coluna nova. Rode a partir de um checkout com a `develop` atualizada (num checkout antigo o comando diz que está tudo em dia e não aplica nada): `npm run db:migrate:producao -- status` e depois `npm run db:migrate:producao` (pede para digitar `producao`). Se uma migração não for compatível com o código que está no ar, combine a ordem antes;
   - a `main` recebe a tag `<app>-vX.Y.Z`;
   - a `main` volta para a `develop` (merge de volta).
4. `hotfix/…` sai da `main`, vai por PR para a `main` e depois é levado para a `develop`.

## Scripts de dados na produção

Correções de dados que não são migração ficam em scripts com dry-run, rodados só com autorização:

| Comando (na raiz) | O que faz |
|---|---|
| `npm run indicadores:unificar-proponentes:producao` | Mostra as grafias de proponente que seriam unidas (dry-run). Com `-- --aplicar`, grava depois de digitar `producao` e salva um backup em `apps/indicadores/backups/`. Regras em `apps/indicadores/lib/proponente.ts`. |

Como o `db:migrate:producao`, eles leem a credencial do `.env.local` do app e só abrem a produção com `MAX_AMBIENTE=producao`.

## Conventional Commits

```
<tipo>(<escopo>): <resumo no imperativo>

<corpo opcional: o porquê>

BREAKING CHANGE: <o que quebra> (quando houver)
```

- **Tipos:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`, `build`.
- **Escopo:** o app ou pacote: `indicadores`, `financeiro`, `auditoria`, `cultural`, `auth`, `ui`.
- **`!`** depois do escopo (`refactor(indicadores)!: …`) indica mudança que quebra compatibilidade.

## Ambiente local

Cada etapa é desenvolvida e testada localmente, e só vai para a `develop` quando estiver ok.
Nenhum comando local usa o banco de produção:

```bash
MAX_AMBIENTE=teste npm install   # sem o MAX_AMBIENTE, o prisma generate do pós-instalação lê o .env.local (produção) e é barrado
npm run dev -- setup     # 1ª vez: Postgres local (localhost:5436), migrações, contas e dados demo
npm run dev              # os 4 apps no banco local (Cultural :3000, Financeiro :3001, Indicadores :3002, Auditoria :3003)
npm run dev -- liberar   # simula "recurso liberado" em todos os projetos
npm run dev -- reset     # apaga o banco local e refaz o setup
```

`npm run dev:teste` é o mesmo comando.

- **Login:** `admin@maxcultural.local` em http://localhost:3000. A senha é `TESTE_PASSWORD` em `.env.teste`, na raiz, criado no primeiro setup e ignorado pelo git. Existem também `operador@` e `professor@maxcultural.local`, com a mesma senha.
- **Segurança:**
  - os `.env.local` de cada app guardam a produção e só são usados por `npm run db:migrate:producao`;
  - o script zera todas as variáveis deles no processo e liga `MAX_AMBIENTE`, que impede o Prisma e os seeds de recarregarem o `.env.local`;
  - o script aborta se algum valor apontar para a produção ou para fora do localhost;
  - fora da Vercel, os apps, o Prisma e os seeds se recusam a abrir o banco de produção (`bloquearProducao`).

## CI (`.github/workflows`)

- **`ci.yml`:** `prisma generate`, `tsc` e `vitest` dos 4 apps. Roda na `main`, na `develop`, em `release/**`, em `hotfix/**` e em todo PR.
- **`security.yml`:** audit, ESLint, gitleaks, CodeQL e semgrep. Roda na `main`, na `develop` e em todo PR.
