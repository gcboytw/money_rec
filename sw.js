const CACHE_NAME = 'pocket-ledger-v2.3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './lib/dexie.min.js',
  './lib/chart.umd.min.js',
  './lib/lucide.min.js',
  './asset/index-icon.png',
  './asset/account-bank.svg',
  './asset/account-creditcard.svg',
  './asset/account-dollar.svg',
  './asset/categories-food.svg',
  './asset/categories-coffee.svg',
  './asset/categories-chocolate.svg',
  './asset/categories-wine.svg',
  './asset/categories-fork-and-knife-with-plate.svg',
  './asset/categories-house.svg',
  './asset/categories-traffic.svg',
  './asset/categories-motorcycle.svg',
  './asset/categories-car.svg',
  './asset/categories-camera.svg',
  './asset/categories-computer.svg',
  './asset/categories-mobilephone.svg',
  './asset/categories-wifi.svg',
  './asset/categories-palmtree.svg',
  './asset/categories-mansshirt.svg',
  './asset/categories-barber.svg',
  './asset/categories-joystick.svg',
  './asset/categories-bookmark.svg',
  './asset/categories-books.svg',
  './asset/categories-cash.svg',
  './asset/categories-family.svg',
  './asset/categories-redenvelope.svg',
  './asset/categories-hospital.svg',
  './asset/categories-pills.svg',
  './asset/categories-massage.svg',
  './asset/categories-money.svg',
  './asset/categories-worker.svg',
  './asset/categories-coin.svg',
  './asset/categories-increasing.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});
