const CORPORATE_ROLES: Record<string, string> = {
  PARTNER: "Sócio",
  ADMINISTRATOR: "Administrador",
  BOTH: "Sócio e administrador",
};

export function corporateRoleLabel(role: string, institutional: boolean) {
  if (institutional) return "Administrador";
  return CORPORATE_ROLES[role] || role;
}

export function corporateMapCopy(institutional: boolean) {
  const osc = Boolean(institutional);
  const member = osc ? "administrador" : "sócio";
  const members = osc ? "administradores" : "sócios";
  const mapName = osc ? "Mapa organizacional" : "Mapa societário";
  const composition = osc
    ? "composição organizacional"
    : "composição societária";
  const board = osc ? "quadro organizacional" : "quadro societário";

  return {
    osc,
    mapName,
    mapNameLower: mapName.toLowerCase(),
    composition,
    board,
    member,
    members,
    memberCap: osc ? "Administrador" : "Sócio",
    membersCap: osc ? "Administradores" : "Sócios",
    breadcrumb: `Início › Contas › ${mapName}`,
    compositionTitle: `Intervalos de ${composition}`,
    compositionHint: `Cada intervalo lista os ${members} (PF ou PJ) vigentes naquele período.`,
    pfHint: `Proponente PF — cadastre intervalos e ${members} manualmente, se necessário.`,
    newPeriodHint: `Defina o período em que aquela ${composition} valia. Você pode remover intervalos e criar outros com as datas corretas.`,
    addMember: `Adicionar ${member} neste intervalo`,
    editMember: `Editar ${member}`,
    addMemberBtn: `Adicionar ${member}`,
    saveMember: "Salvar alteração",
    emptyMembers: `Nenhum ${member} neste intervalo.`,
    emptyMembersShort: `Nenhum ${member}`,
    removeMemberConfirm: `Remover este ${member}?`,
    removePeriodConfirm: `Remover este intervalo e seus ${members}?`,
    importBtn: `Buscar ${members} na Receita Federal`,
    importConfirm: `Isso substitui os intervalos já cadastrados pelos ${members} encontrados na Receita Federal. Continuar?`,
    imported: (n: number) =>
      `Encontrados ${n} ${member}(s) na Receita Federal.`,
    pdfBtn: `Gerar ${mapName.toLowerCase()} (PDF)`,
    pdfFilenamePrefix: osc
      ? "salink-mapa-organizacional"
      : "salink-mapa-societario",
    matchedBanner: (n: number) =>
      `${member}(s) do mapa — consta${n === 1 ? "" : "m"} como observado${n === 1 ? "" : "s"}`,
    autoImportError: `${mapName} automático só para CNPJ`,
    failImport: `Falha ao buscar ${members}`,
    failSaveMember: `Falha ao salvar ${member}`,
    memberNotFound: `${osc ? "Administrador" : "Sócio"} não encontrado`,
    mapLockedRelation: `Relacionamento definido pelo ${mapName.toLowerCase()} — altere o quadro em Contas › Mapa.`,
    reportEmpty: `${mapName} não cadastrado.`,
    reportMembersTotal: `${osc ? "Administradores" : "Sócios"} (total)`,
    reportIntro: `Composição ${osc ? "organizacional" : "societária"} do proponente por intervalos de tempo (${members} PF ou PJ).`,
    reportMissingDoc: (n: number) =>
      `${n} ${member}(s) sem CPF/CNPJ completo.`,
    reportFooter: `Documento gerado pelo Salink para apoio à documentação do ${board} do proponente.`,
    reportSubtitle: `intervalos e ${members} PF/PJ`,
    reportChip: `${mapName} do proponente`,
    reportSection: `2. ${mapName} do proponente`,
    briefTitle: `Avaliar ${board} com assessoria`,
    briefDetail: osc
      ? "Se houver administrador em comum ou entidade ligada no mapa organizacional, considere (com contador/advogado) se a composição agrava o enquadramento no teto do proponente. Mantenha estatuto e alterações à época da contratação no acervo."
      : "Se houver sócio em comum ou coligada no mapa societário, considere (com contador/advogado) se a composição agrava o enquadramento no teto do proponente. Mantenha contrato social e alterações à época da contratação no acervo.",
    structureBadge: osc ? "Quadro organizacional" : "Quadro societário",
    checkboxLabel: "Organização da sociedade civil (OSC)",
    checkboxHelp:
      "Marque se o proponente for OSC. O mapa e os relatórios passam a usar denominações organizacionais, e todos os papéis ficam como administrador.",
  };
}
