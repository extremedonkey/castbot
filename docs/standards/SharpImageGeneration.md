# Sharp Image Generation Reference

**Version**: sharp ^0.33.5 (installed)
**Import**: `import sharp from 'sharp';`
**Used by**: castlistImageGenerator.js, mapExplorer.js, activityLogger.js, emojiUtils.js

## How Sharp Works in This Project

Sharp is a **compositing engine**, not a drawing API. You build layers — SVG strings, colored rectangles, fetched images — then stamp them all onto a canvas in one `.composite()` call. Text rendering is done via SVG `<text>` elements because Sharp has no native text support.

## Core Pattern: SVG Text on Canvas

```javascript
import sharp from 'sharp';

// 1. Create a blank canvas (ALWAYS channels: 4 for transparency)
const canvas = sharp({
  create: {
    width: 1200,
    height: 800,
    channels: 4,
    background: { r: 26, g: 26, b: 46, alpha: 1 }
  }
});

// 2. Build composites array (order = z-order, later = on top)
const composites = [];

// Background shape
composites.push({
  input: Buffer.from(`<svg width="400" height="60" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="60" rx="12" ry="12" fill="#16213e"/>
  </svg>`),
  top: 100,
  left: 50
});

// Text overlay (same position, renders on top of the rect)
composites.push({
  input: Buffer.from(`<svg width="400" height="60" xmlns="http://www.w3.org/2000/svg">
    <text x="20" y="35" font-family="Arial, Helvetica, sans-serif"
      font-size="24" font-weight="bold" fill="#e8e8e8">Hello World</text>
  </svg>`),
  top: 100,
  left: 50
});

// 3. Composite everything at once and output
const pngBuffer = await canvas
  .composite(composites)
  .png({ quality: 90 })
  .toBuffer();

// To file instead: .toFile('/tmp/output.png')
// To Discord: new AttachmentBuilder(pngBuffer, { name: 'image.png' })
```

## XML Escaping (CRITICAL)

Always escape user-supplied text before putting it in SVG:

```javascript
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

## Emoji Stripping

SVG `<text>` can't render emoji — they show as missing-glyph boxes:

```javascript
function stripEmoji(str) {
  return String(str)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{200D}]/gu, '')
    .trim();
}
```

## Fetching & Compositing External Images

```javascript
async function fetchImage(url, width, height) {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  return await sharp(buffer).resize(width, height).png().toBuffer();
}
```

### Rounded Corners via Mask

```javascript
async function roundImage(buffer, width, height, radius = 8) {
  const mask = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`
  );
  const maskBuffer = await sharp(mask).resize(width, height).png().toBuffer();

  return await sharp(buffer)
    .composite([{ input: maskBuffer, blend: 'dest-in' }])
    .png()
    .toBuffer();
}
```

## Semi-Transparent Color Overlays

```javascript
const overlay = await sharp({
  create: {
    width: 100, height: 100, channels: 4,
    background: { r: 255, g: 165, b: 0, alpha: 0.5 }  // 50% orange
  }
}).png().toBuffer();

composites.push({ input: overlay, top: 200, left: 300 });
```

## Reading Image Metadata

```javascript
const meta = await sharp('image.png').metadata();
// meta.width, meta.height, meta.format, meta.channels
```

## Animated Images

```javascript
// Extract first frame from GIF/APNG
const firstFrame = await sharp(buffer, { animated: true, pages: 1 })
  .resize(96, 96)
  .png()
  .toBuffer();
```

## SVG Cheat Sheet

```xml
<!-- Rounded rectangle -->
<rect x="0" y="0" width="400" height="80" rx="12" ry="12" fill="#16213e"/>

<!-- Accent strip (colored left border) -->
<rect x="0" y="0" width="4" height="80" rx="2" ry="2" fill="#e74c3c"/>

<!-- Centered text -->
<text x="200" y="40" text-anchor="middle" font-family="Arial" font-size="20" fill="white">Centered</text>

<!-- Right-aligned text -->
<text x="390" y="40" text-anchor="end" font-family="Arial" font-size="14" fill="#aaa">Right</text>

<!-- Circle -->
<circle cx="30" cy="30" r="25" fill="#5865F2"/>

<!-- Horizontal line / divider -->
<line x1="0" y1="50" x2="400" y2="50" stroke="#2a2a4a" stroke-width="1"/>

<!-- Linear gradient -->
<defs>
  <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" style="stop-color:#e74c3c"/>
    <stop offset="100%" style="stop-color:#3498db"/>
  </linearGradient>
</defs>
<rect fill="url(#grad1)" width="400" height="60" rx="8"/>

<!-- Semi-transparent fill -->
<rect fill="#000" fill-opacity="0.5" width="100" height="100"/>
```

## Dark Theme Color Palette

Matches Discord aesthetic (used across all CastBot image generation):

```javascript
const COLORS = {
  BG:             '#1a1a2e',   // Canvas background
  CARD:           '#16213e',   // Card/panel background
  CARD_HOVER:     '#1a2744',   // Slightly lighter
  TEXT_PRIMARY:   '#e8e8e8',   // Main text
  TEXT_SECONDARY: '#a0a0b0',   // Subtitle/info text
  TEXT_MUTED:     '#7a7a8a',   // Timestamps, hints
  ACCENT_BLUE:    '#5865F2',   // Discord blurple
  ACCENT_GREEN:   '#4ade80',   // Success/positive
  ACCENT_RED:     '#e74c3c',   // Error/danger
  ACCENT_ORANGE:  '#f59e0b',   // Warning/highlight
  SEPARATOR:      '#2a2a4a',   // Divider lines
};
```

## Gotchas

1. **Composite order = z-order** — later items render on top. Always: background → shapes → images → text.

2. **Each SVG has its own coordinate system** — `<text x="20" y="30">` is relative to that SVG, not the canvas. Position on canvas via `top`/`left` in the composite entry.

3. **Always `channels: 4`** for `create` — channels: 3 breaks transparency.

4. **No `measureText()`** — Sharp/SVG can't measure text width. Estimate ~0.6 × fontSize per character for Arial, or use fixed-width layouts.

5. **Buffer.from(svgString)** works directly as composite input — no need to render SVG to PNG first.

6. **Build ALL composites, then composite once** — don't chain multiple `.composite()` calls.

7. **PNG options**: `{ quality: 90 }` is the default. For smaller files: `{ colors: 128, effort: 10 }`.

8. **Performance**: 50-100+ composites work fine. Keep canvas under ~4000x4000 for memory.

9. **Font availability**: Only system fonts work. `Arial, Helvetica, sans-serif` is the safe choice everywhere.

10. **Gradients need `<defs>`** — define once at SVG top, reference with `url(#id)`.

## Existing Implementations

| File | Purpose | Key Patterns |
|------|---------|-------------|
| `castlistImageGenerator.js` | Full castlist PNG (tribes, players, avatars) | 2-column layout, avatar masking, SVG text cards |
| `mapExplorer.js` | Map fog-of-war, grid overlays | Semi-transparent overlays, metadata for cell sizing |
| `activityLogger.js` | Player exploration map overlay | Color-coded cell overlays (visited/current) |
| `utils/emojiUtils.js` | Avatar → Discord emoji conversion | Animated frame extraction, size optimization |

## Output to Discord

```javascript
import { AttachmentBuilder } from 'discord.js';

const pngBuffer = await generateImage();
const attachment = new AttachmentBuilder(pngBuffer, { name: 'output.png' });

// Via channel.send
await channel.send({ content: 'Here it is', files: [attachment] });

// Via interaction follow-up (after deferred response)
await interaction.followUp({ files: [attachment] });
```
