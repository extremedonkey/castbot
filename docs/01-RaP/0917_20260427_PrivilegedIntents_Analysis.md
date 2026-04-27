# Privileged Intents — Definitive Reference

**Last updated:** 2026-04-27
**Status:** ✅ MessageContent removed in dev (verified working). Pending prod deploy.
**Supersedes:** RaP 0940 (deleted — contained outdated/incorrect claims about REST/cache/op-8 distinctions)

---

## TLDR for Future Claude Instances

CastBot has historically declared **three privileged intents** in some combination. The current state (post-2026-04-27 work):

| Intent | Code (IDENTIFY array) | Portal toggle | Reality |
|---|---|---|---|
| `MessageContent` | ❌ Removed in dev | ✅ ON in prod (will toggle off after prod deploy) | **Truly unused** — was only consumed by 2 legacy `createMessageCollector` flows that have been replaced with Modal File Upload (Type 19) |
| `GuildMembers` | ✅ Declared | ✅ ON in prod (Discord-approved) | Load-bearing for ~14 cache/op-8 sites in castlist + activity logger. Could be removed with refactor (see "GuildMembers situation" below) |
| `GuildPresences` | ❌ Never declared | ⚠️ ON in prod (toggle on by accident) | **Zero usage anywhere in code.** Safe to toggle off in Portal |

**The single most important insight from this work:** *gateway intents at IDENTIFY-time are different from Developer Portal toggles, which are different from REST API behaviour, which are different from interaction-payload data.* People (including past Claude instances) routinely conflate these. Read the next section before doing anything related to intents.

---

## ⚠️ CRITICAL: Four mechanisms, one name

Discord's "intents" naming hides **four different mechanisms**:

```
                       ┌──────────────────────────────────────────┐
                       │                Discord                   │
                       └──────────────────┬───────────────────────┘
                                          │
        ┌─────────────────┬───────────────┼───────────────┬─────────────────────┐
        │                 │               │               │                     │
   ┌────▼──────┐     ┌────▼─────┐    ┌────▼─────┐   ┌────▼─────────┐   ┌──────▼────────────┐
   │ Gateway   │     │ Gateway  │    │   REST   │   │ Interaction  │   │ App-level         │
   │ events    │     │ cache    │    │   API    │   │ payloads     │   │ permission        │
   │ (push)    │     │ (auto)   │    │ (pull)   │   │ (push)       │   │ (verification)    │
   └─────┬─────┘     └────┬─────┘    └────┬─────┘   └──────┬───────┘   └────────┬──────────┘
         │                │               │                │                    │
   Gated by:         Gated by:        Gated by:       Gated by:            Gated by:
   IDENTIFY          IDENTIFY         Portal toggle    NOTHING              Discord
   intent bits       intent bits      (per endpoint)                       verification
                                                                            review
```

| Mechanism | Example | What gates it | Why this matters |
|---|---|---|---|
| **Gateway events** | `client.on('messageReactionAdd', ...)` | IDENTIFY bitmask in `new Client({ intents })` | Removing the intent = no events delivered |
| **Gateway cache** | `guild.members.cache.get(userId)` | IDENTIFY bitmask (events populate the cache) | Removing the intent = cache stays empty |
| **REST API endpoints** | `guild.members.fetch(userId)` (single user, REST), `client.guilds.fetch(id)` | Application-level Portal toggle | Removing the IDENTIFY intent has **no effect** on REST. Only the Portal toggle does. |
| **Interaction payloads** | `req.body.member` on a button click | NOTHING — Discord delivers it because the user is invoking your bot | This is **always** available, even with zero intents and no gateway connection. The most underused free data source. |

### The exact Discord docs phrasing that trips everyone up

> *"Calling the List Guild Members endpoint requires the GUILD_MEMBERS intent **enabled** — regardless of whether it's passed during Gateway identification."*

The trap word is **"enabled"** — that means the **Portal toggle**, not the IDENTIFY array. The doc is saying "the REST endpoint works as long as the Portal toggle is on, even if you don't put the intent in your IDENTIFY array." It is **not** saying the REST endpoint requires the IDENTIFY-time declaration.

This distinction is what made the `MessageContent` removal possible: we removed the intent from the IDENTIFY array but kept the Portal toggle ON, and modal File Upload kept working because it's interaction-payload (not gateway-event) and the Portal toggle is unaffected by what's in the array.

---

## The three privileged intents — explained

Discord gates three intents behind verification approval at 100+ guilds. Under 100 guilds you can toggle them on freely; at 75+ a button appears in the Portal to apply for approval.

### `MessageContent`

**What it does (gateway):** Adds the `content`, `embeds`, `attachments`, and `components` fields to messages delivered via `MESSAGE_CREATE` / `MESSAGE_UPDATE` / `MESSAGE_DELETE` events from `GuildMessages`. Without it, those four fields are empty for messages the bot didn't author and isn't @-mentioned in.

**What it does (REST):** Same — fields are stripped from REST-fetched messages too if the Portal toggle is off.

**What it is NOT:** It is NOT required to receive reaction events, message-delete events, or any message-related event other than the four data fields it modifies. See "Reaction events confusion" below for the common gotcha.

**CastBot history:** Discord **denied** CastBot's MessageContent application in November 2025. Since then it's been a verification blocker.

**CastBot status:** ❌ Removed from IDENTIFY array as of 2026-04-27 (dev). Truly unused — both legacy consumers (`playerdata_import` createMessageCollector + `safari_import_data` createMessageCollector) have been replaced with Modal File Upload (Type 19) which delivers files via interaction payload, completely bypassing the gateway and the intent.

### `GuildMembers`

**What it does (gateway):** Delivers `GUILD_MEMBER_ADD` / `GUILD_MEMBER_UPDATE` / `GUILD_MEMBER_REMOVE` events. Also enables gateway op-8 ("Request Guild Members") used by `guild.members.fetch()` with no userId.

**What it does (cache):** Pre-populates `guild.members.cache` from `GUILD_CREATE` events and keeps it fresh via member events. Without it, the cache contains only the bot itself.

**What it does (REST):** Required (Portal toggle) for `GET /guilds/{id}/members?limit=N` (paginated all-members list endpoint). NOT required for `GET /guilds/{id}/members/{userId}` (single-user fetch).

**CastBot history:** Discord **approved** CastBot for `GuildMembers` (per user 2026-04-27). Approval is independent of whether we want to keep using it.

**CastBot status:** ✅ Still declared in IDENTIFY array. We have **zero** `client.on('guildMember*')` event listeners — meaning we don't actually consume any of the events this intent gates. We declare it purely for cache pre-population + 4 surviving `members.fetch()` no-arg sites (gateway op-8). See "GuildMembers situation" below.

### `GuildPresences`

**What it does:** Delivers `PRESENCE_UPDATE` events when guild members go online/offline/idle/dnd or change custom status. Enables `member.presence` data on cached members.

**Common confusion — "Rich Presence":** Discord also has a feature called **Rich Presence** — that's an SDK feature for **games** to display gameplay status on player profiles. It is NOT the same thing as the `GuildPresences` intent. Bots don't use Rich Presence. The naming collision is regrettable.

**CastBot status:** ❌ Never declared in IDENTIFY array. ⚠️ Toggled ON in prod Developer Portal (toggled on at some point and never disabled). **Code grep confirms zero usage anywhere.** Safe to toggle off in Portal — would eliminate one privileged intent from the verification footprint with zero code risk.

---

## CastBot's intent configuration

### Code (`app.js:1532-1539` as of 2026-04-27)

```javascript
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,           // Privileged. Powers castlist, season apps, role/permission checks
    GatewayIntentBits.GuildMessages,          // Required for messageDelete (reaction-message cleanup) — does NOT need MessageContent
    GatewayIntentBits.GuildMessageReactions   // Reaction roles (timezone/pronoun/ban)
    // MessageContent (privileged) intentionally REMOVED — see RaP 0917
    // Both file imports (playerData + Safari) now use Modal File Upload (Type 19) which delivers
    // attachments via interaction.data.resolved.attachments — does NOT consult the gateway intent.
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  ...
});
```

### Active gateway listeners (the entire reason the gateway connection exists)

| Listener | File:line | Intent it depends on |
|---|---|---|
| `client.once('ready')` | `app.js:1696` | None (always fires) |
| `client.on('guildCreate')` | `app.js:1842` | `Guilds` |
| `client.on('messageReactionAdd')` | `app.js:50519` | `GuildMessageReactions` |
| `client.on('messageReactionRemove')` | `app.js:50783` | `GuildMessageReactions` |
| `client.on('messageDelete')` | `app.js:50897` | `GuildMessages` |

That's it. **5 listeners total. Zero of them are member events.** The bot is fundamentally a request/response application driven by interaction webhooks; the gateway connection is a side-channel for reaction roles + a few cleanup conveniences.

### Portal state (per user, 2026-04-27, prod)

| Intent | Approved? | Toggled ON? | Currently used by code? |
|---|---|---|---|
| Server Members (`GuildMembers`) | ✅ Yes | ✅ Yes | ✅ Yes |
| Message Content (`MessageContent`) | ❌ No (denied Nov 2025) | ✅ Yes (legacy) | ❌ No (in dev) |
| Presence (`GuildPresences`) | (unknown — irrelevant) | ⚠️ Yes (accidental) | ❌ No |

CastBot is at ~97 guilds, approaching the 100-server wall. Verification is the path past it.

---

## What was done (2026-04-27 work)

The MessageContent removal landed across multiple commits in dev. Here's the playbook for understanding what shipped:

### 1. Modal File Upload pattern (the foundation)

`src/fileImportHandler.js` is the canonical implementation:
- `buildFileImportModal(importType, guildId, configId?)` — returns a type 9 (MODAL) interaction response with a Label (type 18) wrapping a File Upload (type 19)
- `processFileImport({ importType, guildId, userId, resolved, components, client, configId })` — extracts attachment from `data.resolved.attachments`, downloads via `attachment.url`, routes to per-type handler

The MODAL_SUBMIT handler at `app.js:39853` (search `file_import_submit:`) routes all submits through `processFileImport`. The custom_id format is `file_import_submit:{importType}:{guildId}[:{configId}]`.

### 2. PlayerData import migration

| Was | Now |
|---|---|
| Button `playerdata_import` rendered legacy "drag and drop in chat" message + `createMessageCollector` 60s timeout | Button `file_import_playerdata` opens modal directly |
| Read `m.attachments.first()` (REQUIRED `MessageContent`) | Reads `data.resolved.attachments[id]` (no intent needed) |
| Cancel/timeout/delete-message scaffolding | None — modal closes itself |
| Legacy handler at `app.js:17226` | DELETED |
| Cancel handler at `app.js:18851` | DELETED |

Test result: `0 → 27 players` import succeeded byte-perfect on 2026-04-27.

### 3. Safari import migration (with Components V2 prep screen)

The user-facing path (Settings → Advanced → Import) was more complex because:
- It's reachable by any `MANAGE_ROLES` admin (not just Reece)
- The legacy flow had a critical map-prep warning users needed to see
- The new flow is two-step: prep screen → modal

What shipped:
- `safari_import_data` button handler (still wired up at `safariConfigUI.js:141` from the Settings menu) — REPLACED with Components V2 prep screen handler at `app.js:17238`. Shows the 4-step map-prep warning, has "Import" + "← Settings" buttons.
- Clicking "Import" on the prep screen triggers `file_import_safari` (the Reece-only path's modal opener) — same modal, same MODAL_SUBMIT handler, same `processFileImport` routing
- Server-side guard added to `processSafariImport` in `src/fileImportHandler.js`: if the import contains map data or coordinate-bearing customActions AND the guild has no active map, refuses with a Components V2 error card explaining the prep steps

The Reece-only path (`/menu` → Tools → Data → 🦁 Server SafariContent) hits the same `file_import_safari` handler directly, no prep screen.

Test result: full safari import succeeded with `4 stores created, 23 items, 1 map updated, 68 customActions, config updated` and the active-map merge ("ghost map fix") engaged correctly.

### 4. MessageContent removal from IDENTIFY

After both migrations were verified working, `GatewayIntentBits.MessageContent` was removed from the `Client` constructor at `app.js:1538`. Bot reconnected with `Discord client is ready!` — no `4014` close code, no errors.

### 5. Regression verified

| Path | Tested? | Result |
|---|---|---|
| Reaction-roles end-to-end (create panel, react with 💚, role assigned) | ✅ | Works — `messageReactionAdd` fired from `GuildMessageReactions` independent of `MessageContent` |
| Reaction-mapping reload on bot boot | ✅ | 12 mappings across 3 guilds reloaded cleanly |
| Modal File Upload imports (both playerData + Safari) | ✅ | Both work end-to-end |
| Bot reconnect after intent removal | ✅ | `Discord client is ready!`, no `4014`/`4013` |
| Gateway op-8 / cache (`GuildMembers` paths) | ✅ | Still works — `GuildMembers` still declared |

### Bug found and fixed during this work

`processSafariImport` was reading `refreshResult.success` but `updateAllAnchorMessages` returns `refreshResult.successful` — pre-existing typo copied forward from legacy. Fixed in same session; user-visible message now also surfaces failure count + failed coords when refresh partially fails.

---

## GuildMembers situation (still open)

The remaining privileged intent. Two reasons we still declare it:

### Reason 1: 4 surviving "fetch all members" sites

```javascript
// activityLogger.js:286
// app.js:6249  (castlist render path)
// app.js:38920 (castlist navigation path — literally the anti-pattern from RaP 0981)
// app.js:39097 (similar)

const members = await fullGuild.members.fetch();  // gateway op-8, REQUIRES GuildMembers at IDENTIFY
const tribeMembers = members.filter(member => member.roles.cache.has(role.id));
```

These are also a **documented bot-crash hazard.** RaP 0981 (Nov 2025) traced a prod bot crash to `await guild.members.fetch()` at `app.js:4717` and removed that ONE instance, recommending role-level fetches instead:

```javascript
// ❌ NEVER DO THIS — bot killer
await guild.members.fetch();

// ✅ ALWAYS DO THIS
const role = await guild.roles.fetch(roleId);
const members = Array.from(role.members.values());
```

The November fix only patched 1 site. The other 4 are still there, ticking time bombs in any guild that grows past whatever member count triggers the 60s timeout.

### Reason 2: ~10 `members.cache` reads expecting populated cache

`members.cache.get(userId)`, `members.cache.filter(...)`, `members.cache.size` — these all rely on the gateway having pushed member data into the cache. Without `GuildMembers` at IDENTIFY, cache contains only the bot itself.

### The escape hatch (per RaP 0940's surviving good insight)

**Every interaction payload includes `req.body.member` populated with the interactor's display name, roles, avatar, joined_at, etc.** This data arrives via interaction webhook (HTTPS POST), not via gateway. It is **not** subject to any intent.

CastBot could populate a manual `Map<guildId:userId, MemberSnapshot>` from every interaction. After a few minutes of normal traffic in any guild, this cache would have most active users. For users not in the manual cache, fall back to single-user `guild.members.fetch(userId)` — REST, only needs the Portal toggle, **does not need the IDENTIFY intent**.

The "render all members of role X" use case (the only thing that genuinely needs op-8 today) becomes:
- Maintain `Map<roleId, Set<userId>>` populated from interactions + playerData
- Or accept that role membership is approximate (fed by who's interacted recently)
- Or use the REST `members.list({ limit: 1000 })` paginated endpoint (gated by Portal toggle, NOT IDENTIFY)

### Effort to remove `GuildMembers` (for some future RaP)

| Step | Effort | Risk |
|---|---|---|
| Replace 4 fetch-all sites with role-level fetches per RaP 0981 pattern | Small | Low — same fix as November patch, applied to remaining sites. Also closes the crash hazard. |
| Build interaction-payload member cache (populate `Map` from every `req.body.member`) | Small | Low |
| Replace ~10 `members.cache.*` reads with manual-cache lookups + REST fetch fallbacks | Medium | Medium — castlist hot path |
| Drop `GuildMembers` from IDENTIFY array | Trivial | Low (if above done correctly) |
| Keep Portal toggle ON for REST endpoint access | Zero | None |

After this, CastBot has zero privileged intents and verification is rubber-stamp territory.

---

## Reaction events confusion (common gotcha — read this!)

When the user tested the post-removal state, they saw reactions still working and got nervous because "reactions feel like message stuff and I thought we needed MessageContent." This confusion catches everyone.

### Discord has FIVE message-related intents

| Intent | Privileged? | What it gates |
|---|---|---|
| `GUILD_MESSAGES` | No | `MESSAGE_CREATE` / `_UPDATE` / `_DELETE` events |
| `GUILD_MESSAGE_REACTIONS` | No | `MESSAGE_REACTION_ADD` / `_REMOVE` / `_REMOVE_ALL` / `_REMOVE_EMOJI` events |
| `GUILD_MESSAGE_TYPING` | No | `TYPING_START` events |
| `GUILD_MESSAGE_POLLS` | No | poll vote events |
| **`MESSAGE_CONTENT`** | **Yes** | A *modifier* — adds `content` / `embeds` / `attachments` / `components` **fields** to events from the others |

`MessageContent` is a **modifier** intent, not a separate event channel. It doesn't deliver new events; it enriches the payload of events you'd already get.

### What a reaction event actually contains

```json
{
  "type": "MESSAGE_REACTION_ADD",
  "user_id": "...",
  "message_id": "...",
  "channel_id": "...",
  "guild_id": "...",
  "emoji": { "name": "💚", "id": null }
}
```

No message text, no embeds, no attachments. Just "user X reacted with emoji Y to message Z."

### What CastBot's reaction handler reads

`reaction.emoji.name`, `reaction.message.id`, `user.id` — all in the event payload regardless of `MessageContent`. The handler does NOT read `reaction.message.content` or any of the four `MessageContent`-gated fields.

So reaction roles work because they use `GuildMessageReactions` (non-privileged, kept), not `MessageContent`. They are genuine real Discord reactions on real messages — they just don't depend on knowing what the message text says.

---

## Verification & data audit (preserved from RaP 0940)

### What CastBot stores (for the verification questionnaire)

| Data file | Contains | PII? (email/phone/address) | Encryption needed? |
|---|---|---|---|
| `playerData.json` | Discord user IDs → game roles, tribes, pronouns, timezones | No — IDs + game preferences | No (not PII) |
| `safariContent.json` | Game config, stores, items, map data | No — game state | No |
| `analyticsData.json` | Button click counts, feature usage | No — aggregated metrics | No |
| `activityLog.json` | Player game actions with timestamps | No — IDs + actions | No |
| Backup files | Copies of above | Same as source | Same as source |

**Discord defines PII as email / phone / physical address — NOT user IDs or display names.** CastBot stores zero PII. The "encryption at rest" anxiety from earlier discussions was overstated.

### Best practices regardless of privileged intents

- Provide a way for users to request data deletion (e.g. `/deletedata` command or button)
- Honor deletion requests within 30 days (Discord's recommended max retention)
- Restrict admin/data-access UIs by guild role
- These apply even if you have zero privileged intents

### The 100-server wall

- Under 100 guilds: privileged intents work freely with just the Portal toggle on
- 75+: a button appears in the Portal to apply for verification
- 100+: verification required to add new guilds
- Verified apps without privileged intents: rubber-stamp approval
- Verified apps WITH privileged intents: questionnaire + human review (Discord may deny — they denied CastBot's `MessageContent` in Nov 2025)

CastBot is at ~97 guilds. Verification is the path past 100. Fewer privileged intents = easier verification.

---

## Path forward

### Phase A: deploy MessageContent removal to prod (NEXT)

1. Wait 24-48 hours of dev stability with current state
2. Deploy current dev to prod via `npm run deploy-remote-wsl` (with explicit per-deploy permission per `feedback_prod_deploy.md`)
3. Verify prod logs: `npm run logs-prod | grep -E "Ready|4014|4013"` — expect `Ready`, no errors
4. Run a smoke-test import in a low-stakes prod guild
5. After ~24 hours of prod stability, toggle `MessageContent` OFF in prod Developer Portal
6. Apply for verification at 100 guilds with `MessageContent` removed from the form

### Phase B: clean up Portal cruft (LOW EFFORT, NOW-ABLE)

- Toggle `Presence Intent` OFF in prod Portal — zero code risk, code grep confirms zero usage
- Can be done independently of any deploy

### Phase C: GuildMembers refactor (FUTURE, separate RaP if/when prioritised)

The two-for-one fix:
1. Replace 4 surviving fetch-all sites (`activityLogger.js:286`, `app.js:6249`, `app.js:38920`, `app.js:39097`) with role-level fetches per RaP 0981 pattern — also closes the crash hazard from those sites
2. Build interaction-payload member cache
3. Replace `members.cache.*` reads with manual-cache + single-user REST fallbacks
4. Drop `GuildMembers` from IDENTIFY array
5. Keep Portal toggle ON for REST endpoint access
6. Now: zero privileged intents in IDENTIFY array

After Phase C, CastBot is a fully zero-privileged-intent bot. Verification becomes a formality.

---

## What changed from RaP 0940 (now deleted)

For future Claude instances trying to reconcile any references they find:

| RaP 0940 said | Truth (post 2026-04-27 work) |
|---|---|
| "169+ code locations use GuildMembers functionality" | ~140 across 19 files. Inflated count from earlier. |
| "guild.members.fetch() — may still work (REST API fallback)" | **Wrong.** `fetch()` no-args uses gateway op-8, requires intent at IDENTIFY. Single-user `fetch(userId)` is REST and works without IDENTIFY (only needs Portal toggle). |
| "Replace bulk fetches with `guild.members.list({ limit: 1000 })`" then later said `list()` also needs the intent | Confusing self-contradiction. The truth: `list()` REST endpoint requires the **Portal toggle** (not IDENTIFY array). So `list()` works after IDENTIFY removal as long as Portal toggle stays on. |
| "REST API ≠ Intent-Free" framing | Misleading. Better framing: REST is gated by Portal toggle; IDENTIFY array is gated separately and only affects gateway events + cache. These are independent layers. |
| "Migration Effort: LOW" for MessageContent | Confirmed accurate. ~2 hours of focused work for both flows. |
| "Interaction payloads are the escape hatch" | ✅ Genuinely the most useful insight in 0940. Preserved in this doc. |
| Discord denied MessageContent application Nov 2025 | ✅ Historical fact. Preserved. |
| The "An AI agent removed intents and broke things" incident | ✅ Cautionary tale. Preserved as the reason this doc emphasises gateway-vs-REST-vs-Portal-vs-interaction distinctions. |

---

## Related Documentation

- **[ComponentsV2.md — File Upload (Type 19)](../standards/ComponentsV2.md)** — Modal File Upload component reference
- **[Gateway.md](../standards/events/Gateway.md)** — Gateway protocol, intents bitmask, close codes
- **[SafariImportExport.md](../03-features/SafariImportExport.md)** — Safari import system
- **[RaP 0981](0981_20251105_Castlist_Crash_RootCause_Analysis.md)** — Documented `members.fetch()` no-args as a bot-crash hazard. The 4 surviving sites in Phase C above are the unfixed remainder.
- **[Discord Gateway Docs — Privileged Intents](https://docs.discord.com/developers/events/gateway)** — Official intent documentation
- **[Discord File Upload Reference](https://docs.discord.com/developers/components/reference#file-upload)** — Official type 19 docs
- `src/fileImportHandler.js` — canonical Modal File Upload implementation
- `app.js:1532` — Client constructor / IDENTIFY array
- `app.js:50519, 50783, 50897` — gateway listeners (reaction roles, message delete cleanup)
- `app.js:9585` (file_import_safari), `app.js:9602` (file_import_playerdata), `app.js:39853` (file_import_submit MODAL_SUBMIT) — modal handlers
- `app.js:17238` — Components V2 safari import prep screen (Settings → Advanced → Import path)

---

## Original Context (from RaP 0940, preserved)

> discord has an annoying 100 server limit unless you've verified you aren't using a thing called priviledged intents.. which i was told unequivocally by an agent that i wasn't.. so i was like sure.. remove the declaration.. nek minnit.. safari import breaks.. (and all other json imports).. and then im like.. ok but doesn't discord have a new file upload widget (link) and its like no.. thats for hosts TO provide files to download.. and then i check the link later and i was right.. so we could go after that to try and kill the use of priviledged intents so i dont have to do a heap of annoying paperwork and get encryption at rest working on the off chance someone hacks my rando bot on the outer edges of the internet to steal not very secret data..

The 2026-04-27 work delivered on this — `MessageContent` removed, modal File Upload validated end-to-end, the 4-mechanism conflation that caused the original "agent removed intents and broke things" incident now documented in this canonical reference. `GuildMembers` and `Presence` are the remaining items, with the path forward documented above.
