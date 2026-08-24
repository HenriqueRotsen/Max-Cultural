import { redirect } from "next/navigation";
import { origemHubLoginUrl } from "@/lib/auth/hub";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next ? sp.next : "/painel";
  redirect(origemHubLoginUrl(next));
}
