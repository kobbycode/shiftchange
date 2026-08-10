"use client";

import * as React from "react";

export const BROWSING_FLAG = "shift_checkin_optin";

// "Just Browsing" login mode: the technician is signed in but NOT on duty —
// everything becomes view-only. The login page sets the flag to "0" for
// browsing and to "1" (then auth-context consumes and clears it) for duty.
// Any other state (missing flag) means an on-duty session.
export function isBrowsingMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(BROWSING_FLAG) === "0";
  } catch {
    return false;
  }
}

export function useBrowsingMode(): boolean {
  // Lazy initialization: read localStorage immediately on first render
  // to avoid a flash of `false` before the effect runs.
  const [browsing, setBrowsing] = React.useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(BROWSING_FLAG) === "0";
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    const update = () => setBrowsing(isBrowsingMode());
    update();
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
    };
  }, []);

  return browsing;
}
