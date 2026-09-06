const VERSION = "marginalia-v1";
const PRECACHE = `${VERSION}-precache`;
const RUNTIME = `${VERSION}-runtime`;
const SOURCES = `${VERSION}-sources`;
const READER = `${VERSION}-reader`;
const READER_LIMIT = 100;
const SOURCES_LIMIT = 200;

const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

function bypass(request, url) {
  if (request.method !== "GET") {
    return true;
  }
  if (url.origin !== self.location.origin) {
    return true;
  }
  const path = url.pathname;
  if (path.startsWith("/api/media/") && path.includes("/file")) {
    return true;
  }
  if (path.startsWith("/api/videos")) {
    return true;
  }
  if (path.startsWith("/api/jobs")) {
    return true;
  }
  if (path.startsWith("/api/sync")) {
    return true;
  }
  if (path.startsWith("/api/x/")) {
    return true;
  }
  if (path.startsWith("/api/auth/")) {
    return true;
  }
  if (path.startsWith("/api/mcp")) {
    return true;
  }
  if (path.startsWith("/_next/webpack")) {
    return true;
  }
  if (request.headers.has("range")) {
    return true;
  }
  return false;
}

function isDevHost() {
  const host = self.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  while (keys.length > max) {
    const oldest = keys.shift();
    if (!oldest) {
      break;
    }
    await cache.delete(oldest);
  }
}

async function putOk(cacheName, request, response, limit) {
  if (!response.ok) {
    return;
  }
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  if (limit) {
    await trim(cacheName, limit);
  }
}

async function networkFirst(request, cacheName, fallbackUrl, limit) {
  try {
    const response = await fetch(request);
    await putOk(cacheName, request, response, limit);
    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (fallbackUrl) {
      const precache = await caches.open(PRECACHE);
      const offline = await precache.match(fallbackUrl);
      if (offline) {
        return offline;
      }
    }
    return Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  await putOk(cacheName, request, response);
  return response;
}

async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      void putOk(cacheName, request, response, limit);
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

async function handle(request, url) {
  const path = url.pathname;
  if (path.startsWith("/_next/static/") || path.startsWith("/icons/")) {
    return cacheFirst(request, RUNTIME);
  }
  if (path.startsWith("/api/sources")) {
    return staleWhileRevalidate(request, SOURCES, SOURCES_LIMIT);
  }
  if (request.mode === "navigate") {
    if (isDevHost()) {
      try {
        return await fetch(request);
      } catch {
        const precache = await caches.open(PRECACHE);
        return (
          (await precache.match("/offline")) ??
          new Response("オフライン", { status: 503 })
        );
      }
    }
    const cacheName = path.startsWith("/source/") ? READER : RUNTIME;
    const limit = path.startsWith("/source/") ? READER_LIMIT : undefined;
    return networkFirst(request, cacheName, "/offline", limit);
  }
  return networkFirst(request, RUNTIME);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (bypass(event.request, url)) {
    return;
  }
  event.respondWith(handle(event.request, url));
});
