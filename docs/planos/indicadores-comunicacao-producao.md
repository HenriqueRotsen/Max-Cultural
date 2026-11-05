# Plano — Comunicação e Produção no MAX Indicadores

Origem da demanda: apresentação “Framework geral — Comunicação e Produção” (Jussara Vieira, VIVAS 2026).
Na apresentação o módulo aparece como **MAX Fluxo** (hoje **MAX Indicadores**) e o Financeiro como **MAX Origem** (hoje **MAX Financeiro**).

## 1. O que a demanda pede

- Um **acompanhamento por projeto** para as equipes de Comunicação e Produção, que hoje usam planilhas, Word, Drive e Asana separados.
- **Tarefas-modelo** já cadastradas, que se repetem em todo projeto. A equipe só marca o status. Os nomes e o detalhamento podem ser editados.
- **Dois níveis de tarefas:**
  - **Nível 1 — por projeto**, por fase: Planejamento → Estruturação → Fluxo contínuo → Encerramento.
  - **Nível 2 — por ação** (ex.: cada oficina) ou **por cidade** (produção), com as fases Antes → Durante → Depois.
- **Status da equipe:** Não contemplada · Não iniciada · Em andamento · Concluída.
  - "Não contemplada" é para a tarefa que não se aplica àquela ação.
- **Status de gestão:** calculado pelo prazo (No prazo · Prazo próximo · Em atraso · Concluída).
  - Os prazos vêm das datas de execução do projeto (ex.: SALIC).
  - As tarefas **começam quando a captação foi concluída e o recurso liberado**, com as datas ligadas ao MAX Financeiro.
- **Ocorrências** (ex.: "hotel sem faturamento"), com impacto. Aparecem no painel da gestão.
- **Telas** (slides 15–17): uma página por projeto com as abas **Gestão · Comunicação · Produção · Ocorrências**.
  - **Gestão:** cartões de indicador (ações, % de Comunicação, % de Produção, itens que pedem atenção), filtros (área, nível, ação/cidade, status, responsável) e um painel de ações ordenado das mais críticas para as mais tranquilas.
  - **Comunicação e Produção** usam a mesma estrutura:
    - nível 1 em cartões por fase;
    - nível 2 recolhido por ação ou cidade, com as concluídas escondidas;
    - status trocado no próprio chip;
    - ações por tarefa: editar, observação e "escalar" para a gestão.
  - **Produção, nível 2:** tarefas da cidade têm um status único; tarefas da oficina têm um status por data.

## 2. O que existe hoje no Indicadores (e o que falta)

| Precisa | Hoje |
|---|---|
| Projeto | `Projeto` (`id`, `nome`, `pronac`, `proponente`, `ano`, `contextoId`). Não tem datas e não tem ligação com o Financeiro além do texto `pronac` |
| Ação / oficina | `Oficina`. Não tem datas |
| Cidade | `OficinaTerritorio` (`cidade`, `estado` em texto livre) |
| Datas de execução / captação liberada | Não existem no Indicadores. No Financeiro, `PlanningProject` tem `valorCaptado`, `captadoRecebido`, `captadoTransferido`, `situacao`, `lifecycleStatus`, mas nenhuma data de "recurso liberado" nem de período de execução |
| Tarefas, fases, prazos, ocorrências | Nada |
| Permissões | Hub: `indicadores.operacao/formularios/consultas`, mapeadas para os códigos locais (`lib/permission-catalog.ts`) |
| Tela "Acompanhamento" | Não existe; `/projeto/[idProjeto]` não tem abas |

## 3. Modelo de dados (schema `indicadores`)

- **`TarefaModelo`** — o padrão de tarefas, editável.
  - `area` (COMUNICACAO | PRODUCAO), `nivel` (1 | 2), `fase` (PLANEJAMENTO, ESTRUTURACAO, FLUXO_CONTINUO, ENCERRAMENTO, ANTES, DURANTE, DEPOIS).
  - `titulo`, `detalhamento`, `unidade` (PROJETO | ACAO | CIDADE), `ordem`, `ativo`.
  - **Prazo relativo:** `prazoBase` (INICIO_EXECUCAO | FIM_EXECUCAO | DATA_ACAO) + `prazoDias` (ex.: D-7, D+15).
  - Vem pré-cadastrado com as tarefas da apresentação (slides 6–9 e 11–14).
- **`AcompanhamentoProjeto`** — uma linha por `Projeto`.
  - `pronac`, `inicioExecucao`, `fimExecucao`, `recursoLiberadoEm` (marco que libera as tarefas).
  - `financeiroProjectId?` (referência ao `PlanningProject`, só leitura).
- **`AcaoAgenda`** — cada realização de uma ação: `projetoId`, `oficinaId?`, `cidade`, `uf`, `data`, `titulo` (ex.: "Oficina 2 · 09/11").
  - Agrupa por cidade para a Produção.
- **`Tarefa`** — instância por projeto, criada a partir do modelo.
  - `modeloId?` (nulo na "tarefa avulsa"), `area`, `nivel`, `fase`, `titulo`, `detalhamento`.
  - Alvo: `projetoId` + (`acaoId` | `cidade`/`uf`).
  - `status` (NAO_CONTEMPLADA | NAO_INICIADA | EM_ANDAMENTO | CONCLUIDA), `prazo`, `responsavelId?`, `concluidaEm`, `atualizadoPor`.
- **`TarefaComentario`** — observações; `escalada: boolean` faz o comentário aparecer na Gestão.
- **`Ocorrencia`** — `projetoId`, `area`, `acaoId?`/`cidade`, `impacto` (BAIXO | MEDIO | ALTO), `descricao`, `decidirAte?`, `status` (ABERTA | RESOLVIDA).
- O **status de gestão não é gravado**: ele é calculado (prazo × status × hoje). "Prazo próximo" vale a partir de 3 dias.

## 4. Ligação com o MAX Financeiro (datas e "recurso liberado")

- O Indicadores lê o `PlanningProject` pelo PRONAC: uma API só de leitura no Financeiro, `GET /api/indicadores/projeto/{pronac}`, autenticada com token interno (mesmo padrão do `/api/hub/by-pronac`).
- Ela devolve situação, valores de captação e datas.
- **"Recurso liberado"** é sugerido automaticamente quando `captadoTransferido > 0` ou a situação do SALIC é de execução (E10/E12…). A gestão confirma a data no Indicadores, porque o Financeiro não tem essa data hoje.
- **Período de execução** (início e fim): digitado no acompanhamento, com sugestão vinda do Financeiro e do SALIC quando houver.
- Enquanto não houver "recurso liberado", as tarefas aparecem como "aguardando liberação", sem atraso.

## 5. Telas

- **Menu (Operação):** **Acompanhamento**, com a lista de projetos acompanhados, o % de cada área e os itens que pedem atenção.
- **`/acompanhamento/[projetoId]`**, com as abas:
  - **Gestão:** cartões (ações, % Comunicação, % Produção, pedem atenção), filtros, painel de ações por criticidade e "Exportar XLSX".
  - **Comunicação / Produção:** nível 1 em cartões por fase e nível 2 por ação ou cidade (recolhido); chip de status com menu; editar, observação e escalar; "+ Tarefa avulsa".
  - **Ocorrências:** lista e cadastro.
- **Configuração:** "Modelos de tarefas" (área, nível, fase, prazo), para editar o padrão. Não muda as tarefas de projetos já criados, exceto se pedido.
- O visual segue o Indicadores atual (Tailwind + shadcn em `components/ui`). Falta só um componente de abas.

## 6. Permissões

- Novos ids no hub (`packages/auth/src/access-catalog.ts`, telas do grupo Indicadores):
  - `indicadores.acompanhamento` — ver.
  - `indicadores.comunicacao` — editar as tarefas de Comunicação.
  - `indicadores.producao` — editar as tarefas de Produção.
  - `indicadores.acompanhamento.gestao` — capacidade: editar modelos, datas do projeto e ocorrências, e resolver escaladas.
- Mapeamento em `HUB_TO_INDICADORES_PERMISSIONS`, mais códigos locais (`acompanhamento:read`, `comunicacao:write`, `producao:write`, `acompanhamento:gestao`).
- A regra da apresentação: "Equipe de comunicação edita · gestão e produção consultam", e o inverso para a Produção.
- O superadmin já recebe tudo (`*`).

## 7. Git flow e Conventional Commits

- **Branches:**
  - `main` = produção (Vercel publica a `main`).
  - `develop` = integração e homologação (**já criada a partir da `main`**).
  - `feature/<nome>`: sai da `develop` e volta por PR para a `develop`.
  - `release/<versão>`: sai da `develop` e vai por PR para a `main`; recebe a tag `vX.Y.Z` e volta para a `develop`.
  - `hotfix/<nome>`: sai da `main` e volta para a `main` e para a `develop`.
- **Commits** no formato Conventional Commits:
  - `feat(indicadores): …`, `fix(indicadores): …`, `chore: …`, `docs: …`, `test(indicadores): …`.
  - Escopo = app ou pacote.
  - `!` ou `BREAKING CHANGE:` quando quebra algo.
- **CI** (`security.yml`): passa a rodar também em push para a `develop`. Acrescentar `vitest` e `next build` do Indicadores nos PRs, porque hoje não rodam.
- **Versão:** `release/indicadores-1.0.0` → tag `indicadores-v1.0.0`, com CHANGELOG gerado a partir dos commits.

## 8. Ambiente de homologação (para você testar na branch)

Hoje as prévias da Vercel **não têm banco configurado**: `DATABASE_URL`, `AUTH_SECRET` etc. existem só em produção. Para testar sem tocar nos dados reais:

1. **Banco de homologação:** um projeto Supabase separado (ex.: `max-staging`), montado com `docs/supabase-bootstrap.sql` e as migrações de todos os apps.
   - Dados: os seeds de demonstração e uma cópia **sem dados pessoais** de alguns projetos.
2. **Domínios fixos para a `develop`** na Vercel (variáveis só da branch `develop`):
   - Hub: `homolog.maxcultural.com.br`
   - Indicadores: `indicadores-homolog.maxcultural.com.br`
   - Financeiro: `financeiro-homolog.maxcultural.com.br` (para a ligação de datas)
   - Cada um com `DATABASE_URL` de homologação, `AUTH_SECRET` próprio e `AUTH_COOKIE_DOMAIN=.maxcultural.com.br`.
   - A sessão de produção não vale lá, porque a assinatura é outra. O login é separado.
3. **Migrações:** rodadas na homologação a cada merge na `develop`. Na produção, só no PR de `release`, com sua autorização.
4. **Fluxo para você testar:**
   - a feature entra na `develop`;
   - você testa em `indicadores-homolog`;
   - quando aprovar, abro `release/…` → `main`.

## 9. Etapas (cada uma uma `feature/…` → PR na `develop`)

1. **`chore/git-flow-homologacao`** — CI na `develop`, testes e build do Indicadores no CI, documento do fluxo e configuração da homologação na Vercel (depois de você criar o Supabase).
2. **`feature/indicadores-acompanhamento-modelo`** — migração com os modelos da seção 3, seed das tarefas da apresentação e testes do cálculo de status e prazo.
3. **`feature/indicadores-acompanhamento-datas`** — API do Financeiro, datas do projeto, `AcaoAgenda` (cadastro das realizações por oficina e cidade) e geração das tarefas a partir dos modelos.
4. **`feature/indicadores-acompanhamento-telas`** — lista, página do projeto com as abas Comunicação e Produção (níveis 1 e 2, chips, observação, escalar, tarefa avulsa) e permissões.
5. **`feature/indicadores-acompanhamento-gestao`** — aba Gestão (cartões, filtros, painel por criticidade), Ocorrências e exportação XLSX.
6. **`feature/indicadores-modelos-tarefas`** — tela para editar os modelos.
7. **`release/indicadores-1.0.0`** — migração em produção (com sua autorização), merge na `main`, tag e deploy.

Cada etapa tem testes unitários (status e prazos, geração de tarefas, permissões) e é testada no navegador na homologação antes do merge.

## 10. Decisões em aberto

- **Banco de homologação:** é preciso criar um projeto Supabase separado (gratuito). É uma ação na sua conta.
- **"Recurso liberado":** a gestão confirma a data no Indicadores com sugestão do Financeiro (proposta) ou ela é só automática?
- **Escopo da 1ª entrega:** sugestão: etapas 1–4 primeiro (Comunicação e Produção funcionando); Gestão, Ocorrências e editor de modelos na sequência.
