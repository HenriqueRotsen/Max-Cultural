import { redirect } from "next/navigation";

/** TOTP removido — 2FA é código por e-mail no login. */
export default function Onboarding2faPage() {
  redirect("/");
}
