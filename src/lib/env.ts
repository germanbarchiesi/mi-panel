// Lectura centralizada de variables de entorno (solo servidor, salvo las NEXT_PUBLIC_).
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function supabaseConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    key: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

export function allowedEmail(): string {
  return required("ALLOWED_EMAIL", process.env.ALLOWED_EMAIL).trim().toLowerCase();
}

/** Comprueba que el usuario autenticado es el único autorizado (Google, email verificado). */
export function isOwner(user: {
  email?: string | null;
  app_metadata?: { provider?: string };
  user_metadata?: { email_verified?: boolean };
}): boolean {
  if (!user.email) return false;
  if (user.app_metadata?.provider !== "google") return false;
  if (user.user_metadata?.email_verified === false) return false;
  return user.email.trim().toLowerCase() === allowedEmail();
}
