import { NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/env";
import {
  FaltaMigracionBiometria,
  bloquear,
  desbloquear,
  guardarReto,
  listarCredenciales,
  loginReciente,
  origenDe,
  tomarReto,
} from "@/lib/biometria";

// Llaves de acceso para desbloquear Finanzas. Solo POST, solo el propietario, mismo Origin.
// Acciones: registro-opciones, registro, desbloqueo-opciones, desbloqueo, bloquear.

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request: Request, { params }: { params: Promise<{ accion: string }> }) {
  const { accion } = await params;
  const origen = origenDe(request);
  if (!origen) return json({ error: "origen" }, 403);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) return json({ error: "sesion" }, 401);

  try {
    if (accion === "bloquear") {
      await bloquear();
      return json({ ok: true });
    }

    const credenciales = await listarCredenciales(supabase, user.id);

    if (accion === "registro-opciones") {
      // Un dispositivo nuevo solo se puede añadir justo después de entrar con Google:
      // una sesión robada no basta para registrar su propia huella.
      if (!loginReciente(user)) return json({ error: "login_reciente" }, 403);
      const opciones = await generateRegistrationOptions({
        rpName: "Mi Panel",
        rpID: origen.rpID,
        userName: user.email ?? "propietario",
        userID: new TextEncoder().encode(user.id),
        attestationType: "none",
        excludeCredentials: credenciales.map((c) => ({ id: c.id, transports: c.transportes })),
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "preferred",
          userVerification: "required",
        },
      });
      await guardarReto(user.id, "registro", opciones.challenge);
      return json(opciones);
    }

    if (accion === "registro") {
      if (!loginReciente(user)) return json({ error: "login_reciente" }, 403);
      const reto = await tomarReto(user.id, "registro");
      if (!reto) return json({ error: "reto" }, 400);
      const cuerpo = (await request.json()) as { respuesta: RegistrationResponseJSON; nombre?: string };
      const v = await verifyRegistrationResponse({
        response: cuerpo.respuesta,
        expectedChallenge: reto,
        expectedOrigin: origen.origen,
        expectedRPID: origen.rpID,
        requireUserVerification: true,
      });
      if (!v.verified) return json({ error: "verificacion" }, 400);
      const c = v.registrationInfo.credential;
      const nombre = (typeof cuerpo.nombre === "string" ? cuerpo.nombre : "").trim().slice(0, 40) || "Dispositivo";
      const { error } = await supabase.from("credenciales_biometria").insert({
        id: c.id,
        user_id: user.id,
        clave_publica: Buffer.from(c.publicKey).toString("base64url"),
        contador: c.counter,
        transportes: c.transports ?? [],
        nombre,
      });
      if (error) {
        console.error("biometria registro guardar", error.code, error.message);
        return json({ error: "guardar" }, 500);
      }
      await desbloquear(user.id);
      return json({ ok: true });
    }

    if (accion === "desbloqueo-opciones") {
      if (credenciales.length === 0) return json({ error: "sin_credenciales" }, 400);
      const opciones = await generateAuthenticationOptions({
        rpID: origen.rpID,
        allowCredentials: credenciales.map((c) => ({ id: c.id, transports: c.transportes })),
        userVerification: "required",
      });
      await guardarReto(user.id, "desbloqueo", opciones.challenge);
      return json(opciones);
    }

    if (accion === "desbloqueo") {
      const reto = await tomarReto(user.id, "desbloqueo");
      if (!reto) return json({ error: "reto" }, 400);
      const respuesta = (await request.json()) as AuthenticationResponseJSON;
      const cred = credenciales.find((c) => c.id === respuesta.id);
      if (!cred) return json({ error: "credencial" }, 400);
      const v = await verifyAuthenticationResponse({
        response: respuesta,
        expectedChallenge: reto,
        expectedOrigin: origen.origen,
        expectedRPID: origen.rpID,
        credential: {
          id: cred.id,
          publicKey: new Uint8Array(Buffer.from(cred.clave_publica, "base64url")),
          counter: Number(cred.contador),
          transports: cred.transportes,
        },
        requireUserVerification: true,
      });
      if (!v.verified) return json({ error: "verificacion" }, 400);
      await supabase
        .from("credenciales_biometria")
        .update({ contador: v.authenticationInfo.newCounter, usado: new Date().toISOString() })
        .eq("id", cred.id)
        .eq("user_id", user.id);
      await desbloquear(user.id);
      return json({ ok: true });
    }

    return json({ error: "accion" }, 404);
  } catch (e) {
    if (e instanceof FaltaMigracionBiometria) return json({ error: "migracion" }, 500);
    // El mensaje de la librería no contiene secretos (p. ej. «Unexpected registration response origin»):
    // se devuelve recortado para poder diagnosticar desde el móvil y se deja en el registro de Vercel.
    const detalle = e instanceof Error ? e.message.slice(0, 200) : "desconocido";
    console.error(`biometria ${accion}`, detalle);
    return json({ error: "verificacion", detalle }, 400);
  }
}
