/**
 * Browser-side end-to-end check for MiniCloud.
 *
 * Drives a real Chromium through: first-run setup -> greeting -> dashboard ->
 * uploads -> code viewer -> serve (public + private 401) -> profile picker ->
 * PIN unlock -> mobile viewport. Screenshots land in ./e2e-shots/.
 *
 * Run it against a FRESH instance (empty data dir):
 *   MINICLOUD_DATA_DIR=/tmp/mc-e2e npm start          # terminal 1
 *   node scripts/e2e-browser.mjs                      # terminal 2
 *
 * Env: BASE (default http://localhost:8484), PW_CHROMIUM (path to a chromium
 * binary if Playwright's default download isn't present).
 * Needs: npm i -D @playwright/test (root), and a chromium for it to launch.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8484';
const OUT = new URL('../e2e-shots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const USER = { username: 'e2e-owner', displayName: 'E2E', password: 'e2e-pass-1', pin: '4242' };

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${name}`);
  if (!ok) failures++;
};

const profiles = await fetch(`${BASE}/api/auth/profiles`).then((r) => r.json());
if (!profiles.setupNeeded) {
  console.error('This script needs a FRESH instance (no users yet). Point MINICLOUD_DATA_DIR at an empty dir.');
  process.exit(2);
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 1380, height: 860 } });

console.log('setup + greeting');
await page.goto(BASE);
await page.fill('#un', USER.username);
await page.fill('#dn', USER.displayName);
await page.fill('#pw2', USER.password);
await page.fill('#pin', USER.pin);
await page.screenshot({ path: OUT + '01-setup.png' });
await page.click('button:has-text("Create owner profile")');
const greeting = page.locator('.greeting h1');
await greeting.waitFor({ timeout: 8000 });
check('greeting splash shows the display name', (await greeting.textContent()).includes(USER.displayName));
await page.screenshot({ path: OUT + '02-greeting.png' });

console.log('dashboard');
await page.waitForSelector('.usage-figure', { timeout: 8000 });
check('usage hero rendered', true);
await page.screenshot({ path: OUT + '03-home.png' });

console.log('uploads (via API, same endpoints the drag-drop uses)');
const cookieHeader = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
async function upload(base, name, content, type = 'text/plain') {
  const form = new FormData();
  form.append('f', new Blob([content], { type }), encodeURIComponent(name));
  const res = await fetch(`${BASE}/api/files/batch?base=${encodeURIComponent(base)}`, {
    method: 'POST', headers: { cookie: cookieHeader }, body: form,
  });
  return res.ok;
}
check('batch upload', await upload('projects/site', 'index.html', '<h1>hello from e2e</h1>'));
await upload('notes', 'ideas.md', '# ideas\n- test minicloud');

console.log('files + code viewer');
await page.click('a:has-text("Files")');
await page.waitForSelector('.row');
await page.screenshot({ path: OUT + '04-files.png' });
await page.goto(`${BASE}/files/projects/site`);
await page.click('.row .name >> text=index.html');
await page.waitForSelector('.code');
check('code viewer opens with line numbers', (await page.locator('.code .ln').count()) > 0);
await page.screenshot({ path: OUT + '05-viewer.png' });
await page.keyboard.press('Escape');

console.log('serve: private 401, public 200');
await fetch(`${BASE}/api/apps`, {
  method: 'POST',
  headers: { cookie: cookieHeader, 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'e2e-site', path: 'projects/site', visibility: 'private' }),
});
check('private serve rejects anonymous', (await fetch(`${BASE}/s/e2e-site/`)).status === 401);
const appId = (await fetch(`${BASE}/api/apps`, { headers: { cookie: cookieHeader } }).then((r) => r.json()))
  .apps.find((a) => a.name === 'e2e-site').id;
await fetch(`${BASE}/api/apps/${appId}`, {
  method: 'PATCH',
  headers: { cookie: cookieHeader, 'content-type': 'application/json' },
  body: JSON.stringify({ visibility: 'public' }),
});
const pub = await fetch(`${BASE}/s/e2e-site/`);
check('public serve loads', pub.status === 200 && (await pub.text()).includes('hello from e2e'));

console.log('profile picker + PIN unlock');
await page.goto(BASE);
await page.click('button:has-text("Switch user")');
await page.waitForSelector('.profiles');
await page.screenshot({ path: OUT + '06-welcome.png' });
await page.click('.profile');
await page.waitForSelector('.pin-grid');
await page.screenshot({ path: OUT + '07-pin.png' });
for (const d of USER.pin) await page.click(`.pin-key:has-text("${d}")`);
await page.locator('.greeting h1').waitFor({ timeout: 8000 });
check('PIN unlock works from the pad', true);

console.log('wrong-PIN shake');
await page.waitForSelector('.usage-figure');
await page.click('button:has-text("Switch user")');
await page.click('.profile');
await page.waitForSelector('.pin-grid');
for (const d of '9999') await page.click(`.pin-key:has-text("${d}")`);
await page.waitForSelector('.pin-dots.error', { timeout: 8000 });
check('wrong PIN triggers error state', true);
await page.screenshot({ path: OUT + '08-pin-error.png' });

console.log('mobile viewport');
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(BASE);
await mobile.waitForSelector('.profiles');
await mobile.screenshot({ path: OUT + '09-mobile.png' });
check('mobile welcome renders', true);

await browser.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} — screenshots in e2e-shots/`);
process.exit(failures === 0 ? 0 : 1);
