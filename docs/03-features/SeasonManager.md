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

> Merged & code-validated from the archived `CastRanking.md` + `CastRankingNavigation.md` (2026-06-21). All facts below verified against `castRankingManager.js`.

**Casting** is the applicant-evaluation view: admins score applicants 1–5, record a casting decision (Cast / Tentative / Don't Cast), and keep private notes. It is **not a separate data store** — it is an **overlay on Season Applications**. Every applicant already has an `applications[channelId]` object (created when they apply); Casting just reads/writes three fields on it.

### Data model (overlay on `applications[channelId]`)
| Field | Shape | Meaning |
|---|---|---|
| `rankings` | `{ [adminUserId]: 1-5 }` | Per-admin score. Average is computed live. |
| `castingStatus` | `'cast'` / `'tentative'` / `'reject'` / *(absent)* | Final decision. Absent renders as ⚪ Undecided. |
| `playerNotes` | string (≤2000) | Free-text host notes (modal-edited). |

The **application channel ID is the join key** between Season Applications and Casting — there is no separate Casting record.

### Entry & rendering
- Tab `season_app_ranking_${configId}` → `buildSeasonRankingResponse({guildId,userId,configId,client})` (castRankingManager.js:57).
- **0 applicants** → `buildRankingEmptyState()` (:25): header + nav row + "📭 No applications yet" + ← Seasons.
- **≥1 applicant** → `generateSeasonAppRankingUI()` (:108) renders the first applicant card (or a specific index on navigation).

### The applicant card (in render order)
1. **Header** `## 🏆 Casting` + season name, then the shared `buildSeasonNavRow(configId,'ranking')` (Casting tab blue).
2. **Applicant prev/next** (`ranking_prev_*` / `ranking_next_*`) — **only when >1 applicant**.
3. **Applicant jump select** (string select) — **only when >1 applicant** (see [§ jump-select rendering](#applicant-jump-select-rendering-logic)).
4. **DNC warning** (red) if this applicant cross-lists anyone, then **applicant info**: name mention, demographics `(age, <@&pronounRole>, <@&timezoneRole>)`, average score, your score, casting status, app channel link, DNC summary.
5. **Avatar** — a Media Gallery (type 12) showing the applicant's 512px avatar (CDN pre-warmed via a HEAD fetch).
6. **Score buttons 1–5** (`rank_{n}_*`) — your current score is green + disabled.
7. **Casting buttons**: 🎬 Cast Player / ❓ Tentative / 🗑️ Don't Cast (`cast_player_*` / `cast_tentative_*` / `cast_reject_*`) — the active status is colour-highlighted (green/blue/red).
8. **Votes breakdown** (only if votes exist): average + per-admin `name: ⭐⭐⭐⭐ (4/5)`, sorted high→low.
9. **Player notes** + a button row: ✏️ Edit Notes (`edit_player_notes_*` → modal → `save_player_notes_*`), 📢 Shared Ranker (`ranking_public_warn_*`), 🚷 DNC (`dnc_overview_*`), 🗑️ Delete (`delete_application_mode_*`).
10. **Bottom row**: ← Seasons (`season_manager`) + 📊 View All Scores (`ranking_view_all_scores_*`).

### View All Scores → "Casting Summary"
`ranking_view_all_scores_*` (handled in `handleRankingNavigation`) builds a roster grouped by status — ✅ Cast / ❓ Tentative / 🗑️ Don't Cast / ⚪ Undecided — each group sorted by average score (🥇🥈🥉 then `N.`), plus a 📊 summary (totals + scored count). Back = `ranking_scores_back_*`, Refresh = `ranking_scores_refresh_*`.

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
