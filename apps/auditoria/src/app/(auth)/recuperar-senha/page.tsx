import { redirect } from "next/navigation";
import { culturalHubUrl } from "@max/auth";

export const metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  redirect(`${culturalHubUrl()}/login/recuperar`);
}
