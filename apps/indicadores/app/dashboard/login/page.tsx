import { redirect } from "next/navigation";
import { indicadoresHubLoginUrl } from "@/lib/hub";

export default function AdminLoginPage() {
  redirect(indicadoresHubLoginUrl("/dashboard"));
}
