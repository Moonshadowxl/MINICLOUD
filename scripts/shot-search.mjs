/** Quick visual check of the command palette. Run against a fresh instance. */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8486';
const OUT = new URL('../e2e-shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const U = { username: 'moon', displayName: 'Moon', password: 'secret123', pin: '4242' };
await fetch(`${BASE}/api/auth/setup`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(U),
});
const login = await (await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: U.username, password: U.password }),
})).json();
const auth = { authorization: `Bearer ${login.accessToken}` };

const up = async (base, name, body) => {
  const f = new FormData();
  f.append('f', new Blob([body]), encodeURIComponent(name));
  await fetch(`${BASE}/api/files/batch?base=${encodeURIComponent(base)}`, { method: 'POST', headers: auth, body: f });
};

await up('projects/dashboard/src', 'Button.tsx',
  'import { useState } from "react";\n\nexport function Button({ onClick, children }) {\n  const [pressed, setPressed] = useState(false);\n  return <button onClick={onClick}>{children}</button>;\n}\n');
await up('projects/dashboard/src', 'invoices.ts',
  'export async function fetchInvoices(userId: string) {\n  return db.query("select * from invoices where user_id = $1", [userId]);\n}\n');
await up('projects/dashboard', 'README.md',
  '# Dashboard\n\nRun `npm run deploy` to push a build.\nThe Button component lives in src/.\n');
await up('projects/dashboard', 'package.json', '{ "name": "dashboard", "scripts": { "deploy": "vite build" } }');
await up('notes', 'ideas.md', '- ship the invoices page\n- rewrite the Button styles\n');
await up('photos', 'sunset.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });
await page.goto(BASE);
await page.click('.profile');
// this browser has no device trust yet, so take the password door (which grants it)
await page.click('button:has-text("Use password")');
await page.fill('#pw', U.password);
await page.click('button:has-text("Sign in")');
await page.waitForSelector('.usage-figure', { timeout: 12000 });

await page.keyboard.press('Control+k');
await page.waitForSelector('.palette');
await page.screenshot({ path: `${OUT}10-palette-empty.png` });

await page.fill('.cp-input', 'button');
await page.waitForSelector('.cp-row');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}11-palette-results.png` });

await page.fill('.cp-input', 'invoices');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}12-palette-content-match.png` });

await page.keyboard.press('ArrowDown');
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}13-palette-keynav.png` });

await page.keyboard.press('Enter');
await page.waitForSelector('.modal', { timeout: 8000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}14-jumped-to-file.png` });

await page.keyboard.press('Escape');
await page.click('a:has-text("Settings")');
await page.waitForSelector('.panel');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}16-settings.png`, fullPage: true });

await page.click('a:has-text("Files")');
await page.waitForSelector('.row');
await page.hover('.row');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}17-files-hover.png` });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(BASE);
await mobile.waitForSelector('.profiles');
await mobile.click('.profile');
await mobile.waitForSelector('.pin-grid');
await mobile.screenshot({ path: `${OUT}15-mobile-pin.png` });

await browser.close();
console.log('shots written to e2e-shots/');
