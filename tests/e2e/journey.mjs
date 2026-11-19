import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
// End-to-end guest journey in a real browser. Start the app first (npm run build && npm start),
// ideally with AUTO_ADVANCE_SECONDS=4 so statuses move quickly, then: npm run e2e
const BASE = process.env.BASE ?? 'http://localhost:3000';
const shots = process.env.SHOTS_DIR ?? 'test-results/screenshots';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (n, full = true) => page.screenshot({ path: `${shots}/${n}.png`, fullPage: full });

await page.goto(BASE);
await page.waitForSelector('.hero');
await shot('01-home');
await page.getByRole('button', { name: 'Check availability' }).click();
await page.waitForSelector('.result');
await shot('02-rooms');
await page.locator('.result', { hasText: 'Sea View Premier' }).getByRole('link', { name: 'Select' }).click();
await page.getByLabel('First name').fill('Aisha');
await page.getByLabel('Last name').fill('Khan');
await page.getByLabel('Email').fill('aisha@example.com');
await page.getByLabel('Mobile number').fill('+971 50 123 4567');
await page.getByLabel('Name on card').fill('Aisha Khan');
await page.getByLabel('Card number').fill('4242424242424242');
await page.getByLabel('Expiry').fill('1229');
await page.getByLabel('Security code').fill('123');
await page.getByRole('checkbox').check();
await shot('03-book');
await page.getByRole('button', { name: /Confirm booking/ }).click();
await page.waitForSelector('.reference');
await shot('04-confirmation');
const code = await page.locator('.reference').innerText();
await page.getByRole('link', { name: 'Check in online' }).first().click();
await page.getByLabel('Nationality').fill('India');
await page.getByLabel('Document number').fill('Z1234567');
await page.getByRole('checkbox').check();
await page.getByRole('button', { name: 'Check in', exact: true }).click();
await page.waitForSelector('.keycard');
await shot('05-checked-in');
const stayLink = await page.getByRole('link', { name: 'Open my stay' }).getAttribute('href');

// In-stay app on a phone
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + stayLink);
await page.waitForSelector('.keycard');
await shot('06-stay-home');
await page.getByRole('link', { name: 'In-room dining' }).click();
await page.waitForSelector('.menu-item');
await page.getByRole('button', { name: 'Add one Shakshuka' }).click();
await page.getByRole('button', { name: 'Add one Shakshuka' }).click();
await page.getByRole('button', { name: 'Add one Karak chai' }).click();
await shot('07-dining-cart', false);
await page.getByRole('button', { name: 'Place order' }).click();
await page.waitForSelector('.request');
await shot('08-order-placed');
await page.getByRole('link', { name: 'Back to home' }).click();
await page.waitForTimeout(5000);
await shot('09-home-in-progress');

await page.goto(BASE + stayLink + '/spa');
await page.getByText('Swedish massage').click();
await page.waitForSelector('.slot');
const firstFree = page.locator('.slot:not([disabled])').first();
await firstFree.click();
await shot('10-spa');
await page.getByRole('button', { name: 'Book treatment' }).click();
await page.waitForSelector('.request');

await page.goto(BASE + stayLink + '/laundry');
await page.waitForSelector('.menu-item');
await page.getByRole('button', { name: 'Add one Shirt' }).click();
await page.getByLabel(/Express/).check();
await page.getByRole('button', { name: 'Request pickup' }).click();
await page.waitForSelector('.request');

await page.goto(BASE + stayLink + '/transfer');
await page.waitForSelector('.choice');
await page.getByLabel('Flight number').fill('EK 203');
await shot('11-transfer');
await page.getByRole('button', { name: /Book transfer/ }).click();
await page.waitForSelector('.request');
await shot('11b-transfer-booked');

await page.goto(BASE + stayLink + '/maintenance');
await page.getByText('Air conditioning').click();
await page.getByLabel('What is happening?').fill('Blowing warm air');
await page.getByRole('button', { name: 'Report issue' }).click();
await page.waitForSelector('.request');

await page.goto(BASE + stayLink + '/info');
await page.waitForSelector('.wifi');
await shot('12-info');
await page.goto(BASE + stayLink + '/bill');
await page.waitForSelector('.bill-lines');
await shot('13-bill');
await page.goto(BASE + stayLink + '/requests');
await page.waitForSelector('.request');
await shot('14-requests');
await page.goto(BASE + stayLink + '/checkout');
await page.waitForSelector('.bill-total');
await shot('15-checkout');
await page.getByRole('button', { name: /check out/i }).last().click();
await page.waitForSelector('text=Download invoice');
await page.getByRole('button', { name: '5 out of 5' }).click();
await shot('16-thanks');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Download invoice/ }).click()]);
await dl.saveAs(`${shots}/invoice.pdf`);
await page.getByRole('button', { name: 'Send feedback' }).click();
await page.waitForSelector('text=Thanks for your feedback');

// Manage booking + mobile home
await page.goto(BASE + '/');
await shot('17-home-mobile');
console.log(JSON.stringify({ code, stayLink, errors }, null, 1));
if (errors.length) process.exitCode = 1;
await browser.close();
