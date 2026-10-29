import { redirect } from "next/navigation";
import { culturalHubUrl } from "@max/auth";

export default function RecuperarTokenPage() {
  redirect(`${culturalHubUrl()}/login/recuperar`);
}
