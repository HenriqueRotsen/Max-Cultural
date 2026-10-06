import { redirect } from "next/navigation";

/** Redefinição por link removida — use /login/recuperar (senha temporária por e-mail). */
export default function RedefinirPage() {
  redirect("/login/recuperar");
}
