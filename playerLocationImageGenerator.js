import sharp from 'sharp';
// No libvips cache — ~0% hit rate, starves the 448MB prod box (RaP 0903)
sharp.cache(false);
import { planCellLayout, statusColor, truncateName } from './playerCellLayout.js';

// Same border as map generation in mapExplorer.js
const BORDER = 80;

// Per-avatar CDN fetch cap — a slow avatar degrades to a placeholder, never stalls the image
const AVATAR_FETCH_TIMEOUT_MS = 4000;

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripEmoji(str) {
  return String(str)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/[\u{200D}]/gu, '')
    .trim();
}

// ─── Shared cell-overlay builders (used here AND by mapExplorer.generateBlacklistOverlay) ───

/**
 * Group playerLocations entries by coordinate.
 * @param {Map<string, {coordinate, displayName, avatar, status}>} playerLocations
 * @returns {Object<string, Array<{name, avatarUrl, status}>>} coord -> players
 */
export function groupPlayersByCell(playerLocations) {
  const cellPlayers = {};
  for (const [, loc] of playerLocations) {
    if (!loc.coordinate) continue;
    // Skip Unknown Players (left server) from map image
    if (loc.displayName === 'Unknown Player') continue;
    if (!cellPlayers[loc.coordinate]) cellPlayers[loc.coordinate] = [];
    cellPlayers[loc.coordinate].push({
      name: stripEmoji(loc.displayName || 'Unknown'),
      avatarUrl: loc.avatar || null,
      status: loc.status || 'initialized'
    });
  }
  return cellPlayers;
}

/**
 * Build one circular avatar bubble with a status ring.
 * Ring = solid status-color disc; avatar is circle-masked (dest-in) and
 * composited centered on it, leaving ringWidth of disc visible as the ring.
 * Any failure (no URL, fetch/decode error, timeout) falls back to an
 * initial-letter placeholder wearing the same ring.
 * @returns {Promise<Buffer>} PNG buffer, avatarOuter x avatarOuter
 */
async function createStatusBubble({ avatarUrl, displayName, status, outer, ringWidth }) {
  const ringColor = statusColor(status);
  const inner = outer - ringWidth * 2;
  const discSvg = `<svg width="${outer}" height="${outer}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${outer / 2}" cy="${outer / 2}" r="${outer / 2}" fill="${ringColor}"/>
  </svg>`;

  try {
    if (!avatarUrl) throw new Error('no avatar URL');
    const response = await fetch(avatarUrl, { signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const avatarBuffer = Buffer.from(await response.arrayBuffer());

    const circleMask = await sharp(Buffer.from(
      `<svg width="${inner}" height="${inner}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${inner / 2}" cy="${inner / 2}" r="${inner / 2}" fill="white"/>
      </svg>`
    )).png().toBuffer();

    const roundedAvatar = await sharp(avatarBuffer)
      .resize(inner, inner, { fit: 'cover' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    return await sharp(Buffer.from(discSvg))
      .composite([{ input: roundedAvatar, top: ringWidth, left: ringWidth }])
      .png()
      .toBuffer();
  } catch (error) {
    console.warn(`📸 Avatar bubble fallback for ${displayName}: ${error.message}`);
    const initial = escapeXml((String(displayName || '?').trim()[0] || '?').toUpperCase());
    const placeholderSvg = `<svg width="${outer}" height="${outer}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${outer / 2}" cy="${outer / 2}" r="${outer / 2}" fill="${ringColor}"/>
      <circle cx="${outer / 2}" cy="${outer / 2}" r="${inner / 2}" fill="#5865F2"/>
      <text x="${outer / 2}" y="${Math.round(outer / 2 + inner * 0.18)}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.floor(inner * 0.5)}" font-weight="bold" fill="white" text-anchor="middle">${initial}</text>
    </svg>`;
    return await sharp(Buffer.from(placeholderSvg)).png().toBuffer();
  }
}

/**
 * Build the composite overlays for one occupied cell: optional dark backdrop,
 * up to MAX_BUBBLES avatar-bubble rows (status ring + name), remaining players
 * as status-dot text rows, then "+N more". Layout math: planCellLayout().
 *
 * @param {object} params
 * @param {Array<{name, avatarUrl, status}>} params.players
 * @param {number} params.left - cell left edge on the map (px)
 * @param {number} params.top - cell top edge on the map (px)
 * @param {number} params.cellW
 * @param {number} params.cellH
 * @param {boolean} [params.drawBackdrop=true] - dark rgba(0,0,0,0.55) behind the cell
 * @returns {Promise<Array<{input: Buffer, top: number, left: number}>>}
 */
export async function buildPlayerCellOverlays({ players, left, top, cellW, cellH, drawBackdrop = true }) {
  const overlays = [];
  if (!players?.length) return overlays;

  if (drawBackdrop) {
    overlays.push({
      input: await sharp({
        create: { width: cellW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.55 } }
      }).png().toBuffer(),
      top,
      left
    });
  }

  const plan = planCellLayout(players.length, cellW, cellH);
  const { fontSize, lineHeight, bubbleRowHeight, avatarOuter, ringWidth, bubbleCount, textCount, overflow, startY } = plan;

  // Bubble rows — avatars fetched concurrently
  const bubblePlayers = players.slice(0, bubbleCount);
  const bubbles = await Promise.all(bubblePlayers.map(p =>
    createStatusBubble({ avatarUrl: p.avatarUrl, displayName: p.name, status: p.status, outer: avatarOuter, ringWidth })
  ));

  const svgParts = [];
  const bubbleTextX = 6 + avatarOuter + 8;

  bubblePlayers.forEach((p, i) => {
    const rowTop = startY + i * bubbleRowHeight;
    overlays.push({
      input: bubbles[i],
      top: top + rowTop + Math.floor((bubbleRowHeight - avatarOuter) / 2),
      left: left + 6
    });
    const maxChars = Math.floor((cellW - bubbleTextX - 8) / (fontSize * 0.62));
    const name = escapeXml(truncateName(p.name, maxChars));
    const baseline = rowTop + Math.floor(bubbleRowHeight / 2) + Math.round(fontSize * 0.35);
    svgParts.push(
      `<text x="${bubbleTextX}" y="${baseline}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff">${name}</text>`
    );
  });

  // Compact text rows (legacy format, dot now colored by status)
  const textPlayers = players.slice(bubbleCount, bubbleCount + textCount);
  const textTop = startY + bubbleCount * bubbleRowHeight;
  textPlayers.forEach((p, j) => {
    const y = textTop + j * lineHeight + fontSize;
    const maxChars = Math.floor((cellW - 24) / (fontSize * 0.62));
    const name = escapeXml(truncateName(p.name, maxChars));
    svgParts.push(
      `<circle cx="8" cy="${y - fontSize * 0.3}" r="3" fill="${statusColor(p.status)}"/>` +
      `<text x="16" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff">${name}</text>`
    );
  });

  if (overflow > 0) {
    const y = textTop + textCount * lineHeight + fontSize;
    svgParts.push(
      `<text x="16" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(10, fontSize - 2)}" fill="#a0a0b0">+${overflow} more</text>`
    );
  }

  if (svgParts.length) {
    overlays.push({
      input: Buffer.from(`<svg width="${cellW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">${svgParts.join('')}</svg>`),
      top,
      left
    });
  }

  return overlays;
}

/**
 * Generate a player location overlay on the actual map image.
 * Fetches the guild's uploaded map from Discord CDN, then composites
 * player names onto each occupied cell.
 *
 * @param {object} params
 * @param {string} params.guildId
 * @param {number} params.gridWidth
 * @param {number} params.gridHeight
 * @param {Map}    params.playerLocations - Map<userId, {coordinate, displayName}>
 * @param {object} params.client - Discord client
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function generatePlayerLocationImage({ guildId, gridWidth, gridHeight, playerLocations, client }) {
  const { loadSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  const mapData = safariData[guildId]?.maps?.[activeMapId];

  if (!mapData?.discordImageUrl) {
    throw new Error('No map image available');
  }

  // ─── Fetch fresh map image (same pattern as generateBlacklistOverlay) ───
  let freshImageUrl = mapData.discordImageUrl;
  try {
    if (mapData.mapStorageMessageId && mapData.mapStorageChannelId) {
      const { DiscordRequest } = await import('./utils.js');
      const message = await DiscordRequest(
        `channels/${mapData.mapStorageChannelId}/messages/${mapData.mapStorageMessageId}`,
        { method: 'GET' }
      );
      if (message?.attachments?.[0]?.url) {
        freshImageUrl = message.attachments[0].url.trim().replace(/&+$/, '');
      }
    }
  } catch (e) {
    freshImageUrl = mapData.discordImageUrl.trim().replace(/&+$/, '');
  }

  const imageResponse = await fetch(freshImageUrl);
  if (!imageResponse.ok) throw new Error(`Failed to fetch map: ${imageResponse.status}`);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  // ─── Calculate grid geometry ───────────────────────────
  const metadata = await sharp(imageBuffer).metadata();
  const innerWidth = metadata.width - (BORDER * 2);
  const innerHeight = metadata.height - (BORDER * 2);
  const cellW = innerWidth / gridWidth;
  const cellH = innerHeight / gridHeight;

  console.log(`📸 Player location image: ${metadata.width}x${metadata.height}, grid ${gridWidth}x${gridHeight}, cell ${Math.round(cellW)}x${Math.round(cellH)}`);

  // ─── Group players by coordinate ───────────────────────
  const cellPlayers = groupPlayersByCell(playerLocations);

  // ─── Build overlays (avatar bubbles + status-dot text rows per cell) ───
  const coordToPosition = (coord) => {
    const col = coord.charCodeAt(0) - 65;
    const row = parseInt(coord.substring(1)) - 1;
    return {
      left: Math.floor(BORDER + (col * cellW)),
      top: Math.floor(BORDER + (row * cellH))
    };
  };

  const cellOverlayArrays = await Promise.all(
    Object.entries(cellPlayers).map(([coord, players]) => {
      const pos = coordToPosition(coord);
      return buildPlayerCellOverlays({
        players,
        left: pos.left,
        top: pos.top,
        cellW: Math.floor(cellW),
        cellH: Math.floor(cellH),
        drawBackdrop: true
      });
    })
  );
  const overlays = cellOverlayArrays.flat();

  // ─── Composite onto map ────────────────────────────────
  const result = await sharp(imageBuffer)
    .composite(overlays)
    .jpeg({ quality: 85 })
    .toBuffer();

  console.log(`📸 Generated player location image: ${(result.length / 1024).toFixed(0)}KB, ${Object.keys(cellPlayers).length} occupied cells`);
  return result;
}
