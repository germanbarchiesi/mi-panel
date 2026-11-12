import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/env";
import {
  cargarAjustes,
  cargarAjustesYEstado,
  guardarAjustes,
  guardarExcel,
  guardarAgentes,
  normalizarAjustes,
  registrarOkMisTareas,
} from "@/lib/ajustes";
import { accessToken, FaltaMigracion, GoogleReconectar, SCOPE_DRIVE_FILE, scopesConcedidos, tieneScope } from "@/lib/google";
import { MIMES_EXCEL, crearCarpeta, crearFicheroJson, descripcion, esIdDrive, metadatos } from "@/lib/drive";
import { AGENTES, CARPETA_AGENTES, contenidoInicial } from "@/lib/agentes";
import {
  FaltaMigracionBiometria,
  LOGIN_RECIENTE,
  listarCredenciales,
  loginReciente,
  type Credencial,
} from "@/lib/biometria";
import { pickerConfig, stravaConfig } from "@/lib/env";
import { StravaReconectar, leerPermisos } from "@/lib/strava";
import { cronSecret, githubDispatch, supabaseSecretKey } from "@/lib/env";
import { crearFeed, tokenFeed } from "@/lib/feed";
import { prepararAhora, ultimoTick, zonaResumen } from "@/lib/resumen-servicio";
import { headers } from "next/headers";
import { emergencia } from "@/lib/emergencia";
import { listarCalendarios, excluidoPorDefecto, type CalendarioInfo } from "@/lib/calendar";
import { calendariosActivos, hoyEn, zonaHoraria } from "@/lib/agenda-loader";
import { esCalendarioMisTareas } from "@/lib/calendar";
import { MENSAJES_FALLO } from "@/lib/mis-tareas";
import { pedirResumen, urlMisTareas } from "@/lib/mis-tareas-api";
import { esEquipoTrabajo, marcarEquipoTrabajo } from "@/lib/equipo";
import { AjustesVista, type DatosAjustes } from "@/components/ajustes-vista";

export const metadata: Metadata = { title: "Ajustes" };
// «Preparar resumen ahora» lee todos los módulos: necesita más tiempo que el de por defecto.
export const maxDuration = 60;

const ERRORES: Record<string, string> = {
  denegado: "Cancelaste el permiso en Google. No se ha conectado nada.",
  estado: "La conexión caducó o no coincide. Inténtalo de nuevo.",
  canje: "Google no aceptó la conexión. Revisa GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en Vercel y la URI de redirección en Google Cloud.",
  sin_refresh: "Google no entregó el permiso permanente. Inténtalo de nuevo.",
  sin_permiso: "Falta el permiso de lectura de Calendar. Márcalo en la pantalla de Google y vuelve a conectar.",
  migracion: "Falta ejecutar la migración 0002 en Supabase (SQL Editor).",
  excel: "Ese fichero no es un Excel (.xlsm o .xlsx) o no se puede leer.",
  strava_denegado: "Cancelaste el permiso en Strava. No se ha conectado nada.",
  strava_permiso: "Falta el permiso «ver tus actividades» en Strava. Márcalo y vuelve a conectar.",
  strava_canje: "Strava no aceptó la conexión. Revisa STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET y el dominio de la app en Strava.",
  strava_config: "Falta configurar STRAVA_CLIENT_ID y STRAVA_CLIENT_SECRET en Vercel.",
  strava_migracion: "Falta ejecutar la migración 0005 en Supabase (SQL Editor).",
  agentes: "No se pudo crear la carpeta de agentes en Drive. Reconecta Google e inténtalo de nuevo.",
  resumen: "No se pudo preparar el resumen. Revisa SUPABASE_SECRET_KEY y que la migración 0006 esté ejecutada.",
  feed: "No se pudo crear la dirección del feed.",
  confirmar: "Para usar el botón de emergencia escribe EMERGENCIA en mayúsculas.",
  guardar: "No se pudo guardar. Inténtalo de nuevo.",
};

const OKS: Record<string, string> = {
  guardado: "Ajustes de la agenda guardados.",
  desconectado: "Google desconectado.",
  equipo: "Equipo guardado.",
  excel: "Excel elegido.",
  huella_borrada: "Dispositivo quitado.",
  strava_desconectado: "Strava desconectado.",
  agentes: "Carpeta de agentes lista en Drive.",
  feed: "Dirección del feed nueva. La anterior ya no funciona.",
};

async function guardar(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) redirect("/login");

  const actuales = await cargarAjustes(supabase, user.id);
  const nuevos = normalizarAjustes({
    calendarios: formData.get("cal_lista") === "1" ? formData.getAll("cal").map(String) : actuales.calendarios,
    lv: { ini: String(formData.get("lv_ini")), fin: String(formData.get("lv_fin")) },
    fs: { ini: String(formData.get("fs_ini")), fin: String(formData.get("fs_fin")) },
    minHueco: Number(formData.get("min_hueco")),
    horaLocal: formData.get("hora_local") === "on",
    variosDiasComoContexto: formData.get("varios_dias") === "on",
  });
  const { error } = await guardarAjustes(supabase, user.id, nuevos);
  revalidatePath("/");
  redirect(error ? "/ajustes?error=guardar" : "/ajustes?ok=guardado");
}

async function guardarEquipo(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) redirect("/login");
  await marcarEquipoTrabajo(formData.get("equipo_trabajo") === "on");
  revalidatePath("/");
  redirect("/ajustes?ok=equipo");
}

async function elegirExcel(id: string) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) redirect("/login");
  if (!esIdDrive(id)) redirect("/ajustes?error=excel#finanzas");
  let nombre: string;
  try {
    // Se comprueba en Drive que el fichero es accesible con drive.file y que es un Excel.
    const meta = await metadatos(await accessToken(supabase, user.id), id);
    if (!MIMES_EXCEL.includes(meta.mime)) throw new Error("no es un Excel");
    nombre = meta.nombre;
  } catch {
    redirect("/ajustes?error=excel#finanzas");
  }
  const { error } = await guardarExcel(supabase, user.id, { id, nombre });
  revalidatePath("/");
  redirect(error ? "/ajustes?error=guardar" : "/ajustes?ok=excel#finanzas");
}

async function crearAgentes() {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) redirect("/login");
  let ok = true;
  try {
    const token = await accessToken(supabase, user.id);
    const { agentes } = await cargarAjustesYEstado(supabase, user.id);
    // Reutiliza la carpeta y los ficheros que sigan existiendo; crea solo lo que falte.
    const carpeta =
      agentes?.carpeta && (await descripcion(token, agentes.carpeta)) ? agentes.carpeta : await crearCarpeta(token, CARPETA_AGENTES);
    const ficheros: Record<string, string> = {};
    for (const a of AGENTES) {
      const id = carpeta === agentes?.carpeta ? agentes.ficheros[a.clave] : undefined;
      ficheros[a.clave] =
        id && (await descripcion(token, id)) ? id : await crearFicheroJson(token, carpeta, a.fichero, contenidoInicial(a));
    }
    const { error } = await guardarAgentes(supabase, user.id, { carpeta, ficheros });
    ok = !error;
  } catch {
    ok = false;
  }
  revalidatePath("/");
  redirect(ok ? "/ajustes?ok=agentes#agentes" : "/ajustes?error=agentes#agentes");
}

async function prepararResumen() {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) redirect("/login");
  let destino = "/ajustes?error=resumen#resumen";
  try {
    const e = await cargarAjustesYEstado(supabase, user.id);
    const r = await prepararAhora(user.id, zonaResumen(e.ajustes.horaLocal, e.tzConocida));
    if (r.preparado) destino = `/ajustes?ok=resumen&audio=${r.audio ? 1 : 0}&n=${r.notificados}#resumen`;
  } catch {
    // destino de error
  }
  revalidatePath("/");
  redirect(destino);
}

async function nuevoFeed() {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) redirect("/login");
  let ok = true;
  try {
    await crearFeed(supabase, user.id);
  } catch {
    ok = false;
  }
  redirect(ok ? "/ajustes?ok=feed#resumen" : "/ajustes?error=feed#resumen");
}

async function botonEmergencia(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) redirect("/login");
  if (formData.get("confirmar") !== "EMERGENCIA") redirect("/ajustes?error=confirmar#emergencia");
  await emergencia(supabase, user.id);
  redirect("/login");
}

async function borrarHuella(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOwner(user)) redirect("/login");
  const id = String(formData.get("id") ?? "");
  await supabase.from("credenciales_biometria").delete().eq("id", id).eq("user_id", user.id);
  redirect("/ajustes?ok=huella_borrada#huella");
}

function ahoraMs() {
  return Date.now();
}

export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; n?: string; audio?: string }>;
}) {
  const sp = await searchParams;
  const { error, ok } = sp;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { ajustes, misTareasUltimoOk, excel, agentes, feed } = await cargarAjustesYEstado(supabase, user.id);
  const conClave = !!supabaseSecretKey();
  const tick = conClave ? await ultimoTick().catch(() => null) : null;
  const tokenDelFeed = tokenFeed(user.id, feed);
  const h = await headers();
  const origen = `https://${h.get("host") ?? "mi-panel-five-olive.vercel.app"}`;
  const conDrive = tieneScope(await scopesConcedidos(supabase, user.id), SCOPE_DRIVE_FILE);
  let credenciales: Credencial[] = [];
  let faltaMigracionHuella = false;
  try {
    credenciales = await listarCredenciales(supabase, user.id);
  } catch (e) {
    faltaMigracionHuella = e instanceof FaltaMigracionBiometria;
  }
  let strava: "conectado" | "sin_conectar" | "falta_migracion" = "sin_conectar";
  let stravaEscribir = false;
  try {
    const permisos = await leerPermisos(supabase, user.id);
    strava = permisos ? "conectado" : "sin_conectar";
    stravaEscribir = !!permisos?.escribir;
  } catch (e) {
    if (e instanceof StravaReconectar && e.motivo === "falta_migracion") strava = "falta_migracion";
  }
  const tz = await zonaHoraria(ajustes);
  const equipoTrabajo = await esEquipoTrabajo();

  // Estado de Mis tareas: una llamada real (con la caché de 60 s). En el PC de Appliant solo se pide Trabajo.
  const mt = await pedirResumen(hoyEn(tz), equipoTrabajo ? "trabajo" : undefined).catch(() => null);
  let ultimoOk = misTareasUltimoOk;
  if (mt?.ok) {
    await registrarOkMisTareas(supabase, user.id, misTareasUltimoOk, mt.obtenido);
    ultimoOk = Math.max(ultimoOk ?? 0, mt.obtenido);
  }

  let calendarios: CalendarioInfo[] = [];
  let conectado = false;
  let aviso: string | null = null;
  try {
    const token = await accessToken(supabase, user.id);
    calendarios = await listarCalendarios(token);
    conectado = true;
  } catch (e) {
    if (e instanceof GoogleReconectar) aviso = e.motivo === "revocado" ? "Google cerró el permiso. Reconecta." : null;
    else if (e instanceof FaltaMigracion) aviso = ERRORES.migracion;
    else aviso = "No se ha podido leer la lista de calendarios de Google.";
  }
  const activos = new Set(calendariosActivos(calendarios, ajustes).map((c) => c.id));

  let mensaje: DatosAjustes["aviso"] = null;
  if (error) mensaje = { tipo: "error", texto: ERRORES[error] ?? "Ha ocurrido un error." };
  else if (ok === "resumen") {
    const n = /^\d{1,2}$/.test(sp.n ?? "") ? Number(sp.n) : 0;
    mensaje = {
      tipo: "ok",
      texto: `Resumen preparado y enviado a ${n} ${n === 1 ? "dispositivo" : "dispositivos"}. ${
        sp.audio === "1" ? "El audio estará en el feed en unos minutos." : "Sin audio: falta GITHUB_DISPATCH_TOKEN."
      }`,
    };
  } else if (ok && OKS[ok]) mensaje = { tipo: "ok", texto: OKS[ok] };

  const datos: DatosAjustes = {
    aviso: mensaje,
    tz,
    ajustes,
    equipoTrabajo,
    google: { conectado, conDrive, aviso },
    calendarios: calendarios
      .filter((c) => !esCalendarioMisTareas(c.nombre))
      .map((c) => ({ id: c.id, nombre: c.nombre, color: c.color, activo: activos.has(c.id), otraVia: excluidoPorDefecto(c.nombre) })),
    excel: excel ? { nombre: excel.nombre } : null,
    pickerConfigurado: !!pickerConfig(),
    huella: {
      faltaMigracion: faltaMigracionHuella,
      dispositivos: credenciales.map((c) => ({ id: c.id, nombre: c.nombre, usado: c.usado })),
      puedeRegistrar: loginReciente(user),
      minutos: LOGIN_RECIENTE / 60000,
    },
    strava: { configurado: !!stravaConfig(), estado: strava, escribir: stravaEscribir },
    resumen: {
      conClave,
      tick,
      tickReciente: tick !== null && ahoraMs() - tick < 2 * 3600_000,
      cronSecret: !!cronSecret(),
      github: !!githubDispatch(),
      feedUrl: tokenDelFeed ? `${origen}/api/feed/${tokenDelFeed}` : null,
    },
    agentes: { carpeta: CARPETA_AGENTES, creados: agentes ? Object.keys(agentes.ficheros).length : null, total: AGENTES.length },
    misTareas: {
      ok: !!mt?.ok,
      mensaje: mt?.ok ? "" : mt ? MENSAJES_FALLO[mt.fallo] : MENSAJES_FALLO.respuesta,
      ultimoOk,
      url: urlMisTareas(),
    },
  };

  return (
    <AjustesVista
      d={datos}
      a={{ guardar, guardarEquipo, elegirExcel, crearAgentes, prepararResumen, nuevoFeed, botonEmergencia, borrarHuella }}
    />
  );
}
