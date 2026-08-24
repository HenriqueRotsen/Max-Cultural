import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "MAX Fluxo";

export const metadata: Metadata = {
  title: {
    default: `${appName} — Execução · Gestão · Acompanhamento`,
    template: `%s · ${appName}`,
  },
  description:
    "Sistema de execução, gestão e acompanhamento cultural — padronização PRONAC / Lei Rouanet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} h-full`}>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
