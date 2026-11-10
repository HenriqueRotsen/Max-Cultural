# Prestação de contas no MAX Indicadores

Base: apresentação "1 - framework_PRESTACAO DE CONTAS_por projeto" (VIVAS 2026).

## 1. O que a apresentação descreve

Hoje a prestação de contas é uma **planilha por projeto, com uma linha por ação**. Cada equipe preenche a sua parte, quase sempre com textos, números e **links para o drive** (não há envio de arquivos):

- **Produção:** status (Confirmada / Agendada / Realizada), "conta como ação", tipo de escola ou instituição, inscritos, vagas, público, PCDs, carga horária, local, cidade/UF, datas, horários, mês, quantidade de meses, tipo de ação, categoria, identidade/inclusão, professor/artista, pesquisa de avaliação, observações e pasta de fotos.
- **Comunicação:** release, relatório de redes sociais, clipping, apostila, mídia paga (descrição e relatório) e pasta de cobertura.
- **Gestão:** produto e meta (ligados ao que foi prometido no PRONAC, na LEIC ou em outra lei), formulário de inscrição, respostas, lista de presença ou borderô, certificados, Instagram, prints e fotos (incluindo as de acessibilidade).

Na saída, a gestão gera **um relatório por produto**, mais os anexos (clipping, apostila, listas de presença, borderôs, certificados), e envia ao SALIC ou a outras plataformas. Também precisa:
- **exportar** os dados em Excel/CSV com filtros (período, projeto, patrocinador, proponente);
- de **painéis** para acompanhar a execução e montar portfólios e books de captação.

## 2. O que o sistema já tem (não será digitado de novo)

| Na planilha | Já vem de |
|---|---|
| Ano, proponente, nome do projeto, PRONAC | Projeto |
| Nome da ação, tipo de ação | Ação |
| Cidade/Estado, local (território) | Território da execução, na agenda |
| Data de início, data final, mês, quantidade de meses | Período da execução, na agenda |
| Inscritos, selecionados, participantes, PCDs, certificados | Inscrições da ação (importação e formulários) |
| Formulário de inscrição e planilha de respostas | Formulários da ação no próprio sistema (título, período, perguntas, respostas) |
| Lista de selecionados, de participantes e de certificados | Inscrições da ação (quem foi selecionado, participou e recebeu certificado); o sistema gera a lista |
| Pesquisa de avaliação e depoimentos | Formulários de avaliação da ação (respostas de múltipla escolha somadas; textos para escolher como depoimento) |
| Perfil do público (gênero, raça/cor, idade, PCD, território) | Inscrições (o mesmo perfil sociodemográfico que o Indicadores já mostra) |

Esses campos aparecem já preenchidos. A equipe pode corrigir um valor quando o dado do sistema estiver incompleto.

## 3. Como fica no sistema

**Menu lateral → Prestação de contas** (e atalho no detalhe do projeto e no Acompanhamento).

1. **Lista de projetos**, com busca, filtros e páginas como no Acompanhamento. Cada projeto mostra o quanto da prestação de contas já está preenchido, por equipe.
2. **Prestação de contas do projeto:**
   - **Dados do projeto (gestão):** lei (federal, estadual, municipal, edital, recursos próprios), identificação (PRONAC, LEIC ou outra), patrocinador.
   - **Produtos e metas (gestão):** a lista de produtos prometidos no projeto, cada um com a sua meta. Pode mudar ao longo do processo.
   - **Uma ficha por execução da ação** (cada item da agenda), ligada a um produto, com três blocos:
     - Produção;
     - Comunicação;
     - Gestão.

     Cada equipe edita só o seu bloco. Todo campo aceita "Não se aplica".
   - **Pendências:** o que falta preencher em cada ficha e de qual equipe.
3. **Modelo da ficha (Configurações):** os campos da ficha ficam num modelo editável, no mesmo estilo da pré-definição das tarefas. Para cada campo: nome, tipo (texto, número, data, link, opções, sim/não), equipe responsável e se é obrigatório. Isso responde à pergunta da apresentação ("a equipe poderá adicionar novos campos de forma simples?"). O modelo começa com os campos da apresentação.
4. **Exportar Excel/CSV:** com filtros por período, projeto, patrocinador, proponente e lei. Uma linha por execução da ação, com todos os campos.

## 4. Arquivos e PDF da prestação de contas

Objetivo: simplificar. Hoje cada equipe salva no drive e uma pessoa junta tudo num arquivo. No sistema, as equipes **enviam as imagens e os documentos na própria ficha**, cada imagem com a sua **legenda**, e o sistema **gera o PDF pronto**, num modelo bonito e organizado.

**Onde os arquivos ficam: Supabase e drive ao mesmo tempo**
1. **No envio:** a imagem é comprimida (no máximo 2000 px no lado maior, JPEG ~80%, ≈ 300 KB) e vai para o **Supabase Storage**, num bucket privado só da prestação de contas (`max-prestacao`). Os PDFs (listas de presença, certificados) vão como vieram. A ficha e o PDF passam a usar o arquivo na hora.
2. **Logo em seguida, e sozinho:** o sistema copia o mesmo arquivo para o **drive**, já organizado, e guarda na ficha o link do arquivo e o da pasta. Se a cópia falhar, o arquivo continua no Supabase, a ficha mostra "cópia no drive pendente" e uma rotina tenta de novo até dar certo.
3. **A gestão marca "Prestação de contas entregue"** no projeto, com a data.
4. **1 ano depois da entrega,** uma rotina diária confere se todos os arquivos daquele projeto estão no drive (mesmo tamanho e mesmo código de verificação) e só então **apaga as cópias do Supabase**. Daí em diante, a ficha mostra o **link da pasta no drive**. Se algum arquivo não tiver cópia confirmada, nada daquele projeto é apagado, e a gestão é avisada.

**O drive fica legível para as pessoas**, na mesma lógica das pastas de hoje:

```
Prestação de contas/
  2026/
    Arte em Rede — Edição Demo (PRONAC 240001)/
      Oficina de Teatro · 23-11 a 25-11 · Zona Sul, Belo Horizonte-MG/
        Fotos/        2026-11-23 · Foto 1 · <legenda>.jpg
        Documentos/   Lista de presença.pdf, Certificados.pdf
      Relatórios/     Prestação de contas · Produto 1.pdf
```

Os PDFs gerados pelo sistema também vão para a pasta **Relatórios** do projeto.

**O que precisa ser preparado (por quem administra o Google Workspace da VIVAS):**
- um **drive compartilhado** para a prestação de contas;
- uma **conta de serviço do Google**, com acesso de editor a esse drive.

A chave da conta de serviço fica guardada como segredo na Vercel, nunca no código. Eu passo o passo a passo.

**Backups:** os backups automáticos do Supabase cobrem o banco, não os arquivos do Storage. Com a cópia imediata no drive, nenhum arquivo fica num lugar só.

**Espaço:**
- **Uso atual em produção:** 2 arquivos (482 KB) no Storage e 52 MB no banco.
- **Plano Pro:** 100 GB de arquivos inclusos; acima disso, cerca de US$ 0,02 por GB por mês.
- **Estimativa:** cerca de 10 fotos e prints (≈ 3 MB) mais 1 a 3 PDFs (≈ 3 MB) por execução de ação, ou ≈ 6 MB por execução. Com 1.000 execuções por ano (50 projetos × 20), são ≈ 6 GB por ano. Somando os PDFs gerados, ≈ 8 GB por ano.
- **Conclusão:** como os arquivos saem do Supabase 1 ano depois da entrega, o Supabase guarda no máximo cerca de 1 a 2 anos de arquivos (≈ 6 a 16 GB). Esse uso não cresce com o tempo, e o drive guarda tudo de forma permanente.

## 4.1 Fotos com descrição

Em cada ficha, as equipes vão juntando as **fotos e documentos** da execução. Cada foto tem:
- **categoria**, que define onde ela entra no relatório:
  - comprovação da realização;
  - acessibilidade;
  - divulgação (posts, prints);
  - lista de presença ou borderô;
  - certificados;
  - making of ou pós-evento;
  - materiais (apostila);
  - outros;
- **descrição**, que vira a legenda no relatório (ex.: "Intérprete de Libras durante a oficina, 23/11/2026");
- **ordem** e **"entra no relatório"** (sim/não), para escolher as melhores.

Documentos em PDF (listas de presença, certificados, clipping) entram como **anexos**.

## 4.2 Relatórios em PDF, gerados pelo sistema

Todos os relatórios saem daqui. O sistema junta:
- o que já tem: projeto, ações, agenda, territórios, números das inscrições;
- o que as equipes preencheram na ficha;
- as fotos com descrição.

Com isso, monta o PDF num **modelo bonito e organizado**, com as cores e a marca do MAX.

**O que o relatório monta sozinho, a partir do que já está no sistema:**
- números das inscrições, com gráfico;
- perfil do público (gênero, raça/cor, faixa etária, PCD, território), com gráficos;
- formulário de inscrição usado (título, período, total de respostas);
- lista de selecionados, de participantes e de certificados, só com os nomes, como anexo gerado pelo sistema;
- avaliação: as respostas de múltipla escolha somadas e os depoimentos escolhidos pela equipe.

Assim, campos da ficha que hoje pedem link ou print disso deixam de ser necessários: formulário de inscrição, planilha de respostas, print da lista de selecionados, lista de certificados e pesquisa de avaliação. Eles saem do modelo inicial e só voltam se a equipe quiser. Continuam na ficha o que só as pessoas têm: fotos, lista de presença assinada ou borderô digitalizado, release, clipping e relatório de redes.

**Tipos de relatório** (cada um é um modelo; começamos pelo primeiro):
1. **Prestação de contas por produto** (o que vai ao SALIC ou à plataforma da lei):
   - capa;
   - produto e meta;
   - para cada execução: dados, números com gráfico, e fotos agrupadas por categoria (comprovação, acessibilidade, divulgação…) com as legendas;
   - anexos.
2. Depois: **relatório de atividades para o patrocinador** (mais visual) e **portfólio/book do projeto**, com todas as edições.

**Cada relatório gerado:**
- fica guardado no sistema, com a data e quem gerou, e pode ser baixado de novo;
- é copiado para o drive, na pasta *Relatórios* do projeto;
- pode ser gerado de novo quando as fichas mudarem, e o anterior continua no histórico.

**Como é gerado:** no servidor, com `@react-pdf/renderer` (roda na Vercel, sem navegador), com as fotos já comprimidas.

**Dados pessoais:** CPF, telefone e e-mail dos participantes não entram (LGPD). Listas nominais só como anexo, quando exigidas.

## 5. Etapas

| Etapa | Entrega |
|---|---|
| **A** | Dados do projeto (lei, identificação, patrocinador), produtos e metas, modelo da ficha com os campos da apresentação, menu lateral e atalhos |
| **B** | Ficha por execução da ação (três blocos, permissões por equipe, "Não se aplica", campos automáticos), pendências e % preenchido |
| **C** | Fotos e documentos na ficha: envio com categoria, descrição e ordem; compressão no navegador; Supabase (ou disco local nos testes) |
| **D** | Relatórios em PDF: modelo "prestação de contas por produto", histórico de relatórios gerados e download |
| **E** | Drive: cópia automática de fotos, documentos e relatórios para o drive organizado; limpeza do Supabase 1 ano depois da entrega (depende do drive compartilhado e da conta de serviço) |
| **F** (depois) | Outros modelos (atividades para patrocinador, portfólio), exportação Excel/CSV, painel de dados, ligação com o MAX Financeiro |

Fora do escopo por agora, como sugestões que a apresentação levanta para estudo:
- unir os PDFs dos anexos;
- painel de redes sociais (Reportei);
- monitor de notícias (clipping);
- tutorial guiado.

## 6. Decisões a confirmar

1. **Uma ficha por execução da ação** (cada data e local da agenda), e não uma por ação. Como a planilha tem datas, mês e local por linha, a execução corresponde à linha de hoje.
2. **Permissões novas:** `prestacao:read`, `prestacao:producao`, `prestacao:comunicacao` e `prestacao:gestao`, no catálogo do hub (como no Acompanhamento).
3. **Arquivos:** enviados na ficha, guardados no Supabase e copiados na hora para o drive organizado. Saem do Supabase 1 ano depois da entrega da prestação de contas, e o link da pasta no drive fica à mostra (decidido).
