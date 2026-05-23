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

## Tagging people in posts

LinkedIn's Posts API requires a person's **URN** (`urn:li:person:XXXXXXXX`) to tag them — it doesn't parse `@Name` strings. Mentions are structured annotations in the API payload, not free text.

### Options

1. **Manual URN entry (simplest)** — A "Mentions" field in Compose where the user pastes LinkedIn profile URLs. Parse the ID from the URL (or accept raw URNs). Embed as `mentionedEntities` alongside the post text. Users look up each person's URL once.

2. **Type-ahead search (best UX, restricted access)** — LinkedIn's `/v2/typeahead?query=name&type=PEOPLE` endpoint would power real-time `@name` search. Requires **LinkedIn Marketing Developer Platform partner access** — a separate application process, not available with standard OAuth scopes.

3. **Hybrid** — Let the user type `@Jon Stahl` in the compose box; on publish, show a modal to confirm or supply the URN for each mention.


