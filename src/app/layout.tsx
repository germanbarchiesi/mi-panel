import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
// Archivo con eje de anchura (62–125 %): condensada para títulos y cifras, normal para leer. Se sirve
// desde la propia app (CSP font-src 'self'), sin Google Fonts.
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: { default: "Mi Panel", template: "%s · Mi Panel" },
  description: "Panel personal: agenda, actividades, finanzas y más.",
  applicationName: "Mi Panel",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Mi Panel", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ecede8" },
    { media: "(prefers-color-scheme: dark)", color: "#111419" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Leer los headers fuerza el render dinámico, necesario para que Next aplique el nonce de la CSP.
  await headers();
  return (
    <html lang="es">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
