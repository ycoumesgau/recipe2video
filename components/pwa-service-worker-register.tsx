"use client";

import { useEffect } from "react";

/**
 * Enregistre un service worker minimal en production uniquement (évite les conflits avec le HMR en dev).
 */
export function PwaServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* ignore : contexte non supporté ou réponse non-SW */
    });
  }, []);

  return null;
}
