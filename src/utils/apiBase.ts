/**
 * Flask / Cloud Run API (`/api/*`).
 * - Empty: same-origin `/api` (Vite dev server proxies to port 5001).
 * - Set to Cloud Run origin for production, e.g. `https://your-api-xxxxx.run.app` (no trailing slash).
 */
export function apiUrl(path: string): string {
  const base = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
