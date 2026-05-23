import { test, expect } from '@playwright/test';

// These tests need a clean (unauthenticated) browser context
test.use({ storageState: { cookies: [], origins: [] } });

test('shows login screen when not authenticated', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('wrong password shows error', async ({ page }) => {
  await page.goto('/');
  await page.fill('#login-password', 'wrongpassword');
  await page.click('#login-btn');
  await expect(page.locator('#login-error')).not.toBeEmpty();
  await expect(page.locator('#login-screen')).toBeVisible();
});

test('correct password shows app and hides login screen', async ({ page }) => {
  await page.goto('/');
  await page.fill('#login-password', process.env.TEST_PASSWORD ?? 'freaks');
  await page.click('#login-btn');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#login-screen')).toBeHidden();
});

test('sign out returns to login screen', async ({ page }) => {
  await page.goto('/');
  await page.fill('#login-password', process.env.TEST_PASSWORD ?? 'freaks');
  await page.click('#login-btn');
  await expect(page.locator('#app')).toBeVisible();
  await page.click('#logout-btn');
  await expect(page.locator('#login-screen')).toBeVisible();
});
