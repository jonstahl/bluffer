# Changelog

## v0.9.2 — 2026-05-23

### Features
- **Auto-refresh** — Queue and History views now refresh automatically every 30 seconds and immediately when switching back to the tab
- **Engagement stats** — History posts show like and comment counts fetched from LinkedIn's Social Actions API; stats load automatically when opening History and can be manually refreshed via a "Refresh stats" button

## v0.9.1 — 2026-05-23

### Features
- **Delete from LinkedIn** — published posts in History now have a "Delete from LinkedIn" button that calls the LinkedIn Posts API to retract the post, then resets it to draft locally for potential re-posting
- **Remove from history** — separate local-only button on published posts to clear the local record without touching LinkedIn (useful when you've already deleted manually)
- **README** — full setup and deployment guide added

### Visual polish
- Switched to **Tailwind CSS v4** (via CLI) for all styling; removed hand-written `<style>` block
- LinkedIn-branded gradient header with shadow
- Cards with rounded corners and drop shadows
- Post items with status-colored left accent border (draft/queued/scheduled/published/failed)
- Buttons restyled: primary as rounded pill, ghost with border, danger with border
- Empty states with emoji icons (📭 queue, 🗓 slots)
- Status badges as small rounded pills

### Queue & compose
- Subtabs in Queue view: **Queue** (active posts) and **History** (published/failed)
- Status filter dropdown on the Queue subtab
- Drag-and-drop reorder of queued posts; **Bump it!** button to move a post to the front
- "Post it now!" option in Compose — publishes immediately without queueing
- Edit modal with scheduling options: queue, specific datetime, or revert to draft

### Bookmarklet
- Reworked to open Bluffer in a new tab (instead of an overlay) with the LinkedIn post URL pre-filled — simpler, no CORS or injection required

### Slots
- Multi-select day pills (Sun–Sat) with All / Weekdays / None shortcuts
- Slot display converts to the owner's timezone for readability

### Bug fixes
- Fixed slot enable/disable (boolean coercion for SQLite)
- Fixed queue slot assignment (was reusing same slot for multiple posts)
- Fixed renderSlots crash on unrecognized timezone aliases
- Fixed wrong HTTP status code (200→400) on bad login password
- Fixed flaky Playwright filter test

### Testing
- Added Playwright end-to-end tests: auth, compose, queue, slots
- `afterAll` safety-net cleanup using `[pw] ` comment prefix and `22:22` sentinel time

### Deployment (Fly.io)
- Added Dockerfile build-tools fix (`python3 make g++` in builder stage for `better-sqlite3`)
- Upgraded Fastify v4 → v5 and all `@fastify/` plugins to matching versions
- Fixed session not persisting after login: switched to `session.set()`/`session.get()` API and explicit `session.save()` required by `@fastify/session` v11
- Fixed `Content-Type: application/json` on bodyless DELETE requests rejected by Fastify v5 (`FST_ERR_CTP_EMPTY_JSON_BODY`)
- Fixed `saveUninitialized` and named plugin import for `@fastify/session` v11 compatibility
