#!/usr/bin/env node
/**
 * Guide infographic generator — builds the committed PNGs under img/guides/
 * that the Safari player/host guides embed via Media Gallery (see guideAssets.js).
 *
 * Run from repo root:  node scripts/dev/generate-guide-images.mjs
 * Requires network on first run (downloads twemoji PNGs into img/guides/.emoji-cache/).
 *
 * Outputs:
 *   img/guides/player-stamina-drip.png       — player explainer, Drip style
 *   img/guides/player-stamina-fullreset.png  — player explainer, Full refill style
 *   img/guides/host-stamina-options.png      — host guide to the stamina settings
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO, 'img/guides');
const EMOJI_DIR = path.join(OUT_DIR, '.emoji-cache');

// ---------- twemoji ----------
const EMOJI = {
  bolt: '26a1', recycle: '267b', map: '1f5fa', compass: '1f9ed',
  fish: '1f41f', horse: '1f40e', hourglass: '23f3', gear: '2699',
  sleep: '1f634', sparkles: '2728', warn: '26a0', dial: '1f39b',
  bulb: '1f4a1', star: '2b50', toolbox: '1f9f0'
};
async function ensureEmoji() {
  fs.mkdirSync(EMOJI_DIR, { recursive: true });
  for (const cp of Object.values(EMOJI)) {
    const f = path.join(EMOJI_DIR, `${cp}.png`);
    if (fs.existsSync(f)) continue;
    const r = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/${cp}.png`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`emoji fetch ${cp}: ${r.status}`);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
}

// ---------- palette / layout ----------
const C = {
  BG: '#12121f', CARD: '#16213e', CARD2: '#1a2744', INSET: '#0f1830',
  TEXT: '#e8e8e8', SUB: '#a0a0b0', MUT: '#7a7a8a',
  BLURPLE: '#5865F2', GREEN: '#4ade80', RED: '#e74c3c',
  ORANGE: '#f59e0b', AMBER: '#fbbf24', BLUE: '#3498db', SEP: '#2a2a4a'
};
const FONT = 'Arial, Helvetica, sans-serif';
const W = 1400, M = 36, CW = W - M * 2, PAD = 36;
const ARROW_COLORS = [C.BLUE, C.RED, C.GREEN, C.ORANGE];
const DEFS = `<defs>${ARROW_COLORS.map(c =>
  `<marker id="arr_${c.slice(1)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
     <path d="M 0 0 L 10 5 L 0 10 z" fill="${c}"/></marker>`).join('')}</defs>`;

// ---------- canvas builder (fresh state per image) ----------
function makeCanvas() {
  const svg = [], emo = [];
  const E = (n, x, y, s) => emo.push({ n, x, y, s });
  const T = (x, y, txt, size, fill, o = {}) => svg.push(
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}"` +
    (o.bold ? ' font-weight="bold"' : '') + (o.anchor ? ` text-anchor="${o.anchor}"` : '') +
    ` fill="${fill}">${txt}</text>`);
  const NODE_W = 158, NODE_H = 106;
  function pips(cx, cy, cur, max) {
    const gap = 30, x0 = cx - ((max - 1) * gap) / 2;
    for (let i = 0; i < max; i++) {
      const x = x0 + i * gap;
      if (i < cur) svg.push(`<circle cx="${x}" cy="${cy}" r="11" fill="${C.AMBER}" stroke="#b45309" stroke-width="2"/>`);
      else svg.push(`<circle cx="${x}" cy="${cy}" r="11" fill="#0d0d18" stroke="#3a3a5a" stroke-width="2"/>`);
    }
  }
  function node(x, y, cur, max, label, glow, w = NODE_W) {
    svg.push(`<rect x="${x}" y="${y}" width="${w}" height="${NODE_H}" rx="12" ry="12" fill="${C.CARD2}" stroke="${glow || C.SEP}" stroke-width="${glow ? 2.5 : 1}"/>`);
    pips(x + w / 2, y + 28, cur, max);
    T(x + w / 2, y + 66, `${cur}/${max}`, 24, glow || C.TEXT, { bold: true, anchor: 'middle' });
    if (label) T(x + w / 2, y + 90, label, 12.5, C.MUT, { anchor: 'middle' });
  }
  function harrow(x1, x2, yS, color, label, emojiName, label2) {
    const mid = (x1 + x2) / 2;
    svg.push(`<line x1="${x1 + 6}" y1="${yS}" x2="${x2 - 14}" y2="${yS}" stroke="${color}" stroke-width="3" marker-end="url(#arr_${color.slice(1)})"/>`);
    if (emojiName) E(emojiName, mid - 13, yS - 54, 26);
    if (label) T(mid, yS - 13, label, 14, color, { bold: true, anchor: 'middle' });
    if (label2) T(mid, yS + 24, label2, 12.5, C.MUT, { anchor: 'middle' });
  }
  function sectionCard(y, h, accent) {
    svg.push(`<rect x="${M}" y="${y}" width="${CW}" height="${h}" rx="16" ry="16" fill="${C.CARD}"/>`);
    if (accent) svg.push(`<rect x="${M}" y="${y}" width="6" height="${h}" rx="3" ry="3" fill="${accent}"/>`);
  }
  function ruleCards(y, rules) {
    const rw = (CW - 40) / 3;
    rules.forEach((r, i) => {
      const rx = M + i * (rw + 20);
      svg.push(`<rect x="${rx}" y="${y}" width="${rw}" height="96" rx="12" ry="12" fill="${C.CARD}" stroke="${C.SEP}"/>`);
      E(r[0], rx + 20, y + 18, 30);
      T(rx + 62, y + 32, r[1], 16, C.TEXT, { bold: true });
      T(rx + 20, y + 70, r[2], 12.3, C.SUB);
      if (r[3]) T(rx + 20, y + 86, r[3], 12.3, C.SUB);
    });
    return 96;
  }
  function tipsCard(y, tips) {
    const h = 62 + tips.length * 30;
    svg.push(`<rect x="${M}" y="${y}" width="${CW}" height="${h}" rx="16" ry="16" fill="${C.AMBER}12" stroke="${C.AMBER}" stroke-width="1.5"/>`);
    E('star', M + 24, y + 18, 28);
    T(M + 64, y + 38, 'Player tips', 19, C.TEXT, { bold: true });
    tips.forEach((t, i) => {
      const ty = y + 72 + i * 30;
      T(M + 30, ty, `${i + 1}.`, 14.5, C.AMBER, { bold: true });
      T(M + 56, ty, t[0], 14.5, i === 0 ? C.TEXT : C.SUB, { bold: i === 0 });
    });
    return h;
  }
  function itemsStrip(y) {
    const h = 118, half = (CW - 20) / 2;
    // consumable
    svg.push(`<rect x="${M}" y="${y}" width="${half}" height="${h}" rx="14" ry="14" fill="${C.CARD}" stroke="${C.GREEN}66"/>`);
    E('fish', M + 22, y + 18, 32);
    T(M + 66, y + 34, 'Consumable items (used up)', 16, C.TEXT, { bold: true });
    T(M + 24, y + 64, 'Instant stamina the moment you use one — even at full', 12.8, C.SUB);
    T(M + 24, y + 82, '(you can go OVER max: 3/3 &#8594; 4/3). Never touches your', 12.8, C.SUB);
    T(M + 24, y + 100, 'refill timer.', 12.8, C.SUB);
    // permanent
    const px = M + half + 20;
    svg.push(`<rect x="${px}" y="${y}" width="${half}" height="${h}" rx="14" ry="14" fill="${C.CARD}" stroke="${C.BLURPLE}66"/>`);
    E('horse', px + 22, y + 18, 32);
    T(px + 66, y + 34, 'Permanent items (kept)', 16, C.TEXT, { bold: true });
    T(px + 24, y + 64, 'A bigger tank: your MAX rises while you hold the item', 12.8, C.SUB);
    T(px + 24, y + 82, '(lose it and max drops back). The extra capacity refills', 12.8, C.SUB);
    T(px + 24, y + 100, 'through the normal cooldown — no special timers.', 12.8, C.SUB);
    return h;
  }
  async function render(height, outfile) {
    const fullSvg = `<svg width="${W}" height="${height}" xmlns="http://www.w3.org/2000/svg">${DEFS}${svg.join('\n')}</svg>`;
    const composites = [{ input: Buffer.from(fullSvg), top: 0, left: 0 }];
    for (const e of emo) {
      const buf = await sharp(path.join(EMOJI_DIR, `${EMOJI[e.n]}.png`)).resize(e.s, e.s).png().toBuffer();
      composites.push({ input: buf, top: Math.round(e.y), left: Math.round(e.x) });
    }
    await sharp({ create: { width: W, height, channels: 4, background: { r: 18, g: 18, b: 31, alpha: 1 } } })
      .composite(composites).png({ quality: 90 }).toFile(path.join(OUT_DIR, outfile));
    console.log('written', outfile, `${W}x${height}`);
  }
  return { svg, emo, E, T, NODE_W, NODE_H, pips, node, harrow, sectionCard, ruleCards, tipsCard, itemsStrip, render };
}

function header(cv, title, subtitle) {
  let y = 26;
  cv.E('bolt', M + 2, y, 46);
  cv.T(M + 62, y + 26, title, 34, C.TEXT, { bold: true });
  cv.T(M + 62, y + 54, subtitle, 16, C.SUB);
  y += 84;
  cv.svg.push(`<line x1="${M}" y1="${y}" x2="${W - M}" y2="${y}" stroke="${C.SEP}" stroke-width="1"/>`);
  return y + 22;
}
function footer(cv, y) {
  cv.T(M, y + 8, 'Refills are computed when you next open the map — a point is never lost, it may just appear when you look. Exact cooldown length and max are set by your host.', 12.3, C.MUT);
  cv.T(W - M, y + 8, 'CastBot', 12.3, C.MUT, { anchor: 'end' });
  return y + 32;
}

// =================================================================
// 1. PLAYER — DRIP
// =================================================================
async function buildPlayerDrip() {
  const cv = makeCanvas();
  let y = header(cv, 'How Stamina Works Here', 'Drip style &#183; your stamina comes back one piece at a time, on ONE personal timer');

  y += cv.ruleCards(y, [
    ['recycle', 'ONE timer, not one per point', 'You do NOT get each point back separately,', 'one cooldown after you spent it.'],
    ['hourglass', 'A piece back each cooldown', 'Every completed cooldown hands you a fixed', 'amount (your host sets the length).'],
    ['map', 'Moving restarts the timer', 'Every move resets the countdown', 'from that moment.']
  ]) + 22;

  // timeline: active play
  {
    const h = 252;
    cv.sectionCard(y, h);
    cv.T(M + PAD, y + 40, 'Jules plays the moment a point lands:', 17, C.TEXT, { bold: true });
    const t1y = y + 66, innerW = CW - PAD * 2, aw = (innerW - cv.NODE_W * 4) / 3;
    const xs = [0, 1, 2, 3].map(i => M + PAD + i * (cv.NODE_W + aw));
    const sh = t1y + cv.NODE_H / 2 + 12;
    cv.node(xs[0], t1y, 0, 3, 'out of stamina');
    cv.harrow(xs[0] + cv.NODE_W, xs[1], sh, C.BLUE, 'one cooldown', 'hourglass', '+1 lands');
    cv.node(xs[1], t1y, 1, 3, 'ready to move', C.GREEN);
    cv.harrow(xs[1] + cv.NODE_W, xs[2], sh, C.RED, 'Jules moves (&#8722;1)', 'map', 'timer restarts NOW');
    cv.node(xs[2], t1y, 0, 3, 'empty again');
    cv.harrow(xs[2] + cv.NODE_W, xs[3], sh, C.BLUE, 'one cooldown', 'hourglass', '+1 lands');
    cv.node(xs[3], t1y, 1, 3, 'repeat forever', C.GREEN);
    cv.T(M + PAD, t1y + cv.NODE_H + 44, 'Steady pace: one move per cooldown.', 14, C.SUB);
    y += h + 20;
  }
  // timeline: banking
  {
    const h = 252;
    cv.sectionCard(y, h);
    cv.T(M + PAD, y + 40, 'Jules saves up instead (no moves):', 17, C.TEXT, { bold: true });
    cv.E('sleep', M + PAD + 340, y + 18, 26);
    const t2y = y + 66, innerW = CW - PAD * 2, aw = (innerW - cv.NODE_W * 4) / 3;
    const xs = [0, 1, 2, 3].map(i => M + PAD + i * (cv.NODE_W + aw));
    const sh2 = t2y + cv.NODE_H / 2 + 12;
    cv.node(xs[0], t2y, 0, 3, 'empty');
    cv.harrow(xs[0] + cv.NODE_W, xs[1], sh2, C.BLUE, 'cooldown', 'hourglass');
    cv.node(xs[1], t2y, 1, 3, '');
    cv.harrow(xs[1] + cv.NODE_W, xs[2], sh2, C.BLUE, 'cooldown', 'hourglass');
    cv.node(xs[2], t2y, 2, 3, '');
    cv.harrow(xs[2] + cv.NODE_W, xs[3], sh2, C.BLUE, 'cooldown', 'hourglass');
    cv.node(xs[3], t2y, 3, 3, 'FULL at last', C.AMBER);
    cv.T(M + PAD, t2y + cv.NODE_H + 44, 'Filling the whole tank from empty takes one full cooldown PER point — and the timer stops while you are full.', 14, C.SUB);
    y += h + 20;
  }

  y += cv.tipsCard(y, [
    ['Make all your moves at once — every move restarts the countdown, so spreading moves out delays every refill after them.'],
    ['Move soon after a point lands — the timer never runs while you are at max, so sitting on stamina wastes regen time.'],
    ['Got a stamina snack? Spend your natural point first, then eat — food is instant and never touches the timer.']
  ]) + 20;

  y += cv.itemsStrip(y) + 18;
  y = footer(cv, y);
  await cv.render(y, 'player-stamina-drip.png');
}

// =================================================================
// 2. PLAYER — FULL RESET
// =================================================================
async function buildPlayerFullReset() {
  const cv = makeCanvas();
  let y = header(cv, 'How Stamina Works Here', 'Full refill &#183; everything comes back at once, one cooldown after your LAST move');

  y += cv.ruleCards(y, [
    ['recycle', 'One cooldown, full refill', 'You get EVERYTHING back in a single', 'moment — no partial trickle.'],
    ['hourglass', 'Clock starts at your LAST move', 'Each move restarts the countdown;', 'the refill lands one cooldown after it.'],
    ['bolt', 'Spend freely', 'Using 1 or all of them makes no', 'difference to the refill.']
  ]) + 22;

  // timeline: normal day
  {
    const h = 264;
    cv.sectionCard(y, h);
    cv.T(M + PAD, y + 40, 'A normal day for Jules:', 17, C.TEXT, { bold: true });
    const t1y = y + 72, nw = 180, innerW = CW - PAD * 2, aw = (innerW - nw * 3) / 2;
    const x0 = M + PAD, x1 = x0 + nw + aw, x2 = x1 + nw + aw;
    const sh = t1y + cv.NODE_H / 2 + 12;
    cv.node(x0, t1y, 3, 3, 'wakes up full', null, nw);
    cv.harrow(x0 + nw, x1, sh, C.RED, 'moves 3 times, back to back', 'compass', 'one burst');
    cv.node(x1, t1y, 0, 3, 'empty', null, nw);
    cv.harrow(x1 + nw, x2, sh, C.GREEN, 'ONE cooldown after the last move', 'recycle', 'everything returns together');
    cv.node(x2, t1y, 3, 3, 'FULL again', C.GREEN, nw);
    y += h + 20;
  }
  // burst vs spread lanes
  {
    const h = 240;
    cv.sectionCard(y, h);
    cv.T(M + PAD, y + 40, 'Why bursting beats spreading:', 17, C.TEXT, { bold: true });
    const laneX = M + PAD + 150, laneW = CW - PAD * 2 - 420;
    const lanes = [
      { name: 'Burst', col: C.GREEN, moves: [0, 0.05, 0.1], note: 'refill lands EARLY' },
      { name: 'Spread', col: C.ORANGE, moves: [0, 0.25, 0.5], note: 'refill lands LATE' }
    ];
    lanes.forEach((L, i) => {
      const ly = y + 92 + i * 62;
      cv.T(M + PAD, ly + 5, L.name, 15, L.col, { bold: true });
      cv.svg.push(`<line x1="${laneX}" y1="${ly}" x2="${laneX + laneW}" y2="${ly}" stroke="${C.SEP}" stroke-width="2"/>`);
      const lastX = laneX + L.moves[2] * laneW * 0.55;
      L.moves.forEach(m => {
        const mx = laneX + m * laneW * 0.55;
        cv.svg.push(`<circle cx="${mx}" cy="${ly}" r="7" fill="${C.RED}"/>`);
      });
      const refillX = lastX + laneW * 0.42;
      cv.svg.push(`<line x1="${lastX}" y1="${ly}" x2="${refillX}" y2="${ly}" stroke="${C.BLUE}" stroke-width="4"/>`);
      cv.svg.push(`<circle cx="${refillX}" cy="${ly}" r="8" fill="${C.GREEN}"/>`);
      cv.T((lastX + refillX) / 2, ly - 12, 'one cooldown from the LAST move', 12, C.BLUE, { anchor: 'middle' });
      cv.T(refillX + 18, ly + 5, `3/3 &#8592; ${L.note}`, 12.5, L.col, { bold: true });
    });
    cv.T(M + PAD, y + h - 22, 'Same three moves — but spreading them out pushes the whole refill later. Red dots = moves, green dot = full refill.', 13, C.SUB);
    y += h + 20;
  }

  y += cv.tipsCard(y, [
    ['Make all your moves at once — the refill clock starts at your LAST move, so every spread-out move pushes the whole refill later.'],
    ['Then wait for the refill and burst again — that is the fastest possible pace.'],
    ['Got a stamina snack? Spend your natural stamina first, then eat — food is instant and never touches the timer.']
  ]) + 20;

  y += cv.itemsStrip(y) + 18;
  y = footer(cv, y);
  await cv.render(y, 'player-stamina-fullreset.png');
}

// =================================================================
// 3. HOST — STAMINA OPTIONS
// =================================================================
async function buildHostOptions() {
  const cv = makeCanvas();
  let y = 26;
  cv.E('bolt', M + 2, y, 46);
  cv.T(M + 62, y + 26, 'CastBot Stamina &#8212; the Host&apos;s Guide to the Settings', 32, C.TEXT, { bold: true });
  cv.T(M + 62, y + 54, 'What each dial does, how the two regeneration styles feel, and how items interact', 16, C.SUB);
  y += 84;
  cv.svg.push(`<line x1="${M}" y1="${y}" x2="${W - M}" y2="${y}" stroke="${C.SEP}" stroke-width="1"/>`);
  y += 22;

  // settings strip — matches the new modal (5 fields)
  {
    const h = 190;
    cv.sectionCard(y, h, C.BLURPLE);
    cv.E('gear', M + 26, y + 20, 30);
    cv.T(M + 68, y + 42, 'The five dials (Stamina Settings)', 22, C.TEXT, { bold: true });
    cv.T(M + 68, y + 68, 'Starting + Max shape the tank. Regeneration Time sets the cooldown length. Regeneration Style is the mode switch.', 14, C.SUB);
    const cards = [
      ['Starting Stamina', 'what new players spawn with', C.SUB],
      ['Max Stamina', 'the tank size (before items)', C.SUB],
      ['Regeneration Time', 'length of one cooldown (minutes)', C.BLUE],
      ['Regeneration Style', 'Full refill  |  Drip', C.ORANGE],
      ['Drip Amount', 'points per cooldown (Drip only)', C.ORANGE]
    ];
    const cw = (CW - PAD * 2 - 4 * 14) / 5, cy = y + 92, ch = 74;
    cards.forEach((c, i) => {
      const cx = M + PAD + i * (cw + 14);
      cv.svg.push(`<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="10" ry="10" fill="${C.INSET}" stroke="${c[2] === C.ORANGE ? C.ORANGE : C.SEP}" stroke-width="${c[2] === C.ORANGE ? 2 : 1}"/>`);
      cv.T(cx + 14, cy + 24, c[0], 13.2, c[2], { bold: true });
      cv.T(cx + 14, cy + 48, c[1], 11.6, C.SUB);
    });
    y += h + 22;
  }

  // FULL RESET mode
  {
    const h = 300;
    cv.sectionCard(y, h, C.GREEN);
    cv.E('recycle', M + 26, y + 20, 30);
    cv.T(M + 68, y + 42, 'Full refill (recommended default)', 22, C.TEXT, { bold: true });
    cv.T(M + 68, y + 68, 'One cooldown after the player&apos;s LAST move, the whole tank snaps back to max in a single hit.', 14, C.SUB);
    const t1y = y + 96, nw = 170, innerW = CW - PAD * 2, aw = (innerW - nw * 3) / 2;
    const x0 = M + PAD, x1 = x0 + nw + aw, x2 = x1 + nw + aw;
    const sh = t1y + cv.NODE_H / 2 + 12;
    cv.node(x0, t1y, 3, 3, 'full', null, nw);
    cv.harrow(x0 + nw, x1, sh, C.RED, 'spends 3 moves, any pace', 'compass');
    cv.node(x1, t1y, 0, 3, 'empty', null, nw);
    cv.harrow(x1 + nw, x2, sh, C.GREEN, 'ONE cooldown after the last move', 'recycle');
    cv.node(x2, t1y, 3, 3, 'FULL again', C.GREEN, nw);
    cv.T(M + PAD, t1y + cv.NODE_H + 46, 'Easy to explain, hard to misread: &quot;you get everything back one cooldown after your last move.&quot; Leave Drip Amount blank.', 13.5, C.SUB);
    y += h + 22;
  }

  // DRIP mode
  {
    const h = 322;
    cv.sectionCard(y, h, C.BLUE);
    cv.E('hourglass', M + 26, y + 20, 30);
    cv.T(M + 68, y + 42, 'Drip (Regeneration Style: Drip + Drip Amount)', 22, C.TEXT, { bold: true });
    cv.T(M + 68, y + 68, 'ONE timer per player: +Amount lands each cooldown, and every move restarts the countdown.', 14, C.SUB);
    const t2y = y + 96, innerW = CW - PAD * 2, aw = (innerW - cv.NODE_W * 4) / 3;
    const xs = [0, 1, 2, 3].map(i => M + PAD + i * (cv.NODE_W + aw));
    const sh2 = t2y + cv.NODE_H / 2 + 12;
    cv.node(xs[0], t2y, 0, 3, 'empty');
    cv.harrow(xs[0] + cv.NODE_W, xs[1], sh2, C.BLUE, 'cooldown', 'hourglass', '+1');
    cv.node(xs[1], t2y, 1, 3, '');
    cv.harrow(xs[1] + cv.NODE_W, xs[2], sh2, C.BLUE, 'cooldown', 'hourglass', '+1');
    cv.node(xs[2], t2y, 2, 3, '');
    cv.harrow(xs[2] + cv.NODE_W, xs[3], sh2, C.BLUE, 'cooldown', 'hourglass', '+1');
    cv.node(xs[3], t2y, 3, 3, 'full — 3 cooldowns', C.AMBER);
    const wy = t2y + cv.NODE_H + 26;
    cv.svg.push(`<rect x="${M + PAD}" y="${wy}" width="${innerW}" height="${58}" rx="10" ry="10" fill="${C.ORANGE}18" stroke="${C.ORANGE}" stroke-width="1.5"/>`);
    cv.E('warn', M + PAD + 16, wy + 15, 26);
    cv.T(M + PAD + 56, wy + 25, 'Players usually assume each point refills on its OWN timer. It does not — tell them up front it is one shared timer,', 13.5, C.TEXT, { bold: true });
    cv.T(M + PAD + 56, wy + 45, 'or expect &quot;stamina is broken&quot; reports. Empty to full takes one cooldown per missing point.', 13.5, C.TEXT);
    y += h + 22;
  }

  // tuning table + items row
  {
    const h = 240;
    const half = (CW - 20) * 0.44, ix = M, tx = M + half + 20, tw = CW - half - 20;
    // tuning table (left)
    cv.svg.push(`<rect x="${ix}" y="${y}" width="${half}" height="${h}" rx="14" ry="14" fill="${C.CARD}"/>`);
    cv.E('dial', ix + 24, y + 20, 28);
    cv.T(ix + 62, y + 40, 'Pace cheat-sheet (Max 3)', 18, C.TEXT, { bold: true });
    const rows = [
      ['Full refill', 'any', '1 cooldown', C.GREEN],
      ['Drip', '+1', '3 cooldowns', C.ORANGE],
      ['Drip', '+2', '2 cooldowns', C.SUB],
      ['Drip', '+3', '1 cooldown', C.SUB]
    ];
    const col = [ix + 28, ix + 220, ix + 360];
    cv.T(col[0], y + 74, 'Style', 12, C.MUT, { bold: true });
    cv.T(col[1], y + 74, 'Amount', 12, C.MUT, { bold: true });
    cv.T(col[2], y + 74, 'Empty &#8594; full', 12, C.MUT, { bold: true });
    cv.svg.push(`<line x1="${ix + 24}" y1="${y + 84}" x2="${ix + half - 24}" y2="${y + 84}" stroke="${C.SEP}"/>`);
    rows.forEach((r, i) => {
      const ry = y + 110 + i * 28;
      cv.T(col[0], ry, r[0], 13.8, r[3], { bold: r[3] !== C.SUB });
      cv.T(col[1], ry, r[1], 13.8, r[3]);
      cv.T(col[2], ry, r[2], 13.8, r[3], { bold: true });
    });
    cv.T(ix + 28, y + h - 18, 'Shorten Regeneration Time for a faster game.', 12.5, C.MUT);
    // items (right)
    cv.svg.push(`<rect x="${tx}" y="${y}" width="${tw}" height="${h}" rx="14" ry="14" fill="${C.CARD}"/>`);
    cv.E('fish', tx + 24, y + 20, 28);
    cv.T(tx + 62, y + 40, 'Items &#215; stamina', 18, C.TEXT, { bold: true });
    cv.T(tx + 28, y + 74, 'Consumable: Yes + Stamina Boost &#8212; instant points on use, can exceed max', 13.2, C.TEXT, { bold: true });
    cv.T(tx + 28, y + 94, '(3/3 &#8594; 4/3), never touches the cooldown. Over-max stamina does not regenerate', 13, C.SUB);
    cv.T(tx + 28, y + 112, 'until the player spends back below max.', 13, C.SUB);
    cv.svg.push(`<line x1="${tx + 24}" y1="${y + 128}" x2="${tx + tw - 24}" y2="${y + 128}" stroke="${C.SEP}"/>`);
    cv.E('horse', tx + 24, y + 142, 28);
    cv.T(tx + 62, y + 162, 'Consumable: No + Stamina Boost &#8212; a BIGGER TANK', 13.2, C.TEXT, { bold: true });
    cv.T(tx + 28, y + 184, 'Max rises by the boost while the item is held (Horse +1: max 3 &#8594; 4); stacks across', 13, C.SUB);
    cv.T(tx + 28, y + 202, 'items; removed &#8594; max drops back. Refills under your normal style — no extra timers.', 13, C.SUB);
    y += h + 20;
  }

  cv.T(M, y + 8, 'CastBot &#183; Safari stamina engine &#183; regen is lazy: points land when the player next opens the map', 12.3, C.MUT);
  cv.T(W - M, y + 8, 'CastBot', 12.3, C.MUT, { anchor: 'end' });
  y += 32;
  await cv.render(y, 'host-stamina-options.png');
}

// =================================================================
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await ensureEmoji();
  await buildPlayerDrip();
  await buildPlayerFullReset();
  await buildHostOptions();
}
main().catch(e => { console.error(e); process.exit(1); });
