import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/env";
import { origenDe } from "@/lib/biometria";
import { admin } from "@/lib/admin";
import { clavesVapid, suscripcionValida } from "@/lib/push";

// Activar o quitar las notificaciones de este dispositivo. Solo el propietario y desde la propia app.
const NO_STORE = { "Cache-Control": "no-store" };
const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

async function propietario(request: Request) {
  if (request.method !== "GET" && !origenDe(request)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isOwner(user) ? user : null;
}

export async function GET(request: Request) {
  if (!(await propietario(request))) return json({ error: "sesion" }, 401);
  try {
    return json({ clave: (await clavesVapid()).publicKey });
  } catch {
    return json({ error: "config" }, 500);
  }
}

export async function POST(request: Request) {
  const user = await propietario(request);
  if (!user) return json({ error: "sesion" }, 401);
  const cuerpo = (await request.json().catch(() => null)) as { suscripcion?: unknown; nombre?: unknown } | null;
  const s = suscripcionValida(cuerpo?.suscripcion);
  if (!s) return json({ error: "suscripcion" }, 400);
  const nombre = (typeof cuerpo?.nombre === "string" ? cuerpo.nombre : "").trim().slice(0, 40) || "Dispositivo";
  const { error } = await admin()
    .from("suscripciones_push")
    .upsert({ endpoint: s.endpoint, user_id: user.id, p256dh: s.p256dh, auth: s.auth, nombre });
  return error ? json({ error: "guardar" }, 500) : json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await propietario(request);
  if (!user) return json({ error: "sesion" }, 401);
  const cuerpo = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof cuerpo?.endpoint !== "string") return json({ error: "endpoint" }, 400);
  await admin().from("suscripciones_push").delete().eq("endpoint", cuerpo.endpoint).eq("user_id", user.id);
  return json({ ok: true });
}
