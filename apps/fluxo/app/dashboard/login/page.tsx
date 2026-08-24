import { redirect } from "next/navigation";
import { fluxoHubLoginUrl } from "@/lib/hub";

export default function AdminLoginPage() {
  redirect(fluxoHubLoginUrl("/dashboard"));
}
