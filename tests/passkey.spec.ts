import { test, expect } from '@playwright/test';

// ── API tests (no browser interaction needed) ─────────────────────────────────

test('GET /auth/passkey/available returns hasPasskey boolean', async ({ request }) => {
  const r = await request.get('/auth/passkey/available');
  expect(r.ok()).toBe(true);
  const body = await r.json();
  expect(typeof body.hasPasskey).toBe('boolean');
});

test('GET /auth/passkey/login/options returns WebAuthn challenge structure', async ({ request }) => {
  const r = await request.get('/auth/passkey/login/options');
  expect(r.ok()).toBe(true);
  const body = await r.json();
  expect(body).toHaveProperty('challenge');
  expect(body).toHaveProperty('rpId');
  expect(body).toHaveProperty('allowCredentials');
});

test.describe('unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('GET /auth/passkey/register/options requires auth', async ({ request }) => {
    const r = await request.get('/auth/passkey/register/options');
    expect(r.status()).toBe(401);
  });
});

test('GET /auth/passkey/register/options returns options when authenticated', async ({ request }) => {
  const r = await request.get('/auth/passkey/register/options');
  expect(r.ok()).toBe(true);
  const body = await r.json();
  expect(body).toHaveProperty('challenge');
  expect(body).toHaveProperty('rp');
  expect(body.rp).toHaveProperty('name', 'Bluffer');
  expect(body).toHaveProperty('user');
  expect(body).toHaveProperty('pubKeyCredParams');
});

// ── UI tests ──────────────────────────────────────────────────────────────────

test('Settings shows Security card with Register button when no passkey registered', async ({ page }) => {
  await page.goto('/');
  await page.click('header nav a[data-view="settings"]');
  await expect(page.locator('#passkey-status')).toBeVisible();
  await expect(page.locator('#register-passkey-btn')).toBeVisible();
  await expect(page.locator('#passkey-status')).toContainText('No passkey registered');
});
