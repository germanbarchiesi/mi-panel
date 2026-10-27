import { createClient } from "@/lib/supabase/server";

const MODULES = [
  { name: "Agenda", phase: "Fase 2" },
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

  return (
    <main>
      <div className="row">
        <div>
          <h1>Mi Panel</h1>
          <p className="muted" style={{ margin: 0 }}>
            {user?.email}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="btn" type="submit">
            Salir
          </button>
        </form>
      </div>

      <div className="card">
        <strong>Base lista.</strong>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Acceso con Google, PWA instalable y cabeceras de seguridad. Los módulos llegan por fases.
        </p>
      </div>

      <div className="grid">
        {MODULES.map((m) => (
          <div className="tile" key={m.name}>
            <strong>{m.name}</strong>
            <span>{m.phase}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
