# LinkedIn Post Scheduler — Architecture Spec

A lightweight, single-user app that replicates Buffer's core flow for LinkedIn:
draft posts, queue them, post on a schedule, manage from any device, and capture
reposts-with-commentary via a browser bookmarklet while browsing LinkedIn.

This is a personal tool for one user (the owner). Optimize for simplicity and
low cost, not multi-tenancy.

---

## Stack (decided)

- **Host:** Fly.io — ONE always-on machine (shared-cpu-1x, 256–512MB).
- **Backend:** Node + TypeScript + Fastify.
- **DB:** SQLite via `better-sqlite3`, file on a Fly volume at `/data`.
- **Scheduler:** in-process (`node-cron`), running in the same process as the web server.
- **Frontend:** small responsive PWA served same-origin from Fastify (no separate host → avoids CORS for the main app).
- **Backups:** Litestream replicating SQLite to an S3-compatible bucket.
- **Cost target:** ~$2–4/month (machine + ~1GB volume + minimal bandwidth).

> Equivalent Python stack (FastAPI + APScheduler + sqlite3) is acceptable if preferred,
> but this spec assumes the Node stack.

---

## HARD CONSTRAINTS (read carefully — these shape the design)

### Fly.io
- Run exactly ONE machine. Set `min_machines_running = 1` and `auto_stop_machines = false`.
  The scheduler must stay warm to fire posts on time; scale-to-zero breaks it.
- **Never horizontally scale this app.** The SQLite volume is pinned to one machine in
  one region. More than one machine = split-brain / double-posting.
- 1GB volume mounted at `/data`; SQLite lives there.
- Secrets (LinkedIn client secret, token-encryption key, owner login hash) via `fly secrets`.
- Use the free `*.fly.dev` hostname (TLS included) as the stable HTTPS base URL for the
  OAuth redirect and the bookmarklet.

### LinkedIn API (verify request bodies against LIVE docs — do not trust training data)
- Use the **Posts API** (it replaced the older ugcPosts API).
- Required request headers: `LinkedIn-Version: YYYYMM` (use a current month) and
  `X-Restli-Protocol-Version: 2.0.0`.
- OAuth: 3-legged Authorization Code flow. Scopes: `openid`, `profile`, `w_member_social`.
  `w_member_social` is granted by adding the **"Share on LinkedIn"** product to the app.
- Creating the LinkedIn developer app requires an associated **Company Page** (prerequisite).
- **Token reality:** access tokens last ~60 days. Programmatic refresh tokens are restricted
  to approved Marketing Developer Platform partners — a self-serve app generally does NOT get
  them. So:
  - Store `expires_at`. Show a "Reconnect LinkedIn" banner when < ~7 days remain.
  - If the token is dead at posting time, mark the post `failed` with a clear reason — never
    silently drop it.
  - Build the re-auth (reconnect) flow as a first-class feature, not an afterthought.
- **Repost with commentary** = create a NEW post whose `commentary` is the user's text and
  whose content references the original post's URN / URL. (Confirm exact field shape in docs.)
- Image/media posting is a multi-step register-upload flow — treat as a later phase.

### Scheduler correctness
- Tick every ~60s: find posts where `status='scheduled'` AND `scheduled_for <= now`.
- **Claim before sending:** atomically set `status='publishing'` so an overlapping tick can't
  double-send the same post.
- **Catch-up on boot:** on startup, immediately process any posts whose time already passed but
  never published (covers machine restarts / host blips).
- Store ALL timestamps in UTC. Keep the owner's timezone separately for slot math + display.
- Handle DST when computing recurring slot times.

---

## Data model (SQLite)

**posts**
- id (pk)
- kind: 'original' | 'repost'
- commentary (text)              — user's body / commentary
- source_url (text, nullable)    — original post URL (reposts only)
- source_urn (text, nullable)    — original post URN if captured
- media_json (text, nullable)    — later phase
- status: 'draft'|'queued'|'scheduled'|'publishing'|'published'|'failed'
- scheduled_for (utc datetime, nullable)
- slot_id (fk, nullable)         — if filled via a recurring slot
- published_urn (text, nullable)
- published_at (utc datetime, nullable)
- error (text, nullable)
- retry_count (int, default 0)
- created_at / updated_at (utc)

**schedule_slots**  (recurring posting windows — Buffer's core trick)
- id (pk)
- day_of_week (0–6)
- time_local (HH:MM)
- timezone (IANA, e.g. "America/Chicago")
- enabled (bool)

**linkedin_auth**  (single row)
- access_token (encrypted at rest)
- refresh_token (encrypted, nullable — only if partner access ever granted)
- expires_at (utc)
- member_urn

---

## Queue → schedule behavior

- Two scheduling modes:
  1. **Slot-based:** "Add to Queue" assigns the post to the next open future slot.
  2. **Explicit:** pin a specific datetime.
- Queue view should be reorderable; reordering reassigns slots.

---

## API surface (sketch)

Owner-authenticated (session cookie), same-origin:
- `GET  /api/posts`            — list queue / drafts
- `POST /api/posts`            — create draft
- `PATCH /api/posts/:id`       — edit / schedule / reorder
- `DELETE /api/posts/:id`
- `GET  /api/slots` / `POST /api/slots` / `PATCH /api/slots/:id`
- `GET  /auth/linkedin`        — start OAuth
- `GET  /auth/linkedin/callback` — exchange code, store token
- `GET  /api/status`           — connection + token expiry info

Bookmarklet ingest (the ONE endpoint that needs CORS for `https://www.linkedin.com`):
- `POST /api/capture`          — { source_url, source_urn?, commentary, slot|datetime }
  Authenticated via a long-lived bearer token (not the session cookie).

Internal:
- scheduler tick is in-process; no public cron endpoint needed (we're not serverless).

---

## Bookmarklet design

- The saved bookmarklet is a tiny **loader** that injects a script from `https://<app>.fly.dev`,
  so capture logic can be updated without re-saving the bookmarklet.
- Injected script: reads the current post permalink/URN from the page, shows a small overlay
  for commentary + slot/time choice, POSTs to `/api/capture`.
- Auth: a long-lived bearer token baked into the injected script (served only to the owner).
- Capture the URL + the owner's commentary only. Do NOT scrape post body text (fragile + against
  LinkedIn terms).
- NOTE: a bookmarklet only acts when clicked — it cannot auto-appear on the page. If an
  always-present button is wanted later, that's a browser extension (content script), out of
  scope for v1.

---

## Auth & secrets

- Owner login: password → session cookie (single user). Hash stored as a Fly secret.
- Bookmarklet: separate long-lived bearer token.
- Encrypt LinkedIn tokens at rest using a key from a Fly secret.

---

## Suggested build phases

1. **Skeleton:** Fastify app, SQLite + migrations, fly.toml + Dockerfile + volume, deploy a
   health check. Confirm the machine stays warm.
2. **Auth + LinkedIn connect:** owner login, OAuth flow, store/encrypt token, status endpoint
   with expiry, reconnect banner.
3. **Posts CRUD + queue UI:** drafts, schedule slots, queue view (PWA).
4. **Scheduler:** tick loop, claim-before-send, catch-up-on-boot, retry/backoff, post via Posts API.
5. **Bookmarklet:** loader + injected overlay + `/api/capture` + CORS.
6. **Backups:** Litestream to object storage.
7. **Later:** media/image uploads; optional browser extension.

## Deferred / open questions
- Image & video upload flow (multi-step register-upload) — phase 7.
- Analytics (Member Post Analytics API) — out of scope for v1.
