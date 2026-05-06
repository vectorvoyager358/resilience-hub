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
  if (!uid) return;
  if (!isSecureContextForPush()) return;
  if (!('Notification' in window)) return;
  if (!VAPID_KEY) return;

  const attemptKey = `pushSetupAttempted:${uid}`;
  if (localStorage.getItem(attemptKey) === '1') return;
  localStorage.setItem(attemptKey, '1');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) return;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await upsertUserPushSettings(uid, { token, timezone });
}

