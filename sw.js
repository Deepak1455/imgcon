"use strict";

const CACHE_NAME = "imgcon-shell-v5";
const APP_SHELL = [
  "./index.html",
  "./compress-image-to-20kb.html",
  "./compress-image-to-50kb.html",
  "./jpg-to-webp.html",
  "./passport-photo-maker.html",
  "./privacy-policy.html",
  "./terms-of-service.html",
  "./about.html",
  "./contact.html",
  "./sitemap.xml",
  "./robots.txt",
  "./script.js",
  "./smart-share.css",
  "./manifest.json",
  "./imgconlogo.png",
  "./imgcon-icon-192.png",
  "./imgcon-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames.filter((cacheName) => cacheName.startsWith("imgcon-") && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true })
          .then((cachedResponse) => cachedResponse || caches.match("./index.html"))),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => cachedResponse || fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })),
  );
});
