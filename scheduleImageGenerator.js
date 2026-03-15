/**
 * Season Schedule Image Generator
 * Generates visual schedule representations for Season Planner
 *
 * Concepts:
 * 1. Vertical Timeline (Schedule) — round-by-round list with event markers, dates, duration
 * 2. Month Calendar — calendar grid with round activities per day
 */

import sharp from 'sharp';

// ─── Color Palette (Discord dark theme) ───
const BG        = '#1a1a2e';
const CARD_BG   = '#16213e';
const CARD_ALT  = '#1a2744';
const TEXT_PRI  = '#e8e8e8';
const TEXT_SEC  = '#a0a0b0';
const TEXT_MUT  = '#7a7a8a';
const SEPARATOR = '#2a2a4a';

// Round type colors
const TYPE_COLORS = {
  marooning: '#06b6d4',  // Cyan
  swap:      '#f59e0b',  // Orange
  merge:     '#9b59b6',  // Purple
  ftc:       '#e74c3c',  // Red
  reunion:   '#4ade80',  // Green
  standard:  '#5865F2',  // Blurple
};

// Activity labels and colors for each day within a round
const ACTIVITY_COLORS = {
  marooning: '#06b6d4',
  challenge: '#5865F2',
  tribal:    '#e74c3c',
  swap:      '#f59e0b',
  merge:     '#9b59b6',
  speeches:  '#f59e0b',
  votes:     '#e74c3c',
  reunion:   '#4ade80',
};

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function stripEmoji(str) {
  return String(str).replace(/[\u{1F000}-\u{1FFFF}]/gu, '').replace(/[\u{2600}-\u{27BF}]/gu, '').replace(/[\u{FE00}-\u{FE0F}]/gu, '').replace(/[\u{200D}]/gu, '').trim();
}

function getRoundType(round) {
  if (round.ftcRound) return 'ftc';
  if (round.fNumber === 1) return 'reunion';
  const hasMarooning = round.hasMarooning ?? (round.marooningDays > 0);
  if (hasMarooning) return 'marooning';
  if (round.swapRound) return 'swap';
  if (round.mergeRound) return 'merge';
  return 'standard';
}

function getRoundDuration(round) {
  if (round.ftcRound) return Math.max(1, (round.speechDays ?? 1) + (round.votesDays ?? 1));
  if (round.fNumber === 1) return 1;
  const hasMarooning = round.hasMarooning ?? (round.marooningDays > 0);
  const tribalDays = round.tribalDays ?? 1;
  if (hasMarooning) return (round.marooningDays ?? 1) + 1 + tribalDays;
  if (round.swapRound || round.mergeRound) return (round.eventDays ?? 1) + 1 + tribalDays;
  return 1 + tribalDays;
}

function formatDateShort(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function formatDate(date) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * Calculate which rounds are skipped (multi-elimination).
 */
function getSkippedRounds(rounds) {
  const skipped = new Set();
  const sortedIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
  for (let i = 0; i < sortedIds.length; i++) {
    const elims = rounds[sortedIds[i]].eliminations ?? 1;
    if (elims > 1) {
      for (let skip = 1; skip < elims && (i + skip) < sortedIds.length; skip++) {
        skipped.add(sortedIds[i + skip]);
      }
    }
  }
  return skipped;
}

/**
 * Calculate round start dates (skips rounds with 0 duration from multi-elims)
 */
function calcDates(rounds, startDate) {
  const sortedIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
  const skipped = getSkippedRounds(rounds);
  const result = {};
  let dayOffset = 0;
  for (const id of sortedIds) {
    if (skipped.has(id)) { result[id] = { date: new Date(startDate), offset: dayOffset, skipped: true }; continue; }
    const round = rounds[id];
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayOffset);
    result[id] = { date: d, offset: dayOffset };
    dayOffset += getRoundDuration(round);
  }
  result._totalDays = dayOffset;
  return result;
}

/**
 * Determine what activity happens on each day of a round.
 * Returns an array of { activity, label } for each day.
 */
function getDayActivities(round, challenges = {}) {
  const type = getRoundType(round);
  const linkedChal = round.challengeIDs?.primary ? challenges[round.challengeIDs.primary] : null;
  const challengeName = linkedChal?.title ? stripEmoji(linkedChal.title) : (round.challengeName ? stripEmoji(round.challengeName) : null);
  const shortChallenge = challengeName ? (challengeName.length > 12 ? challengeName.substring(0, 10) + '..' : challengeName) : null;

  if (type === 'reunion') {
    return [{ activity: 'reunion', label: 'Reunion' }];
  }

  if (type === 'ftc') {
    const days = [];
    const speechDays = round.speechDays ?? 1;
    const votesDays = round.votesDays ?? 1;
    for (let i = 0; i < speechDays; i++) days.push({ activity: 'speeches', label: 'Speeches' });
    for (let i = 0; i < votesDays; i++) days.push({ activity: 'votes', label: 'Q&A/Votes' });
    return days.length > 0 ? days : [{ activity: 'votes', label: 'FTC' }];
  }

  if (type === 'marooning') {
    const mDays = round.marooningDays ?? 1;
    if (mDays === 0) {
      // Marooning + challenge same day
      return [
        { activity: 'marooning', label: 'Mar + Chall' },
        { activity: 'tribal', label: 'Tribal' },
      ];
    }
    const days = [{ activity: 'marooning', label: 'Marooning' }];
    days.push({ activity: 'challenge', label: shortChallenge || 'Challenge' });
    days.push({ activity: 'tribal', label: 'Tribal' });
    return days;
  }

  if (type === 'swap' || type === 'merge') {
    const eDays = round.eventDays ?? 1;
    const eventLabel = round.eventLabel || (type === 'swap' ? 'Swap' : 'Merge');
    if (eDays === 0) {
      // Event + challenge same day
      return [
        { activity: type, label: `${eventLabel} + Chall` },
        { activity: 'tribal', label: 'Tribal' },
      ];
    }
    return [
      { activity: type, label: eventLabel },
      { activity: 'challenge', label: shortChallenge || 'Challenge' },
      { activity: 'tribal', label: 'Tribal' },
    ];
  }

  // Standard: challenge + tribal
  return [
    { activity: 'challenge', label: shortChallenge || 'Challenge' },
    { activity: 'tribal', label: 'Tribal' },
  ];
}

// ═══════════════════════════════════════════
// Month Calendar (enhanced with activities)
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// Vertical Timeline (Schedule) — 4-column layout
// Col1: F-number + duration | Col2: Day 1 event + date | Col3: Day 2 event + date | Col4: Day 3 event + date (if applicable)
// ═══════════════════════════════════════════

/**
 * Get the columnar breakdown for a round.
 * Returns array of { title, date } objects (1-4 columns depending on round type).
 */
function getScheduleColumns(round, roundStartDate, challenges = {}) {
  const f = round.fNumber;
  const type = getRoundType(round);
  const elims = round.eliminations ?? 1;
  const elimText = elims === 0 ? 'no elim' : elims === 1 ? '1 elim' : `${elims} elims`;
  const linkedChal2 = round.challengeIDs?.primary ? challenges[round.challengeIDs.primary] : null;
  const challengeName = linkedChal2?.title ? stripEmoji(linkedChal2.title) : (round.challengeName ? stripEmoji(round.challengeName) : `Challenge ${round.seasonRoundNo}`);
  const shortChallenge = challengeName.length > 22 ? challengeName.substring(0, 19) + '...' : challengeName;

  const d0 = formatDate(roundStartDate);
  const day1 = new Date(roundStartDate); day1.setDate(day1.getDate() + 1);
  const d1 = formatDate(day1);
  const day2 = new Date(roundStartDate); day2.setDate(day2.getDate() + 2);
  const d2 = formatDate(day2);

  if (type === 'reunion') {
    return [{ title: 'Reunion', date: d0 }];
  }

  if (type === 'ftc') {
    const speechDays = round.speechDays ?? 1;
    const votesStart = new Date(roundStartDate); votesStart.setDate(votesStart.getDate() + speechDays);
    return [
      { title: 'Speeches', date: d0 },
      { title: 'Q&A / Votes', date: formatDate(votesStart) },
    ];
  }

  if (type === 'marooning') {
    const mDays = round.marooningDays ?? 1;
    if (mDays === 0) {
      // Marooning + challenge same day
      return [
        { title: 'Marooning + Challenge', date: d0 },
        { title: `F${f} Tribal`, date: `${d1} · ${elimText}` },
      ];
    }
    const challDate = new Date(roundStartDate); challDate.setDate(challDate.getDate() + mDays);
    const tribDate = new Date(roundStartDate); tribDate.setDate(tribDate.getDate() + mDays + 1);
    return [
      { title: 'Marooning', date: d0 },
      { title: shortChallenge, date: formatDate(challDate) },
      { title: `F${f} Tribal`, date: `${formatDate(tribDate)} · ${elimText}` },
    ];
  }

  if (type === 'swap' || type === 'merge') {
    const eDays = round.eventDays ?? 1;
    const eventLabel = round.eventLabel || (type === 'swap' ? 'Swap' : 'Merge');
    if (eDays === 0) {
      // Event + challenge same day
      return [
        { title: `${eventLabel} + Challenge`, date: d0 },
        { title: `F${f} Tribal`, date: `${d1} · ${elimText}` },
      ];
    }
    const challDate = new Date(roundStartDate); challDate.setDate(challDate.getDate() + eDays);
    const tribDate = new Date(roundStartDate); tribDate.setDate(tribDate.getDate() + eDays + 1);
    return [
      { title: eventLabel, date: d0 },
      { title: shortChallenge, date: formatDate(challDate) },
      { title: `F${f} Tribal`, date: `${formatDate(tribDate)} · ${elimText}` },
    ];
  }

  // Standard (2 days): challenge + tribal
  return [
    { title: shortChallenge, date: d0 },
    { title: `F${f} Tribal`, date: `${d1} · ${elimText}` },
  ];
}

export async function generateVerticalTimeline(seasonName, rounds, startDate, challenges = {}) {
  const allIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
  const dates = calcDates(rounds, startDate);
  const sortedIds = allIds.filter(id => !dates[id]?.skipped);

  // Layout constants
  const MARGIN = 20;
  const ROW_H = 52;
  const HEADER_H = 80;
  const COL1_X = MARGIN;       // F-number column
  const COL1_W = 55;
  const COL2_X = COL1_X + COL1_W + 20;  // Day 1 (gap after F-number)
  const COL_W = 175;           // Width per day column
  const COL_GAP = 12;
  const COL3_X = COL2_X + COL_W + COL_GAP;  // Day 2
  const COL4_X = COL3_X + COL_W + COL_GAP;  // Day 3
  const WIDTH = COL4_X + COL_W + MARGIN;
  const HEIGHT = HEADER_H + sortedIds.length * ROW_H + MARGIN;

  const composites = [];

  // Title
  composites.push({
    input: Buffer.from(`<svg width="${WIDTH}" height="${HEADER_H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${WIDTH / 2}" y="35" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="${TEXT_PRI}">${escapeXml(stripEmoji(seasonName))} — Schedule</text>
      <text x="${WIDTH / 2}" y="58" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_MUT}">${sortedIds.length} rounds | ${dates._totalDays} days | ${formatDate(startDate)} start</text>
      <line x1="${MARGIN}" y1="${HEADER_H - 2}" x2="${WIDTH - MARGIN}" y2="${HEADER_H - 2}" stroke="${SEPARATOR}" stroke-width="1"/>
    </svg>`),
    top: 0, left: 0
  });

  // Rows
  for (let i = 0; i < sortedIds.length; i++) {
    const id = sortedIds[i];
    const round = rounds[id];
    const type = getRoundType(round);
    const color = TYPE_COLORS[type];
    const y = HEADER_H + i * ROW_H;
    const dateInfo = dates[id];
    const dur = getRoundDuration(round);
    const cols = getScheduleColumns(round, dateInfo.date, challenges);
    const isLast = i === sortedIds.length - 1;

    // Column positions
    const colXs = [COL2_X, COL3_X, COL4_X];

    // Build SVG parts
    let svgParts = '';
    const isSpecial = type !== 'standard';

    // Background highlight for special rounds
    if (isSpecial) {
      svgParts += `<rect x="0" y="0" width="${WIDTH}" height="${ROW_H}" fill="${color}" fill-opacity="0.06"/>`;
      svgParts += `<rect x="0" y="0" width="3" height="${ROW_H}" fill="${color}" fill-opacity="0.5"/>`;
    }

    // Col1: color dot + F-number (bold) + duration (muted, below)
    svgParts += `<circle cx="${COL1_X + 6}" cy="16" r="5" fill="${color}"/>`;
    svgParts += `<text x="${COL1_X + 18}" y="18" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="${isSpecial ? color : TEXT_PRI}">F${round.fNumber}</text>`;
    svgParts += `<text x="${COL1_X + 18}" y="34" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${TEXT_MUT}">${dur}d</text>`;

    // Day columns
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      const cx = colXs[c];

      // First column of special rounds gets the type color for the title
      const isEventCol = isSpecial && c === 0;
      const titleFill = isEventCol ? color : TEXT_PRI;

      svgParts += `<text x="${cx}" y="18" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="${titleFill}">${escapeXml(col.title)}</text>`;
      svgParts += `<text x="${cx}" y="34" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${TEXT_SEC}">${escapeXml(col.date)}</text>`;
    }

    // Subtle row separator
    if (!isLast) {
      svgParts += `<line x1="${COL2_X}" y1="${ROW_H - 1}" x2="${WIDTH - MARGIN}" y2="${ROW_H - 1}" stroke="${SEPARATOR}" stroke-width="0.5" stroke-opacity="0.3"/>`;
    }

    composites.push({
      input: Buffer.from(`<svg width="${WIDTH}" height="${ROW_H}" xmlns="http://www.w3.org/2000/svg">${svgParts}</svg>`),
      top: y, left: 0
    });
  }

  const canvas = sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } }
  });

  return canvas.composite(composites).png({ quality: 90 }).toBuffer();
}

// ═══════════════════════════════════════════
// Month Calendar (enhanced with activities)
// ═══════════════════════════════════════════

export async function generateMonthCalendar(seasonName, rounds, startDate, challenges = {}) {
  const dates = calcDates(rounds, startDate);
  const sortedIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo)
    .filter(id => !dates[id]?.skipped);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + dates._totalDays);

  const months = [];
  let d = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (d <= endDate) {
    months.push({ year: d.getFullYear(), month: d.getMonth() });
    d.setMonth(d.getMonth() + 1);
  }

  const CELL_W = 110;
  const CELL_H = 88;
  const HEADER_H = 30;
  const MONTH_HEADER_H = 40;
  const TITLE_H = 70;
  const LEGEND_H = 35;
  const MARGIN = 20;
  const WIDTH = MARGIN * 2 + 7 * CELL_W;
  const monthHeight = MONTH_HEADER_H + HEADER_H + 6 * CELL_H;
  const HEIGHT = TITLE_H + months.length * monthHeight + LEGEND_H + MARGIN;

  const composites = [];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Build lookup: date string → { round, dayInRound, activity info }
  const dateLookup = {};
  for (const id of sortedIds) {
    const round = rounds[id];
    const dateInfo = dates[id];
    const activities = getDayActivities(round, challenges);
    for (let day = 0; day < activities.length; day++) {
      const rd = new Date(dateInfo.date);
      rd.setDate(rd.getDate() + day);
      const key = `${rd.getFullYear()}-${rd.getMonth()}-${rd.getDate()}`;
      dateLookup[key] = {
        round, id, dayInRound: day,
        type: getRoundType(round),
        activity: activities[day].activity,
        activityLabel: activities[day].label,
      };
    }
  }

  // Filter out months with no round activity
  const activeMonths = months.filter(({ year, month }) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      if (dateLookup[`${year}-${month}-${day}`]) return true;
    }
    return false;
  });

  // Recalculate height with filtered months
  const actualHeight = TITLE_H + activeMonths.length * monthHeight + LEGEND_H + MARGIN;

  // Title
  composites.push({
    input: Buffer.from(`<svg width="${WIDTH}" height="${TITLE_H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${WIDTH / 2}" y="32" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="${TEXT_PRI}">${escapeXml(stripEmoji(seasonName))}</text>
      <text x="${WIDTH / 2}" y="55" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_MUT}">${formatDateShort(startDate)} – ${formatDateShort(endDate)} | ${dates._totalDays} days | ${sortedIds.length} rounds</text>
    </svg>`),
    top: 0, left: 0
  });

  for (let mi = 0; mi < activeMonths.length; mi++) {
    const { year, month } = activeMonths[mi];
    const baseY = TITLE_H + mi * monthHeight;

    // Month header
    composites.push({
      input: Buffer.from(`<svg width="${WIDTH}" height="${MONTH_HEADER_H}" xmlns="http://www.w3.org/2000/svg">
        <text x="${WIDTH / 2}" y="28" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="bold" fill="${TEXT_PRI}">${monthNames[month]} ${year}</text>
      </svg>`),
      top: baseY, left: 0
    });

    // Day headers
    const headerSvg = dayNames.map((name, i) =>
      `<text x="${MARGIN + i * CELL_W + CELL_W / 2}" y="20" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="${TEXT_MUT}">${name}</text>`
    ).join('');
    composites.push({
      input: Buffer.from(`<svg width="${WIDTH}" height="${HEADER_H}" xmlns="http://www.w3.org/2000/svg">${headerSvg}</svg>`),
      top: baseY + MONTH_HEADER_H, left: 0
    });

    // Calendar grid
    const firstDay = new Date(year, month, 1);
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dow = (startDow + day - 1) % 7;
      const week = Math.floor((startDow + day - 1) / 7);
      const cx = MARGIN + dow * CELL_W;
      const cy = baseY + MONTH_HEADER_H + HEADER_H + week * CELL_H;
      const key = `${year}-${month}-${day}`;
      const info = dateLookup[key];

      let cellBg = CARD_BG;
      let accentColor = null;
      let fText = '';
      let activityLabel = '';
      let activityColor = TEXT_MUT;

      if (info) {
        accentColor = ACTIVITY_COLORS[info.activity] || TYPE_COLORS[info.type];
        activityColor = accentColor;
        cellBg = CARD_ALT;
        fText = `F${info.round.fNumber}`;
        activityLabel = escapeXml(info.activityLabel);
      }

      composites.push({
        input: Buffer.from(`<svg width="${CELL_W}" height="${CELL_H}" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="${CELL_W - 4}" height="${CELL_H - 4}" rx="6" ry="6" fill="${cellBg}"/>
          ${accentColor ? `<rect x="2" y="2" width="${CELL_W - 4}" height="3" rx="1" fill="${accentColor}"/>` : ''}
          <text x="10" y="22" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="${info ? TEXT_PRI : TEXT_MUT}">${day}</text>
          ${fText ? `<text x="${CELL_W - 10}" y="22" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="${activityColor}">${fText}</text>` : ''}
          ${activityLabel ? `<rect x="8" y="32" width="${CELL_W - 20}" height="18" rx="4" ry="4" fill="${activityColor}" fill-opacity="0.15"/>` : ''}
          ${activityLabel ? `<text x="${CELL_W / 2}" y="45" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" fill="${activityColor}">${activityLabel}</text>` : ''}
        </svg>`),
        top: cy, left: cx
      });
    }
  }

  // Legend
  const legendY = actualHeight - LEGEND_H;
  const legendItems = [
    { label: 'Marooning', color: ACTIVITY_COLORS.marooning },
    { label: 'Challenge', color: ACTIVITY_COLORS.challenge },
    { label: 'Tribal', color: ACTIVITY_COLORS.tribal },
    { label: 'Swap', color: ACTIVITY_COLORS.swap },
    { label: 'Merge', color: ACTIVITY_COLORS.merge },
    { label: 'FTC', color: ACTIVITY_COLORS.votes },
    { label: 'Reunion', color: ACTIVITY_COLORS.reunion },
  ];
  const legendSvg = legendItems.map((item, i) =>
    `<rect x="${MARGIN + i * 108}" y="8" width="12" height="12" rx="3" fill="${item.color}"/>` +
    `<text x="${MARGIN + i * 108 + 18}" y="18" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${TEXT_MUT}">${item.label}</text>`
  ).join('');
  composites.push({
    input: Buffer.from(`<svg width="${WIDTH}" height="${LEGEND_H}" xmlns="http://www.w3.org/2000/svg">${legendSvg}</svg>`),
    top: legendY, left: 0
  });

  const canvas = sharp({
    create: { width: WIDTH, height: actualHeight, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } }
  });

  return canvas.composite(composites).png({ quality: 90 }).toBuffer();
}

