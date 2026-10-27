import type { Metadata } from "next";

export const metadata: Metadata = { title: "Acceso" };

const MESSAGES: Record<string, string> = {
  denied: "Esta cuenta no tiene acceso a Mi Panel.",
  oauth: "No se pudo completar el acceso con Google. Inténtalo de nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? MESSAGES.oauth) : null;

  return (
    <main className="center">
      <h1>Mi Panel</h1>
      <p className="muted">Acceso privado.</p>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {/* Enlace normal (GET): el servidor inicia el flujo OAuth y redirige a Google. */}
      <a className="btn btn-primary" href="/auth/login">
        Entrar con Google
      </a>
    </main>
  );
}
