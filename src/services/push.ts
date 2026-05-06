import { getMessaging, getToken } from 'firebase/messaging';
import app from './firebase';
import { upsertUserPushSettings } from './firestore';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

function isSecureContextForPush(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator;
}

/**
 * Best-effort enablement:
 * - stores `users/{uid}.timezone`
 * - stores `users/{uid}.fcmTokens[]` (multi-device)
 */
export async function ensureWebPushEnabled(uid: string): Promise<void> {
  if (!uid) {
    console.warn('[push] skipped: missing uid');
    return;
  }
  if (!isSecureContextForPush()) {
    console.warn('[push] skipped: not a secure context or no service worker support');
    return;
  }
  if (!('Notification' in window)) {
    console.warn('[push] skipped: Notifications API not available');
    return;
  }
  if (!VAPID_KEY) {
    console.warn('[push] skipped: VITE_FIREBASE_VAPID_KEY missing in build');
    return;
  }

  const attemptKey = `pushSetupAttempted:${uid}`;
  if (localStorage.getItem(attemptKey) === '1') {
    console.warn('[push] skipped: already attempted (clear localStorage key to retry)', attemptKey);
    return;
  }
  localStorage.setItem(attemptKey, '1');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('[push] skipped: permission not granted', permission);
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);

  let token = '';
  try {
    token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch (e) {
    console.error('[push] getToken failed:', e);
    return;
  }

  if (!token) {
    console.warn('[push] getToken returned empty token');
    return;
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await upsertUserPushSettings(uid, { token, timezone });
}

