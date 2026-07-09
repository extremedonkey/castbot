# Season Manager

**Status:** Active (shipped 2026-06-15/16)
**Entry button:** `season_manager` (app.js:8488)
**Related:** [SeasonAppBuilder](SeasonAppBuilder.md) · [SeasonLifecycle](../concepts/SeasonLifecycle.md) · [DNCOverview](DNCOverview.md) · RaP [0910 Unification](../01-RaP/0910_20260615_SeasonHubUnification_Analysis.md) · [0909 Search](../01-RaP/0909_20260615_SeasonSelectorSearch_Analysis.md) · [0908 Deletion](../01-RaP/0908_20260615_SeasonDeletion_Analysis.md)

> **Note (2026-06-21):** **Casting** is the current name for what used to be called "Cast Ranking" / the "Ranking" tab. The old standalone docs `CastRanking.md` + `CastRankingNavigation.md` were stale (Jan-2025 line numbers, a `createApplicantSelectOptions()` helper that no longer exists) and have been **archived** into `docs/archive/`; their accurate, code-validated content now lives in the [🏆 Casting](#-casting-the-former-ranking-tab) section below.

---

## What It Is

**Season Manager** is the single, unified admin interface for everything about a season. It collapsed two previously-separate flows — **Season Applications ("Apps")** and the **Season Planner** — plus **Casting** (formerly "Cast Ranking") and season **Edit**, into one menu where you pick a season once and switch between four views via a shared tab row.

Before unification there were two season selectors (`entity_select_seasons` for Apps, `planner_select_season` for Planner) and **two different "create season" modals** that produced inconsistent data (one with 17 rounds + 16 challenges, one with none). Now there is **one selector, one create/edit modal, one data object** (`applicationConfigs[configId]`). No data migration was needed — the two flows always read the same `applicationConfigs`.

## How to Reach It

`/menu` → Production Menu → **📅 Season Manager** (also surfaced in the Setup Wizard as the "📅 Season Manager" task button, and from the no-tribes onboarding screen).

The button fires `season_manager`. A legacy alias `reeces_season_planner_mockup` is kept in the same handler condition (app.js:8488) for any stale references — do **not** use the old name in new code.

## The Four Views (active-tab pattern)

Once a season is selected, every view shows the **same nav row** in identical order, with the current view's button shaded blue (Primary). This is the [Multi-Featured Menus / active-tab pattern](../ui/LeanUserInterfaceDesign.md#-multi-featured-menus-active-tab-pattern). The single source of truth is `buildSeasonNavRow(configId, active)` in **seasonSelector.js:88**:

| Tab | `custom_id` | Renders | Builder |
|---|---|---|---|
| 📝 **Apps** | `planner_apps_${configId}` | Application questions / config (the **default** after selecting a season) | `buildQuestionManagementUI` (app.js:179) |
| 📅 **Planner** | `apps_planner_${configId}` | Round/challenge timeline + estimates | `buildPlannerView` (seasonPlanner.js) |
| 🏆 **Casting** | `season_app_ranking_${configId}` | Casting scores / decisions / notes (see [§ Casting](#-casting-the-former-ranking-tab)) | `buildSeasonRankingResponse` → `generateSeasonAppRankingUI` / `buildRankingEmptyState` (castRankingManager.js) |
| ✏️ **Edit** | `season_edit_info_${configId}` | Create/Edit modal (name + estimates) | `buildSeasonPlannerModal` (seasonPlanner.js) |

**Rules** (enforced by `buildSeasonNavRow`):
- The active tab is `style: 1` (Primary/blue) but **still clickable** — it is NOT disabled. (Player Manager's `disabled` tabs are a data-gate, a different concept.)
- **Edit is an action, never an "active" tab** — it never goes blue.
- Selecting a season **defaults to the Apps view** (app.js:8632) because Apps is the most-used view and works with zero configuration.

### Ephemerality — all season views must stay ephemeral
Every season view is ephemeral, so every tab uses `updateMessage: true` (webhook PATCH of the same message, never CREATE). This matters because **`updateMessage` inherits the source message's ephemerality** — you cannot morph a public message into ephemeral. Casting exposes private scores, so the whole family must originate ephemeral. See [updateMessage ↔ ephemerality](../standards/ComponentsV2.md#2-updatemessage--ephemerality-inheritance-critical).

## Selector & Search

`buildPlannerSelector(guildId)` (seasonPlanner.js) is the canonical Season Manager selector (`custom_id: planner_select_season`, `includeSearch: true`, `includeCreateNew: true`). Each option shows config indicators via `seasonConfigIndicators()` — "📝 Apps • 🏆 Ranking • 📅 Planner" or "⚠️ Not configured yet".

A Discord String Select caps at 25 options (24 seasons + "Create New"). **Search** lifts that cap: it reuses the shared Safari `entity_search_modal_` handler via `case 'seasons'` / `case 'seasons_delete'` (app.js ~50474), parameterising `resultSelectId` (`planner_select_season`), `backToMenuId`, and `entityDisplay`. See RaP 0909 for the interaction-flow analysis (why select-option search was chosen over a standalone button — consistency + reuse).

## 🏆 Casting (the former "Ranking" tab)

> **Heavily iterated 2026-07-08/09 — code is authoritative** (`castRankingManager.js`, `app.js`, `playerStatus.js`). Design/history in RaP [0902](../01-RaP/0902_20260709_CastingLifecycleChevron_Analysis.md) (status/offer/chevron), [0905](../01-RaP/0905_20260625_PlayerStatus_Analysis.md) (status engine), [0906](../01-RaP/0906_20260622_CastingInvites_Analysis.md) (invites). Several of those RaPs predate the 07-09 changes and carry a "SUPERSEDED" note pointing back here.

**Casting** is the applicant-evaluation view: admins score applicants 1–5, record a **casting decision**, keep private notes, and send outcome messages (a **single** ✒️ Send Invite from the card, or a **✒️ Bulk Invites** send from the Marooning tab). It is **not a separate data store** — it's an **overlay on Season Applications** (`applications[channelId]`, joined by the app channel id).

### Data model (overlay on `applications[channelId]`, except templates)
| Field | Shape | Meaning |
|---|---|---|
| `rankings` | `{ [adminUserId]: 1-5 }` | Per-admin score. Average computed live. |
| `castingStatus` | `'cast'` / `'alternative'` / `'reject'` / *(absent = Undecided)* | Host's private draft decision. **Tentative was removed (2026-07-09)** — no longer a valid value; any legacy `'tentative'` degrades to Undecided. Set via the **three toggle buttons** (`castdec_*`, see below), not a select. |
| `offerStatus` | `'offer'` / `'offer_alternative'` / `'offer_rejected'` / *(absent)* | **Stage 2 (RaP 0902).** Set when an invite is SENT (or via "Update Status Only"). Maps from the decision: cast→offer, alternative→offer_alternative, reject→offer_rejected. `offerSentAt` (ISO) stamped alongside. |
| `placementResponse` | `'accepted'` / `'accepted_alternative'` / `'declined'` / *(absent)* | The **applicant's** reply to a sent invite (Accept/Decline). `accepted_alternative` = accepted an *alternate* offer. Separate from `castingStatus` so a declined Cast still reads Cast → 🚫 Declined. |
| `playerNotes` | string | Free-text host notes (modal-edited). |
| `castingMessages` *(on `playerData[guildId]`, not the application)* | `{ successful, alternative, unsuccessful, updatedAt, updatedBy }` | The three invite templates. Guild-level for now (`getCastingMessages`/`saveCastingMessages` take `configId` for a future per-season move). |

### Entry & rendering
- Tab `season_app_ranking_${configId}` → `buildSeasonRankingResponse(...)`.
- **0 applicants** → empty state (header + nav + "no applications" + ← Seasons).
- **≥1 applicant** → `generateSeasonAppRankingUI()` renders one applicant card. `handleCastingStatus`, `handleRankingSelect`, and the various button handlers all re-render via this same function.
- The card runs `countComponents([container])` each render — it sits near Discord's **40-component hard cap** (currently 40/40 worst-case, i.e. when a DNC-conflict banner is present). **Adding any component requires removing one.**

### The applicant card (current render order — code is authoritative, `generateSeasonAppRankingUI`)
1. **Header** `## 🏆 Casting | {season}` + `buildSeasonNavRow(configId,'ranking')` (Apps · Planner · Casting · Marooning). Divider.
2. **Jump-select** (`ranking_select_*`) — placeholder is the position indicator `Applicant N of M - {name}` (+ `· page X/Y`, 23/page). There are **no ◀/▶ prev-next buttons** (proposed, then pulled).
3. **📃 header** — one line: `` # ```📃 {DisplayName}'s App``` `` (name only; demographics moved to the Overview).
4. **Action row**: **⭐ {avg}/5** (`casting_votes_*` — blue; opens the vote tally as a **private ephemeral popup**, `buildCastingVotesDisplay`, so scores stay secret — the on-card tally was removed) · **📄 App** (link) · **✏️ Notes** (`edit_player_notes_*` → modal).
5. **👤 Overview** text block — bullets: `{DisplayName} ({username})` · `{age} \| @{pronounRoleName} \| @{timezoneRoleName}` (role **names** as plain text — a code-block header can't render pills) · then the **DNC list** as `* DNC #N: {name} ({userPart}): {issue}` bullets (`buildDncSummary`, `dncManager.js`). `userPart` = `<@id> - {handle}` when a Discord user was linked via the select, else the typed handle, else omitted.
6. **✏️ Applicant Notes** (`> **✏️ Applicant Notes**` + text).
7. **Avatar** — Media Gallery (type 12).
8. **Score buttons 1–5** (`rank_{n}_*`) — your current score is green + disabled. (The "Vote on this applicant" header was removed to reclaim a component.)
9. **DNC conflict warning** (red text) — only when this applicant cross-lists someone (conditional; this is the +1 that makes the worst case 40/40).
10. **🎭 Casting Decision** (`> **🎭 Casting Decision**`) + **three toggle buttons** (`castdec_{c|n|a}_{channelId}_{appIndex}_{configId}`): 🎬 **Cast** · 🙅 **Don't Cast** · 🔄 **Alternate**. The **active** decision is coloured (Cast=**green**, Don't Cast=**red**, Alternate=**blue**); the others are grey. Not disabled — **clicking the active button toggles it off** (clears `castingStatus` → Undecided). There is no "Still Deciding" option. Handler `castdec_*` in app.js computes the toggle then calls `handleCastingStatus`.
11. **Divider**, then utility row: **✒️ Send Invite** (`casting_send_*`, see Invites) · **🚷 DNC** (`dnc_overview_*`) · **🗑️ Delete** (`delete_application_mode_*`).
12. **Divider**, then bottom row `buildSeasonBottomRow(configId,'ranking', [VC Rank])`: **← Seasons** · **✏️ Edit** · **📢 VC Rank** (`ranking_public_warn_*` — the former "Shared Ranker", passed as an `extraButton`).

**Hidden but kept:** the **Casting Lifecycle Chevron** (`getCastingChevron` in playerStatus.js — a `New App ▶ App Submission ▶ Casting Review ▶ Casting Offer ▶ Casting Accepted` progress line) is fully implemented but **commented out of the card** (Reece's call, revivable by re-adding one line). The old **🌈 ÜberStatus** line and the derived **`Status:`** line are also gone from the card. `getApplicationStatus`/`STATUS_REGISTRY` (playerStatus.js) remain for `getPlayerSeasonStatus` + future consumers.

Jump-select option **icon** precedence (`deriveApplicationStatus`): 🎉 accepted → 🚫 declined → ✅ cast → 🔄 alternate → ❌ reject → ☑️ (≥2 votes) → 🗳️ (≥1) → 📝.

### 🚣 Marooning tab (`season_marooning_*`) — formerly the ⭐ Casting Summary screen
A first-class Season Manager tab, rendered by `buildMarooningView`. Roster grouped by status — **✅ Cast / 🔄 Alternate / 🙅 Don't Cast / ⚪ Undecided** (Tentative group removed 2026-07-09) — each sorted by average score, with `· 🎉 Accepted` / `· ✅ Accepted (Alt)` / `· 🚫 Declined` annotations, plus a 📊 per-status summary. Grouping/sort is the shared `computeCastingOrder` (normalizes any unknown status → Undecided). Also hosts the 🏕️ Tribes section, 💭 Draft Tribes, and the **✒️ Bulk Invites** button.

### 📨 Casting Invites — bulk + single + status-only (RaP 0906, extended 2026-07-09)
Two entry points, **one shared modal** (`buildCastingInvitesModal`) and **one shared send path** (`sendCastingInvites`):
- **✒️ Bulk Invites** (Marooning, `casting_messages_0_{configId}`) → modal with the 6-option "what to do" select (`draft / all / successful / unsuccessful / alternative / selected`).
- **✒️ Send Invite** (Casting card utility row, `casting_send_{appIndex}_{configId}`) → the **single variant** (`opts.single`): identical template fields, but the select shows just **💾 Save as draft** · **📨 "Send {name} {Casting Offer\|Unsuccessful\|Alternate Message}"** (value `selected`) · **🕵️ Update Status Only** (value `status_only`). The card button is **context-aware**: grey + disabled when no decision, else blue with the label **Send Offer** (cast) / **Send Decline** (reject) / **Send Alternate** (alternative).

Flow:
- **Submit** (`casting_messages_save:{appIndex}:{configId}`) always saves the templates (`@everyone`/`@here` neutralized). `draft` → "💾 saved". `status_only` → stamps `offerStatus` from the decision (`OFFER_FOR_STATUS`) **without sending** + returns a summary (for "I messaged them manually"). Any send mode → an ephemeral **confirmation card** (counts per type) with Confirm/Cancel.
- **Confirm** (`casting_invites_confirm:{mode}:{appIndex}:{configId}`, deferred) → `sendCastingInvites()` posts a Components V2 card into each targeted applicant's channel (raw REST, throttled ~700ms, per-channel try/catch), and **stamps `offerStatus` + `offerSentAt`** on each successful send. **Decision → message:** Cast → Successful · Alternative → Alternative · Don't Cast → Unsuccessful. Undecided → **nothing**.
- **Accept / Decline** — Successful & Alternative cards carry ✅ Accept / ❌ Decline buttons (`placement_accept:{type}` / `placement_decline:{type}`). Only the applicant may click. On click: set `placementResponse` (`accepted_alternative` when accepting an *alternative* offer), post a public accepted/declined message (pinging the production role), set the channel emoji, and edit the card to confirm.

### 📛 Application channel emoji legend
`📝` in-progress · `☑️` submitted · `✖️` withdrawn (was `❌`; changed so it's distinct from declined) · `✅` placement accepted · `❌` placement declined. Strip regex (app.js withdraw/reapply handlers): `/^[📝☑️✖️✅❌]+/`.

### Shared (public) vs Personal Ranker
- Cards are normally **ephemeral** to the host. **📢 Shared Ranker** posts a public copy after a confirmation warning (`ranking_public_warn_*` → `ranking_public_post_*` / `ranking_public_cancel_*`) — it surfaces scores, decisions and notes to everyone in the channel, so it's gated behind the warning.
- A `_ephemeral` custom-id suffix marks the "Personal Ranker" variant; `generateSeasonAppRankingUI({...,ephemeral:true})` adds the EPHEMERAL flag.

### 🚷 DNC Overview
The 🚷 button (`dnc_overview_${configId}` → `generateDncOverviewUI`) opens a **new ephemeral message** (never `updateMessage`, so confidential data never lands in a shared card) showing the season-wide conflict matrix. "← Casting" returns. Full feature: [DNCOverview.md](DNCOverview.md).

### Permissions
All Casting handlers gate on `hasCastRankingPermissions()` (app.js:829): **ManageRoles OR ManageChannels OR ManageGuild OR Administrator**, plus a hard-coded special-access exception for one server. Same gate as the DNC overview.

### Applicant jump-select rendering logic
The string select (`type: 3`, `custom_id: ranking_select_{appIndex}_{configId}_{currentPage}`, placeholder "🔍 Jump to applicant…") exists to skip Prev/Next-clicking through large pools. Its presence and contents:

- **Not rendered at all when `allApplications.length <= 1`** — a 0- or 1-applicant season shows no select (and no Prev/Next). It only appears at **≥2 applicants** (castRankingManager.js:347).
- **Pagination at 23 applicants/page.** `itemsPerPage = 23`; `currentPage = Math.floor(appIndex / 23)`. Each page can hold up to **25 options = 23 applicants + 2 reserved page-nav rows** (Discord's hard 25-option select cap is the reason for 23, not 25):
  - if `currentPage > 0`: a leading **◀ Show Applications X–Y** option (`value: page_{n-1}`),
  - the applicants for the current window (`startIdx … endIdx`),
  - if more remain: a trailing **▶ Show Applications X–Y** option (`value: page_{n+1}`).
- **Selecting a page option** (`page_{n}`) jumps to the **first applicant of that page** (`newIndex = n * 23`); selecting an applicant jumps straight to that index. Both re-render the whole card. (`handleRankingSelect`)
- **Option label**: `{icon} {position}. {DisplayName} ({username}) - {N vote(s)}{ 💬 if notes}`, truncated to Discord's 100-char limit (username shortened first, else hard-cut to 97 + `...`).
- **Status icon precedence**: ✅ `cast` → ❌ `reject` → ☑️ ≥2 votes → 🗳️ otherwise. (`tentative` deliberately shows no special icon.)

So: **single applicant → no dropdown** (just the card); **2–23 → one page, no page-nav options**; **24+ → paginated with ◀/▶ rows**.

## Create / Edit Modal (unified)

One modal, `buildSeasonPlannerModal`, backs both create and edit:
- **Season Name** — required (max 100).
- **Estimated Players / Swaps / FTC Players / Start Date** — all **optional**. The description field was **removed** (it pushed past the 5-component modal limit and was redundant).
- `validatePlannerFields()` enforces all-or-nothing on estimates and returns `hasPlannerData`.
- `createSeason()` generates planner rounds on first creation; `updateSeason()` updates name + estimates and only generates rounds the first time (won't clobber an existing timeline).

## Deletion (Delete Mode)

A **Delete Mode** button (`season_delete_mode`, red/style-4) sits next to the Menu button in the selector. Flow: `season_delete_mode` → `season_delete_select` (search-enabled) → `season_delete_confirm_${configId}` (red two-step warning, no type-to-confirm) → `deleteSeason(guildId, configId)` (seasonPlanner.js:730).

`deleteSeason` performs a **Tier-1 atomic cascade** — it removes, in one save:
- `applicationConfigs[configId]`
- all `applications[*]` for that config (incl. rankings/scores, player notes, casting status)
- `seasonRounds[seasonId]`
- season-owned `challenges` (matching `seasonId`)

…and a **Tier-2 unlink**: any `castlistConfigs[*].seasonId` pointing at it is cleared (the castlist is **kept**, just unlinked).

**Intentionally NOT deleted** (manual cleanup): Discord application channels, the category, the season role, and the live **"Apply" button** post. The confirmation screen surfaces this as a three-part **Deleted / Also-affected / Kept** breakdown with counts.

### ⚠️ Known gap — orphaned Apply button
The Apply post is left live and pointing at a now-deleted season because **the Apply-post message id is not stored at post time**. Disabling/removing it on delete requires capturing that message id when the Apply button is first posted. Tracked in RaP 0908.

## Deprecations

- **`season_management_menu`** — the OLD Apps season picker. Deprecated; its handler redirects to `buildPlannerSelector` (the Season Manager selector). Other agents were erroneously reusing it — don't.
- **`createSeasonSelector()` default `custom_id` `entity_select_seasons`** — the old Apps picker id, JSDoc-marked deprecated in seasonSelector.js. For season-management UI, use `buildPlannerSelector` / `season_manager`, never call `createSeasonSelector` with the default id.
- **`reeces_season_planner_mockup`** — old name for `season_manager`; alias retained only for stale references.

## Data Model (reference)

| Object | Key | Holds |
|---|---|---|
| `applicationConfigs` | `configId` (has `seasonId`, `seasonName`) | The season spine: questions, channel/category/role ids, Apply button |
| `seasonRounds` | `seasonId` | Planner rounds/timeline |
| `challenges` | `seasonId` | Challenge rounds |
| `applications` | `channelId` (has `configId`) | Per-applicant: `rankings[adminId]`=score 1-5, `castingStatus`, `playerNotes` |
| `castlistConfigs` | `*` | `seasonId` link (unlinked, not deleted, on season delete) |

## Tests

`tests/seasonSelector.test.js`, `tests/seasonCreate.test.js`, `tests/seasonDelete.test.js` replicate the pure logic (nav-row shape, validation, delete-cascade selection) without importing Discord/file-I/O modules.
