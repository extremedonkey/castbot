import sharp from 'sharp';

// Same border as map generation in mapExplorer.js
const BORDER = 80;

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
  const cellPlayers = {};
  for (const [, loc] of playerLocations) {
    const coord = loc.coordinate;
    if (!coord) continue;
    if (!cellPlayers[coord]) cellPlayers[coord] = [];
    cellPlayers[coord].push(stripEmoji(loc.displayName || 'Unknown'));
  }

  // ─── Build overlays ───────────────────────────────────
  const overlays = [];

  const coordToPosition = (coord) => {
    const col = coord.charCodeAt(0) - 65;
    const row = parseInt(coord.substring(1)) - 1;
    return {
      left: Math.floor(BORDER + (col * cellW)),
      top: Math.floor(BORDER + (row * cellH))
    };
  };

  for (const [coord, players] of Object.entries(cellPlayers)) {
    const pos = coordToPosition(coord);
    const w = Math.floor(cellW);
    const h = Math.floor(cellH);

    // Semi-transparent dark background behind text for readability
    overlays.push({
      input: await sharp({
        create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.55 } }
      }).png().toBuffer(),
      top: pos.top,
      left: pos.left
    });

    // Build SVG with player names
    const fontSize = Math.min(16, Math.floor(cellW / 10));
    const lineHeight = fontSize + 6;
    const maxLines = Math.floor((h - 10) / lineHeight);
    const visible = players.slice(0, maxLines);
    const overflow = players.length - visible.length;

    // If overflow, show one fewer name to make room for "+N more"
    if (overflow > 0 && visible.length > 1) {
      visible.pop();
    }

    const textLines = [];
    visible.forEach((name, i) => {
      let displayName = escapeXml(name);
      // Truncate to fit cell width (~0.55 * fontSize per char)
      const maxChars = Math.floor(w / (fontSize * 0.55)) - 2;
      if (displayName.length > maxChars) displayName = displayName.substring(0, maxChars - 1) + '…';
      const y = 8 + fontSize + i * lineHeight;
      textLines.push(
        `<circle cx="8" cy="${y - fontSize * 0.3}" r="3" fill="#4ade80"/>` +
        `<text x="16" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff">${displayName}</text>`
      );
    });

    const actualOverflow = players.length - visible.length;
    if (actualOverflow > 0) {
      const y = 8 + fontSize + visible.length * lineHeight;
      textLines.push(
        `<text x="16" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(10, fontSize - 2)}" fill="#a0a0b0">+${actualOverflow} more</text>`
      );
    }

    overlays.push({
      input: Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${textLines.join('')}</svg>`),
      top: pos.top,
      left: pos.left
    });
  }

  // ─── Composite onto map ────────────────────────────────
  const result = await sharp(imageBuffer)
    .composite(overlays)
    .jpeg({ quality: 85 })
    .toBuffer();

  console.log(`📸 Generated player location image: ${(result.length / 1024).toFixed(0)}KB, ${Object.keys(cellPlayers).length} occupied cells`);
  return result;
}
