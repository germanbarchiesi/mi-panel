"use client";

import { useEffect } from "react";

// Registra el service worker (solo guarda la interfaz y la página sin conexión; ver public/sw.js).
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* sin SW la app sigue funcionando; solo se pierde la página sin conexión */
    });
  }, []);
  return null;
}
