"use client";

/**
 * Trava do PRONAC: o documento menciona outro projeto. Quem tem a permissão
 * "Liberar documento de outro PRONAC" escreve o motivo e segue (fica no log);
 * quem não tem só vê o bloqueio.
 */
export function PronacOverrideField({
  mismatch,
  allowed,
}: {
  /** Texto do aviso (quando já se sabe, como na revisão da NF). */
  mismatch?: string | null;
  allowed: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-900">
      {mismatch ? <p className="font-medium">{mismatch}</p> : null}
      {allowed ? (
        <label className="field">
          <span>Motivo para liberar mesmo assim (fica registrado)</span>
          <textarea
            name="pronacOverrideReason"
            rows={2}
            required
            minLength={5}
            className="w-full bg-white"
            placeholder="Ex.: o PRONAC citado na nota é o do projeto anterior do mesmo proponente; o serviço é deste projeto."
          />
          {mismatch ? null : (
            <span className="text-xs text-red-800">
              Escolha o arquivo de novo antes de enviar.
            </span>
          )}
        </label>
      ) : (
        <p>
          Este arquivo não pode entrar neste projeto. Confira se é o documento certo ou peça a
          quem tem a permissão &quot;Liberar documento de outro PRONAC&quot;.
        </p>
      )}
    </div>
  );
}
