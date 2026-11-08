import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cargarAjustesYEstado, guardarCampo, registrarOkMisTareas } from "@/lib/ajustes";
import { cargarAgenda, hoyEn, zonaHoraria } from "@/lib/agenda-loader";
import { ambitoApi, seleccionInicial } from "@/lib/mis-tareas";
import { pedirResumen, urlMisTareas } from "@/lib/mis-tareas-api";
import { esEquipoTrabajo } from "@/lib/equipo";
import { cargarFinanzas } from "@/lib/finanzas-loader";
import { FaltaMigracionBiometria, desbloqueadoHasta, listarCredenciales } from "@/lib/biometria";
import { TZ_BARCELONA } from "@/lib/agenda";
import { cargarDeporte } from "@/lib/deporte-loader";
import { cargarAgentes } from "@/lib/agentes-loader";
import { resumenDeHoy } from "@/lib/resumen-servicio";
import { supabaseSecretKey } from "@/lib/env";
import type { DatosActividades } from "@/components/actividades";
import type { EstadoFinanzas } from "@/components/finanzas";
import { Inicio } from "@/components/inicio";

function ahoraMs() {
  return Date.now();
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ambito?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // El proxy ya exige sesión; esto cubre una sesión que caduca justo entre medias.
  if (!user) redirect("/login");

  const estado = await cargarAjustesYEstado(supabase, user.id);
  const ajustes = estado.ajustes;
  const tz = await zonaHoraria(ajustes);
  const ahora = ahoraMs();

  // Actividades: el «hoy» de Mi Panel en su zona horaria; ámbito según el selector o el equipo.
  const equipoTrabajo = await esEquipoTrabajo();
  const sel = seleccionInicial((await searchParams).ambito, equipoTrabajo);
  const ambito = ambitoApi(sel);
  const hoy = hoyEn(tz);

  // Finanzas: el servidor solo las lee con el desbloqueo por huella vigente, y nunca en el PC de trabajo.
  // El mes de las finanzas sigue siempre la hora de Barcelona, como el Excel.
  const finanzasP = (async (): Promise<EstadoFinanzas> => {
    if (equipoTrabajo) return { tipo: "modo_trabajo" };
    const hasta = await desbloqueadoHasta(user.id);
    if (hasta) {
      const ocultos = (await cookies()).get("importes")?.value === "ocultos";
      const r = await cargarFinanzas(supabase, user.id, estado.excel, hoyEn(TZ_BARCELONA));
      return { tipo: "abierto", hasta, restante: hasta - ahora, ocultos, r };
    }
    let hayHuella = false;
    let faltaMigracion = false;
    try {
      hayHuella = (await listarCredenciales(supabase, user.id)).length > 0;
    } catch (e) {
      faltaMigracion = e instanceof FaltaMigracionBiometria;
    }
    return { tipo: "bloqueado", hayHuella, faltaMigracion };
  })();

  // Todo en paralelo: cada módulo falla por su cuenta sin tumbar el panel.
  const [agenda, resumen, deporte, agentes, resumen7, finanzas] = await Promise.all([
    cargarAgenda(supabase, user.id, ajustes, tz, ambito),
    pedirResumen(hoy, ambito).catch(() => ({ ok: false as const, fallo: "respuesta" as const })),
    cargarDeporte(supabase, user.id, tz, hoy).catch(() => null),
    // En el inicio solo las tarjetas no privadas: el informe de inversiones se ve en /agentes con huella.
    cargarAgentes(supabase, user.id, estado.agentes, { privadas: false }),
    // El resumen lleva tareas personales y el estado de las finanzas: no se muestra en el PC de trabajo.
    !equipoTrabajo && supabaseSecretKey() ? resumenDeHoy(user.id, tz).catch(() => null) : Promise.resolve(null),
    finanzasP.catch((): EstadoFinanzas => ({ tipo: "error" })),
  ]);
  // Con «Usar la hora de donde estoy», el resumen de las 7:00 sigue la última zona que vio la app.
  if (ajustes.horaLocal && tz !== estado.tzConocida) {
    await guardarCampo(supabase, user.id, "tzConocida", tz).catch(() => undefined);
  }

  let actividades: DatosActividades;
  if (resumen.ok) {
    await registrarOkMisTareas(supabase, user.id, estado.misTareasUltimoOk, resumen.obtenido);
    actividades = { ok: true, resumen: resumen.datos };
  } else {
    actividades = { ok: false, fallo: resumen.fallo, ultimoOk: estado.misTareasUltimoOk };
  }

  return (
    <Inicio
      tz={tz}
      hoy={hoy}
      ahora={ahora}
      horaLocal={ajustes.horaLocal}
      agenda={agenda}
      actividades={{ datos: actividades, sel, urlApp: urlMisTareas(), modoTrabajo: equipoTrabajo }}
      deporte={deporte}
      finanzas={finanzas}
      agentes={agentes}
      resumen7={resumen7}
    />
  );
}
