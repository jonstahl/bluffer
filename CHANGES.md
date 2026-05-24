# Changelog

## v1.0.3 — 2026-05-24

### Features
- **History pagination** — 20 posts per page with Prev/Next controls and a post count indicator; resets to page 1 when switching to the History tab
- **Dense history rows** — collapsed to 3 lines with a "↓ Show more / ↑ Show less" toggle; expands in-place without a full re-render
- **View on LinkedIn** — each published history entry links directly to the live post on LinkedIn
- **History sort** — newest-first by published date

### Visual redesign
- **Typography** — switched to DM Sans (body) + Syne 800 (wordmark); warmer, more characterful than system-ui
- **Header** — dark charcoal background replaces LinkedIn-blue gradient; feels like a tool, not a clone
- **Background** — warm stone `#f5f4f1` replaces LinkedIn's cold grey
- **Login screen** — Syne wordmark with subtitle; cleaner card proportions
- **Status badges** — bordered pills with per-status color pairs; less aggressive than filled blobs
- **Cards & post items** — warmer borders, subtler shadows, tighter padding
- **Subtabs** — black underline on active tab; quieter inactive state
- **Modal** — blur backdrop, deeper shadow
- **Empty states** — clean typographic text; removed emoji placeholders
- **Drag handle** — lighter grey, less visually noisy

## v1.0.2 — 2026-05-23

### Features
- **Passkey authentication** — replaces password login with WebAuthn passkey (Touch ID / Face ID / hardware key). Register from Settings while logged in; once registered, password login is permanently disabled. Break-glass recovery via `fly ssh console`.

### Testing
- Playwright tests for passkey API endpoints and Settings Security card
- `TEST_PASSWORD` env var now required (no hardcoded default) for `npx playwright test`

## v1.0.1 — 2026-05-23

### Features
- Added "Post it now!" option to the edit dialog

### Bug fixes
- Fixed post body not rendering line breaks in the queue/history list
- Fixed parentheses (and other reserved characters) in post text causing LinkedIn to silently truncate the post — properly escapes LinkedIn's `little` text format reserved characters (`( ) { } [ ] | < > @ \`) before publishing

## v1.0 — 2026-05-23

### Features
- **Auto-refresh** — Queue and History views refresh every 30 seconds and immediately when switching back to the tab


---

## v0.9.1 — 2026-05-23

### Features
- **Delete from LinkedIn** — published posts have a "Delete from LinkedIn" button that retracts the post via the LinkedIn Posts API and resets it to draft locally
- **Remove from history** — local-only button to clear a published post record without touching LinkedIn
- **README** — full setup and deployment guide

### Visual polish
- Switched to **Tailwind CSS v4** (via CLI); removed hand-written `<style>` block
- LinkedIn-branded gradient header with shadow
- Cards with rounded corners and drop shadows
- Post items with status-colored left accent border (draft/queued/scheduled/published/failed)
- Buttons restyled: primary pill, ghost with border, danger with border
- Empty states with emoji icons; status badges as small rounded pills

### Queue & compose
- Subtabs in Queue view: **Queue** (active) and **History** (published/failed)
- Status filter dropdown on the Queue subtab
- Drag-and-drop reorder of queued posts; **Bump it!** button to move a post to the front
- "Post it now!" option in Compose — publishes immediately without queueing
- Edit modal with scheduling options: queue, specific datetime, or revert to draft

### Bookmarklet
- Reworked to open Bluffer in a new tab with the LinkedIn post URL pre-filled — simpler, no CORS or injection required

### Slots
- Multi-select day pills (Sun–Sat) with All / Weekdays / None shortcuts
- Slot display converts to owner timezone for readability

### Bug fixes
- Fixed slot enable/disable (boolean coercion for SQLite)
- Fixed queue slot assignment (was reusing same slot for multiple posts)
- Fixed renderSlots crash on unrecognized timezone aliases
- Fixed wrong HTTP status code (200→400) on bad login password
- Fixed flaky Playwright filter test

### Testing
- Playwright end-to-end tests: auth, compose, queue, slots
- `afterAll` safety-net cleanup using `[pw] ` prefix and `22:22` sentinel time

### Deployment (Fly.io)
- Dockerfile build-tools fix (`python3 make g++` in builder stage for `better-sqlite3`)
- Upgraded Fastify v4 → v5 and all `@fastify/` plugins to matching versions
- Fixed session persistence: switched to `session.set()`/`session.get()` + explicit `session.save()`
- Fixed `Content-Type: application/json` on bodyless requests rejected by Fastify v5 (`FST_ERR_CTP_EMPTY_JSON_BODY`)
- Fixed `saveUninitialized` and named plugin import for `@fastify/session` v11 compatibility

---

## v0.9 — 2026-05-22

Initial release. Core features:

- **Post scheduling** — draft → queue → scheduled → published flow with status tracking
- **LinkedIn publishing** — posts to LinkedIn via the Posts API; reposts with commentary supported
- **OAuth** — connect a LinkedIn account via OAuth 2.0; token stored encrypted
- **Scheduler** — in-process `node-cron` job; catches up on missed posts at boot; marks failed posts rather than dropping them silently
- **Schedule slots** — define recurring posting times by day-of-week; posts assigned to next open slot automatically
- **Compose UI** — create original posts or reposts; queue or schedule at a specific time
- **Queue UI** — view and manage scheduled posts
- **Bookmarklet** — capture a LinkedIn post URL from the browser for reposting with commentary
- **SQLite storage** — single-file database on a Fly.io volume
