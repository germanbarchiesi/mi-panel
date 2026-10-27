import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacidad y condiciones" };

export default function PrivacidadPage() {
  return (
    <main>
      <h1>Privacidad y condiciones</h1>
      <p className="muted">Mi Panel · última actualización: 27 de octubre de 2026</p>

      <div className="card">
        <h2>Qué es Mi Panel</h2>
        <p>
          Mi Panel es una aplicación personal, de uso privado, creada y utilizada únicamente por su titular. No está
          abierta al público: solo puede entrar la cuenta de su propietario.
        </p>
      </div>

      <div className="card">
        <h2>Qué datos de Google usa</h2>
        <p>
          Con el permiso del propietario, la app lee su Google Calendar en modo <strong>solo lectura</strong> (permiso{" "}
          <code>calendar.readonly</code>) para mostrarle su agenda, huecos libres y solapes. No crea, modifica ni borra
          eventos.
        </p>
      </div>

      <div className="card">
        <h2>Qué se guarda y cómo</h2>
        <p>
          Solo se guarda el permiso de acceso a Google, cifrado (AES-256-GCM), y los ajustes de la app. Los eventos del
          calendario no se almacenan: se leen de Google cada vez que se abre la app.
        </p>
      </div>

      <div className="card">
        <h2>Con quién se comparten</h2>
        <p>
          Con nadie. Los datos no se venden, no se ceden a terceros y no se usan para publicidad ni para entrenar
          modelos. La app no usa analítica ni scripts de terceros.
        </p>
        <p>
          El uso de la información recibida de las API de Google se ajusta a la{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">
            política de datos de usuario de los servicios de API de Google
          </a>
          , incluidos los requisitos de uso limitado.
        </p>
      </div>

      <div className="card">
        <h2>Cómo retirar el permiso</h2>
        <p>
          El propietario puede desconectar Google Calendar desde Ajustes en cualquier momento, lo que revoca el permiso y
          borra el token guardado. También puede revocarlo en la configuración de su Cuenta de Google.
        </p>
      </div>

      <div className="card">
        <h2>Condiciones</h2>
        <p>
          Mi Panel se ofrece tal cual, para uso personal de su titular, sin garantías ni soporte a terceros.
        </p>
      </div>

      <p>
        <Link href="/">Volver a Mi Panel</Link>
      </p>
    </main>
  );
}
