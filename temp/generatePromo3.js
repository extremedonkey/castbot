import sharp from 'sharp';
import { writeFile } from 'fs/promises';

const W = 1200;
const H = 900;

// Colors
const BG_DARK = '#0d1117';
const BG_CARD = '#161b22';
const PURPLE = '#8b5cf6';
const BLUE = '#3b82f6';
const GREEN = '#10b981';
const ORANGE = '#f59e0b';
const RED = '#ef4444';
const PINK = '#ec4899';
const CYAN = '#06b6d4';
const WHITE = '#f0f0f0';
const GRAY = '#8b949e';
const DIM = '#484f58';
const YELLOW = '#eab308';

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const features = [
  { icon: '⚡', title: 'Quick Create Actions', desc: 'Create currency or item actions\nin a single 5-field modal', color: PURPLE, tag: 'NEW' },
  { icon: '🖼️', title: 'Location Info Merge', desc: 'Media merged into Location Info\nfewer buttons, cleaner layout', color: GREEN, tag: 'IMPROVED' },
  { icon: '🎒', title: 'Inventory Bug Fix', desc: 'Fixed dual-format item conditions\nlegacy number vs object format', color: CYAN, tag: 'FIXED' },
  { icon: '🏷️', title: 'Label Components', desc: 'Map cell modals upgraded to\nmodern Labels with descriptions', color: BLUE, tag: 'IMPROVED' },
  { icon: '🗑️', title: 'Drop Retirement', desc: 'Drops button removed from UI\nQuick Create is the replacement', color: ORANGE, tag: 'REMOVED' },
  { icon: '🧪', title: 'Test Coverage', desc: '37 new unit tests added\nacross 2 new test files', color: PINK, tag: 'NEW' },
];

const stats = { commits: 16, insertions: 1988, deletions: 118, files: 14 };

function buildSvg() {
  const cardW = 340;
  const cardH = 130;
  const cardGap = 24;
  const cols = 3;
  const startX = (W - (cols * cardW + (cols - 1) * cardGap)) / 2;
  const startY = 260;

  let cards = '';
  features.forEach((f, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cardW + cardGap);
    const y = startY + row * (cardH + cardGap);

    const tagColor = f.tag === 'NEW' ? GREEN : f.tag === 'IMPROVED' ? BLUE : f.tag === 'REMOVED' ? ORANGE : f.tag === 'FIXED' ? CYAN : PINK;

    cards += `
      <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="12" fill="${BG_CARD}" />
      <rect x="${x}" y="${y}" width="4" height="${cardH}" rx="2" fill="${f.color}" />

      <!-- Tag -->
      <rect x="${x + cardW - 90}" y="${y + 10}" width="78" height="20" rx="10" fill="${tagColor}" opacity="0.2" />
      <text x="${x + cardW - 51}" y="${y + 24}" font-family="Arial,sans-serif" font-size="10" font-weight="bold" fill="${tagColor}" text-anchor="middle">${f.tag}</text>

      <!-- Title -->
      <text x="${x + 18}" y="${y + 32}" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="${WHITE}">${esc(f.title)}</text>

      <!-- Description lines -->
      <text x="${x + 18}" y="${y + 58}" font-family="Arial,sans-serif" font-size="12" fill="${GRAY}">${esc(f.desc.split('\n')[0])}</text>
      <text x="${x + 18}" y="${y + 76}" font-family="Arial,sans-serif" font-size="12" fill="${GRAY}">${esc(f.desc.split('\n')[1] || '')}</text>

      <!-- Accent line at bottom -->
      <rect x="${x + 16}" y="${y + cardH - 16}" width="${cardW - 32}" height="2" rx="1" fill="${f.color}" opacity="0.15" />
    `;
  });

  // Stats bar
  const statsY = startY + 2 * (cardH + cardGap) + 30;
  const statItems = [
    { label: 'COMMITS', value: stats.commits, color: PURPLE },
    { label: 'INSERTIONS', value: `+${stats.insertions}`, color: GREEN },
    { label: 'DELETIONS', value: `-${stats.deletions}`, color: RED },
    { label: 'FILES CHANGED', value: stats.files, color: BLUE },
  ];

  const statW = 160;
  const statGap = 30;
  const statsStartX = (W - (statItems.length * statW + (statItems.length - 1) * statGap)) / 2;

  let statsBar = '';
  statItems.forEach((s, i) => {
    const sx = statsStartX + i * (statW + statGap);
    statsBar += `
      <rect x="${sx}" y="${statsY}" width="${statW}" height="64" rx="10" fill="${BG_CARD}" />
      <text x="${sx + statW/2}" y="${statsY + 28}" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="${s.color}" text-anchor="middle">${s.value}</text>
      <text x="${sx + statW/2}" y="${statsY + 48}" font-family="Arial,sans-serif" font-size="10" font-weight="600" fill="${DIM}" text-anchor="middle" letter-spacing="1.5">${s.label}</text>
    `;
  });

  const decoCircles = `
    <circle cx="80" cy="120" r="200" fill="${PURPLE}" opacity="0.03" />
    <circle cx="${W - 80}" cy="${H - 100}" r="250" fill="${BLUE}" opacity="0.03" />
    <circle cx="${W/2}" cy="50" r="300" fill="${PINK}" opacity="0.02" />
  `;

  let gridLines = '';
  for (let gx = 0; gx < W; gx += 60) {
    gridLines += `<line x1="${gx}" y1="0" x2="${gx}" y2="${H}" stroke="${DIM}" stroke-width="0.3" opacity="0.1" />`;
  }
  for (let gy = 0; gy < H; gy += 60) {
    gridLines += `<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="${DIM}" stroke-width="0.3" opacity="0.1" />`;
  }

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="headerGlow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${PURPLE}" stop-opacity="0" />
        <stop offset="50%" stop-color="${PURPLE}" stop-opacity="0.15" />
        <stop offset="100%" stop-color="${BLUE}" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${PURPLE}" />
        <stop offset="100%" stop-color="${PINK}" />
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="${W}" height="${H}" fill="${BG_DARK}" />
    ${gridLines}
    ${decoCircles}

    <!-- Header glow -->
    <rect x="0" y="0" width="${W}" height="220" fill="url(#headerGlow)" />

    <!-- Top accent line -->
    <rect x="${W/2 - 200}" y="0" width="400" height="3" rx="1.5" fill="url(#titleGrad)" />

    <!-- Version badge -->
    <rect x="${W/2 - 55}" y="30" width="110" height="28" rx="14" fill="${PURPLE}" opacity="0.15" />
    <text x="${W/2}" y="49" font-family="Arial,sans-serif" font-size="12" font-weight="bold" fill="${PURPLE}" text-anchor="middle">MARCH 2026</text>

    <!-- Title -->
    <text x="${W/2}" y="105" font-family="Arial,sans-serif" font-size="42" font-weight="bold" fill="url(#titleGrad)" text-anchor="middle">CastBot Update</text>

    <!-- Subtitle -->
    <text x="${W/2}" y="140" font-family="Arial,sans-serif" font-size="16" fill="${GRAY}" text-anchor="middle">Quick Create Actions, Location Info Merge, Inventory Fix &amp; More</text>

    <!-- Divider -->
    <rect x="${W/2 - 100}" y="165" width="200" height="1" fill="${DIM}" opacity="0.4" />

    <!-- Section label -->
    <text x="${W/2}" y="200" font-family="Arial,sans-serif" font-size="11" font-weight="600" fill="${DIM}" text-anchor="middle" letter-spacing="3">WHAT'S NEW</text>

    <!-- Feature cards -->
    ${cards}

    <!-- Stats bar -->
    ${statsBar}

    <!-- Footer -->
    <rect x="${W/2 - 150}" y="${H - 36}" width="300" height="1" fill="${DIM}" opacity="0.2" />
    <text x="${W/2}" y="${H - 14}" font-family="Arial,sans-serif" font-size="11" fill="${DIM}" text-anchor="middle">Built with Sharp + Discord Components V2</text>
  </svg>`;
}

async function generate() {
  const svg = buildSvg();
  const png = await sharp(Buffer.from(svg))
    .png({ quality: 95 })
    .toBuffer();

  const outPath = '/home/reece/castbot/temp/castbot-update-mar2026-v3.png';
  await writeFile(outPath, png);
  console.log(`✅ Generated ${(png.length / 1024).toFixed(1)}KB → ${outPath}`);
}

generate().catch(console.error);
