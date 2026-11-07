import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, idPropietario } from "@/lib/admin";
import { cargarAjustesYEstado } from "@/lib/ajustes";
import { TZ_BARCELONA, esZonaValida, formatHora, ymdInTz } from "@/lib/agenda";
import { cargarAgenda } from "@/lib/agenda-loader";
import { cargarAgentes } from "@/lib/agentes-loader";
import { cifrar, descifrar } from "@/lib/cripto";
import { cargarDeporte } from "@/lib/deporte-loader";
import { githubDispatch } from "@/lib/env";
import { MESES } from "@/lib/finanzas";
import { cargarFinanzas } from "@/lib/finanzas-loader";
import { leerFotos } from "@/lib/fotos-cartera";
import { pedirResumen } from "@/lib/mis-tareas-api";
import { notificar } from "@/lib/push";
import { componerResumen, decidir, hace, type DatosResumen } from "@/lib/resumen";

// Resumen de las 7:00: lo prepara (6:30) y lo notifica (7:00) en la zona del usuario.
// Lo llama Supabase Cron cada 30 min (/api/resumen/tick). El texto se guarda cifrado; el audio lo
// genera GitHub Actions con Piper y lo devuelve por un enlace de un solo uso.

const AAD = (userId: string, fecha: string) => `${userId}|resumen|${fecha}`;
const TOKEN_MIN = 45;
export const DIAS_FEED = 7;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function igualesHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Zona del resumen: Barcelona o, con «Usar la hora de donde estoy», la última que vio la app. */
export function zonaResumen(horaLocal: boolean, tzConocida: string | null): string {
  return horaLocal && tzConocida && esZonaValida(tzConocida) ? tzConocida : TZ_BARCELONA;
}

type Fila = {
  id: string;
  fecha: string;
  estado: "preparando" | "listo" | "error";
  notificado: string | null;
  creado: string;
};

async function fila(db: SupabaseClient, userId: string, fecha: string): Promise<Fila | null> {
  const { data } = await db
    .from("resumenes")
    .select("id,fecha,estado,notificado,creado")
    .eq("user_id", userId)
    .eq("fecha", fecha)
    .maybeSingle();
  return (data as Fila) ?? null;
}

/** Reúne los datos de cada módulo. Si uno falla, el resumen sigue sin él. */
export async function reunirDatos(db: SupabaseClient, userId: string, tz: string, ahora: number): Promise<DatosResumen> {
  const estado = await cargarAjustesYEstado(db, userId);
  const hoy = ymdInTz(ahora, tz);
  const hoyBcn = ymdInTz(ahora, TZ_BARCELONA);

  const [agenda, tareas, fin, deporte, agentes, fotos] = await Promise.all([
    cargarAgenda(db, userId, estado.ajustes, tz).catch(() => null),
    pedirResumen(hoy).catch(() => null),
    cargarFinanzas(db, userId, estado.excel, hoyBcn).catch(() => null),
    cargarDeporte(db, userId, tz, hoy).catch(() => null),
    cargarAgentes(db, userId, estado.agentes, { privadas: false }).catch(() => null),
    leerFotos(db, userId).catch(() => []),
  ]);

  const d: DatosResumen = {
    fecha: hoy,
    agenda: null,
    tareas: null,
    vencimientos: null,
    finanzas: null,
    deporte: null,
    cartera: null,
    agentes: [],
  };

  if (agenda?.estado === "ok") {
    const dia = agenda.dias[0];
    const hueco = dia.huecos.find((h) => h.fin > ahora);
    d.agenda = {
      eventos: [
        ...dia.todoElDia.map((e) => ({ titulo: e.titulo, hora: null })),
        ...dia.eventos.map((e) => ({ titulo: e.titulo, hora: formatHora(Math.max(e.inicio as number, dia.ini), tz) })),
      ],
      primerHueco: hueco ? { ini: formatHora(Math.max(hueco.ini, ahora), tz), fin: formatHora(hueco.fin, tz) } : null,
    };
  }

  if (tareas) {
    d.tareas = tareas.ok
      ? {
          ok: true,
          hoy: tareas.datos.hoy.map((t) => ({ titulo: t.titulo, hora: t.hora, prioridad: t.prioridad, ambito: t.ambito })),
          arrastradas: tareas.datos.arrastradas.length,
          reunion: tareas.datos.temas.filter((t) => t.reunionHoy).map((t) => t.persona),
        }
      : { ok: false };
  }

  if (fin?.estado === "ok") {
    const p = fin.vencimientos.proximos;
    d.vencimientos = { semana: p.filter((v) => v.pronto).map((v) => ({ concepto: v.concepto, dias: v.dias })), mes: p.length };
    d.finanzas = {
      ritmo: fin.resumen.ritmo?.estado ?? null,
      pendientes: fin.resumen.actual.pendientes.n,
      mes: MESES[fin.resumen.mes - 1].toLowerCase(),
    };
    const inv = fin.inversiones;
    const previa = [...fotos].filter((f) => f.fecha < hoyBcn).sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
    if (inv?.hayPosiciones && previa && previa.valor > 0) {
      // Variación sin contar lo aportado entre medias.
      d.cartera = { variacion: (inv.valor - previa.valor - (inv.aportado - previa.aportado)) / previa.valor };
    }
  }

  if (deporte) {
    const dia = deporte.semana.dias.find((x) => x.esHoy);
    d.deporte = dia ? dia.plan.map((p) => ({ titulo: p.titulo, hora: p.hora })) : [];
  }

  if (agentes?.estado === "ok") {
    d.agentes = agentes.tarjetas
      .filter(
        (t) =>
          t.resultado &&
          (t.resultado.estado === "alerta" || t.resultado.estado === "novedad") &&
          ahora - t.resultado.ejecutado < 36 * 3600_000,
      )
      .map((t) => t.nombre);
  }
  return d;
}

async function lanzarAudio(id: string, token: string): Promise<boolean> {
  const gh = githubDispatch();
  if (!gh) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${gh.repo}/actions/workflows/resumen-audio.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gh.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { id, token } }),
      signal: AbortSignal.timeout(10000),
    });
    return res.status === 204;
  } catch {
    return false;
  }
}

/** Prepara el resumen de una fecha (reclama la fila para que dos llamadas no lo hagan a la vez). */
async function preparar(db: SupabaseClient, userId: string, tz: string, fecha: string, ahora: number, forzar = false) {
  let f = await fila(db, userId, fecha);
  const atascado = f?.estado === "preparando" && ahora - Date.parse(f.creado) > 10 * 60_000;
  if (f && (forzar || f.estado === "error" || atascado)) {
    await db.from("resumenes").delete().eq("id", f.id).eq("user_id", userId);
    f = null;
  }
  if (f) return { preparado: f.estado === "listo", audio: false };

  const { data: nueva, error } = await db
    .from("resumenes")
    .insert({ user_id: userId, fecha, tz, estado: "preparando" })
    .select("id")
    .single();
  if (error || !nueva) return { preparado: false, audio: false }; // otra llamada lo está haciendo

  try {
    const texto = componerResumen(await reunirDatos(db, userId, tz, ahora));
    const token = randomBytes(32).toString("base64url");
    await db
      .from("resumenes")
      .update({
        estado: "listo",
        texto_cifrado: cifrar(texto, AAD(userId, fecha)),
        token_hash: sha256(token),
        token_caduca: new Date(ahora + TOKEN_MIN * 60_000).toISOString(),
        texto_descargado: false,
      })
      .eq("id", nueva.id);
    const audio = await lanzarAudio(nueva.id, token);
    return { preparado: true, audio };
  } catch {
    await db.from("resumenes").update({ estado: "error" }).eq("id", nueva.id);
    return { preparado: false, audio: false };
  }
}

async function notificarFecha(db: SupabaseClient, userId: string, fecha: string) {
  const f = await fila(db, userId, fecha);
  if (!f || f.estado !== "listo" || f.notificado) return 0;
  // Se marca antes de enviar: mejor perder una notificación que mandarla dos veces.
  await db.from("resumenes").update({ notificado: new Date().toISOString() }).eq("id", f.id);
  return notificar(userId);
}

/** Borra los resúmenes y audios de más de 7 días. */
async function limpiar(db: SupabaseClient, userId: string, hoy: string) {
  const limite = hace(hoy, DIAS_FEED);
  const { data } = await db.from("resumenes").select("id,audio_path").eq("user_id", userId).lt("fecha", limite);
  const rutas = (data ?? []).map((r) => r.audio_path).filter((x): x is string => !!x);
  if (rutas.length) await db.storage.from("audios").remove(rutas);
  if (data?.length) await db.from("resumenes").delete().eq("user_id", userId).lt("fecha", limite);
}

export type ResultadoTick = { accion: string; fecha: string; tz: string; audio?: boolean; notificados?: number };

/** Llamada de Supabase Cron. */
export async function tick(ahora = Date.now()): Promise<ResultadoTick> {
  const db = admin();
  const userId = await idPropietario();
  if (!userId) return { accion: "sin_usuario", fecha: "", tz: "" };
  const estado = await cargarAjustesYEstado(db, userId);
  const tz = zonaResumen(estado.ajustes.horaLocal, estado.tzConocida);
  await db
    .from("claves_app")
    .upsert({ nombre: "ultimo_tick", valor_cifrado: cifrar(new Date(ahora).toISOString(), "app|tick") });

  const hoy = ymdInTz(ahora, tz);
  const f = await fila(db, userId, hoy);
  const { accion, fecha } = decidir(ahora, tz, f ? { preparado: f.estado === "listo", notificado: !!f.notificado } : null);
  const r: ResultadoTick = { accion, fecha, tz };
  if (accion === "preparar" || accion === "preparar_y_notificar") r.audio = (await preparar(db, userId, tz, fecha, ahora)).audio;
  if (accion === "notificar" || accion === "preparar_y_notificar") r.notificados = await notificarFecha(db, userId, fecha);
  if (accion === "nada") await limpiar(db, userId, hoy).catch(() => undefined);
  return r;
}

/** Botón «Preparar ahora» de Ajustes: rehace el de hoy y lo notifica, a cualquier hora. */
export async function prepararAhora(userId: string, tz: string, ahora = Date.now()) {
  const db = admin();
  const fecha = ymdInTz(ahora, tz);
  const p = await preparar(db, userId, tz, fecha, ahora, true);
  const notificados = p.preparado ? await notificarFecha(db, userId, fecha) : 0;
  return { ...p, notificados };
}

/** Último resumen listo (para el inicio y Ajustes). */
export async function resumenDeHoy(userId: string, tz: string, ahora = Date.now()) {
  const db = admin();
  const fecha = ymdInTz(ahora, tz);
  const { data } = await db
    .from("resumenes")
    .select("fecha,estado,texto_cifrado,audio_path,notificado")
    .eq("user_id", userId)
    .eq("fecha", fecha)
    .maybeSingle();
  if (!data || data.estado !== "listo" || !data.texto_cifrado) return null;
  return {
    fecha: data.fecha as string,
    texto: descifrar(data.texto_cifrado, AAD(userId, data.fecha)),
    audio: !!data.audio_path,
    notificado: data.notificado as string | null,
  };
}

export async function ultimoTick(): Promise<number | null> {
  const { data } = await admin().from("claves_app").select("valor_cifrado").eq("nombre", "ultimo_tick").maybeSingle();
  if (!data) return null;
  try {
    return Date.parse(descifrar(data.valor_cifrado, "app|tick"));
  } catch {
    return null;
  }
}

// --- Enlace de un solo uso para GitHub Actions ---------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

type FilaToken = {
  id: string;
  user_id: string;
  fecha: string;
  token_hash: string | null;
  token_caduca: string | null;
  texto_cifrado: string | null;
  texto_descargado: boolean;
  audio_path: string | null;
};

async function porToken(id: string, token: string): Promise<FilaToken | null> {
  if (!UUID.test(id) || !TOKEN.test(token)) return null;
  const userId = await idPropietario();
  if (!userId) return null;
  const { data } = await admin()
    .from("resumenes")
    .select("id,user_id,fecha,token_hash,token_caduca,texto_cifrado,texto_descargado,audio_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  const f = data as FilaToken | null;
  if (!f?.token_hash || !f.token_caduca || Date.parse(f.token_caduca) < Date.now()) return null;
  return igualesHex(sha256(token), f.token_hash) ? f : null;
}

/** El texto se entrega una sola vez. */
export async function entregarTexto(id: string, token: string): Promise<string | null> {
  const f = await porToken(id, token);
  if (!f || f.texto_descargado || !f.texto_cifrado) return null;
  const { data } = await admin()
    .from("resumenes")
    .update({ texto_descargado: true })
    .eq("id", f.id)
    .eq("texto_descargado", false)
    .select("id");
  if (!data?.length) return null; // otra petición se adelantó
  return descifrar(f.texto_cifrado, AAD(f.user_id, f.fecha));
}

export const MAX_AUDIO = 4 * 1024 * 1024;

export function esMp3(b: Uint8Array): boolean {
  return b.length > 1000 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
}

/** Recibe el MP3 (después de haber entregado el texto) y anula el enlace. */
export async function guardarAudio(id: string, token: string, mp3: Uint8Array): Promise<boolean> {
  const f = await porToken(id, token);
  if (!f || !f.texto_descargado || f.audio_path || mp3.length > MAX_AUDIO || !esMp3(mp3)) return false;
  const db = admin();
  const ruta = `${f.user_id}/${f.fecha}.mp3`;
  const { error } = await db.storage.from("audios").upload(ruta, mp3, { contentType: "audio/mpeg", upsert: true });
  if (error) return false;
  await db.from("resumenes").update({ audio_path: ruta, token_hash: null, token_caduca: null }).eq("id", f.id);
  return true;
}
