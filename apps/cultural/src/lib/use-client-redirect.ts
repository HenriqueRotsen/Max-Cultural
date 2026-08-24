"use client";

import { useEffect } from "react";

/** Full navigation after Set-Cookie in a Server Action, so proxy/middleware sees the session. */
export function useClientRedirect(to?: string) {
  useEffect(() => {
    if (to) window.location.replace(to);
  }, [to]);
}
