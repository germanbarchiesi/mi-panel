/* Service worker mínimo de Mi Panel.
 *
 * Solo guarda la interfaz estática (iconos y la página sin conexión). NUNCA guarda
 * respuestas de páginas, API ni datos: tareas, finanzas, etc. siempre van a red.
 */
const CACHE = "mi-panel-shell-v2";
const SHELL = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: siempre red; si no hay conexión, página sin conexión (sin datos).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline.html").then((r) => r || Response.error())),
    );
    return;
  }

  // Solo los iconos del shell salen de caché; el resto no se intercepta.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((r) => r || fetch(req)));
  }
});

// Notificaciones (fase 9): solo un aviso genérico, nunca el contenido del resumen.
self.addEventListener("push", (event) => {
  let d = { titulo: "Mi Panel", cuerpo: "Tu resumen está listo", url: "/" };
  try {
    d = { ...d, ...(event.data ? event.data.json() : {}) };
  } catch {
    // payload no válido: se usa el aviso genérico
  }
  event.waitUntil(
    self.registration.showNotification(String(d.titulo).slice(0, 60), {
      body: String(d.cuerpo).slice(0, 120),
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "resumen",
      data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url.startsWith(self.location.origin)) {
          v.navigate(url);
          return v.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
