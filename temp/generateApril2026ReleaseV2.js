import sharp from 'sharp';
import fs from 'fs';

const W = 1200, H = 900;
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

const cards = [
  { title: 'Quick Crafting',      badge: 'NEW',      desc: 'One-modal shortcut: two input items\nplus an output = full recipe Action',         color: '#3498db' },
  { title: 'Custom Crafting Name', badge: 'NEW',      desc: 'Rename Crafting per server:\nGardening, Alchemy, Forge, you pick',                color: '#1abc9c' },
  { title: 'Settings Overhaul',   badge: 'NEW',      desc: 'New CastBot-Wide section,\nsplit Rounds/Location, expanded Reset',                 color: '#9b59b6' },
  { title: 'Crafting Menu Polish', badge: 'IMPROVED', desc: '10+ actions warning now uses\nyour custom crafting name',                          color: '#e67e22' },
  { title: 'Custom Emoji Reactions', badge: 'FIXED', desc: 'Reaction roles now work with custom\nDiscord emojis, not just unicode',            color: '#e91e63' },
  { title: 'Emoji-Broken Menus',  badge: 'FIXED',    desc: 'Attribute, prefix, player-card menus\nno longer fail silently on custom emojis',   color: '#e74c3c' },
];

const stats = [
  { value: '10',    label: 'COMMITS',       color: '#3498db' },
  { value: '+1447', label: 'INSERTIONS',    color: '#2ecc71' },
  { value: '-572',  label: 'DELETIONS',     color: '#e74c3c' },
  { value: '23',    label: 'FILES CHANGED', color: '#e91e63' },
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
      <stop offset="0%" style="stop-color:#9b59b6"/>
      <stop offset="50%" style="stop-color:#e74c3c"/>
      <stop offset="100%" style="stop-color:#e91e63"/>
    </linearGradient>
  </defs>`;

  const topBar = `<rect x="0" y="0" width="${W}" height="4" fill="url(#hbar)"/>`;
  const dateBadge = `
    <rect x="${W/2 - 55}" y="40" width="110" height="28" rx="14" fill="none" stroke="#9b59b6" stroke-width="1.5"/>
    <text x="${W/2}" y="59" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="#9b59b6" letter-spacing="2">APRIL 2026</text>
  `;
  const title = `<text x="${W/2}" y="112" text-anchor="middle" font-family="Georgia, serif" font-size="48" font-weight="bold" fill="url(#titleGrad)">CastBot Update</text>`;
  const subtitle = `<text x="${W/2}" y="145" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${TEXT_SEC}">Quick Crafting, Custom Settings &amp; Emoji Reliability</text>`;
  const divider = `<line x1="${W/2 - 60}" y1="165" x2="${W/2 + 60}" y2="165" stroke="#3498db" stroke-width="2" opacity="0.5"/>`;
  const whatsNew = `<text x="${W/2}" y="195" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${TEXT_MUT}" letter-spacing="4">WHAT'S NEW</text>`;

  const cardW = 340, cardH = 120, cardGap = 26;
  const startX = (W - (3 * cardW + 2 * cardGap)) / 2;
  const row1Y = 225, row2Y = 370;

  let cardsSvg = '';
  cards.forEach((card, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = startX + col * (cardW + cardGap);
    const y = row === 0 ? row1Y : row2Y;
    const b = BADGE[card.badge];

    cardsSvg += `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="10" fill="${CARD_BG}"/>`;
    cardsSvg += `<rect x="${x}" y="${y + 8}" width="4" height="${cardH - 16}" rx="2" fill="${card.color}"/>`;
    cardsSvg += `<rect x="${x + 16}" y="${y + cardH - 12}" width="${cardW - 32}" height="2" rx="1" fill="${card.color}" opacity="0.4"/>`;
    cardsSvg += `<text x="${x + 18}" y="${y + 32}" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="bold" fill="${TEXT_PRI}">${card.title}</text>`;
    const badgeW = card.badge.length * 9 + 16;
    const badgeX = x + cardW - badgeW - 14;
    cardsSvg += `<rect x="${badgeX}" y="${y + 16}" width="${badgeW}" height="22" rx="11" fill="${b.bg}"/>`;
    cardsSvg += `<text x="${badgeX + badgeW/2}" y="${y + 31}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" fill="${b.text}">${card.badge}</text>`;
    const descLines = card.desc.split('\n');
    descLines.forEach((line, li) => {
      cardsSvg += `<text x="${x + 18}" y="${y + 58 + li * 18}" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_SEC}">${line}</text>`;
    });
  });

  const statW = 180, statH = 60, statGap = 20;
  const statStartX = (W - (4 * statW + 3 * statGap)) / 2;
  const statY = 530;

  let statsSvg = '';
  stats.forEach((stat, i) => {
    const x = statStartX + i * (statW + statGap);
    statsSvg += `<rect x="${x}" y="${statY}" width="${statW}" height="${statH}" rx="12" fill="${CARD_BG}" stroke="${stat.color}" stroke-width="1" opacity="0.8"/>`;
    statsSvg += `<text x="${x + statW/2}" y="${statY + 26}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="${stat.color}">${stat.value}</text>`;
    statsSvg += `<text x="${x + statW/2}" y="${statY + 46}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${TEXT_MUT}" letter-spacing="2">${stat.label}</text>`;
  });

  const footer = `
    <line x1="${W/2 - 100}" y1="${H - 45}" x2="${W/2 + 100}" y2="${H - 45}" stroke="#3498db" stroke-width="1" opacity="0.3"/>
    <text x="${W/2}" y="${H - 22}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${TEXT_MUT}">Built with Sharp + Discord Components V2</text>
  `;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${defs}
    ${topBar}
    ${dateBadge}
    ${title}
    ${subtitle}
    ${divider}
    ${whatsNew}
    ${cardsSvg}
    ${statsSvg}
    ${footer}
  </svg>`;
}

async function generate() {
  const svg = buildSvg();
  const svgBuffer = Buffer.from(svg);

  const canvas = sharp({
    create: { width: W, height: H, channels: 4, background: BG }
  });

  const result = await canvas
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png({ quality: 90 })
    .toBuffer();

  const outPath = '/home/reece/castbot/temp/castbot-update-apr2026-v2.png';
  fs.writeFileSync(outPath, result);
  console.log(`Written ${result.length} bytes to ${outPath}`);
}

generate().catch(console.error);
