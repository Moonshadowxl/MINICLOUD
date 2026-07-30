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
await page.waitForSelector('.reading-figure', { timeout: 8000 });
check('station reading rendered', true);
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

console.log('search: command palette');
await page.goto(`${BASE}/`);
await page.waitForSelector('.reading-figure');
await page.keyboard.press('Control+k');
await page.waitForSelector('.palette');
check('⌘K opens the palette', true);
await page.fill('.cp-input', 'minicloud');
await page.waitForSelector('.cp-row', { timeout: 8000 });
check('content search finds a phrase inside a file',
  (await page.locator('.cp-row', { hasText: 'ideas.md' }).count()) > 0);
check('the matched span is highlighted', (await page.locator('.cp-snippet mark').count()) > 0);
await page.screenshot({ path: OUT + '10-palette.png' });
await page.keyboard.press('Enter');
await page.waitForSelector('.modal', { timeout: 8000 });
check('enter jumps straight to the file', (await page.locator('.modal h3').textContent()).includes('ideas.md'));
await page.screenshot({ path: OUT + '11-palette-jump.png' });
await page.keyboard.press('Escape');

console.log('zip of a folder holding an empty file (used to kill the server)');
await upload('projects/site', '.gitkeep', '');
const siteId = (await fetch(`${BASE}/api/files/stat?path=${encodeURIComponent('projects/site')}`, {
  headers: { cookie: cookieHeader },
}).then((r) => r.json())).file.id;
const zipRes = await fetch(`${BASE}/api/files/${siteId}/zip`, { headers: { cookie: cookieHeader } });
const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
check('zip streams instead of crashing', zipRes.status === 200 && zipBytes[0] === 0x50 && zipBytes[1] === 0x4b);
check('server still alive after the zip', (await fetch(`${BASE}/api/health`)).ok);

console.log('profile picker + PIN unlock');
await page.goto(BASE);
await page.click('button:has-text("Switch user")');
await page.waitForSelector('.observers');
await page.screenshot({ path: OUT + '06-welcome.png' });
await page.click('.observer');
await page.waitForSelector('.pin-grid');
await page.screenshot({ path: OUT + '07-pin.png' });
for (const d of USER.pin) await page.click(`.pin-key[aria-label="${d}"]`);
check('a 4-digit PIN is not auto-submitted', (await page.locator('.greeting h1').count()) === 0);
await page.click('.pin-key[aria-label="confirm PIN"]');
await page.locator('.greeting h1').waitFor({ timeout: 8000 });
check('PIN unlock works from the pad', true);

console.log('wrong-PIN shake');
await page.waitForSelector('.reading-figure');
await page.click('button:has-text("Switch user")');
await page.click('.observer');
await page.waitForSelector('.pin-grid');
for (const d of '9999') await page.click(`.pin-key[aria-label="${d}"]`);
await page.click('.pin-key[aria-label="confirm PIN"]');
await page.waitForSelector('.pin-dots.error', { timeout: 8000 });
check('wrong PIN triggers error state', true);
await page.screenshot({ path: OUT + '08-pin-error.png' });

console.log('add a profile from the welcome screen');
await page.click('button:has-text("Back")');
await page.waitForSelector('.observers');
await page.click('.observer-add');
await page.waitForSelector('#un');
await page.fill('#un', 'friend');
await page.fill('#dn', 'Friend');
await page.fill('#pw2', 'friend-pass');
await page.fill('#ownerpw', USER.password);
await page.screenshot({ path: OUT + '12-add-profile.png' });
await page.click('button:has-text("Add profile")');
await page.waitForSelector('.observers', { timeout: 8000 });
check('a second profile can actually be created',
  (await page.locator('.observer-name', { hasText: 'Friend' }).count()) === 1);
await page.screenshot({ path: OUT + '13-two-profiles.png' });

console.log('mobile viewport');
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(BASE);
await mobile.waitForSelector('.observers');
await mobile.screenshot({ path: OUT + '09-mobile.png' });
check('mobile welcome renders', true);

await browser.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} — screenshots in e2e-shots/`);
process.exit(failures === 0 ? 0 : 1);
