// ==========================================
// sw.js - Service Worker & Offline Cache
// ==========================================

// Ändere diese Versionsnummer bei JEDEM Update der App!
const CACHE_NAME = 'retrack-cache-v14.0';

// Alle Dateien, die für den Offline-Betrieb benötigt werden
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './data.js',
  './engine.js',
  './ui.js',
  './modals.js',
  './utils.js',
  './manifest.json',
  './icon-192x192.png'
  './icon-512x512.png'
];

// 1. Install-Event: Cacht alle benötigten Dateien
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache geöffnet');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. Activate-Event: Löscht alte Caches aufgewerteter Versionen
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Alter Cache gelöscht', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. Fetch-Event: Liefert Dateien aus dem Cache (Offline-Support)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache-Hit: Gib die Datei aus dem Cache zurück
        if (response) {
          return response;
        }
        // Kein Cache-Hit: Hole die Datei aus dem Netzwerk
        return fetch(event.request);
      })
  );
});

// 4. Message-Event: Erlaubt das sofortige Aktivieren eines neuen Updates (PWA Update Banner)
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});