import { requireUser } from "@/lib/auth/session";
import { needsLogin } from "@/lib/auth/config";
import { culturalHubUrl } from "@max/auth";

/**
 * Permissões do hub MAX Cultural para Planejamento.
 * Dev aberto / sem login: libera.
 * Fallback: perfil ADMIN no Origem.
 */
async function canHubScreen(screen: string): Promise<boolean> {
  const user = await requireUser();

  if (!needsLogin()) return true;

  try {
    const hub = culturalHubUrl();
    const res = await fetch(`${hub}/api/session/permissions`, {
      headers: { cookie: await cookieHeader() },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as {
        permissions?: Array<{ screen: string; canEdit?: boolean }>;
      };
      const hit = data.permissions?.find((p) => p.screen === screen);
      if (hit) return Boolean(hit.canEdit);
    }
  } catch {
    // hub indisponível — fallback
  }

  return user.profile.role === "ADMIN";
}

export async function canExceedRubric(): Promise<boolean> {
  return canHubScreen("origem.planejamento.exceder_rubrica");
}

export async function canPublishToSalic(): Promise<boolean> {
  return canHubScreen("origem.planejamento.subir_salic");
}

async function cookieHeader(): Promise<string> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}
