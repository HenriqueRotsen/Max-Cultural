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
    console.info("[email:simulate]", input.to, input.subject, input.html);
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
    html: `<p>Olá ${escapeHtml(input.name)},</p>
<p>Você foi convidado para o MAX Cultural.</p>
<p>Senha temporária: <strong>${escapeHtml(input.provisionalPassword)}</strong></p>
<p>No primeiro acesso você deverá trocar a senha. Em seguida enviaremos um código de verificação para este e-mail.</p>
<p><a href="${escapeAttr(input.link)}">Entrar</a></p>`,
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
    html: `<p>Olá ${escapeHtml(input.name)},</p>
<p>Geramos uma nova senha temporária para a sua conta:</p>
<p style="font-size:18px;letter-spacing:1px"><strong>${escapeHtml(input.provisionalPassword)}</strong></p>
<p>No próximo acesso você deverá trocar a senha. Se você não pediu isso, fale com o administrador.</p>
<p><a href="${escapeAttr(input.link)}">Entrar</a></p>`,
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
    html: `<p>Olá ${escapeHtml(input.name)},</p>
<p>Seu código de verificação:</p>
<p style="font-size:24px;letter-spacing:4px"><strong>${escapeHtml(input.code)}</strong></p>
<p>Válido por 10 minutos. Se você não está fazendo login, ignore este e-mail.</p>`,
  });
}

export async function send2faNoticeEmail(input: { to: string; name: string }) {
  return sendEmail({
    to: input.to,
    subject: "Sessões encerradas — MAX Cultural",
    html: `<p>Olá ${escapeHtml(input.name)},</p>
<p>Um administrador encerrou as sessões da sua conta. No próximo acesso você usará senha e o código enviado a este e-mail.</p>`,
  });
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
