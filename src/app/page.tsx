import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarAjustes } from "@/lib/ajustes";
import { cargarAgenda, zonaHoraria } from "@/lib/agenda-loader";
import { Agenda } from "@/components/agenda";
import { TzSync } from "@/components/tz-sync";

const PROXIMOS = [
  { name: "Actividades", phase: "Fase 3" },
  { name: "Finanzas", phase: "Fase 4" },
  { name: "Vencimientos", phase: "Fase 5" },
  { name: "Inversiones", phase: "Fase 6" },
  { name: "Deporte", phase: "Fase 7" },
  { name: "Agentes", phase: "Fase 8" },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ajustes = user ? await cargarAjustes(supabase, user.id) : null;
  const tz = ajustes ? await zonaHoraria(ajustes) : "Europe/Madrid";
  const agenda = user && ajustes ? await cargarAgenda(supabase, user.id, ajustes, tz) : null;

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

      {agenda && <Agenda r={agenda} />}

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
