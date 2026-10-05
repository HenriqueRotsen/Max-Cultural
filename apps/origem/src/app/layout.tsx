import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

/** Fonte variável — sem `weight: []` (quebra Turbopack no `next build` da Vercel). */
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MAX Origem — Criação · Planejamento · Auditoria",
    template: "%s · MAX Origem",
  },
  description:
    "Auditoria SALIC e banco de fornecedores — criação, planejamento e conformidade.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
