import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { allowedEmail, supabaseConfig, supabaseSecretKey } from "@/lib/env";

// Cliente de Supabase con la clave secreta, SOLO para tareas automáticas sin sesión (Supabase Cron,
// GitHub Actions, el feed). Se salta RLS: cada consulta filtra por el id del propietario.

let cliente: SupabaseClient | null = null;
let propietario: string | null = null;

export class SinClaveSecreta extends Error {}

export function admin(): SupabaseClient {
  const key = supabaseSecretKey();
  if (!key) throw new SinClaveSecreta("Falta SUPABASE_SECRET_KEY");
  cliente ??= createClient(supabaseConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cliente;
}

/** Id del único usuario autorizado (ALLOWED_EMAIL). */
export async function idPropietario(): Promise<string | null> {
  if (propietario) return propietario;
  const email = allowedEmail();
  const { data, error } = await admin().auth.admin.listUsers({ page: 1, perPage: 50 });
  if (error) throw new Error(`Supabase: ${error.message}`);
  propietario = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  return propietario;
}
