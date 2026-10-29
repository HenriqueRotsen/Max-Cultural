import { redirect } from "next/navigation";
import { financeiroHubLoginUrl } from "@/lib/auth/hub";

export const metadata = { title: "Alterar senha" };

export default function AlterarSenhaPage() {
  redirect(financeiroHubLoginUrl("/painel"));
}
