# CLAUDE.md

Personal, single-user LinkedIn post scheduler (Buffer-style: draft → queue → scheduled posting,
multi-device, plus a bookmarklet for reposts-with-commentary).

**Full architecture is in `SPEC.md` — read it before building.**

## Stack
- Fly.io, ONE always-on machine. Node + TypeScript + Fastify. SQLite (`better-sqlite3`) on a
  Fly volume at `/data`. In-process scheduler (`node-cron`). Same-origin PWA frontend.

## Always-true rules
- **Never run more than one machine** and never scale to zero. The SQLite volume is pinned to one
  machine; multiple machines = double-posting. Set `min_machines_running=1`, `auto_stop_machines=false`.
- **All timestamps stored in UTC.** Owner timezone is separate, used only for slot math + display.
- **Scheduler must claim a post (`status='publishing'`) before sending** to prevent double-sends,
  and must **catch up on boot** for any missed-but-due posts.
- **LinkedIn token lasts ~60 days with no self-serve refresh.** Treat the reconnect flow as
  first-class; surface expiry; mark posts `failed` (never silently drop) if the token is dead.
- **Do not write LinkedIn Posts API request bodies or version headers from memory** — verify
  against current LinkedIn docs. Use the Posts API (not ugcPosts), with `LinkedIn-Version` and
  `X-Restli-Protocol-Version: 2.0.0` headers.
- The bookmarklet captures URL + the owner's commentary only — never scrape post text.
- `/api/capture` is the only endpoint that allows the `linkedin.com` CORS origin.

## Commands
- `cp .env.example .env` then fill in secrets before first run
- `npm run dev` — start locally with `.env` (tsx watch, hot reload)
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run compiled output (production-style, no `.env` loading)
- `fly deploy` — build and deploy to Fly.io
