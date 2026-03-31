# RaP 0926: Safari Location Naming, Channel Sync & Custom Locations

**Date**: 2026-03-31
**Status**: Design Analysis
**Risk**: LOW for new maps, MEDIUM for channel rename sync, HIGH for custom locations
**Trigger**: Map Explorer UI improvements revealed opportunity to make Safari channels more discoverable and support richer location metadata

## Original Context

> So what I'm thinking is...
> 1. Channel names default to 📍a1, 📍b1 (this is supported in discord - the actual user syntax will look like #📍a1
> 2. title changes from [ "title": "📍 Location A1" ] to just ["title": "📍 A1"]* see below
> 3. Potential introduction of a channel emoji field in the coordinate in line with resolveEmoji()
> 4. I'd like to automate the changing of the channel name when we update field(s) inside entity_field_group_map_cell_D3_info
> 5. In the future I want to support custom locations that aren't tied to the Safari Map Creation process, potentially hidden-sub areas that leverage the Anchor feature or similar

## The Five Layers

This is really five features stacked on each other, each depending on the one below. Getting the order right matters.

### Layer 1: Channel Naming Convention (New Maps Only)

**Current**: `a1`, `b2`, `g7` (bare lowercase coordinate)
**Proposed**: `📍a1`, `📍b2`, `📍g7` (emoji prefix)

**Implementation**: One-line change in `createMapGridWithCustomImage()`:
```javascript
// mapExplorer.js line ~1485
// Before:
name: coord.toLowerCase(),
// After:
name: `📍${coord.toLowerCase()}`,
```

**Critical rule**: ONLY for new `createMapGridWithCustomImage()` calls. Never rename existing channels. Never touch `updateMapImage()`.

**Why this is safe**: The `channelId` is what all code uses for lookups, never the channel name string. The name is purely cosmetic.

**Discord constraints**:
- Channel names: max 100 chars, auto-lowercased, spaces→hyphens
- Emoji in channel names: supported, renders in `#📍a1` format
- Rate limit: channel creation already has 5-per-5-seconds throttle

### Layer 2: Shorter Titles

**Current**: `"📍 Location A1"` (16 chars)
**Proposed**: `"📍 A1"` (5 chars)

**Where it's set**: `createMapGridWithCustomImage()` at coordinate initialization:
```javascript
baseContent: {
    title: `📍 Location ${coord}`,  // Current
    title: `📍 ${coord}`,           // Proposed
```

**Backwards compatibility**: Existing maps keep their titles. Only new maps get the short format. Hosts can edit titles via `entity_field_group_map_cell_D3_info` modal anyway — this just changes the default.

**Where titles appear**:
1. Anchor messages (the pinned content in each map channel)
2. Entity editor UI (admin view)
3. Location display text when players navigate

All read from `baseContent.title` dynamically — no hardcoded "📍 Location" prefix anywhere in rendering code.

### Layer 3: Coordinate Emoji Field

**Proposed data structure change**:
```javascript
"A1": {
    "channelId": "1400526758163513374",
    "emoji": "📍",           // NEW — defaults to 📍, supports custom Discord emoji
    "baseContent": {
        "title": "📍 A1",    // Uses emoji field when rendering
        ...
    },
    ...
}
```

**How it works**:
- New maps: `emoji` field populated with `"📍"` at creation
- Existing maps: field absent, code falls back to `"📍"`
- Editable via entity editor (info field group)
- Uses `resolveEmoji()` from `utils/emojiUtils.js` for custom Discord emoji support

**Where emoji would be consumed**:
1. Channel name: `📍a1` or `🏰a1` (only on explicit rename action, see Layer 4)
2. Title rendering: `${emoji} ${coord}` in anchor messages
3. Navigation buttons: compass buttons could show destination emoji
4. Map Explorer overlays: future enhancement

**Backwards compatibility pattern**:
```javascript
const locationEmoji = coordData.emoji || '📍';
const resolvedEmoji = resolveEmoji(locationEmoji, '📍');
```

No data migration. No breaking changes. Absent field = default behavior.

### Layer 4: Auto Channel Rename on Title Edit

This is the most nuanced layer.

**Current flow**:
```
Host clicks entity_field_group_map_cell_D3_info
    → Modal with Title, Description, Image fields
    → Submit saves to safariContent
    → Anchor message updated
    → Channel name: unchanged
```

**Proposed flow**:
```
Host clicks entity_field_group_map_cell_D3_info
    → Modal with Title, Description, Image fields
    → Submit saves to safariContent
    → Anchor message updated
    → Channel name: synced from title
```

**Channel name derivation**:
```javascript
function deriveChannelName(coord, title, emoji) {
    // If title is just the default "📍 A1", use simple format
    const defaultTitle = `${emoji || '📍'} ${coord}`;
    if (!title || title === defaultTitle) {
        return `${emoji || '📍'}${coord.toLowerCase()}`;
        // → "📍a1"
    }

    // Custom title: parse it
    // "📍D3 | Kansas" → "📍d3-kansas"
    // "🏰 Castle" → "🏰d3-castle"  (always include coord for uniqueness)
    const cleanTitle = title
        .replace(/[📍🏰🌊🏝️🗿🌋⛰️🏕️]/gu, '') // Strip leading emoji (we'll use the emoji field)
        .replace(/\|/g, '')           // Remove pipes
        .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')         // Spaces to hyphens
        .substring(0, 80);            // Leave room for prefix

    const prefix = `${emoji || '📍'}${coord.toLowerCase()}`;
    return cleanTitle ? `${prefix}-${cleanTitle}` : prefix;
    // "📍d3-kansas", "📍a1-the-cave", "📍g7"
}
```

**Where to hook it**: In the `entity_modal_submit_map_cell` handler (app.js), after `saveSafariContent()` succeeds and before/alongside anchor message update:

```javascript
// After saving and updating anchor...
const newChannelName = deriveChannelName(coord, updatedData.title, coordData.emoji);
const channel = await client.channels.fetch(coordData.channelId);
if (channel && channel.name !== newChannelName) {
    try {
        await channel.setName(newChannelName);
        console.log(`📍 Renamed channel for ${coord}: ${channel.name} → ${newChannelName}`);
    } catch (e) {
        console.warn(`⚠️ Could not rename channel for ${coord}: ${e.message}`);
        // Non-fatal — channel rename is cosmetic
    }
}
```

**Rate limit concern**: Channel renames are rate limited at 2 per 10 minutes per channel. But this only fires on explicit host edits (not bulk operations), so rate limiting is not a practical concern.

**Important**: This is opt-in behavior. Existing channels won't be renamed unless the host edits the title. No bulk rename operation.

### Layer 5: Custom Locations (Future)

**The vision**: Locations that exist outside the grid — hidden caves, teleport destinations, story-driven areas that players discover through actions or items.

**Proposed data model**:
```javascript
"maps": {
    "active": "map_7x7_...",
    "map_7x7_...": {
        "coordinates": { /* existing grid cells */ },
        "customLocations": {
            "hidden_cave_1": {
                "id": "hidden_cave_1",
                "name": "The Hidden Cave",
                "emoji": "🕳️",
                "channelId": "1234567890",  // Optional — can reuse grid channels or have own
                "parentCoordinate": "D3",   // Which grid cell "contains" this location
                "baseContent": { /* same structure as coordinate baseContent */ },
                "buttons": [],
                "navigation": {
                    "exit": { "to": "D3", "visible": true }  // Back to parent
                },
                "discoveryCondition": {
                    "type": "item",         // "item", "action", "always", "manual"
                    "itemId": "ancient_key",
                    "consumed": false
                },
                "anchorMessageId": null     // Can use anchor system
            }
        }
    }
}
```

**Key design decisions for future**:
1. **Channel reuse vs dedicated**: Custom locations could share the parent coordinate's channel (cheaper) or get their own channel (richer). Make this configurable per location.
2. **Navigation integration**: Custom locations participate in the movement system but aren't on the compass. They're accessed via buttons or actions, and have an "exit" back to the parent coordinate.
3. **Discovery**: Players can't see or access a custom location until its discovery condition is met. This integrates with the existing action/item systems.
4. **Anchor support**: Custom locations with their own channels can use the anchor message system for rich content display.
5. **Map overlay**: Custom locations don't appear on the grid overlay (they're hidden), but could show an icon on the parent cell after discovery.

**NOT building this now** — just ensuring Layers 1-4 don't create architecture that blocks this. The key compatibility point: all location lookups should work with both `coordinates[coord]` and `customLocations[locationId]`. A future `resolveLocation(locationIdentifier)` function can abstract this.

## Risk Assessment

| Layer | Risk | Blast Radius | Reversible? |
|-------|------|-------------|-------------|
| 1. Channel names | LOW | New maps only | Yes (rename back) |
| 2. Shorter titles | LOW | New maps only | Yes (host can edit) |
| 3. Emoji field | LOW | Additive, no migration | Yes (remove field) |
| 4. Auto rename | MEDIUM | Per-edit, one channel | Yes (rename back) |
| 5. Custom locations | HIGH | New data model | N/A (future) |

## Implementation Plan

### Phase 1: New Map Defaults (Layers 1+2) — 30 minutes
- Change `createMapGridWithCustomImage()` channel name to `📍${coord.toLowerCase()}`
- Change default title to `📍 ${coord}`
- No impact on existing maps, no data migration
- Test: create a new map on dev, verify channel names and titles

### Phase 2: Emoji Field (Layer 3) — 1 hour
- Add `emoji` field to coordinate initialization in `createMapGridWithCustomImage()`
- Add fallback pattern `coordData.emoji || '📍'` wherever emoji is rendered
- Add emoji to the `info` field group modal in entity editor
- Use `resolveEmoji()` for custom Discord emoji support
- Test: create map, verify emoji field exists, edit via entity editor

### Phase 3: Channel Rename Sync (Layer 4) — 2 hours
- Add `deriveChannelName()` utility function
- Hook into `entity_modal_submit_map_cell` handler
- Only rename when title actually changes
- Graceful failure (log warning, don't block save)
- Test: edit a cell title, verify channel renames

### Phase 4: Custom Locations (Layer 5) — Future
- Design finalized when the feature is needed
- Depends on Layers 1-4 being stable in production
- Separate RaP when work begins

## Layer 6: Bulk Channel Update (Reece's Stuff)

**The problem**: Hosts with existing maps (channels named `a1`, `b2`) want the new `📍a1` format but Layer 4 only fires on per-cell edits. Recreating the map destroys all configured content, actions, stores, and player progress.

**Proposed**: A button in Reece's Stuff that renames all channels for the active map in one operation.

**UI**: `Reece's Stuff → Legacy row` or dedicated admin tool button
- Confirmation dialog showing: "This will rename X channels from `a1` → `📍a1` format"
- Progress indicator (deferred response, updates as it goes)
- Summary: "Renamed 42/49 channels (7 skipped — already in new format)"

**Implementation**:
```javascript
// Iterate all coordinates, derive new name, rename with rate limiting
for (const [coord, data] of Object.entries(mapData.coordinates)) {
    const channel = await client.channels.fetch(data.channelId);
    const emoji = data.emoji || '📍';
    const newName = deriveChannelName(coord, data.baseContent?.title, emoji);
    if (channel.name !== newName) {
        await channel.setName(newName);
        await sleep(5500); // Channel rename rate limit: 2 per 10 min per channel
        renamed++;
    }
}
```

**Rate limit reality**: Discord's channel rename rate limit is 2 per 10 minutes **per channel**. But there's also a **guild-wide** rate limit of ~10 channel modifications per 10 minutes. A 49-channel (7x7) map would take ~50 minutes to fully rename.

**Mitigation options**:
- Show estimated time upfront: "This will take approximately 50 minutes for a 7x7 map"
- Run as background task with Discord webhook progress updates
- Allow cancellation (track which channels have been renamed)
- Process in batches with exponential backoff on 429s

**Safety**: The bulk operation is cosmetic (channel names only, not IDs). If it fails partway through, some channels have new names and some don't — ugly but not broken. A "retry" would pick up where it left off since it skips already-renamed channels.

## Modal & Label Inventory: Where Emoji Goes

### Current Info Modal (`entity_field_group_map_cell_{coord}_info`)

**File**: `fieldEditors.js:748-804`
**Current 3 Label components**:

| # | Label | Type | custom_id | Notes |
|---|-------|------|-----------|-------|
| 1 | Location Title | Short text (style 1) | `title` | Required, max 100 chars, pre-filled with `baseContent.title` |
| 2 | Location Description | Paragraph (style 2) | `description` | Required, max 1000 chars, pre-filled |
| 3 | Image URL | Paragraph (style 2) | `image` | Optional, max 500 chars, placeholder shows CDN pattern |

**Proposed addition — 4th Label component**:

| # | Label | Type | custom_id | Notes |
|---|-------|------|-----------|-------|
| 4 | Location Emoji | Short text (style 1) | `emoji` | Optional, max 50 chars, pre-filled with `coordData.emoji \|\| '📍'`, description: "Emoji shown in channel name and navigation. Default: 📍" |

Discord modals support up to 5 top-level components, so adding a 4th is safe with room for one more future field.

**The emoji field uses `resolveEmoji()`**: When the submit handler processes this field, it stores the raw string (e.g., `"📍"` or `"<:castle:123456>"`) in `coordData.emoji`. Rendering code uses `resolveEmoji(coordData.emoji, '📍')` everywhere.

### Existing User Experience After Deployment

**Scenario**: Host opens the info modal for coordinate D3 on an existing map.

**What they see**:
```
┌─ Edit Location Info ────────────────────────┐
│                                              │
│ Location Title                               │
│ The name shown at the top of this location.  │
│ ┌──────────────────────────────────────────┐ │
│ │ 📍 Location D3                           │ │ ← Pre-filled with existing title
│ └──────────────────────────────────────────┘ │
│                                              │
│ Location Description                         │
│ Flavour text players see. Supports markdown. │
│ ┌──────────────────────────────────────────┐ │
│ │ You are at grid location D3...           │ │ ← Pre-filled with existing description
│ └──────────────────────────────────────────┘ │
│                                              │
│ Image URL                                    │
│ Upload to Discord first, then paste link.    │
│ ┌──────────────────────────────────────────┐ │
│ │                                          │ │ ← Empty or existing image URL
│ └──────────────────────────────────────────┘ │
│                                              │
│ Location Emoji                    ← NEW FIELD│
│ Emoji for channel name & nav. Default: 📍   │
│ ┌──────────────────────────────────────────┐ │
│ │ 📍                                       │ │ ← Pre-filled with '📍' (fallback default)
│ └──────────────────────────────────────────┘ │
│                                              │
│              [Cancel]  [Submit]               │
└──────────────────────────────────────────────┘
```

**Key UX points**:
- Existing users see a **new 4th field** pre-filled with `📍` — the default, so no action needed
- If they submit without changing it, `emoji: "📍"` gets saved — functionally identical to before
- If they change it to `🏰`, the coordinate now has a custom emoji
- The channel is NOT renamed on this submit unless Layer 4 (auto rename) is active
- **No data loss risk**: the emoji field is additive, and the default matches existing behavior

### Other Modals That Display Location Data (read-only, no changes needed)

- **Anchor messages**: Read `baseContent.title` — will show whatever the host set
- **Navigation buttons**: Currently use hardcoded `📍` for labels — future enhancement to use `coordData.emoji`
- **Map Explorer overlay**: Uses `baseContent.title` for text display — no change needed
- **Player location text**: Shows coordinate only (`D3`), not emoji — no change needed

## Backwards Compatibility Guarantee

**The refined rule**: Existing maps are not modified by code deployment. Changes only happen through explicit host actions:
1. **Host edits a cell** → title/emoji saved, channel optionally renamed (Layer 4)
2. **Host clicks Bulk Update** → all channels renamed to new format (Layer 6)
3. **Host creates new map** → new defaults applied (Layers 1+2)
4. **Host updates map image** → only the image changes, no channel/title/emoji modifications

**What deployment does NOT touch**:
- Existing channel names remain `a1`, `b2` etc.
- Existing titles remain `"📍 Location A1"`
- No `emoji` field is injected into existing coordinate data
- The `emoji` field appears in the modal pre-filled with `"📍"` via the `|| '📍'` fallback — it's only saved to data when the host submits

**The `|| '📍'` pattern is the entire migration strategy**: Code reads `coordData.emoji || '📍'` everywhere. Old data without the field behaves identically to new data with `"📍"`. No migration script needed.

## Questions & Decisions

**Q: Should the channel name include the custom title or just the coordinate?**
A: Include custom title if set, coordinate-only if default. This makes channels scannable in the Discord sidebar: `#📍a1`, `#📍d3-kansas`, `#🏰g7-castle`.

**Q: What about the `gridSize` vs `gridWidth`/`gridHeight` legacy field?**
A: Unrelated to this work. The naming system uses coordinates (A1, B2) which are column+row based, independent of how the grid dimensions are stored.

**Q: Should Layer 4 (auto rename) also update the anchor message title?**
A: The anchor message already updates from the entity editor. The channel rename is the only new behavior.

**Q: How long will the bulk rename take?**
A: ~50 minutes for a 7x7 map due to Discord rate limits. The operation is safe to run during a live game (cosmetic only), but hosts should be informed of the time.

**Q: What if a host changes the emoji to something invalid?**
A: `resolveEmoji()` handles this — if the emoji string can't be resolved, it falls back to the default `📍`. Channel rename would use the fallback too.

## TL;DR

**Six layers, implement bottom-up:**
1. **📍 prefix on new channels** — one-line change, new maps only, zero risk
2. **Shorter titles** (`📍 A1` not `📍 Location A1`) — new maps only, zero risk
3. **Emoji field on coordinates** — 4th Label in info modal, pre-fills `📍` for existing users, `resolveEmoji()` for custom emoji
4. **Auto channel rename on title edit** — derives `📍d3-kansas` from title, fires on host edits only, graceful failure
5. **Custom locations** (future) — hidden sub-areas outside the grid, separate data model
6. **Bulk channel update** — Reece's Stuff button, renames all channels to new format, ~50min for 7x7, resumable

**The refined rule**: code deployment changes nothing. Hosts opt in via edits, bulk update, or new map creation.

**Recommended order**: Ship 1+2 (trivial), then 3 (small), then 4 (medium), then 6 (medium). Layer 5 is a separate project.

---

*The map was always there. We're just putting better signs on the doors.* 🗺️
