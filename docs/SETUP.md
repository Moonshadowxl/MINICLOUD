# Setting up your MiniCloud server

The server is any machine that stays on: a spare PC, an old laptop (built-in battery =
free mini-UPS!), a mini PC. You need **Node.js 22.5+** — nothing else. There are no
native dependencies, so it installs the same on Windows, macOS, and Linux.

## Install

```bash
git clone <this repo> minicloud && cd minicloud
npm install
npm run build     # compiles the web app the server will host
npm run setup     # creates ./data, the master encryption key, and the database
npm start
```

Visit `http://localhost:8484` (or `http://<the-server's-LAN-IP>:8484` from another
device) and create the owner profile. Add up to 5 more profiles from the welcome screen.

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `MINICLOUD_DATA_DIR` | `./data` | Where files, DB, and keys live — point at your big disk |
| `MINICLOUD_PORT` | `8484` | HTTP port |
| `MINICLOUD_QUOTA_GB` | `400` | Total storage pool |
| `MINICLOUD_VERSIONS` | `5` | Old versions kept per file |
| `MINICLOUD_TRASH_DAYS` | `30` | Days before trash can be purged |
| `MINICLOUD_BASE_DOMAIN` | *(empty)* | Real wildcard domain for serving (e.g. `minicld.app`) — enable later if you buy one |

## Start on boot

**Linux (systemd)** — `/etc/systemd/system/minicloud.service`:

```ini
[Unit]
Description=MiniCloud
After=network.target

[Service]
WorkingDirectory=/home/YOU/minicloud
ExecStart=/usr/bin/npm start
Restart=always
Environment=MINICLOUD_DATA_DIR=/home/YOU/minicloud-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now minicloud
```

**Windows** — Task Scheduler → Create Task → trigger *At startup* → action
`npm start` with *Start in* set to the repo folder. Tick "Run whether user is logged on or not".

**macOS** — `launchctl` or just add `npm start` (in the repo dir) to Login Items via a small shell app.

## The one file you must back up

`data/keys/master.key` encrypts everything. Copy it to a USB stick / password manager
**now**. If the disk dies you can restore files from a `data/` backup **only** with this key.

For full backups, copy the whole `MINICLOUD_DATA_DIR` (it's self-contained: DB + encrypted
chunks + keys) to an external drive on a schedule, e.g. nightly `rsync`:

```bash
rsync -a --delete /home/YOU/minicloud-data/ /mnt/backup-drive/minicloud-data/
```

## Quotas

Settings → Profiles (owner only) → set a per-user quota in GB, or leave it empty so
everyone shares the pool. Trash still counts against the quota until purged.
