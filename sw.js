// ==========================================
// sw.js - Service Worker & Offline Cache
// ==========================================

const CACHE_NAME = 'retrack-cache-v53';

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
    './icon-192x192.png',
    './icon-512x512.png'
];

self.addEventListener('install', event => {
    // FIX V21.1: self.skipWaiting() entfernt! Der Worker wartet nun auf Nutzer-Bestätigung.
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // NEU: Zwingt den Browser, absolut frische Dateien vom Server zu holen 
            // und ignoriert den veralteten HTTP-Zwischenspeicher!
            return Promise.all(urlsToCache.map(url => {
                return fetch(new Request(url, { cache: 'reload' }))
                    .then(response => {
                        if (response.ok) {
                            return cache.put(url, response);
                        }
                    });
            }));
        })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// NEU: "Cache-First" Strategie. Super schnell, offline-sicher 
// und immer exakt synchron mit dem Cache-Namen!
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request);
        })
    );
});
// NEU V21.1: Nachrichten-Empfänger wartet auf Klick im Banner
self.addEventListener('message', event => {
    if (event.data && event.data.action === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});