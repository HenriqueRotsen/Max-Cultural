import { Resend } from "resend";

export function isEmailSimulate(): boolean {
  return process.env.AUTH_EMAIL_SIMULATE === "true";
}

type SendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(input: SendInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isEmailSimulate()) {
    console.info("[AUTH_EMAIL_SIMULATE]", {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return { ok: true };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      ok: false,
      error: "RESEND_API_KEY / EMAIL_FROM não configurados (ou use AUTH_EMAIL_SIMULATE=true).",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao enviar e-mail",
    };
  }
}

export async function sendProvisionalPasswordEmail(input: {
  to: string;
  name: string;
  password: string;
  loginUrl: string;
}) {
  const subject = "MAX Fluxo — senha provisória";
  const text = `Olá ${input.name},\n\nSua conta foi criada.\nE-mail: ${input.to}\nSenha provisória: ${input.password}\n\nAcesse: ${input.loginUrl}\nNo primeiro acesso você deverá criar uma senha própria e ativar a verificação em duas etapas.\n`;
  const html = `<p>Olá <strong>${escapeHtml(input.name)}</strong>,</p>
<p>Sua conta foi criada no MAX Fluxo.</p>
<p><strong>E-mail:</strong> ${escapeHtml(input.to)}<br/>
<strong>Senha provisória:</strong> <code>${escapeHtml(input.password)}</code></p>
<p><a href="${escapeHtml(input.loginUrl)}">Entrar no painel</a></p>
<p>No primeiro acesso você deverá criar uma senha própria e ativar a verificação em duas etapas.</p>`;
  return sendEmail({ to: input.to, subject, html, text });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const subject = "MAX Fluxo — recuperação de senha";
  const text = `Olá ${input.name},\n\nUse o link para redefinir sua senha (válido por 1 hora):\n${input.resetUrl}\n\nSe você não solicitou, ignore este e-mail.\n`;
  const html = `<p>Olá <strong>${escapeHtml(input.name)}</strong>,</p>
<p>Use o link abaixo para redefinir sua senha (válido por 1 hora):</p>
<p><a href="${escapeHtml(input.resetUrl)}">${escapeHtml(input.resetUrl)}</a></p>
<p>Se você não solicitou, ignore este e-mail.</p>`;
  return sendEmail({ to: input.to, subject, html, text });
}

export async function sendLoginOtpEmail(input: {
  to: string;
  name: string;
  code: string;
}) {
  const subject = "MAX Fluxo — código de verificação";
  const text = `Olá ${input.name},\n\nSeu código de verificação: ${input.code}\nVálido por 10 minutos.\n`;
  const html = `<p>Olá <strong>${escapeHtml(input.name)}</strong>,</p>
<p>Seu código de verificação:</p>
<p style="font-size:24px;letter-spacing:4px"><strong>${escapeHtml(input.code)}</strong></p>
<p>Válido por 10 minutos.</p>`;
  return sendEmail({ to: input.to, subject, html, text });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
