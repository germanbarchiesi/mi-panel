import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarAjustesYEstado, registrarOkMisTareas } from "@/lib/ajustes";
import { cargarAgenda, hoyEn, zonaHoraria } from "@/lib/agenda-loader";
import { ambitoApi, seleccionInicial } from "@/lib/mis-tareas";
import { pedirResumen, urlMisTareas } from "@/lib/mis-tareas-api";
import { esEquipoTrabajo } from "@/lib/equipo";
import { Agenda } from "@/components/agenda";
import { Actividades, type DatosActividades } from "@/components/actividades";
import { TzSync } from "@/components/tz-sync";

const PROXIMOS = [
  { name: "Finanzas", phase: "Fase 4" },
  { name: "Vencimientos", phase: "Fase 5" },
  { name: "Inversiones", phase: "Fase 6" },
  { name: "Deporte", phase: "Fase 7" },
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
  const sel = seleccionInicial((await searchParams).ambito, await esEquipoTrabajo());
  const ambito = ambitoApi(sel);
  const hoy = hoyEn(tz);

  const [agenda, resumen] = user && ajustes
    ? await Promise.all([
        cargarAgenda(supabase, user.id, ajustes, tz, ambito),
        pedirResumen(hoy, ambito).catch(() => ({ ok: false as const, fallo: "respuesta" as const })),
      ])
    : [null, null];

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
          <Link className="btn" href="/ajustes">
            Ajustes
          </Link>
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
          trasHoy={actividades && <Actividades datos={actividades} sel={sel} urlApp={urlMisTareas()} tz={tz} />}
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
