import { describe, expect, it, vi } from 'vitest';

async function withInjectedBase(base: string | undefined, fn: () => Promise<void>) {
  const g = globalThis as unknown as { __VITE_API_BASE_URL__?: unknown };
  const prev = g.__VITE_API_BASE_URL__;
  g.__VITE_API_BASE_URL__ = base;
  try {
    await fn();
  } finally {
    g.__VITE_API_BASE_URL__ = prev;
  }
}

describe('apiUrl', () => {
  it('returns same-origin path when base is empty', async () => {
    vi.resetModules();
    await withInjectedBase('', async () => {
      const mod = await import('./apiBase');
      expect(mod.apiUrl('/api/test')).toBe('/api/test');
    });
  });

  it('prefixes base URL and trims trailing slash', async () => {
    vi.resetModules();
    await withInjectedBase('https://example.run.app/', async () => {
      const mod = await import('./apiBase');
      expect(mod.apiUrl('/api/test')).toBe('https://example.run.app/api/test');
    });
  });

  it('adds leading slash to path when missing', async () => {
    vi.resetModules();
    await withInjectedBase('https://example.run.app', async () => {
      const mod = await import('./apiBase');
      expect(mod.apiUrl('api/test')).toBe('https://example.run.app/api/test');
    });
  });
});

