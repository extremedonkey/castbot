/**
 * mapFogBuilder.js — memory-lean fog-of-war map generation.
 *
 * Replaces the old per-coordinate createFogOfWarMap (deleted from mapExplorer.js), which for
 * every coordinate regenerated N-1 identical fog overlay PNGs and composited all of them onto
 * a full decode of the map (~2,350 sharp pipelines and 50-70MB transient per coordinate on a
 * 7x7 grid — the direct trigger of the 2026-07-17 prod OOM kills; see RaP 0896).
 *
 * New approach, one builder per run:
 *   1. Edge-aligned integer cell rects (utils/gridRects.js) — cells tile exactly, so a cell's
 *      fog overlay and its "visible" paste cover identical pixels.
 *   2. Fog overlay buffers cached by size (≤4 distinct sizes per grid).
 *   3. A fully-fogged base image rendered ONCE to a temp PNG (always plain .png() — a lossless
 *      intermediate; palette:true would re-quantize fog blends and break pixel-identity).
 *   4. render(coord) = crop the original at that cell's rect, paste onto the fogged base.
 *      Per-coordinate cost drops to one decode + one small composite + one encode.
 *
 * sharp.concurrency is pinned to 1 for the builder's lifetime (halves libvips thread scratch
 * on the 2-vCPU prod box) and restored in cleanup(). Callers MUST cleanup() in a finally.
 */
import sharp from 'sharp';
import { promises as fs } from 'fs';
import { buildCellRects } from './utils/gridRects.js';

const FOG_BACKGROUND = { r: 0, g: 0, b: 0, alpha: 0.7 }; // matches legacy 70% black fog

/**
 * @param {string} mapImagePath - the bordered grid map on disk (PNG, or JPEG for the >7MB variant)
 * @param {Object} gridSystem - initialized MapGridSystem (metadata = INNER image dimensions)
 * @param {string[]} allCoordinates - every coordinate label on the map (e.g. ['A1', ..., 'G7'])
 * @returns {Promise<{render: (coord: string) => Promise<Buffer>, cleanup: () => Promise<void>}>}
 */
export async function createFogBuilder(mapImagePath, gridSystem, allCoordinates) {
  const prevConcurrency = sharp.concurrency();
  sharp.concurrency(1);

  const foggedBasePath = `${mapImagePath}.fogbase.png`;
  let cleaned = false;

  try {
    const rectFor = buildCellRects({
      innerWidth: gridSystem.metadata.width,
      innerHeight: gridSystem.metadata.height,
      gridWidth: gridSystem.options.gridWidth,
      gridHeight: gridSystem.options.gridHeight,
      borderSize: gridSystem.options.borderSize
    });

    // Coordinate label -> integer rect in the bordered image's pixel space
    const rects = new Map();
    for (const coord of allCoordinates) {
      const pos = gridSystem.parseCoordinate(coord);
      rects.set(coord, rectFor(pos.x, pos.y));
    }

    // Fog overlay buffers cached by size — edge-aligned rects yield ≤4 distinct sizes per grid
    const overlayCache = new Map();
    async function fogOverlayFor(rect) {
      const key = `${rect.width}x${rect.height}`;
      if (!overlayCache.has(key)) {
        overlayCache.set(key, await sharp({
          create: {
            width: rect.width,
            height: rect.height,
            channels: 4,
            background: FOG_BACKGROUND
          }
        }).png().toBuffer());
      }
      return overlayCache.get(key);
    }

    // Fully-fogged base, rendered once
    const allOverlays = [];
    for (const rect of rects.values()) {
      allOverlays.push({ input: await fogOverlayFor(rect), top: rect.top, left: rect.left });
    }
    await sharp(mapImagePath).composite(allOverlays).png().toFile(foggedBasePath);

    return {
      async render(coord) {
        const rect = rects.get(coord);
        if (!rect) throw new Error(`Unknown coordinate ${coord} in fog builder`);
        // Crop of the ORIGINAL map at exactly the rect its fog overlay covered — the opaque
        // paste replaces that cell's fog precisely (canvas is opaque; edge-aligned = no seams)
        const visibleCell = await sharp(mapImagePath)
          .extract(rect)
          .png()
          .toBuffer();
        return sharp(foggedBasePath)
          .composite([{ input: visibleCell, top: rect.top, left: rect.left }])
          .png()
          .toBuffer();
      },
      async cleanup() {
        if (cleaned) return;
        cleaned = true;
        sharp.concurrency(prevConcurrency);
        await fs.unlink(foggedBasePath).catch(() => {});
      }
    };
  } catch (error) {
    // Builder construction failed — don't leave concurrency pinned or the temp file behind
    sharp.concurrency(prevConcurrency);
    await fs.unlink(foggedBasePath).catch(() => {});
    throw error;
  }
}
