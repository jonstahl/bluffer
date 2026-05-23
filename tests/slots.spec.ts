import { test, expect } from '@playwright/test';

const TEST_TIME = '22:22';

// Safety net: delete any leftover test slots even if a test failed mid-way
test.afterAll(async ({ request }) => {
  const r = await request.get('/api/slots');
  if (!r.ok()) return;
  const slots = await r.json() as { id: number; time_local: string }[];
  await Promise.all(
    slots.filter(s => s.time_local === TEST_TIME)
      .map(s => request.delete(`/api/slots/${s.id}`))
  );
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.click('header nav a[data-view="slots"]');
  await expect(page.locator('#view-slots')).toHaveClass(/active/);
});

test('slots page loads and shows the add form', async ({ page }) => {
  await expect(page.locator('#slot-add-btn')).toBeVisible();
  await expect(page.locator('#slot-time')).toBeVisible();
});

test('add slot requires at least one day selected', async ({ page }) => {
  // Make sure no days are checked
  await page.click('#slot-days-none');
  await page.fill('#slot-time', '10:00');
  await page.click('#slot-add-btn');
  await expect(page.locator('#slot-error')).toContainText('Pick at least one day');
});

test('can add and remove a slot', async ({ page }) => {
  const time = TEST_TIME;

  // Add a slot for Wednesday at 14:30
  await page.click('#slot-days-none');
  await page.locator('#slot-days label').filter({ hasText: 'Wed' }).click();
  await page.fill('#slot-time', time);
  await page.click('#slot-add-btn');

  // Should appear in the list
  await expect(page.locator('#slots-list')).toContainText('Wed');
  await expect(page.locator('#slots-list')).toContainText(time);

  // Remove it
  const slot = page.locator('.slot-item').filter({ hasText: time });
  await slot.locator('button', { hasText: 'Remove' }).click();
  await expect(slot).not.toBeVisible();
});

test('All shortcut selects all days', async ({ page }) => {
  await page.click('#slot-days-all');
  const checkboxes = page.locator('#slot-days input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await expect(checkboxes.nth(i)).toBeChecked();
  }
});

test('Weekdays shortcut selects Mon–Fri only', async ({ page }) => {
  await page.click('#slot-days-weekdays');
  await expect(page.locator('#slot-days input[value="0"]')).not.toBeChecked(); // Sun
  await expect(page.locator('#slot-days input[value="1"]')).toBeChecked();     // Mon
  await expect(page.locator('#slot-days input[value="5"]')).toBeChecked();     // Fri
  await expect(page.locator('#slot-days input[value="6"]')).not.toBeChecked(); // Sat
});

test('None shortcut deselects all days', async ({ page }) => {
  await page.click('#slot-days-all');
  await page.click('#slot-days-none');
  const checkboxes = page.locator('#slot-days input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i++) {
    await expect(checkboxes.nth(i)).not.toBeChecked();
  }
});
