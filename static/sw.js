const CACHE_NAME = 'mosquito-yolo-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/static/manifest.json',
  '/static/icon.png',
  '/static/css/style.css',
  '/static/js/app.js'
];

// Installs assets into cache on lifecycle setup
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Cleans up old cache variants during structural updates
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Intercepts connection hooks to pull UI structure locally
self.addEventListener('fetch', (event) => {
  // Ignore API requests to prediction endpoint so it never attempts to read it from cache
  if (event.request.url.includes('/predict')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});