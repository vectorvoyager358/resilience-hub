import { auth } from '../services/firebase';

/**
 * Wraps `fetch` with the current Firebase user's ID token in the Authorization
 * header. Throws if no user is signed in. Use for any `/api/*` route that
 * requires `verify_bearer_uid`.
 */
export async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('not signed in');
  }
  const idToken = await currentUser.getIdToken();
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type') && init?.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${idToken}`);
  return fetch(url, { ...init, headers });
}
