import { Suspense } from "react";
import ContactForm from "@/components/marketing/ContactForm";

export const metadata = {
  title: "Contato",
};

export default function ContatoPage() {
  return (
    <section className="marketing-section">
      <div className="marketing-section-inner marketing-contact">
        <div>
          <h1 className="marketing-page-title">Entre em contato</h1>
          <p className="marketing-section-lead">
            Conte um pouco da operação. Respondemos com proposta e próximos passos para liberar o
            acesso.
          </p>
        </div>
        <Suspense fallback={<div className="card p-5 text-sm text-[var(--gray-500)]">Carregando…</div>}>
          <ContactForm />
        </Suspense>
      </div>
    </section>
  );
}
