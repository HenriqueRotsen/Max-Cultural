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

Até a virada, lê as **mesmas tabelas do schema `origem`** e não tem migrations
próprias (quem migra é o MAX Origem). Na virada, as tabelas da Auditoria vão para
o schema `auditoria` — passo a passo em `docs/deploy-teste.md` (seção Auditoria).

## Sync

- `/atualizacao`: acompanha e dispara a atualização manual.
- Crons (`/api/cron/sync-salic`, `/api/cron/sync-resume`) entram no `vercel.json`
  só na virada, para não sincronizar em dobro com o MAX Origem.
