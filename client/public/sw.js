if (self.location.hostname === "www.talkietiv.com") {
  // If we are on www.talkietiv.com, we want to self-destruct this service worker
  // and redirect any active clients to the canonical talkietiv.com origin.
  self.addEventListener("install", (event) => {
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.matchAll({ type: "window" }))
        .then((clients) => {
          clients.forEach((client) => {
            if (client.url) {
              const url = new URL(client.url);
              url.hostname = "talkietiv.com";
              client.navigate(url.toString());
            }
          });
        })
    );
  });
} else {
  // Standard service worker code
  const CACHE_NAME = "talkietiv-v2";
  const ASSETS = ["/", "/manifest.webmanifest", "/talkitiv-logo.png"];

  self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
    );
    self.clients.claim();
  });

  self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((res) => res || caches.match("/"))));
  });
}
