# The sync agent

The agent runs on your laptop/desktop and keeps chosen folders mirrored to your
MiniCloud on a schedule — so a dead battery, a stolen laptop, or a power cut never
costs you your files.

## Setup (per device)

```bash
cd minicloud/agent
npm run agent -- init     # server URL, username, folders, interval (30/60/anything)
npm run agent -- login    # password once; this device becomes trusted
npm run agent -- sync     # first sync now
npm run agent -- watch    # keep running: syncs every N minutes + ~15s after changes
```

Config lives in `~/.minicloud/agent.json`. (You can also build a standalone binary-ish
install with `npm run build -w agent` and run `node agent/dist/index.js`.)

## What a sync does

Two-way, against a snapshot of the last sync:

| Situation | Action |
|---|---|
| New/changed locally | uploaded (big files in resumable 4MB chunks) |
| New/changed on the server (e.g. from your phone) | downloaded |
| Deleted locally | moved to the **server trash** (restorable in Settings) |
| Deleted on the server | moved to a local `.minicloud-trash/` folder — never hard-deleted |
| Changed on **both** sides | your local copy wins; the server copy is saved next to it as `name (conflict from server).ext` |

`node_modules`, `.git`, `dist`, `build`, `.cache` etc. are skipped (same `.miniignore`
defaults as the web app), so syncing a code folder is fast.

## When the server is down

Nothing breaks and nothing blocks: the pass is skipped with a note, your local files are
untouched, and every planned operation sits in a **write-ahead journal**
(`~/.minicloud/state/`). The next successful run replays the journal exactly where it
stopped — including uploads interrupted mid-file, which resume from the last confirmed
chunk. Check the backlog anytime with `npm run agent -- status`.

## Run it automatically

- **Linux**: a systemd *user* service running `npm run agent -- watch`, or a cron entry
  `*/30 * * * * cd ~/minicloud/agent && npm run agent -- sync`
- **Windows**: Task Scheduler → At log on → `npm run agent -- watch` (Start in: the agent folder)
- **macOS**: a LaunchAgent plist, or add it to Login Items

## `.mini` hosts entries

```bash
npm run agent -- hosts
```

prints the lines to paste into your hosts file so `http://<name>.mini/` resolves to your
server on this machine.
