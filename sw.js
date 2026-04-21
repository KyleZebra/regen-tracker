// ==========================================
// sw.js - Service Worker & Offline Cache
// ==========================================

// Ändere diese Versionsnummer bei JEDEM Update der App!
const CACHE_NAME = 'retrack-cache-v14.26';

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
event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => cache.addAll(urlsToCache))
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
        })
    );
    
    // NEU: Der Worker ist nicht mehr höflich, sondern übernimmt SOFORT 
    // die Kontrolle über deinen aktuell geöffneten Tab!
    return self.clients.claim(); 
});

self.addEventListener('fetch', event => {
event.respondWith(
fetch(event.request)
.then(response => {
if (!response || response.status !== 200 || response.type !== 'basic') {
return response;
}
const responseToCache = response.clone();
caches.open(CACHE_NAME).then(cache => {
cache.put(event.request, responseToCache);
});
return response;
})
.catch(() => {
return caches.match(event.request);
})
);
});

self.addEventListener('message', event => {
if (event.data && event.data.action === 'skipWaiting') {
self.skipWaiting();
}
});