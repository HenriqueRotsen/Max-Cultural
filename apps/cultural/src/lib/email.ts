import { Resend } from "resend";
import {
  escapeHtml,
  highlightBox,
  renderBrandedEmail,
} from "@/lib/email-layout";

function fromAddress() {
  return process.env.EMAIL_FROM || "MAX Cultural <noreply@maxcultural.com.br>";
}

function simulate() {
  return process.env.AUTH_EMAIL_SIMULATE === "true" || !process.env.RESEND_API_KEY;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (simulate()) {
    console.info("[email:simulate]", input.to, input.subject);
    return { ok: true };
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha no e-mail" };
  }
}

export async function sendInviteEmail(input: {
  to: string;
  name: string;
  link: string;
  provisionalPassword: string;
}) {
  return sendEmail({
    to: input.to,
    subject: "Convite — MAX Cultural",
    html: renderBrandedEmail({
      preheader: "Sua senha temporária para acessar o MAX Cultural",
      title: "Você foi convidado",
      bodyHtml: `
        <p style="margin:0 0 12px">Olá <strong>${escapeHtml(input.name)}</strong>,</p>
        <p style="margin:0 0 12px">Sua conta no MAX Cultural está pronta. Use a senha temporária abaixo no primeiro acesso:</p>
        ${highlightBox(escapeHtml(input.provisionalPassword))}
        <p style="margin:0">No login você trocará a senha e receberá um código de verificação neste e-mail.</p>
      `,
      cta: { href: input.link, label: "Entrar no MAX Cultural" },
    }),
  });
}

/** Redefinição: nova senha temporária (self-service ou admin). */
export async function sendTemporaryPasswordEmail(input: {
  to: string;
  name: string;
  link: string;
  provisionalPassword: string;
}) {
  return sendEmail({
    to: input.to,
    subject: "Nova senha temporária — MAX Cultural",
    html: renderBrandedEmail({
      preheader: "Nova senha temporária da sua conta",
      title: "Nova senha temporária",
      bodyHtml: `
        <p style="margin:0 0 12px">Olá <strong>${escapeHtml(input.name)}</strong>,</p>
        <p style="margin:0 0 12px">Geramos uma nova senha temporária para a sua conta:</p>
        ${highlightBox(escapeHtml(input.provisionalPassword))}
        <p style="margin:0">No próximo acesso você deverá criar uma senha nova. Se não pediu isso, fale com o administrador.</p>
      `,
      cta: { href: input.link, label: "Entrar" },
    }),
  });
}

export async function sendLoginOtpEmail(input: {
  to: string;
  name: string;
  code: string;
}) {
  return sendEmail({
    to: input.to,
    subject: "Código de verificação — MAX Cultural",
    html: renderBrandedEmail({
      preheader: `Código ${input.code} — válido por 10 minutos`,
      title: "Código de verificação",
      bodyHtml: `
        <p style="margin:0 0 12px">Olá <strong>${escapeHtml(input.name)}</strong>,</p>
        <p style="margin:0 0 12px">Use o código abaixo para concluir o login:</p>
        ${highlightBox(`<span style="letter-spacing:0.28em">${escapeHtml(input.code)}</span>`)}
        <p style="margin:0">Válido por 10 minutos. Se você não está fazendo login, ignore este e-mail.</p>
      `,
    }),
  });
}

export async function send2faNoticeEmail(input: { to: string; name: string }) {
  return sendEmail({
    to: input.to,
    subject: "Sessões encerradas — MAX Cultural",
    html: renderBrandedEmail({
      preheader: "Suas sessões foram encerradas por um administrador",
      title: "Sessões encerradas",
      bodyHtml: `
        <p style="margin:0 0 12px">Olá <strong>${escapeHtml(input.name)}</strong>,</p>
        <p style="margin:0">Um administrador encerrou as sessões da sua conta. No próximo acesso use sua senha e o código enviado a este e-mail.</p>
      `,
    }),
  });
}
