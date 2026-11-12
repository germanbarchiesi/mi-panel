import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/iconos";

export const metadata: Metadata = { title: "Privacidad y condiciones" };

export default function PrivacidadPage() {
  return (
    <main className="pagina">
      <header className="cabecera">
        <Link className="cabecera-marca" href="/">
          <Marca tam={30} />
          Mi Panel
        </Link>
      </header>
      <article className="texto-largo">
        <h1>Privacidad y condiciones</h1>
        <p className="nota">Última actualización: 8 de noviembre de 2026.</p>

        <h2>Qué es Mi Panel</h2>
        <p>
          Mi Panel es una aplicación personal y privada, creada y usada únicamente por su titular. No está abierta al público: solo
          puede entrar la cuenta de su propietario.
        </p>

        <h2>Qué datos de Google usa</h2>
        <ul>
          <li>
            <strong>Google Calendar, solo lectura</strong> (<code>calendar.readonly</code>): para mostrar la agenda, los huecos libres y
            los solapes. No crea, cambia ni borra eventos.
          </li>
          <li>
            <strong>Google Drive, solo ficheros propios</strong> (<code>drive.file</code>): el Excel de cuentas que el propietario elige y
            los ficheros que la app crea en la carpeta «Mi Panel · Agentes». La app no puede ver el resto de Drive.
          </li>
        </ul>

        <h2>Otros servicios</h2>
        <ul>
          <li>
            Strava, para leer las actividades y comparar el deporte planificado con el hecho. Si el propietario lo permite, la app
            también crea en Strava los entrenos que él apunta a mano; nunca cambia ni borra actividades.
          </li>
          <li>Mis tareas, la app de tareas del propio titular, mediante su API de solo lectura.</li>
          <li>Yahoo Finanzas y Kraken, para precios públicos de mercado. No se les envía ningún dato personal.</li>
        </ul>

        <h2>Qué se guarda y cómo</h2>
        <ul>
          <li>Los permisos de Google y de Strava, cifrados con AES-256-GCM.</li>
          <li>Los ajustes de la app y la clave pública de cada dispositivo con huella. La huella nunca sale del dispositivo.</li>
          <li>El texto del resumen diario (sin importes), cifrado, y su audio, en almacenamiento privado. Se borran a los 7 días.</li>
          <li>Una foto diaria del valor de la cartera, cifrada, para dibujar su evolución.</li>
          <li>Las suscripciones a notificaciones de cada dispositivo.</li>
        </ul>
        <p>
          Los eventos del calendario, las tareas, los movimientos del Excel y las actividades de Strava no se almacenan: se leen cada
          vez que se abre la app.
        </p>

        <h2>Con quién se comparten</h2>
        <p>
          Con nadie. Los datos no se venden, no se ceden a terceros y no se usan para publicidad ni para entrenar modelos. La app no usa
          analítica ni scripts de terceros.
        </p>
        <p>
          El uso de la información recibida de las API de Google se ajusta a la{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            política de datos de usuario de los servicios de API de Google
          </a>
          , incluidos los requisitos de uso limitado.
        </p>

        <h2>Cómo retirar los permisos</h2>
        <p>
          El propietario puede desconectar Google y Strava desde Ajustes en cualquier momento, lo que revoca el permiso y borra lo
          guardado. El botón de emergencia lo revoca todo a la vez y cierra todas las sesiones. También puede revocarlos desde su Cuenta
          de Google y desde Strava.
        </p>

        <h2>Condiciones</h2>
        <p>Mi Panel se ofrece tal cual, para uso personal de su titular, sin garantías ni soporte a terceros.</p>
      </article>
    </main>
  );
}
