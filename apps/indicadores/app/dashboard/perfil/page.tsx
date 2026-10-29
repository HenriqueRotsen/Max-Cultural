import { culturalAccountUrl } from "@max/auth";
import { redirect } from "next/navigation";

/** Perfil e acesso ficam no hub MAX Cultural. */
export default function PerfilPage() {
  redirect(culturalAccountUrl());
}
