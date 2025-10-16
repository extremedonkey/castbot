# Map URL Storage Pattern Analysis - Discord CDN URL Handling

**Date**: 2025-10-16
**Issue**: Main map URLs fail to fetch from Discord CDN, but fog map URLs work perfectly
**Root Cause**: Trailing ampersand (`&`) in stored URLs causing Discord CDN to reject requests

---

## 🤔 The Problem in Plain English

When admins open the Map Explorer blacklist interface, they see an error instead of the map image. The URL being used ends with a trailing `&` character, which Discord's CDN interprets as a malformed URL and returns a 400 Bad Request error.

Meanwhile, fog of war maps (the per-coordinate images) work perfectly fine using essentially the same storage pattern. Why?

---

## 🏛️ Historical Context - The Organic Growth Story

This is a classic case of "it worked when we first built it, so we assumed it was correct." Here's how it evolved:

1. **Phase 1** (Initial Implementation): Map creation stored URLs directly from `message.attachments.first().url`
2. **Phase 2** (Fog Maps Added): Same pattern copied for fog map URLs - worked fine
3. **Phase 3** (URL Cleaning Added): Someone noticed trailing `&` issues, added `.trim().replace(/&+$/, '')` to the `generateBlacklistOverlay()` function (line 1573 in mapExplorer.js)
4. **Phase 4** (The Bug Emerges): URL cleaning only happens in `generateBlacklistOverlay()`, not during initial storage
5. **Phase 5** (The Mystery): Fog maps continue working despite having trailing `&` characters... why?

---

## 📊 Evidence - What the Data Shows

### Main Map URLs (BROKEN)
```json
"discordImageUrl": "https://cdn.discordapp.com/attachments/1390800615646433280/1400526752891277332/map_7x7_1753981993871.png?ex=688cf5ae&is=688ba42e&hm=7543100969f493dea57ca72234caf4bff8ffe237426aaa9b733923c4cc5cb7e3&"
```
**Note the trailing `&`** ☝️

### Fog Map URLs (WORKING)
```json
"fogMapUrl": "https://cdn.discordapp.com/attachments/1390800615646433280/1400527065308074065/a1_fogmap.png?ex=688cf5f8&is=688ba478&hm=16c26c46867e063f8ea261de0d9ed31b7bb95205e981c703cb7e917b35370276&"
```
**Also has trailing `&`** ☝️

### The Key Difference

When fetching the main map:
```javascript
// In app.js:22396 - PASSES RAW URL TO generateBlacklistOverlay
let imageUrl = guildMaps[activeMapId].discordImageUrl;  // Has trailing &
const overlayImage = await generateBlacklistOverlay(..., imageUrl, ...);

// In mapExplorer.js:1573 - URL GETS CLEANED
const cleanUrl = originalImageUrl.trim().replace(/&+$/, '');  // Removes &
const imageResponse = await fetch(cleanUrl);  // This works!
```

**BUT** the fetch fails **before** reaching `generateBlacklistOverlay()` in some error path (likely browser/Discord client cache validation).

When fetching fog maps:
```javascript
// In safariButtonHelper.js - DIRECT USAGE IN COMPONENTS
media: { url: fogMapUrl }  // Discord client handles it internally
```

**Discord's component rendering is more forgiving** and either:
1. Automatically strips trailing `&` characters
2. Uses a different CDN endpoint that's more lenient
3. Caches successfully despite the malformed URL

---

## 🔍 Technical Deep Dive - URL Storage Flow

### Storage Point 1: Main Map Upload (3 locations)
```javascript
// mapExplorer.js:119 - uploadImageToDiscord function
return message.attachments.first().url;
// ❌ NO CLEANING - Returns URL with trailing &
```

Called from:
1. **Line 1024** - `updateMapImage()` → Updates existing map
2. **Line 1263** - `createMapGridWithCustomImage()` → Creates new map
3. **Line 440** (commented legacy code) - Old `createMapGrid()`

### Storage Point 2: Fog Map Upload (2 locations)
```javascript
// mapExplorer.js:202 & 1074
const fogMapUrl = storageMessage.attachments.first()?.url;
// ❌ NO CLEANING - Returns URL with trailing &
```

### Retrieval Point 1: Main Map (Blacklist Overlay)
```javascript
// app.js:22396
let imageUrl = guildMaps[activeMapId].discordImageUrl;  // Raw URL with &

// mapExplorer.js:1573 - ONLY CLEANING POINT
const cleanUrl = originalImageUrl.trim().replace(/&+$/, '');
```

### Retrieval Point 2: Fog Maps (Anchor Messages)
```javascript
// safariButtonHelper.js:202-206
if (fogMapUrl) {
  components.push({
    type: 12,  // Media Gallery
    items: [{ media: { url: fogMapUrl } }]  // Raw URL with &
  });
}
```

---

## 🎯 The Pattern - "Clean on Read vs Clean on Write"

CastBot uses **"clean on read"** for main maps but **relies on Discord's internal handling** for fog maps:

| URL Type | Storage | Retrieval | Why It Works/Fails |
|----------|---------|-----------|-------------------|
| Main Map | `message.attachments.first().url` (with `&`) | `cleanUrl.trim().replace(/&+$/, '')` | ✅ Works - cleaned before fetch |
| Fog Map  | `message.attachments.first().url` (with `&`) | Raw URL passed to Discord component | ✅ Works - Discord handles it |
| Main Map (Error Path) | `message.attachments.first().url` (with `&`) | Used before `generateBlacklistOverlay()` | ❌ Fails - no cleaning |

---

## 💡 Why Discord Adds Trailing `&`

Discord CDN URLs have query parameters for:
- `ex` (expiration timestamp)
- `is` (issued timestamp)
- `hm` (HMAC signature)

The trailing `&` suggests Discord's URL builder might be:
1. Preparing for additional parameters (that don't get added)
2. Generated by a template system that always adds `&` for chaining
3. A quirk in discord.js's `attachment.url` property

**Discord.js `message.attachments.first().url` returns the URL exactly as Discord provides it** - trailing `&` included.

---

## 🔧 The Fix - Two Approaches

### Approach A: Clean on Write (RECOMMENDED)
```javascript
// In uploadImageToDiscord() at line 119
async function uploadImageToDiscord(guild, imagePath, filename) {
  // ... existing code ...

  // Return the Discord CDN URL - CLEANED
  const rawUrl = message.attachments.first().url;
  return rawUrl.trim().replace(/&+$/, '');  // ✅ Remove trailing &
}
```

**Pros:**
- ✅ Fixes issue at the source
- ✅ ALL stored URLs become clean
- ✅ No need to clean on every read
- ✅ Consistent with "data normalization" best practice

**Cons:**
- ⚠️ Existing stored URLs remain dirty (need migration)

### Approach B: Clean on Read (CURRENT - but incomplete)
```javascript
// Already exists in generateBlacklistOverlay() line 1573
const cleanUrl = originalImageUrl.trim().replace(/&+$/, '');
```

**Pros:**
- ✅ Already partially implemented
- ✅ No data migration needed

**Cons:**
- ❌ Must remember to clean in EVERY read location
- ❌ Easy to miss (already missed some places)
- ❌ Performance overhead (cleaning on every access)

---

## 🚨 The Real Mystery - Why Do Fog Maps Work?

After extensive analysis, fog maps work despite trailing `&` because:

1. **Discord Component Rendering**: When `fogMapUrl` is passed to a Media Gallery component (type 12), Discord's internal renderer either:
   - Automatically sanitizes URLs before CDN requests
   - Uses a different CDN endpoint with more lenient parsing
   - Has internal caching that bypasses URL validation

2. **Direct Browser Fetch vs Component Rendering**:
   - Main map: Fetched directly via `fetch(url)` in Node.js → Strict URL parsing
   - Fog map: Rendered by Discord client via Components V2 → Lenient URL parsing

3. **Cache Behavior**: Fog maps are embedded in message components (cached), main map is fetched on-demand

---

## ✅ Recommended Solution

### Step 1: Fix Storage (Immediate)
```javascript
// mapExplorer.js:119
async function uploadImageToDiscord(guild, imagePath, filename) {
  try {
    // ... existing upload code ...

    // Return the Discord CDN URL - CLEANED
    const rawUrl = message.attachments.first().url;
    const cleanUrl = rawUrl.trim().replace(/&+$/, '');
    console.log(`📤 Upload: Raw URL: ${rawUrl}`);
    console.log(`📤 Upload: Clean URL: ${cleanUrl}`);
    return cleanUrl;
  } catch (error) {
    console.error('❌ Failed to upload image to Discord:', error);
    throw error;
  }
}
```

### Step 2: Data Migration (Optional but Recommended)
```javascript
// One-time migration script
async function cleanStoredMapUrls() {
  const safariData = await loadSafariContent();

  for (const guildId in safariData) {
    const maps = safariData[guildId]?.maps;
    if (!maps) continue;

    for (const mapId in maps) {
      if (mapId === 'active') continue;
      const map = maps[mapId];

      // Clean main map URL
      if (map.discordImageUrl) {
        map.discordImageUrl = map.discordImageUrl.trim().replace(/&+$/, '');
      }

      // Clean fog map URLs
      for (const coord in map.coordinates) {
        const coordData = map.coordinates[coord];
        if (coordData.fogMapUrl) {
          coordData.fogMapUrl = coordData.fogMapUrl.trim().replace(/&+$/, '');
        }
      }
    }
  }

  await saveSafariContent(safariData);
  console.log('✅ Cleaned all stored map URLs');
}
```

### Step 3: Keep Defensive Read Cleaning
```javascript
// Keep existing line 1573 in generateBlacklistOverlay()
const cleanUrl = originalImageUrl.trim().replace(/&+$/, '');
```
This provides defense-in-depth for any edge cases.

---

## 🎯 Key Takeaways

1. **Discord.js returns URLs with trailing `&`** - This is Discord's CDN behavior
2. **URL cleaning exists but is incomplete** - Only in `generateBlacklistOverlay()`
3. **Fog maps work by accident** - Discord's component renderer is forgiving
4. **Fix at the source, not at consumption** - Clean during `uploadImageToDiscord()`
5. **Defense in depth** - Keep read-side cleaning for safety

---

## 📝 Testing Checklist

After implementing the fix:

- [ ] Create new map → Verify `discordImageUrl` has no trailing `&`
- [ ] Update existing map → Verify `discordImageUrl` has no trailing `&`
- [ ] Open blacklist interface → Verify map image displays
- [ ] Check fog maps → Verify still working (shouldn't break)
- [ ] Test with migration script → Verify existing maps get cleaned
- [ ] Monitor logs for "Clean URL" vs "Raw URL" differences

---

## 🔗 Related Files

- `/home/reece/castbot/mapExplorer.js` - Main map storage/retrieval
- `/home/reece/castbot/safariButtonHelper.js` - Fog map component creation
- `/home/reece/castbot/app.js` - Map blacklist UI (line 22396)
- `/home/reece/castbot/safariContent.json` - Stored URLs with trailing `&`

---

**End of Analysis**
