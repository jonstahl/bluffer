# Bluffer

A personal LinkedIn post scheduler. Draft posts, queue them to a schedule, and publish automatically — from any device. Also captures reposts-with-commentary via a bookmarklet while browsing LinkedIn.

Single-user, self-hosted on [Fly.io](https://fly.io) for ~$2–4/month.

## Features

- **Queue & schedule** — add posts to a queue that fills your recurring time slots, or pin a specific datetime
- **Drag-to-reorder** — rearrange queued posts; slots are redistributed automatically
- **Slot-based scheduling** — define recurring posting windows (e.g. Mon/Wed/Fri at 9am) across any timezone
- **Bookmarklet** — click it on any LinkedIn post to open Bluffer pre-filled with that post's URL for a repost-with-commentary
- **Post now** — publish to LinkedIn immediately without queueing
- **Delete from LinkedIn** — retract a published post directly from the history tab
- **Token expiry banner** — warns you when your LinkedIn access token is nearing expiry (~7 days out), with a one-click reconnect
- **PWA** — installable on mobile; works from any browser

## Stack

- **Runtime:** Node 20 + TypeScript + Fastify
- **Database:** SQLite via `better-sqlite3`, on a Fly volume
- **Scheduler:** in-process `node-cron` — ticks every 60s, claims posts atomically before sending
- **Frontend:** vanilla JS + Tailwind CSS v4, served same-origin (no separate CDN/host)
- **Backups:** Litestream replicating SQLite to S3-compatible object storage
- **Host:** Fly.io, single always-on machine

## Local development

**Prerequisites:** Node 20+, a LinkedIn developer app (optional — everything except publishing works without it).

```bash
# 1. Clone and install
git clone https://github.com/jonstahl/bluffer
cd bluffer
npm install

# 2. Configure
cp .env.example .env
# Edit .env — see comments in the file for each value

# 3. Run
npm run dev        # starts server + tsx watch on http://localhost:3000
npm run watch:css  # in a second terminal — rebuilds Tailwind on CSS changes
```

### Generating secrets

```bash
# Session secret (48 bytes)
openssl rand -hex 48

# Token encryption key (32 bytes)
openssl rand -hex 32

# Bookmarklet token (24 bytes)
openssl rand -hex 24

# Password hash — replace 'yourpassword'
node -e "require('bcryptjs').hash('yourpassword', 12).then(console.log)"
# Paste result into .env as: OWNER_PASSWORD_HASH="\$2a\$12\$..."
# (escape every $ as \$ inside the double-quoted value)
```

### LinkedIn OAuth app setup

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com) and create an app (requires a Company Page).
2. Add the **"Share on LinkedIn"** product to get the `w_member_social` scope.
3. Add `http://localhost:3000/auth/linkedin/callback` as an OAuth redirect URL (and your production URL for deploy).
4. Copy the Client ID and Client Secret into `.env`.

## Deploying to Fly.io

```bash
# Install flyctl, then:
fly auth login
fly launch --no-deploy   # creates the app; answer prompts

# Create the persistent volume (1GB is plenty)
fly volumes create bluffer_data --size 1 --region sea

# Set secrets
fly secrets set \
  SESSION_SECRET="$(openssl rand -hex 48)" \
  TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  BOOKMARKLET_TOKEN="$(openssl rand -hex 24)" \
  OWNER_PASSWORD_HASH='$2a$12$...'   \
  LINKEDIN_CLIENT_ID=your_client_id  \
  LINKEDIN_CLIENT_SECRET=your_secret \
  OWNER_TIMEZONE=America/Chicago

# Deploy
fly deploy
```

> **Never scale beyond one machine.** The SQLite volume is pinned to one region; a second machine would cause split-brain and double-posts. `min_machines_running = 1` and `auto_stop_machines = false` are already set in `fly.toml` to keep the scheduler warm.

### Litestream backups (optional)

Set these additional secrets to enable continuous replication to an S3-compatible bucket:

```bash
fly secrets set \
  LITESTREAM_S3_BUCKET=my-bucket \
  LITESTREAM_S3_REGION=us-east-1 \
  LITESTREAM_ACCESS_KEY_ID=... \
  LITESTREAM_SECRET_ACCESS_KEY=...
```

Uncomment `LITESTREAM_S3_ENDPOINT` in `.env.example` / secrets for non-AWS storage (Backblaze B2, Tigris, etc.).

## Bookmarklet setup

1. Go to **Settings → Bookmarklet** in the app.
2. Drag the **📤 Bluffer Capture** link to your bookmarks bar.
3. While on any LinkedIn post, click the bookmarklet — a new Bluffer tab opens with the post URL pre-filled as a repost.

## Security

Bluffer uses a two-phase authentication setup:

### Phase 1 — Password (initial access)

The password is set via `OWNER_PASSWORD_HASH` in your environment/secrets (see [Generating secrets](#generating-secrets) above). It's the only way to log in until you register a passkey.

### Phase 2 — Passkey (recommended)

Once you're logged in, go to **Settings → Security** and click **Register passkey**. This walks you through a WebAuthn registration (Touch ID, Face ID, Windows Hello, or a hardware key like YubiKey). After registration:

- Password login is **permanently disabled** — the app rejects it even if the correct password is supplied.
- The login screen switches to a single "Sign in with passkey" button.
- Your passkey credential is stored in the local SQLite database.

**Register your passkey immediately after first login** — before you deploy to a shared or untrusted environment.

### Break-glass recovery

If you lose access to your passkey, you can recover via the Fly.io console:

```bash
fly ssh console
sqlite3 /data/bluffer.db "DELETE FROM passkey_credentials;"
# Password login is now re-enabled — log in, then re-register a passkey
```

## LinkedIn token expiry

LinkedIn access tokens last ~60 days and cannot be refreshed programmatically (without approved Marketing Developer Platform access). When your token is about to expire:

- A warning banner appears in the app header.
- Failed posts are marked `failed` with a clear error — never silently dropped.
- Click **Reconnect LinkedIn** in Settings (or the banner link) to re-authorize.

## Tests

```bash
npx playwright test
```

Auth state is cached in `tests/.auth.json` after the first run. Test posts use a `[pw] ` commentary prefix and slots use time `22:22` as sentinel values for cleanup.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run watch:css` | Watch and rebuild Tailwind CSS |
| `npm run build` | Compile TypeScript + CSS for production |
| `npm start` | Run compiled output (no .env loading) |
| `npx playwright test` | Run end-to-end tests |
| `fly deploy` | Build and deploy to Fly.io |
