# Notes — Future Ideas & Research

## Link in first comment

Post the main content without a URL, then immediately post a comment on your own post containing the link — a common LinkedIn pattern to avoid algorithm deprioritization of posts with outbound links.

**Status: feasible with standard scopes.** `POST /rest/socialActions/{postUrn}/comments` requires `w_member_social_feed` (the current name for `w_member_social`), which we already have. Read endpoints are partner-gated but writes are not.

### Request shape (verified from docs 2026-05-23)
```json
POST /rest/socialActions/{postUrn}/comments
{
  "actor": "urn:li:person:XXX",
  "object": "urn:li:activity:XXX",
  "message": { "text": "https://your-link.com" }
}
```

### Implementation sketch
- Add a `first_comment TEXT` column to posts — stores the URL/text to post as the first comment
- Add a "Link in first comment" toggle + text field in Compose
- In the scheduler, after a successful publish, if `first_comment` is set, call the comments API then clear the field

### Open question
The `object` field requires an **activity URN** (`urn:li:activity:...`), but we store the post URN (`urn:li:share:...` or `urn:li:ugcPost:...`) from the `x-restli-id` response header. Need to test whether the post URN is accepted as the URL target, or whether we need to capture and store the activity URN separately at publish time.

---

## Per-post engagement stats in History

**Blocked — requires LinkedIn Partner API access.**

Tested live on 2026-05-23: `/rest/socialActions/{postUrn}` returns:
```
403 ACCESS_DENIED: Not enough permissions to access: partnerApiSocialActions.GET.20260501
```

All engagement data (likes, comments, reposts, impressions, views) requires LinkedIn Marketing Developer Platform partner access. Standard OAuth scopes (`w_member_social`, `openid profile`) cannot access any of it.

This feature is only viable if Bluffer becomes a LinkedIn-approved partner product.

---

## Images in posts

**Status: feasible with standard `w_member_social` scope.** No partner access required.

### Upload flow (verified from docs 2026-05-23)

Three-step process, all server-side using the stored access token:

1. **Initialize** — `POST /rest/images?action=initializeUpload` with `{ "initializeUploadRequest": { "owner": "urn:li:person:XXX" } }` → returns `uploadUrl` and image URN (`urn:li:image:XXX`)
2. **Upload binary** — `PUT <uploadUrl>` with raw bytes, `Content-Type: application/octet-stream`
3. **Reference in post** — `"content": { "media": { "id": "urn:li:image:XXX", "altText": "..." } }` in the Posts API payload

### Image processing caveat

After upload, images enter a `PROCESSING` → `AVAILABLE` state. With only `w_member_social`, **versioned GET calls to `/rest/images` are blocked** (write-only scope for versioned gateway). Legacy GET calls (no `LinkedIn-Version` header) still work with `w_member_social` and could be used to poll status.

Options for handling this at publish time:
- **Optimistic** — post immediately after successful PUT; LinkedIn typically processes fast enough (simplest)
- **Legacy GET poll** — `GET /rest/images/{urn}` without `LinkedIn-Version` header, wait for `status: "AVAILABLE"`
- **Fixed delay** — wait 2–3s before publishing

### Constraints
- Max **36,152,320 pixels**
- Formats: **JPG, PNG, GIF** (GIF up to 250 frames)
- GIF supports up to 250 frames

### Implementation sketch
- Add `image_urn TEXT` column to posts
- File input in Compose; server receives the upload (multipart), calls initializeUpload, PUTs to the pre-signed URL, stores the URN
- Scheduler includes `content.media` in the post payload when `image_urn` is set
- Optionally support multiple images via the [MultiImage API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api)

---

## Tagging people in posts

LinkedIn's Posts API uses **inline mention syntax** in the `commentary` field — simpler than expected:

```
"Hello @[Jon Stahl](urn:li:person:XXXXXXXX), check this out!"
```

No structured annotation object needed. However, this doesn't change the core blocker.

**Still requires partner API access for any useful UX.** The user still needs a person's URN (`urn:li:person:XXXXXXXX`), and looking up URNs from names requires partner-gated endpoints:

- `/v2/typeahead?query=name&type=PEOPLE` — partner-gated
- People search by name — partner-gated

### Partial workaround (untested)
If the user pastes a LinkedIn profile URL (e.g. `https://linkedin.com/in/jonstahl`), the vanity name can be extracted and `/v2/people/(id:jonstahl)` *might* resolve it to a URN with standard scopes — but availability without partner access is unconfirmed and needs live testing.

### Options

1. **Profile URL → URN resolution** — User pastes a LinkedIn profile URL; server extracts the vanity name and attempts `/v2/people/(id:{vanityName})`. If it works with standard scopes, this avoids manual URN lookup. **Needs testing.**

2. **Manual URN entry** — User pastes a LinkedIn profile URL or raw URN directly. Parse the numeric ID from the URL. No API call needed. Friction: users need to find the URL each time.

3. **Type-ahead search (best UX, restricted)** — Real-time `@name` search via LinkedIn typeahead. Requires **LinkedIn Marketing Developer Platform partner access**.


