"use server";

import { Resend } from "resend";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  company: z.string().optional(),
  plan: z.string().optional(),
  message: z.string().min(10),
});

export type ContactResult = { ok: true } | { ok: false; error: string };

export async function sendContactMessage(formData: FormData): Promise<ContactResult> {
  const parsed = contactSchema.safeParse({
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    company: String(formData.get("company") || "").trim() || undefined,
    plan: String(formData.get("plan") || "").trim() || undefined,
    message: String(formData.get("message") || "").trim(),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Preencha nome, e-mail válido e uma mensagem com pelo menos 10 caracteres.",
    };
  }

  const to = process.env.CONTACT_TO_EMAIL || "contato@henriquerotsen.com.br";
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("[contact] RESEND_API_KEY ausente", parsed.data);
    return {
      ok: false,
      error: "Envio de e-mail não configurado. Tente novamente mais tarde ou escreva para " + to,
    };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.CONTACT_FROM_EMAIL || "Salink <onboarding@resend.dev>",
    to: [to],
    replyTo: parsed.data.email,
    subject: `Salink — contato${parsed.data.plan ? ` (${parsed.data.plan})` : ""}`,
    text: [
      `Nome: ${parsed.data.name}`,
      `E-mail: ${parsed.data.email}`,
      `Empresa: ${parsed.data.company || "—"}`,
      `Plano de interesse: ${parsed.data.plan || "—"}`,
      "",
      parsed.data.message,
    ].join("\n"),
  });

  if (error) {
    console.error("[contact]", error);
    return { ok: false, error: "Não foi possível enviar. Tente de novo em instantes." };
  }

  return { ok: true };
}
