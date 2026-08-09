#!/usr/bin/env node
/**
 * featureSplash.js — renders a single-feature "splash" infographic (as opposed to
 * releaseImage.js, which renders the multi-item CHANGELOG card for a whole release).
 *
 * WHY A SECOND RENDERER: the release card is a fixed 2-column grid of equal-weight items — right
 * for "here are six things we shipped", wrong for "here is ONE thing, and here is why you care".
 * A splash leads with the pitch, walks three steps, then shows the actual UI so the reader can see
 * what they'd be looking at.
 *
 * USAGE
 *   node scripts/release/featureSplash.js scripts/release/releases/<spec>.json [out.png]
 *
 * SPEC
 *   {
 *     "pill":     "NEW IN CASTBOT",
 *     "title":    "The Marooning Planner",
 *     "subtitle": "one line — the promise, in plain words",
 *     "accent":   "#9b59b6",
 *     "steps":    [ { n, title, desc: ["line", …] } ],      // exactly 3 reads best
 *     "mock":     { "header": "…", "blocks": [ … ] },        // the UI screenshot-alike
 *     "keyTitle": "WHAT THE FLAGS MEAN",
 *     "key":      [ { label, color, text } ],
 *     "footer":   "/menu → Season Manager → Marooning"
 *   }
 *
 * LAYOUT NOTES (same constraints as releaseImage.js — SVG has no text measurement):
 *   - NOTHING is wrapped for you. Hand-wrap every `desc`/`text` line; the validator enforces caps.
 *   - Emoji are stripped, not rendered. Flags are drawn as coloured pill badges instead — which
 *     reads better in an infographic anyway than a glyph nobody can see at a glance.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Discord dark-theme palette (docs/standards/SharpImageGeneration.md)
const BG = '#1a1a2e';
const CARD_BG = '#2a2a3e';
const MOCK_BG = '#232338';
const TEXT_PRI = '#e8e8e8';
const TEXT_SEC = '#a0a0b0';
const TEXT_MUT = '#6a6a7a';

const W = 1200;
const PAD = 48;
const FONT = 'Arial, Helvetica, sans-serif';
// Single quotes deliberately: this string lands inside a double-quoted SVG attribute, so a
// double-quoted font stack would terminate the attribute and produce an unparseable document.
const MONO = "'Consolas', 'DejaVu Sans Mono', monospace";

// Hand-wrap caps — exceeded means it overflows its box, so fail loudly rather than render garbage.
const MAX_STEP_CHARS = 42;
const MAX_KEY_CHARS = 74;
const MAX_MOCK_CHARS = 62;

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** SVG cannot render emoji — strip rather than ship tofu boxes. */
function stripEmoji(str) {
  return String(str).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '').replace(/\s{2,}/g, ' ').trim();
}

const t = (s) => escapeXml(stripEmoji(s));

function validateSpec(spec) {
  const errs = [];
  if (!spec.title) errs.push('title is required');
  if (!Array.isArray(spec.steps) || !spec.steps.length) errs.push('steps[] is required');
  for (const s of spec.steps || []) {
    for (const line of s.desc || []) {
      if (stripEmoji(line).length > MAX_STEP_CHARS) errs.push(`step "${s.title}": line over ${MAX_STEP_CHARS} chars — "${line}"`);
    }
  }
  for (const k of spec.key || []) {
    if (stripEmoji(k.text).length > MAX_KEY_CHARS) errs.push(`key "${k.label}": text over ${MAX_KEY_CHARS} chars`);
  }
  for (const b of spec.mock?.blocks || []) {
    for (const r of b.rows || []) {
      if (stripEmoji(r.text).length > MAX_MOCK_CHARS) errs.push(`mock row over ${MAX_MOCK_CHARS} chars — "${r.text}"`);
    }
  }
  if (errs.length) {
    console.error('❌ Spec problems:\n  - ' + errs.join('\n  - '));
    process.exit(1);
  }
}

// ── Section builders. Each returns { svg, height } so the page can stack without magic numbers. ──

function buildHeader(spec, y) {
  const accent = spec.accent || '#9b59b6';
  const pillW = Math.max(140, stripEmoji(spec.pill || '').length * 9 + 34);
  let svg = `
    <rect x="0" y="0" width="${W}" height="6" fill="url(#topbar)"/>
    <rect x="${(W - pillW) / 2}" y="${y}" width="${pillW}" height="28" rx="14" fill="none" stroke="${accent}" stroke-width="1.5"/>
    <text x="${W / 2}" y="${y + 19}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="bold" letter-spacing="2.5" fill="${accent}">${t(spec.pill || '')}</text>
    <text x="${W / 2}" y="${y + 92}" text-anchor="middle" font-family="Georgia, serif" font-size="54" font-weight="bold" fill="url(#titleGrad)">${t(spec.title)}</text>
    <text x="${W / 2}" y="${y + 130}" text-anchor="middle" font-family="${FONT}" font-size="19" fill="${TEXT_SEC}">${t(spec.subtitle || '')}</text>
    <line x1="${W / 2 - 60}" y1="${y + 156}" x2="${W / 2 + 60}" y2="${y + 156}" stroke="${accent}" stroke-width="2"/>`;
  return { svg, height: 190 };
}

function buildSteps(spec, y) {
  const accent = spec.accent || '#9b59b6';
  const n = spec.steps.length;
  const gap = 24;
  const cw = (W - PAD * 2 - gap * (n - 1)) / n;
  const ch = 168;
  let svg = `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="bold" letter-spacing="4" fill="${TEXT_MUT}">${t(spec.stepsTitle || 'HOW IT WORKS')}</text>`;
  const top = y + 26;
  spec.steps.forEach((s, i) => {
    const x = PAD + i * (cw + gap);
    const col = s.color || accent;
    svg += `
      <rect x="${x}" y="${top}" width="${cw}" height="${ch}" rx="12" fill="${CARD_BG}"/>
      <rect x="${x}" y="${top}" width="4" height="${ch}" rx="2" fill="${col}"/>
      <circle cx="${x + 42}" cy="${top + 40}" r="20" fill="${col}" opacity="0.18"/>
      <text x="${x + 42}" y="${top + 48}" text-anchor="middle" font-family="Georgia, serif" font-size="24" font-weight="bold" fill="${col}">${s.n}</text>
      <text x="${x + 76}" y="${top + 48}" font-family="${FONT}" font-size="18" font-weight="bold" fill="${TEXT_PRI}">${t(s.title)}</text>`;
    (s.desc || []).forEach((line, li) => {
      svg += `<text x="${x + 22}" y="${top + 84 + li * 20}" font-family="${FONT}" font-size="13.5" fill="${TEXT_SEC}">${t(line)}</text>`;
    });
    // Arrow between cards — makes the three read as a sequence, not three unrelated features.
    if (i < n - 1) {
      const ax = x + cw + gap / 2;
      svg += `<path d="M ${ax - 6} ${top + ch / 2 - 7} L ${ax + 5} ${top + ch / 2} L ${ax - 6} ${top + ch / 2 + 7}" fill="none" stroke="${TEXT_MUT}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  });
  return { svg, height: 26 + ch + 34 };
}

/**
 * The UI mock. Rows carry an optional `badge` — drawn as a coloured pill on the right rather than
 * as the emoji flag the real bot uses, because SVG can't render emoji and a pill labelled
 * "NO OFFER" is legible at a glance in a way a tiny glyph wouldn't be.
 */
function buildMock(spec, y) {
  const m = spec.mock;
  if (!m) return { svg: '', height: 0 };
  const accent = spec.accent || '#9b59b6';
  const x = PAD, w = W - PAD * 2;

  const ROW_H = 26, BLOCK_GAP = 16, HEADER_H = 62;
  let inner = HEADER_H + 14;
  for (const b of m.blocks) inner += 26 + (b.rows?.length || 0) * ROW_H + BLOCK_GAP;
  const h = inner + 10;

  let svg = `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${MOCK_BG}"/>
    <rect x="${x}" y="${y}" width="5" height="${h}" rx="2.5" fill="${accent}"/>
    <text x="${x + 26}" y="${y + 32}" font-family="${FONT}" font-size="17" font-weight="bold" fill="${TEXT_PRI}">${t(m.header)}</text>
    <text x="${x + 26}" y="${y + 52}" font-family="${FONT}" font-size="13" fill="${TEXT_MUT}">${t(m.subheader || '')}</text>
    <line x1="${x + 20}" y1="${y + HEADER_H}" x2="${x + w - 20}" y2="${y + HEADER_H}" stroke="#3a3a52" stroke-width="1"/>`;

  let cy = y + HEADER_H + 30;
  for (const b of m.blocks) {
    const bTop = cy - 16;
    const bH = 20 + (b.rows?.length || 0) * ROW_H;
    // Quote-style left rule — the same visual the real tab uses for a tribe heading.
    svg += `
      <rect x="${x + 26}" y="${bTop}" width="3" height="${bH}" rx="1.5" fill="${b.color || accent}"/>
      <text x="${x + 42}" y="${cy}" font-family="${FONT}" font-size="15" font-weight="bold" fill="${b.color || accent}">${t(b.title)}</text>
      <text x="${x + 42 + stripEmoji(b.title).length * 8.6 + 10}" y="${cy}" font-family="${FONT}" font-size="13" fill="${TEXT_MUT}">${t(b.count || '')}</text>`;
    cy += 24;
    for (const r of (b.rows || [])) {
      svg += `<text x="${x + 42}" y="${cy}" font-family="${MONO}" font-size="13.5" fill="${r.muted ? TEXT_MUT : TEXT_PRI}">${t(r.text)}</text>`;
      if (r.badge) {
        const bw = stripEmoji(r.badge).length * 7 + 20;
        const bx = x + w - 26 - bw;
        svg += `
          <rect x="${bx}" y="${cy - 14}" width="${bw}" height="19" rx="9.5" fill="${r.badgeColor}" opacity="0.16"/>
          <text x="${bx + bw / 2}" y="${cy - 1}" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="bold" letter-spacing="0.5" fill="${r.badgeColor}">${t(r.badge)}</text>`;
      }
      cy += ROW_H;
    }
    cy += BLOCK_GAP;
  }
  return { svg, height: h + 34 };
}

function buildKey(spec, y) {
  if (!spec.key?.length) return { svg: '', height: 0 };
  const x = PAD, w = W - PAD * 2;
  const h = 34 + spec.key.length * 30 + 14;
  let svg = `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${CARD_BG}"/>
    <text x="${x + 26}" y="${y + 26}" font-family="${FONT}" font-size="11.5" font-weight="bold" letter-spacing="3" fill="${TEXT_MUT}">${t(spec.keyTitle || 'KEY')}</text>`;
  spec.key.forEach((k, i) => {
    const ky = y + 52 + i * 30;
    const bw = stripEmoji(k.label).length * 7 + 20;
    svg += `
      <rect x="${x + 26}" y="${ky - 13}" width="${bw}" height="19" rx="9.5" fill="${k.color}" opacity="0.16"/>
      <text x="${x + 26 + bw / 2}" y="${ky}" text-anchor="middle" font-family="${FONT}" font-size="10.5" font-weight="bold" letter-spacing="0.5" fill="${k.color}">${t(k.label)}</text>
      <text x="${x + 26 + bw + 16}" y="${ky}" font-family="${FONT}" font-size="13.5" fill="${TEXT_SEC}">${t(k.text)}</text>`;
  });
  return { svg, height: h + 30 };
}

function buildBanner(spec, y) {
  if (!spec.banner) return { svg: '', height: 0 };
  const x = PAD, w = W - PAD * 2, h = 62;
  const col = spec.banner.color || '#2ecc71';
  const svg = `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${col}" opacity="0.10"/>
    <rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${col}"/>
    <text x="${W / 2}" y="${y + 27}" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="bold" fill="${col}">${t(spec.banner.title)}</text>
    <text x="${W / 2}" y="${y + 48}" text-anchor="middle" font-family="${FONT}" font-size="13.5" fill="${TEXT_SEC}">${t(spec.banner.text)}</text>`;
  return { svg, height: h + 28 };
}

function buildFooter(spec, y) {
  const accent = spec.accent || '#9b59b6';
  const svg = `
    <line x1="${W / 2 - 90}" y1="${y}" x2="${W / 2 + 90}" y2="${y}" stroke="#3a3a52" stroke-width="1"/>
    <text x="${W / 2}" y="${y + 28}" text-anchor="middle" font-family="${MONO}" font-size="14" fill="${accent}">${t(spec.footer || '')}</text>
    <text x="${W / 2}" y="${y + 50}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="${TEXT_MUT}">${t(spec.footnote || '')}</text>`;
  return { svg, height: 76 };
}

async function render(specPath, outPath) {
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  validateSpec(spec);
  const accent = spec.accent || '#9b59b6';

  // Two passes: measure by building at y=0, then re-build at real offsets. Cheap (string concat)
  // and keeps every section's height owned by its own builder.
  const order = [buildHeader, buildSteps, buildMock, buildKey, buildBanner, buildFooter];
  let y = 44, parts = [];
  for (const fn of order) {
    const { svg, height } = fn(spec, y);
    parts.push(svg);
    y += height;
  }
  const H = y + 24;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topbar" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#e74c3c"/>
        <stop offset="50%" style="stop-color:${accent}"/>
        <stop offset="100%" style="stop-color:#3498db"/>
      </linearGradient>
      <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#e8e8e8"/>
        <stop offset="100%" style="stop-color:${accent}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="${BG}"/>
    ${parts.join('\n')}
  </svg>`;

  const buf = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();
  fs.writeFileSync(outPath, buf);
  console.log(`✅ ${buf.length.toLocaleString()} bytes → ${outPath} (${W}×${H})`);
}

const [, , specArg, outArg] = process.argv;
if (!specArg) {
  console.error('Usage: node scripts/release/featureSplash.js <spec.json> [out.png]');
  process.exit(1);
}
const out = outArg || path.join(path.dirname(specArg), path.basename(specArg, '.json') + '.png');
render(specArg, out).catch(e => { console.error('❌', e.message); process.exit(1); });
