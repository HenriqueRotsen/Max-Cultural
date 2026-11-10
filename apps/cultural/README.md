# MAX Cultural (hub)

Porta de entrada da suíte: login, lista de projetos e administração de acesso.

- **Login:** senha + 2FA, com o cookie `max_session` compartilhado pelos outros apps (SSO).
- **Projetos:** projetos em andamento, com o resumo de cada um.
- **Usuários e Papéis:** quem acessa o quê, com ver/editar por tela de cada app (catálogo em `@max/auth`).
- **Logs:** trilha central de auditoria; os outros apps enviam eventos por `POST /api/audit`.

Local: `:3000`, subido pelo `npm run dev` da raiz (ver o README da raiz). Schema `public`, com
migrações em `prisma/migrations`.

Scripts (`scripts/`): `seed.ts` (contas locais), `ensure-protected-superadmin.ts` e `seed-professor-role.ts`.
Variáveis: `.env.example`.
