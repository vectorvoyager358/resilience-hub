import { apiUrl } from '../utils/apiBase';
import { authedFetch } from '../utils/authFetch';

/** POST JSON to an `/api/*` path with the current user's ID token. */
export async function authedPost(path: string, body: unknown, init?: RequestInit): Promise<Response> {
  return authedFetch(apiUrl(path), {
    ...init,
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** POST JSON; throws on non-OK or invalid JSON. */
export async function authedPostJsonOrThrow<T>(path: string, body: unknown): Promise<T> {
  const res = await authedPost(path, body);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as T;
}

/**
 * Best-effort POST: never throws for HTTP/network; use when the caller should
 * continue if the backend is unavailable.
 */
export async function authedPostJsonOptional<T extends Record<string, unknown>>(
  path: string,
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
  try {
    const res = await authedPost(path, body);
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, detail: text.slice(0, 280) };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, status: res.status, detail: 'invalid JSON' };
    }
  } catch (e) {
    return { ok: false, status: 0, detail: String(e) };
  }
}
