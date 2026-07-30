/**
 * Batched design inspection: every surface, desktop and mobile, in one run.
 * Needs a FRESH instance. Screenshots land in ./e2e-shots/design/.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8486';
const OUT = new URL('../e2e-shots/design/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const U = { username: 'moon', displayName: 'Moon', password: 'secret123', pin: '4242' };

await fetch(`${BASE}/api/auth/setup`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(U),
});
const login = await (await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: U.username, password: U.password }),
})).json();
const auth = { authorization: `Bearer ${login.accessToken}` };

const up = async (base, name, body) => {
  const f = new FormData();
  f.append('f', new Blob([body]), encodeURIComponent(name));
  await fetch(`${BASE}/api/files/batch?base=${encodeURIComponent(base)}`, { method: 'POST', headers: auth, body: f });
};

// A believable collection, so density and overflow get exercised honestly.
await up('projects/dashboard/src', 'Button.tsx',
  'import { useState } from "react";\n\nexport function Button({ onClick, children }) {\n  const [pressed, setPressed] = useState(false);\n  return <button onClick={onClick}>{children}</button>;\n}\n');
await up('projects/dashboard/src', 'invoices.ts',
  'export async function fetchInvoices(userId: string) {\n  return db.query("select * from invoices where user_id = $1", [userId]);\n}\n');
await up('projects/dashboard/src', 'useObservation.ts', 'export const useObservation = () => null;\n');
await up('projects/dashboard', 'README.md',
  '# Dashboard\n\nRun `npm run deploy` to push a build.\nThe Button component lives in src/.\n');
await up('projects/dashboard', 'package.json', '{ "name": "dashboard", "scripts": { "deploy": "vite build" } }');
await up('projects/dashboard', 'a-deliberately-long-filename-to-test-truncation-behaviour.config.json', '{}');
await up('notes', 'ideas.md', '- ship the invoices page\n- rewrite the Button styles\n- test minicloud search\n');
await up('notes', 'reading-list.md', '# Reading\n- Luke Howard, On the Modification of Clouds\n');
await up('media', 'sunset.jpg', new Uint8Array(Array.from({ length: 9000 }, (_, i) => i % 251)));
await up('media', 'lecture-recording.mp3', new Uint8Array(Array.from({ length: 24000 }, (_, i) => i % 253)));
await up('', 'tax-return-2025.pdf', new Uint8Array(Array.from({ length: 4000 }, (_, i) => i % 249)));

await fetch(`${BASE}/api/apps`, {
  method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'dashboard', path: 'projects/dashboard', visibility: 'public' }),
});

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });

async function tour(page, tag) {
  await page.goto(BASE);
  await page.waitForSelector('.observers');
  await page.screenshot({ path: `${OUT}${tag}-01-welcome.png` });

  await page.click('.observer');
  await page.waitForSelector('.pin-grid');
  for (const d of U.pin) await page.click(`.pin-key[aria-label="${d}"]`);
  await page.screenshot({ path: `${OUT}${tag}-02-pin.png` });

  // This browser has no device trust yet, so take the password door (which grants it).
  await page.click('button:has-text("Use password")');
  await page.fill('#pw', U.password);
  await page.click('button:has-text("Sign in")');

  await page.waitForSelector('.greeting h1', { timeout: 10000 });
  await page.screenshot({ path: `${OUT}${tag}-03-greeting.png` });

  await page.waitForSelector('.reading-figure', { timeout: 12000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}${tag}-04-home.png`, fullPage: true });

  await page.click('a[href="/files"]');
  await page.waitForSelector('.row');
  await page.hover('.row');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${tag}-05-files.png`, fullPage: true });

  await page.goto(`${BASE}/files/projects/dashboard/src`);
  await page.waitForSelector('.row');
  await page.click('.row .name');
  await page.waitForSelector('.code');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${tag}-06-viewer.png` });
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k');
  await page.waitForSelector('.palette');
  await page.fill('.cp-input', 'invoices');
  await page.waitForSelector('.cp-row');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}${tag}-07-palette.png` });
  await page.keyboard.press('Escape');

  await page.click('a[href="/launch"]');
  await page.waitForSelector('.row, .empty');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${tag}-08-launch.png`, fullPage: true });

  await page.click('a[href="/settings"]');
  await page.waitForSelector('.panel');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${tag}-09-settings.png`, fullPage: true });

  await page.goto(`${BASE}/files/notes`);
  await page.waitForSelector('.row');
  await page.screenshot({ path: `${OUT}${tag}-10-files-small.png` });
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await tour(desktop, 'desktop');

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await tour(mobile, 'mobile');

// empty-state pass on a second, untouched profile
const empty = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await empty.goto(BASE);
await empty.waitForSelector('.observers');
await empty.click('.observer-add');
await empty.waitForSelector('#un');
await empty.fill('#un', 'guest');
await empty.fill('#dn', 'Guest');
await empty.fill('#pw2', 'guest-pass');
await empty.fill('#ownerpw', U.password);
await empty.screenshot({ path: `${OUT}desktop-11-add-profile.png` });
await empty.click('button:has-text("Add profile")');
await empty.waitForSelector('.observers');
await empty.screenshot({ path: `${OUT}desktop-12-two-observers.png` });
await empty.click('.observer:nth-child(2)');
await empty.waitForSelector('#pw');
await empty.fill('#pw', 'guest-pass');
await empty.click('button:has-text("Sign in")');
await empty.waitForSelector('.reading-figure', { timeout: 12000 });
await empty.waitForTimeout(800);
await empty.screenshot({ path: `${OUT}desktop-13-home-empty.png`, fullPage: true });
await empty.click('a[href="/files"]');
await empty.waitForSelector('.empty');
await empty.screenshot({ path: `${OUT}desktop-14-files-empty.png` });

await browser.close();
console.log('design shots in e2e-shots/design/');
