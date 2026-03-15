---
name: sharp
description: Sharp image generation — build PNG images with SVG text, compositing, avatars, overlays. Use when creating any visual output (timelines, calendars, cards, maps, charts).
allowed-tools: Read, Grep, Glob, Bash, Write, Edit, Agent
user-invocable: true
argument-hint: "[what to build, e.g. 'season timeline', 'player card', 'calendar view']"
---

# Sharp Image Generator

You are a Sharp image generation specialist. Your job is to build PNG images using the Sharp library (^0.33.5, already installed).

**Your task:** Build `$ARGUMENTS`

---

## Before You Start

1. **Read the reference**: `docs/standards/SharpImageGeneration.md` — this is your bible. It has the color palette, SVG cheat sheet, gotchas, and all proven patterns.

2. **Study existing implementations** for patterns:
   - `castlistImageGenerator.js` — Full compositing pipeline (avatars, text cards, 2-column layout)
   - `mapExplorer.js` — Map overlays, fog-of-war, metadata-based sizing
   - `activityLogger.js` — Color-coded cell overlays on maps

3. **Understand the architecture**: Sharp is a compositing engine, not a drawing API. You build layers (SVG strings, colored rectangles, fetched images) then stamp them all onto a canvas in one `.composite()` call.

---

## Implementation Checklist

### File Structure
- Create a dedicated module: `{feature}ImageGenerator.js`
- Single export function: `generate{Feature}Image(params) → Buffer`
- Keep layout constants at the top (widths, heights, gaps, colors)
- Keep SVG builder functions separate from the compositing pipeline

### The Pipeline (always this order)
1. **Load data** — fetch whatever the image needs to display
2. **Calculate layout** — determine positions for all elements
3. **Build composites array** — background → shapes → images → text (z-order)
4. **Create canvas + composite once** — single `.composite()` call
5. **Return buffer** — caller handles Discord upload

### Color Palette (MANDATORY — matches Discord dark theme)
```javascript
const BG       = '#1a1a2e';   // Canvas background
const CARD_BG  = '#16213e';   // Card/panel background
const TEXT_PRI = '#e8e8e8';   // Main text
const TEXT_SEC = '#a0a0b0';   // Subtitle text
const TEXT_MUT = '#7a7a8a';   // Timestamps, hints
```

### Critical Rules
- **Always `channels: 4`** in canvas creation (RGBA)
- **Always `escapeXml()`** on any user-supplied text in SVG
- **Always `stripEmoji()`** before putting text in SVG (SVG can't render emoji)
- **Never chain `.composite()` calls** — build array, composite once
- **Font**: `Arial, Helvetica, sans-serif` only (system font, always available)
- **No `measureText()`** exists — estimate ~0.6 × fontSize per char, or use fixed layouts
- **PNG quality**: `{ quality: 90 }` default

### Discord Integration
```javascript
// The caller handles Discord upload, your module just returns a Buffer:
import { AttachmentBuilder } from 'discord.js';
const pngBuffer = await generateImage(params);
const attachment = new AttachmentBuilder(pngBuffer, { name: 'output.png' });
await channel.send({ files: [attachment] });
```

### Button Handler (if adding a button trigger)
```javascript
// In app.js — use ButtonHandlerFactory (MANDATORY)
} else if (custom_id === 'my_image_button') {
  return ButtonHandlerFactory.create({
    id: 'my_image_button',
    updateMessage: true,
    deferred: true,  // Image generation takes >3 seconds
    handler: async (context) => {
      const { generateMyImage } = await import('./myImageGenerator.js');
      const pngBuffer = await generateMyImage(context.guildId, context.client);
      const { AttachmentBuilder } = await import('discord.js');
      const attachment = new AttachmentBuilder(pngBuffer, { name: 'output.png' });
      const channelId = req.body.channel?.id || req.body.channel_id;
      const channel = await context.client.channels.fetch(channelId);
      await channel.send({ files: [attachment] });
      return { /* confirmation container */ };
    }
  })(req, res, client);
}
```

---

## SVG Quick Reference

```xml
<!-- Rounded card -->
<rect width="400" height="80" rx="12" ry="12" fill="#16213e"/>

<!-- Accent strip -->
<rect width="4" height="80" rx="2" ry="2" fill="#e74c3c"/>

<!-- Text styles -->
<text x="20" y="30" font-family="Arial, Helvetica, sans-serif"
  font-size="16" font-weight="bold" fill="#e8e8e8">Title</text>
<text x="20" y="48" font-family="Arial, Helvetica, sans-serif"
  font-size="12" fill="#a0a0b0">Subtitle</text>

<!-- Centered text -->
<text x="200" text-anchor="middle" ...>Centered</text>

<!-- Gradient -->
<defs>
  <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" style="stop-color:#e74c3c"/>
    <stop offset="100%" style="stop-color:#3498db"/>
  </linearGradient>
</defs>
<rect fill="url(#g1)" width="400" height="60" rx="8"/>

<!-- Divider line -->
<line x1="0" y1="0" x2="400" y2="0" stroke="#2a2a4a" stroke-width="1"/>

<!-- Circle -->
<circle cx="25" cy="25" r="20" fill="#5865F2"/>
```

---

## Timeline/Calendar-Specific Tips

These patterns are particularly useful for timeline and calendar visuals:

### Horizontal Timeline
```
[Left margin] → [Node] — [Line] — [Node] — [Line] — [Node] → [Right margin]
```
- Use `<circle>` for nodes, `<line>` for connectors
- Place labels above/below with `text-anchor="middle"`
- Alternate label positions to avoid overlap

### Calendar Grid
```
[Header Row: Mon Tue Wed Thu Fri Sat Sun]
[Week 1: cells...]
[Week 2: cells...]
```
- Calculate cell size: `(canvasWidth - margins) / 7`
- Use filled `<rect>` for highlighted days
- Overlay day numbers with `<text>`

### Vertical Timeline (Season progression)
```
[Title]
├── Event 1 ─── [Date] [Details]
├── Event 2 ─── [Date] [Details]
└── Event 3 ─── [Date] [Details]
```
- Vertical line: `<line>` or thin `<rect>`
- Nodes: `<circle>` at each event Y position
- Cards: Rounded `<rect>` + text composites to the right

### Date Formatting
```javascript
// Compact date
const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
// → "Mar 15"

// With day of week
const fmt2 = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
// → "Sat, Mar 15"
```

### Progress Bars
```xml
<!-- Background track -->
<rect x="20" y="40" width="360" height="8" rx="4" fill="#2a2a4a"/>
<!-- Filled portion (e.g., 65%) -->
<rect x="20" y="40" width="234" height="8" rx="4" fill="#4ade80"/>
```

---

## Testing Your Output

```bash
# Quick test — generate to /tmp/ and open
node -e "
  import('./myImageGenerator.js').then(m =>
    m.generateMyImage('guildId', null).then(buf => {
      require('fs').writeFileSync('/tmp/test.png', buf);
      console.log('Written', buf.length, 'bytes');
    })
  );
"
```

Or create a temp script in `temp/` for complex tests with mock data.
