# Notes — Future Ideas & Research

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


