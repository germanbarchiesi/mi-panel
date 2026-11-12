import type { Ajustes } from "@/lib/agenda";
import { formatHora } from "@/lib/agenda";
import { Cabecera } from "@/components/cabecera";
import { ElegirExcel } from "@/components/elegir-excel";
import { BotonRegistrar } from "@/components/biometria";
import { Copiar, Notificaciones } from "@/components/resumen";
import { TzSync } from "@/components/tz-sync";
import { Icono } from "@/components/iconos";

// Página de Ajustes: solo pinta. La página real (app/ajustes/page.tsx) carga los datos y le pasa las
// acciones de servidor; la demostración le pasa datos inventados.

type Accion = (formData: FormData) => Promise<void>;

export type DatosAjustes = {
  aviso: { tipo: "ok" | "error"; texto: string } | null;
  tz: string;
  ajustes: Ajustes;
  equipoTrabajo: boolean;
  google: { conectado: boolean; conDrive: boolean; aviso: string | null };
  calendarios: { id: string; nombre: string; color?: string; activo: boolean; otraVia: boolean }[];
  excel: { nombre: string } | null;
  pickerConfigurado: boolean;
  huella: {
    faltaMigracion: boolean;
    dispositivos: { id: string; nombre: string; usado: string | null }[];
    puedeRegistrar: boolean;
    minutos: number;
  };
  /** `escribir`: Strava dio permiso para crear actividades (apuntar entrenos a mano). */
  strava: { configurado: boolean; estado: "conectado" | "sin_conectar" | "falta_migracion"; escribir: boolean };
  resumen: {
    conClave: boolean;
    tick: number | null;
    /** La última llamada es de hace menos de 2 horas (el cron llama cuatro veces por hora). */
    tickReciente: boolean;
    cronSecret: boolean;
    github: boolean;
    feedUrl: string | null;
  };
  agentes: { carpeta: string; creados: number | null; total: number };
  misTareas: { ok: boolean; mensaje: string; ultimoOk: number | null; url: string | null };
};

export type AccionesAjustes = {
  guardar: Accion;
  guardarEquipo: Accion;
  elegirExcel: (id: string) => Promise<void>;
  crearAgentes: () => Promise<void>;
  prepararResumen: () => Promise<void>;
  nuevoFeed: () => Promise<void>;
  botonEmergencia: Accion;
  borrarHuella: Accion;
};

function fechaHora(ms: number, tz: string): string {
  const dia = new Intl.DateTimeFormat("es-ES", { timeZone: tz, day: "numeric", month: "short" }).format(new Date(ms)).replace(/\./g, "");
  return `${dia}, ${formatHora(ms, tz)}`;
}

function Conexion({ ok, mal = false, children }: { ok: boolean; mal?: boolean; children: React.ReactNode }) {
  return <p className={`estado-conexion${ok ? " ok" : mal ? " mal" : ""}`}>{children}</p>;
}

const INDICE = [
  ["conexiones", "Conexiones"],
  ["resumen", "Resumen de las 7:00"],
  ["finanzas", "Finanzas y huella"],
  ["agenda", "Agenda"],
  ["agentes", "Agentes"],
  ["equipo", "Este equipo"],
  ["emergencia", "Emergencia"],
] as const;

export function AjustesVista({ d, a }: { d: DatosAjustes; a: AccionesAjustes }) {
  const { ajustes } = d;
  return (
    <main className="pagina">
      {ajustes.horaLocal && <TzSync />}
      <Cabecera actual="ajustes" />
      <div className="titulo-pagina">
        <h1>Ajustes</h1>
        <p>Conexiones, el resumen de las 7:00 y cómo se calcula tu agenda. Todo se guarda solo para tu cuenta.</p>
      </div>

      {d.aviso && (
        <p className={d.aviso.tipo === "ok" ? "mensaje" : "mensaje mensaje-error"} role={d.aviso.tipo === "ok" ? "status" : "alert"}>
          <Icono nombre={d.aviso.tipo === "ok" ? "check" : "alerta"} tam={20} />
          <span>{d.aviso.texto}</span>
        </p>
      )}

      <div className="ajustes">
        <nav aria-label="Secciones de Ajustes">
          <ul className="indice">
            {INDICE.map(([id, texto]) => (
              <li key={id}>
                <a href={`#${id}`}>{texto}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="secciones">
          {/* --- Conexiones --- */}
          <section className="seccion" id="conexiones" aria-labelledby="t-conexiones">
            <h2 id="t-conexiones">Conexiones</h2>

            <div className="modulo" id="google">
              <h3>Google: Calendar y Drive</h3>
              <Conexion ok={d.google.conectado} mal={!!d.google.aviso}>
                {d.google.conectado ? "Calendar conectado, solo lectura" : (d.google.aviso ?? "No conectado")}
              </Conexion>
              {d.google.conectado && (
                <p className="nota">
                  Drive: {d.google.conDrive ? "solo el Excel que elijas y los ficheros de los agentes." : "sin permiso. Pulsa «Reconectar»."}
                </p>
              )}
              <div className="acciones">
                <a className="boton boton-primario" href="/auth/google/conectar">
                  {d.google.conectado ? "Reconectar" : "Conectar Google"}
                </a>
                {d.google.conectado && (
                  <form action="/auth/google/desconectar" method="post">
                    <button className="boton" type="submit">
                      Desconectar
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="modulo" id="deporte">
              <h3>Strava</h3>
              {!d.strava.configurado ? (
                <p className="error">Falta configurar STRAVA_CLIENT_ID y STRAVA_CLIENT_SECRET en Vercel.</p>
              ) : d.strava.estado === "falta_migracion" ? (
                <p className="error">Falta ejecutar la migración 0005 en Supabase (SQL Editor).</p>
              ) : (
                <>
                  <Conexion ok={d.strava.estado === "conectado"}>
                    {d.strava.estado !== "conectado"
                      ? "No conectado"
                      : d.strava.escribir
                        ? "Conectado: lee tus actividades y sube los entrenos que apuntes a mano"
                        : "Conectado, solo lectura de actividades"}
                  </Conexion>
                  {d.strava.estado === "conectado" && !d.strava.escribir && (
                    <p className="nota">
                      Para apuntar entrenos a mano desde el panel, pulsa «Reconectar» y deja marcado «subir actividades» en Strava.
                    </p>
                  )}
                  <div className="acciones">
                    <a className={d.strava.estado === "conectado" ? "boton" : "boton boton-primario"} href="/auth/strava/conectar">
                      {d.strava.estado === "conectado" ? "Reconectar" : "Conectar Strava"}
                    </a>
                    {d.strava.estado === "conectado" && (
                      <form action="/auth/strava/desconectar" method="post">
                        <button className="boton" type="submit">
                          Desconectar
                        </button>
                      </form>
                    )}
                  </div>
                </>
              )}
              <p className="modulo-pie">
                Lo planificado sale del calendario de Google «Deporte». Natación cuenta como natación; fuerza y CrossFit, juntos. Las
                actividades no se guardan en Mi Panel: las que apuntas a mano se crean en Strava, y desde Strava se editan o borran.
              </p>
            </div>

            <div className="modulo">
              <h3>Mis tareas</h3>
              <Conexion ok={d.misTareas.ok} mal={!d.misTareas.ok}>
                {d.misTareas.ok ? "Conectada, solo lectura" : d.misTareas.mensaje}
              </Conexion>
              <p className="nota">
                Última respuesta correcta: {d.misTareas.ultimoOk ? fechaHora(d.misTareas.ultimoOk, d.tz) : "ninguna todavía"}. La clave
                solo está en Vercel; Mi Panel no guarda tus tareas.
              </p>
              {d.misTareas.url && (
                <a className="enlace" href={d.misTareas.url} target="_blank" rel="noopener noreferrer">
                  Abrir Mis tareas
                  <Icono nombre="externo" tam={16} titulo="(se abre en otra pestaña)" />
                </a>
              )}
            </div>
          </section>

          {/* --- Resumen --- */}
          <section className="seccion" id="resumen" aria-labelledby="t-resumen">
            <h2 id="t-resumen">Resumen de las 7:00</h2>
            <p className="seccion-intro">
              De lunes a viernes se prepara a las 6:30, sin importes, y a las 7:00 llega el aviso «Tu resumen está listo».
            </p>
            {!d.resumen.conClave ? (
              <div className="modulo">
                <p className="error">Falta configurar SUPABASE_SECRET_KEY en Vercel.</p>
              </div>
            ) : (
              <>
                <div className="modulo">
                  <h3>Programación</h3>
                  <Conexion ok={d.resumen.tickReciente && d.resumen.cronSecret} mal={!d.resumen.tickReciente || !d.resumen.cronSecret}>
                    {d.resumen.tick
                      ? `Supabase Cron llamó por última vez el ${fechaHora(d.resumen.tick, d.tz)}`
                      : "Supabase Cron todavía no ha llamado"}
                  </Conexion>
                  {!d.resumen.tick && <p className="nota">Falta la migración 0007 o CRON_SECRET en Vercel.</p>}
                  {d.resumen.tick && !d.resumen.tickReciente && (
                    <p className="nota">
                      Debería llamar cuatro veces por hora. Revisa en Supabase el trabajo «mi-panel-resumen» y sus respuestas
                      (net._http_response).
                    </p>
                  )}
                  {!d.resumen.cronSecret && <p className="error">Falta CRON_SECRET en Vercel.</p>}
                  {!d.resumen.github && <p className="nota">Sin audio para el coche: falta GITHUB_DISPATCH_TOKEN.</p>}
                  <form action={a.prepararResumen}>
                    <button className="boton" type="submit">
                      Preparar y enviar el resumen ahora
                    </button>
                  </form>
                  <p className="modulo-pie">Rehace el de hoy y lo notifica, a cualquier hora. Tarda unos segundos.</p>
                </div>

                <div className="modulo">
                  <h3>Notificaciones</h3>
                  <Notificaciones />
                </div>

                <div className="modulo">
                  <h3>Feed para AntennaPod</h3>
                  {d.resumen.feedUrl ? (
                    <>
                      <p className="direccion">
                        <code>{d.resumen.feedUrl}</code>
                      </p>
                      <div className="acciones">
                        <Copiar texto={d.resumen.feedUrl} />
                        <form action={a.nuevoFeed}>
                          <button className="boton" type="submit">
                            Cambiar la dirección
                          </button>
                        </form>
                      </div>
                      <p className="modulo-pie">
                        Es privada: quien la tenga puede escuchar tus resúmenes. Si la compartes por error, cámbiala. Los episodios se
                        borran a los 7 días.
                      </p>
                    </>
                  ) : (
                    <form action={a.nuevoFeed}>
                      <button className="boton boton-primario" type="submit">
                        Crear la dirección del feed
                      </button>
                    </form>
                  )}
                </div>
              </>
            )}
          </section>

          {/* --- Finanzas y huella --- */}
          <section className="seccion" id="finanzas" aria-labelledby="t-finanzas">
            <h2 id="t-finanzas">Finanzas y huella</h2>
            <div className="modulo">
              <h3>Excel de cuentas</h3>
              {!d.google.conDrive ? (
                <>
                  <p className="nota">Falta el permiso de Drive. Mi Panel solo podrá leer el fichero que elijas, nunca el resto de tu Drive.</p>
                  <a className="boton boton-primario" href="/auth/google/conectar">
                    Reconectar Google
                  </a>
                </>
              ) : !d.pickerConfigurado ? (
                <p className="error">Falta configurar GOOGLE_PICKER_API_KEY y GOOGLE_PROJECT_NUMBER en Vercel.</p>
              ) : (
                <>
                  <Conexion ok={!!d.excel}>{d.excel ? <>Leyendo {d.excel.nombre}</> : "Aún no has elegido el Excel"}</Conexion>
                  <p className="nota">Se lee al abrir el panel y no se guarda ningún movimiento.</p>
                  <ElegirExcel guardar={a.elegirExcel} texto={d.excel ? "Cambiar el Excel" : "Elegir el Excel en Drive"} />
                </>
              )}
            </div>

            <div className="modulo" id="huella">
              <h3>Huella o Windows Hello</h3>
              {d.huella.faltaMigracion ? (
                <p className="error">Falta ejecutar la migración 0003 en Supabase (SQL Editor).</p>
              ) : (
                <>
                  <p className="nota">
                    Finanzas se abre con la huella o Windows Hello de un dispositivo registrado y se bloquea a los 5 minutos. Solo se guarda
                    la clave pública: la huella no sale del dispositivo.
                  </p>
                  {d.huella.dispositivos.length > 0 && (
                    <ul className="lista-dispositivos">
                      {d.huella.dispositivos.map((c) => (
                        <li key={c.id}>
                          <span>
                            {c.nombre}
                            <small>
                              {c.usado ? `Usado por última vez el ${new Date(c.usado).toLocaleDateString("es-ES", { timeZone: d.tz })}` : "Sin usar"}
                            </small>
                          </span>
                          <form action={a.borrarHuella}>
                            <input type="hidden" name="id" value={c.id} />
                            <button className="boton boton-pequeno" type="submit">
                              Quitar
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.huella.puedeRegistrar ? (
                    <BotonRegistrar nombrePorDefecto={d.huella.dispositivos.length ? "Otro dispositivo" : "Este dispositivo"} />
                  ) : (
                    <div className="estado">
                      <p className="nota">
                        Para añadir un dispositivo, sal y vuelve a entrar con Google: tendrás {d.huella.minutos} minutos. Así una sesión robada
                        no basta para registrar otra huella.
                      </p>
                      <form action="/auth/signout" method="post">
                        <button className="boton" type="submit">
                          Salir para volver a entrar
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* --- Agenda --- */}
          <section className="seccion" id="agenda" aria-labelledby="t-agenda">
            <h2 id="t-agenda">Agenda</h2>
            <form action={a.guardar} className="secciones-form">
              {d.google.conectado && (
                <fieldset className="modulo">
                  <legend>Calendarios a mostrar</legend>
                  <input type="hidden" name="cal_lista" value="1" />
                  <div className="lista-checks">
                    {d.calendarios.map((c) => (
                      <label className="check" key={c.id}>
                        <input type="checkbox" name="cal" value={c.id} defaultChecked={c.activo} />
                        <span className="punto" style={{ background: c.color ?? "var(--tinta-3)" }} aria-hidden="true" />
                        {c.nombre}
                        {c.otraVia && <span className="etiqueta">Se lee por otra vía</span>}
                      </label>
                    ))}
                  </div>
                  <p className="modulo-pie">«Mis tareas» no se lee nunca: sus tareas con hora llegan por su API. «Deporte» no se muestra por defecto.</p>
                </fieldset>
              )}

              <fieldset className="modulo">
                <legend>Huecos libres</legend>
                <p className="nota">Se buscan solo dentro de estas franjas.</p>
                <div className="campos">
                  <label className="campo">
                    Lunes a viernes, desde
                    <input type="time" name="lv_ini" defaultValue={ajustes.lv.ini} required />
                  </label>
                  <label className="campo">
                    hasta
                    <input type="time" name="lv_fin" defaultValue={ajustes.lv.fin} required />
                  </label>
                  <label className="campo">
                    Fin de semana, desde
                    <input type="time" name="fs_ini" defaultValue={ajustes.fs.ini} required />
                  </label>
                  <label className="campo">
                    hasta
                    <input type="time" name="fs_fin" defaultValue={ajustes.fs.fin} required />
                  </label>
                  <label className="campo">
                    Duración mínima (min)
                    <input type="number" name="min_hueco" min={15} max={240} step={5} defaultValue={ajustes.minHueco} required />
                  </label>
                </div>
                <label className="check">
                  <input type="checkbox" name="varios_dias" defaultChecked={ajustes.variosDiasComoContexto} />
                  Eventos de varios días como contexto
                </label>
                <p className="modulo-pie">
                  Los eventos con hora de 24 h o más (por ejemplo, un recordatorio que dura una semana) salen arriba como contexto y no quitan
                  huecos ni cuentan como solape.
                </p>
              </fieldset>

              <fieldset className="modulo">
                <legend>Zona horaria</legend>
                <label className="check">
                  <input type="checkbox" name="hora_local" defaultChecked={ajustes.horaLocal} />
                  Usar la hora de donde estoy
                </label>
                <p className="modulo-pie">
                  Ahora: {d.tz.replace(/_/g, " ")}. Desactivado, todo va con la hora de Barcelona; activado, con la del dispositivo.
                </p>
              </fieldset>

              <button className="boton boton-primario" type="submit">
                Guardar la agenda
              </button>
            </form>
          </section>

          {/* --- Agentes --- */}
          <section className="seccion" id="agentes" aria-labelledby="t-agentes">
            <h2 id="t-agentes">Agentes</h2>
            <div className="modulo">
              {!d.google.conDrive ? (
                <p className="nota">Falta el permiso de Drive: pulsa «Reconectar» en Conexiones.</p>
              ) : (
                <>
                  <Conexion ok={d.agentes.creados !== null && d.agentes.creados === d.agentes.total}>
                    {d.agentes.creados !== null
                      ? `Carpeta creada, ${d.agentes.creados} de ${d.agentes.total} ficheros`
                      : "La carpeta aún no está creada"}
                  </Conexion>
                  <p className="nota">
                    Mi Panel crea en tu Drive la carpeta «{d.agentes.carpeta}» con un fichero por tarea programada. Cada tarea escribe su
                    último resultado en la descripción de su fichero; Mi Panel solo puede leer los ficheros que ha creado.
                  </p>
                  <form action={a.crearAgentes}>
                    <button className={d.agentes.creados !== null ? "boton" : "boton boton-primario"} type="submit">
                      {d.agentes.creados !== null ? "Comprobar y recrear lo que falte" : "Crear la carpeta de agentes"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </section>

          {/* --- Este equipo --- */}
          <section className="seccion" id="equipo" aria-labelledby="t-equipo">
            <h2 id="t-equipo">Este equipo</h2>
            <form action={a.guardarEquipo} className="modulo">
              <label className="check">
                <input type="checkbox" name="equipo_trabajo" defaultChecked={d.equipoTrabajo} />
                Es el PC de Appliant
              </label>
              <p className="nota">
                Solo afecta a este dispositivo: Actividades muestra solo Trabajo y no se cargan ni el resumen ni las finanzas.
              </p>
              <button className="boton" type="submit">
                Guardar este equipo
              </button>
            </form>
          </section>

          {/* --- Emergencia --- */}
          <section className="seccion" id="emergencia" aria-labelledby="t-emergencia">
            <h2 id="t-emergencia">Emergencia</h2>
            <form action={a.botonEmergencia} className="modulo peligro">
              <p className="nota">
                Si pierdes el móvil o crees que alguien ha entrado: revoca Google y Strava, borra sus permisos guardados, quita las
                notificaciones y cierra la sesión en todos tus dispositivos. Después tendrás que volver a conectarlo todo. La clave de Mis
                tareas se revoca desde Mis tareas.
              </p>
              <label className="campo">
                Escribe EMERGENCIA para confirmar
                <input type="text" name="confirmar" autoComplete="off" required pattern="EMERGENCIA" />
              </label>
              <button className="boton boton-peligro" type="submit">
                Desconectar todo y cerrar las sesiones
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
