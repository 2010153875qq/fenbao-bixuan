const CACHE = 'fenbao-bixuan-v5';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/data.js',
  './js/extract.js',
  './js/docx.js',
  './js/ocr.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './downloads/核对.md',
  './downloads/双峰北220kV_地基基础_会审意见_已填.docx',
  './templates/会审意见表_模板.docx',
  './vendor/jszip.min.js',
  './vendor/pdfjs/pdf.js',
  './vendor/pdfjs/pdf.worker.js',
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  './vendor/tesseract/chi_sim.traineddata.gz',
  './vendor/tesseract/eng.traineddata.gz'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      const path = url.pathname;
      const cacheable = res.ok && (path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.png') || path.endsWith('.webmanifest') || path.endsWith('.md') || path.endsWith('.txt') || path.endsWith('.docx'));
      if (cacheable) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
