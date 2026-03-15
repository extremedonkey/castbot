/**
 * Season Schedule Image Generator
 * Generates visual schedule representations for Season Planner
 *
 * Concepts:
 * 1. Month Calendar — calendar grid with round activities per day
 * 2. Countdown Strip — compact horizontal strip with F-numbers and milestones
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
  if (round.marooningDays > 0) return 'marooning';
  if (round.swapRound) return 'swap';
  if (round.mergeRound) return 'merge';
  return 'standard';
}

function getRoundDuration(round) {
  if (round.ftcRound) return Math.max(1, (round.speechDays ?? 1) + (round.votesDays ?? 1));
  if (round.fNumber === 1) return 1;
  if (round.marooningDays > 0) return round.marooningDays + 2;
  if (round.swapRound || round.mergeRound) return 3;
  return 2;
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
 * Calculate round start dates
 */
function calcDates(rounds, startDate) {
  const sortedIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
  const result = {};
  let dayOffset = 0;
  for (const id of sortedIds) {
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
function getDayActivities(round) {
  const type = getRoundType(round);
  const challengeName = round.challengeName ? stripEmoji(round.challengeName) : null;
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
    const days = [{ activity: 'marooning', label: 'Marooning' }];
    days.push({ activity: 'challenge', label: shortChallenge || 'Challenge' });
    days.push({ activity: 'tribal', label: 'Tribal' });
    return days;
  }

  if (type === 'swap' || type === 'merge') {
    const eventLabel = round.eventLabel || (type === 'swap' ? 'Swap' : 'Merge');
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

export async function generateMonthCalendar(seasonName, rounds, startDate) {
  const dates = calcDates(rounds, startDate);
  const sortedIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);

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
    const activities = getDayActivities(round);
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

  // Title
  composites.push({
    input: Buffer.from(`<svg width="${WIDTH}" height="${TITLE_H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${WIDTH / 2}" y="32" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="${TEXT_PRI}">${escapeXml(stripEmoji(seasonName))}</text>
      <text x="${WIDTH / 2}" y="55" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_MUT}">${formatDateShort(startDate)} – ${formatDateShort(endDate)} | ${dates._totalDays} days | ${sortedIds.length} rounds</text>
    </svg>`),
    top: 0, left: 0
  });

  for (let mi = 0; mi < months.length; mi++) {
    const { year, month } = months[mi];
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
  const legendY = HEIGHT - LEGEND_H;
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
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } }
  });

  return canvas.composite(composites).png({ quality: 90 }).toBuffer();
}

// ═══════════════════════════════════════════
// Countdown Strip
// ═══════════════════════════════════════════

export async function generateCountdownStrip(seasonName, rounds, startDate) {
  const sortedIds = Object.keys(rounds).sort((a, b) => rounds[a].seasonRoundNo - rounds[b].seasonRoundNo);
  const dates = calcDates(rounds, startDate);

  const MARGIN = 30;
  const HEADER_H = 60;
  const STRIP_H = 60;
  const NODE_R = 16;
  const WIDTH = MARGIN * 2 + sortedIds.length * 48;
  const HEIGHT = HEADER_H + STRIP_H + 80;

  const composites = [];
  const nodeSpacing = (WIDTH - MARGIN * 2) / (sortedIds.length - 1 || 1);

  // Title
  composites.push({
    input: Buffer.from(`<svg width="${WIDTH}" height="${HEADER_H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${WIDTH / 2}" y="28" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="${TEXT_PRI}">${escapeXml(stripEmoji(seasonName))} — Countdown</text>
      <text x="${WIDTH / 2}" y="48" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${TEXT_MUT}">F${rounds[sortedIds[0]].fNumber} to F${rounds[sortedIds[sortedIds.length - 1]].fNumber} | ${dates._totalDays} days</text>
    </svg>`),
    top: 0, left: 0
  });

  // Horizontal line
  const lineY = HEADER_H + STRIP_H / 2;
  composites.push({
    input: Buffer.from(`<svg width="${WIDTH}" height="4" xmlns="http://www.w3.org/2000/svg">
      <rect x="${MARGIN}" y="0" width="${WIDTH - MARGIN * 2}" height="4" rx="2" fill="${SEPARATOR}"/>
    </svg>`),
    top: lineY - 2, left: 0
  });

  // Nodes
  for (let i = 0; i < sortedIds.length; i++) {
    const id = sortedIds[i];
    const round = rounds[id];
    const type = getRoundType(round);
    const color = TYPE_COLORS[type];
    const cx = MARGIN + i * nodeSpacing;
    const isEvent = type !== 'standard';

    composites.push({
      input: Buffer.from(`<svg width="${NODE_R * 2 + 4}" height="${NODE_R * 2 + 4}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${NODE_R + 2}" cy="${NODE_R + 2}" r="${isEvent ? NODE_R : 8}" fill="${color}" fill-opacity="${isEvent ? 1 : 0.6}"/>
        ${isEvent ? `<circle cx="${NODE_R + 2}" cy="${NODE_R + 2}" r="${NODE_R - 4}" fill="${BG}"/>` : ''}
      </svg>`),
      top: lineY - NODE_R - 2,
      left: Math.round(cx - NODE_R - 2)
    });

    const labelY = i % 2 === 0 ? lineY + NODE_R + 8 : lineY + NODE_R + 22;
    composites.push({
      input: Buffer.from(`<svg width="60" height="20" xmlns="http://www.w3.org/2000/svg">
        <text x="30" y="14" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${isEvent ? 11 : 9}" font-weight="${isEvent ? 'bold' : 'normal'}" fill="${isEvent ? color : TEXT_MUT}">F${round.fNumber}</text>
      </svg>`),
      top: labelY,
      left: Math.round(cx - 30)
    });

    if (isEvent) {
      const eventLabel = type === 'reunion' ? 'END' : type === 'ftc' ? 'FTC' : type === 'marooning' ? 'START' : (round.eventLabel || type).toUpperCase();
      composites.push({
        input: Buffer.from(`<svg width="60" height="16" xmlns="http://www.w3.org/2000/svg">
          <text x="30" y="12" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="bold" fill="${color}">${escapeXml(stripEmoji(eventLabel))}</text>
        </svg>`),
        top: lineY - NODE_R - 18,
        left: Math.round(cx - 30)
      });
    }
  }

  const canvas = sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } }
  });

  return canvas.composite(composites).png({ quality: 90 }).toBuffer();
}
