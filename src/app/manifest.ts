import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mi Panel",
    short_name: "Mi Panel",
    description: "Panel personal: agenda, actividades, finanzas y más.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "es",
    background_color: "#0e1116",
    theme_color: "#0e1116",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
