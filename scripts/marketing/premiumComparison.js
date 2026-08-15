/**
 * ⭐ CastBot Premium vs Kadabra — comparison PNG for Discord/social.
 *
 * Regenerate whenever pricing or the feature split changes:
 *   node scripts/marketing/premiumComparison.js [out.png]
 *
 * WHY A SINGLE SVG: every element here is vector text or a shape, so there is nothing to
 * composite — one SVG string straight into sharp is simpler and sharper than layering.
 * (castlistImageGenerator.js layers because it stamps real avatar bitmaps; we don't.)
 *
 * SVG CONSTRAINTS THAT SHAPED THIS FILE (docs/standards/SharpImageGeneration.md):
 *  - No emoji. The tick marks are drawn as PATHS/POLYGONS, not glyphs — ✓/★/● would depend on
 *    a font that librsvg may not have, and a missing glyph renders as a blank box.
 *  - No text measurement. Column x-positions are fixed and labels are budgeted against
 *    MAX_LABEL_CHARS below; assertLabelWidths() fails loudly rather than letting text collide.
 *  - Arial/Helvetica only — the one stack guaranteed present.
 *
 * Palette follows the house Discord-dark palette so it reads natively when posted in a channel,
 * with CastBot's real Map Explorer teal (#00AE86) as the accent rather than an invented one.
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';

// ── Palette ──────────────────────────────────────────────────────────────────
const BG        = '#1a1a2e';
const CARD_BG   = '#16213e';
const ROW_ALT   = '#1b2645';
const RULE      = '#2a2a4a';
const TEXT_PRI  = '#e8e8e8';
const TEXT_SEC  = '#a0a0b0';
const TEXT_MUT  = '#7a7a8a';
const ACCENT    = '#00AE86';  // CastBot Map Explorer teal
const GOLD      = '#d9ac46';
const RIVAL     = '#8b99a2';

// ── Layout ───────────────────────────────────────────────────────────────────
const W          = 1200;
const PAD        = 48;
const CARD_X     = PAD;
const CARD_W     = W - PAD * 2;
const LABEL_X    = CARD_X + 28;
const COL_US     = CARD_X + 830;
const COL_THEM   = CARD_X + 990;
const ROW_H      = 34;
const GROUP_H    = 46;
const FONT       = 'Arial, Helvetica, sans-serif';

/** Longest label that fits the label column (~790px at 15px Arial, ~8.25px/char). */
const MAX_LABEL_CHARS = 80;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// ── Content ──────────────────────────────────────────────────────────────────
// mark: 'free' | 'prem' | 'paid' | 'no'
const SECTIONS = [
  ['Casting your season', [
    ['Applications answered inside Discord',                          'free', 'no'],
    ['Score applicants 1-5 with private notes',                       'free', 'no'],
    ['Cast / Tentative / Do Not Cast decisions',                      'free', 'no'],
    ['Do-not-cast conflict detection',                                'free', 'no'],
    ['Private tribe drafting before marooning',                       'free', 'no']
  ]],
  ['Idol Hunts, Escape Rooms, Safaris and Economies', [
    ['A map players physically move through',                         'free', 'paid'],
    ['Built from your own image, grid drawn for you',                 'free', 'no'],
    ['Fog of war',                                                    'free', 'no'],
    ['Items to find, use and trade',                                  'free', 'paid'],
    ['Player inventories',                                            'free', 'paid'],
    ['Currency and balances',                                         'free', 'paid'],
    ['Players attacking each other with items',                       'free', 'paid'],
    ['Navigation menus built for every location',                     'free', 'paid'],
    ['Location and command logs for spectators',                      'free', 'paid'],
    ['Stores with stock limits and role gating',                      'free', 'no'],
    ['Crafting recipes',                                              'free', 'no'],
    ['Conditional rules engine',                                      'free', 'no'],
    ['Round-based economy and results',                               'free', 'no'],
    ['Idol hunts only the first finder can claim',                    'free', 'no']
  ]],
  ['Automatically create two types of castlist', [
    ['Dynamic castlist that works directly in Discord',               'free', 'no'],
    ['Compact castlist that produces a sexy castlist visual',         'free', 'no'],
    ['Integrates with Applications - no pronouns, age or timezone',   'free', 'no'],
    ["Winners' gallery and past season castlists",                    'free', 'no'],
    ['Rank badges and vanity role sorting',                           'free', 'no'],
    ['Self-updating menu pinned to a channel',                        'free', 'no'],
    ['Tribe swap with a dramatic reveal',                             'free', 'no']
  ]],
  ['Players look after themselves', [
    ['Pronoun roles players pick themselves',                         'free', 'no'],
    ['Timezone roles, daylight saving handled',                       'free', 'no'],
    ['A profile menu every player can open',                          'free', 'no'],
    ['Availability polling across timezones',                         'free', 'no']
  ]],
  ['What Premium adds', [
    ['Ask questions about your server in plain English',              'prem', 'no'],
    ['Ask CastBot AI to build your escape rooms and safaris for you',  'prem', 'no'],
    ['Change your Safari by describing the change',                   'prem', 'no'],
    ['Custom Attributes such as HP, Mana, Strength, etc.',            'prem', 'no'],
    ['Enemies to fight',                                              'prem', 'no'],
    ['Export and re-import your whole build',                         'prem', 'no'],
    ['Channel Archiving - great if you reuse one server per season',  'prem', 'no'],
    ['Generate 1on1s, confessionals, subs and more',                  'prem', 'paid']
  ]]
];

/** Fail loudly rather than rendering text that overruns into the tick columns. */
function assertLabelWidths() {
  const over = SECTIONS.flatMap(([, rows]) => rows)
    .map(([label]) => label)
    .filter((l) => l.length > MAX_LABEL_CHARS);
  if (over.length) {
    throw new Error(`Label(s) exceed ${MAX_LABEL_CHARS} chars and would collide with the tick columns:\n  ${over.join('\n  ')}`);
  }
}

// ── Tick marks (shapes, never glyphs) ────────────────────────────────────────
function mark(kind, cx, cy) {
  switch (kind) {
    case 'free': // checkmark
      return `<path d="M${cx - 7},${cy} l4.5,4.8 L${cx + 7.5},${cy - 6}" fill="none" stroke="${ACCENT}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'prem': { // five-point star
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 8 : 3.4;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${GOLD}"/>`;
    }
    case 'paid': // filled disc = costs money
      return `<circle cx="${cx}" cy="${cy}" r="6" fill="${RIVAL}"/>`;
    default:     // em dash = not available
      return `<rect x="${cx - 7}" y="${cy - 1}" width="14" height="2" rx="1" fill="${TEXT_MUT}" opacity="0.6"/>`;
  }
}

function text(x, y, str, { size = 15, fill = TEXT_PRI, weight = 'normal', anchor = 'start', spacing = 0 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(str)}</text>`;
}

// ── Build ────────────────────────────────────────────────────────────────────
export function buildComparisonSvg() {
  assertLabelWidths();

  const rowCount = SECTIONS.reduce((n, [, rows]) => n + rows.length, 0);
  const tableH = SECTIONS.length * GROUP_H + rowCount * ROW_H + 20;
  const TABLE_Y = 452;
  const H = TABLE_Y + tableH + 118;

  const p = [];

  p.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);

  // Faint graph rule — the coordinate grid CastBot draws over Safari maps.
  p.push(`<defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
    <path d="M28,0 L0,0 0,28" fill="none" stroke="${TEXT_PRI}" stroke-width="1" opacity="0.028"/>
  </pattern></defs>`);
  p.push(`<rect width="${W}" height="${H}" fill="url(#grid)"/>`);

  // ── Header ──
  p.push(text(PAD, 74, 'CASTBOT', { size: 14, fill: ACCENT, weight: 'bold', spacing: 3.2 }));
  p.push(text(PAD, 128, 'The things other bots', { size: 42, weight: 'bold' }));
  p.push(text(PAD, 178, 'charge for are free here.', { size: 42, weight: 'bold', fill: ACCENT }));
  p.push(text(PAD, 214, 'Applications, casting, castlists, idol hunts, maps and economies — almost none of it behind a paywall.', { size: 16, fill: TEXT_SEC }));

  // ── Price cards ──
  const cardY = 244, cardH = 168, gap = 24;
  const cardW = (CARD_W - gap) / 2;

  // FRAMING NOTE (2026-08-11): the hero number is $0, not $2.50 — what CastBot actually wins is
  // the FREE tier, and a head-to-head $2.50-vs-$3 line invites a price fight instead of a feature
  // one. Activations were dropped from the Kadabra card entirely: CastBot has no equivalent
  // concept, so explaining theirs only muddies the comparison.
  p.push(`<rect x="${CARD_X}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="${CARD_BG}" stroke="${ACCENT}" stroke-width="1.5"/>`);
  p.push(`<rect x="${CARD_X}" y="${cardY}" width="${cardW}" height="4" rx="2" fill="${ACCENT}"/>`);
  p.push(text(CARD_X + 26, cardY + 40, 'CASTBOT', { size: 12, fill: ACCENT, weight: 'bold', spacing: 2.4 }));
  p.push(text(CARD_X + 26, cardY + 92, '$0', { size: 46, weight: 'bold' }));
  p.push(text(CARD_X + 92, cardY + 92, 'for everything below', { size: 17, fill: TEXT_SEC }));
  p.push(text(CARD_X + 26, cardY + 122, 'Every row marked with a tick - free, in every server.', { size: 15, fill: TEXT_PRI }));
  p.push(text(CARD_X + 26, cardY + 146, 'Premium is $2.50 / month and adds the starred rows.', { size: 13.5, fill: ACCENT }));

  const kx = CARD_X + cardW + gap;
  p.push(`<rect x="${kx}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="${CARD_BG}" stroke="${RULE}" stroke-width="1.5"/>`);
  p.push(text(kx + 26, cardY + 40, 'KADABRA', { size: 12, fill: RIVAL, weight: 'bold', spacing: 2.4 }));
  p.push(text(kx + 26, cardY + 92, '$3', { size: 46, weight: 'bold', fill: TEXT_SEC }));
  p.push(text(kx + 92, cardY + 92, '/ month', { size: 17, fill: TEXT_SEC }));
  p.push(text(kx + 26, cardY + 122, 'The free tier is movement only - no items, no economy.', { size: 15, fill: TEXT_PRI }));
  p.push(text(kx + 26, cardY + 146, 'Items, attacks, logs and 1on1s all need a paid tier.', { size: 13.5, fill: TEXT_MUT }));

  // ── Legend ──
  const ly = 436;
  const legend = [
    ['free', 'Free in CastBot', ACCENT],
    ['prem', 'CastBot Premium', GOLD],
    ['paid', 'Requires a paid tier', RIVAL],
    ['no',   'Not available', TEXT_MUT]
  ];
  let lx = PAD + 8;
  for (const [kind, label, colour] of legend) {
    p.push(mark(kind, lx, ly - 5));
    p.push(text(lx + 16, ly, label, { size: 13, fill: colour }));
    lx += 26 + label.length * 7.2;
  }

  // ── Table ──
  let y = TABLE_Y;
  p.push(`<rect x="${CARD_X}" y="${y}" width="${CARD_W}" height="${tableH}" rx="10" fill="${CARD_BG}"/>`);

  // Column headers sit on the first group band, so draw them per-section instead of once.
  let rowIndex = 0;
  for (const [groupName, rows] of SECTIONS) {
    p.push(text(LABEL_X, y + 30, groupName.toUpperCase(), { size: 12, fill: ACCENT, weight: 'bold', spacing: 2.2 }));
    if (rowIndex === 0) {
      p.push(text(COL_US, y + 30, 'CASTBOT', { size: 12, fill: ACCENT, weight: 'bold', anchor: 'middle', spacing: 1.6 }));
      p.push(text(COL_THEM, y + 30, 'KADABRA', { size: 12, fill: RIVAL, weight: 'bold', anchor: 'middle', spacing: 1.6 }));
    }
    y += GROUP_H;
    p.push(`<line x1="${CARD_X + 16}" y1="${y - 8}" x2="${CARD_X + CARD_W - 16}" y2="${y - 8}" stroke="${ACCENT}" stroke-width="1" opacity="0.35"/>`);

    for (const [label, us, them] of rows) {
      if (rowIndex % 2 === 1) {
        p.push(`<rect x="${CARD_X + 8}" y="${y}" width="${CARD_W - 16}" height="${ROW_H}" fill="${ROW_ALT}"/>`);
      }
      p.push(text(LABEL_X, y + 22, label, { size: 15, fill: TEXT_PRI }));
      p.push(mark(us, COL_US, y + ROW_H / 2));
      p.push(mark(them, COL_THEM, y + ROW_H / 2));
      y += ROW_H;
      rowIndex++;
    }
  }

  // ── Footer ──
  const fy = TABLE_Y + tableH + 40;
  p.push(`<line x1="${PAD}" y1="${fy - 22}" x2="${W - PAD}" y2="${fy - 22}" stroke="${RULE}" stroke-width="1"/>`);
  p.push(text(PAD, fy, 'Kadabra pricing (US) and premium boundaries from its public Patreon and the Kadabra V2 Guide, checked August 2026.', { size: 13, fill: TEXT_MUT }));
  p.push(text(PAD, fy + 22, 'Prices shown in USD. This chart covers the features listed — both bots do things the other doesn’t.', { size: 13, fill: TEXT_MUT }));
  p.push(text(PAD, fy + 52, 'ko-fi.com/castbot', { size: 15, fill: ACCENT, weight: 'bold' }));
  p.push(text(W - PAD, fy + 52, 'CastBot — made by Reece (@extremedonkey)', { size: 13, fill: TEXT_MUT, anchor: 'end' }));

  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('')}</svg>`, W, H };
}

export async function generateComparisonImage() {
  const { svg } = buildComparisonSvg();
  return sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
}

// CLI
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('premiumComparison.js');
if (invokedDirectly) {
  const out = process.argv[2] || 'castbot-vs-kadabra.png';
  const { W, H } = buildComparisonSvg();
  generateComparisonImage()
    .then((buf) => {
      writeFileSync(out, buf);
      console.log(`✅ ${out} — ${W}x${H}, ${(buf.length / 1024).toFixed(0)}KB`);
    })
    .catch((e) => { console.error('❌', e.message); process.exit(1); });
}
