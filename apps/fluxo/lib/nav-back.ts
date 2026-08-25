export type BackTarget = {
  href: string;
  label: string;
};

const ROOT_PATHS = new Set([
  "/dashboard",
  "/dashboard/analise",
  "/dashboard/contextos",
  "/dashboard/importar",
  "/dashboard/perfil",
  "/pessoa",
  "/territorio",
  "/territorio/online",
]);

/** Destino de fallback quando não há histórico ou back explícito da página. */
export function resolveBackFallback(pathname: string): BackTarget | null {
  if (ROOT_PATHS.has(pathname)) return null;

  const segments = pathname.split("/").filter(Boolean);

  if (pathname.startsWith("/dashboard/acesso/")) {
    return { href: "/dashboard", label: "Base" };
  }

  if (pathname.startsWith("/dashboard/onboarding/")) {
    return { href: "/dashboard", label: "Base" };
  }

  if (pathname.startsWith("/dashboard/recuperar")) {
    return { href: "/dashboard/login", label: "Login" };
  }

  if (/^\/contexto\/[^/]+$/.test(pathname)) {
    return { href: "/dashboard/analise", label: "Análise" };
  }

  if (/^\/projeto\/[^/]+\/[^/]+$/.test(pathname)) {
    const idProjeto = segments[1]!;
    return { href: `/projeto/${encodeURIComponent(idProjeto)}`, label: "Projeto" };
  }

  if (/^\/projeto\/[^/]+$/.test(pathname)) {
    return { href: "/dashboard/analise", label: "Análise" };
  }

  if (/^\/pessoa\/[^/]+$/.test(pathname)) {
    return { href: "/pessoa", label: "Consulta CPF" };
  }

  if (segments[0] === "territorio") {
    if (segments.length === 2) {
      if (segments[1] === "online") return null;
      return { href: "/territorio", label: "Territórios" };
    }
    if (segments.length === 3) {
      if (segments[1] === "online") {
        return { href: "/territorio/online", label: "Online" };
      }
      return {
        href: `/territorio/${encodeURIComponent(segments[1]!)}`,
        label: segments[1]!.toUpperCase(),
      };
    }
    if (segments.length === 4 && segments[1] !== "online") {
      return {
        href: `/territorio/${encodeURIComponent(segments[1]!)}/${encodeURIComponent(segments[2]!)}`,
        label: decodeURIComponent(segments[2]!),
      };
    }
  }

  if (segments.length > 1) {
    return { href: "/dashboard", label: "Base" };
  }

  return null;
}
