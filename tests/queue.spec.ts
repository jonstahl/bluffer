import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#view-queue')).toHaveClass(/active/);
});

test('Queue subtab is active by default', async ({ page }) => {
  await expect(page.locator('.subtab[data-subtab="active"]')).toHaveClass(/active/);
  await expect(page.locator('#filter-status')).toBeVisible();
});

test('History subtab hides the filter dropdown', async ({ page }) => {
  await page.click('.subtab[data-subtab="history"]');
  await expect(page.locator('.subtab[data-subtab="history"]')).toHaveClass(/active/);
  await expect(page.locator('#filter-status')).toHaveCSS('visibility', 'hidden');
});

test('switching back to Queue subtab shows the filter again', async ({ page }) => {
  await page.click('.subtab[data-subtab="history"]');
  await page.click('.subtab[data-subtab="active"]');
  await expect(page.locator('#filter-status')).toHaveCSS('visibility', 'visible');
});

test('Queue tab does not show published posts', async ({ page }) => {
  // Published posts should only be in History
  const publishedBadges = page.locator('#posts-list .status-published');
  await expect(publishedBadges).toHaveCount(0);
});

test('History tab does not show queued or draft posts', async ({ page }) => {
  await page.click('.subtab[data-subtab="history"]');
  await expect(page.locator('#posts-list .status-queued')).toHaveCount(0);
  await expect(page.locator('#posts-list .status-draft')).toHaveCount(0);
  await expect(page.locator('#posts-list .status-scheduled')).toHaveCount(0);
});

test('filter by Queued hides draft posts', async ({ page }) => {
  // Create a draft post first so there is something to filter
  await page.click('header nav a[data-view="compose"]');
  const text = `Filter test draft ${Date.now()}`;
  await page.fill('#compose-commentary', text);
  await page.click('#compose-submit');

  await page.selectOption('#filter-status', 'queued');
  await expect(page.locator('#posts-list')).not.toContainText(text);

  // Clean up
  await page.selectOption('#filter-status', '');
  const item = page.locator('.post-item').filter({ hasText: text });
  await item.locator('button', { hasText: 'Delete' }).click();
});

test('refresh button reloads posts', async ({ page }) => {
  await page.click('#refresh-btn');
  await expect(page.locator('#posts-list')).not.toContainText('Loading');
});
