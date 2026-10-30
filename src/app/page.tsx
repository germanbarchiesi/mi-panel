import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { cargarAjustesYEstado, registrarOkMisTareas } from "@/lib/ajustes";
import { cargarAgenda, hoyEn, zonaHoraria } from "@/lib/agenda-loader";
import { ambitoApi, seleccionInicial } from "@/lib/mis-tareas";
import { pedirResumen, urlMisTareas } from "@/lib/mis-tareas-api";
import { esEquipoTrabajo } from "@/lib/equipo";
import { Agenda } from "@/components/agenda";
import { Actividades, type DatosActividades } from "@/components/actividades";
import { TzSync } from "@/components/tz-sync";
import { FinanzasYVencimientos, type EstadoFinanzas } from "@/components/finanzas";
import { cargarFinanzas } from "@/lib/finanzas-loader";
import { FaltaMigracionBiometria, desbloqueadoHasta, listarCredenciales } from "@/lib/biometria";
import { TZ_BARCELONA } from "@/lib/agenda";
import { cargarDeporte } from "@/lib/deporte-loader";
import { Deporte } from "@/components/deporte";

const PROXIMOS = [
  { name: "Agentes", phase: "Fase 8" },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ambito?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const estado = user ? await cargarAjustesYEstado(supabase, user.id) : null;
  const ajustes = estado?.ajustes ?? null;
  const tz = ajustes ? await zonaHoraria(ajustes) : "Europe/Madrid";

  // Actividades: el «hoy» de Mi Panel en su zona horaria; ámbito según el selector o el equipo.
  const equipoTrabajo = await esEquipoTrabajo();
  const sel = seleccionInicial((await searchParams).ambito, equipoTrabajo);
  const ambito = ambitoApi(sel);
  const hoy = hoyEn(tz);

  const [agenda, resumen, deporte] = user && ajustes
    ? await Promise.all([
        cargarAgenda(supabase, user.id, ajustes, tz, ambito),
        pedirResumen(hoy, ambito).catch(() => ({ ok: false as const, fallo: "respuesta" as const })),
        cargarDeporte(supabase, user.id, tz, hoy).catch(() => null),
      ])
    : [null, null, null];

  // Finanzas: el servidor solo las lee con el desbloqueo por huella vigente, y nunca en el PC de trabajo.
  // El mes de las finanzas sigue siempre la hora de Barcelona, como el Excel.
  let finanzas: EstadoFinanzas | null = null;
  if (user && estado) {
    if (equipoTrabajo) finanzas = { tipo: "modo_trabajo" };
    else {
      const hasta = await desbloqueadoHasta(user.id);
      if (hasta) {
        const ocultos = (await cookies()).get("importes")?.value === "ocultos";
        const r = await cargarFinanzas(supabase, user.id, estado.excel, hoyEn(TZ_BARCELONA));
        finanzas = { tipo: "abierto", hasta, ocultos, r };
      } else {
        let hayHuella = false;
        let faltaMigracion = false;
        try {
          hayHuella = (await listarCredenciales(supabase, user.id)).length > 0;
        } catch (e) {
          faltaMigracion = e instanceof FaltaMigracionBiometria;
        }
        finanzas = { tipo: "bloqueado", hayHuella, faltaMigracion };
      }
    }
  }

  let actividades: DatosActividades | null = null;
  if (user && estado && resumen) {
    if (resumen.ok) {
      await registrarOkMisTareas(supabase, user.id, estado.misTareasUltimoOk, resumen.obtenido);
      actividades = { ok: true, resumen: resumen.datos };
    } else {
      actividades = { ok: false, fallo: resumen.fallo, ultimoOk: estado.misTareasUltimoOk };
    }
  }

  return (
    <main>
      {ajustes?.horaLocal && <TzSync />}
      <div className="row">
        <div>
          <h1>Mi Panel</h1>
          <p className="muted" style={{ margin: 0 }}>
            {user?.email}
          </p>
        </div>
        <div className="acciones">
          {/* Carga completa (no Link): Ajustes tiene su propia CSP para el selector de Google. */}
          <a className="btn" href="/ajustes">
            Ajustes
          </a>
          <form action="/auth/signout" method="post">
            <button className="btn" type="submit">
              Salir
            </button>
          </form>
        </div>
      </div>

      {agenda && (
        <Agenda
          r={agenda}
          trasHoy={
            <>
              {actividades && <Actividades datos={actividades} sel={sel} urlApp={urlMisTareas()} tz={tz} />}
              {deporte && <Deporte r={deporte} />}
              {finanzas && <FinanzasYVencimientos e={finanzas} />}
            </>
          }
        />
      )}

      <h2 className="sub">Próximamente</h2>
      <div className="grid">
        {PROXIMOS.map((m) => (
          <div className="tile" key={m.name}>
            <strong>{m.name}</strong>
            <span>{m.phase}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
