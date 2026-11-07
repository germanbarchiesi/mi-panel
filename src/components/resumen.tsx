"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const nada = () => () => {};
const tieneVoz = () => "speechSynthesis" in window;

/** Lee el resumen con la voz en español del propio dispositivo (sin coste, sin red). */
export function BotonEscuchar({ texto }: { texto: string }) {
  const [hablando, setHablando] = useState(false);
  const soportado = useSyncExternalStore(nada, tieneVoz, () => false);

  useEffect(
    () => () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  if (!soportado) return null;

  function alternar() {
    const s = window.speechSynthesis;
    if (hablando) {
      s.cancel();
      setHablando(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-ES";
    const voz = s.getVoices().find((v) => v.lang === "es-ES") ?? s.getVoices().find((v) => v.lang.startsWith("es"));
    if (voz) u.voice = voz;
    u.rate = 1.02;
    u.onend = () => setHablando(false);
    u.onerror = () => setHablando(false);
    s.cancel();
    s.speak(u);
    setHablando(true);
  }

  return (
    <button className="btn btn-primary" type="button" onClick={alternar} aria-pressed={hablando}>
      {hablando ? "Parar" : "▶ Escuchar"}
    </button>
  );
}

function base64AUint8(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Activa o quita las notificaciones en este dispositivo. */
export function Notificaciones() {
  const [estado, setEstado] = useState<"cargando" | "no_soportado" | "denegado" | "activo" | "inactivo">("cargando");
  const [nombre, setNombre] = useState("Este dispositivo");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setEstado("no_soportado");
        return;
      }
      if (Notification.permission === "denied") {
        setEstado("denegado");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      setEstado((await reg.pushManager.getSubscription()) ? "activo" : "inactivo");
    })().catch(() => setEstado("no_soportado"));
  }, []);

  async function activar() {
    setMsg(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "denegado" : "inactivo");
        return;
      }
      const r = await fetch("/api/push", { cache: "no-store" });
      const { clave } = await r.json();
      if (!r.ok || !clave) throw new Error("config");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64AUint8(clave) }));
      const g = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suscripcion: sub.toJSON(), nombre }),
      });
      if (!g.ok) throw new Error("guardar");
      setEstado("activo");
      setMsg("Notificaciones activadas en este dispositivo.");
    } catch (e) {
      setMsg(
        e instanceof Error && e.message === "config"
          ? "Falta configurar SUPABASE_SECRET_KEY o ejecutar la migración 0006."
          : "No se pudieron activar. Inténtalo de nuevo.",
      );
    }
  }

  async function quitar() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => undefined);
      await sub.unsubscribe();
    }
    setEstado("inactivo");
    setMsg("Notificaciones quitadas de este dispositivo.");
  }

  if (estado === "cargando") return <p className="muted small">Comprobando…</p>;
  if (estado === "no_soportado")
    return <p className="muted small">Este navegador no admite notificaciones. En el móvil, abre Mi Panel desde la app instalada.</p>;
  if (estado === "denegado")
    return <p className="aviso small">Las notificaciones están bloqueadas para Mi Panel. Permítelas en los ajustes del navegador o del móvil.</p>;

  return (
    <div className="campos">
      {estado === "inactivo" && (
        <label>
          Nombre de este dispositivo
          <input type="text" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} />
        </label>
      )}
      <div>
        {estado === "activo" ? (
          <button className="btn" type="button" onClick={quitar}>
            Quitar notificaciones de este dispositivo
          </button>
        ) : (
          <button className="btn btn-primary" type="button" onClick={activar}>
            Activar notificaciones en este dispositivo
          </button>
        )}
        {msg && (
          <p className="small" role="status">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}

export function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          setOk(false);
        }
      }}
    >
      {ok ? "Copiada ✓" : "Copiar dirección"}
    </button>
  );
}
