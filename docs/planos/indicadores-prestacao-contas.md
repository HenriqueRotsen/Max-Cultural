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

**O PDF gerado** (por projeto, ou por produto, que é como vai ao SALIC):
1. Capa: projeto, proponente, lei e identificação, patrocinador, período.
2. Produtos e metas.
3. Para cada execução da ação:
   - dados (tipo, local, datas, carga horária, professor/artista);
   - números das inscrições, gerados pelo sistema (inscritos, selecionados, participantes, PCDs, certificados), com gráfico;
   - fotos em grade, com legenda.
4. Anexos: lista dos documentos (presença, certificados, clipping, apostila), com o link de cada um.

Gerado no servidor com `@react-pdf/renderer`, que roda na Vercel sem navegador. Dados pessoais dos participantes (CPF, telefone, e-mail) não entram no PDF; listas nominais só quando forem exigidas (LGPD).

## 5. Etapas

| Etapa | Entrega |
|---|---|
| **A** | Dados do projeto (lei, identificação, patrocinador), produtos e metas, modelo da ficha com os campos da apresentação, menu lateral e atalhos |
| **B** | Ficha por execução da ação (três blocos, permissões por equipe, "Não se aplica", campos automáticos), pendências e % preenchido |
| **C** | Envio de imagens (com legenda) e documentos na ficha, comprimidos, no Supabase Storage |
| **D** | Cópia automática para o drive organizado, "Prestação de contas entregue" e limpeza do Supabase 1 ano depois (depende do drive compartilhado e da conta de serviço) |
| **E** | PDF da prestação de contas (por projeto e por produto), guardado também no drive, e exportação Excel/CSV com filtros |
| **F** (depois) | Painel de dados e integração com o MAX Financeiro (notas e comprovantes) |

Fora do escopo por agora, como sugestões que a apresentação levanta para estudo:
- unir os PDFs dos anexos;
- painel de redes sociais (Reportei);
- monitor de notícias (clipping);
- tutorial guiado.

## 6. Decisões a confirmar

1. **Uma ficha por execução da ação** (cada data e local da agenda), e não uma por ação. Como a planilha tem datas, mês e local por linha, a execução corresponde à linha de hoje.
2. **Permissões novas:** `prestacao:read`, `prestacao:producao`, `prestacao:comunicacao` e `prestacao:gestao`, no catálogo do hub (como no Acompanhamento).
3. **Arquivos:** enviados na ficha, guardados no Supabase e copiados na hora para o drive organizado. Saem do Supabase 1 ano depois da entrega da prestação de contas, e o link da pasta no drive fica à mostra (decidido).
