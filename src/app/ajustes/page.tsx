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
  normalizarAjustes,
  registrarOkMisTareas,
} from "@/lib/ajustes";
import { accessToken, FaltaMigracion, GoogleReconectar, SCOPE_DRIVE_FILE, scopesConcedidos, tieneScope } from "@/lib/google";
import { MIMES_EXCEL, esIdDrive, metadatos } from "@/lib/drive";
import {
  FaltaMigracionBiometria,
  LOGIN_RECIENTE,
  listarCredenciales,
  loginReciente,
  type Credencial,
} from "@/lib/biometria";
import { pickerConfig } from "@/lib/env";
import { ElegirExcel } from "@/components/elegir-excel";
import { BotonRegistrar } from "@/components/biometria";
import { listarCalendarios, excluidoPorDefecto, type CalendarioInfo } from "@/lib/calendar";
import { calendariosActivos, hoyEn, zonaHoraria } from "@/lib/agenda-loader";
import { formatHora } from "@/lib/agenda";
import { esCalendarioMisTareas } from "@/lib/calendar";
import { MENSAJES_FALLO } from "@/lib/mis-tareas";
import { pedirResumen, urlMisTareas } from "@/lib/mis-tareas-api";
import { esEquipoTrabajo, marcarEquipoTrabajo } from "@/lib/equipo";
import { TzSync } from "@/components/tz-sync";

export const metadata: Metadata = { title: "Ajustes" };

const ERRORES: Record<string, string> = {
  denegado: "Cancelaste el permiso en Google. No se ha conectado nada.",
  estado: "La conexión caducó o no coincide. Inténtalo de nuevo.",
  canje: "Google no aceptó la conexión. Revisa GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en Vercel y la URI de redirección en Google Cloud.",
  sin_refresh: "Google no entregó el permiso permanente. Inténtalo de nuevo.",
  sin_permiso: "Falta el permiso de lectura de Calendar. Márcalo en la pantalla de Google y vuelve a conectar.",
  migracion: "Falta ejecutar la migración 0002 en Supabase (SQL Editor).",
  excel: "Ese fichero no es un Excel (.xlsm o .xlsx) o no se puede leer.",
  guardar: "No se pudo guardar la conexión.",
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

function fechaHora(ms: number, tz: string): string {
  const dia = new Intl.DateTimeFormat("es-ES", { timeZone: tz, day: "numeric", month: "short" }).format(new Date(ms));
  return `${dia}, ${formatHora(ms, tz)}`;
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

export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { ajustes, misTareasUltimoOk, excel } = await cargarAjustesYEstado(supabase, user.id);
  const conDrive = tieneScope(await scopesConcedidos(supabase, user.id), SCOPE_DRIVE_FILE);
  let credenciales: Credencial[] = [];
  let faltaMigracionHuella = false;
  try {
    credenciales = await listarCredenciales(supabase, user.id);
  } catch (e) {
    faltaMigracionHuella = e instanceof FaltaMigracionBiometria;
  }
  const puedeRegistrar = loginReciente(user);
  const tz = await zonaHoraria(ajustes);
  const equipoTrabajo = await esEquipoTrabajo();

  // Estado de Mis tareas: una llamada real (con la caché de 60 s). En el PC de Appliant solo se pide Trabajo.
  const mt = await pedirResumen(hoyEn(tz), equipoTrabajo ? "trabajo" : undefined).catch(() => null);
  let ultimoOk = misTareasUltimoOk;
  if (mt?.ok) {
    await registrarOkMisTareas(supabase, user.id, misTareasUltimoOk, mt.obtenido);
    ultimoOk = Math.max(ultimoOk ?? 0, mt.obtenido);
  }
  const appMisTareas = urlMisTareas();

  let calendarios: CalendarioInfo[] = [];
  let conectado = false;
  let aviso: string | null = null;
  try {
    const token = await accessToken(supabase, user.id);
    calendarios = await listarCalendarios(token);
    conectado = true;
  } catch (e) {
    if (e instanceof GoogleReconectar) aviso = e.motivo === "revocado" ? "El permiso de Google se cerró. Reconecta." : null;
    else if (e instanceof FaltaMigracion) aviso = ERRORES.migracion;
    else aviso = "No se pudo leer la lista de calendarios de Google.";
  }

  const activos = new Set(calendariosActivos(calendarios, ajustes).map((c) => c.id));

  return (
    <main>
      {ajustes.horaLocal && <TzSync />}
      <div className="row">
        <h1>Ajustes</h1>
        {/* Carga completa al volver: así el inicio no hereda la CSP del selector de Google. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn" href="/">
          Volver
        </a>
      </div>

      {ok === "guardado" && <p role="status">Ajustes guardados.</p>}
      {ok === "desconectado" && <p role="status">Google Calendar desconectado.</p>}
      {ok === "equipo" && <p role="status">Equipo actualizado.</p>}
      {ok === "excel" && <p role="status">Excel elegido.</p>}
      {ok === "huella_borrada" && <p role="status">Dispositivo eliminado.</p>}
      {error && (
        <p className="error" role="alert">
          {ERRORES[error] ?? "Ha ocurrido un error."}
        </p>
      )}

      <div className="card">
        <h2>Google (Calendar y Drive)</h2>
        <p className="muted">
          {conectado
            ? `Calendar conectado (solo lectura). Drive: ${conDrive ? "solo el Excel que elijas" : "sin permiso; pulsa Reconectar"}.`
            : (aviso ?? "No conectado.")}
        </p>
        <div className="acciones">
          <a className="btn btn-primary" href="/auth/google/conectar">
            {conectado ? "Reconectar" : "Conectar Google Calendar"}
          </a>
          {conectado && (
            <form action="/auth/google/desconectar" method="post">
              <button className="btn" type="submit">
                Desconectar
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="card" id="finanzas">
        <h2>Finanzas · Excel de cuentas</h2>
        {!conDrive ? (
          <>
            <p className="muted">
              Falta el permiso de Drive. Mi Panel solo podrá leer el fichero que elijas, nunca el resto de tu Drive.
            </p>
            <a className="btn btn-primary" href="/auth/google/conectar">
              Reconectar Google
            </a>
          </>
        ) : !pickerConfig() ? (
          <p className="error">Falta configurar GOOGLE_PICKER_API_KEY y GOOGLE_PROJECT_NUMBER en Vercel.</p>
        ) : (
          <>
            <p className="muted">
              {excel ? <>Leyendo: <strong>{excel.nombre}</strong>.</> : "Aún no has elegido el Excel."} Se lee al abrir
              el panel y no se guarda ningún movimiento.
            </p>
            <ElegirExcel guardar={elegirExcel} texto={excel ? "Cambiar Excel" : "Elegir Excel en Drive"} />
          </>
        )}
      </div>

      <div className="card" id="huella">
        <h2>Huella / Windows Hello</h2>
        {faltaMigracionHuella ? (
          <p className="error">Falta ejecutar la migración 0003 en Supabase (SQL Editor).</p>
        ) : (
          <>
            <p className="muted small">
              Finanzas se abre con la huella o Windows Hello de un dispositivo registrado y se bloquea a los 5 minutos.
              Solo se guarda la clave pública: la huella no sale del dispositivo.
            </p>
            {credenciales.length > 0 && (
              <ul className="evs">
                {credenciales.map((c) => (
                  <li className="ev" key={c.id}>
                    <span className="ev-titulo">
                      {c.nombre}
                      <span className="muted small">
                        {" "}
                        · {c.usado ? `usado ${new Date(c.usado).toLocaleDateString("es-ES", { timeZone: tz })}` : "sin usar"}
                      </span>
                    </span>
                    <form action={borrarHuella} className="derecha">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn" type="submit">
                        Quitar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {puedeRegistrar ? (
              <BotonRegistrar nombrePorDefecto={credenciales.length ? "Otro dispositivo" : "Este dispositivo"} />
            ) : (
              <>
                <p className="small">
                  Para añadir un dispositivo, sal y vuelve a entrar con Google: tendrás {LOGIN_RECIENTE / 60000} minutos.
                  Así una sesión robada no basta para registrar otra huella.
                </p>
                <form action="/auth/signout" method="post">
                  <button className="btn" type="submit">
                    Salir para volver a entrar
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Mis tareas</h2>
        <p className={mt?.ok ? "muted" : "error"}>
          {mt?.ok ? "Conectada (solo lectura)." : mt ? MENSAJES_FALLO[mt.fallo] : MENSAJES_FALLO.respuesta}
        </p>
        <p className="muted small">
          Última respuesta correcta: {ultimoOk ? fechaHora(ultimoOk, tz) : "ninguna todavía"}.
          {" "}La clave solo está en Vercel; Mi Panel no guarda tus tareas.
        </p>
        {appMisTareas && (
          <a className="btn" href={appMisTareas} target="_blank" rel="noopener noreferrer">
            Abrir Mis tareas
          </a>
        )}
      </div>

      <form action={guardarEquipo} className="card">
        <h2>Este equipo</h2>
        <label className="check">
          <input type="checkbox" name="equipo_trabajo" defaultChecked={equipoTrabajo} />
          Es el PC de Appliant
        </label>
        <p className="muted small">
          Solo afecta a este dispositivo: Actividades abre en Trabajo y solo pide ese ámbito. El modo trabajo completo
          llega en la fase 10.
        </p>
        <button className="btn" type="submit">
          Guardar equipo
        </button>
      </form>

      <form action={guardar}>
        {conectado && (
          <div className="card">
            <h2>Calendarios a mostrar</h2>
            <input type="hidden" name="cal_lista" value="1" />
            {calendarios.filter((c) => !esCalendarioMisTareas(c.nombre)).map((c) => (
              <label className="check" key={c.id}>
                <input type="checkbox" name="cal" value={c.id} defaultChecked={activos.has(c.id)} />
                <span className="dot" style={{ background: c.color ?? "var(--muted)" }} aria-hidden="true" />
                {c.nombre}
                {excluidoPorDefecto(c.nombre) && <span className="muted small"> · se lee por otra vía</span>}
              </label>
            ))}
            <p className="muted small">
              «Mis tareas» no se lee nunca: sus tareas con hora llegan por su API. «Deporte» no se muestra por defecto.
            </p>
          </div>
        )}

        <div className="card">
          <h2>Huecos libres</h2>
          <p className="muted small">Se buscan solo dentro de estas franjas.</p>
          <div className="campos">
            <label>
              Lun–Vie desde
              <input type="time" name="lv_ini" defaultValue={ajustes.lv.ini} required />
            </label>
            <label>
              hasta
              <input type="time" name="lv_fin" defaultValue={ajustes.lv.fin} required />
            </label>
            <label>
              Sáb–Dom desde
              <input type="time" name="fs_ini" defaultValue={ajustes.fs.ini} required />
            </label>
            <label>
              hasta
              <input type="time" name="fs_fin" defaultValue={ajustes.fs.fin} required />
            </label>
            <label>
              Duración mínima (min)
              <input type="number" name="min_hueco" min={15} max={240} step={5} defaultValue={ajustes.minHueco} required />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="varios_dias" defaultChecked={ajustes.variosDiasComoContexto} />
            Eventos de varios días como contexto
          </label>
          <p className="muted small">
            Los eventos con hora de 24 h o más (p. ej. un recordatorio que dura una semana) se muestran arriba con la
            etiqueta «varios días» y no quitan huecos ni cuentan como solape.
          </p>
        </div>

        <div className="card">
          <h2>Zona horaria</h2>
          <label className="check">
            <input type="checkbox" name="hora_local" defaultChecked={ajustes.horaLocal} />
            Usar la hora de donde estoy
          </label>
          <p className="muted small">
            Ahora: {tz}. Desactivado, todo va con la hora de Barcelona. Con ella activada, la agenda se muestra con la
            hora del dispositivo.
          </p>
        </div>

        <button className="btn btn-primary" type="submit">
          Guardar ajustes
        </button>
      </form>
    </main>
  );
}
