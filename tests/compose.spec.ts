import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.click('header nav a[data-view="compose"]');
  await expect(page.locator('#view-compose')).toHaveClass(/active/);
});

test('can queue a post — it appears in the queue', async ({ page }) => {
  const text = `Test queued post ${Date.now()}`;
  await page.fill('#compose-commentary', text);
  // "Add to queue" is selected by default
  await page.click('#compose-submit');

  // Should redirect to queue view after submit
  await expect(page.locator('#view-queue')).toHaveClass(/active/);
  await expect(page.locator('#posts-list')).toContainText(text);

  // Clean up
  const item = page.locator('.post-item').filter({ hasText: text });
  await item.locator('button', { hasText: 'Delete' }).click();
  await expect(item).not.toBeVisible();
});

test('can schedule a post for a specific time', async ({ page }) => {
  const text = `Test scheduled post ${Date.now()}`;
  await page.fill('#compose-commentary', text);
  await page.locator('input[name="compose-when"][value="schedule"]').check();
  // Pick a datetime 1 hour from now
  const future = new Date(Date.now() + 3_600_000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
  await page.fill('#compose-datetime', local);
  await page.click('#compose-submit');

  await expect(page.locator('#view-queue')).toHaveClass(/active/);
  await expect(page.locator('#posts-list')).toContainText(text);
  await expect(page.locator('.post-item').filter({ hasText: text }).locator('.status-scheduled')).toBeVisible();

  // Clean up
  const item = page.locator('.post-item').filter({ hasText: text });
  await item.locator('button', { hasText: 'Delete' }).click();
  await expect(item).not.toBeVisible();
});

test('scheduling without picking a datetime shows an error', async ({ page }) => {
  await page.fill('#compose-commentary', 'Will not submit');
  await page.locator('input[name="compose-when"][value="schedule"]').check();
  await page.click('#compose-submit');
  await expect(page.locator('#compose-error')).toContainText('Pick a date and time');
});

test('can create a repost with source URL', async ({ page }) => {
  const text = `Test repost ${Date.now()}`;
  await page.selectOption('#compose-kind', 'repost');
  await expect(page.locator('#compose-source-row')).toBeVisible();
  await page.fill('#compose-source-url', 'https://www.linkedin.com/feed/update/urn:li:share:123');
  await page.fill('#compose-commentary', text);
  await page.click('#compose-submit');

  await expect(page.locator('#view-queue')).toHaveClass(/active/);
  await expect(page.locator('#posts-list')).toContainText(text);

  // Clean up
  const item = page.locator('.post-item').filter({ hasText: text });
  await item.locator('button', { hasText: 'Delete' }).click();
  await expect(item).not.toBeVisible();
});
