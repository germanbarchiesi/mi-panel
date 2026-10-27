import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "@/lib/env";

/** Cliente de Supabase para Server Components y Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component: el proxy ya refresca la sesión.
        }
      },
    },
  });
}
