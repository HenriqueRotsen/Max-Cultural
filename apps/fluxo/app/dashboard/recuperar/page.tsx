import { redirect } from "next/navigation";
import { culturalHubUrl } from "@max/auth";

export default function RecuperarPage() {
  redirect(`${culturalHubUrl()}/login/recuperar`);
}
