"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

const ERRORES: Record<string, string> = {
  login_reciente: "Para añadir un dispositivo, sal y vuelve a entrar con Google; tienes 10 minutos.",
  sin_credenciales: "Este panel aún no tiene ningún dispositivo registrado. Hazlo en Ajustes.",
  migracion: "Falta ejecutar la migración 0003 en Supabase (SQL Editor).",
  reto: "La petición caducó. Inténtalo de nuevo.",
  credencial: "Este dispositivo no está registrado. Regístralo en Ajustes.",
  verificacion: "No se pudo verificar. Inténtalo de nuevo.",
  guardar: "No se pudo guardar el dispositivo en la base de datos.",
  origen: "Petición rechazada.",
  sesion: "La sesión ha caducado. Vuelve a entrar.",
};

async function post(accion: string, cuerpo?: unknown) {
  const res = await fetch(`/api/biometria/${accion}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const codigo = typeof data.error === "string" ? data.error : `http_${res.status}`;
    throw new Error(data.detalle ? `${codigo}: ${String(data.detalle).slice(0, 120)}` : codigo);
  }
  return data;
}

// Errores del navegador / del sistema (WebAuthn) más habituales.
const ERRORES_NAVEGADOR: Record<string, string> = {
  NotAllowedError: "Cancelado o caducado. Si no has cancelado tú, revisa que el móvil tenga bloqueo de pantalla con huella.",
  InvalidStateError: "Este dispositivo ya está registrado. Usa «Desbloquear con huella».",
  SecurityError: "El navegador ha rechazado la petición por seguridad (dominio).",
  NotSupportedError: "Este dispositivo no admite llaves de acceso con estas opciones.",
  AbortError: "Se ha interrumpido. Inténtalo de nuevo.",
  ConstraintError: "El dispositivo no puede verificar tu identidad (falta huella o bloqueo de pantalla).",
};

/** Mensaje claro y, si no se reconoce, el código técnico entre paréntesis para poder diagnosticarlo. */
function mensaje(e: unknown): string {
  if (!(e instanceof Error)) return "No se pudo completar. Inténtalo de nuevo.";
  const code = (e as Error & { code?: string }).code;
  if (ERRORES[e.message]) return ERRORES[e.message];
  const [codigoServidor, ...resto] = e.message.split(": ");
  if (ERRORES[codigoServidor] && resto.length) return `${ERRORES[codigoServidor]} (${resto.join(": ")})`;
  if (ERRORES_NAVEGADOR[e.name]) return `${ERRORES_NAVEGADOR[e.name]} (${e.name}${code ? ` · ${code}` : ""})`;
  const detalle = [e.name !== "Error" ? e.name : "", code ?? "", e.message].filter(Boolean).join(" · ").slice(0, 160);
  return `No se pudo completar (${detalle || "sin detalle"}).`;
}

export function BotonDesbloquear() {
  const router = useRouter();
  const [estado, setEstado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function desbloquear() {
    setOcupado(true);
    setEstado(null);
    try {
      if (!browserSupportsWebAuthn()) throw new Error("no_soportado");
      const opciones = await post("desbloqueo-opciones");
      const respuesta = await startAuthentication({ optionsJSON: opciones });
      await post("desbloqueo", respuesta);
      router.refresh();
    } catch (e) {
      setEstado(e instanceof Error && e.message === "no_soportado" ? "Este navegador no admite huella." : mensaje(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <button className="btn btn-primary" type="button" onClick={desbloquear} disabled={ocupado}>
        {ocupado ? "Esperando…" : "Desbloquear con huella"}
      </button>
      {estado && (
        <p className="error small" role="alert">
          {estado}
        </p>
      )}
    </div>
  );
}

export function BotonRegistrar({ nombrePorDefecto }: { nombrePorDefecto: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombrePorDefecto);
  const [estado, setEstado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function registrar() {
    setOcupado(true);
    setEstado(null);
    try {
      if (!browserSupportsWebAuthn()) throw new Error("no_soportado");
      const opciones = await post("registro-opciones");
      const respuesta = await startRegistration({ optionsJSON: opciones });
      await post("registro", { respuesta, nombre });
      setEstado("Dispositivo registrado.");
      router.refresh();
    } catch (e) {
      setEstado(e instanceof Error && e.message === "no_soportado" ? "Este navegador no admite huella." : mensaje(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="campos">
      <label>
        Nombre de este dispositivo
        <input type="text" value={nombre} maxLength={40} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <div>
        <button className="btn btn-primary" type="button" onClick={registrar} disabled={ocupado}>
          {ocupado ? "Esperando…" : "Registrar huella de este dispositivo"}
        </button>
        {estado && (
          <p className="small" role="status">
            {estado}
          </p>
        )}
      </div>
    </div>
  );
}

/** Vuelve a pedir la página al caducar el desbloqueo, para que los datos desaparezcan de la pantalla. */
export function AutoBloqueo({ hasta }: { hasta: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.refresh(), Math.max(0, hasta - Date.now()) + 500);
    return () => clearTimeout(t);
  }, [hasta, router]);
  return null;
}

export function BotonBloquear() {
  const router = useRouter();
  return (
    <button
      className="btn"
      type="button"
      onClick={async () => {
        await post("bloquear").catch(() => undefined);
        router.refresh();
      }}
    >
      Bloquear
    </button>
  );
}

/** Muestra u oculta los importes en este dispositivo (cookie); el servidor no los envía si están ocultos. */
export function BotonImportes({ ocultos }: { ocultos: boolean }) {
  const router = useRouter();
  return (
    <button
      className="btn"
      type="button"
      aria-pressed={ocultos}
      onClick={() => {
        const secure = location.protocol === "https:" ? "; secure" : "";
        document.cookie = ocultos
          ? `importes=; path=/; max-age=0; samesite=strict${secure}`
          : `importes=ocultos; path=/; max-age=31536000; samesite=strict${secure}`;
        router.refresh();
      }}
    >
      {ocultos ? "Mostrar importes" : "Ocultar importes"}
    </button>
  );
}
