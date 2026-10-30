import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cargarAjustesYEstado } from "@/lib/ajustes";
import { zonaHoraria } from "@/lib/agenda-loader";
import { cargarAgentes } from "@/lib/agentes-loader";
import { desbloqueadoHasta } from "@/lib/biometria";
import { esEquipoTrabajo } from "@/lib/equipo";
import { Agentes } from "@/components/agentes";
import { TzSync } from "@/components/tz-sync";

export const metadata: Metadata = { title: "Agentes" };

function ahoraMs() {
  return Date.now();
}

export default async function AgentesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const estado = await cargarAjustesYEstado(supabase, user.id);
  const tz = await zonaHoraria(estado.ajustes);
  // Tarjetas privadas (inversiones): solo con huella vigente, sin ocultar importes y fuera del PC de trabajo.
  const ocultos = (await cookies()).get("importes")?.value === "ocultos";
  const privadas = !(await esEquipoTrabajo()) && !ocultos && (await desbloqueadoHasta(user.id)) !== null;
  const r = await cargarAgentes(supabase, user.id, estado.agentes, { privadas });

  return (
    <main>
      {estado.ajustes.horaLocal && <TzSync />}
      <div className="row">
        <h1>Agentes</h1>
        <Link className="btn" href="/">
          Volver
        </Link>
      </div>
      <Agentes r={r} ahora={ahoraMs()} tz={tz} privadasOcultas={!privadas} />
    </main>
  );
}
