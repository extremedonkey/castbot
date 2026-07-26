import sharp from 'sharp';
import fs from 'fs';

// Prod Deploy Report — 22-26 July 2026
// 52 commits shipped to production across 8 deploys (reflog-verified).
// Batches: Jul 25 ×7 (47 commits), Jul 26 22:46 ×1 (5 commits, restart verified).

const W = 1200, H = 1210;
const BG = '#1a1a2e';
const CARD_BG = '#2a2a3e';
const TEXT_PRI = '#e8e8e8';
const TEXT_SEC = '#a0a0b0';
const TEXT_MUT = '#6a6a7a';

const BADGE = {
  NEW: { bg: '#2ecc71', text: '#ffffff' },
  IMPROVED: { bg: '#f1c40f', text: '#1a1a2e' },
  FIXED: { bg: '#e74c3c', text: '#ffffff' },
};

// The 8 deploy pulls from prod's reflog (times local +08), commit counts via rev-list
const deploys = [
  { time: '09:47', day: 25, count: 20 },
  { time: '10:05', day: 25, count: 1 },
  { time: '10:17', day: 25, count: 1 },
  { time: '10:35', day: 25, count: 1 },
  { time: '11:03', day: 25, count: 1 },
  { time: '18:48', day: 25, count: 13 },
  { time: '20:32', day: 25, count: 10 },
  { time: '22:46', day: 26, count: 5 },
];

const cards = [
  {
    title: 'CastDock', badge: 'NEW', color: '#3498db',
    desc: [
      'Pin a player\'s /menu publicly to a channel as a sticky,',
      'event-driven message. Compact view with expand toggle,',
      'configurable buttons, one-time privacy notice, and hardening:',
      'a live dock can no longer be silently retargeted or orphaned.'
    ]
  },
  {
    title: 'Marooning Overhaul', badge: 'IMPROVED', color: '#1abc9c',
    desc: [
      'Roster now splits Cast/Alternate into Accepted, Offer Sent',
      'and Draft, with pronouns/age/timezone on every row and a',
      'Rejects toggle. Cast header shows (N/Est), and the tribe-',
      'eligibility check no longer silently drops legacy tribes.'
    ]
  },
  {
    title: 'Casting Reliability', badge: 'FIXED', color: '#e74c3c',
    desc: [
      'Changed decisions no longer keep stale offer/acceptance',
      'status, every casting write now runs under the storage lock,',
      'ghost tribes stay deleted, and a mis-named fetch timeout',
      'option (silently ignored for months) is finally enforced.'
    ]
  },
  {
    title: 'Location Manager + Quick Create', badge: 'IMPROVED', color: '#9b59b6',
    desc: [
      'One unified Location Manager for admins and players with a',
      'fail-closed admin gate, a per-location Blacklist + Reverse',
      'Blacklist modal, live store counts on buttons, Quick ItemText',
      'actions, and a full pass of UI polish across the screen.'
    ]
  },
  {
    title: 'Category Post', badge: 'NEW', color: '#f39c12',
    desc: [
      'Compose a saved rich card and post it to chosen channels or',
      'whole categories: blast-radius confirm screen, paced streamed',
      'sends with live progress, upload-only imagery. Replaces the',
      'old Rich Card demo from Reece\'s Stuff.'
    ]
  },
  {
    title: 'Safari Import Grid Fidelity', badge: 'FIXED', color: '#e67e22',
    desc: [
      'A 7x4 map no longer imports as 2x2: exports now carry true',
      'grid dimensions (stale legacy gridSize burned one live',
      'import), and the importer sizes auto-created maps from the',
      'package manifest plus coordinate bounds - old exports rescued.'
    ]
  },
  {
    title: 'Scavenger-Mode Stamina', badge: 'NEW', color: '#e91e63',
    desc: [
      'Safaris can now run with max-0 stamina (no natural regen),',
      'start-above-max pools and a give_stamina action outcome with',
      'usage limits. New-server defaults aligned to 1/1 stamina',
      'with a 12-hour regen cycle across every config layer.'
    ]
  },
  {
    title: 'Image Uploads by Default', badge: 'IMPROVED', color: '#2ecc71',
    desc: [
      'Native file-upload is now the default image mode for new and',
      'never-configured servers - no more pasting CDN links. Servers',
      'that explicitly chose Paste URL keep it. Uploads are re-hosted',
      'in #castbot-images with the same stored URL shape as before.'
    ]
  },
];

const underHood = [
  'Prod deploy notes post as CastBot Test',
  'win-restart test summary fixed on Windows',
  'app.js ratchet lowered to 52,249',
  'Arrival-panel 3-way navigate behavior',
];

const stats = [
  { value: '52', label: 'COMMITS', color: '#3498db' },
  { value: '8', label: 'DEPLOYS', color: '#9b59b6' },
  { value: '+6,591', label: 'INSERTIONS', color: '#2ecc71' },
  { value: '-1,418', label: 'DELETIONS', color: '#e74c3c' },
  { value: '2,447', label: 'TESTS PASSING', color: '#f1c40f' },
];

function buildSvg() {
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

  const topBar = `<rect x="0" y="0" width="${W}" height="4" fill="url(#hbar)"/>`;
  const dateBadge = `
    <rect x="${W / 2 - 78}" y="40" width="156" height="28" rx="14" fill="none" stroke="#3498db" stroke-width="1.5"/>
    <text x="${W / 2}" y="59" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="#3498db" letter-spacing="2">JUL 22 - 26 · 2026</text>
  `;
  const title = `<text x="${W / 2}" y="112" text-anchor="middle" font-family="Georgia, serif" font-size="48" font-weight="bold" fill="url(#titleGrad)">Prod Deploy Report</text>`;
  const subtitle = `<text x="${W / 2}" y="145" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${TEXT_SEC}">52 commits shipped to production across 8 deploys - CastDock, Marooning &amp; Safari fidelity</text>`;

  // ── Deploy timeline strip ──
  const tlLabelY = 192;
  const tlY = 246;                 // timeline axis y
  const tlStartX = 120, tlEndX = W - 120;
  let tlSvg = `<text x="${W / 2}" y="${tlLabelY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${TEXT_MUT}" letter-spacing="4">DEPLOY TIMELINE</text>`;
  tlSvg += `<line x1="${tlStartX - 30}" y1="${tlY}" x2="${tlEndX + 30}" y2="${tlY}" stroke="#2a2a4a" stroke-width="2"/>`;

  const n = deploys.length;
  const step = (tlEndX - tlStartX) / (n - 1);
  deploys.forEach((d, i) => {
    const x = tlStartX + i * step;
    const r = 6 + Math.round(Math.sqrt(d.count) * 3.2);   // 20 commits → ~20px, 1 commit → ~9px
    const color = d.day === 26 ? '#2ecc71' : '#3498db';
    tlSvg += `<circle cx="${x}" cy="${tlY}" r="${r}" fill="${color}" opacity="0.22"/>`;
    tlSvg += `<circle cx="${x}" cy="${tlY}" r="${Math.max(4, r - 5)}" fill="${color}"/>`;
    tlSvg += `<text x="${x}" y="${tlY - r - 10}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${TEXT_SEC}">${d.time}</text>`;
    tlSvg += `<text x="${x}" y="${tlY + r + 18}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="${color}">${d.count}</text>`;
    tlSvg += `<text x="${x}" y="${tlY + r + 32}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="9" fill="${TEXT_MUT}">commit${d.count === 1 ? '' : 's'}</text>`;
  });
  // Day group labels under the strip
  const day25CenterX = tlStartX + 3 * step;
  const day26X = tlStartX + 7 * step;
  const dayY = tlY + 66;
  tlSvg += `<line x1="${tlStartX - 10}" y1="${dayY - 12}" x2="${tlStartX + 6 * step + 10}" y2="${dayY - 12}" stroke="#3498db" stroke-width="1" opacity="0.35"/>`;
  tlSvg += `<text x="${day25CenterX}" y="${dayY + 4}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#3498db" letter-spacing="1">FRI 25 JUL - 47 COMMITS</text>`;
  tlSvg += `<line x1="${day26X - 40}" y1="${dayY - 12}" x2="${day26X + 40}" y2="${dayY - 12}" stroke="#2ecc71" stroke-width="1" opacity="0.35"/>`;
  tlSvg += `<text x="${day26X}" y="${dayY + 4}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="#2ecc71" letter-spacing="1">SAT 26 - TONIGHT</text>`;

  const whatsNewY = tlY + 106;
  const whatsNew = `<text x="${W / 2}" y="${whatsNewY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${TEXT_MUT}" letter-spacing="4">WHAT SHIPPED</text>`;

  // ── 2 columns x 4 rows of cards ──
  const cardW = 566, cardH = 138, cardGapX = 24, cardGapY = 22;
  const startX = (W - (2 * cardW + cardGapX)) / 2;
  const startY = whatsNewY + 20;

  let cardsSvg = '';
  cards.forEach((card, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (cardW + cardGapX);
    const y = startY + row * (cardH + cardGapY);
    const b = BADGE[card.badge];

    cardsSvg += `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="10" fill="${CARD_BG}"/>`;
    cardsSvg += `<rect x="${x}" y="${y + 8}" width="4" height="${cardH - 16}" rx="2" fill="${card.color}"/>`;
    cardsSvg += `<rect x="${x + 16}" y="${y + cardH - 10}" width="${cardW - 32}" height="2" rx="1" fill="${card.color}" opacity="0.4"/>`;
    cardsSvg += `<text x="${x + 20}" y="${y + 32}" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="bold" fill="${TEXT_PRI}">${card.title}</text>`;
    const badgeW = card.badge.length * 9 + 16;
    const badgeX = x + cardW - badgeW - 14;
    cardsSvg += `<rect x="${badgeX}" y="${y + 16}" width="${badgeW}" height="22" rx="11" fill="${b.bg}"/>`;
    cardsSvg += `<text x="${badgeX + badgeW / 2}" y="${y + 31}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" fill="${b.text}">${card.badge}</text>`;
    card.desc.forEach((line, li) => {
      cardsSvg += `<text x="${x + 20}" y="${y + 58 + li * 19}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_SEC}">${line}</text>`;
    });
  });

  // ── Under-the-hood strip ──
  const uhY = startY + 4 * cardH + 3 * cardGapY + 30;
  let underSvg = `<text x="${W / 2}" y="${uhY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${TEXT_MUT}" letter-spacing="4">UNDER THE HOOD</text>`;
  const uhLine = underHood.join('   •   ');
  underSvg += `<text x="${W / 2}" y="${uhY + 24}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_SEC}">${uhLine}</text>`;

  // ── Stats row ──
  const statW = 200, statH = 60, statGap = 18;
  const statStartX = (W - (5 * statW + 4 * statGap)) / 2;
  const statY = uhY + 52;

  let statsSvg = '';
  stats.forEach((stat, i) => {
    const x = statStartX + i * (statW + statGap);
    statsSvg += `<rect x="${x}" y="${statY}" width="${statW}" height="${statH}" rx="12" fill="${CARD_BG}" stroke="${stat.color}" stroke-width="1" opacity="0.8"/>`;
    statsSvg += `<text x="${x + statW / 2}" y="${statY + 26}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="${stat.color}">${stat.value}</text>`;
    statsSvg += `<text x="${x + statW / 2}" y="${statY + 46}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${TEXT_MUT}" letter-spacing="2">${stat.label}</text>`;
  });

  const footer = `
    <line x1="${W / 2 - 100}" y1="${H - 42}" x2="${W / 2 + 100}" y2="${H - 42}" stroke="#3498db" stroke-width="1" opacity="0.3"/>
    <text x="${W / 2}" y="${H - 20}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${TEXT_MUT}">All 52 commits live on prod as of 26 Jul 2026, 22:46 AWST (final batch landed tonight, restart verified) - reflog-sourced</text>
  `;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${defs}
    ${topBar}
    ${dateBadge}
    ${title}
    ${subtitle}
    ${tlSvg}
    ${whatsNew}
    ${cardsSvg}
    ${underSvg}
    ${statsSvg}
    ${footer}
  </svg>`;
}

async function generate() {
  const svg = buildSvg();
  const result = await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png({ quality: 90 })
    .toBuffer();

  const outPath = 'temp/castbot-prod-deploys-jul22-26.png';
  fs.writeFileSync(outPath, result);
  console.log(`Written ${result.length} bytes to ${outPath}`);
}

generate().catch(console.error);
