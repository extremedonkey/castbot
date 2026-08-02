#!/usr/bin/env node
/**
 * releaseImage.js — renders the "CastBot Update" release-notes card image.
 *
 * WHY THIS EXISTS: every release used to get its own hand-copied generator in temp/
 * (generateApril2026Release.js, generateMay2026Release.js, generateJul2026Release.js …), each a
 * near-identical 200-line fork with the layout maths re-pasted. The renderer is now fixed and
 * each release is just a small JSON spec.
 *
 * USAGE
 *   node scripts/release/releaseImage.js scripts/release/releases/<spec>.json [out.png]
 *
 * The spec (see releases/*.json for a worked example):
 *   {
 *     "period":   "AUGUST 2026",              // small pill above the title
 *     "title":    "CastBot Update",
 *     "subtitle": "one line, what this release is about",
 *     "footer":   "Deployed to production 2 August 2026",
 *     "cards":    [ { title, badge: NEW|IMPROVED|FIXED, color, desc: ["line", …] } ],
 *     "underHood": ["short phrase", …],       // optional single strip, omit or []
 *     "stats":    [ { value, label, color } ] // 3-5 reads best
 *   }
 *
 * LAYOUT NOTES (SVG has no text measurement — everything is fixed-width by design):
 *   - Cards are a 2-column grid; canvas height is derived from the row count.
 *   - `desc` lines are NOT wrapped. Keep each ≤ ~62 chars or it will overflow the card.
 *     Wrap by hand in the spec — that keeps line breaks intentional rather than ragged.
 *   - Emoji are stripped (SVG cannot render them) — say it in words, not glyphs.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Discord dark-theme palette (docs/standards/SharpImageGeneration.md)
const BG = '#1a1a2e';
const CARD_BG = '#2a2a3e';
const TEXT_PRI = '#e8e8e8';
const TEXT_SEC = '#a0a0b0';
const TEXT_MUT = '#6a6a7a';

const BADGE = {
  NEW: { bg: '#2ecc71', text: '#ffffff' },
  IMPROVED: { bg: '#f1c40f', text: '#1a1a2e' },
  FIXED: { bg: '#e74c3c', text: '#ffffff' }
};

const W = 1200;
const CARD_W = 566, CARD_H = 138, GAP_X = 24, GAP_Y = 22;
const CARDS_TOP = 218;
const MAX_DESC_CHARS = 62; // fits CARD_W at font-size 13

const FONT = 'Arial, Helvetica, sans-serif';

/** SVG has no entity escaping — any spec text could otherwise break the document. */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** SVG cannot render emoji — they come out as tofu boxes. Strip before drawing. */
function stripEmoji(str) {
  return String(str)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const txt = s => escapeXml(stripEmoji(s));

/**
 * Pure — validate a spec and report every problem at once, so a bad spec fails here with a
 * useful message rather than silently rendering text off the edge of a card.
 * @param {object} spec
 * @returns {string[]} problems (empty = valid)
 */
export function validateSpec(spec) {
  const problems = [];
  if (!spec || typeof spec !== 'object') return ['spec is not an object'];

  for (const field of ['period', 'title', 'subtitle']) {
    if (!spec[field]) problems.push(`missing "${field}"`);
  }
  if (!Array.isArray(spec.cards) || spec.cards.length === 0) {
    problems.push('"cards" must be a non-empty array');
    return problems;
  }

  spec.cards.forEach((card, i) => {
    if (!card.title) problems.push(`cards[${i}]: missing title`);
    if (!BADGE[card.badge]) problems.push(`cards[${i}]: badge must be NEW, IMPROVED or FIXED (got "${card.badge}")`);
    if (!Array.isArray(card.desc)) {
      problems.push(`cards[${i}]: desc must be an array of lines`);
      return;
    }
    if (card.desc.length > 4) problems.push(`cards[${i}]: ${card.desc.length} desc lines — max 4 fit the card`);
    card.desc.forEach((line, li) => {
      if (stripEmoji(line).length > MAX_DESC_CHARS) {
        problems.push(`cards[${i}].desc[${li}]: ${stripEmoji(line).length} chars — wrap at ${MAX_DESC_CHARS}`);
      }
    });
  });

  for (const stat of spec.stats || []) {
    if (!stat.value || !stat.label) problems.push('every stat needs a value and a label');
  }
  return problems;
}

/** Pure — canvas height for a spec. Derived so adding a card row can't clip the footer. */
export function computeHeight(spec) {
  const rows = Math.ceil(spec.cards.length / 2);
  const cardsBlock = rows * CARD_H + (rows - 1) * GAP_Y;
  const underHood = (spec.underHood || []).length ? 54 : 0;
  const stats = (spec.stats || []).length ? 112 : 30;
  return CARDS_TOP + cardsBlock + 30 + underHood + stats + 62;
}

function buildSvg(spec, H) {
  const accent = spec.accent || '#3498db';

  const defs = `<defs>
    <linearGradient id="hbar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#e74c3c"/>
      <stop offset="25%" style="stop-color:#9b59b6"/>
      <stop offset="50%" style="stop-color:#3498db"/>
      <stop offset="75%" style="stop-color:#9b59b6"/>
      <stop offset="100%" style="stop-color:#e74c3c"/>
    </linearGradient>
    <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#e74c3c"/>
      <stop offset="50%" style="stop-color:#3498db"/>
      <stop offset="100%" style="stop-color:#2ecc71"/>
    </linearGradient>
  </defs>`;

  const periodW = Math.max(116, stripEmoji(spec.period).length * 9 + 34);
  let svg = `<rect x="0" y="0" width="${W}" height="4" fill="url(#hbar)"/>
    <rect x="${W / 2 - periodW / 2}" y="40" width="${periodW}" height="28" rx="14" fill="none" stroke="${accent}" stroke-width="1.5"/>
    <text x="${W / 2}" y="59" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="bold" fill="${accent}" letter-spacing="2">${txt(spec.period)}</text>
    <text x="${W / 2}" y="112" text-anchor="middle" font-family="Georgia, serif" font-size="48" font-weight="bold" fill="url(#titleGrad)">${txt(spec.title)}</text>
    <text x="${W / 2}" y="145" text-anchor="middle" font-family="${FONT}" font-size="16" fill="${TEXT_SEC}">${txt(spec.subtitle)}</text>
    <line x1="${W / 2 - 60}" y1="165" x2="${W / 2 + 60}" y2="165" stroke="${accent}" stroke-width="2" opacity="0.5"/>
    <text x="${W / 2}" y="195" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${TEXT_MUT}" letter-spacing="4">WHAT'S NEW</text>`;

  // Cards — 2-column grid
  const startX = (W - (2 * CARD_W + GAP_X)) / 2;
  spec.cards.forEach((card, i) => {
    const x = startX + (i % 2) * (CARD_W + GAP_X);
    const y = CARDS_TOP + Math.floor(i / 2) * (CARD_H + GAP_Y);
    const b = BADGE[card.badge];
    const color = card.color || accent;

    svg += `<rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="10" fill="${CARD_BG}"/>
      <rect x="${x}" y="${y + 8}" width="4" height="${CARD_H - 16}" rx="2" fill="${color}"/>
      <rect x="${x + 16}" y="${y + CARD_H - 10}" width="${CARD_W - 32}" height="2" rx="1" fill="${color}" opacity="0.4"/>
      <text x="${x + 20}" y="${y + 32}" font-family="${FONT}" font-size="17" font-weight="bold" fill="${TEXT_PRI}">${txt(card.title)}</text>`;

    const badgeW = card.badge.length * 9 + 16;
    const badgeX = x + CARD_W - badgeW - 14;
    svg += `<rect x="${badgeX}" y="${y + 16}" width="${badgeW}" height="22" rx="11" fill="${b.bg}"/>
      <text x="${badgeX + badgeW / 2}" y="${y + 31}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="bold" fill="${b.text}">${card.badge}</text>`;

    card.desc.forEach((line, li) => {
      svg += `<text x="${x + 20}" y="${y + 58 + li * 19}" font-family="${FONT}" font-size="13" fill="${TEXT_SEC}">${txt(line)}</text>`;
    });
  });

  const rows = Math.ceil(spec.cards.length / 2);
  let cursorY = CARDS_TOP + rows * CARD_H + (rows - 1) * GAP_Y + 30;

  if ((spec.underHood || []).length) {
    svg += `<text x="${W / 2}" y="${cursorY}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${TEXT_MUT}" letter-spacing="4">UNDER THE HOOD</text>
      <text x="${W / 2}" y="${cursorY + 24}" text-anchor="middle" font-family="${FONT}" font-size="13" fill="${TEXT_SEC}">${txt(spec.underHood.join('   •   '))}</text>`;
    cursorY += 54;
  }

  const stats = spec.stats || [];
  if (stats.length) {
    const statW = Math.min(200, Math.floor((W - 80 - (stats.length - 1) * 18) / stats.length));
    const statH = 60, statGap = 18;
    const statStartX = (W - (stats.length * statW + (stats.length - 1) * statGap)) / 2;
    stats.forEach((stat, i) => {
      const x = statStartX + i * (statW + statGap);
      svg += `<rect x="${x}" y="${cursorY}" width="${statW}" height="${statH}" rx="12" fill="${CARD_BG}" stroke="${stat.color || accent}" stroke-width="1" opacity="0.8"/>
        <text x="${x + statW / 2}" y="${cursorY + 26}" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="bold" fill="${stat.color || accent}">${txt(stat.value)}</text>
        <text x="${x + statW / 2}" y="${cursorY + 46}" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${TEXT_MUT}" letter-spacing="2">${txt(stat.label)}</text>`;
    });
  }

  if (spec.footer) {
    svg += `<line x1="${W / 2 - 100}" y1="${H - 42}" x2="${W / 2 + 100}" y2="${H - 42}" stroke="${accent}" stroke-width="1" opacity="0.3"/>
      <text x="${W / 2}" y="${H - 20}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${TEXT_MUT}">${txt(spec.footer)}</text>`;
  }

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${defs}${svg}</svg>`;
}

/**
 * Render a release spec to a PNG buffer.
 * @param {object} spec
 * @returns {Promise<Buffer>}
 */
export async function renderReleaseImage(spec) {
  const problems = validateSpec(spec);
  if (problems.length) throw new Error(`Invalid release spec:\n  - ${problems.join('\n  - ')}`);

  const H = computeHeight(spec);
  return sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([{ input: Buffer.from(buildSvg(spec, H)), top: 0, left: 0 }])
    .png({ quality: 90 })
    .toBuffer();
}

// ── CLI ──
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error('Usage: node scripts/release/releaseImage.js <spec.json> [out.png]');
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const outPath = process.argv[3] || specPath.replace(/\.json$/, '.png');
  renderReleaseImage(spec)
    .then(buf => {
      fs.writeFileSync(outPath, buf);
      console.log(`✅ ${buf.length.toLocaleString()} bytes → ${outPath} (${W}×${computeHeight(spec)})`);
    })
    .catch(err => { console.error(`❌ ${err.message}`); process.exit(1); });
}
