# Safari Location Naming & Channel Sync

## Overview

Safari map locations support customizable emoji prefixes and automatic channel renaming. Each coordinate has an `emoji` field that drives the channel name prefix, anchor message title, and entity select dropdown display.

**Status**: ✅ **IMPLEMENTED** — Deployed to production 2026-04-01
**Design**: [RaP 0926](../01-RaP/0926_20260331_SafariLocationNaming_Analysis.md)

## Features

### 1. Emoji-Prefixed Channel Names (New Maps)

New maps create channels with emoji prefix from the "Default Location Emoji" field in the Create Map modal.

- **Default**: `📍` → channels named `#📍a1`, `#📍b1`
- **Custom**: `🏚️` → channels named `#🏚️a1`, `#🏚️b1`
- **Blank**: empty → channels named `#a1`, `#b1` (no prefix)
- **Existing maps**: unchanged unless host explicitly edits or runs Bulk Rename

### 2. Coordinate Emoji Field

Each coordinate stores an `emoji` field at root level:

```javascript
"A1": {
    "channelId": "1400526758163513374",
    "emoji": "🏚️",           // Custom emoji for this location
    "baseContent": {
        "title": "A1",        // Just the name, no emoji baked in
        "description": "...",
        "image": null
    }
}
```

**Backwards compatibility**: Old maps without the field use `coordData.emoji ?? '📍'` everywhere. No data migration needed.

### 3. Auto Channel Rename on Title Edit

When a host edits a cell's info modal (title or emoji), the channel name auto-updates:

| Title | Emoji | Channel Name |
|-------|-------|-------------|
| `A1` | `📍` | `📍a1` |
| `A1 - Kansas` | `📍` | `📍a1-kansas` |
| `The Cave` | `🕳️` | `🕳️a1-the-cave` |
| `B2` | (empty) | `b2` |

**Implementation**: `deriveChannelName(coord, title, emoji)` in `mapExplorer.js` strips leading emoji from title, removes coordinate, sanitizes to Discord channel name rules, and prepends the emoji field.

### 4. Anchor Message Emoji Rendering

Anchor messages prepend `coordData.emoji` to the title automatically:

```
# 🏚️ A1 - Kansas
You are at grid location A1.
```

Old maps with `title: "📍 Location A1"` → anchor strips the leading `📍`, re-prepends it from the fallback = `📍 Location A1` (unchanged display).

### 5. Anchor Buttons: Explore + Menu

Each anchor message has two buttons:
- **🗺️ Explore** — opens the entity editor for that coordinate (ephemeral)
- **Menu** (CastBot logo) — opens the main production menu as a NEW ephemeral message (uses `anchor_open_menu`, NOT `prod_menu_back` which would destroy the anchor)

### 6. Bulk Channel Rename

Located in **Reece's Stuff → Map Tools → Rename Channels**.

Renames all channels for the active map to match the new format. Rate-limited at ~5.5s per channel. Resumable (skips channels already matching).

## Technical Implementation

### Key Files

| File | What Changed |
|------|-------------|
| `mapExplorer.js` | `createMapGridWithCustomImage()` accepts `defaultEmoji` param; `deriveChannelName()` utility; channel name uses emoji prefix |
| `fieldEditors.js` | Info modal has 4th Label: Location Emoji; `parseModalSubmission` stores emoji with `??` (preserves empty string) |
| `entityManagementUI.js` | Entity select reads `entity.emoji \|\| '📍'`; description strips "Title:" prefix |
| `entityManager.js` | No changes needed — `emoji` field routes to root level via existing `entity[field] = value` logic |
| `safariButtonHelper.js` | Anchor title: `${locationEmoji} ${cleanTitle}`; Explore/Menu buttons |
| `app.js` | `anchor_open_menu` handler (new ephemeral); channel rename hook in modal submit; bulk rename handlers; Create Map modal emoji field |
| `menuBuilder.js` | Map Tools section in Reece's Stuff with Rename Channels button |
| `buttonHandlerFactory.js` | Registry entries for `anchor_open_menu`, `bulk_rename_map_channels`, `bulk_rename_map_channels_confirm` |

### Data Flow: Create Map

```
Upload New Safari Map modal
    → Discord Image URL, Rows, Columns, Default Location Emoji
    → createMapGridWithCustomImage(guild, userId, url, cols, rows, defaultEmoji)
    → Channel: guild.channels.create({ name: `${defaultEmoji}${coord.toLowerCase()}` })
    → Coordinate: { emoji: defaultEmoji, baseContent: { title: coord } }
```

### Data Flow: Edit Location

```
entity_field_group_map_cell_B1_info (button click)
    → Modal: Location Title, Location Emoji, Description, Image URL
    → Submit: updateEntityFields() saves emoji at root level, title/desc/image in baseContent
    → Anchor message update: prepends emoji to title
    → Channel rename: deriveChannelName(coord, title, emoji) → channel.setName()
```

### Emoji Everywhere: The `??` Pattern

All emoji reads use nullish coalescing to support three states:
- `'📍'` — default emoji (new maps, or old maps via fallback)
- `'🏚️'` — custom emoji
- `''` — explicitly no emoji (blank)

```javascript
// Correct — preserves empty string
const emoji = coordData.emoji ?? '📍';

// WRONG — treats empty string as falsy, falls back to 📍
const emoji = coordData.emoji || '📍';
```

## Future: Custom Locations (Layer 5)

Not yet implemented. Planned as hidden sub-areas outside the grid with discovery conditions. See [RaP 0926](../01-RaP/0926_20260331_SafariLocationNaming_Analysis.md) Layer 5 for the data model design.

## Related Features

- [Safari Map System](SafariMapSystem.md) — Grid creation, map images
- [Map Blacklist Overlay](MapBlacklistOverlay.md) — Visual overlays on map image
- [Safari Map Explorer](SafariMapExplorer.md) — Admin map management UI
- [Map Cell Content Management](MapCellContentManagement.md) — Entity editor for cells
