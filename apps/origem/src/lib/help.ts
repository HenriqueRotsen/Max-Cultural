/** Textos de ajuda para leigos — sem jargão técnico. */

export const HELP = {
  // Contas
  cgccpf:
    "Número do CNPJ (empresa) ou CPF (pessoa) do proponente cultural. Ao sair do campo, o MAX Origem tenta buscar o nome automaticamente.",
  personType:
    "Empresa (PJ) pode receber até 20% do valor do projeto. Pessoa física ou MEI pode receber até 30%. Isso vem da regra oficial de fomento cultural.",
  salicUser:
    "Usuário do SALIC (login próprio do sistema, não o Gov.br). Guardado criptografado no MAX Origem. Não muda nada no site oficial.",
  salicPass:
    "Senha do SALIC (a do sistema, não a do Gov.br), criptografada no MAX Origem. Serve para atualizar pela área logada. Não altera a senha no site oficial.",
  extraPronacs:
    "Códigos de projetos (PRONAC) que às vezes não aparecem sozinhos na lista da empresa. Digite separados por vírgula, por exemplo: 153774, 193461.",
  active:
    "Se marcado, esta conta entra na tela Atualizar e nas atualizações em lote. Desmarque se quiser pausar sem apagar nada.",
  related:
    "Relacionamento A↔B: proponente (A) e pessoa/empresa (B). Entre empresas, use “sócio em comum”, “casal sócio nas duas” (ex.: cônjuges sócios na Vivas e no Ateliê 22) ou “coligada”. Só vínculos tipificados no art. 23 da IN entram no teto do proponente.",
  artistic:
    "Marque só se for um grupo artístico familiar ou coletivo previsto na regra. Nesse caso, o valor pago a essa pessoa não entra no limite do proponente.",

  // Atualizar dados
  syncAccount:
    "Escolha uma empresa ou deixe em “todas”. O MAX Origem busca os projetos e pagamentos dessa(s) conta(s).",
  syncPronac:
    "Se quiser atualizar só um projeto, digite o número do PRONAC. Nesse caso, escolha também a conta da empresa.",
  forceCrawler:
    "Deixa a atualização mais rápida. Exige usuário e senha do SALIC cadastrados na conta — o login próprio do sistema, não o Gov.br.",
  syncStatus:
    "Mostra se a atualização terminou bem, ainda está em andamento ou deu erro.",

  // Fornecedores
  watchedCgccpf:
    "CNPJ ou CPF de quem você quer acompanhar de perto. Com CNPJ o nome costuma preencher sozinho; com CPF às vezes é preciso digitar.",
  watchedName:
    "Nome do fornecedor como aparece nos pagamentos. Ajuda o MAX Origem a encontrá-lo nas listas.",
  watchedLabel:
    "Apelido só para você, por exemplo “Produtora X”. Facilita reconhecer na lista.",
  watchedOnly:
    "“Só observados” mostra apenas os fornecedores que você cadastrou nesta lista. “Todos” mostra qualquer quem recebeu pagamento no projeto.",

  // Filtros panorama
  filterProponente:
    "Restringe a visão a uma das suas empresas/proponentes cadastrados.",
  filterPronac:
    "Número do projeto cultural (PRONAC). Filtra para ver só aquele projeto.",
  filterFrom:
    "Data inicial dos pagamentos. Deixe em branco para não limitar o início.",
  filterTo:
    "Data final dos pagamentos. Deixe em branco para não limitar o fim.",
  filterRuleset:
    "Mostra só projetos vinculados àquela instrução normativa (escolha automática ou manual).",

  // Conformidade / tabelas
  alerts:
    "Avisos usam a IN do PRONAC. Vermelho = acima do limite; amarelo = perto do limite. A linha do PRONAC assume a cor mais grave entre fornecedores e a soma art. 23. A seta só aparece se um fornecedor sem vínculo chegou perto ou ultrapassou o teto. Art. 23: soma só proponente + relacionados tipificados (alimentação/refeição não entram).",
  pronacRowLegend:
    "Vermelho: acima do limite. Âmbar: perto do limite (fornecedor avulso ou soma art. 23). A seta abre só fornecedores sem vínculo art. 23 que chegaram perto ou ultrapassaram o teto — a soma art. 23 pode colorir a linha sem mostrar seta.",
  limitBadge:
    "Compara quanto aquele fornecedor (ou o próprio proponente) recebeu em relação ao valor captado do projeto. Acima do percentual permitido pela regra aparece em vermelho.",
  percentOfPronac:
    "Dois percentuais: sobre o valor captado (base da norma) e sobre o comprovado (soma dos pagamentos já feitos). O % do captado só chega a 100% se todo o captado tiver sido gasto.",
  percentCaptado:
    "Participação sobre o valor captado do PRONAC no SALIC — base dos limites da IN.",
  percentComprovado:
    "Participação sobre o total já comprovado/pago no PRONAC. A soma de todos os fornecedores fica perto de 100%.",
  valorCaptado:
    "Valor captado no SALIC — base oficial dos limites de conformidade (art. 23/24). O comprovado (Y) é o que já foi pago.",
  totalObservados:
    "Soma dos pagamentos só aos fornecedores que você marcou para acompanhar — os % usam captado e comprovado.",
  pendingNorm:
    "O governo publicou uma mudança nas regras. O MAX Origem guardou a nova versão para revisão antes de usá-la nos avisos.",
} as const;
