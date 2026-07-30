#!/usr/bin/env node
/**
 * MiniCloud sync agent — keeps local folders synced to your MiniCloud.
 *
 *   minicloud-agent init                one-time setup (server URL, folders, interval)
 *   minicloud-agent login               sign in; marks this device as trusted
 *   minicloud-agent sync                run one sync pass now
 *   minicloud-agent watch               run forever: sync every N minutes (+ on file changes)
 *   minicloud-agent status              show config, last sync, journal backlog
 *   minicloud-agent hosts               print .mini hosts entries for your served apps
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Client } from './api.js';
import { configDir, loadConfig, saveConfig, statePathFor, type AgentConfig } from './config.js';
import { deviceName, syncPair } from './sync.js';

const log = (s: string) => console.log(s);

async function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(q)).trim();
  } finally {
    rl.close();
  }
}

/**
 * Prompt for a secret without echoing it. Reads raw keystrokes so nothing lands
 * in the terminal (or its scrollback); Ctrl-C and Ctrl-D still behave normally.
 */
async function askHidden(q: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) return ask(q); // piped input: nothing to hide it from

  stdout.write(q);
  const previouslyRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();

  try {
    return await new Promise<string>((resolve, reject) => {
      let buf = '';
      const onData = (chunk: Buffer) => {
        for (const byte of chunk) {
          switch (byte) {
            case 0x03: // Ctrl-C
              stdin.off('data', onData);
              stdout.write('\n');
              return reject(new Error('cancelled'));
            case 0x04: // Ctrl-D
            case 0x0a: // \n
            case 0x0d: // \r
              stdin.off('data', onData);
              stdout.write('\n');
              return resolve(buf.trim());
            case 0x7f: // backspace
            case 0x08:
              buf = buf.slice(0, -1);
              break;
            default:
              if (byte >= 0x20) buf += String.fromCharCode(byte);
          }
        }
      };
      stdin.on('data', onData);
    });
  } finally {
    stdin.setRawMode(previouslyRaw);
    stdin.pause();
  }
}

function requireConfig(): AgentConfig {
  const config = loadConfig();
  if (!config) {
    console.error('No config yet — run: minicloud-agent init');
    process.exit(1);
  }
  return config;
}

async function cmdInit(): Promise<void> {
  const existing = loadConfig();
  const server = (await ask(`Server URL [${existing?.server ?? 'http://localhost:8484'}]: `)) || existing?.server || 'http://localhost:8484';
  const username = (await ask(`Username [${existing?.username ?? ''}]: `)) || existing?.username || '';
  const interval = Number((await ask(`Sync every how many minutes? [${existing?.intervalMinutes ?? 30}]: `)) || existing?.intervalMinutes || 30);
  const folders = existing?.folders ?? [];
  for (;;) {
    const local = await ask(folders.length ? 'Add another local folder (empty to finish): ' : 'Local folder to sync (e.g. ~/Documents/work): ');
    if (!local) break;
    const remote = await ask(`  sync it to which MiniCloud folder? [backup/${path.basename(local)}]: `) || `backup/${path.basename(local)}`;
    folders.push({ local: path.resolve(local.replace(/^~(?=$|\/)/, process.env.HOME ?? '~')), remote });
  }
  saveConfig({ server: server.replace(/\/$/, ''), username, intervalMinutes: interval, folders, deviceToken: existing?.deviceToken });
  log(`Saved to ${configDir}/agent.json`);
  if (!existing?.deviceToken) log('Next: minicloud-agent login');
}

async function cmdLogin(): Promise<void> {
  const config = requireConfig();
  const password = await askHidden(`Password for ${config.username} @ ${config.server}: `);
  const res = await fetch(`${config.server}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: config.username, password, deviceName: `agent on ${deviceName()}` }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    console.error(`Login failed: ${body.error ?? res.status}`);
    process.exit(1);
  }
  const session = (await res.json()) as { deviceToken: string };
  saveConfig({ ...config, deviceToken: session.deviceToken });
  log('Signed in — this device is now trusted. Try: minicloud-agent sync');
}

async function cmdSync(): Promise<void> {
  const config = requireConfig();
  if (!config.deviceToken) {
    console.error('Not signed in — run: minicloud-agent login');
    process.exit(1);
  }
  const client = new Client(config);
  for (const pair of config.folders) {
    log(`Syncing ${pair.local} ↔ ${pair.remote}`);
    const r = await syncPair(client, pair, log);
    if (!r.skipped) {
      log(`  done: ${r.uploaded} up, ${r.downloaded} down, ${r.deleted} removed, ${r.conflicts} conflicts`);
    }
  }
}

async function cmdWatch(): Promise<void> {
  const config = requireConfig();
  const intervalMs = Math.max(1, config.intervalMinutes) * 60_000;
  log(`Watching ${config.folders.length} folder(s); syncing every ${config.intervalMinutes} min (and shortly after changes).`);
  let running = false;
  let queued = false;
  const run = async () => {
    if (running) { queued = true; return; }
    running = true;
    try {
      await cmdSync();
    } catch (err) {
      log(`sync error: ${(err as Error).message}`);
    }
    running = false;
    if (queued) { queued = false; setTimeout(run, 1000); }
  };
  await run();
  setInterval(run, intervalMs);
  // debounce filesystem events into a sync ~15s after the last change
  let debounce: NodeJS.Timeout | null = null;
  for (const pair of config.folders) {
    try {
      fs.watch(pair.local, { recursive: true }, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(run, 15_000);
      });
    } catch { /* recursive watch unsupported on some Linux setups — interval still covers it */ }
  }
}

async function cmdStatus(): Promise<void> {
  const config = requireConfig();
  log(`server   : ${config.server}`);
  log(`user     : ${config.username} ${config.deviceToken ? '(signed in)' : '(NOT signed in — run login)'}`);
  log(`interval : every ${config.intervalMinutes} min`);
  const client = new Client(config);
  log(`reachable: ${(await client.ping()) ? 'yes' : 'no'}`);
  for (const pair of config.folders) {
    let snap: { lastSync: number | null; pending: unknown[] } = { lastSync: null, pending: [] };
    try {
      snap = JSON.parse(fs.readFileSync(statePathFor(pair), 'utf8'));
    } catch { /* not synced yet */ }
    log(`  ${pair.local} ↔ ${pair.remote}`);
    log(`    last sync: ${snap.lastSync ? new Date(snap.lastSync).toLocaleString() : 'never'} · journal backlog: ${snap.pending.length}`);
  }
}

async function cmdHosts(): Promise<void> {
  const config = requireConfig();
  const client = new Client(config);
  const { apps } = await client.json<{ apps: { name: string }[] }>('/apps');
  const host = new URL(config.server).hostname;
  log('# Add these lines to your hosts file for <name>.mini URLs:');
  log(`#   Windows: C:\\Windows\\System32\\drivers\\etc\\hosts   ·   Mac/Linux: /etc/hosts`);
  for (const a of apps) log(`${host}\t${a.name}.mini`);
  if (apps.length === 0) log('# (no served apps yet)');
}

const [, , cmd] = process.argv;
const commands: Record<string, () => Promise<void>> = {
  init: cmdInit, login: cmdLogin, sync: cmdSync, watch: cmdWatch, status: cmdStatus, hosts: cmdHosts,
};

if (!cmd || !commands[cmd]) {
  console.log('Usage: minicloud-agent <init|login|sync|watch|status|hosts>');
  process.exit(cmd ? 1 : 0);
}
commands[cmd]().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
