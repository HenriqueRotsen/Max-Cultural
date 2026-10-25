import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

/** Fonte variável — sem `weight: []` (quebra Turbopack no `next build` da Vercel). */
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MAX Auditoria (antigo Salink)",
    template: "%s · MAX Auditoria",
  },
  description:
    "Espelho do SALIC: pagamentos, fornecedores, conformidade e relatórios de auditoria.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
