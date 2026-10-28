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
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "verificacion");
  return data;
}

function mensaje(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (e instanceof Error && e.name === "NotAllowedError") return "Cancelado.";
  return ERRORES[m] ?? "No se pudo completar. Inténtalo de nuevo.";
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
