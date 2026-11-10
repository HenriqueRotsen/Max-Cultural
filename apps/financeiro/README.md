# MAX Financeiro

Planejamento financeiro dos projetos culturais e banco de fornecedores.

- **Planejamento:** projetos, planilha homologada/readequada, pedidos, NF/RPA, rubricas, contas a
  pagar e busca de saldo.
- **Proponentes:** cadastro dos proponentes e do login SALIC de cada um (compartilhados com a
  Auditoria). Login e senha SALIC são gravados com AES-256-GCM (`CREDENTIALS_SECRET`) e nunca voltam
  em texto puro para a tela.
- **Fornecedores:** banco de preços — fornecedores, favoritos, mapa, serviços, contratações e análises.

Não lê a Auditoria: o cron diário `/api/cron/planning-daily` (09:00 UTC) busca no SALIC, com sessão
própria, as planilhas, a situação e a captação de cada projeto. Valores reservados/pagos não são
sobrescritos.

## Banco

Schema `financeiro`. As migrações daqui também criam as tabelas da Auditoria (schema `auditoria`):
toda mudança de banco da Auditoria vira migração em `prisma/migrations`.

Local: `:3001`, subido pelo `npm run dev` da raiz.

## Scripts

`scripts/`: `seed.ts` (dados locais), `encrypt-credentials.ts` (cifra logins SALIC antigos),
`ensure-storage-buckets.ts` (buckets do Storage) e `reimport-planning-sheets.ts`.

Variáveis: `.env.example` (SSO, banco, Storage, `CRON_SECRET`, `CREDENTIALS_SECRET`, `SYNC_*`).
