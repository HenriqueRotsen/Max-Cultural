import { redirect } from "next/navigation";
import { indicadoresHubHomeUrl } from "@/lib/hub";

/** Onboarding 2FA removido — auth só no MAX Cultural. */
export default function Onboarding2faPage() {
  redirect(indicadoresHubHomeUrl());
}
