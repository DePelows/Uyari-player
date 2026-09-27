// ============================================================
// Uyari Player — Service Worker
// Estrategia mixta:
//   - Network-first para HTML/JS/CSS (siempre intenta traer lo último)
//   - Cache-first para assets estáticos (icono, manifest, librerías)
// ============================================================

const CACHE_NAME = "uyari-cache-v2";

// Assets que se sirven desde caché siempre (cambian poco)
const STATIC_ASSETS = [
  "./icon.svg",
  "./manifest.json",
  "./js/jsmediatags.min.js"
];

// Assets que se intentan traer de red primero (cambian seguido)
const DYNAMIC_ASSETS = [
  "./",
  "./index.html",
  "./css/main.css",
  "./js/app.js",
  "./js/db.js",
  "./js/player.js",
  "./js/ui.js"
];

// ------------------------------------------------------------
// INSTALL: cachea todo lo posible, tolerando fallos individuales
// ------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const allAssets = [...STATIC_ASSETS, ...DYNAMIC_ASSETS];
      // Cachea uno por uno para que un 404 no rompa toda la instalación
      await Promise.all(
        allAssets.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[SW] No se pudo cachear:", url, err);
          })
        )
      );
      console.log("[SW] Instalado con caché:", CACHE_NAME);
    })
  );
  self.skipWaiting();
});

// ------------------------------------------------------------
// ACTIVATE: purga versiones viejas de caché
// ------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[SW] Borrando caché vieja:", key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ------------------------------------------------------------
// FETCH: estrategia según tipo de recurso
// ------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Solo manejar GET y URLs http(s)
  if (request.method !== "GET") return;
  if (!request.url.startsWith("http")) return;

  // Ignorar requests a otros orígenes (APIs externas, etc.)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Comprobar si es un asset dinámico (código) o estático
  const path = url.pathname;
  const isDynamic =
    path.endsWith(".html") ||
    path.endsWith("/") ||
    path.endsWith(".js") ||
    path.endsWith(".css");

  if (isDynamic) {
    // ============ NETWORK-FIRST ============
    // Intenta red primero; si falla, usa caché
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clonar y guardar en caché la versión nueva
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone).catch(() => {});
            });
          }
          return response;
        })
        .catch(async () => {
          // Sin red: buscar en caché
          const cached = await caches.match(request);
          if (cached) return cached;
          // Fallback final: index.html para navegación
          if (request.mode === "navigate") {
            const fallback = await caches.match("./index.html");
            if (fallback) return fallback;
          }
          return new Response("Offline", { status: 503 });
        })
    );
  } else {
    // ============ CACHE-FIRST ============
    // Usa caché; si no hay, va a red y guarda
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === "basic") {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone).catch(() => {});
              });
            }
            return response;
          })
          .catch(() => new Response("Offline", { status: 503 }));
      })
    );
  }
});

// ------------------------------------------------------------
// MESSAGE: forzar actualización desde la app (opcional)
// ------------------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
