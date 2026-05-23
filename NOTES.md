# Notes — Future Ideas & Research

## Tagging people in posts

LinkedIn's Posts API requires a person's **URN** (`urn:li:person:XXXXXXXX`) to tag them — it doesn't parse `@Name` strings. Mentions are structured annotations in the API payload, not free text.

### Options

1. **Manual URN entry (simplest)** — A "Mentions" field in Compose where the user pastes LinkedIn profile URLs. Parse the ID from the URL (or accept raw URNs). Embed as `mentionedEntities` alongside the post text. Users look up each person's URL once.

2. **Type-ahead search (best UX, restricted access)** — LinkedIn's `/v2/typeahead?query=name&type=PEOPLE` endpoint would power real-time `@name` search. Requires **LinkedIn Marketing Developer Platform partner access** — a separate application process, not available with standard OAuth scopes.

3. **Hybrid** — Let the user type `@Jon Stahl` in the compose box; on publish, show a modal to confirm or supply the URN for each mention.


