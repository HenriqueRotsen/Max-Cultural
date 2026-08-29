import { Resend } from "resend";

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_ORIGEM_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

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

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from:
        process.env.NOTIFY_FROM_EMAIL ||
        process.env.CONTACT_FROM_EMAIL ||
        "MAX Origem <onboarding@resend.dev>",
      to: [to],
      subject: params.title,
      text: [params.body, "", `Abrir no MAX Origem: ${link}`].join("\n"),
      html: `
        <p style="font-family:sans-serif;font-size:15px;color:#1a1a1a">${escapeHtml(params.body)}</p>
        <p style="font-family:sans-serif;margin-top:16px">
          <a href="${escapeAttr(link)}" style="color:#5b52c9;font-weight:600">Abrir no MAX Origem</a>
        </p>
      `,
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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
