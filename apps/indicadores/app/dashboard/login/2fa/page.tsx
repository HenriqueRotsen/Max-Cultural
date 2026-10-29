import { redirect } from "next/navigation";
import { indicadoresHubLoginUrl } from "@/lib/hub";

export default function Login2faPage() {
  redirect(indicadoresHubLoginUrl("/dashboard"));
}
