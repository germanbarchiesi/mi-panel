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

export function googleConfig() {
  return {
    clientId: required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID).trim(),
    clientSecret: required("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET).trim(),
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

/** Selector de Google (Picker): clave de API restringida y número del proyecto de Google Cloud. */
export function pickerConfig(): { apiKey: string; appId: string } | null {
  const apiKey = process.env.GOOGLE_PICKER_API_KEY?.trim();
  const appId = process.env.GOOGLE_PROJECT_NUMBER?.trim();
  if (!apiKey || !appId || !/^\d{6,20}$/.test(appId)) return null;
  return { apiKey, appId };
}

/** App de Strava (strava.com/settings/api). null si no está configurada. */
export function stravaConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim();
  const clientSecret = process.env.STRAVA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !/^\d{1,12}$/.test(clientId)) return null;
  return { clientId, clientSecret };
}

/** Clave secreta de Supabase (solo servidor): la usan las tareas automáticas, que no tienen sesión. */
export function supabaseSecretKey(): string | null {
  const k = process.env.SUPABASE_SECRET_KEY?.trim();
  return k && k.length >= 20 ? k : null;
}

/** Secreto de las llamadas de Supabase Cron (Authorization: Bearer …). */
export function cronSecret(): string | null {
  const s = process.env.CRON_SECRET?.trim();
  return s && s.length >= 32 ? s : null;
}

/** Token de GitHub (fine-grained, solo Actions del repo) para lanzar el audio. */
export function githubDispatch(): { token: string; repo: string } | null {
  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim() || "germanbarchiesi/mi-panel";
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { token, repo };
}
