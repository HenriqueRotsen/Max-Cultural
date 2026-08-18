"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { sendContactMessage } from "@/lib/auth/contact";

export default function ContactForm() {
  const searchParams = useSearchParams();
  const defaultPlan = searchParams.get("plano") || "";
  const [status, setStatus] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const planOptions = useMemo(() => ["Essencial", "Pro", "Ainda não sei"], []);

  function onSubmit(formData: FormData) {
    setStatus(null);
    setOk(false);
    startTransition(async () => {
      const result = await sendContactMessage(formData);
      if (result.ok) {
        setOk(true);
        setStatus("Mensagem enviada. Responderemos em breve.");
      } else {
        setStatus(result.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="marketing-contact-form card p-5 md:p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" name="name" required placeholder="Seu nome" />
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="voce@empresa.com"
          />
        </div>
        <div className="field">
          <label htmlFor="company">Empresa / proponente</label>
          <input id="company" name="company" placeholder="Opcional" />
        </div>
        <div className="field">
          <label htmlFor="plan">Plano de interesse</label>
          <select id="plan" name="plan" defaultValue={defaultPlan}>
            <option value="">Selecione</option>
            {planOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="field md:col-span-2">
          <label htmlFor="message">Mensagem</label>
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            placeholder="Conte quantos CNPJs, se já usa SALIC e o que precisa auditar."
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-gold" disabled={pending}>
          {pending ? "Enviando…" : "Enviar mensagem"}
        </button>
        {status && (
          <p className={`text-sm ${ok ? "text-[#176b3a]" : "text-[#8a4b12]"}`}>{status}</p>
        )}
      </div>
    </form>
  );
}
