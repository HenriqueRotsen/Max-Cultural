# MAX Auditoria (antigo Salink)

Espelho do SALIC — o "oráculo": projetos (PRONACs), pagamentos, fornecedores,
observados, mapa societário, conformidade (limite do vínculo com o proponente e
teto por fornecedor, conforme a IN de cada PRONAC) e relatórios de auditoria.

**Não alimenta nenhum outro módulo.** Planejamento e Fornecedores (no MAX Financeiro)
são populados só pelo que é lançado neles.

- Porta local: `3003` (`npm run dev -w max-auditoria`)
- Login/permissões: SSO do hub MAX Cultural (`auditoria.app`; na transição
  também aceita `financeiro.auditoria`)
- Proponentes (cadastro + login SALIC) são compartilhados e cadastrados no MAX
  Financeiro; aqui só são lidos. `CREDENTIALS_SECRET` precisa ser o mesmo do Financeiro.

## Banco

Mesmo Postgres dos outros apps, com Prisma `multiSchema`:

- `auditoria`: espelho do SALIC (`Project`, `Payment`, `Supplier`, `SyncRun`,
  observados, partes relacionadas, quadro societário, snapshots de norma) e os
  vínculos por PRONAC (`ProjectObservadoBond`).
- `financeiro` (compartilhado, só leitura na prática): proponentes (`SalicAccount`),
  `Workspace`, `AppUser`, `ComplianceRuleset`, `audit_logs` e os enums.

O app **não roda migrations** (o `schema.prisma` daqui não conhece as tabelas do
Planejamento, que vivem no schema `financeiro`). As migrations continuam na pasta do
MAX Financeiro — a da virada é `20261025010000_move_audit_to_auditoria_schema`.

## Sync

- Cron diário `/api/cron/sync-salic` (08:00 BRT) + retomada `/api/cron/sync-resume`
  (4× ao dia) para contas que ficaram na fila.
- `/atualizacao`: acompanha e dispara a atualização manual.

## Limite do Vínculo com Proponente

Seção 1 do detalhe do PRONAC (antes "Limite do art. 23"; o nome não cita artigo porque
ele muda com a IN — onde o texto cita, o artigo vem da própria IN). Soma o que o
proponente e quem tem vínculo com ele receberam e compara com o limite da IN.

- **Vínculo por PRONAC:** o switch "Tem vínculo?" de cada observado grava em
  `ProjectObservadoBond` e vale **só para aquele PRONAC** (o mapa societário e as
  relações pessoais mudam durante o projeto). O lembrete do mapa societário do ano do
  PRONAC fica dentro desta seção. A tabela antiga `ObservadoBond` (vínculo por
  proponente × IN, replicado em todos os PRONACs) é só histórico: a migração
  `20261110120000_vinculo_por_pronac` copiou cada vínculo para os PRONACs em que valia,
  e o app não a lê mais.
- **Pagamento conta ou não:** cada linha de Pagamentos tem o switch "Conta p/ vínculo"
  (`Payment.countsForBond`). Vazio = automático: alimentação e refeição não contam
  (`isExcludedFromBondItem`); a marcação manual vence (`paymentCountsForBond`). A
  sincronização do SALIC preserva a marcação, inclusive quando o mesmo comprovante troca
  de origem (api × crawler, `carryBondMarks`).
- **Tela e PDF iguais:** os dois mostram o "Valor que conta" (com "—" quando nada conta)
  e, embaixo, "+ R$ X que não conta". Quando nenhum pagamento de alguém conta, a soma é
  zero — nunca cai no total pago.

Código: `components/VinculoSection.tsx`, `components/PronacDetailTables.tsx`,
`lib/compliance/bonds.ts`, `lib/compliance/context.ts` (`metaForProject`),
`lib/compliance/rouanet.ts` e `lib/reports/html.ts`.
