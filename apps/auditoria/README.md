# MAX Auditoria

Espelho do SALIC: projetos (PRONACs), pagamentos e fornecedores de cada proponente, com a
conformidade de cada PRONAC frente à sua IN (teto por fornecedor e limite do vínculo com o
proponente), observados, mapa societário e relatórios em PDF. **Não alimenta nenhum outro app.**

Menu: Início, Alertas, Por PRONAC, Panorama geral, Fornecedores pagos, Observados, Mapa societário,
INs, Relatório de Auditoria e Atualizar SALIC.

Proponentes (cadastro + login SALIC) vêm do MAX Financeiro; aqui só são lidos (`CREDENTIALS_SECRET`
igual ao do Financeiro). Login e permissões: SSO do hub (`auditoria.app`).

## Banco

Prisma `multiSchema`: `auditoria` (espelho do SALIC, observados, mapa societário, vínculos por
PRONAC) e `financeiro` (proponentes, workspace, usuários, INs). O app **não roda migrações**: elas
ficam em `apps/financeiro/prisma/migrations`. Mudou o `prisma/schema.prisma` daqui? Escreva a migração lá.

## Sincronização com o SALIC

Cron `/api/cron/sync-salic` (08:00 BRT) e `/api/cron/sync-resume` (4× ao dia, para quem ficou na
fila); `/atualizacao` acompanha e dispara à mão. Cada PRONAC recebe uma IN uma vez, por ranking
(cobertura dos pagamentos na vigência, tetos e vínculos); a sincronização não sobrescreve e a troca
manual fica na aba "Regra aplicada (IN)" do PRONAC.

## Limite do Vínculo com Proponente

Seção 1 do detalhe do PRONAC: soma o que o proponente e quem tem vínculo com ele receberam e compara
com o limite da IN (o nome não cita artigo porque ele muda com a IN).

- **Vínculo por PRONAC:** a chave "Tem vínculo?" grava em `ProjectObservadoBond` e vale só para
  aquele PRONAC (o mapa societário e as relações mudam durante o projeto). O lembrete do mapa
  societário do ano fica dentro da seção. `ObservadoBond` (vínculo antigo por proponente × IN) é só
  histórico.
- **Pagamento conta ou não:** a chave "Conta p/ vínculo" de cada pagamento grava
  `Payment.countsForBond`; vazio = automático (alimentação e refeição não contam). A sincronização
  preserva a marcação, inclusive quando o comprovante troca de origem (api × crawler).
- **Tela e PDF iguais:** "Valor que conta" ("—" quando nada conta) e "+ R$ X que não conta".

Código: `components/VinculoSection.tsx`, `lib/compliance/` (`bonds.ts`, `context.ts`, `rouanet.ts`) e
`lib/reports/html.ts`.

## Scripts

`scripts/`: `sync.ts`, `backfill-project-rulesets.ts` (IN de projetos antigos), `backfill-valor-captado.ts`,
`import-mapa-societario-xlsx.ts`, `encrypt-credentials.ts`, `fix-salic-encoding.ts` e os `debug-*`/`test-*`
de diagnóstico do crawler. Variáveis: `.env.example`.
