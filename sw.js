/* Vesna — офлайн-кэш приложения */
const CACHE = 'vesna-v4';
const FILES = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/util.js', 'js/mascot.js', 'js/storage.js', 'js/presets.js', 'js/project.js', 'js/media.js',
  'js/engine.js', 'js/timeline.js', 'js/inspector.js', 'js/exporter.js', 'js/hub.js', 'js/help.js', 'js/app.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// сначала сеть, при отсутствии — кэш (так обновления приходят сразу)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
