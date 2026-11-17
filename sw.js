// The service worker: keeps a copy of the whole app on the phone, so Homebase starts without internet.
// A new version (new VERSION here) is downloaded in the background on an online start; the app then shows
// "New version ready - Reload". Your data is in IndexedDB and is never touched by this file.

const VERSION = "1.0.2";
const CACHE = "homebase-" + VERSION;
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/db.js", "js/fmt.js", "js/kinds.js", "js/ui.js", "js/form.js", "js/quick.js",
  "js/auto.js", "js/rules.js", "js/reminders.js",
  "js/pages/home.js", "js/pages/plan.js", "js/pages/money.js", "js/pages/food.js", "js/pages/more.js",
  "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});

// The page asks the new version to take over when you tap "Reload".
self.addEventListener("message", event => {
  if (event.data === "take-over") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("homebase-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Offline first: answer from the saved copy, fall back to the network for anything else.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(hit => hit || fetch(event.request).catch(() => caches.match("index.html")))
  );
});
