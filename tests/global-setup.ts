import { chromium } from '@playwright/test';
import * as path from 'path';

export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:3000');
  await page.fill('#login-password', process.env.TEST_PASSWORD ?? 'freaks');
  await page.click('#login-btn');
  await page.waitForSelector('header h1');

  await page.context().storageState({ path: path.join(__dirname, '.auth.json') });
  await browser.close();
}
