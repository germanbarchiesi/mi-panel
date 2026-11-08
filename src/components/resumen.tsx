"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icono } from "@/components/iconos";

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
    <button className="boton boton-primario" type="button" onClick={alternar} aria-pressed={hablando}>
      <Icono nombre={hablando ? "parar" : "play"} tam={16} />
      {hablando ? "Parar" : "Escuchar"}
    </button>
  );
}

function base64AUint8(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Registro del service worker; espera como mucho 5 s (si no hay ninguno, `ready` no termina nunca). */
async function registro(): Promise<ServiceWorkerRegistration | null> {
  const listo = navigator.serviceWorker.ready;
  const tope = new Promise<null>((ok) => setTimeout(() => ok(null), 5000));
  return Promise.race([listo, tope]);
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
      const reg = await registro();
      if (!reg) {
        setEstado("no_soportado");
        return;
      }
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
      const reg = await registro();
      if (!reg) throw new Error("sw");
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
    const reg = await registro();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
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

  if (estado === "cargando") return <p className="nota">Comprobando este dispositivo…</p>;
  if (estado === "no_soportado")
    return <p className="nota">Este navegador no admite notificaciones. En el móvil, abre Mi Panel desde la app instalada.</p>;
  if (estado === "denegado")
    return (
      <p className="aviso">
        <Icono nombre="alerta" tam={18} />
        <span>Las notificaciones están bloqueadas para Mi Panel. Permítelas en los ajustes del navegador o del móvil.</span>
      </p>
    );

  return (
    <div className="estado">
      <p className={estado === "activo" ? "estado-conexion ok" : "estado-conexion"}>
        {estado === "activo" ? "Activadas en este dispositivo" : "Desactivadas en este dispositivo"}
      </p>
      {estado === "inactivo" && (
        <label className="campo">
          Nombre de este dispositivo
          <input type="text" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} />
        </label>
      )}
      {estado === "activo" ? (
        <button className="boton" type="button" onClick={quitar}>
          Quitar las notificaciones
        </button>
      ) : (
        <button className="boton boton-primario" type="button" onClick={activar}>
          <Icono nombre="campana" tam={18} />
          Activar notificaciones
        </button>
      )}
      {msg && (
        <p className="nota" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

export function Copiar({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<"" | "ok" | "error">("");
  return (
    <>
      <button
        className="boton"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setEstado("ok");
            setTimeout(() => setEstado(""), 2000);
          } catch {
            setEstado("error");
          }
        }}
      >
        <Icono nombre={estado === "ok" ? "check" : "copiar"} tam={18} />
        {estado === "ok" ? "Copiada" : "Copiar la dirección"}
      </button>
      {estado === "error" && (
        <span className="nota" role="status">
          No se ha podido copiar: mantén pulsada la dirección para seleccionarla.
        </span>
      )}
    </>
  );
}
