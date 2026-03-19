// Bump this version whenever we need to force clients off an old cached app shell.
const CACHE_NAME = "lis-pwa-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
const STATIC_DESTINATIONS = new Set([
  "style",
  "script",
  "image",
  "font",
  "manifest",
  "worker",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheKeys) =>
        Promise.all(
          cacheKeys
            .filter((cacheKey) => cacheKey !== CACHE_NAME)
            .map((cacheKey) => caches.delete(cacheKey)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function shouldHandleRequest(request) {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  if (url.pathname.startsWith("/api")) {
    return false;
  }

  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (!shouldHandleRequest(request)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", responseClone));
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          return cachedResponse || caches.match("/");
        }),
    );
    return;
  }

  if (!STATIC_DESTINATIONS.has(request.destination)) {
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      } catch {
        return cachedResponse;
      }
    }),
  );
});
