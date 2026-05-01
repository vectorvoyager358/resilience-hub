/**
 * Flask / Cloud Run API (`/api/*`).
 * - Empty: same-origin `/api` (Vite dev server proxies to port 5001).
 * - Set to Cloud Run origin for production, e.g. `https://your-api-xxxxx.run.app` (no trailing slash).
 */
export function apiUrl(path: string): string {
  // For unit tests we allow overriding via globalThis without relying on `import.meta.env` mutation.
  const injected = (globalThis as unknown as { __VITE_API_BASE_URL__?: unknown }).__VITE_API_BASE_URL__;
  const envBase = injected ?? import.meta.env.VITE_API_BASE_URL;
  const base = String(envBase ?? '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
