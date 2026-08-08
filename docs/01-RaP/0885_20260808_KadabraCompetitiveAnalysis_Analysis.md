# 🥊 Kadabra vs CastBot — Critical Competitive Analysis

**Status**: Analysis / strategy input — no code change proposed
**Date**: 2026-08-08
**Sources**: [Kadabra V2 Guide](https://docs.google.com/document/d/1LYbIF25EzbG4jJTbhZSGxUuR5eswgM3eBtnp791Q1WI/edit) (full text, ~72KB, pulled 2026-08-08) + CastBot repo audit (`docs/03-features/`, `entitlements.js`, `src/channels/`, `docs/01-RaP/0891`)

---

## Original Context (trigger prompt)

> Below is a Google Doc that describes the features of my main competitor, Kadabra, a similar discord bot. Provide a critical and objective analysis of features between the two bots. Be honest. Capture it all in a Markdown or RaP file, and then add the end produce a tickbox feature comparison of what it standard as a feature in Kadabra, CastBot, and Castbot Premium

---

## ⚡ TL;DR — the honest verdict

**These are not the same product, and the overlap is smaller than the surface suggests.**

- **Kadabra owns the weekly ORG operating loop.** Setup → player roles → confessional/subs channels → tribe categories → alliances (with same-tribe validation) → swap (randomise + move channels + auto-archive alliances) → vote lock → episode title → boot → repeat. It is a *complete, closed loop*. CastBot's coverage of that loop is partial, and the parts it does have (confessionals, subs, 1on1s, alliances, player roles) are **hidden behind a hardcoded 2-user whitelist** (`CHANNEL_ADMIN_USER_IDS` in [channelAdminConfig.js:18](../../src/channels/channelAdminConfig.js#L18)). Functionally, **zero customers can use them today**.
- **CastBot owns everything either side of the game.** Applications, casting/ranking, DNC conflict detection, Google Sheets intake, castlists, placements, player self-service (pronouns/timezones/age), CastDock, channel archiving. Kadabra has **nothing** in this category. This is CastBot's real moat, and it is a bigger moat than the Safari.
- **Both call their exploration system "Safari", and they are architecturally opposite.** Kadabra's is an **arbitrary channel graph** (hand-pathed links, per-path cost, one-way paths, teleports, path groups, item-as-key). CastBot's is a **rigid image-backed coordinate grid** with a far deeper economy/rules engine on top (stores, crafting, enemies, conditions, usage limits, challenges, fog, AI editing). Kadabra wins on *map topology and host tooling*; CastBot wins on *game systems depth*.
- **Kadabra's monetisation is working and legible; CastBot's is barely born.** Kadabra: Patreon → per-server "activations", one per feature-family, transferable between servers, with a crisp published premium list. CastBot: one tier (`premium`) whose entire content is **Ask CastBot + Safari editing** ([entitlements.js:49-55](../../entitlements.js#L49-L55)), Ko-fi webhook only just landed, no published feature split.
- **The thing that should worry you most is not a missing feature — it is that Kadabra shipped a single, complete, self-serve reference document.** A host can read it end to end and know what they are buying. CastBot's equivalent is 60+ internal docs and a menu tree.

---

## 🧭 Two different centres of gravity

### Kadabra: an ORG automation **toolkit**

Command-first (`/setup`, `/swap`, `/alliance create`, `/whisper to`, `/draft results`), database-backed, permission-tiered (GuildOwner → Administrator → Moderator → Castaway). Its design assumption is that **the host is a power user who runs seasons repeatedly** and wants to type a command and have 40 channels rearrange themselves. It is built around the *mechanics of a running season*: tribes, boots, votes, alliances, whispers, jury, FTC.

It is also unapologetically broad — it ships mass-ban, emoji/sticker theft, ticketing, message-timestamp maths, whack-a-mole, mastermind and a maze generator. Some of this is grab-bag, but grab-bag is *sticky*: it means the host has no reason to add a second bot.

### CastBot: an ORG **platform** with a game engine bolted on

Menu-first (`/menu` → Production Menu → everything), Components V2 throughout, ephemeral-by-default, heavy investment in UI frameworks (ButtonHandlerFactory, MenuBuilder, EntityEditFramework). Its design assumption is that **the host may be running their first season and needs to discover features by clicking**. Its centre is the *cast*: who applied, how you ranked them, who's on which tribe, what the roster looks like publicly.

Then, orthogonally, it has Safari — an unusually deep Discord-native game engine that has no real equivalent in Kadabra's feature set beyond the movement layer.

**Neither product is a superset of the other. A host running a classic Survivor ORG with in-server DMs, alliances and tribal whispers would be materially worse off on CastBot today. A host recruiting a cast, ranking applicants and running an economy game would be materially worse off on Kadabra.**

---

## 🔍 Domain-by-domain

### A. The weekly ORG loop — **Kadabra wins decisively**

| Capability | Kadabra | CastBot | Honest read |
|---|---|---|---|
| Guided setup (`/setup` + `/set` single-field edits) | ✅ | 🟡 scattered across Settings menus | Kadabra's "one command sets the season's vocabulary (conf name, sub name, voteout category, VL channel…)" is a genuinely better onboarding primitive than CastBot's per-feature settings screens. |
| Bulk player role creation | ✅ `/create-players` | 🔒 whitelisted (`🎭 Player Roles`) | CastBot's version is arguably better-engineered (self-healing dead-ID clear, idempotent upsert, adopt-by-name) — but **it also has a known gap: nothing assigns the role to the member** ([ChannelAdministration.md:158](../03-features/ChannelAdministration.md)). Kadabra also requires manual assignment, so this is parity in practice, invisibility in reality. |
| Confessional / submission channel creation | ✅ `/create-channels` incl. alphabetical ordering + tribe category formats | 🔒 whitelisted | Kadabra's `format` option (separate confs/subs categories vs single per-tribe category) is a real product decision CastBot hasn't made. |
| Tribe swap with **channel movement** | ✅ `/swap` — randomises, assigns roles, creates categories, **moves channels alphabetically**, archives cross-tribe alliances, `merge:` and `exile:` modes | 🟡 [TribeSwapMerge](../03-features/TribeSwapMerge.md) — randomises + dramatic 15s reveal + castlist archival, but **does not move channels, does not touch alliances** | This is the single biggest functional gap. CastBot's swap is a *ceremony*; Kadabra's is a *migration*. CastBot's also carries three documented open bugs (archive not appearing in dropdown, vanity logic when disabled). |
| Alliances with same-tribe validation | ✅ mature: player-invocable, duplicate detection, auto-archive on swap, VC alliances, hidden alliances, lock/unlock all, live alliance tracker message, min-size config, 1-on-1 generation | 🔒 v1, whitelisted: members+hosts only, warn-only same-tribe guard, player request flow behind whitelist | Kadabra is several years of iteration ahead here. The **live alliance tracker** and **auto-unarchive on re-request** are the kind of details that only come from running real seasons. |
| 1-on-1 channels (in-server DMs) | ✅ `/alliance make-on-ones`, auto re-home on swap | 🔒 whitelisted, combinatorial preflight against 500/50/250 ceilings | CastBot's ceiling preflight and BigInt pair-keying are technically stronger. Irrelevant while invisible. |
| **Vote locking** (right-click → Lock Vote → posts to votes channel, auto-unlock, multivoting mode, jury voting) | ✅ | ❌ **nothing** | A core Survivor-ORG primitive CastBot does not have at all. |
| **Episode titles** (right-click → post to channel with poll) | ✅ | ❌ | Small feature, high visibility, trivially cloneable. |
| **VLs / Viewer Lounges** | ✅ | ❌ | Niche but a real differentiator for spectator-heavy ORGs. |
| **Whispers at tribal/tie** | ✅ sub-channel-to-sub-channel, public "X whispers to Y" log + hidden spectator content log, optional dedicated whisper channels | 🟡 **different feature with the same name** — CastBot whispers are *Safari map co-location* whispers | These solve different problems. A host wanting tie-breaker whispers gets nothing from CastBot's whisper system. |
| **Draft / fantasy scoring** | ✅ placements auto-recorded on boot, winner-pick multiplier, results table | 🟡 CastBot has [Placements](../03-features/Placements.md) but **no draft/fantasy layer** | Kadabra turns the boot order into a spectator game. CastBot records it and stops. |
| Boot handling (`/remove-player` → move channels to voteout category, strip alliances, record placement) | ✅ one command | 🟡 partial, manual | |
| FTC jury questioning channels | ✅ `/ftc` | ❌ | |
| Rocks tiebreaker simulation | ✅ | 🟡 `diceRoll.js` exists, not a rocks ceremony | |
| Redemption / exile handling | ✅ `/set redemption` + `exile:` swap option | ❌ | |

**Verdict**: on the loop that a host executes 10+ times per season, Kadabra is a mature product and CastBot is a partial one with its best parts switched off.

### B. Pre-season: applications, casting, recruitment — **CastBot wins outright**

Kadabra has **no application system, no applicant ranking, no casting workflow, no DNC handling, no external recruitment intake**. Its only adjacent feature is `/ticket`, which creates an interview channel on reaction — a primitive version of one slice of this.

CastBot has:
- [Season App Builder](../03-features/SeasonAppBuilder.md) — custom question sets, Discord-native application channels
- [Season Manager](../03-features/SeasonManager.md) — Apps/Planner/Casting/Edit tabbed workspace, search, delete mode
- **Casting**: 1-5 scoring, Cast/Tentative/Don't Cast decisions, per-applicant notes, jump-select
- [DNC Overview](../03-features/DNCOverview.md) — mutual vs one-way conflict detection across a season
- [Google Sheets Sync](../03-features/GoogleSheetsSync.md) — HMAC-signed push endpoint that turns Google Form rows into application channels, **for applicants who have no Discord account**. This is a genuinely differentiated capability aimed at IRL/Instagram recruitment funnels, and nothing in Kadabra's guide comes close.
- Marooning / draft-tribes planning

**This is CastBot's strongest and least contested territory.** It is also, notably, the part of the season that *decides whether the season happens at all* — which makes it strategically more valuable than the weekly loop even though hosts touch it less often.

### C. Public roster display (castlists) — **CastBot wins outright**

Kadabra's `/view-players` is an admin diagnostic listing roles, tribes and channel bindings. That is the entirety of its roster surface.

CastBot's castlist system is its stated "heart": multiple named castlists, virtual adapter for legacy data, image generation, compact mode, vanity role tier sorting, archive castlists created automatically by swap, CastDock (a sticky public `/menu` pinned to a channel with event-driven repost), player cards with pronouns/timezone/age.

**A public, pretty, always-current cast page is a *marketing surface* for the host's season.** Kadabra doesn't compete here at all.

### D. Safari — **split decision, and the split is instructive**

Both bots have a feature called "Safari". They are architecturally opposite.

#### Where Kadabra is ahead

| Kadabra capability | CastBot equivalent | Impact |
|---|---|---|
| **Arbitrary channel graph** — any channel links to any channel via `/path`, per-path name, per-path stamina cost | ❌ **CastBot is a rigid grid.** 8-directional adjacency on an image-backed coordinate map | This is the deepest structural difference. Kadabra can model a mansion, a cave system, a branching narrative. CastBot models terrain. |
| **One-way paths** (`oneway: true`) | ❌ | Trapdoors, waterfalls, no-return decisions — not expressible in CastBot. |
| **Teleports** with cost, role-lock, hidden flag; `/teleport home` | ❌ | |
| **Path Groups** — Visible / Hidden / Missing / Blocked / **Random (re-randomised each round with % chance)** | ❌ | Bulk map-state control per round. CastBot's blacklist/reverse-blacklist is item-keyed, not round-state-keyed. This is a *game-design* capability CastBot lacks. |
| **`/safari sanity-check`** — reports channels with too few pins, and items that can be obtained but never used (and vice versa) | ❌ | Host QA tooling. Genuinely thoughtful; CastBot has no map-validation pass. |
| **Downloadable full-map dump** (`/safari view-location all:true` → text file) | 🟡 import/export exists, not a human-readable map audit | |
| **Chat Mode** for Big Brother ORGs — duplicates every nav channel into a "chat" channel so spectators see all conversation but players only see what they were present for | ❌ | A whole ORG format (BB) that CastBot's map can't serve properly. |
| Item **durability**, **per-round per-victim attack limits**, **steal chance on attack** | 🟡 CastBot has attacks/defense/consumables, [Enemies](../03-features/EnemySystem.md) but not durability/steal | |
| **Timer-gated actions** ("start this trade, return in 20 min to collect") | 🟡 CastBot has [Usage Limits](../03-features/SafariUsageLimits.md) `once_per_period` — different primitive | Kadabra's is a *crafting-time* mechanic; CastBot's is a *rate-limit* mechanic. |
| **Trigger-based (non-spatial) safaris** — `!garden` style, stamina-decrementing, no channels needed | 🟡 CastBot has [Player Commands](../03-features/PlayerCommands.md) invoking Custom Actions | Closest parity item in this table. Kadabra's is simpler; CastBot's is more powerful. |
| **Auto-purge of a player's messages on leaving a channel** | ❌ | Anti-information-leak primitive. |
| **Location tracker message** (single live-edited message showing everyone's position) + **command log** | 🟡 CastBot has [Safari Log](../03-features/SafariLogSystem.md) + player activity logs | Broadly parity; Kadabra's single-message "everyone at a glance" board is a nice spectator artefact. |
| **Auto-generated navigation menus with buttons, auto-updated when paths change** | ✅ CastBot generates location UI natively | Parity — but note Kadabra had to *build* this because its map is hand-pathed. |

#### Where CastBot is ahead

| CastBot capability | Kadabra equivalent | Impact |
|---|---|---|
| **Actions engine** — triggers, conditions (currency/item/points/role/location), success/failure branches, chained outcomes, [Item-Triggered Actions](../03-features/ItemTriggeredActions.md), [Clone Action](../03-features/CloneAction.md), Quick Create | ❌ Kadabra's items are declarative (take/use/buy/sell/trade) with no conditional logic | **This is the biggest gap in Kadabra's favour reversed.** CastBot can express game rules; Kadabra can express game *objects*. |
| **Stores** — multi-store, per-store pricing, stock limits, role-gated access, global stores in player `/menu`, pagination | 🟡 buy/sell are per-channel item actions; no store entity | |
| **Crafting** ([Crafting.md](../03-features/Crafting.md)) | ❌ | |
| **Enemies / combat entities** | ❌ (player-vs-player attacks only) | |
| **Challenges / rounds engine** — round results, probabilistic events, income calculation, defence, attack queue | 🟡 `/safari reset-round` only | CastBot runs an *economy simulation*; Kadabra runs a *movement game*. |
| **Attributes / points framework** — arbitrary point types, time-based regeneration, entity-agnostic | 🟡 stamina + health, fixed | |
| **Image-backed map with grid overlay, fog of war, blacklist overlay colour-coded per unlock item** | ❌ no visual map at all | Kadabra's players navigate by text; CastBot's players see a map. **Large perceived-quality difference for players.** |
| **Item-gated cells** (reverse blacklist, with opt-in AND-across-items multi-key doors) | 🟡 item-as-key `Use` links | Different shape, comparable power. |
| **Usage limits** — `once_per_player` / `once_globally` / `once_per_period` / full custom (maxClaims × scope × unique × reset) + templates + admin claims viewer | 🟡 `quantity` on item actions | |
| **Import/export of Safari configurations** | ❌ | Lets a host reuse or sell a map. |
| **Safari Reset** with pre-flight preview of what can't be restored | 🟡 `/safari delete-everything` (nuke) + `/safari reset-round` | |
| **Ask CastBot — natural-language Safari editing** (plan → preview → apply) | ❌ | No competitor equivalent anywhere in this space. |

**Honest summary of the Safari comparison**: if you are building a *map*, Kadabra's is more expressive and better tooled. If you are building a *game*, CastBot's is far more capable. CastBot's grid constraint is the one architectural decision most likely to lose a deal, and it is not cheaply reversible.

### E. Utilities & moderation — **Kadabra wins**

| Feature | Kadabra | CastBot |
|---|---|---|
| Mass-send to all confessionals / subs / tribe / category / channel list, with formatting + optional pin | ✅ five variants | 🟡 [Category Post](../03-features/CategoryPost.md) covers channel/category posting |
| Bulk permission changes (whole category, all confessionals) | ✅ `/perms` | ❌ |
| Alphabetical category sort | ✅ | ❌ |
| Move channel preserving perms | ✅ | ❌ |
| Purge messages | ✅ | ❌ (archive-then-delete only) |
| Cross-server mass ban/unban by role | ✅ `/banner` | ❌ |
| Steal emojis / stickers | ✅ | ❌ |
| Ticketing (reaction → private channel, one per user per instance) | ✅ | ❌ |
| Message-ID → timestamp / delta calculator | ✅ `/time` | ✅ [Snowflake Timer](../03-features/SnowflakeTimer.md) — **CastBot's is better** (context menus + calculator) |
| Add role to everyone with another role | ✅ | ❌ |
| Random chooser | ✅ `/choose` | 🟡 `diceRoll.js` |
| **Custom triggers / custom commands** (`!hi`, Normal/DM/Random/Multiple/Delete types, role-locked, role-granting, channel-blocked, formatted) | ✅ **substantial** | ❌ |
| Channel history export to HTML | ❌ | ✅ [Channel Archive](../03-features/ChannelArchive.md) — **CastBot unique** |

**The triggers system deserves special mention.** It is the classic reason hosts keep a general-purpose bot (Carlbot, Dyno) alongside their ORG bot. Kadabra absorbing it means one fewer bot in the server. CastBot has [an unshipped Carlbot integration analysis (RaP 0889)](0889_20260802_CarlbotIntegration_Analysis.md) — i.e. this gap is known and unaddressed.

### F. Mini-games — **Kadabra wins by default**

Maze generator (saved maps, channel-backed cells, blind navigation, button nav, reusable channels between loadouts), Mastermind, Whack-a-Mole. CastBot has **none of these**.

Objectively these are low-engineering, high-delight features that give hosts *challenge content* — a real recurring need. The maze in particular is well thought through (save/reload, exit-placement difficulty modes, channel reuse).

### G. Player self-service — **CastBot wins outright**

Pronouns, timezones (with DST management), age, vanity roles, reaction-role self-assignment, player card menu, `/menu` as a player home. Kadabra has none of this — players in a Kadabra server interact through commands and channels only.

This matters more than it looks: it is the part of CastBot that **the 90% of server members who aren't hosts actually touch**.

### H. AI — **CastBot unique, and unmatched**

[Ask CastBot](../03-features/AskCastBot.md): natural-language Q&A, player-data questions for admins, and plain-English Safari mutation via a child-proposes/parent-applies plan pipeline with preview/apply/cancel. Nothing in Kadabra's guide references AI at all.

This is CastBot's clearest technological lead and its designated premium hook. It is also, currently, **the entire content of CastBot Premium** — which is the problem described below.

### I. Monetisation — **Kadabra's model is better designed**

| | Kadabra | CastBot |
|---|---|---|
| Channel | Patreon, tiers by **number of activations** | Ko-fi (webhook just landed: `src/kofi/kofiWebhook.js`) |
| Unit | An **activation** = one feature-family in one server. Want ORG + Safari premium in one server → buy 2 activations | A guild-scoped `tier: 'premium'` grant |
| Transferability | ✅ `/subscriber deactivate` → `activate` elsewhere; `/subscriber list` | 🟡 planned ([RaP 0891](0891_20260728_PremiumSubscriptions_Analysis.md) D1/D3), not shipped |
| Premium boundary | **Published, specific**: auto-archiving, 1on1s, whispers, draft, VLs; Safari premium = items, teleports, attacks, nav generation, inventory, logs, message clears, infinite-move | **Unpublished**, and currently just `ask_castbot` + `safari_edit` |
| Free tier still useful? | ✅ Deliberately — movement-only Safari is free, hooks the host, upsell is obvious | ✅ Overwhelmingly — nearly everything is free |

**Two honest observations:**

1. **Kadabra's premium split is a masterclass in what to gate.** It gates the things that (a) cost the developer support time, (b) are the second thing a host wants after the first thing works. Movement-only Safari free → items/attacks/inventory paid is textbook.
2. **CastBot's premium value proposition is currently one AI feature.** A host comparing the two sees Kadabra offering ~11 named premium capabilities and CastBot offering "AI can edit your Safari". RaP 0891 already identifies the fix (convert whitelist features — Channel Admin, Alliances, Archive — into premium features and tier some `safariLimits.js` knobs). **That conversion is the highest-leverage commercial work available**, because it simultaneously fixes the "whitelisted features have zero users" problem and the "premium is thin" problem with the same change.

---

## 😬 The uncomfortable findings

These are the things worth sitting with, in priority order.

1. **CastBot has built a large chunk of Kadabra's ORG loop and then hidden it from every customer.** Confessionals, subs, 1on1s, alliances, player roles, bulk broadcast — all live in `src/channels/`, all well-engineered (plan→confirm→execute, ceiling preflight, idempotent adopt-by-name, BigInt pair keys), all gated to two Discord user IDs. This is the single largest gap between *what CastBot is* and *what CastBot appears to be*. Every competitive comparison a prospective host makes today is against a version of CastBot that can't create a confessional channel.

2. **The tribe swap gap is the one that loses seasons.** Kadabra's `/swap` moves channels into new tribe categories in alphabetical order and archives now-invalid alliances. CastBot's does a dramatic reveal and archives a castlist. A host who swaps on Kadabra does nothing else; a host who swaps on CastBot then manually reorganises ~30 channels. Additionally CastBot's swap ships with **three documented open bugs** it has carried since Nov 2024.

3. **Vote locking, episode titles and drafts are cheap features CastBot simply doesn't have.** All three are message-context-menu + one channel post. Combined they are probably a few days of work and they are three of the most *visible* things a host does every single round. Their absence is disproportionately noticeable.

4. **"Safari" is a name collision on the two products' flagship game features.** Whatever the history, in any head-to-head conversation "does your bot have Safari?" is now an ambiguous question, and the ambiguity favours whichever bot the host heard of first. CastBot's Safari is the deeper product and is disadvantaged by the confusion.

5. **CastBot's rigid grid map is a strategic constraint, not just a limitation.** Kadabra's arbitrary graph + one-way paths + teleports + path groups lets a host build things CastBot structurally cannot. Every "can I make a mansion / cave system / branching story?" conversation goes to Kadabra. CastBot's counter is visual maps + game systems depth, which is a strong counter — but it should be a deliberate positioning choice, not an accident of implementation.

6. **Kadabra ships one complete self-serve guide; CastBot ships an internal wiki.** Kadabra's guide is written for hosts, has examples and screenshots, states premium boundaries plainly, and ends with a support-server link. CastBot's documentation is excellent *for developers* and effectively nonexistent *for customers*. This is not a feature gap but it is a conversion gap.

7. **Kadabra's grab-bag utilities are stickier than they look.** Triggers, tickets, emoji theft, purge, mass-perms, mass-ban, sort-category — none are impressive individually, all reduce the number of bots in the server. "One bot does everything" is a real buying criterion for a host managing a 40-channel server.

8. **CastBot is the more sophisticated engineering artefact and that is not automatically an advantage.** Components V2 everywhere, factory patterns, storage locks, atomic saves, backup tiers, test ratchets, blue/green test box, entitlement lifecycle with grace periods. Kadabra ships `/swap` and it moves the channels. Engineering quality only converts to competitive advantage when it reaches a user — points 1 and 6 are where that conversion is failing.

### Things this analysis **cannot** tell you

Be sceptical of any conclusion drawn beyond these limits:
- **Kadabra's reliability, performance, and actual UX quality are unknown.** A feature list is not evidence a feature works well. CastBot's failure modes are documented in painful detail (see `docs/incidents/`); Kadabra's are simply invisible to us.
- **Kadabra's price points are not in the guide** — only that tiers are sized by activation count.
- **Relative install base / market share is unknown.**
- **Kadabra's own gaps in *quality*** (e.g. whether alliance archiving actually handles edge cases) can't be assessed from documentation.
- Where the guide is ambiguous (e.g. exactly what "auto archiving" covers in premium), the table below reflects the plain reading of the text.

---

## 🎯 Strategic read

**Defend**: applications/casting/DNC/Sheets intake, castlists + CastDock, player self-service, Safari game systems, Ask CastBot. These are uncontested and hard to copy.

**Close (high value / low cost)**: vote locking, episode titles, `/purge`, mass-perms, category sort, move-channel. All small, all visible every round.

**Close (high value / real cost)**: swap that moves channels and archives alliances; un-whitelisting Channel Administration; a triggers/custom-commands system.

**Decide deliberately, don't drift**: map topology. Either commit to the grid and win on visuals + game systems, or invest in graph edges (one-way links, teleports, non-adjacent paths) layered onto the existing coordinate model.

**Commercial**: execute RaP 0891 Phase 1 step 3 — convert the whitelist features into named premium features. It fixes the thin-premium problem and the invisible-features problem in one move.

---

## ✅ Feature comparison matrix

**Legend**: ✅ = available · 🟡 = partial or materially different implementation · 🔒 = built but hidden behind a hardcoded whitelist (no customer access) · ❌ = not available

Kadabra is split into its own free/premium columns because its premium boundary is published and is itself part of the comparison.

### ORG Automation — the season loop

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| Guided season setup command (`/setup`, `/set`) | ✅ | ✅ | 🟡 | 🟡 |
| Bulk player role creation | ✅ | ✅ | 🔒 | 🔒 |
| Auto-assign created role to member | ❌ | ❌ | ❌ | ❌ |
| Confessional channel creation | ✅ | ✅ | 🔒 | 🔒 |
| Submission channel creation | ✅ | ✅ | 🔒 | 🔒 |
| Tribe category creation + layout formats | ✅ | ✅ | ❌ | ❌ |
| Convert application channels → subs channels | ❌ | ❌ | 🔒 | 🔒 |
| Tribe swap: randomise + assign roles | ✅ | ✅ | ✅ | ✅ |
| Tribe swap: **move channels to new categories** | ✅ | ✅ | ❌ | ❌ |
| Tribe swap: auto-archive invalid alliances | ❌ | ✅ | ❌ | ❌ |
| Tribe swap: dramatic timed reveal ceremony | ❌ | ❌ | ✅ | ✅ |
| Tribe swap: merge mode | ✅ | ✅ | ✅ | ✅ |
| Tribe swap: exile / redemption mode | ✅ | ✅ | ❌ | ❌ |
| Historical tribe archival (past-tribe castlists) | ❌ | ❌ | ✅ | ✅ |
| Boot handling (`/remove-player` → move channels, strip alliances, record placement) | ✅ | ✅ | 🟡 | 🟡 |
| Placement recording | ✅ | ✅ | ✅ | ✅ |
| Redemption status handling | ✅ | ✅ | ❌ | ❌ |
| FTC jury questioning channels | ✅ | ✅ | ❌ | ❌ |
| Rocks tiebreaker simulation | ✅ | ✅ | ❌ | ❌ |

### Alliances & private channels

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| Player-created alliance channels | ✅ | ✅ | 🔒 | 🔒 |
| Same-tribe validation on creation | ✅ | ✅ | 🟡 warn-only | 🟡 |
| Duplicate-alliance detection | ✅ | ✅ | ❌ | ❌ |
| Voice-channel alliances | ✅ | ✅ | ❌ | ❌ |
| Hidden alliances (invisible to spectators/tracker) | ✅ | ✅ | 🟡 default-private | 🟡 |
| Alliance archive / unarchive | ✅ | ✅ | ❌ | ❌ |
| **Auto-archiving** (too small, duplicate, cross-tribe) | ❌ | ✅ | ❌ | ❌ |
| Alliance lock / unlock (all, or by tribe) | ✅ | ✅ | ❌ | ❌ |
| Live alliance tracker message | ✅ | ✅ | ❌ | ❌ |
| Configurable minimum alliance size | ✅ | ✅ | ❌ | ❌ |
| Spectator/VIP auto-access role | ✅ | ✅ | 🔒 Trusted Spectator | 🔒 |
| **1-on-1 channels for every pair** | ❌ | ✅ | 🔒 | 🔒 |
| 1-on-1 auto re-home after swap | ❌ | ✅ | ❌ | ❌ |
| Guild-ceiling preflight before bulk creation | ❌ | ❌ | 🔒 | 🔒 |

### Voting, episodes & spectator features

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| **Vote locking / unlocking** (context menu → votes channel) | ✅ | ✅ | ❌ | ❌ |
| Multivoting mode (BB-style) | ✅ | ✅ | ❌ | ❌ |
| Jury vote locking at FTC | ✅ | ✅ | ❌ | ❌ |
| Auto-clear votes on new round | ✅ | ✅ | ❌ | ❌ |
| **Episode titles** (context menu → poll post) | ✅ | ✅ | ❌ | ❌ |
| **VLs / Viewer Lounges** | ❌ | ✅ | ❌ | ❌ |
| **Tribal whispers** (sub-to-sub, public + spectator logs) | ❌ | ✅ | ❌ | ❌ |
| Dedicated whisper channels option | ❌ | ✅ | ❌ | ❌ |
| **Draft / fantasy league with auto-scoring** | ❌ | ✅ | ❌ | ❌ |
| Winner-pick multiplier scoring | ❌ | ✅ | ❌ | ❌ |

### Applications, casting & recruitment

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| Custom application question builder | ❌ | ❌ | ✅ | ✅ |
| Per-applicant application channels | ❌ | ❌ | ✅ | ✅ |
| Applicant scoring (1–5) + Cast/Tentative/Don't Cast | ❌ | ❌ | ✅ | ✅ |
| Per-applicant host notes | ❌ | ❌ | ✅ | ✅ |
| Season Manager workspace (Apps/Planner/Casting/Edit) | ❌ | ❌ | ✅ | ✅ |
| DNC (do-not-cast) conflict detection, mutual + one-way | ❌ | ❌ | ✅ | ✅ |
| Google Form → Sheets → season import (off-Discord applicants) | ❌ | ❌ | ✅ | ✅ |
| Bulk applicant messaging / invites | ❌ | ❌ | ✅ | ✅ |
| Marooning / private tribe drafting | ❌ | ❌ | ✅ | ✅ |
| Interview ticketing (reaction → private channel) | ✅ | ✅ | ❌ | ❌ |

### Roster display & player self-service

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| Public dynamic castlist | ❌ | ❌ | ✅ | ✅ |
| Multiple / named / archived castlists | ❌ | ❌ | ✅ | ✅ |
| Castlist image generation | ❌ | ❌ | ✅ | ✅ |
| Compact castlist mode | ❌ | ❌ | ✅ | ✅ |
| Vanity role tier sorting + display | ❌ | ❌ | ✅ | ✅ |
| CastDock (sticky pinned public menu) | ❌ | ❌ | ✅ | ✅ |
| Admin roster listing (diagnostic) | ✅ | ✅ | ✅ | ✅ |
| Player pronoun self-assignment | ❌ | ❌ | ✅ | ✅ |
| Player timezone + DST handling | ❌ | ❌ | ✅ | ✅ |
| Player age | ❌ | ❌ | ✅ | ✅ |
| Reaction-role self-assignment | ❌ | ❌ | ✅ | ✅ |
| Player home menu (`/menu`) | ❌ | ❌ | ✅ | ✅ |

### Safari — map & movement

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| Channel-based player movement with permission handling | ✅ | ✅ | ✅ | ✅ |
| **Arbitrary graph topology** (any channel → any channel) | ✅ | ✅ | ❌ | ❌ |
| **Grid map generated from an uploaded image** | ❌ | ❌ | ✅ | ✅ |
| Fog of war | ❌ | ❌ | ✅ | ✅ |
| Per-path stamina cost | ✅ | ✅ | 🟡 global | 🟡 |
| **One-way paths** | ✅ | ✅ | ❌ | ❌ |
| Hidden paths | ✅ | ✅ | 🟡 | 🟡 |
| **Teleports** (cost, role-locked, hidden) | ❌ | ✅ | ❌ | ❌ |
| **Path Groups** (Visible/Hidden/Missing/Blocked/Random) | ✅ | ✅ | ❌ | ❌ |
| Randomised map state re-rolled each round | ✅ | ✅ | ❌ | ❌ |
| Auto-generated navigation menus with buttons | ❌ | ✅ | ✅ | ✅ |
| Stamina system | ✅ | ✅ | ✅ | ✅ |
| Health system | ✅ | ✅ | ✅ | ✅ |
| Stamina/health recovery & trap locations | ✅ | ✅ | 🟡 via Actions | 🟡 |
| Infinite-move mode (items cost, movement free) | ❌ | ✅ | ❌ | ❌ |
| Location-restriction by item (keys/boats) | ✅ | ✅ | ✅ | ✅ |
| Multi-key (AND across items) doors | ❌ | ❌ | ✅ | ✅ |
| Big Brother **Chat Mode** (dual nav/chat channels) | ✅ | ✅ | ❌ | ❌ |
| Auto message-clear on leaving a channel | ❌ | ✅ | ❌ | ❌ |
| Admin: force-move a player | ✅ | ✅ | ✅ | ✅ |
| Admin: full map dump / audit file | ✅ | ✅ | 🟡 export | 🟡 |
| Admin: **map sanity check** (orphan items, thin pins) | ✅ | ✅ | ❌ | ❌ |
| Global safari purge / pause / unpause | ✅ | ✅ | 🟡 | 🟡 |
| Round reset | ✅ | ✅ | ✅ | ✅ |
| Full safari reset with pre-flight preview | 🟡 nuke only | 🟡 | ✅ | ✅ |
| Non-spatial trigger-based safari | ✅ | ✅ | 🟡 Player Commands | 🟡 |

### Safari — items, economy & combat

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| Items (take / use / buy / sell / trade) | ❌ | ✅ | ✅ | ✅ |
| Player inventory | ❌ | ✅ | ✅ | ✅ |
| Currency / balance | ❌ | ✅ | ✅ | ✅ |
| Player-to-player item transfer | ❌ | ✅ | ✅ | ✅ |
| Player-to-player currency transfer | ❌ | ✅ | ✅ | ✅ |
| Limited-quantity item actions | ❌ | ✅ | ✅ | ✅ |
| **Store entities** (multi-store, stock, role-gated, pagination) | ❌ | ❌ | ✅ | ✅ |
| Global stores in player menu | ❌ | ❌ | ✅ | ✅ |
| **Crafting system** | ❌ | ❌ | ✅ | ✅ |
| **Timer-gated actions** ("come back in 20 min") | ❌ | ✅ | 🟡 period limits | 🟡 |
| Player-vs-player attacks | ❌ | ✅ | ✅ | ✅ |
| Defence values / damage mitigation | ❌ | ❌ | ✅ | ✅ |
| Item durability | ❌ | ✅ | ❌ | ❌ |
| Per-round per-victim attack limits | ❌ | ✅ | ❌ | ❌ |
| **Steal-on-attack chance** | ❌ | ✅ | ❌ | ❌ |
| **Enemy entities / PvE combat** | ❌ | ❌ | ✅ | ✅ |
| Rounds engine with probabilistic events + income | ❌ | ❌ | ✅ | ✅ |
| Attack queue / scheduled combat | ❌ | ❌ | ✅ | ✅ |
| **Conditional actions engine** (conditions → success/fail branches) | ❌ | ❌ | ✅ | ✅ |
| Usage limits (per-player / global / per-period / custom) | 🟡 quantity | 🟡 | ✅ | ✅ |
| Attributes / arbitrary point types with regeneration | ❌ | ❌ | ✅ | ✅ |
| Safari config import / export | ❌ | ❌ | ✅ | ✅ |
| Admin: edit player inventory / balance / stamina | 🟡 | ✅ | ✅ | ✅ |
| Location-based whispers between co-located players | ❌ | ❌ | ✅ | ✅ |
| **Natural-language Safari editing (AI)** | ❌ | ❌ | ❌ | ✅ |

### Logging & spectator visibility

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| Player command log channel | ❌ | ✅ | ✅ | ✅ |
| Live "where is everyone" location tracker | ❌ | ✅ | 🟡 | 🟡 |
| Per-player activity log | ❌ | ❌ | ✅ | ✅ |
| Dedicated spectator-safe whisper log | ❌ | ✅ | ✅ | ✅ |
| Analytics / usage dashboards | ❌ | ❌ | ✅ | ✅ |

### Utilities & moderation

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| Mass-send to all confessionals / subs / tribe | ✅ | ✅ | ❌ | ❌ |
| Mass-send to a category / channel list (formatted, pinnable) | ✅ | ✅ | ✅ | ✅ |
| Bulk permission changes across a category | ✅ | ✅ | ❌ | ❌ |
| Alphabetical category sort | ✅ | ✅ | ❌ | ❌ |
| Move channel preserving permissions | ✅ | ✅ | ❌ | ❌ |
| Purge messages | ✅ | ✅ | ❌ | ❌ |
| Cross-server mass ban / unban by role | ✅ | ✅ | ❌ | ❌ |
| Steal emojis / stickers from other servers | ✅ | ✅ | ❌ | ❌ |
| Ticketing system | ✅ | ✅ | ❌ | ❌ |
| Add role to everyone holding another role | ✅ | ✅ | ❌ | ❌ |
| Random chooser | ✅ | ✅ | 🟡 dice | 🟡 |
| Message-ID timestamp / delta tool | ✅ | ✅ | ✅ | ✅ |
| **Custom triggers / custom commands** | ✅ | ✅ | ❌ | ❌ |
| Trigger types: DM / Random / Multiple / Delete | ✅ | ✅ | ❌ | ❌ |
| Role-locked & role-granting triggers | ✅ | ✅ | ❌ | ❌ |
| **Channel history export to HTML** | ❌ | ❌ | ✅ | ✅ |
| Category post / saved rich cards | ❌ | ❌ | ✅ | ✅ |
| Scheduled / cancellable auto-restart, prod monitoring | ❌ | ❌ | ✅ | ✅ |

### Mini-games & challenges

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| **Maze generator** (saved maps, channel cells, blind nav) | ✅ | ✅ | ❌ | ❌ |
| Maze button navigation | ❌ | ✅ | ❌ | ❌ |
| Mastermind | ✅ | ✅ | ❌ | ❌ |
| Whack-a-Mole | ✅ | ✅ | ❌ | ❌ |
| Configurable challenge/round system | ❌ | ❌ | ✅ | ✅ |
| Challenge timer / stopwatch / snowflake tools | ❌ | ❌ | ✅ | ✅ |

### Platform, permissions & monetisation

| Feature | Kadabra Free | Kadabra Premium | CastBot | CastBot Premium |
|---|:---:|:---:|:---:|:---:|
| Tiered permission model (Owner/Admin/Mod/Player) | ✅ | ✅ | 🟡 Discord perms + whitelists | 🟡 |
| Configurable admin/mod role override | ✅ | ✅ | 🟡 `globalRoleAccess` | 🟡 |
| Menu-driven UI (vs command-driven) | ❌ | ❌ | ✅ | ✅ |
| Published end-user feature guide | ✅ | ✅ | ❌ | ❌ |
| Subscription with transferable per-server activation | ❌ | ✅ | ❌ | ❌ |
| Self-serve subscription status / list / transfer commands | ❌ | ✅ | ❌ | ❌ |
| Runtime feature grants with expiry + grace period | ❌ | ❌ | ❌ | ✅ |
| **Natural-language Q&A about the bot & player data** | ❌ | ❌ | ❌ | ✅ |

---

## 📎 Related

- [RaP 0891 — Premium Subscriptions & Entitlements](0891_20260728_PremiumSubscriptions_Analysis.md) — the tier/activation design this analysis argues should be accelerated
- [RaP 0889 — Carlbot Integration](0889_20260802_CarlbotIntegration_Analysis.md) — the known triggers/custom-commands gap
- [RaP 0892 — Alliances](0892_20260728_Alliances_Analysis.md) — alliance v1, still whitelist-hidden
- [Channel Administration](../03-features/ChannelAdministration.md) — the whitelisted ORG-loop features
- [Tribe Swap/Merge](../03-features/TribeSwapMerge.md) — the swap gap, with its three open bugs
- [SurvivorContext](../concepts/SurvivorContext.md) — domain glossary for the terms used throughout
