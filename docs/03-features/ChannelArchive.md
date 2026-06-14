# 📂 Channel Archive

**Status:** ✅ Active (shipped) — single-channel and whole-category archiving to on-Discord HTML
**Location:** Reece's Stuff → Data → 🧹 Cleanup & Restart → **🧹 Archive Channels**
**Code:** `app.js` (`archive_channel` / `archive_channel_select` / `archive_confirm` handlers), `channelArchiver.js` (background run), `channelExportFetcher.js` (rate-limited REST), `channelExport.js` (HTML)
**Related:** [DiscordRateLimits.md](../standards/DiscordRateLimits.md) · [ComponentsV2.md](../standards/ComponentsV2.md) · [RaP 0917 — Privileged Intents](../01-RaP/) · [Backup Strategy](BackupStrategy.md)

> **Naming note:** the feature is presented to users as **"Archive"** even though it technically *exports* a channel's history to an HTML file. The underlying modules keep the legacy `export` names (`channelExport.js`, `generateExportHTML`, `*-export-*.html`); the user-facing UI, buttons, and this doc say "Archive."

---

## 🎯 What It Does

A popular host (whom Reece helps) reuses the **same Discord server season after season**, creating **300+ channels per season × ~6 seasons/year**. Discord caps a guild at **500 channels**, so the server fills up. The long-term goal is to free channel slots by exporting a channel's full history, storing it permanently, and (eventually) deleting the original.

**What ships today:** an admin **multi-selects** any mix of channels and/or categories (up to 25 picks), confirms, and the bot fetches every message via REST, renders a self-contained Discord-styled HTML file, and posts it back into the invoking channel as a downloadable attachment plus a "View #channel Online" link button. Categories are expanded to their text channels, the combined set is de-duped, and everything is archived channel-by-channel in one background pass.

**What it does NOT do yet:** it does not delete the original channel, and it does not move archives into a dedicated storage/index channel. So it produces archives but does not yet *reclaim* slots — see [Not Yet Built](#-not-yet-built).

---

## 🔌 Discord API — How Channel Content Is Retrieved

| Purpose | Endpoint | Method | Caller |
|---|---|---|---|
| **Fetch message history** | `GET /channels/{channel.id}/messages?limit=100[&before={cursor}]` | REST v10 via `node-fetch` directly | `fetchAllChannelMessages()` in `channelExportFetcher.js` |
| Resolve selected channel/category metadata | `GET /channels/{selectedId}` | shared `DiscordRequest()` | `archive_channel_select` |
| Expand a category to its children | `GET /guilds/{guildId}/channels` | shared `DiscordRequest()` | `archive_channel_select` |
| Post the archive (file + container) | `POST /channels/{invokedChannelId}/messages` (multipart) | `node-fetch` | `archive_confirm` background loop |
| Post the "View Online" link button | `POST /channels/{invokedChannelId}/messages` (JSON) | `node-fetch` | `archive_confirm` background loop |

**The content endpoint is `GET /channels/{id}/messages`** — the standard [Get Channel Messages](https://discord.com/developers/docs/resources/channel#get-channel-messages) REST route. Key facts:

- **`limit=100` is the hard ceiling.** There is no bulk endpoint; pagination via the `before` cursor (last message ID of the previous page) is mandatory.
- The message-content fetcher is **self-contained on purpose** — it does NOT route through the shared `DiscordRequest()` (which is load-bearing across prod and throws raw on 429). Isolating the experiment keeps the rest of the bot untouched.
- **Message Content Intent is required for text.** `content`, `embeds`, `attachments`, and `components` are redacted server-side (for both Gateway and REST) on any message the bot didn't author / isn't mentioned in, unless the **Message Content Intent toggle is ON in the Developer Portal**. This is a *portal toggle*, not a gateway-intent bitfield change — so enabling it for REST does **not** reintroduce the websocket-content memory cost RaP 0917 deliberately avoided. There is no code workaround; the redaction is server-side.

---

## 🪜 UI Flow

```mermaid
flowchart TD
  A["data_admin menu<br/>🧹 Archive Channels button"] -->|archive_channel| B["Multi-select channel/category (type 8)<br/>max_values 25 + time & intent warning"]
  B -->|archive_channel_select| C["expandArchiveSelection:<br/>per pick → category expands to children,<br/>channel adds itself; dedupe by id"]
  C --> F["Confirmation screen<br/>N channels + (categories expanded) + est. time<br/>📦 Archive (danger) / ← Back"]
  F -->|archive_confirm| G["Green 'Archiving…' ack<br/>(immediate, deferred)"]
  G --> H["setTimeout(0) background loop<br/>per channel"]
  H --> I["Fetch all messages (REST, paced)"]
  I --> J["Generate HTML"]
  J --> K["POST file + type-13 container"]
  K --> L["Resolve CDN URL from type-13"]
  L --> M["POST 'View Online' link button"]
```

1. **`archive_channel`** (`updateMessage: true`) — renders the main archive screen via `buildArchiveScreen()` (in `channelArchiver.js`): an **Archive Mode** string select (`archive_mode_select`) followed by a **multi-select channel/category select** (type 8, `channel_types: [0, 4, 5]`, `min_values: 1`, `max_values: 25`), plus **← Back** and a **Nuke Category** button (a copy of `prod_nuke_category`). LEAN-sectioned (`⚙️ Archive Mode` / `📁 Select Channels`), 14/40 components.
   - **Archive Mode** (`ARCHIVE_MODES`): only **Archive Only** (📥) is implemented — *"Save channels/categories as HTML, posted in this channel."* The rest are **stubs for future expansion**, shown with a "🚧 Coming soon" option description: Archive + Delete (🗑️), Category Archive (📁), Category Archive + Delete (🗂️), Clone Archive (📋), Move Archive (📦). Selecting a stub (`archive_mode_select`) re-renders the screen with a "coming soon" note and stays on Archive Only.
2. **`archive_channel_select`** (`deferred: true`, `updateMessage: true`) —
   - Resolves the guild's full channel list **once** — from the bot's `guild.channels.cache` (zero REST) with a single `GET guilds/{id}/channels` fallback if the cache is cold.
   - Calls the pure `expandArchiveSelection(selectedIds, allChannels, resolved)` (in `channelArchiver.js`): for each picked id, a **category (type 4)** expands to its child text/announcement channels (`0`/`5`, sorted by `position`); a channel adds itself. Results are **de-duped by id** (a `Map`), so picking a category *and* a channel inside it won't archive it twice. Selected-item types come from `req.body.data.resolved.channels` — no per-item fetch.
   - Stashes `{ channels, invokedChannelId }` in `global.pendingArchive` keyed by `${guildId}:${userId}`.
   - Renders a **confirmation screen**: total count + `(incl. N categories expanded)` note, channel list (up to 20, with overflow count), estimated time (`1–5 min` single / `N×1–N×5 min` for N channels), a red **📦 Archive** button (style 4), and **← Back**.
   - Edge case: nothing resolvable (e.g. only empty categories) → orange "No text channels found in your selection" with a back button.
3. **`archive_confirm`** (`deferred: true`, `updateMessage: true`) —
   - Pops the stashed state (deletes the map entry). If missing → red "Session expired — please start over."
   - Returns an **immediate green "📦 Archiving…" ack** with a ← Data button.
   - Kicks off a **`setTimeout(0)` background loop** that runs *after* the factory sends the ack, so the per-channel work escapes the interaction response path. Each channel's archive message lands in the channel as it completes.

---

## 🔁 Per-Channel Archive Loop (background)

`app.js`'s `archive_confirm` just kicks off `archiveChannels(channels, invokedChannelId)` via `setTimeout(0)` — all the work lives in **`channelArchiver.js`**. For each channel:

1. **Fetch** — `fetchAllChannelMessages(channel.id, { onProgress })` → `{ messages, total429, batches }`, sorted oldest-first. Progress logs every 500 messages.
2. **Render** — `generateExportHTML(channel.name, messages)` → self-contained HTML string. Filename: `${channel.name}-export-${YYYY-MM-DD}.html`.
3. **Size check / split** — if the rendered HTML exceeds `SAFE_UPLOAD_BYTES` (9 MiB, under Discord's ~10 MiB upload cap), the messages are split into `ceil(bytes / 9MiB)` parts and each part is posted separately (`-partN` suffix, "Part i/N" in the header). Otherwise it posts as one message.
4. **Build container** — Components V2 type-17 container: channel header, a metadata block (✉️ message count, 🗂️ archive date, 📅 first/last message — all `<t:unix:F>` hammertimes), a **type-13 (File) component** referencing `attachment://${filename}`, and the Option 1/2/3 caption.
5. **POST file (paced + retried)** — `multipart/form-data` to `POST /channels/{invokedChannelId}/messages` via the shared **`createMessagePoster`** (see [Write-path rate limits](#-write-path-rate-limits)), with `payload_json` carrying `flags: 1<<15` (IS_COMPONENTS_V2), `components: [container]`, and `attachments: [{ id: 0, filename }]`.
6. **Resolve CDN URL** — ⚠️ **for Components V2 + type-13 messages, Discord resolves the `attachment://` URL *inside the component* (`postData.components[...].file.url`), NOT in the top-level `attachments[]` array.** The code tries `attachments[0].url` first (fallback in case Discord changes behaviour), then recursively walks `components` for a type-13 whose `file.url` no longer starts with `attachment://`. This was the key gotcha — see commit `9de60a7e`.
7. **POST link button (paced + retried)** — a **second POST** (JSON, not a PATCH of the first message) creates a separate message with a row of `[🔄 Refresh Link] [View #{channelName} Online] [✨ Restore]` (link button truncated to Discord's 80-char limit). (A separate POST was needed because editing/PATCHing the file message to add the button didn't work reliably — commit `9de60a7e`.)
   - **Refresh Link** (`archive_refresh_{fileMessageId}`): the htmlpreview link wraps a signed Discord CDN URL that expires (~24h). A link button (style 5) has no `custom_id` and can't refresh itself, so this sibling real button does it: on click (`archive_refresh_*` handler, `updateMessage`), it re-`GET`s the **file message** (Discord re-signs attachment URLs on every fetch via `getArchiveFileUrl`), then `setLinkButtonUrl` rewrites the link button's URL in place on this message. Works indefinitely as long as the file message exists; if it's been deleted, the message shows a "could not refresh" note. The file message id is baked into the refresh button's `custom_id` (~35 chars).

Errors are caught per-channel: a red error message is posted to the channel and the loop continues. After the run, if more than one channel was requested, a **final summary** (`✅ N archived` / `⚠️ N archived, M failed`) is sent as an **ephemeral interaction followup** — only the invoking user sees it, and it is **never posted publicly**. On runs that outlast the ~15-min interaction token, the followup returns **401 / `Invalid Webhook Token` (50027)** — this is *expected* (a 263-channel run took ~24 min), so the summary is **silently skipped** and logged as an `ℹ️` info line (not an error → the PM2 error logger ignores it). The per-channel archive posts already show the result in-channel, so nothing public is leaked.

---

## 🧵 Threads

Threads are **separate channels**, so `GET /channels/{id}/messages` never includes them — the original export silently dropped all thread content (e.g. the S13/S14 graphics award threads). Now captured:

**Discovery** (`channelExportFetcher.js`): `fetchGuildActiveThreads(guildId)` runs **once per run** (guild-wide active threads, filtered by `parent_id`); `fetchChannelThreads(channelId, { activeThreads })` adds **public archived** (paginated on `has_more`, cursor = `thread_metadata.archive_timestamp`) and **private archived** (skipped gracefully with an `ℹ️` log if the bot lacks `MANAGE_THREADS`), deduped by id. Each thread is itself a channel, so `fetchAllChannelMessages(thread.id)` fetches its messages (same per-channel paced bucket).

**Rendering** (`channelExport.js`): a thread attaches under the message that started it — **`thread.id === the source message's id`** ([Discord docs](https://docs.discord.com/developers/resources/channel)). It renders as a **Discord-style collapsible card** (native `<details>`, collapsed by default): `🧵 {name} · N messages`, expanding to the thread's messages (same renderer, indented with a left accent border). Threads whose parent message isn't in the export → a trailing **🧵 Threads** section. Search **auto-expands** any collapsed thread containing a match. Every `.msg` now carries `data-mid="{id}"` (anchoring + future deep-links).

**Metadata:** the archive post adds a `🧵 Threads: N (M messages)` line when present.

**Caveats:** thread-heavy channels add many paced GETs (one discovery pass + one message-fetch per thread) → noticeably longer runs. On split (>9MB) archives, each thread rides with the part containing its parent message; orphans go to the last part. **Threads are render-only** — they are *not* in the restore embed, so **Unarchive does not recreate threads** (out of scope for now).

---

## ⚡ Write-Path Rate Limits

> **Refined assumption (2026-06-13).** The original design assumed the bottleneck was the **read** path (`GET …/messages`) and paced *that*. In practice reads were never the problem — live runs show "0 rate-limit waits" on fetch. The bottleneck is the **write** path: posting archives back into the invoking channel.

**Why it 429-stormed:** every channel does **2 POSTs to the *same* channel** (file + link button). Archiving a category of N channels fires ~2×N `POST /channels/{id}/messages` at one channel, and `POST /channels/{id}/messages` has its own **per-channel bucket (~5 msgs / 5s)**. The old loop had **no write pacing and no retry**, so:
- File-POST 429 → `continue` → **the whole channel was silently skipped** (no archive posted, only a console error). This is the "seemed to silently fail" symptom.
- Button-POST 429 → file posted but no "View Online" button.
- Observed live: failures every ~2s, `retry_after` ≈ 0.3–0.45s, `scope: user` — textbook per-channel message-create bucket.

**Fix — `createMessagePoster(channelId)` in `channelExportFetcher.js`:** a single poster instance is created per run and used for *every* write. Because all writes target the one invoking channel (one bucket), it naturally serialises them. It:
- reads `x-ratelimit-remaining` / `x-ratelimit-reset-after` and spaces out the next POST when the budget is exhausted (pure, tested `computePostPacing()`);
- on 429, reads `retry_after`, waits, and **retries the same POST** (up to 8 times) — callers never see a rate-limit error, they just wait;
- returns non-429 errors (e.g. **413**) to the caller without retrying (a 413 is deterministic — retrying won't help; the size-split in step 3 prevents it instead).

**413 "Request entity too large":** Discord caps uploads at ~10 MiB (boost level 0). `#🪵logs` exceeded this and failed outright before the fix. Now handled proactively by splitting oversized HTML into parts (step 3); the poster also surfaces any residual 413 as a per-channel error instead of a silent skip.

**Scope note:** this feature is TEST-server-only, super-admin-only, with 1–2 users — so the goal is "don't generate a storm of errors / don't silently drop channels," not aggressive throughput. Slower-but-reliable is the right trade. The background run posts via raw bot REST (not the interaction token), so it is **not** bound by the 15-min interaction limit and can pace as long as needed.

---

## 🧩 Modules

### `channelArchiver.js` — background run orchestrator
`archiveChannels(channels, invokedChannelId, { interactionToken, applicationId, client, guildId })` — the whole per-channel loop (fetch → render → size-split → paced POST file → resolve CDN → paced POST button), per-channel error reporting, mention-resolver setup, and the final ephemeral run summary. Extracted from `app.js` so the router stays thin.
- **`expandArchiveSelection(selectedIds, allChannels, resolved)`** — pure, unit-tested helper for the multi-select: expands categories, dedupes by id, returns `{ channels, categoryCount }`. Used by `archive_channel_select`.
- **`buildArchiveScreen(mode, note)`** + **`ARCHIVE_MODES`** — builds the main archive screen container (Archive Mode select + channel select + nav). Shared by `archive_channel` and `archive_mode_select`. Only `archive_only` is implemented; other modes are stubs.

### `channelExportFetcher.js` — rate-limited REST (read **and** write)
- **`fetchAllChannelMessages(channelId, { onProgress, maxConsecutive429 = 10 })`** — read path. Header-driven pacing via pure, unit-tested `computeRateLimitDelay({ remaining, resetAfter })`: bursts the per-channel request budget, then sleeps `reset-after` (+150ms buffer) when exhausted. **429 backstop:** reads `retry_after`, sleeps, retries the *same* cursor; aborts after 10 consecutive 429s (Discord's invalid-request ceiling is 10,000 × 401/403/429 per 10 min → temporary Cloudflare IP ban, so it never blind-retries). Returns `{ messages, total429, batches }`, oldest-first.
- **`createMessagePoster(channelId, { maxRetries = 8 })`** — write path. Returns a bound poster that paces from response headers and transparently retries 429s (pure, unit-tested `computePostPacing()`). Handles both multipart (FormData) and JSON bodies; caller passes content headers only, the poster adds `Authorization`. See [Write-Path Rate Limits](#-write-path-rate-limits).
- **`fetchGuildActiveThreads(guildId)`** / **`fetchChannelThreads(channelId, { activeThreads })`** — thread discovery (active + public/private archived, paginated, deduped). See [Threads](#-threads).

**Empirically measured** (CastBot-Dev, 2026-06-04): `GET /channels/{id}/messages?limit=100` → per-channel bucket, **limit 5 / window ≈5s**, sustainable ≈1 req/s, 429 `retry_after` ≈0.357s, scope `user`. Paced at the header rate, **zero 429s** across the test runs. The live archive in prod logs (2026-06-13) fetched a 2,721-message channel in 28 batches with **0 rate-limit waits**.

### `channelExport.js` — HTML generator
`generateExportHTML(channelName, messages, resolver, threads)` → a single self-contained HTML document (all CSS inline, no external deps), Discord dark-theme styled, with a client-side search bar, author/avatar rendering, message grouping (same author within 7 min), date separators, embeds, image/file attachments, reactions, and **threads** (collapsible cards).

- **`renderMessageList(messages, ctx, threadsByParentId?, restoreSink?)`** — shared message renderer used for the channel body **and** each thread's contents; attaches a thread collapsible after its parent message.
- **`partitionThreads(messages, threads)`** (pure, tested) — splits threads into `{ byParentId, orphans }` by `thread.id === message.id`.
- **`extractComponentText(components)`** walks the Components V2 tree (type-10 Text Display + type-2 Button labels, recursing into containers/sections/action-rows and Section accessories) so **CastBot's own messages render** — their text lives in `components`, not `content`, and would otherwise show `[no content]`.
- **`renderContent(text, ctx)` / `renderInline(text, ctx)`** — a small Discord-flavoured markdown renderer (replaced the old `markdownToHtml`). Handles bold/italic/underline/strike/inline-code/URLs, **fenced code blocks**, **headings/blockquotes/lists**, **spoilers** (`||…||`, click/hover to reveal), **custom emoji** (`<:name:id>` → CDN `<img>`), **timestamps** (`<t:unix:style>`), and **mentions** (see below). HTML-token outputs are stashed behind `\x00`/`\x01` sentinels before escaping and restored after — chosen specifically so bare digits in real text (e.g. "Top 5 players", code-block contents) can't collide with placeholders.

#### Mention resolution — names baked at archive time
Mentions render as Discord-style pills with **real names**, resolved **when the archive is generated** and baked into the static HTML. The opened file makes **no live calls** (it can't — no auth/CORS); an archive is therefore a point-in-time snapshot (later renames/deletes don't change it).

| Token | Resolved from | Cost |
|---|---|---|
| User `<@id>` / `<@!id>` | the message's own `mentions[]` (already in the fetched JSON), seeded by guild member cache | free |
| Role `<@&id>` | bot `guild.roles.cache` (name + colour) via the `resolver` built in `channelArchiver.js` | free (cache) |
| Channel `<#id>` | bot `guild.channels.cache` | free (cache) |
| `@everyone` / `@here`, emoji, timestamps | special-cased / parsed | free |

`channelArchiver.js` builds the `resolver = { users, roles, channels }` **once per run** from `client.guilds.cache.get(guildId)` (passed in from `archive_confirm` as `client` + `guildId`). Unresolvable IDs fall back to `unknown-user` / `deleted-role` / `deleted-channel`. **No per-mention REST calls** — important given the write-path rate-limit work.

---

## 🐞 Bugs Fixed Along The Way

1. **Rate-limit crash on large channels (read path).** The original export used a fixed 300ms delay (~3.3 req/s) against a ~1 req/s ceiling → guaranteed 429 past ~13 batches. Fixed by the header-aware fetcher.
2. **All content exported as `[no content]`.** Message Content Intent was off in the Developer Portal → REST returned empty `content`. Fixed by enabling the **portal toggle** for CastBot-Dev (no code/gateway change). Both CastBot (33 guilds) and CastBot-Dev (24) are under the 100-guild verification threshold, so the toggle is free.
3. **Components V2 (bot) messages rendered blank.** Bot text lives in `components` (type-10), not `content`. Fixed by `extractComponentText()`.
4. **CDN URL not in `attachments[]` for type-13 messages.** Discord puts the resolved URL inside the type-13 component. Fixed by the recursive `findType13Url()` walk.
5. **Write-path 429 storm + silent channel skips (2026-06-13).** Category archives fired ~2 message-POSTs per channel at one channel with no pacing/retry → constant 429s, and a 429 on the file POST silently skipped the whole channel. Fixed by routing all writes through `createMessagePoster` (paced + retried). See [Write-Path Rate Limits](#-write-path-rate-limits).
6. **413 on huge channels (2026-06-13).** `#🪵logs` HTML exceeded Discord's ~10 MiB upload cap and failed outright. Fixed by splitting oversized archives into <9 MiB parts.

---

## 🔘 Button Registry

Registered in `buttonHandlerFactory.js` `BUTTON_REGISTRY`:

| custom_id | Label | Style | Parent |
|---|---|---|---|
| `archive_channel` | Archive Channels | Secondary 🧹 | `data_admin` |
| `archive_channel_select` | Archive Channel Select | Secondary 🧹 | `archive_channel` |
| `archive_confirm` | Confirm Archive | Danger 📦 | `archive_channel_select` |

All three use `ButtonHandlerFactory.create()` (`[✨ FACTORY]` in logs). The two file/button POSTs in the background loop are raw `node-fetch` calls (not interactions), so they don't appear in the factory.

---

## ✨ Restore (🧪 experimental, reversible)

Rebuilds a channel from its archive. The **✨ Unarchive** button (Option 3; 3rd in the archive button row, `archive_restore_{fileMessageId}`) is **visible to everyone**, but only **admins / prod team** (`hasAdminPermissions`) can run it — non-admins get a generic ephemeral "Restricted — contact the Production team" message. Restored channels (and the **📂 CastBot Archives** category) are created **private** (deny `VIEW_CHANNEL` for `@everyone`, bot keeps access).

**Data source:** every archive HTML now embeds a compact JSON payload — `<script id="cb-archive-data">{ v, channel, messages:[{n,a,c,t}] }` — written by `generateExportHTML` (n=author name, a=avatar URL, c=raw text, t=ISO timestamp). Restore reads *that*, not the rendered DOM. Archives created **before** this feature have no payload → Restore returns a clear "re-archive to enable" message.

**Flow** (`channelRestore.js` → `restoreFromArchiveMessage`, run in the background after an ephemeral ack):
1. Re-`GET` the file message → fresh HTML URL (via `getArchiveFileUrl`) → download HTML → `extractArchiveData`.
2. `ensureArchiveCategory` — find a **📂 CastBot Archives** category with <50 channels (Discord's category cap), else create **📂 CastBot Archives** / **(2)** / **(3)**… (`pickArchiveCategory`, pure + tested).
3. Create a text channel named after the original under that category.
4. Create a **webhook**, re-post each message through it with the original **username + avatar** (best-effort impersonation), `allowed_mentions: { parse: [] }` so **no pings fire**, content split to ≤1950 chars. Posting is **header-paced + 429-retried** via the same `computePostPacing` as the write path (webhook execute has its own per-webhook bucket). Because Discord groups consecutive same-username webhook posts, the **first message of each author group** is prefixed with `-# Originally Posted: <t:unix:f>` (the embed now carries each message's `t`) — restored messages get *current* timestamps, so this preserves the original time as a hammertime in the viewer's local zone (`formatOriginallyPosted`).
5. Delete the webhook; post header/footer markers in the new channel.

**Limits & caveats:** restores the **entire** channel (no message cap — "Unarchive" is deliberately slow; the Option 3 text warns to use it sparingly); messages get **current timestamps** (Discord can't backdate — hence the "Originally Posted" line) and **no attachments/images** (those URLs had expired); empty/image-only messages are skipped.

**Reversibility (it's experimental):** Restore only **creates** — never deletes. To undo the *content*, delete the 📂 CastBot Archives categories. To remove the *feature*, see the removal checklist at the top of `channelRestore.js` (delete the module, the `archive_restore_*` handler + registry entry, the Restore button in `postOneArchive`, and optionally the HTML embed).

---

## ⚠️ Risks / Notes

- **Privacy/retention.** Archiving persists another server's message content to Discord's CDN (and the htmlpreview proxy reads it). The feature is gated behind Reece's Stuff (`data_admin`, super-admin only).
- **"View Online" link expiry — mitigated by Refresh Link.** It proxies a signed Discord CDN URL through `htmlpreview.github.io`, and that signed URL **expires ~24h**. The **🔄 Refresh Link** button next to it re-mints a working URL on demand (re-GETs the file message → fresh signed URL → rewrites the link), so it's recoverable indefinitely. The downloadable HTML attachment from the Discord message is permanent regardless (Discord re-signs on view). *Note: inline images **inside** the HTML (message attachments) use the same expiring URLs and are NOT covered by Refresh — they'd need base64 embedding to persist; avatars/emoji/default-avatars use unsigned CDN URLs and don't time-expire.*
- **Message Content Intent at 100+ guilds** would require Discord verification — not a concern at current guild counts.
- **No slot reclamation yet** — original channels are never deleted, so this doesn't address the 500-channel cap on its own.

---

## 🚧 Not Yet Built

These were designed in the original RaP but are **not implemented**. Kept here as the forward roadmap:

- **Pre-flight estimate + tracked background job** — a size estimate before confirming and a job that posts its own result, fully escaping the 15-min interaction token for very large channels. (Today the loop runs via `setTimeout` after a deferred ack, which works because the largest known channel ≈13k msgs ≈4 min, comfortably inside the token; there's no separate job tracker or progress edits.)
- **Dedicated on-Discord archive channel** — upload HTML to a permanent archive channel and record CDN URL + metadata, instead of posting back into the invoking channel. Would also fix the ~24h link-expiry fragility.
- **Slot reclamation** — export → archive → **delete original channel** (with export-verified confirmation, cf. nuke-category pattern). *This is the actual fix for the 500-channel cap.*
- **Index / "compression" channels** — a maintained index message linking each archived channel to its HTML, rolling older archives into linked sub-channels as the index grows.

---

## 📎 Original Trigger Prompt (verbatim, for historical context)

> document in a RaP now (or edit any existing RaP), answer my following questions, then re-paste your staged approach text for me to review
>
> my questions
> So GET /channels/{id}/messages?limit=100: <-- are you able to GET more than 100 messages at a time to make it more efficient?
> Not super concerned about the big channels, i checked the biggest and oldest one i could think of and it still only had 13k messages, however please ensure we put some warnings in the channel select screen
> execute stage 1 now
> I just tried to run an export and noticed a bit of a bug, all the messages are empty, see @temp/✨new-features-export-2026-06-04.html , proof that that channel has actual message content (its a fairly small channel, less than 100 messages I'd estimate)
>
> [Reece pasted the full #✨new-features changelog as proof of real content.]
>
> happy for you to go ahead with stage 1, try see if that thing i just mentioned is a bug and fix it
> ultrathink

*Earlier context (same session): the export feature was originally built undocumented over 4 commits Mar 23–28 2026; the overhaul into "Archive Channels" (confirmation screen, per-channel loop, type-13 file, htmlpreview button, CDN-from-component fix) landed Jun 2026 across commits `76003a75` → `9de60a7e`.*
