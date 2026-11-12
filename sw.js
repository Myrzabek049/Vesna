/* Vesna — офлайн-кэш приложения */
const CACHE = 'vesna-v6';
const FILES = [
  './', 'index.html', 'css/style.css', 'css/fonts.css', 'manifest.webmanifest', 'icons/icon.svg', 'version.json',
  'js/util.js', 'js/icons.js', 'js/version.js', 'js/vendor/mp4-muxer.js', 'js/mascot.js', 'js/storage.js', 'js/presets.js', 'js/project.js',
  'js/media.js', 'js/engine.js', 'js/timeline.js', 'js/inspector.js', 'js/exporter.js', 'js/library.js', 'js/kiwi.js',
  'js/voice.js', 'js/backup.js', 'js/hub.js', 'js/mobile.js', 'js/help.js', 'js/app.js',
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
