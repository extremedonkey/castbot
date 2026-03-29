# 0929 - Player Menu Custom Emoji Bug Analysis

**Date:** 2026-03-29
**Status:** OPEN — workaround in place, root cause understood but not fixed
**Affects:** Player Menu (playerManagement.js), Safari Config (inventoryEmoji, currencyEmoji)

---

## The Problem

When a server admin sets a custom Discord emoji (e.g. `<:wallet:1487520126441095201>`) as their currency or inventory emoji via Safari Config → Currency & Inventory, buttons in the **player menu** render as `Unknown(undefined)` — causing broken/invisible buttons.

The player menu still displays (it doesn't crash), but store buttons and the inventory button show as blank/broken components.

### What Players See

```
📋 Player Menu:
...
23. ActionRow
  24. Unknown(undefined)    ← Should be store buttons
  25. Unknown(undefined)
26. ActionRow
  27. Unknown(undefined)    ← More store buttons
  28. Unknown(undefined)
  29. Unknown(undefined)
  30. Unknown(undefined)
...
```

### Current Workaround

Uses `parseAndValidateEmoji()` which checks the bot's emoji cache. If the custom emoji isn't in cache (common after restarts, or for emojis from other servers), it falls back to a safe Unicode default (🏪 for stores, 🧰 for inventory). Buttons work but show the fallback emoji instead of the custom one.

---

## Root Cause

There are **two different component building patterns** in the codebase, and they handle emoji objects differently:

### Pattern A: Raw JSON Objects (Components V2)
Used by: entity selects, combat display, action editor, map location UI

```javascript
// Works with { name, id, animated } from parseTextEmoji()
const button = {
  type: 2,
  custom_id: 'my_button',
  label: 'Click',
  emoji: { name: 'wallet', id: '1487520126441095201' }  // ✅ Works
};
```

### Pattern B: discord.js ButtonBuilder
Used by: player menu (playerManagement.js), production menu (app.js)

```javascript
// ButtonBuilder.setEmoji() has its own parsing rules
const button = new ButtonBuilder()
  .setCustomId('my_button')
  .setLabel('Click')
  .setEmoji({ name: 'wallet', id: '1487520126441095201' });  // ❌ Produces Unknown(undefined)
```

### Why ButtonBuilder Fails

`ButtonBuilder.setEmoji()` from discord.js expects either:
- A Unicode string: `.setEmoji('🧰')`
- A guild emoji string: `.setEmoji('<:wallet:1487520126441095201>')`
- A partial emoji object: `.setEmoji({ id: '1487520126441095201' })` (note: `name` alone is NOT enough for custom emojis)

But `parseTextEmoji('<:wallet:1487520126441105201>')` returns `{ name: 'wallet', id: '1487520126441095201', animated: false }` — which seems correct but discord.js `ButtonBuilder` chokes on it.

The exact failure mode in discord.js needs investigation — possibly it's the `animated: false` field, or possibly `ButtonBuilder.setEmoji()` validates differently than raw JSON components.

### Why parseAndValidateEmoji Works (But Loses Custom Emojis)

`parseAndValidateEmoji()` calls `validateComponentEmoji()` which checks the bot's `client.emojis.cache`. If the custom emoji ID isn't in cache:
- Returns `{ name: '🧰' }` (safe Unicode fallback)
- `ButtonBuilder.setEmoji('🧰')` works fine
- But the custom emoji is never shown

The cache is often cold because:
- Bot restarts clear the cache
- The bot only caches emojis it has "seen" in messages/interactions
- Custom emojis from the server's own emoji list may not be in the gateway cache

---

## What Was Tried (2026-03-29)

### Attempt 1: Use parseTextEmoji instead of parseAndValidateEmoji
**Commit:** c0e09e55
**Result:** Store and inventory buttons became `Unknown(undefined)`. The `{ name, id }` object from `parseTextEmoji` doesn't work with `ButtonBuilder.setEmoji()`.

### Attempt 2: Revert to parseAndValidateEmoji
**Commit:** 94995235
**Result:** Buttons work again with fallback emojis. Custom emojis still don't show.

### Separate Fix: inventoryEmoji save was destructive
**Commit:** 8737fe81
The Safari Config modal submit handler was running `parseTextEmoji()` on `inventoryEmoji` and saving only `emoji.name` — so `<:wallet:1487520126441095201>` was saved as just `wallet`. This was fixed by storing the raw string as-is. Parsing now only happens at render time.

---

## Affected Files

| File | Line | Issue |
|------|------|-------|
| `playerManagement.js:622` | Store buttons | `.setEmoji(parseAndValidateEmoji(store.emoji, '🏪').emoji)` — falls back to 🏪 when custom emoji not in cache |
| `playerManagement.js:694` | Inventory button | `.setEmoji(parseAndValidateEmoji(customTerms.inventoryEmoji, '🧰').emoji)` — falls back to 🧰 |
| `app.js:4350` | Purchase success inventory button | `emoji: parseTextEmoji(customTerms.inventoryEmoji, '🧰').emoji` — raw JSON, works correctly |
| `app.js:31923` | Player inventory button (raw JSON) | `emoji: parseTextEmoji(customTerms.inventoryEmoji, '🧰').emoji` — raw JSON, works correctly |
| `entityManagementUI.js:504` | Quick Currency button (raw JSON) | `emoji: parseTextEmoji(customTerms.currencyEmoji, '🪙').emoji` — raw JSON, works correctly |
| `safariMapAdmin.js:263` | Edit Currency button (raw JSON) | `emoji: parseTextEmoji(customTerms.currencyEmoji, '💰').emoji` — raw JSON, works correctly |

Note: Raw JSON component usages (Pattern A) all work fine with `parseTextEmoji`. Only `ButtonBuilder.setEmoji()` usages (Pattern B) fail.

---

## Potential Fixes to Investigate

### Option 1: Convert player menu from ButtonBuilder to raw JSON
Convert the store and inventory buttons in `playerManagement.js` from `new ButtonBuilder().setEmoji(...)` to raw `{ type: 2, emoji: { name, id } }` objects. This would match the pattern used everywhere else and let `parseTextEmoji` work.

**Risk:** Medium — the player menu is complex and uses discord.js builders extensively. Would need to convert the entire button + action row construction.

### Option 2: Pass the raw emoji string directly to ButtonBuilder
Instead of parsing, pass the Discord emoji string as-is:
```javascript
.setEmoji('<:wallet:1487520126441095201>')
```
discord.js `ButtonBuilder.setEmoji()` claims to accept this format. Needs testing.

**Risk:** Low — simple change, but need to verify ButtonBuilder actually handles the string format.

### Option 3: Warm the emoji cache at startup
Call `guild.emojis.fetch()` for each guild on startup to populate `client.emojis.cache`. Then `parseAndValidateEmoji` would find custom emojis and return the correct `{ name, id }` object.

**Risk:** Low but slow — adds startup time. May not solve all cases (emojis added after startup).

### Option 4: Skip cache validation for ButtonBuilder, use try/catch
Wrap `.setEmoji()` in try/catch. If it fails, fall back to Unicode:
```javascript
try {
  button.setEmoji(parseTextEmoji(emojiStr, fallback).emoji);
} catch {
  button.setEmoji(fallback);
}
```

**Risk:** Low — but may not catch the issue since ButtonBuilder might not throw, it might silently produce invalid output.

---

## Recommendation

**Option 2** is the simplest — test if `ButtonBuilder.setEmoji('<:wallet:123>')` works directly with the raw emoji string format. If it does, the fix is a 2-line change in `playerManagement.js`.

If Option 2 doesn't work, **Option 1** (convert to raw JSON) is the definitive fix since raw JSON components handle custom emojis correctly throughout the codebase.

---

## Related

- `utils/emojiUtils.js` — `parseTextEmoji()`, `parseAndValidateEmoji()`, `validateComponentEmoji()`
- `editFramework.js` — `currencyEmoji` and `inventoryEmoji` maxLength increased to 100 (was 10)
- `safariConfigUI.js` — Modal now uses Label components, submission parser handles both Label and ActionRow formats
- `app.js:45127` — Removed destructive `inventoryEmoji` parsing that stripped custom emoji codes to just the name
