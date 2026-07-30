# MiniCloud ☁️

Your personal 24/7 cloud, running on your own spare PC or laptop.

- **Store anything** — files, media, apps, and *entire codebases* (drop a whole repo in;
  `node_modules` and friends are skipped automatically).
- **Find anything** — press <kbd>⌘K</kbd> / <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to search
  by filename *or* by what's inside: function names, notes, config values. Ranked, with
  highlighted excerpts, and it jumps you straight to the file.
- **Stream** video and music to any device, with seeking, straight from encrypted storage.
- **Launch** — serve any uploaded folder as a live web app at `/s/<name>/` or `http://<name>.mini/`,
  public or private. Your own tiny Vercel.
- **Sync** — a desktop agent keeps chosen folders backed up every 30/60/custom minutes,
  survives the server being down, and never silently overwrites your work.
- **Profiles** — up to 6 users, PS5-style picker, each with a password + quick-unlock PIN.
- **Encrypted at rest** — every file is stored as AES-256-GCM chunks; the key never leaves your machine.
- **PWA** — install it on iOS, Android, Windows, Mac, Linux from the browser.

## Quick start

```bash
git clone <this repo> && cd MINICLOUD
npm install
npm run build          # builds the web app
npm run setup          # creates data dir, master key, database
npm start              # → http://localhost:8484
```

Open it in a browser, create the owner profile, and you're in.
**Back up `data/keys/master.key`** — without it the encrypted files can't be read.

To add someone else: "Switch user" → "Add user", and confirm with the owner password.
Up to 6 profiles, each with its own encrypted storage.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Install on the server machine, auto-start on boot, quotas, backups |
| [docs/REMOTE-ACCESS.md](docs/REMOTE-ACCESS.md) | Reach it away from home (Tailscale), invite a friend, SSH/SFTP, `.mini` URLs |
| [docs/SYNC-AGENT.md](docs/SYNC-AGENT.md) | The desktop auto-sync agent: setup, schedules, conflicts, offline behavior |

## Layout

```
server/   Fastify + SQLite API — auth, encrypted chunked storage, streaming, serving
web/      React PWA — welcome screen, dashboard, files, launch, settings
agent/    zero-dependency sync CLI for your laptops/desktops
docs/     setup guides
```

## Development

```bash
npm run dev       # API server on :8484 (tsx watch)
npm run dev:web   # Vite dev server on :5173, proxying /api and /s
npm test          # storage, search, auth + regression suites (vitest)
```

End-to-end, against a **fresh** instance:

```bash
MINICLOUD_DATA_DIR=/tmp/mc-e2e npm start   # terminal 1
node scripts/e2e-browser.mjs               # terminal 2 — screenshots in e2e-shots/
```

MIT licensed. Built to keep your work safe when the power isn't.
