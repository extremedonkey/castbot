# Compact Castlist

Sharp-based PNG renderer that generates a single image of an entire castlist with tribe headers, player cards, and avatars.

## Entry Points

| Location | Button | Custom ID Pattern |
|---|---|---|
| Castlist Hub (management row) | 🍒 Compact | `compact_castlist_{castlistId}` |
| Player Menu (castlist row) | 🍒 Compact Castlist | `compact_castlist_default` |
| Production Menu (castlist row) | 🍒 Compact Castlist | `compact_castlist_default` |

## Architecture

```
Button click (compact_castlist_{id})
  → app.js startsWith handler extracts castlistId
  → ButtonHandlerFactory (deferred, updateMessage)
  → castlistImageGenerator.js: generateCastlistImage()
      ├─ castlistDataAccess.js: getTribesForCastlist() — single source of truth
      ├─ storage.js: pronouns, timezones, DST offsets, player data
      ├─ castlistSorter.js: sortCastlistMembers()
      ├─ fetch() Discord avatar URLs → Sharp resize
      └─ Sharp composite: SVG layers → PNG buffer
  → channel.send() with AttachmentBuilder (public message)
  → Return confirmation container (ephemeral, back to hub)
```

## Key File

**`castlistImageGenerator.js`** — Single export: `generateCastlistImage(guildId, castlistIdentifier, client) → Buffer`

## Rendering Pipeline

1. **Data collection** — `getTribesForCastlist()` loads tribes + Discord members, then per-member: pronouns (from role IDs), age, timezone (DST-aware), local time
2. **Avatar fetch** — `member.user.displayAvatarURL({ size: 128, extension: 'png' })`, concurrent per tribe via `Promise.all`, placeholder on failure (initial letter on blurple)
3. **Layout engine** — `selectColumns(tribeCount)` picks the column count (1 per tribe, capped at `MAX_COLUMNS = 4`); `calculateLayout()` then bin-packs each tribe into the shortest column (one tribe per column when `columnCount === tribeCount`). Column width is **fixed** at 410px — the canvas *widens* to fit more columns rather than shrinking cards
4. **SVG text rendering** — Player name (bold), info line (pronouns/age/timezone), local time. Tribe headers with colored accent strip. All emoji stripped (SVG can't render them)
5. **Sharp compositing** — Dark background → card backgrounds → rounded avatars (dest-in mask) → text overlays → single PNG

## Layout Constants

| Property | Value |
|---|---|
| Canvas width | Dynamic: 900px (1-2 tribes), 1330px (3), 1760px (4), capped at 4 cols |
| Columns | 1 per tribe up to `MAX_COLUMNS = 4`; 5+ tribes stack into 4 columns. Fixed 410px each, 20px gap |
| Card height | 80px |
| Avatar | 60×60px, 8px border radius |
| Background | `#1a1a2e` (dark navy) |
| Card background | `#16213e` |
| Tribe header | Neutral bg + colored accent strip (4px left bar, tribe role color) |

## Player Card Layout

```
┌──────────────────────────────────────┐
│ ┌────────┐  Name (bold, 16px)        │
│ │ Avatar │  Pronouns • Age • TZ      │
│ │ 60×60  │  Local time: 06:49 AM     │
│ └────────┘                           │
└──────────────────────────────────────┘
```

## Default Castlist Title

When castlistId is `'default'`, the title renders as just **"Castlist"** (not "default" or "Active Castlist").

## Button Wiring

**Castlist Hub** (`castlistHub.js` → `createManagementButtons()`):
- 5th button in management row, after Swap/Merge
- Uses `compact_castlist_{castlistId}` suffix pattern (same as Delete, Edit, etc.)
- Disabled when no castlist selected

**Player/Prod Menus** (`castlistV2.js` → `createCastlistRows()`):
- Static `compact_castlist_default` button, always Secondary style
- Inserted after Post Castlist, before custom castlist buttons
- Custom castlist limit reduced from 4→3 to fit (5 buttons max per row)

**Handler** (`app.js`): `custom_id.startsWith('compact_castlist_')` near other castlist wildcard handlers.

**Registry** (`buttonHandlerFactory.js`): `'compact_castlist_*'` with category `castlist`, parent `castlist_hub_main`.

## Performance

Typical generation: ~300-700ms, ~40-50KB PNG for 8 players across 2 tribes. Avatar fetch is the bottleneck (concurrent mitigates this).

## Limitations (POC)

- SVG text rendering only (no emoji in output, no custom fonts)
- No pagination — renders all players (designed for max ~24)
- Side-by-side columns capped at 4 (`MAX_COLUMNS`); 5+ tribes stack/bin-pack
- Wide images (3+ tribes) display scaled-down inline in Discord but are crisp at full size
- No vanity roles or player emojis in image

## Layout History

- **Mar 15** (`fe134314`) — single tribe centered under the title instead of left-aligned in column 0 (avoids empty right half)
- **Jun 4** — column count made dynamic (1 per tribe, cap 4). Column width stays fixed at 410px and the canvas widens, so 1- and 2-tribe output is byte-identical to before. Locked by `tests/castlistImageLayout.test.js`

## Related Documentation

- [CastlistArchitecture.md](CastlistArchitecture.md) — Parent castlist system reference
- [CastlistV3.md](CastlistV3.md) — Entity system, Virtual Adapter, Hub management
