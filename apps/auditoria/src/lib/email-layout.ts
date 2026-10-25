/** Layout HTML de e-mail — marca MAX Origem (Montserrat + roxo). */

const NAVY = "#4a1d6e";
const NAVY_SOFT = "#f3eef8";
const GOLD = "#5b52c9";
const GOLD_SOFT = "#ebe9f8";
const GRAY_600 = "#4b5563";
const GRAY_500 = "#6b7280";
const BORDER = "#e8eaef";

export function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_ORIGEM_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export function renderBrandedEmail(input: {
  preheader?: string;
  title: string;
  bodyHtml: string;
  cta?: { href: string; label: string };
}) {
  const base = appBaseUrl();
  const logoUrl = `${base}/brand/max-origem.png`;
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.preheader)}</div>`
    : "";
  const cta = input.cta
    ? `<tr><td style="padding:8px 0 4px">
        <a href="${escapeAttr(input.cta.href)}"
           style="display:inline-block;background:${NAVY};color:#ffffff;font-family:Montserrat,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:10px">
          ${escapeHtml(input.cta.label)}
        </a>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${NAVY_SOFT};font-family:Montserrat,Arial,Helvetica,sans-serif">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${NAVY_SOFT};padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER}">
          <tr>
            <td style="background:linear-gradient(135deg,${NAVY_SOFT} 0%,${GOLD_SOFT} 100%);padding:28px 32px 20px;border-bottom:1px solid ${BORDER}">
              <img src="${escapeAttr(logoUrl)}" alt="MAX Origem" width="180" height="67" style="display:block;height:48px;width:auto;max-width:200px;border:0"/>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px">
              <h1 style="margin:0 0 16px;font-family:Montserrat,Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.25;color:${NAVY}">
                ${escapeHtml(input.title)}
              </h1>
              <div style="font-family:Montserrat,Arial,sans-serif;font-size:15px;line-height:1.55;color:${GRAY_600}">
                ${input.bodyHtml}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px">
              <table role="presentation" cellpadding="0" cellspacing="0">${cta}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:#fafafa;border-top:1px solid ${BORDER}">
              <p style="margin:0;font-family:Montserrat,Arial,sans-serif;font-size:12px;line-height:1.45;color:${GRAY_500}">
                MAX Origem · <a href="${escapeAttr(base)}" style="color:${GOLD};text-decoration:none">${escapeHtml(base.replace(/^https?:\/\//, ""))}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
