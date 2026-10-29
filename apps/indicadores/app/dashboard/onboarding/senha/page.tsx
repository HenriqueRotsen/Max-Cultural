import { redirect } from "next/navigation";
import { indicadoresHubHomeUrl } from "@/lib/hub";

/** Onboarding de senha removido — auth só no MAX Cultural. */
export default function OnboardingSenhaPage() {
  redirect(indicadoresHubHomeUrl());
}
