import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/lib/env";
import { SinClaveSecreta } from "@/lib/admin";
import { tick } from "@/lib/resumen-servicio";

// Supabase Cron lo llama cada 30 minutos (migración 0007). Solo con «Authorization: Bearer CRON_SECRET».
export const maxDuration = 60;
const NO_STORE = { "Cache-Control": "no-store" };

function autorizado(request: Request): boolean {
  const s = cronSecret();
  const h = request.headers.get("authorization") ?? "";
  if (!s || !h.startsWith("Bearer ")) return false;
  const a = Buffer.from(h.slice(7));
  const b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ error: "no" }, { status: 401, headers: NO_STORE });
  try {
    return NextResponse.json(await tick(), { headers: NO_STORE });
  } catch (e) {
    const config = e instanceof SinClaveSecreta;
    console.error("resumen tick", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: config ? "falta SUPABASE_SECRET_KEY" : "error" }, { status: 500, headers: NO_STORE });
  }
}
