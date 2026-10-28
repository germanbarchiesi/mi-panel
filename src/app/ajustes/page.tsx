import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/env";
import { cargarAjustes, cargarAjustesYEstado, guardarAjustes, normalizarAjustes, registrarOkMisTareas } from "@/lib/ajustes";
import { accessToken, FaltaMigracion, GoogleReconectar } from "@/lib/google";
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

  const { ajustes, misTareasUltimoOk } = await cargarAjustesYEstado(supabase, user.id);
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
        <Link className="btn" href="/">
          Volver
        </Link>
      </div>

      {ok === "guardado" && <p role="status">Ajustes guardados.</p>}
      {ok === "desconectado" && <p role="status">Google Calendar desconectado.</p>}
      {ok === "equipo" && <p role="status">Equipo actualizado.</p>}
      {error && (
        <p className="error" role="alert">
          {ERRORES[error] ?? "Ha ocurrido un error."}
        </p>
      )}

      <div className="card">
        <h2>Google Calendar</h2>
        <p className="muted">
          {conectado ? "Conectado (solo lectura)." : (aviso ?? "No conectado.")}
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
