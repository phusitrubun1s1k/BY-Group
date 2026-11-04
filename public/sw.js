// No-op service worker — prevents 404 for /sw.js requests
// from browsers or extensions that probe for a service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

