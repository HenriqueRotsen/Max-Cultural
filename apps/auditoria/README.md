# MAX Auditoria (antigo Salink)

Espelho do SALIC — o "oráculo": projetos (PRONACs), pagamentos, fornecedores,
observados, mapa societário, conformidade (art. 23) e relatórios de auditoria.

**Não alimenta nenhum outro módulo.** Planejamento e Fornecedores (no MAX Origem)
são populados só pelo que é lançado neles.

- Porta local: `3003` (`npm run dev -w max-auditoria`)
- Login/permissões: SSO do hub MAX Cultural (`auditoria.app`; na transição
  também aceita `origem.auditoria`)
- Proponentes (cadastro + login SALIC) são compartilhados e cadastrados no MAX
  Origem; aqui só são lidos. `CREDENTIALS_SECRET` precisa ser o mesmo do Origem.

## Banco

Mesmo Postgres dos outros apps, com Prisma `multiSchema`:

- `auditoria`: espelho do SALIC (`Project`, `Payment`, `Supplier`, `SyncRun`,
  observados, partes relacionadas, quadro societário, snapshots de norma).
- `origem` (compartilhado, só leitura na prática): proponentes (`SalicAccount`),
  `Workspace`, `AppUser`, `ComplianceRuleset`, `audit_logs` e os enums.

O app **não roda migrations** (o `schema.prisma` daqui não conhece as tabelas do
Planejamento, que vivem no schema `origem`). As migrations continuam na pasta do
MAX Origem — a da virada é `20261025010000_move_audit_to_auditoria_schema`.

## Sync

- Cron diário `/api/cron/sync-salic` (08:00 BRT) + retomada `/api/cron/sync-resume`
  (4× ao dia) para contas que ficaram na fila.
- `/atualizacao`: acompanha e dispara a atualização manual.
