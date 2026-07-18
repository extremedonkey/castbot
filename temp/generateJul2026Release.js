import sharp from 'sharp';
import fs from 'fs';

const W = 1200, H = 1060;
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

// July 2026 — the 24-commit stability + Safari release (prod 87eb08e3 → 352d5326)
const cards = [
  {
    title: 'Map Creation Rework', badge: 'FIXED', color: '#e74c3c',
    desc: [
      'Fog-of-war generation rebuilt from scratch after two prod',
      'crashes: ~50x fewer image operations, pixel-identical output,',
      'one-build-at-a-time gate and a low-memory warning with an',
      'explicit Proceed Anyway. Verified live: 266MB peak vs 330MB kill.'
    ]
  },
  {
    title: 'Safari Import / Export v3', badge: 'NEW', color: '#3498db',
    desc: [
      'Export stores, items, actions, settings, map data and the map',
      'image itself as one portable ZIP. Import shows a full preview,',
      'then Merge or Replace (double-confirm). A packaged map image',
      'auto-builds the whole grid on a fresh server.'
    ]
  },
  {
    title: 'Whisper Read Receipts', badge: 'NEW', color: '#9b59b6',
    desc: [
      'Activity logs now record when a whisper is opened: the sender',
      'sees "X opened your whisper", hosts get sender + a 150-char',
      'content preview in the Safari Log and spectator whisper',
      'channel. The "undefined sender" log bug is gone too.'
    ]
  },
  {
    title: 'Channel Administration', badge: 'NEW', color: '#1abc9c',
    desc: [
      'New Season Manager Channels tab: bulk-create confessionals,',
      'sub channels, 1-on-1s, player roles and Trusted Spectator',
      'access in one plan-confirm-execute flow with live progress,',
      'channel-limit preflight and safe re-runs after interruption.'
    ]
  },
  {
    title: 'Safari Under Load', badge: 'FIXED', color: '#e67e22',
    desc: [
      'Live-season race conditions closed: points spends no longer',
      'merge, stores can no longer oversell stock to simultaneous',
      'buyers, item use reads fresh inventory, and brand-new players',
      'no longer crash the store. Player data writes are serialized.'
    ]
  },
  {
    title: 'Stamina Clarity', badge: 'IMPROVED', color: '#e91e63',
    desc: [
      'The navigate pane and player card now always show pending',
      'regeneration when below max - "2/3, +1 in 5h 12m" - instead',
      'of only when exhausted. Players can finally see the drip',
      'timer working instead of reporting stamina as broken.'
    ]
  },
  {
    title: 'Activity Log Upgrades', badge: 'IMPROVED', color: '#16a085',
    desc: [
      'Pages now pack roughly 25-30 entries (was a fixed 15) by',
      'filling the full 4000-character budget, whisper content is',
      'included, and emoji-prefixed channel names no longer break',
      'the enhanced environment log on prod.'
    ]
  },
  {
    title: 'Bulk Messaging', badge: 'NEW', color: '#f39c12',
    desc: [
      'Msg Category: compose one rich card and post it to whole',
      'categories or channel selections with an expanded plan,',
      'ETA and streamed progress. Drafts persist per season, and',
      'the roster now counts each person once across applications.'
    ]
  },
];

// Under-the-hood strip — ops wins that deserve a line but not a card
const underHood = [
  'Prod swap +1GB (crash net)',
  'Watchdog "Restart Prod" button finally works',
  'Nightly auto-restart confirmed armed',
  'Map delete no longer log-spams',
];

const stats = [
  { value: '24', label: 'COMMITS', color: '#3498db' },
  { value: '+14,991', label: 'INSERTIONS', color: '#2ecc71' },
  { value: '-6,472', label: 'DELETIONS', color: '#e74c3c' },
  { value: '80', label: 'FILES CHANGED', color: '#e91e63' },
  { value: '2,073', label: 'TESTS PASSING', color: '#f1c40f' },
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
    <rect x="${W / 2 - 58}" y="40" width="116" height="28" rx="14" fill="none" stroke="#3498db" stroke-width="1.5"/>
    <text x="${W / 2}" y="59" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="bold" fill="#3498db" letter-spacing="2">JULY 2026</text>
  `;
  const title = `<text x="${W / 2}" y="112" text-anchor="middle" font-family="Georgia, serif" font-size="48" font-weight="bold" fill="url(#titleGrad)">CastBot Update</text>`;
  const subtitle = `<text x="${W / 2}" y="145" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${TEXT_SEC}">Stability at Scale — Safari Hardening, Whispers &amp; Portable Safaris</text>`;
  const divider = `<line x1="${W / 2 - 60}" y1="165" x2="${W / 2 + 60}" y2="165" stroke="#3498db" stroke-width="2" opacity="0.5"/>`;
  const whatsNew = `<text x="${W / 2}" y="195" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${TEXT_MUT}" letter-spacing="4">WHAT'S NEW</text>`;

  // 2 columns x 4 rows of wide, text-rich cards
  const cardW = 566, cardH = 138, cardGapX = 24, cardGapY = 22;
  const startX = (W - (2 * cardW + cardGapX)) / 2;
  const startY = 218;

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

  // Under-the-hood strip
  const uhY = startY + 4 * cardH + 3 * cardGapY + 30;
  let underSvg = `<text x="${W / 2}" y="${uhY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${TEXT_MUT}" letter-spacing="4">UNDER THE HOOD</text>`;
  const uhLine = underHood.join('   •   ');
  underSvg += `<text x="${W / 2}" y="${uhY + 24}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_SEC}">${uhLine}</text>`;

  // Stats row
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
    <text x="${W / 2}" y="${H - 20}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="${TEXT_MUT}">Deployed to production 18 July 2026 - Built with Sharp + Discord Components V2</text>
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

  const outPath = '/home/reece/castbot/temp/castbot-update-jul2026.png';
  fs.writeFileSync(outPath, result);
  console.log(`Written ${result.length} bytes to ${outPath}`);
}

generate().catch(console.error);
