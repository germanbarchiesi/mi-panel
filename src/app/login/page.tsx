import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/iconos";

export const metadata: Metadata = { title: "Acceso" };

const MESSAGES: Record<string, string> = {
  denied: "Esta cuenta no tiene acceso a Mi Panel.",
  oauth: "No se ha podido completar el acceso con Google. Inténtalo de nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? MESSAGES.oauth) : null;

  return (
    <main className="acceso">
      <Marca tam={56} />
      <h1>Mi Panel</h1>
      <p>Tu día, tus tareas y tus cuentas en una pantalla. Acceso privado.</p>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {/* Enlace normal (GET): el servidor inicia el flujo OAuth y redirige a Google. */}
      <a className="boton boton-primario" href="/auth/login">
        Entrar con Google
      </a>
      <p className="modulo-pie">
        <Link href="/privacidad">Privacidad y condiciones</Link>
      </p>
    </main>
  );
}
