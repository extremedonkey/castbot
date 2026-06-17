# Season Manager

**Status:** Active (shipped 2026-06-15/16)
**Entry button:** `season_manager` (app.js:8488)
**Related:** [SeasonAppBuilder](SeasonAppBuilder.md) · [SeasonLifecycle](../concepts/SeasonLifecycle.md) · [Cast Ranking](CastRanking.md) · RaP [0910 Unification](../01-RaP/0910_20260615_SeasonHubUnification_Analysis.md) · [0909 Search](../01-RaP/0909_20260615_SeasonSelectorSearch_Analysis.md) · [0908 Deletion](../01-RaP/0908_20260615_SeasonDeletion_Analysis.md)

---

## What It Is

**Season Manager** is the single, unified admin interface for everything about a season. It collapsed two previously-separate flows — **Season Applications ("Apps")** and the **Season Planner** — plus **Cast Ranking** and season **Edit**, into one menu where you pick a season once and switch between four views via a shared tab row.

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
| 🏆 **Ranking** | `season_app_ranking_${configId}` | Cast Ranking scores / notes | `generateSeasonAppRankingUI` / `buildRankingEmptyState` (castRankingManager.js) |
| ✏️ **Edit** | `season_edit_info_${configId}` | Create/Edit modal (name + estimates) | `buildSeasonPlannerModal` (seasonPlanner.js) |

**Rules** (enforced by `buildSeasonNavRow`):
- The active tab is `style: 1` (Primary/blue) but **still clickable** — it is NOT disabled. (Player Manager's `disabled` tabs are a data-gate, a different concept.)
- **Edit is an action, never an "active" tab** — it never goes blue.
- Selecting a season **defaults to the Apps view** (app.js:8632) because Apps is the most-used view and works with zero configuration.

### Ephemerality — all season views must stay ephemeral
Every season view is ephemeral, so every tab uses `updateMessage: true` (webhook PATCH of the same message, never CREATE). This matters because **`updateMessage` inherits the source message's ephemerality** — you cannot morph a public message into ephemeral. Cast Ranking exposes private scores, so the whole family must originate ephemeral. See [updateMessage ↔ ephemerality](../standards/ComponentsV2.md#2-updatemessage--ephemerality-inheritance-critical).

## Selector & Search

`buildPlannerSelector(guildId)` (seasonPlanner.js) is the canonical Season Manager selector (`custom_id: planner_select_season`, `includeSearch: true`, `includeCreateNew: true`). Each option shows config indicators via `seasonConfigIndicators()` — "📝 Apps • 🏆 Ranking • 📅 Planner" or "⚠️ Not configured yet".

A Discord String Select caps at 25 options (24 seasons + "Create New"). **Search** lifts that cap: it reuses the shared Safari `entity_search_modal_` handler via `case 'seasons'` / `case 'seasons_delete'` (app.js ~50474), parameterising `resultSelectId` (`planner_select_season`), `backToMenuId`, and `entityDisplay`. See RaP 0909 for the interaction-flow analysis (why select-option search was chosen over a standalone button — consistency + reuse).

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
