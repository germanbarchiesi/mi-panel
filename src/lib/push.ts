import "server-only";
import { generateVAPIDKeys, sendNotification, WebPushError } from "web-push";
import { admin } from "@/lib/admin";
import { cifrar, descifrar } from "@/lib/cripto";

// Notificaciones Web Push. Las claves VAPID las genera la propia app la primera vez y las guarda
// cifradas (no hace falta crear ninguna variable). La notificación nunca lleva contenido del resumen.

type Vapid = { publicKey: string; privateKey: string };
const AAD = "app|vapid";
let cache: Vapid | null = null;

export async function clavesVapid(): Promise<Vapid> {
  if (cache) return cache;
  const db = admin();
  const leer = async () => {
    const { data } = await db.from("claves_app").select("valor_cifrado").eq("nombre", "vapid").maybeSingle();
    return data ? (JSON.parse(descifrar(data.valor_cifrado, AAD)) as Vapid) : null;
  };
  let v = await leer();
  if (!v) {
    const nuevas = generateVAPIDKeys();
    // Si dos peticiones llegan a la vez, gana la primera y las dos usan esa.
    await db
      .from("claves_app")
      .upsert({ nombre: "vapid", valor_cifrado: cifrar(JSON.stringify(nuevas), AAD) }, { onConflict: "nombre", ignoreDuplicates: true });
    v = await leer();
  }
  if (!v) throw new Error("No se pudieron crear las claves de notificación");
  cache = v;
  return v;
}

export type Suscripcion = { endpoint: string; p256dh: string; auth: string };

const ENDPOINT = /^https:\/\/[a-z0-9.-]+(:\d+)?\/[\w\-./:%=?&~+]*$/i;

export function suscripcionValida(s: unknown): Suscripcion | null {
  const o = s as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof o?.endpoint === "string" ? o.endpoint : "";
  const p256dh = typeof o?.keys?.p256dh === "string" ? o.keys.p256dh : "";
  const auth = typeof o?.keys?.auth === "string" ? o.keys.auth : "";
  if (endpoint.length > 1000 || !ENDPOINT.test(endpoint)) return null;
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{10,60}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** Envía «Tu resumen está listo» a todos los dispositivos; borra los que ya no existen. */
export async function notificar(userId: string, cuerpo = "Tu resumen está listo"): Promise<number> {
  const db = admin();
  const { data } = await db.from("suscripciones_push").select("endpoint,p256dh,auth").eq("user_id", userId);
  if (!data?.length) return 0;
  const v = await clavesVapid();
  let ok = 0;
  await Promise.all(
    (data as Suscripcion[]).map(async (s) => {
      try {
        await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ titulo: "Mi Panel", cuerpo, url: "/" }),
          {
            vapidDetails: { subject: "https://mi-panel-five-olive.vercel.app/privacidad", publicKey: v.publicKey, privateKey: v.privateKey },
            TTL: 3 * 3600,
            urgency: "normal",
            timeout: 8000,
          },
        );
        ok++;
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
          await db.from("suscripciones_push").delete().eq("endpoint", s.endpoint).eq("user_id", userId);
        }
      }
    }),
  );
  return ok;
}
