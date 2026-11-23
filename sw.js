// sw.js - service worker: makes StudentOS work offline and installable.
// Strategy: NETWORK-FIRST for same-origin GET requests, falling back to the cache when offline.
// Network-first means you always get your newest code when online (no stale-cache surprises during development);
// the cache is only a safety net. Bump CACHE_VERSION when you want to discard old cached files.
// All user DATA lives in IndexedDB, which the service worker never touches.

const CACHE_VERSION = "studentos-v1.1.0";
const PRECACHE = [
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "js/app.js",
  "js/components.js",
  "js/services.js",
  "js/state.js",
  "js/storage.js",
  "js/ui.js",
  "js/utils.js",
  "js/logic/assessments.js",
  "js/logic/attendance.js",
  "js/logic/backup.js",
  "js/logic/calendar.js",
  "js/logic/deadlines.js",
  "js/logic/grades.js",
  "js/logic/ics.js",
  "js/logic/notifications.js",
  "js/logic/planner.js",
  "js/logic/reports.js",
  "js/logic/resources.js",
  "js/logic/semesters.js",
  "js/logic/timetable.js",
  "js/views/assignments.js",
  "js/views/calendar.js",
  "js/views/courses.js",
  "js/views/dashboard.js",
  "js/views/exams.js",
  "js/views/history.js",
  "js/views/notifications.js",
  "js/views/planner.js",
  "js/views/reports.js",
  "js/views/resources.js",
  "js/views/semesters.js",
  "js/views/settings.js",
  "js/views/timetable.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
  );
});
