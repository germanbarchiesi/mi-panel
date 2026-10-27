import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
  width: "device-width",
  initialScale: 1,
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
