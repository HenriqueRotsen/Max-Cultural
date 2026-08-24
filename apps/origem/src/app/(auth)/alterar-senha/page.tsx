import { redirect } from "next/navigation";
import { origemHubLoginUrl } from "@/lib/auth/hub";

export const metadata = { title: "Alterar senha" };

export default function AlterarSenhaPage() {
  redirect(origemHubLoginUrl("/painel"));
}
