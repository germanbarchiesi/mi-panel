"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Con «Usar la hora de donde estoy» activado, guarda la zona del dispositivo en una cookie
// y recarga los datos si ha cambiado (p. ej. al llegar a otro país).
export function TzSync() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return;
    const actual = document.cookie
      .split("; ")
      .find((c) => c.startsWith("tz="))
      ?.slice(3);
    if (actual !== encodeURIComponent(tz)) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax; secure`;
      router.refresh();
    }
  }, [router]);
  return null;
}
