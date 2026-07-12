# Reaching MiniCloud away from home

Your server sits on your home network. The clean, free, no-port-forwarding way to reach
it from anywhere (and share it with a friend) is **Tailscale** — a private network
between your devices.

## Tailscale in 5 minutes

1. Make a free account at [tailscale.com](https://tailscale.com).
2. Install Tailscale **on the server** and sign in: it gets a stable name like
   `myserver.tail1234.ts.net`.
3. Install Tailscale on your phone/laptop, sign in with the same account.
4. Open `http://myserver.tail1234.ts.net:8484` from anywhere. Done.

Optional but nice — real HTTPS (needed for the PWA to install with full powers on iOS):

```bash
tailscale serve --bg 8484
```

gives you `https://myserver.tail1234.ts.net` with a valid certificate.

### Inviting your friend

Tailscale → Admin console → **Share** your server node with their Tailscale account
(or use a shared tailnet). They install Tailscale, open your URL, and sign into their
MiniCloud profile. Your other devices stay invisible to them.

## SSH / SFTP

SSH is a property of the server machine, not of MiniCloud:

- **Linux**: `sudo apt install openssh-server` → `ssh you@myserver.tail1234.ts.net`
- **Windows**: Settings → Optional features → OpenSSH Server
- **macOS**: System Settings → Sharing → Remote Login

SFTP rides on SSH for raw file access. Note: the MiniCloud store on disk is encrypted
chunks (that's the point) — use SSH for admin, the app/API for files. Tailscale also has
`tailscale ssh` if you want SSH with zero key management.

## `.mini` URLs

`http://portfolio.mini/` works on any device that resolves `*.mini` to your server:

- **Your PCs/Macs**: run `minicloud-agent hosts` — it prints the hosts-file lines to add
  (agent docs: [SYNC-AGENT.md](SYNC-AGENT.md)).
- **Whole network**: add a DNS record for `.mini` in your router / Pi-hole / AdGuard Home
  pointing at the server's IP.
- **iPhones/iPads**: can't edit hosts — use the `/s/<name>/` URL, which always works.

Every served app is reachable at **both** `http://<server>/s/<name>/` and `http://<name>.mini/`.
If you buy a real domain later, set `MINICLOUD_BASE_DOMAIN=yourdomain.app`, point a
wildcard DNS record at the server, and apps also serve at `https://<name>.yourdomain.app`.

## A note on exposing to the raw internet

Don't port-forward 8484 straight to the internet. It works, but then your login page is
public to every scanner on Earth. Tailscale gives you the same "access anywhere" without
the exposure.
