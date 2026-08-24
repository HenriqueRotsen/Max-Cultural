import { redirect } from "next/navigation";
import { fluxoHubLoginUrl } from "@/lib/hub";

export default function Login2faPage() {
  redirect(fluxoHubLoginUrl("/dashboard"));
}
