import { Resend } from "resend";

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

export async function sendInviteEmail(input: { to: string; name: string; link: string }) {
  return sendEmail({
    to: input.to,
    subject: "Convite — MAX Cultural",
    html: `<p>Olá ${input.name},</p><p>Você foi convidado para o MAX Cultural.</p><p><a href="${input.link}">Definir senha e entrar</a></p>`,
  });
}

export async function sendPasswordResetEmail(input: { to: string; name: string; link: string }) {
  return sendEmail({
    to: input.to,
    subject: "Redefinir senha — MAX Cultural",
    html: `<p>Olá ${input.name},</p><p><a href="${input.link}">Redefinir senha</a></p><p>Se você não pediu isso, ignore este e-mail.</p>`,
  });
}

export async function send2faNoticeEmail(input: { to: string; name: string }) {
  return sendEmail({
    to: input.to,
    subject: "Autenticador (2FA) — MAX Cultural",
    html: `<p>Olá ${input.name},</p><p>O 2FA da sua conta foi alterado por um administrador. Na próxima entrada você configurará o autenticador de novo. O segredo nunca é enviado por e-mail.</p>`,
  });
}
