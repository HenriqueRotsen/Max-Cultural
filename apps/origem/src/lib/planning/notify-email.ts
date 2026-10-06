import { Resend } from "resend";
import {
  appBaseUrl,
  escapeHtml,
  renderBrandedEmail,
} from "@/lib/email-layout";

/** Envia e-mail de aviso (Resend). Retorna false se não configurado ou falhou. */
export async function sendNotificationEmail(params: {
  to: string;
  title: string;
  body: string;
  href?: string | null;
}): Promise<boolean> {
  const to = params.to.trim();
  if (!to || !to.includes("@")) return false;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify-email] RESEND_API_KEY ausente");
    return false;
  }

  const link =
    params.href && params.href.startsWith("/")
      ? `${appBaseUrl()}${params.href}`
      : params.href || `${appBaseUrl()}/notificacoes`;

  const html = renderBrandedEmail({
    preheader: params.body.slice(0, 120),
    title: params.title,
    bodyHtml: `<p style="margin:0">${escapeHtml(params.body)}</p>`,
    cta: { href: link, label: "Abrir no MAX Origem" },
  });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from:
        process.env.NOTIFY_FROM_EMAIL ||
        "MAX Origem <noreply@maxcultural.com.br>",
      to: [to],
      subject: params.title,
      text: [params.body, "", `Abrir no MAX Origem: ${link}`].join("\n"),
      html,
    });
    if (error) {
      console.error("[notify-email]", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[notify-email]", e);
    return false;
  }
}
