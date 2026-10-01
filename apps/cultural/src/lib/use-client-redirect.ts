"use client";

import { useEffect } from "react";

/** Full navigation after Set-Cookie in a Server Action, so proxy/middleware sees the session. */
export function useClientRedirect(to?: string) {
  useEffect(() => {
    if (!to) return;
    // Dá tempo do browser gravar o Set-Cookie da Server Action antes do hard nav.
    const id = window.setTimeout(() => {
      window.location.replace(to);
    }, 50);
    return () => window.clearTimeout(id);
  }, [to]);
}
