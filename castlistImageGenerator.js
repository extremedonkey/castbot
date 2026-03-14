/**
 * CastlistImageGenerator - Sharp-based PNG castlist renderer
 * Proof of Concept: Generates a single PNG image of a full castlist
 * with tribe headers, player cards, avatars, and timezone info.
 */

import sharp from 'sharp';
import { getTribesForCastlist } from './castlistDataAccess.js';
import { getGuildPronouns, getGuildTimezones, getPlayer, getDSTOffset, loadDSTState } from './storage.js';
import { castlistManager } from './castlistManager.js';
import { sortCastlistMembers } from './castlistSorter.js';
import { capitalize } from './utils.js';

// ─── Layout Constants ───────────────────────────────────────────────────────

const CANVAS_WIDTH = 900;
const COLUMN_COUNT = 2;
const COLUMN_GAP = 20;
const MARGIN = 30;
const COLUMN_WIDTH = (CANVAS_WIDTH - MARGIN * 2 - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

// Tribe header
const TRIBE_HEADER_HEIGHT = 50;
const TRIBE_HEADER_FONT_SIZE = 22;
const TRIBE_HEADER_PADDING_TOP = 10;
const TRIBE_HEADER_RADIUS = 12;

// Player card
const CARD_HEIGHT = 80;
const CARD_PADDING = 10;
const AVATAR_SIZE = 60;
const AVATAR_RADIUS = 8;
const CARD_GAP = 6;

// Text sizes
const NAME_FONT_SIZE = 16;
const INFO_FONT_SIZE = 12;
const TIME_FONT_SIZE = 11;

// Colors
const BG_COLOR = '#1a1a2e';       // Dark navy background
const CARD_BG = '#16213e';         // Slightly lighter card bg
const TEXT_PRIMARY = '#e8e8e8';    // Main text
const TEXT_SECONDARY = '#a0a0b0';  // Info text (pronouns, age, tz)
const TEXT_MUTED = '#7a7a8a';      // Time text
const DEFAULT_TRIBE_COLOR = '#7ED321';

// ─── SVG Helpers ─────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strip emoji characters from text for SVG rendering.
 * SVG text elements can't render emoji natively so we strip them
 * to avoid missing-glyph boxes.
 */
function stripEmoji(str) {
  return String(str)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{200D}]/gu, '')
    .trim();
}

/**
 * Create an SVG text overlay for a player card
 */
function createPlayerTextSvg(name, pronouns, age, timezone, formattedTime, cardWidth, cardHeight) {
  const textX = AVATAR_SIZE + CARD_PADDING * 2 + 4;
  const usableWidth = cardWidth - textX - CARD_PADDING;

  // Build info line: "He/Him • 25 • EST / EDT"
  const infoParts = [pronouns, age, timezone].filter(Boolean);
  const infoLine = infoParts.join(' \u2022 '); // bullet separator

  // Build time line
  const timeLine = formattedTime ? `Local time: ${formattedTime}` : '';

  const lines = [];
  // Name - bold, primary color
  lines.push(`<text x="${textX}" y="${CARD_PADDING + 20}" font-family="Arial, Helvetica, sans-serif" font-size="${NAME_FONT_SIZE}" font-weight="bold" fill="${TEXT_PRIMARY}">${escapeXml(name)}</text>`);

  // Info line - secondary color
  if (infoLine) {
    lines.push(`<text x="${textX}" y="${CARD_PADDING + 38}" font-family="Arial, Helvetica, sans-serif" font-size="${INFO_FONT_SIZE}" fill="${TEXT_SECONDARY}">${escapeXml(infoLine)}</text>`);
  }

  // Time line - muted color
  if (timeLine) {
    const timeY = infoLine ? CARD_PADDING + 54 : CARD_PADDING + 38;
    lines.push(`<text x="${textX}" y="${timeY}" font-family="Arial, Helvetica, sans-serif" font-size="${TIME_FONT_SIZE}" fill="${TEXT_MUTED}">${escapeXml(timeLine)}</text>`);
  }

  return `<svg width="${cardWidth}" height="${cardHeight}" xmlns="http://www.w3.org/2000/svg">
    ${lines.join('\n    ')}
  </svg>`;
}

/**
 * Create an SVG for a tribe header
 */
function createTribeHeaderSvg(tribeName, memberCount, tribeColor, width) {
  const cleanName = stripEmoji(tribeName);
  const label = `${cleanName}  (${memberCount})`;
  return `<svg width="${width}" height="${TRIBE_HEADER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${TRIBE_HEADER_HEIGHT}" rx="${TRIBE_HEADER_RADIUS}" ry="${TRIBE_HEADER_RADIUS}" fill="${CARD_BG}"/>
    <rect x="0" y="0" width="4" height="${TRIBE_HEADER_HEIGHT}" rx="2" ry="2" fill="${tribeColor}"/>
    <text x="16" y="${TRIBE_HEADER_PADDING_TOP + TRIBE_HEADER_FONT_SIZE + 2}" font-family="Arial, Helvetica, sans-serif" font-size="${TRIBE_HEADER_FONT_SIZE}" font-weight="bold" fill="${TEXT_PRIMARY}">${escapeXml(label)}</text>
  </svg>`;
}

/**
 * Create an SVG for the castlist title
 */
function createTitleSvg(castlistName, totalPlayers, totalTribes) {
  const cleanName = stripEmoji(castlistName);
  return `<svg width="${CANVAS_WIDTH}" height="60" xmlns="http://www.w3.org/2000/svg">
    <text x="${CANVAS_WIDTH / 2}" y="32" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="bold" fill="${TEXT_PRIMARY}" text-anchor="middle">${escapeXml(cleanName)}</text>
    <text x="${CANVAS_WIDTH / 2}" y="52" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="${TEXT_SECONDARY}" text-anchor="middle">${totalPlayers} players across ${totalTribes} tribes</text>
  </svg>`;
}

/**
 * Create a rounded rectangle card background
 */
function createCardBgSvg(width, height, radius = 8) {
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${CARD_BG}"/>
  </svg>`;
}

// ─── Avatar Fetching ─────────────────────────────────────────────────────────

/**
 * Fetch a Discord avatar as a Sharp-compatible buffer
 */
async function fetchAvatar(member) {
  try {
    const avatarUrl = member.user.displayAvatarURL({ size: 128, extension: 'png' });
    const response = await fetch(avatarUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Resize and round the avatar
    return await sharp(buffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE)
      .png()
      .toBuffer();
  } catch (error) {
    console.warn(`[CASTLIST-IMG] Failed to fetch avatar for ${member.displayName}: ${error.message}`);
    // Generate a placeholder avatar with initial
    return await createPlaceholderAvatar(member.displayName);
  }
}

/**
 * Create a placeholder avatar with the user's initial
 */
async function createPlaceholderAvatar(displayName) {
  const initial = (displayName || '?')[0].toUpperCase();
  const svg = `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" rx="${AVATAR_RADIUS}" ry="${AVATAR_RADIUS}" fill="#5865F2"/>
    <text x="${AVATAR_SIZE / 2}" y="${AVATAR_SIZE / 2 + 8}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(initial)}</text>
  </svg>`;
  return await sharp(Buffer.from(svg)).resize(AVATAR_SIZE, AVATAR_SIZE).png().toBuffer();
}

/**
 * Create a rounded mask for avatars
 */
async function createAvatarMask() {
  const svg = `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" rx="${AVATAR_RADIUS}" ry="${AVATAR_RADIUS}" fill="white"/>
  </svg>`;
  return await sharp(Buffer.from(svg)).resize(AVATAR_SIZE, AVATAR_SIZE).png().toBuffer();
}

// ─── Data Collection ─────────────────────────────────────────────────────────

/**
 * Collect all player data for a tribe (mirrors castlistV2.js logic)
 */
async function collectTribePlayerData(tribe, guildId, pronounRoleIds, timezones) {
  await loadDSTState();
  const players = [];

  // Sort members using the same sorter as castlistV2
  const sortedMembers = sortCastlistMembers(tribe.members, tribe.castlistSettings, guildId);

  for (const member of sortedMembers) {
    // Pronouns
    const pronouns = member.roles.cache
      .filter(role => pronounRoleIds.includes(role.id))
      .map(role => role.name)
      .join(', ') || '';

    // Timezone
    let timezone = '';
    let formattedTime = '';
    const timezoneRole = member.roles.cache.find(role => timezones[role.id]);

    if (timezoneRole) {
      timezone = timezoneRole.name;
      try {
        const tzData = timezones[timezoneRole.id];
        let offset;
        if (tzData.timezoneId) {
          offset = getDSTOffset(tzData.timezoneId);
          if (offset === null) offset = tzData.offset;
        } else {
          offset = tzData.offset;
        }
        const now = new Date();
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        const targetTime = new Date(utcTime + (offset * 3600000));
        formattedTime = targetTime.toLocaleTimeString('en-US', {
          hour12: true, hour: '2-digit', minute: '2-digit'
        });
      } catch { formattedTime = ''; }
    }

    // Player storage data
    const playerData = await getPlayer(guildId, member.id);
    const age = playerData?.age || '';
    const displayName = capitalize(member.displayName);

    players.push({
      member,
      displayName,
      pronouns,
      age,
      timezone,
      formattedTime
    });
  }

  return players;
}

// ─── Layout Engine ───────────────────────────────────────────────────────────

/**
 * Calculate the layout positions for all tribes and players in a 2-column layout.
 * Returns an array of positioned elements to composite.
 */
function calculateLayout(tribeDataList) {
  // Track the Y position for each column
  const columnY = new Array(COLUMN_COUNT).fill(0);

  // Center single-tribe castlists instead of leaving an empty column
  const singleTribe = tribeDataList.length === 1;
  const centerOffset = singleTribe ? Math.floor((CANVAS_WIDTH - COLUMN_WIDTH) / 2) : 0;

  const elements = []; // { type: 'tribe_header'|'player_card', column, x, y, data }

  for (const tribe of tribeDataList) {
    // Find the shortest column to place this tribe
    const col = columnY.indexOf(Math.min(...columnY));
    const colX = singleTribe
      ? centerOffset
      : MARGIN + col * (COLUMN_WIDTH + COLUMN_GAP);

    // Tribe header
    elements.push({
      type: 'tribe_header',
      column: col,
      x: colX,
      y: columnY[col],
      data: tribe
    });
    columnY[col] += TRIBE_HEADER_HEIGHT + CARD_GAP;

    // Player cards
    for (const player of tribe.players) {
      elements.push({
        type: 'player_card',
        column: col,
        x: colX,
        y: columnY[col],
        data: { ...player, tribeColor: tribe.color }
      });
      columnY[col] += CARD_HEIGHT + CARD_GAP;
    }

    // Add spacing after tribe
    columnY[col] += 10;
  }

  const totalHeight = Math.max(...columnY);
  return { elements, totalHeight };
}

// ─── Image Compositing ───────────────────────────────────────────────────────

/**
 * Generate the castlist PNG image
 * @param {string} guildId - Discord guild ID
 * @param {string} castlistIdentifier - Castlist ID or name
 * @param {Object} client - Discord.js client
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateCastlistImage(guildId, castlistIdentifier, client) {
  console.log(`[CASTLIST-IMG] Generating image for castlist: ${castlistIdentifier}`);
  const startTime = Date.now();

  // ── 1. Load data ───────────────────────────────────────────────────────
  const tribes = await getTribesForCastlist(guildId, castlistIdentifier, client);
  if (!tribes || tribes.length === 0) {
    throw new Error('No tribes found for this castlist');
  }

  const pronounRoleIds = await getGuildPronouns(guildId);
  const timezones = await getGuildTimezones(guildId);

  // Get castlist name for title (use just "Castlist" for default)
  const castlistEntity = await castlistManager.getCastlist(guildId, castlistIdentifier);
  const castlistName = (castlistEntity?.id === 'default' || castlistIdentifier === 'default')
    ? 'Castlist'
    : (castlistEntity?.name || 'Castlist');

  // ── 2. Collect player data + fetch avatars concurrently per tribe ──────
  const tribeDataList = [];
  let totalPlayers = 0;

  for (const tribe of tribes) {
    const players = await collectTribePlayerData(tribe, guildId, pronounRoleIds, timezones);
    totalPlayers += players.length;

    // Fetch all avatars for this tribe concurrently
    const avatarPromises = players.map(p => fetchAvatar(p.member));
    const avatars = await Promise.all(avatarPromises);

    // Attach avatar buffers to player data
    players.forEach((p, i) => { p.avatarBuffer = avatars[i]; });

    // Parse tribe color
    let tribeColor = DEFAULT_TRIBE_COLOR;
    if (tribe.color) {
      if (typeof tribe.color === 'string' && tribe.color.startsWith('#')) {
        tribeColor = tribe.color;
      } else if (typeof tribe.color === 'number') {
        tribeColor = '#' + tribe.color.toString(16).padStart(6, '0');
      }
    }

    tribeDataList.push({
      name: tribe.name,
      emoji: tribe.emoji || '',
      color: tribeColor,
      memberCount: players.length,
      players
    });
  }

  console.log(`[CASTLIST-IMG] Collected ${totalPlayers} players across ${tribes.length} tribes`);

  // ── 3. Calculate layout ────────────────────────────────────────────────
  const TITLE_HEIGHT = 70;
  const { elements, totalHeight } = calculateLayout(tribeDataList);
  const canvasHeight = TITLE_HEIGHT + totalHeight + MARGIN;

  // ── 4. Create avatar mask (reused for all avatars) ─────────────────────
  const avatarMask = await createAvatarMask();

  // ── 5. Build composite layers ──────────────────────────────────────────
  const composites = [];

  // Title
  const titleSvg = createTitleSvg(castlistName, totalPlayers, tribes.length);
  composites.push({
    input: Buffer.from(titleSvg),
    top: 10,
    left: 0
  });

  // Build all card composites
  for (const el of elements) {
    const y = TITLE_HEIGHT + el.y;

    if (el.type === 'tribe_header') {
      const headerSvg = createTribeHeaderSvg(
        `${el.data.emoji} ${el.data.name} ${el.data.emoji}`,
        el.data.memberCount,
        el.data.color,
        COLUMN_WIDTH
      );
      composites.push({ input: Buffer.from(headerSvg), top: y, left: el.x });
    } else if (el.type === 'player_card') {
      const player = el.data;

      // Card background
      const cardBg = createCardBgSvg(COLUMN_WIDTH, CARD_HEIGHT);
      composites.push({ input: Buffer.from(cardBg), top: y, left: el.x });

      // Avatar (rounded with mask)
      try {
        const roundedAvatar = await sharp(player.avatarBuffer)
          .composite([{ input: avatarMask, blend: 'dest-in' }])
          .png()
          .toBuffer();

        composites.push({
          input: roundedAvatar,
          top: y + CARD_PADDING,
          left: el.x + CARD_PADDING
        });
      } catch (err) {
        console.warn(`[CASTLIST-IMG] Avatar composite failed for ${player.displayName}: ${err.message}`);
      }

      // Player text overlay
      const textSvg = createPlayerTextSvg(
        player.displayName,
        player.pronouns,
        player.age,
        player.timezone,
        player.formattedTime,
        COLUMN_WIDTH,
        CARD_HEIGHT
      );
      composites.push({ input: Buffer.from(textSvg), top: y, left: el.x });
    }
  }

  // ── 6. Composite everything onto the canvas ────────────────────────────
  const pngBuffer = await sharp({
    create: {
      width: CANVAS_WIDTH,
      height: canvasHeight,
      channels: 4,
      background: { r: 26, g: 26, b: 46, alpha: 1 } // BG_COLOR #1a1a2e
    }
  })
    .composite(composites)
    .png({ quality: 90 })
    .toBuffer();

  const elapsed = Date.now() - startTime;
  console.log(`[CASTLIST-IMG] Generated ${(pngBuffer.length / 1024).toFixed(1)}KB PNG in ${elapsed}ms`);

  return pngBuffer;
}

