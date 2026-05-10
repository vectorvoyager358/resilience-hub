import { getMessaging, getToken } from 'firebase/messaging';
import app from './firebase';
import { apiUrl } from '../utils/apiBase';
import { authedFetch } from '../utils/authFetch';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

function isSecureContextForPush(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator;
}

/**
 * Register the device's FCM token with the backend.
 *
 * The backend validates the token against FCM (dry-run send) and stores it in
 * `users/{uid}.fcmTokens`. The Firestore client write path for `fcmTokens` is
 * blocked by rules so the only way to add a token is via this endpoint.
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

  try {
    const response = await authedFetch(apiUrl('/api/push/register'), {
      method: 'POST',
      body: JSON.stringify({ token, timezone }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn('[push] register failed:', response.status, detail.slice(0, 200));
    }
  } catch (e) {
    console.error('[push] register request failed:', e);
  }
}
