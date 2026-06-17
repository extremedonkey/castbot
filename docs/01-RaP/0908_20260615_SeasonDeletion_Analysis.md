# Season Deletion — Dependency Map & Case-by-Case Handling

**Status:** Tier-1 cascade SHIPPED (2026-06-15). `deleteSeason()` (seasonPlanner.js:730) atomically removes the config, applications (scores/notes/casting), seasonRounds, and season-owned challenges, and unlinks castlists. Decisions settled: **no** Discord channel/category/role deletion, **yes** auto-unlink castlists, two-step warning (no type-to-confirm). **Outstanding gap:** the live "Apply" button is not disabled on delete — needs the Apply-post message id stored at post time. See [SeasonManager](../03-features/SeasonManager.md#deletion-delete-mode).
**Date:** 2026-06-15
**Author:** Reece + Claude
**Related:** [Season Manager feature](../03-features/SeasonManager.md) · [Season Hub Unification RaP 0910](0910_20260615_SeasonHubUnification_Analysis.md) · [Season Selector Search RaP 0909](0909_20260615_SeasonSelectorSearch_Analysis.md)

---

## Trigger Prompt (verbatim, unmodified)

> For delete - this will be tricky as there's a range of dependent-data-items, once you've finished the search work please commit / deploy / restart and then look to identify the data dependencies IF a season is deleted; as we'll need to work out how to handle each of them on a case by case basis as well as what to advise / tell / options to give the user

---

## 🤔 The Problem

A season (`applicationConfigs[configId]`, with a `seasonId`) is the spine of a whole web of data and **real Discord resources**. The current delete handler only removes the config + applicant records and *tells the admin to clean up channels by hand*. That leaves orphaned planner rounds, challenges, castlist links, Discord channels, a category, a role, and a live "Apply" button pointing at a season that no longer exists. We need a deliberate, case-by-case plan.

## What the current `season_delete_confirm_` does today (app.js:11319–11407)

```js
// delete applicant records for this season
for (const [channelId, application] of Object.entries(applications)) {
  if (application.configId === configId) delete applications[channelId];
}
delete playerData[guildId].applicationConfigs[configId];
await savePlayerData(playerData); // savePlayerData → atomicSave internally
```
…then shows: *"⚠️ Application channels must be deleted manually if they still exist."*

**It handles:** the config + applicant data records. **It ignores:** planner rounds, challenges, castlist links, every Discord resource, and any active-season pointer.

## 📊 Dependency Matrix

| # | Dependency | Where | Kind | Deleted today? | Risk if orphaned |
|---|---|---|---|---|---|
| 1 | `applicationConfigs[configId]` | playerData | Data | ✅ | — |
| 2 | Applicant records (`applications[ch].configId === configId`) incl. `rankings`, `castingStatus`, `playerNotes` | playerData | Data | ✅ | — |
| 3 | `seasonRounds[seasonId]` (planner rounds) | playerData | Data | ❌ | Orphaned rounds, invisible bloat |
| 4 | `challenges[*]` where `.seasonId === seasonId` | playerData | Data | ❌ | Orphaned challenges (each challenge belongs to exactly one season) |
| 5 | `castlistConfigs[*].seasonId === seasonId` (esp. `sortStrategy: 'placements'`) | playerData | Data (cross-ref) | ❌ | **Castlist placement sorting silently breaks** |
| 6 | Per-applicant **channels** (`applications[ch].channelId`) | Discord | Resource | ❌ | Many orphaned channels (could be dozens) |
| 7 | Application **category** (`config.categoryId`) | Discord | Resource | ❌ | Orphaned empty category |
| 8 | **Production role** (`config.productionRole`) | Discord | Resource | ❌ | Orphaned role (may be shared/reused) |
| 9 | Posted **"Apply" button message** (`config.targetChannelId` + msg id) | Discord | Resource | ❌ | **Live button to a dead season** → player-facing breakage. Note: msg id may not be stored today |
| 10 | `activeSeason` pointer (if implemented) | playerData | Data (pointer) | ❌ | Dangling pointer. *Code search found none — likely doc-only in SeasonLifecycle.md; verify* |
| 11 | `placements` keyed by seasonId (feeds castlist #5) | playerData | Data | ❓ | Verify structure/existence |
| — | safariContent (items/stores/etc.) | safariContent.json | — | n/a | **No season references — safari is independent** ✓ |

## 💡 Recommended Handling — three tiers

**Tier 1 — always, atomic data cascade (safe, season-owned):**
- 1 config, 2 applicant records *(already)*, **3 seasonRounds**, **4 season-owned challenges**, and **clear `activeSeason`** if it points here (once that feature exists). All in one `atomicSave`.

**Tier 2 — cross-references, handle explicitly (never silently break):**
- **5 castlists**: don't delete the castlist (it has independent value/members) — **clear its `seasonId` link** and surface a count: *"N castlists link to this season; their placement sorting will reset to default."* Offer Unlink / Cancel.
- **11 placements**: confirm structure before deciding cascade vs keep.

**Tier 3 — Discord resources, opt-in + rate-limited (irreversible):**
- **6 channels** (the big one — possibly dozens): opt-in checkbox **default OFF**; if chosen, delete in a **rate-limited background batch**, never inline (Discord rate limits). Show the count.
- **7 category** / **8 production role**: opt-in, **default OFF** (roles especially may be reused).
- **9 "Apply" button**: a live apply button to a deleted season is the most player-visible breakage. Recommend **default ON to disable/remove it** — but we likely need to **start storing the posted message id** at post time to target it; otherwise we can only warn. (Cheap to add now.)

## 🖥️ Proposed UX — pre-delete impact panel

Replace the bare confirm with an **impact summary** (Components V2, ephemeral) that counts each dependency and lets the admin choose:

```
## 🗑 Delete "S55 — My Cool Season"?
This permanently removes:
  • Season config + 12 applicant records          (always)
  • 17 planner rounds + 16 challenges              ☑ (season-owned)
  • ⚠️ 2 castlists link to this season             [Unlink & continue] [Cancel]

Discord cleanup (optional, irreversible):
  ☐ Delete 12 application channels                 (rate-limited, runs in background)
  ☐ Delete application category + production role
  ☑ Disable the posted "Apply" button

[ 🗑 Delete Season ]  (two-step / type-to-confirm)   [ Cancel ]
```
- Toggles via buttons or a Checkbox Group (type 22, modal-only) — implementation choice.
- Final delete = Tier 1 atomic data cascade immediately; Tier 3 Discord ops queued to a rate-limited worker with a follow-up summary.

## ❓ Open decisions for Reece (drive the build)
1. **Application channels** — offer opt-in background delete (recommended), or keep today's "delete manually" and just warn?
2. **Castlists linked to the season** — auto-unlink with warning (recommended), block deletion until resolved, or leave dangling?
3. **"Apply" button** — worth adding message-id storage at post time so we can actually disable/delete it on season delete? (Recommended — small change, closes the only player-facing breakage.)
4. **Confirm strength** — two-step buttons vs type-the-season-name? (Type-to-confirm recommended for an irreversible cascade.)
5. Confirm whether **`activeSeason`** and **`placements`** are implemented (code search suggests activeSeason is doc-only) before wiring their handling.

## Risk
Tier 1 is low-risk (data, atomic). Tier 3 is the dangerous part — irreversible Discord deletes at scale — hence opt-in, default-off, rate-limited, and behind a strong confirm.
