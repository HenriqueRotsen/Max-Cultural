# MAX Cultural

Monorepo da suíte MAX (Next.js 16 + Prisma 7 + Postgres/Supabase), com quatro apps e um login único.

| App         | Para quê                                                         | Host (produção)                  | Local | Pasta              |
| ----------- | ---------------------------------------------------------------- | -------------------------------- | ----- | ------------------ |
| Cultural    | Hub: login, projetos, usuários, papéis e logs                    | `maxcultural.com.br`             | :3000 | `apps/cultural`    |
| Financeiro  | Planejamento (planilha, pedidos, contas a pagar) e fornecedores  | `financeiro.maxcultural.com.br`  | :3001 | `apps/financeiro`  |
| Indicadores | Inscrições, análise, acompanhamento e prestação de contas        | `indicadores.maxcultural.com.br` | :3002 | `apps/indicadores` |
| Auditoria   | Espelho do SALIC e conformidade com a IN de cada PRONAC          | `auditoria.maxcultural.com.br`   | :3003 | `apps/auditoria`   |

Cada app tem seu README. Pacotes compartilhados em `packages/`:

| Pacote                  | Para quê |
| ----------------------- | -------- |
| `@max/auth`             | Sessão do hub (SSO) e catálogo de acessos |
| `@max/ui`               | `SearchSelect` (todo menu de seleção) e `ConfirmDialog` |
| `@max/mobile-nav`       | Navegação no celular (barra no rodapé + menu lateral) |
| `@max/security-headers` | Cabeçalhos de segurança (CSP, HSTS…) |
| `@max/brand`            | Logos e imagens da marca |

Um pacote novo entra no `transpilePackages` do `next.config.ts` de cada app que o usa; se tiver CSS,
ele é importado no `globals.css` do app.

## Rodar localmente

Tudo roda num Postgres local (Docker, `localhost:5436`) com dados demo — **nunca no banco de produção**.

```bash
MAX_AMBIENTE=teste npm install   # sem o MAX_AMBIENTE, o prisma generate lê o .env.local (produção) e é barrado
npm run dev -- setup             # 1ª vez: banco local, migrações, contas e dados demo
npm run dev                      # os 4 apps (ou só alguns: npm run dev -- indicadores)
npm run dev -- reset             # apaga o banco local e refaz o setup
npm run dev -- liberar           # simula "recurso liberado" em todos os projetos
npm run dev -- run financeiro npx prisma migrate dev --name minha_mudanca   # comando de um app no banco local
```

Login: `admin@maxcultural.local` em http://localhost:3000, senha `TESTE_PASSWORD` do `.env.teste`
(criado no setup, fora do git). Também existem `operador@` e `professor@maxcultural.local`.

Os `.env.local` de cada app guardam a **produção** e só servem aos comandos `…:producao`
(ver [`docs/git-flow.md`](docs/git-flow.md)). Fora da Vercel, apps, Prisma e seeds se recusam a abrir
o banco de produção (`bloquearProducao`).

## Login e permissões

Login único no Cultural (senha + 2FA; `AUTH_2FA_DISABLED=true` só no ambiente local). O cookie
`max_session` vale para `.maxcultural.com.br` e os outros apps o aceitam com o mesmo `AUTH_SECRET`.
Usuários, papéis (ver/editar por tela) e a trilha de logs (`/logs`) ficam no Cultural; os outros apps
enviam eventos por `POST /api/audit`.

## Banco

Um Postgres (Supabase) com um schema por app: `public` (Cultural), `financeiro`, `indicadores` e
`auditoria`. A Auditoria não tem migrações próprias: as dela ficam em `apps/financeiro/prisma/migrations`.
Arquivos (NF, comprovantes, capas) vão para o Supabase Storage ([`docs/supabase-storage.md`](docs/supabase-storage.md)).

## Menus de seleção

Todo menu de seleção usa o `SearchSelect` de `@max/ui` (nada de `<select>` nativo): busca sem acento e
por partes ("sao jo" acha "São João"). Funciona controlado (`value` + `onValueChange`) ou em formulário
como um `<select>` (`name`, `defaultValue`, `required`); `emptyOption="Todos"` cria a opção vazia e
`submitOnChange` envia o formulário ao escolher. No Indicadores, use `@/components/ui/search-select`
(mesmo componente no visual do shadcn) ou o `SimpleSelect`.

## Deploy, git e CI

- Quatro projetos Vercel no mesmo repositório (Root Directory = pasta do app). Checklist e variáveis:
  [`docs/deploy-teste.md`](docs/deploy-teste.md); cada app tem um `.env.example`.
- Branches, commits, migrações na produção e scripts de dados: [`docs/git-flow.md`](docs/git-flow.md).
- CI: `tsc` e `vitest` dos 4 apps, ESLint, `npm audit`, Gitleaks, CodeQL e Semgrep. Nunca commitar `.env`.
