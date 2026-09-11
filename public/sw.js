const VERSION = "x-idea-v6";
const PRECACHE = `${VERSION}-precache`;
const RUNTIME = `${VERSION}-runtime`;
const SOURCES = `${VERSION}-sources`;
const READER = `${VERSION}-reader`;
const READER_LIMIT = 100;
const SOURCES_LIMIT = 200;
const RUNTIME_NAV_LIMIT = 30;
const SOURCES_MAX_AGE_MS = 10 * 60 * 1000;

const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png?v=xi",
  "/icons/icon-512.png?v=xi",
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

function isFresh(response, maxAgeMs) {
  const date = Date.parse(response.headers.get("date") || "");
  if (!Number.isFinite(date)) {
    return false;
  }
  return Date.now() - date < maxAgeMs;
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

async function staleWhileRevalidate(request, cacheName, limit, maxAgeMs) {
  const cache = await caches.open(cacheName);
  let cached = await cache.match(request);
  if (cached && maxAgeMs && !isFresh(cached, maxAgeMs)) {
    cached = undefined;
  }
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
  if (path.startsWith("/api/media/") && !path.includes("/file")) {
    return cacheFirst(request, RUNTIME);
  }
  if (path.startsWith("/api/sources")) {
    if (isDevHost()) {
      return fetch(request);
    }
    return staleWhileRevalidate(
      request,
      SOURCES,
      SOURCES_LIMIT,
      SOURCES_MAX_AGE_MS,
    );
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
    const limit = path.startsWith("/source/")
      ? READER_LIMIT
      : RUNTIME_NAV_LIMIT;
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

self.addEventListener("message", (event) => {
  if (event.data === "clear-sources") {
    event.waitUntil(caches.delete(SOURCES));
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (bypass(event.request, url)) {
    return;
  }
  event.respondWith(handle(event.request, url));
});
