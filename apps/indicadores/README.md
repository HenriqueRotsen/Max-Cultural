# MAX Indicadores

Execução dos projetos: inscrições nas ações (no esquema oficial de 35 colunas do PRONAC/Lei
Rouanet), análise, acompanhamento e prestação de contas.

Menu: **Operação** (Base, Análise, Acompanhamento, Prestação de contas, Contextos, Importar,
Formulários), **Consultas** (CPF, Território) e **Acesso** (Usuários, Papéis, Auditoria).
Hierarquia dos dados: Contexto → Projeto → Ação. Páginas públicas: inscrição numa ação
(`/inscricao/[acaoId]`) e formulários (`/f/[slug]`).

Local: `:3002` (webpack), subido pelo `npm run dev` da raiz. Schema `indicadores`, com migrações em
`prisma/migrations`. Variáveis: `.env.example`.

## Base completa (`/dashboard`)

Filtros em cascata: cada filtro (Projeto, Ação, Proponente, PRONAC, Ano) mostra só o que combina com
os outros já escolhidos. As opções saem das próprias inscrições, com um `groupBy` por filtro usando
"todos os filtros menos o próprio" — o mesmo padrão da Análise (`app/actions/inscricoes.ts`).

## Acompanhamento

O cron `/api/cron/acompanhamento-recurso` (07:30 BRT) confere o "recurso liberado" dos projetos que
ainda aguardam, no projeto ligado do MAX Financeiro. Roda depois do cron do Financeiro, que atualiza a
captação pelo SALIC.

## Proponentes

Proponente é texto livre (projeto e planilhas), então o mesmo proponente aparece escrito de vários
jeitos. `lib/proponente.ts`:

- `proponenteKey` compara sem acento, caixa, pontuação, CNPJ/CPF no nome e sufixos jurídicos (LTDA,
  ME, EPP, EIRELI, S/A…);
- `PROPONENTE_APELIDOS` junta nomes diferentes confirmados pela equipe (ex.: "Instituto Vivas" →
  "Instituto Morada Vivas") — para um par novo, inclua a chave aqui;
- fica sempre o nome mais completo (`nomeCanonico`).

Os filtros da Base e da Análise mostram uma opção por proponente e acham todas as grafias; projeto
novo ou editado reaproveita a grafia já cadastrada. Para unificar o que está gravado:

```bash
npm run dev -- run indicadores npx tsx scripts/unificar-proponentes.ts   # local, dry-run (--aplicar grava)
npm run indicadores:unificar-proponentes:producao                       # produção, na raiz (ver docs/git-flow.md)
```

Com `--aplicar`, o script salva antes um backup JSON em `backups/` (fora do git). Nomes de teste não são
alterados; pares parecidos aparecem como "possíveis duplicados" para revisão.

## Scripts

`scripts/`: `seed-auth.ts` (papéis e admin), `seed-base.ts`/`seed-demo.ts` (dados), `unificar-proponentes.ts`
e as correções de dados `fix-*`, `split-territorio-composto.ts`, `strip-string-fields.ts`,
`reassign-id-projeto.ts` e `migrate-hierarquia-contexto.ts`.
