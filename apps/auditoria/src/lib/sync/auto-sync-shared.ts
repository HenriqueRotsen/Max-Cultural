/** Capacidade do hub (Controle de acesso) para desligar/religar a atualização automática. */
export const AUTO_SYNC_PERMISSION = "auditoria.atualizacao.desativar";

/** Texto que a pessoa digita na segunda confirmação para desligar. */
export const AUTO_SYNC_CONFIRM_WORD = "DESATIVAR";

export type AutoSyncState = { ok?: boolean; error?: string };
