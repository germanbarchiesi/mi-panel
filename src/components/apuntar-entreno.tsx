"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { apuntarEntreno, type EstadoApuntar } from "@/lib/acciones-deporte";
import { TIPOS_MANUALES, type OpcionDia, type TipoManual } from "@/lib/deporte";
import { Icono } from "@/components/iconos";

const INICIAL: EstadoApuntar = { estado: "inicial" };
const ORDEN: TipoManual[] = ["natacion", "crossfit", "fuerza"];
const MINUTOS: Record<TipoManual, number> = { natacion: 45, crossfit: 60, fuerza: 60 };

/** Duración que se propone: la del evento planificado si es de ese tipo; si no, una habitual. */
function duracion(o: OpcionDia | undefined, t: TipoManual) {
  return o?.sugerencia?.tipo === t && o.sugerencia.minutos ? o.sugerencia.minutos : MINUTOS[t];
}

/**
 * Formulario para apuntar a mano un entreno que el reloj no registró. Se guarda en Strava.
 * Propone día, tipo, hora y duración; lo que se cambia a mano ya no se vuelve a proponer.
 */
export function ApuntarEntreno({ opciones, elegido }: { opciones: OpcionDia[]; elegido: string }) {
  const [estado, accion, enviando] = useActionState(apuntarEntreno, INICIAL);
  const opcion = (f: string) => opciones.find((o) => o.fecha === f);
  const inicial = opcion(elegido);
  const tipoInicial = inicial?.sugerencia?.tipo ?? "crossfit";
  // Todo controlado: así lo escrito se mantiene si Strava pide confirmación o devuelve un error.
  const [fecha, setFecha] = useState(elegido);
  const [tipo, setTipo] = useState<TipoManual>(tipoInicial);
  const [hora, setHora] = useState(inicial?.hora ?? "20:00");
  const [minutos, setMinutos] = useState(String(duracion(inicial, tipoInicial)));
  const [metros, setMetros] = useState("");
  const [tocados, setTocados] = useState({ tipo: false, hora: false, minutos: false });
  const [descartado, setDescartado] = useState<EstadoApuntar | null>(null);
  const tocar = (campo: keyof typeof tocados) => setTocados((t) => ({ ...t, [campo]: true }));

  function elegirTipo(t: TipoManual) {
    setTipo(t);
    tocar("tipo");
    if (!tocados.minutos) setMinutos(String(duracion(opcion(fecha), t)));
  }

  // Al cambiar de día se propone lo de ese día (la sesión que quedó sin hacer) en lo que no se ha tocado.
  function cambiarDia(nueva: string) {
    setFecha(nueva);
    const o = opcion(nueva);
    const t = !tocados.tipo && o?.sugerencia ? o.sugerencia.tipo : tipo;
    setTipo(t);
    if (!tocados.hora && o) setHora(o.hora);
    if (!tocados.minutos) setMinutos(String(duracion(o, t)));
  }

  // La confirmación solo vale para el día y el tipo que la pidieron; si se cambian, se vuelve a comprobar.
  const confirmar =
    estado.estado === "duplicado" && estado !== descartado && estado.fecha === fecha && estado.tipo === tipo;

  // Envío a mano (no con `action`): React vaciaría el formulario al terminar, también tras pedir confirmación.
  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const datos = new FormData(ev.currentTarget, (ev.nativeEvent as SubmitEvent).submitter);
    startTransition(() => accion(datos));
  }

  return (
    <form onSubmit={enviar} className="apuntar">
      <label className="campo">
        Día
        <select name="fecha" value={fecha} onChange={(e) => cambiarDia(e.target.value)}>
          {opciones.map((o) => (
            <option key={o.fecha} value={o.fecha}>
              {o.etiqueta}
              {o.sugerencia ? `: ${TIPOS_MANUALES[o.sugerencia.tipo].nombre} sin hacer` : ""}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="campo-grupo">
        <legend>Tipo</legend>
        <div className="segmentos">
          {ORDEN.map((t) => (
            <label key={t} className={t === tipo ? "segmento activo" : "segmento"}>
              <input className="solo-lector" type="radio" name="tipo" value={t} checked={t === tipo} onChange={() => elegirTipo(t)} />
              {TIPOS_MANUALES[t].nombre}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="campos">
        <label className="campo">
          Hora de inicio
          <input
            type="time"
            name="hora"
            value={hora}
            onChange={(e) => {
              setHora(e.target.value);
              tocar("hora");
            }}
            required
          />
        </label>
        <label className="campo">
          Duración (min)
          <input
            type="number"
            name="minutos"
            min={1}
            max={600}
            step={1}
            inputMode="numeric"
            value={minutos}
            onChange={(e) => {
              setMinutos(e.target.value);
              tocar("minutos");
            }}
            required
          />
        </label>
        {tipo === "natacion" && (
          <label className="campo">
            Metros (opcional)
            <input
              type="number"
              name="metros"
              min={0}
              max={20000}
              step={25}
              inputMode="numeric"
              placeholder="1500"
              value={metros}
              onChange={(e) => setMetros(e.target.value)}
            />
          </label>
        )}
      </div>

      {confirmar && (
        <p className="aviso aviso-suave" role="alert">
          <Icono nombre="alerta" tam={18} />
          <span>{estado.mensaje}</span>
        </p>
      )}
      {estado.estado === "error" && (
        <p className="aviso" role="alert">
          <Icono nombre="alerta" tam={18} />
          <span>
            {estado.mensaje}
            {estado.reconectar && (
              <>
                {" "}
                <a className="enlace" href="/auth/strava/conectar">
                  Reconectar Strava
                </a>
              </>
            )}
          </span>
        </p>
      )}
      {estado.estado === "ok" && (
        <p className="mensaje" role="status">
          <Icono nombre="check" tam={20} />
          <span>
            {estado.mensaje}
            {estado.enlace && (
              <>
                {" "}
                <a className="enlace" href={estado.enlace} target="_blank" rel="noopener noreferrer">
                  Ver en Strava
                </a>
              </>
            )}
          </span>
        </p>
      )}

      <div className="acciones">
        {confirmar ? (
          <>
            <button className="boton boton-primario" type="submit" name="forzar" value="1" disabled={enviando}>
              {enviando ? "Guardando…" : "Sí, es otra: guardarla"}
            </button>
            <button className="boton" type="button" onClick={() => setDescartado(estado)} disabled={enviando}>
              No, ya está
            </button>
          </>
        ) : (
          <button className="boton boton-primario" type="submit" disabled={enviando}>
            {enviando ? "Guardando en Strava…" : "Guardar en Strava"}
          </button>
        )}
      </div>
    </form>
  );
}
