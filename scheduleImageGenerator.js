/**
 * Season Schedule Image Generator
 * Generates visual schedule representations for Season Planner
 *
 * Concepts:
 * 1. Vertical Timeline (Schedule) — round-by-round list with event markers, dates, duration
 * 2. Month Calendar — calendar grid with round activities per day
 */

import sharp from 'sharp';
// Day arithmetic is SHARED with the planner's round string selects — never reimplement it
// here. These images and the selects must always agree. See seasonRoundSchedule.js.
import {
  buildRoundSchedule, expandRoundDays, formatRoundDate, formatMonthDay,
} from './seasonRoundSchedule.js';
// No libvips cache — ~0% hit rate, starves the 448MB prod box (RaP 0903)
sharp.cache(false);

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
  bonus:     '#ec4899',  // Reward / bonus challenge — pink, distinct from every other activity
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

/**
 * Resolve a round's challenge display name, truncated to `max` chars.
 * Returns null when nothing is linked and no fallback is wanted.
 */
function challengeTitle(round, challenges, max, fallback = null) {
  const linked = round.challengeIDs?.primary ? challenges[round.challengeIDs.primary] : null;
  const raw = linked?.title ? stripEmoji(linked.title) : (round.challengeName ? stripEmoji(round.challengeName) : null);
  if (!raw) return fallback;
  return raw.length > max ? raw.substring(0, max - 2) + '..' : raw;
}

/** Title of the round's linked bonus/reward challenge (falls back if the link is dangling). */
function bonusTitle(round, challenges, max, fallback = 'Reward') {
  const linked = round.bonusChallengeId ? challenges[round.bonusChallengeId] : null;
  const raw = linked?.title ? stripEmoji(linked.title) : null;
  if (!raw) return fallback;
  return raw.length > max ? raw.substring(0, max - 2) + '..' : raw;
}

/** The event label for a round's leading phase ("Marooning", "Swap 1", "Merge", "Reunion"). */
function eventLabelFor(roundSchedule) {
  const { round, type } = roundSchedule;
  if (type === 'reunion') return 'Reunion';
  if (type === 'marooning') return 'Marooning';
  return round.eventLabel || (type === 'swap' ? 'Swap' : 'Merge');
}

/** Most pills that fit in one calendar cell before they'd overflow it. */
const MAX_CELL_PILLS = 3;

/**
 * Per-day activities for the 📅 Calendar, derived from the SHARED phase model.
 *
 * expandRoundDays() guarantees exactly getRoundDuration(round) entries, so calendar cells can
 * never drift out of step with the timeline's round start dates.
 *
 * Each day returns a LIST of activities, one per phase running that day — the calendar stacks
 * them as separate pills. A reward running alongside its immunity challenge therefore shows
 * both real titles on both days, rather than one merged "Rwd + Chall" label on the first day
 * only. Phases are already in chronological order, so the reward lands on top when it leads.
 *
 * @returns {Array<Array<{activity: string, label: string}>>} one entry per day of the round
 */
function getDayActivities(roundSchedule, challenges = {}) {
  const { round, type } = roundSchedule;
  const shortChallenge = challengeTitle(round, challenges, 13, 'Challenge');
  const shortBonus = bonusTitle(round, challenges, 13, 'Reward');
  const eventLabel = eventLabelFor(roundSchedule);

  const labels = {
    event: eventLabel,
    challenge: shortChallenge,
    bonus: shortBonus,
    tribal: 'Tribal',
    speeches: 'Speeches',
    votes: 'Q&A/Votes',
  };

  return expandRoundDays(round).map(day => {
    const pills = day.phases.slice(0, MAX_CELL_PILLS).map(p => ({
      activity: p.activity,
      label: labels[p.key] ?? 'Challenge',
    }));
    return pills.length ? pills : [{ activity: type, label: labels.challenge }];
  });
}

// ═══════════════════════════════════════════
// Month Calendar (enhanced with activities)
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// Vertical Timeline (Schedule) — 4-column layout
// Col1: F-number + duration | Col2: Day 1 event + date | Col3: Day 2 event + date | Col4: Day 3 event + date (if applicable)
// ═══════════════════════════════════════════

/**
 * Columnar breakdown of a round for the 📋 Schedule timeline — one column per DAY-GROUP.
 *
 * Built from the SHARED phase model, so every date here is the same date the planner's round
 * select shows. (This function used to hard-code the tribal at "round start + 1", which meant
 * a live tribal — tribalDays: 0 — read same-day in the select and next-day in this image.)
 *
 * Phases landing on the same day are merged into one column ("Marooning + Challenge"), so the
 * column count never exceeds the 3 the renderer has x-positions for.
 *
 * @returns {Array<{title: string, date: string}>} 1-3 columns
 */
function getScheduleColumns(roundSchedule, challenges = {}) {
  const { round, phases } = roundSchedule;
  const f = round.fNumber;
  const elims = round.eliminations ?? 1;
  const elimText = elims === 0 ? 'no elim' : elims === 1 ? '1 elim' : `${elims} elims`;
  const shortChallenge = challengeTitle(round, challenges, 22, `Challenge ${round.seasonRoundNo}`);
  // Shorter cap for the bonus — when it shares a day its title is joined with another.
  const shortBonus = bonusTitle(round, challenges, 18, 'Reward');
  const eventLabel = eventLabelFor(roundSchedule);

  const titleFor = (phase) => {
    switch (phase.key) {
      case 'challenge': return shortChallenge;
      case 'bonus':     return shortBonus;
      case 'tribal':    return `F${f} Tribal`;
      case 'speeches':  return 'Speeches';
      case 'votes':     return 'Q&A / Votes';
      default:          return eventLabel; // 'event' — marooning / swap / merge / reunion
    }
  };

  // Group phases that share a calendar day (0-day marooning, 0-day event, live tribal).
  const groups = [];
  for (const phase of phases) {
    const existing = groups.find(g => g.offset === phase.offset);
    if (existing) existing.phases.push(phase);
    else groups.push({ offset: phase.offset, date: phase.date, phases: [phase] });
  }

  // A column is COL_W (175px) of bold 13px Arial ≈ 26 characters. Titles merged from several
  // phases blow past that and spill into the neighbouring column, so cap the joined string.
  const MAX_TITLE = 26;

  return groups.map(group => {
    // The elimination count rides along with whichever column holds the tribal.
    const hasTribal = group.phases.some(p => p.key === 'tribal');
    const date = formatRoundDate(group.date);
    const title = group.phases.map(titleFor).join(' + ');
    return {
      title: title.length > MAX_TITLE ? title.substring(0, MAX_TITLE - 2) + '..' : title,
      date: hasTribal ? `${date} · ${elimText}` : date,
    };
  });
}

export async function generateVerticalTimeline(seasonName, rounds, startDate, challenges = {}) {
  const schedule = buildRoundSchedule(rounds, startDate);
  const sortedIds = schedule.ids.filter(id => !schedule.byId[id].skipped);

  // Pre-compute every round's columns so the canvas can be sized to the widest one.
  // A round with a bonus challenge needs a 4th column (event + bonus + challenge + tribal);
  // seasons without one keep the original 3-column width rather than carrying a dead column.
  const columnsById = {};
  let maxColumns = 1;
  for (const id of sortedIds) {
    columnsById[id] = getScheduleColumns(schedule.byId[id], challenges);
    maxColumns = Math.max(maxColumns, columnsById[id].length);
  }

  // Layout constants
  const MARGIN = 20;
  const ROW_H = 52;
  const HEADER_H = 80;
  const COL1_X = MARGIN;       // F-number column
  const COL1_W = 55;
  const COL2_X = COL1_X + COL1_W + 20;  // Day 1 (gap after F-number)
  const COL_W = 175;           // Width per day column
  const COL_GAP = 12;
  // One x-position per day column, grown to fit the widest round in this season.
  const colXs = Array.from({ length: maxColumns }, (_, i) => COL2_X + i * (COL_W + COL_GAP));
  const WIDTH = colXs[colXs.length - 1] + COL_W + MARGIN;
  const HEIGHT = HEADER_H + sortedIds.length * ROW_H + MARGIN;

  const composites = [];

  // Title
  composites.push({
    input: Buffer.from(`<svg width="${WIDTH}" height="${HEADER_H}" xmlns="http://www.w3.org/2000/svg">
      <text x="${WIDTH / 2}" y="35" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="${TEXT_PRI}">${escapeXml(stripEmoji(seasonName))} — Schedule</text>
      <text x="${WIDTH / 2}" y="58" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_MUT}">${sortedIds.length} rounds | ${schedule.totalDays} days | ${formatRoundDate(startDate)} start</text>
      <line x1="${MARGIN}" y1="${HEADER_H - 2}" x2="${WIDTH - MARGIN}" y2="${HEADER_H - 2}" stroke="${SEPARATOR}" stroke-width="1"/>
    </svg>`),
    top: 0, left: 0
  });

  // Rows
  for (let i = 0; i < sortedIds.length; i++) {
    const id = sortedIds[i];
    const roundSchedule = schedule.byId[id];
    const { round, type, duration: dur } = roundSchedule;
    const color = TYPE_COLORS[type];
    const y = HEADER_H + i * ROW_H;
    const cols = columnsById[id];
    const isLast = i === sortedIds.length - 1;

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
      // Belt-and-braces: an unplaced column would emit x="undefined" into the SVG.
      // colXs is sized from maxColumns above, so this should be unreachable.
      if (cx === undefined) { console.warn(`⚠️ Schedule: round ${id} has ${cols.length} columns, only ${colXs.length} placed`); break; }

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
  const schedule = buildRoundSchedule(rounds, startDate);
  const sortedIds = schedule.ids.filter(id => !schedule.byId[id].skipped);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + schedule.totalDays);

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
    const roundSchedule = schedule.byId[id];
    const { round, type, start } = roundSchedule;
    // One entry per day — expandRoundDays guarantees activities.length === round duration,
    // so cells never leave a gap or spill onto the next round's first day.
    const activities = getDayActivities(roundSchedule, challenges);
    for (let day = 0; day < activities.length; day++) {
      const rd = new Date(start);
      rd.setDate(rd.getDate() + day);
      const key = `${rd.getFullYear()}-${rd.getMonth()}-${rd.getDate()}`;
      // `pills` is a LIST — a reward running alongside its challenge stacks two in one cell.
      dateLookup[key] = { round, id, dayInRound: day, type, pills: activities[day] };
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
      <text x="${WIDTH / 2}" y="55" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_MUT}">${formatMonthDay(startDate)} – ${formatMonthDay(endDate)} | ${schedule.totalDays} days | ${sortedIds.length} rounds</text>
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

      const pills = info?.pills || [];
      // The cell's accent + F-number take the colour of the FIRST activity of the day.
      const accentColor = info ? (ACTIVITY_COLORS[pills[0]?.activity] || TYPE_COLORS[info.type]) : null;
      const cellBg = info ? CARD_ALT : CARD_BG;
      const fText = info ? `F${info.round.fNumber}` : '';

      // Stacked pills: 16px tall on an 18px pitch from y=30, so three still clear the cell.
      const PILL_H = 16, PILL_PITCH = 18, PILL_TOP = 30;
      const pillSvg = pills.map((pill, pi) => {
        const color = ACTIVITY_COLORS[pill.activity] || TYPE_COLORS[info.type];
        const py = PILL_TOP + pi * PILL_PITCH;
        return `<rect x="8" y="${py}" width="${CELL_W - 20}" height="${PILL_H}" rx="4" ry="4" fill="${color}" fill-opacity="0.15"/>`
          + `<text x="${CELL_W / 2}" y="${py + 11.5}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" fill="${color}">${escapeXml(pill.label)}</text>`;
      }).join('');

      composites.push({
        input: Buffer.from(`<svg width="${CELL_W}" height="${CELL_H}" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="${CELL_W - 4}" height="${CELL_H - 4}" rx="6" ry="6" fill="${cellBg}"/>
          ${accentColor ? `<rect x="2" y="2" width="${CELL_W - 4}" height="3" rx="1" fill="${accentColor}"/>` : ''}
          <text x="10" y="22" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="${info ? TEXT_PRI : TEXT_MUT}">${day}</text>
          ${fText ? `<text x="${CELL_W - 10}" y="22" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold" fill="${accentColor}">${fText}</text>` : ''}
          ${pillSvg}
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
  // Only advertise Reward when the season actually uses one.
  if (Object.values(dateLookup).some(d => d.pills?.some(p => p.activity === 'bonus'))) {
    legendItems.push({ label: 'Reward', color: ACTIVITY_COLORS.bonus });
  }
  // Spread the swatches across the available width so an extra item still fits.
  const legendGap = Math.min(108, (WIDTH - MARGIN * 2) / legendItems.length);
  const legendSvg = legendItems.map((item, i) =>
    `<rect x="${MARGIN + i * legendGap}" y="8" width="12" height="12" rx="3" fill="${item.color}"/>` +
    `<text x="${MARGIN + i * legendGap + 18}" y="18" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${TEXT_MUT}">${item.label}</text>`
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

