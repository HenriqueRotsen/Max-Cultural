/**
 * Trava do banco de produção fora da Vercel.
 *
 * Localmente só existem dois jeitos de rodar (na raiz do repo):
 *   npm run dev        → banco de homologação
 *   npm run dev:teste  → Postgres local, com dados demo
 * Os dois definem MAX_AMBIENTE. A produção só é aceita com
 * MAX_AMBIENTE=producao, que só o `npm run db:migrate:producao` usa (com confirmação).
 */
const PRODUCAO = /maogvvcvrgokfcpjqksv/;

export function bloquearProducao(...valores: Array<string | undefined>) {
  if (process.env.VERCEL || process.env.MAX_AMBIENTE === "producao") return;
  if (valores.some((v) => v && PRODUCAO.test(v))) {
    throw new Error(
      "Banco de produção bloqueado fora da Vercel. Para testar use, na raiz do repo, " +
        "`npm run dev` (homologação) ou `npm run dev:teste` (banco local).",
    );
  }
}
