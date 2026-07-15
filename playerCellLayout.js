/**
 * Player Cell Layout — pure layout math for the per-cell player overlays
 * drawn on Safari map images (Map Explorer + Player Locations).
 *
 * No sharp / storage / Discord imports — keep it that way so unit tests
 * (tests/playerCellLayout.test.js) can import it directly.
 *
 * A cell renders up to MAX_BUBBLES "bubble head" rows (circular avatar with a
 * status ring + name), then falls back to the compact dot+name text rows,
 * then a "+N more" overflow line. With bubbleCount === 0 the numbers reproduce
 * the legacy text-only renderer exactly (regression-locked in tests).
 */

// Status ring / dot colors — green = initialized (active), amber = paused.
// Players on the map are always one of these two (uninitialized = not on map).
export const STATUS_COLORS = {
  initialized: '#4ade80',
  paused: '#f59e0b',
};

export const MAX_BUBBLES = 3;         // max avatar rows per cell
export const MIN_BUBBLE_CELL = 110;   // px — below this (either dim) render text-only

export function statusColor(status) {
  return STATUS_COLORS[status] ?? STATUS_COLORS.initialized;
}

/**
 * Truncate a display name to maxChars, appending an ellipsis.
 * Truncate BEFORE XML-escaping — truncating escaped text can split an entity.
 */
export function truncateName(name, maxChars) {
  const str = String(name);
  if (maxChars > 0 && str.length > maxChars) {
    return str.substring(0, maxChars - 1) + '…';
  }
  return str;
}

/**
 * Plan the vertical layout of one occupied cell.
 *
 * @param {number} playerCount - players at this coordinate
 * @param {number} cellW - cell width in px
 * @param {number} cellH - cell height in px
 * @returns {{
 *   fontSize: number, lineHeight: number,
 *   bubbleRowHeight: number, avatarOuter: number, ringWidth: number,
 *   bubbleCount: number, textCount: number, overflow: number,
 *   blockHeight: number, startY: number
 * }} startY is the TOP of the centered block (not a text baseline).
 */
export function planCellLayout(playerCount, cellW, cellH) {
  // Text metrics — identical to the legacy renderer
  const fontSize = Math.min(22, Math.floor(cellW / 7));
  const lineHeight = fontSize + 6;
  const availableH = cellH - 10;

  // Bubble metrics — a bubble row is two text lines tall
  const bubbleRowHeight = 2 * lineHeight;
  const avatarOuter = bubbleRowHeight - 4;
  const ringWidth = Math.max(2, Math.floor(avatarOuter / 24));

  let bubbleCount = (cellW >= MIN_BUBBLE_CELL && cellH >= MIN_BUBBLE_CELL)
    ? Math.min(MAX_BUBBLES, playerCount)
    : 0;
  // Shrink until the bubbles fit, reserving one text line if players remain
  while (
    bubbleCount > 0 &&
    bubbleCount * bubbleRowHeight + (playerCount > bubbleCount ? lineHeight : 0) > availableH
  ) {
    bubbleCount--;
  }

  const remaining = playerCount - bubbleCount;
  const maxTextLines = Math.max(0, Math.floor((availableH - bubbleCount * bubbleRowHeight) / lineHeight));
  let textCount = Math.min(remaining, maxTextLines);
  let overflow = remaining - textCount;
  // Legacy rule: give up one name row to make room for the "+N more" line
  if (overflow > 0 && textCount > 1) {
    textCount--;
    overflow++;
  }

  const totalTextLines = textCount + (overflow > 0 ? 1 : 0);
  const blockHeight = bubbleCount * bubbleRowHeight + totalTextLines * lineHeight;
  const startY = Math.floor((cellH - blockHeight) / 2);

  return {
    fontSize, lineHeight,
    bubbleRowHeight, avatarOuter, ringWidth,
    bubbleCount, textCount, overflow,
    blockHeight, startY,
  };
}
