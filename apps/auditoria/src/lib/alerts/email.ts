import { Resend } from "resend";
import { escapeHtml, renderBrandedEmail } from "@/lib/email-layout";

/** E-mail de alerta da Auditoria (Resend). Retorna false se não configurado ou falhou. */
export async function sendAlertEmail(params: {
  to: string;
  title: string;
  body: string;
  href: string;
}): Promise<boolean> {
  const to = params.to.trim();
  if (!to || !to.includes("@")) return false;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[alert-email] RESEND_API_KEY ausente");
    return false;
  }

  const html = renderBrandedEmail({
    preheader: params.body.slice(0, 120),
    title: params.title,
    bodyHtml: `<p style="margin:0">${escapeHtml(params.body)}</p>`,
    cta: { href: params.href, label: "Abrir na Auditoria" },
  });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.NOTIFY_FROM_EMAIL || "MAX Auditoria <noreply@maxcultural.com.br>",
      to: [to],
      subject: params.title,
      text: [params.body, "", `Abrir na Auditoria: ${params.href}`].join("\n"),
      html,
    });
    if (error) {
      console.error("[alert-email]", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[alert-email]", e);
    return false;
  }
}
