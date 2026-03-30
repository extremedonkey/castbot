import sharp from 'sharp';

// ─── Layout constants ───────────────────────────────────────
const BORDER = 80;
const BG        = '#1a1a2e';
const CELL_BG   = '#16213e';
const CELL_OCC  = '#1e2d50';   // Occupied cell — slightly brighter
const GRID_LINE = '#2a2a4a';
const TEXT_PRI  = '#e8e8e8';
const TEXT_SEC  = '#a0a0b0';
const TEXT_MUT  = '#7a7a8a';
const ACCENT    = '#5865F2';   // Discord blurple
const PLAYER_DOT = '#4ade80';  // Green dot next to name

// ─── Helpers ────────────────────────────────────────────────
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
 * Generate a visual player location map image.
 *
 * @param {object} params
 * @param {number} params.gridWidth   - columns (e.g. 7)
 * @param {number} params.gridHeight  - rows    (e.g. 7)
 * @param {Map}    params.playerLocations - Map<userId, {coordinate, displayName, ...}>
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function generatePlayerLocationImage({ gridWidth, gridHeight, playerLocations }) {
  const cols = gridWidth;
  const rows = gridHeight;

  // ─── Sizing ─────────────────────────────────────────────
  const cellW = 180;
  const cellH = 120;
  const headerH = 40;   // row for column letters
  const labelW  = 40;   // column for row numbers
  const gap = 2;        // grid line width

  const canvasW = BORDER * 2 + labelW + cols * (cellW + gap) - gap;
  const canvasH = BORDER * 2 + headerH + rows * (cellH + gap) - gap;

  // ─── Group players by coordinate ────────────────────────
  const cellPlayers = {};
  for (const [, loc] of playerLocations) {
    const coord = loc.coordinate;
    if (!coord) continue;
    if (!cellPlayers[coord]) cellPlayers[coord] = [];
    cellPlayers[coord].push(stripEmoji(escapeXml(loc.displayName || 'Unknown')));
  }

  // ─── Build composites ──────────────────────────────────
  const composites = [];

  // Column headers (A, B, C …)
  for (let c = 0; c < cols; c++) {
    const letter = String.fromCharCode(65 + c);
    const x = BORDER + labelW + c * (cellW + gap);
    const y = BORDER;
    composites.push({
      input: Buffer.from(`<svg width="${cellW}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">
        <text x="${cellW / 2}" y="${headerH - 10}" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold"
          fill="${TEXT_SEC}">${letter}</text>
      </svg>`),
      top: y,
      left: x
    });
  }

  // Row numbers (1, 2, 3 …)
  for (let r = 0; r < rows; r++) {
    const num = String(r + 1);
    const x = BORDER;
    const y = BORDER + headerH + r * (cellH + gap);
    composites.push({
      input: Buffer.from(`<svg width="${labelW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">
        <text x="${labelW / 2}" y="${cellH / 2 + 6}" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold"
          fill="${TEXT_SEC}">${num}</text>
      </svg>`),
      top: y,
      left: x
    });
  }

  // Grid cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const coord = String.fromCharCode(65 + c) + (r + 1);
      const x = BORDER + labelW + c * (cellW + gap);
      const y = BORDER + headerH + r * (cellH + gap);
      const players = cellPlayers[coord] || [];
      const hasPlayers = players.length > 0;

      // Cell background
      const bg = hasPlayers ? CELL_OCC : CELL_BG;
      composites.push({
        input: await sharp({
          create: { width: cellW, height: cellH, channels: 4, background: bg }
        }).png().toBuffer(),
        top: y,
        left: x
      });

      // Coordinate label (top-left, small, muted)
      composites.push({
        input: Buffer.from(`<svg width="${cellW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">
          <text x="8" y="16" font-family="Arial, Helvetica, sans-serif"
            font-size="11" fill="${TEXT_MUT}">${coord}</text>
        </svg>`),
        top: y,
        left: x
      });

      if (hasPlayers) {
        // Player count badge (top-right)
        const badge = `${players.length}`;
        composites.push({
          input: Buffer.from(`<svg width="${cellW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">
            <circle cx="${cellW - 16}" cy="14" r="10" fill="${ACCENT}"/>
            <text x="${cellW - 16}" y="18" text-anchor="middle"
              font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="bold"
              fill="#ffffff">${badge}</text>
          </svg>`),
          top: y,
          left: x
        });

        // Player names (stacked, with green dots)
        const maxVisible = 3;
        const nameLines = [];
        const visible = players.slice(0, maxVisible);
        const overflow = players.length - maxVisible;

        for (let i = 0; i < visible.length; i++) {
          // Truncate long names
          let name = visible[i];
          if (name.length > 14) name = name.substring(0, 13) + '…';
          const ny = 38 + i * 22;
          nameLines.push(
            `<circle cx="12" cy="${ny - 4}" r="3" fill="${PLAYER_DOT}"/>` +
            `<text x="20" y="${ny}" font-family="Arial, Helvetica, sans-serif"
              font-size="14" fill="${TEXT_PRI}">${name}</text>`
          );
        }

        if (overflow > 0) {
          const ny = 38 + visible.length * 22;
          nameLines.push(
            `<text x="20" y="${ny}" font-family="Arial, Helvetica, sans-serif"
              font-size="12" fill="${TEXT_MUT}">+${overflow} more</text>`
          );
        }

        composites.push({
          input: Buffer.from(`<svg width="${cellW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">
            ${nameLines.join('\n')}
          </svg>`),
          top: y,
          left: x
        });
      }
    }
  }

  // Title bar at top
  composites.push({
    input: Buffer.from(`<svg width="${canvasW}" height="${BORDER}" xmlns="http://www.w3.org/2000/svg">
      <text x="${canvasW / 2}" y="${BORDER - 20}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold"
        fill="${TEXT_PRI}">Player Locations</text>
    </svg>`),
    top: 0,
    left: 0
  });

  // Player count summary at bottom
  const totalPlayers = playerLocations.size;
  const occupiedCells = Object.keys(cellPlayers).length;
  composites.push({
    input: Buffer.from(`<svg width="${canvasW}" height="${BORDER}" xmlns="http://www.w3.org/2000/svg">
      <text x="${canvasW / 2}" y="30" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="16"
        fill="${TEXT_SEC}">${totalPlayers} player${totalPlayers !== 1 ? 's' : ''} across ${occupiedCells} cell${occupiedCells !== 1 ? 's' : ''}</text>
    </svg>`),
    top: canvasH - BORDER,
    left: 0
  });

  // ─── Composite everything ──────────────────────────────
  const pngBuffer = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: BG
    }
  })
    .composite(composites)
    .png({ quality: 90 })
    .toBuffer();

  console.log(`📸 Generated player location image: ${canvasW}x${canvasH}, ${(pngBuffer.length / 1024).toFixed(0)}KB`);
  return pngBuffer;
}
