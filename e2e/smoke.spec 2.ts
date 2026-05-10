import { test, expect } from '@playwright/test';

test('home loads under GitHub Pages subpath', async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await expect(page).toHaveTitle(/Resilience Hub/i);
  // Welcome screen has "Resilience Hub" and sign in CTA.
  await expect(page.getByRole('heading', { name: /resilience hub/i })).toBeVisible();
});

test('unauthenticated dashboard route redirects to login (or home)', async ({ page, baseURL }) => {
  // Direct navigation to /dashboard should not show dashboard content when logged out.
  await page.goto(new URL('dashboard', baseURL!).toString());

  // We expect to land on login or welcome route; both are acceptable for now.
  await expect(page).toHaveURL(/\/(login)?$/);
  await expect(page.getByRole('heading', { name: /resilience hub/i })).toBeVisible();
});

