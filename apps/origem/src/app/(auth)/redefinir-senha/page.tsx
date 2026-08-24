import { redirect } from "next/navigation";
import { culturalHubUrl } from "@max/auth";

export const metadata = { title: "Redefinir senha" };

export default function RedefinirSenhaPage() {
  redirect(`${culturalHubUrl()}/login/recuperar`);
}
