# Custom Reacts — Generalized Reaction Role System

**RaP #0934** | 2026-03-22 | Status: Design

## Original Context (User Prompt)

> Ok so added a brand new menu header that follows LeanUserInterfaceDesign.md and MenuSystemArchitecture.md
>
> The heading should be called
> 🎭 Post React for Roles
> 🧩 Custom Reacts (grey)
> 💜 Pronouns — move and rename Post React for Pronouns (grey)
> 🗺️ Timezones — move and rename Post React for Timezones (grey)
> 🎯 Bans — as above
> Make all buttons grey
>
> On click of the Custom Reacts, implement our new custom reacts feature. The data structure should work something like this..
>
> FOR EACH SERVER - MUST HAVE
> - Each server can have zero or more Custom Reacts (basically a pre-defined message, with a pre-defined handler)
> - Each Custom React can have one or more Reaction Roles
> - Each Reaction Role has one discord role ID, one hex/rgb role color (consider aligning to discord role ID color / hex attribute), and one title/description. Being able to select an existing Role from the guild is a MUST HAVE (see below for nice to have equivalent to actually also create the role)
> - Post to Channel button for each reaction role
> - Custom react for role messages continue to work after server reboot (as per our reboot-load-reaction message solution)
> - When any user clicks on a reaction role, they automatically receive that role
>
> NICE TO HAVE
> - We also allow the user to CREATE the discord role via CastBot rather than having to do it manually, and add it to the react, which could be via a string select option (Create new Reaction Role, Add existing role in server..). The Add Tribe Modal has a perfect and near identical example of this UI, with some potential reusability such as in colors (i want to keep using this color feature so consider extracting in a commonly maintainable area)
> - Some sort of special warning prompt on roles with Manage_Channels, Manage_Roles or just the general admin permission

## Problem Statement

🤔 **In plain English:** CastBot has three hardcoded reaction role systems — Pronouns, Timezones, and Bans — each with its own setup flow, storage quirks, and UI buttons. Hosts can't create their own custom reaction role panels (e.g. "Heart Squad", "Draft Updates", "Game Night") like Carl-bot offers. The current system is inflexible and carries clear tech debt (two legacy button handlers, inconsistent async patterns, a dead `isPronoun` flag).

We want a generalized system where admins can define arbitrary reaction role groups, each with emoji-to-role mappings, and post them as public reaction messages. The existing Pronouns/Timezones/Bans become special cases of this general system.

## Research Summary

### Current Architecture

#### Three Hardcoded Types

| Aspect | Pronouns | Timezones | Bans |
|--------|----------|-----------|------|
| **Setup handler** | `prod_pronoun_react` (app.js:23286) — legacy | `prod_timezone_react` (app.js:22757) — legacy | `prod_ban_react` (app.js:23325) — ButtonHandlerFactory |
| **Setup function** | `createPronounReactionMessage()` in roleManager.js:2149 | Inline in app.js (~150 lines) | Inline in factory handler |
| **Async pattern** | `setTimeout(500ms)` for reactions | `await` webhook fetch then loop | `setTimeout(500ms)` for reactions |
| **Emoji strategy** | Heart emojis via fuzzy matching, fallback to numbers | Numbered emojis only | Single 🎯 |
| **Role source** | `guildData.pronounRoleIDs` (flat array) | `getGuildTimezones()` (dedicated storage) | `ensureBanRole()` (idempotent creation) |
| **Behavior** | Additive (multiple roles) | Exclusive (one at a time) | Auto-ban |
| **Flag** | `isPronoun: true` (set but **never checked**) | `isTimezone: true` (checked) | `isBan: true` (checked) |

#### Shared Infrastructure (Well-Designed)

- **`client.roleReactions`** — in-memory `Map<messageId, roleMapping>` for all types
- **`playerData[guildId].reactionMappings[messageId]`** — persistent storage with timestamps
- **Storage CRUD** — `saveReactionMapping()`, `getReactionMapping()`, `deleteReactionMapping()`, `loadAllReactionMappings()` (storage.js:570-637)
- **Reaction handlers** — unified `messageReactionAdd` (app.js:46975) and `messageReactionRemove` (app.js:47201) dispatching by flag
- **Cleanup** — `cleanupOldReactionMappings()` purges >30 days, exempts `isBan`
- **Startup loading** — `loadAllReactionMappings()` in `client.on('ready')` hydrates memory cache
- **Lazy loading fallback** — handlers check persistent storage on cache miss

#### Current Reaction Roles Menu (app.js:7385-7455)

9 buttons across 4 ActionRows:
1. 🌍 View Timezones (Primary) | ⏲️ Bulk Modify (Secondary) | 🗺️ Custom Timezone (Secondary) | 👍 Post React for Timezones (Secondary)
2. 💜 View Pronouns (Primary) | 💙 Edit Pronouns (Secondary) | 👍 Post React for Pronouns (Secondary)
3. 🎯 Post React for Ban (Danger)
4. ← Tools (Secondary)

#### Identified Tech Debt

1. **Two legacy button handlers** — `prod_timezone_react` and `prod_pronoun_react` call `res.send()` directly, don't use ButtonHandlerFactory
2. **Inconsistent async patterns** — Timezone uses `await` webhook fetch; Pronoun uses `setTimeout(500ms)`
3. **Dead flag** — `isPronoun` is set (roleManager.js:2309) but never checked in handler (falls into `else` default)
4. **Write-on-read** — `getReactionMapping()` updates `lastAccessed` and saves on every read — unnecessary I/O on hot path
5. **Copy-paste bug** — Timezone "too many roles" error says "React for Pronouns" (app.js:22818)
6. **Section headers** — Still use old `> **\`Section\`**` format, not triple backtick LEAN standard

### Existing Reusable Patterns

#### String-Select List Management (from Season Apps / Season Planner)

Each item in a list becomes a StringSelect with actions (Edit, Delete, Move Up/Down). "Add New" appears as the last select on the last page. This pattern is used in:
- `buildQuestionManagementUI` — Season App questions
- `buildPlannerView` — Season Planner rounds
- `createEntityManagementUI` — Entity items/stores
- `createCustomActionSelectionUI` — Custom Actions

**Component budget per item:** 1 ActionRow + 1 StringSelect = 2 components.

#### Add Tribe Modal (Reusable Color System)

The Add Tribe flow (`tribe_add_button|*` → `tribe_add_modal|*`) demonstrates:
- **Role creation via CastBot** — modal with name, emoji, color preset, custom hex
- **Color presets** — `TRIBE_COLOR_PRESETS` (19 colors + "Custom..." sentinel) in `utils/tribeDataUtils.js`
- **Color utilities** — `formatRoleColor()` (int→hex), `validateHexColor()` (input→normalized hex)
- **Field extraction** — `getFieldValue(customId)` for Label-wrapped modal components
- **StringSelect→Array gotcha** — color preset returns `['#RRGGBB']`, must extract `[0]`

**Key insight from user:** Color utilities should be extracted to a shared location so both tribes and custom reacts (and future features) can reuse them.

## Proposed Design

### Data Model

```javascript
// playerData[guildId].customReacts[reactId]
{
  id: 'cr_1711234567890_391415444084490240',
  name: 'Heart Squad',                    // Display name for admin UI
  description: '',                         // Optional description shown in posted message
  mappings: [
    {
      emoji: '💗',
      roleId: '123456789012345678',
      label: 'Heart Squad',               // Display label in reaction message
      color: '#E91E63'                     // Stored for display; sourced from Discord role
    },
    {
      emoji: '🏈',
      roleId: '234567890123456789',
      label: 'Draft Updates',
      color: '#3498DB'
    }
  ],
  postedMessages: ['messageId1'],          // Track where this react has been posted
  createdAt: 1711234567890,
  createdBy: '391415444084490240'
}

// Reaction mapping (per-message, same shared storage)
// playerData[guildId].reactionMappings[messageId]
{
  mapping: {
    '💗': 'roleId1',
    '🏈': 'roleId2',
    reactId: 'cr_1711234567890_391415444084490240'   // replaces boolean flags
  },
  createdAt: 1711234567890,
  lastAccessed: 1711234567890
}
```

**Migration compatibility:** When `reactId` is absent, handler falls back to boolean flag behavior (`isBan`, `isTimezone`, default additive). Old mappings continue to work without migration.

### Reaction Handler Changes

```javascript
// In messageReactionAdd handler (app.js:47124)
// CURRENT: if (isBan) / else if (isTimezone) / else
// NEW: look up behavior from reactId, fall back to flags

let behavior = 'additive'; // default (pronouns, custom reacts)

if (roleMapping.reactId) {
  // New system — custom reacts are always additive
  behavior = 'additive';
} else if (roleMapping.isBan) {
  behavior = 'ban';
} else if (roleMapping.isTimezone) {
  behavior = 'exclusive';
}
// else: additive (pronouns, legacy default)

switch (behavior) {
  case 'ban':
    // existing ban logic unchanged
    break;
  case 'exclusive':
    // existing timezone logic (remove group roles, add new)
    break;
  case 'additive':
  default:
    await member.roles.add(roleId);
    break;
}
```

Custom Reacts are additive-only for V1. Exclusive mode can be added later as a group setting if needed.

### Menu Restructure

**New "Post React for Roles" section in Reaction Roles menu:**

```
## 🎭 Reaction Roles | Role Management

Manage reaction-based role assignment.
━━━━━━━━━━━━━━━━━━━━━━━━
### ```🎭 Post React for Roles```
[🧩 Custom Reacts] [💜 Pronouns] [🗺️ Timezones] [🎯 Bans]
━━━━━━━━━━━━━━━━━━━━━━━━
### ```🌍 Timezone Management```
[🌍 View Timezones] [⏲️ Bulk Modify] [🗺️ Custom Timezone]
━━━━━━━━━━━━━━━━━━━━━━━━
### ```💜 Pronoun Management```
[💜 View Pronouns] [💙 Edit Pronouns]
━━━━━━━━━━━━━━━━━━━━━━━━
[← Tools]
```

All "Post" buttons moved to a single top row. All grey (Secondary style). Management buttons remain in their sections below.

### Custom Reacts UI Flow

#### Screen 1: Custom Reacts List

```
## 🧩 Custom Reacts | Manage Reaction Panels
-# Create reaction role panels that players can react to for self-serve roles
━━━━━━━━━━━━━━━━━━━━━━━━
### ```📋 Your Panels```
[💗 Heart Squad (3 roles)       ▾]    ← StringSelect: Summary | Edit | Delete
[🏈 Notifications (2 roles)    ▾]
[➕ Create New Panel             ▾]    ← StringSelect: type name in modal
━━━━━━━━━━━━━━━━━━━━━━━━
[← Reaction Roles]
```

**Component budget:** ~15-20 (scales with panels, paginate at 8)

#### Screen 2: Panel Detail / Editor

```
## 💗 Heart Squad | 3 Reaction Roles
━━━━━━━━━━━━━━━━━━━━━━━━
### ```🎯 Reaction Roles```
[💗 Heart Squad (@Heart Squad)        ▾]   ← StringSelect: Summary | Edit | Remove
[🏈 Draft Updates (@Draft Updates)    ▾]
[📊 Edgic/Charts (@Edgic)            ▾]
[➕ Add Reaction Role                  ▾]   ← StringSelect: Add Existing Role | Create New Role
━━━━━━━━━━━━━━━━━━━━━━━━
[📨 Post to Channel] [✏️ Edit Panel] [← Back]
```

**Component budget:** ~23-28 (scales with mappings, paginate at 8)

#### "Add Existing Role" Flow

Clicking "Add Existing Role" from the Add StringSelect → updates message to show:

```
## ➕ Add Reaction Role | Heart Squad
━━━━━━━━━━━━━━━━━━━━━━━━
### ```🎯 Select Role```
-# Choose an existing Discord role to add as a reaction role
[Role Select (type 6)]
━━━━━━━━━━━━━━━━━━━━━━━━
[← Back]
```

After selecting a role → modal for emoji + label:

```
Modal: "Add Reaction Role"
┌─────────────────────────────────────┐
│ Label: Emoji                        │
│ [Type: TextInput, style: Short]     │
│ Placeholder: "Paste a single emoji" │
│                                     │
│ Label: Display Label                │
│ [Type: TextInput, style: Short]     │
│ Placeholder: "e.g. Heart Squad"     │
│ Value: {role.name} (pre-filled)     │
└─────────────────────────────────────┘
```

#### "Create New Role" Flow (Nice-to-Have)

Follows the Add Tribe Modal pattern exactly:

```
Modal: "Create Reaction Role"
┌─────────────────────────────────────┐
│ Label: Role Name                    │
│ [TextInput: "Heart Squad"]          │
│                                     │
│ Label: Emoji                        │
│ [TextInput: "💗"]                   │
│                                     │
│ Label: Color                        │
│ [StringSelect: TRIBE_COLOR_PRESETS] │
│                                     │
│ Label: Custom Color                 │
│ [TextInput: "#RRGGBB" optional]     │
└─────────────────────────────────────┘
```

Creates the Discord role via `guild.roles.create()`, then adds mapping to the panel.

#### "Post to Channel" Flow

Clicking "📨 Post to Channel" → updates message to show:

```
## 📨 Post Panel | Heart Squad
━━━━━━━━━━━━━━━━━━━━━━━━
-# Select which channel to post the reaction panel in
[Channel Select (type 8)]
━━━━━━━━━━━━━━━━━━━━━━━━
[← Back]
```

After channel selection → posts public message via REST:

```
## 💗 Heart Squad

💗 — Heart Squad
🏈 — Draft Updates
📊 — Edgic/Charts
```

Bot adds reactions, saves mapping with `reactId`, updates `postedMessages[]`.

#### Admin Permission Warning (Nice-to-Have)

When adding a role that has `MANAGE_ROLES`, `MANAGE_CHANNELS`, or `ADMINISTRATOR` permissions:

```
## ⚠️ Dangerous Permission Detected

**Role:** @Moderator
**Permissions:** Manage Roles, Manage Channels

This role has elevated permissions. Anyone who reacts will receive these permissions.

━━━━━━━━━━━━━━━━━━━━━━━━
[❌ Cancel] [⚠️ Add Anyway]
```

Check via:
```javascript
const dangerousPerms = PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.Administrator;
if ((BigInt(role.permissions) & dangerousPerms) !== 0n) {
  // Show warning
}
```

### Shared Color Utilities (Extraction)

Move color utilities from `utils/tribeDataUtils.js` to a shared location. Two options:

**Option A: Extract to `utils/colorUtils.js`** (recommended)
```javascript
// utils/colorUtils.js
export const COLOR_PRESETS = [...]; // Currently TRIBE_COLOR_PRESETS
export function formatRoleColor(color) { ... }
export function validateHexColor(color) { ... }
export function hexToInt(hex) { return parseInt(hex.replace('#', ''), 16); }
export function intToHex(int) { return `#${int.toString(16).padStart(6, '0')}`; }
```

Then `tribeDataUtils.js` re-exports: `export { COLOR_PRESETS, formatRoleColor, validateHexColor } from './colorUtils.js';`

**Option B: Keep in tribeDataUtils, import from there** — simpler but semantically wrong (tribes shouldn't own shared color logic).

**Recommendation:** Option A. The rename from `TRIBE_COLOR_PRESETS` to `COLOR_PRESETS` is clean and any import of the old name from tribeDataUtils continues to work via re-export.

### File Organization

| File | Responsibility |
|------|---------------|
| `customReacts.js` (new) | UI builders: list view, detail view, post flow |
| `customReactsHandlers.js` (new) | Or integrate handlers into `customReacts.js` if small enough |
| `utils/colorUtils.js` (new) | Extracted color presets + utilities |
| `utils/tribeDataUtils.js` (modified) | Re-export from colorUtils for backwards compat |
| `app.js` (modified) | Button routing for `custom_react_*` handlers, menu restructure |
| `buttonHandlerFactory.js` (modified) | BUTTON_REGISTRY entries |
| `storage.js` (unchanged) | Existing `reactionMappings` CRUD — no changes needed |
| `menuBuilder.js` (modified) | Update Reaction Roles menu structure |

### Startup / Reboot Persistence

**No changes needed.** The existing `loadAllReactionMappings()` at startup loads all mappings including custom reacts. The `reactId` field is just metadata on the mapping — it doesn't affect loading. Lazy loading fallback in reaction handlers also works unchanged.

Custom react definitions (`playerData[guildId].customReacts`) are loaded on-demand when the admin opens the Custom Reacts UI. They don't need to be in memory at startup — only the per-message mappings matter for reaction handling.

### Data Safety

- **Gitignore**: playerData.json is already gitignored ✅
- **atomicSave**: playerData already uses atomicSave ✅
- **Backup**: playerData is already Tier 1 backup ✅
- No new data files needed — everything lives in playerData under `customReacts` key

## Implementation Plan

### Phase 1: Menu Restructure + Foundation
1. Restructure Reaction Roles menu with new "Post React for Roles" section
2. Move Post buttons to top row, all grey
3. Extract color utilities to `utils/colorUtils.js`
4. Update `tribeDataUtils.js` to re-export

### Phase 2: Custom Reacts CRUD (Must-Have)
1. Create `customReacts.js` with UI builders
2. Implement Custom Reacts list view (string-select pattern)
3. Implement panel detail/editor view
4. Implement "Add Existing Role" flow (Role Select → emoji/label modal)
5. Implement "Post to Channel" flow
6. Wire up handlers in app.js + BUTTON_REGISTRY
7. Update reaction handler to recognize `reactId`

### Phase 3: Nice-to-Have
1. "Create New Role" flow (reuse color presets from extracted utils)
2. Admin permission warning on dangerous roles
3. Edit panel name/description
4. Delete panel with confirmation

### Phase 4: Legacy Cleanup (Future)
1. Migrate `prod_timezone_react` to ButtonHandlerFactory
2. Migrate `prod_pronoun_react` to ButtonHandlerFactory
3. Unify async reaction-adding pattern
4. Remove dead `isPronoun` flag or start checking it
5. Fix copy-paste "React for Pronouns" error in timezone handler

## Key Design Decisions

### D1: Custom Reacts are additive-only (V1)
Custom reacts assign roles on react, remove on un-react. No exclusive mode for V1. The `behavior` field can be added to `customReacts` data model later if hosts request mutually-exclusive custom groups.

**Why:** Simplicity. Carl-bot's equivalent is additive. Timezone exclusivity is a special case already handled by the existing system.

### D2: Custom Reacts use existing reactionMappings storage
No new storage layer. A custom react's posted message gets a standard `reactionMappings` entry with a `reactId` field pointing to the group definition. This means all existing infrastructure (startup loading, lazy loading, cleanup, message delete handling) works unchanged.

**Why:** The storage layer is the best-designed part of the current system. Don't reinvent it.

### D3: Color utilities extracted to shared module
`TRIBE_COLOR_PRESETS` → `COLOR_PRESETS` in `utils/colorUtils.js`. Tribe utils re-export for backwards compatibility. Custom reacts and any future feature import from colorUtils directly.

**Why:** User explicitly requested this. Colors are domain-agnostic — they don't belong in "tribe" utilities.

### D4: String-select pattern for list management
Each custom react panel appears as a StringSelect in the list view. Each reaction role within a panel appears as a StringSelect in the detail view. Follows the Season Apps question management pattern.

**Why:** Proven pattern, component-budget efficient (2 components per item vs 4+ for buttons), consistent with rest of CastBot admin UI.

### D5: No migration of existing Pronoun/Timezone/Ban data
These systems keep working as-is. They're not converted to `customReacts` entries. The menu just reorganizes them visually. Full unification is a Phase 4 future effort.

**Why:** Migration risk is high for zero user-facing benefit. Hosts don't need Pronouns to "become" a custom react — they need custom reacts to exist alongside Pronouns.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Component limit (40) on detail view with many mappings | Medium | Low | Paginate at 8 mappings per page (8×2 + header/nav = ~24) |
| Reaction emoji conflicts between panels | Low | Low | Emoji is per-message, not per-server — different panels can use same emoji |
| Role hierarchy prevents bot from assigning | Medium | Medium | Existing `checkRoleHierarchyPermission()` already handles this |
| Admin accidentally adds dangerous role | Medium | High | Nice-to-have permission warning (Phase 3) |
| 30-day cleanup deletes active custom react mappings | Low | High | Custom react mappings should be exempt from cleanup (like bans). Add `!roleMapping.reactId` check |

## TLDR

**One new entity (`customReacts`) with string-select management UI, reusing the existing `reactionMappings` storage and reaction handlers.** Menu gets a new "Post React for Roles" top row with Custom Reacts, Pronouns, Timezones, and Bans all as grey buttons. Color presets extracted to shared `utils/colorUtils.js`. Existing systems unchanged — custom reacts live alongside them. Phase 1 is menu restructure + color extraction, Phase 2 is the full CRUD, Phase 3 is nice-to-haves (role creation, permission warnings).
