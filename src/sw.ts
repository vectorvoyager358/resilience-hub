/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NavigationRoute } from 'workbox-routing';

import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    url: string;
    revision: string | null;
  }>;
};

clientsClaim();
cleanupOutdatedCaches();

// Precache Vite build assets.
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback for deep links (e.g. /profile) on GitHub Pages.
// Serve the precached app shell (index.html) for navigations.
registerRoute(new NavigationRoute(createHandlerBoundToURL(import.meta.env.BASE_URL + 'index.html')));

// ---- FCM background notifications ----
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

try {
  const app = initializeApp(firebaseConfig);
  const messaging = getMessaging(app);

  onBackgroundMessage(messaging, (payload) => {
    const title =
      payload.notification?.title ??
      payload.data?.title ??
      'Resilience Hub reminder';

    const body =
      payload.notification?.body ??
      payload.data?.body ??
      'You have pending challenges to log today.';

    const url = payload.data?.url ?? '/dashboard';

    self.registration.showNotification(title, {
      body,
      data: { url },
    });
  });
} catch (e) {
  // If messaging config is incomplete, the app should still function.
  // Background push just won't be available.
  console.warn('Service worker FCM init failed:', e);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data as { url?: string } | undefined)?.url ?? '/dashboard';
  const base = import.meta.env.BASE_URL || '/';

  // GitHub Pages serves the app under a subpath (BASE_URL), so normalize clicks
  // to open within the app base.
  const normalizedPath = (() => {
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    const trimmedBase = base.endsWith('/') ? base : `${base}/`;
    const trimmedPath = rawUrl.startsWith('/') ? rawUrl.slice(1) : rawUrl;
    return `${trimmedBase}${trimmedPath}`;
  })();
  const absoluteUrl = new URL(normalizedPath, self.location.origin).toString();

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ('focus' in client) {
          await (client as WindowClient).focus();
          (client as WindowClient).navigate(absoluteUrl);
          return;
        }
      }

      await self.clients.openWindow(absoluteUrl);
    })()
  );
});

