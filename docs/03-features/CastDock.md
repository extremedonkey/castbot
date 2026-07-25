# CastDock

**Status**: ✅ Active — deployed to production 2026-07-25.
**Audience for this doc**: written for a zero-context Claude Code agent picking this up cold. If you're modifying CastDock, read this whole file before touching `castDock.js` — the design has several non-obvious constraints that look like bugs if you don't know the reasoning behind them.

## What CastDock Is

CastDock is a "sticky message" feature, the same pattern popular Discord utility bots use for pinned rules/welcome messages: a player's `/menu` gets pinned to a channel as a **public** (non-ephemeral) message that is always the newest message in that channel. Whenever anyone posts in the channel, CastBot deletes the old CastDock message and reposts a fresh copy at the bottom — so it never gets buried under chat.

The intended use case is a player's **subs/submission channel** (see [SurvivorContext.md](../concepts/SurvivorContext.md) — a private player+host channel). Instead of the player having to run `/menu` every time they want to act, their menu just lives at the bottom of the channel, always clickable.

Every other menu in CastBot is ephemeral (private, visible only to whoever invoked it). CastDock is the one exception: a real, non-ephemeral message that anyone in the channel can see and click.

## Origin Context

Built in response to a user request to explore "a Discord bot that keeps a sticky message on a channel — whenever another user posts, it deletes its old message and reposts down the bottom." The initial ask was specifically about understanding **Discord intents/privileges** needed (the user was worried about polling/heavy resource use) before committing to build it. Key finding that shaped the whole design: **no new privileged intent was needed** — `GatewayIntentBits.GuildMessages` (non-privileged) was already declared in `app.js` for `messageDelete` cleanup (reaction-role bookkeeping), and that same intent delivers `MESSAGE_CREATE` events. CastDock's `messageCreate` listener was the first thing in the codebase to actually consume that event stream — Discord had been pushing those events over the gateway the whole time, just unread.

The feature was then iterated heavily in a single session: full-menu integration → a "compact view" redesign (multiple rounds, driven by live testing and mobile-rendering feedback) → direct-action wiring for specific buttons → a privacy notice. All of that history matters for understanding *why* the code looks the way it does — see "Design Decisions & Their Reasoning" below.

## Architecture — No Polling, Purely Event-Driven

```mermaid
flowchart TD
    A[Player enables CastDock<br/>via Enable/Disable select] --> B[applyCastDockToggle]
    B --> C[setCastDockConfig<br/>persists to playerData.json]
    B --> D[client.castDockChannels.set<br/>in-memory cache entry]
    B --> E[repostCastDockMenu<br/>immediate first post]

    F[Anyone posts a message<br/>anywhere, any guild] --> G{client.on 'messageCreate'}
    G --> H[client.castDockChannels.get channelId]
    H -->|no entry| I[return — O(1), zero disk I/O]
    H -->|entry found| J[evaluateCastDockTrigger]
    J -->|bot author| I
    J -->|within 3s cooldown| I
    J -->|repost| K[repostCastDockMenu]

    K --> L[Fetch target member fresh<br/>never cached]
    L --> M[buildCompactCastDockMenu]
    M --> N[POST new message<br/>raw REST fetch]
    N --> O[DELETE old message<br/>post-then-delete order]

    P[channelDelete event] --> Q[handleCastDockChannelDelete<br/>cleans up config + cache]
```

**Why this is cheap even at scale**: `GuildMessages` means Discord already pushes a `MESSAGE_CREATE` dispatch for every message in every channel across every guild the bot is in — this was true before CastDock existed. The listener does a single `Map.get(channelId)` for each one; for the overwhelming majority of messages (any channel without CastDock enabled) that's the entire cost — no disk I/O, no API calls, no per-message `loadPlayerData()`. Memory cost is one small object per **enabled channel**, not per guild or per message.

**Cooldown**: `CASTDOCK_COOLDOWN_MS = 3000`. The cooldown slot (`entry.lastRepostAt = Date.now()`) is claimed **synchronously, before any `await`**, inside the `messageCreate` handler — Node dispatches `EventEmitter` listeners synchronously up to their first `await`, so two rapid-fire messages in the same channel can't both pass the check and cause a double-repost race.

## Data Model

```jsonc
// playerData[guildId].castDock.channels[channelId]
{
  "enabled": true,
  "targetUserId": "<discord user id — the player whose menu stays pinned, fixed at Enable time>",
  "enabledBy": "<user id who clicked Enable — self in PLAYER mode, admin in ADMIN mode>",
  "enabledAt": 1753432100000,
  "disabledAt": null
}
```

**Deliberately NOT persisted**: `lastMessageId` and `lastRepostAt`. These live only in the in-memory cache (below). Persisting them would mean a `withStorageLock`-guarded playerData write on *every single chat message* in an active channel — exactly the hot-path write-amplification `storage.js`'s own docs warn against. Consequence: a bot restart between messages can rarely leave one orphaned stale message behind (cosmetic, self-limiting — see boot reconciliation below).

**Whose menu reposts, and why it's fixed, not dynamic**: `targetUserId` is captured once, at Enable time, and every repost always renders *that* player's menu — regardless of who posted the triggering message. This was a deliberate design choice: a subs channel is one player + one host; if the host posts a message, reposting *the host's own* menu would make no sense. The whole point of CastDock is keeping one specific player's control panel visible.

## In-Memory Cache — `client.castDockChannels`

A `Map<channelId, {enabled, targetUserId, guildId, lastMessageId, lastRepostAt}>` attached directly to the discord.js `Client` object. Modeled explicitly on the pre-existing `client.roleReactions` cache (reaction-role mappings) — same "populate at boot, check first in the hot path, update in place on every write" pattern.

- **Populated at boot** by `initCastDockCache(client)` (called from the `client.once('ready', ...)` handler in `app.js`, right after the reaction-mappings boot-load block). Iterates every guild in `playerData`, builds the cache, then does **best-effort reconciliation**: for each enabled channel, fetches the most recent message and adopts its ID as `lastMessageId` if it was posted by the bot itself — this prevents a restart from creating a duplicate sticky message.
- **Kept in sync** by every write site (`applyCastDockToggle`, `handleCastDockDisable`, `handleCastDockChannelDeleted`) updating the Map immediately alongside the persisted write — never *inside* a `withStorageLock` body (which must stay fast, no Discord API calls).
- Boot log line to check after any deploy: `📥 CastDock: N channel(s) enabled across all guilds`.

## Two Render Modes

CastDock has two distinct UIs, both built in `castDock.js`, that a viewer can toggle between:

### Compact (the default / steady-state view)

Every repost (triggered by chat activity) always renders compact — this is intentional; an expanded view resets back to compact on the next repost, no persistence of "was expanded" state (kept deliberately simple: not asked for, would add complexity for a feature nobody was yet using in prod when this decision was made).

```
[## CastDock                                    ^]   ← Section header, '^' = accessory button (castdock_expand)
💰300 · 🧰1 · 📍A1 · ⚡11/11 (♻️MAX)                    ← buildPlayerStatsLine() output ONLY
─────────────────────────────────────────────────
[🕹️][🧰][🗺️][⚡][🏃][🛠️][⚡][🏪]                        ← Safari row, emoji-only labels stripped
```

Built by `buildCompactCastDockMenu(client, guildId, targetMember, playerData, channelId, activeSelectCategory?)`:
- Header is a **Section** (type 9) with the `^` toggle as its `accessory` — not a plain Text Display. (A round of live mobile testing found the button sometimes wraps to its own line on narrow screens regardless — confirmed as normal Discord client behavior for Section+Button accessories, not a markup defect; Section+Thumbnail accessories stay inline on both platforms, Section+Button doesn't always on mobile.)
- Player info is **just the stats line** (`buildPlayerStatsLine()`, extracted out of `createPlayerDisplaySection` in `playerManagement.js` specifically so compact mode could render it standalone) — no name/mention, no pronouns/age/timezone, no "Local time" line, no thumbnail. All were explicitly requested removed across several iterations to keep the sticky message minimal.
- Row 2 buttons (`COMPACT_ROW2_IDS = ['commands', 'inventory', 'map', 'stamina', 'challenges', 'crafting', 'actions', 'stores']`) — no Currency (removed), no section heading text above them, all emoji-only (`stripButtonLabels()` deletes every button's `label`, keeping only `emoji`). `'commands'` is listed **first** deliberately: `buildSectionRow` chunks visible buttons into ActionRows of 5 in array order, so putting `commands` first guarantees it lands in the same row as whatever else is visible, satisfying an explicit "put Commands in the same row as Currency" request from before Currency was later removed.
- No Row 1 (Castlists & Profile) and no Advanced section (Stats/CastDock-config buttons) at all in compact mode — reconfiguring CastDock itself only happens from the expanded full view.
- `activeSelectCategory` (optional 6th param): when set to `'crafting'` or `'challenges'`, appends that category's existing hot-swap select (`buildSuperSelect(...)`, from `playerManagement.js`) inline below the button row — see "Direct-action buttons" below for why only these two categories work this way.

### Full (the expanded view — the pre-existing player menu, unmodified)

Reached via the `^` toggle, or automatically when clicking certain compact buttons. This is literally `createPlayerManagementUI()` — the same shared builder every other menu in the codebase uses — with one addition: `createPlayerManagementUI` checks `client.castDockChannels?.has(channelId)` and, if true, appends a `⌄` collapse-toggle button as the **last item in the bottom footer ActionRow** (alongside Guide/← Menu/Logs, wherever those apply). This check is **channel-scoped, not mode-scoped** — it fires for *any* menu rendered in a CastDock-enabled channel, including a normal `/menu` someone runs there, not just CastDock's own renders. That's intentional: seeing "this channel has a pinned sticky menu, click to collapse it" is useful context regardless of how you got there.

## Direct-Action Button Wiring (compact mode only)

Four of the eight compact-row buttons have custom_ids **remapped** away from the shared full-menu handlers, via `COMPACT_DIRECT_ACTION_REMAP` + `remapCompactButtonIds()`:

| Original custom_id | Remapped to | Behavior |
|---|---|---|
| `player_set_inventory` | `castdock_view_inventory` | Skips the hot-swap select entirely — jumps straight to the ephemeral inventory view (`createPlayerInventoryDisplay`), always for CastDock's fixed target player |
| `player_set_map` | `castdock_view_navigate` | Skips the select — jumps straight to the navigate pane (`getMovementDisplay`), same fixed-target behavior. Falls back to an ephemeral "hasn't started exploring" message if the target has no map coordinate |
| `player_set_crafting` | `castdock_open_crafting` | Appends the **existing** crafting hot-swap select inline below the compact row (`updateMessage: true`) instead of switching to the full menu |
| `player_set_challenges` | `castdock_open_challenges` | Same, for the challenges select |

`commands`, `stamina`, `actions`, `stores` are **untouched** — clicking them still routes through the original shared custom_ids and opens the full menu, exactly like every other menu button in the codebase. Only these four were explicitly requested to behave differently.

Once a crafting/challenges select is showing and the user picks a real option, that selection is handled by the **unmodified, pre-existing** `player_menu_sel_crafting` / `player_menu_sel_challenges` handlers in `app.js` — CastDock does not duplicate that execution logic, it only controls how the select gets *opened*.

## Full Custom ID Reference

| custom_id | Where | What it does |
|---|---|---|
| `player_set_castdock` | Row 3 (Advanced), full menu only | Opens the Enable/Disable select (player self-service, `security: 'public'`) |
| `admin_set_castdock_*` | Row 3 (Advanced), full menu, admin mode | Same, admin managing another player (`requiresPermission: ManageRoles`) |
| `player_menu_sel_castdock` | The select itself, player mode | Toggles via `applyCastDockToggle`; on Enable shows the privacy notice, on Disable re-renders the menu |
| `player_menu_sel_castdock_*` | The select itself, admin mode | Same, admin-gated |
| `castdock_ack_notice` / `castdock_ack_notice_*` | "Got it" button on the privacy notice | Dismisses the notice, returns to the normal menu with CastDock category active |
| `castdock_expand` | Compact view header accessory | Switches to the full menu (`createPlayerManagementUI`) |
| `castdock_collapse` | Full view footer (any CastDock channel) | Switches back to compact (`buildCompactCastDockMenu`) |
| `castdock_view_inventory` | Compact row (remapped) | Ephemeral inventory view for the fixed target, bypassing the select |
| `castdock_view_navigate` | Compact row (remapped) | Ephemeral navigate pane for the fixed target, bypassing the select |
| `castdock_open_crafting` / `castdock_open_challenges` | Compact row (remapped) | Appends the real select inline, stays in compact layout |

All registered in `BUTTON_REGISTRY` (`buttonHandlerFactory.js`) — search `castdock` there for the full metadata block.

## The Privacy Notice

Shown once, immediately after choosing **Enable** (not gated behind a confirm/cancel step — the toggle already happens; this is purely informational, shown right after). Built by `buildCastDockEnabledNotice(isAdminMode, targetUserId?)`:
1. Explains what CastDock is, first.
2. Then the caveat: since the menu is now public, currency/item counts/safari stats are visible to everyone in the channel — recommend a private subs/submission channel, not anywhere spectators can see it.

Deliberately styled as the same **purple "info tier"** accent (`0x9b59b6`) used by the pre-existing Safari-import prep screen (`safari_import_data` handler in `app.js`) — **not** the red `0xed4245` Critical Deletion pattern from [LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md), and not the orange `0xf39c12` warning tier either. This was an explicit design request: informational "told you so" tone, not a scary gate, because the goal is for people to actually use the feature. No "don't show again" tracking — it shows every time Enable is chosen, by design (simplicity over a feature nobody had asked for yet).

## Gateway Listeners (app.js)

Two new listeners, both thin one-liners delegating the real logic to `castDock.js` (keeping app.js a router, not a processor — see CLAUDE.md's golden rule):

```js
client.on('messageCreate', (message) => handleCastDockMessageCreate(client, message));
client.on('channelDelete', (channel) => handleCastDockChannelDelete(client, channel));
```

Neither required a new intent: `GuildMessages` (messageCreate) and `Guilds` (channelDelete) were both already declared.

## Files

- **`castDock.js`** (repo root) — all CastDock-specific logic. Imports `playerManagement.js` and `storage.js` **dynamically** inside functions (never statically) — `playerManagement.js` imports two of this module's pure builders (`getCastDockConfig`, `buildCastDockSelectRow`) **statically**, so a static import back would be a require cycle.
- **`playerManagement.js`** — the shared player-menu builder. CastDock touches: `row3Ids` (adds `'castdock'`), `calculateVisibility` (adds `vis.castdock`, always `show: true`), the `buildSuperSelect` switch (`case 'castdock':`), the footer-button block (appends the `⌄` collapse toggle when channel-scoped check passes), and `buildPlayerStatsLine` (extracted as its own exported function specifically so `castDock.js` could reuse it without pulling in the rest of `createPlayerDisplaySection`'s combined card). `calculateVisibility`, `buildSectionRow`, and `buildSuperSelect` are all exported from this file (they weren't, before CastDock needed to reuse them).
- **`app.js`** — routes all `castdock_*` and `player_menu_sel_castdock*` custom_ids (search `castdock` case-insensitively to find every touch point); boots the cache in the `ready` handler; wires the two gateway listeners.
- **`buttonHandlerFactory.js`** — `BUTTON_REGISTRY` entries for every CastDock custom_id.
- **`tests/castDock.test.js`** — unit tests for every pure function (see Testing below).

## Known Limitations & Accepted Tradeoffs

Documented honestly because they were found and deliberately *not* fixed during the build — a future contributor shouldn't assume they're oversights:

1. **Target/clicker mismatch.** CastDock's buttons/selects render content scoped to the *fixed target player*, but several of the underlying shared handlers (`handlePlayerButtonClick`, the crafting/challenges select executors) act on `context.userId` — **whoever clicked**, not the target. In a 2-person subs channel, if the host clicks a button on the player's pinned menu, some actions execute as the host, not the player. This is a **pre-existing property of the shared full-menu code**, not something CastDock introduced — it already existed for any admin using "Prod Player Menu" too. Not fixed here because closing it properly means adding an ownership check throughout `handlePlayerButtonClick` and friends, a broader change than what was asked for.
2. **Crafting's 25-recipe landmine.** If a guild has 25+ crafting recipes configured, the crafting select's "❌ Max recipes shown" entry (or a no-selection submit) triggers the *existing* `player_menu_sel_crafting` handler's fallback, which does `updateMessage: true` + re-renders the **full menu** — overwriting the compact CastDock message with the full menu. Rare (needs 25+ recipes), and it's the pre-existing handler's own behavior; not duplicated/patched for the CastDock context.
3. **ADMIN-mode channel scoping.** Enabling CastDock in ADMIN mode uses "whatever channel this interaction is happening in" as the target channel — there's no lookup of the target player's *actual* registered subs channel from elsewhere. Consistent with how every other button in this menu already behaves (channel-agnostic), but means an admin must be *inside* the target channel when enabling, same requirement as the player path.
4. **No persisted expand/collapse state.** Confirmed design choice (see "Compact" above) — resets to compact on every repost.
5. **Mobile Section+Button accessory wrapping.** The `^`/`⌄` toggle sometimes renders on its own line below the header text on narrow phone screens. Verified as Discord client responsive behavior for Section+Button accessories (not present for Section+Thumbnail), not a markup defect — confirmed by testing with drastically shortened header text, which did not change the behavior.
6. **Restart data loss (accepted).** `lastMessageId`/`lastRepostAt` aren't persisted (see Data Model) — a bot restart between messages can rarely leave one orphaned stray message in a channel until the next repost cycle. Boot reconciliation (`initCastDockCache`) mitigates the common case.

## Testing

`tests/castDock.test.js` — pure-function unit tests only (per [TestingStandards.md](../standards/TestingStandards.md), heavy-import functions like `repostCastDockMenu`/`buildCompactCastDockMenu` are integration-tested by deployment + manual verification, not unit tests). Covers:
- `normalizeCastDockConfig`, `parseCastDockAction`, `buildCastDockSelectRow` — config parsing/UI shape.
- `evaluateCastDockTrigger` — the full anti-loop/cooldown truth table (bot-author always wins even with cooldown expired; cooldown window; first-ever trigger).
- `stripButtonLabels`, `remapCompactButtonIds`, `COMPACT_DIRECT_ACTION_REMAP` — compact-view button transforms.
- `buildCastDockEnabledNotice` — notice ordering (explanation before caveat), accent color (asserts it's *not* red/orange), single-button structure, admin vs player ack custom_id.

Run in isolation: `node --test tests/castDock.test.js`.

## Security / Ratchet Notes

Two of CastBot's pre-commit ratchets caught real issues while building this feature (worth knowing if you're touching this code and a deploy suddenly fails):
- **`securityDeclarations.test.js`** (declare-or-deny ratchet) — every `ButtonHandlerFactory.create` block needs an explicit `requiresPermission:`, inline gate, or `security: 'public'`. CastDock's player-self-service paths are `security: 'public'` (self-scoped, no elevated access needed); the admin paths use `requiresPermission: PermissionFlagsBits.ManageRoles`.
- **`interactionResponseShape.test.js`** (silent-rejection ratchet) — an `updateMessage: true` handler must never return a plain `{content, ephemeral}` object; Discord silently mishandles that shape on `UPDATE_MESSAGE`. Every CastDock fallback ("CastDock is no longer enabled in this channel") uses a proper `{flags: (1<<15), components: [...]}` Components V2 container instead.
- The app.js **legacy-handler ratchet** (`} else if (custom_id` must reach `ButtonHandlerFactory.create` within 3 lines) caught a couple of CastDock blocks during development where extra comment lines pushed the factory call out of range — a false-positive-looking failure, not a real "legacy handler," fixed by trimming comments/moving variable declarations inside the handler body.

## Related Documentation

- [SurvivorContext.md](../concepts/SurvivorContext.md) — subs/submission channel conventions (CastDock's primary intended use case)
- [ComponentsV2.md](../standards/ComponentsV2.md) — Section/accessory structure reference
- [LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md) — Critical Deletion UI standard (the pattern CastDock's notice deliberately does *not* use) and general menu conventions
- [ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md) — the factory pattern every CastDock handler uses
- [Gateway.md](../standards/events/Gateway.md) — intents reference; confirms `GuildMessages`/`Guilds` already covered CastDock's needs
- [docs/01-RaP/0917_20260427_PrivilegedIntents_Analysis.md](../01-RaP/0917_20260427_PrivilegedIntents_Analysis.md) — the privileged-intents deep-dive that predated and informed CastDock's "no new intent needed" design
