/**
 * Map image pipeline (RaP 0894 Phase 2) — download a source image and produce the
 * bordered, gridded map image on disk. Extracted from createMapGridWithCustomImage's
 * inline pipeline so section adds share the exact same transforms; the original
 * create path intentionally still carries its own copy until it has been
 * smoke-verified against this one (then it delegates here and the copy dies).
 *
 * Disk + sharp only — NO Discord calls, NO safariContent writes. The section origin
 * (colOffset/rowOffset) flows into MapGridSystem so grid labels show TRUE map
 * coordinates (e.g. a section starting at H1 gets columns H, I, J…).
 */

import sharp from 'sharp';
sharp.cache(false); // match mapExplorer — ~0% hit rate, starves the 448MB prod box (RaP 0903)
import { promises as fs } from 'fs';
import path from 'path';
import MapGridSystem from '../../scripts/map-tests/mapGridSystem.js';

/** Same source-image ceilings as the map-create pipeline. */
export const MAX_SOURCE_MB = 15;
export const MAX_MEGAPIXELS = 8;
export const OUTPUT_JPEG_THRESHOLD = 7 * 1024 * 1024;

/**
 * Download + grid a map image.
 *
 * @param {Object} p
 * @param {string} p.imageUrl - Discord CDN source URL
 * @param {number} p.gridWidth - section columns
 * @param {number} p.gridHeight - section rows
 * @param {number} [p.colOffset=0] - section origin column (0-based)
 * @param {number} [p.rowOffset=0] - section origin row (0-based)
 * @param {string} p.outputDir - directory for the gridded image (created if missing)
 * @param {string} p.outputBasename - filename without extension
 * @returns {Promise<{outputPath: string, gridSystem: MapGridSystem, originalJpegBuffer: Buffer, notes: string[]}>}
 * @throws {Error} with a user-presentable message on download/size failures
 */
export async function processMapImageWithGrid({ imageUrl, gridWidth, gridHeight, colOffset = 0, rowOffset = 0, outputDir, outputBasename }) {
    const notes = [];

    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const downloadSizeMB = imageBuffer.length / (1024 * 1024);
    if (downloadSizeMB > MAX_SOURCE_MB) {
        throw new Error(`Source image too large (${downloadSizeMB.toFixed(1)}MB). Please use an image under ${MAX_SOURCE_MB}MB.`);
    }

    const metadata = await sharp(imageBuffer).metadata();
    const megapixels = (metadata.width * metadata.height) / 1_000_000;
    notes.push(`✅ Image downloaded: ${metadata.width}x${metadata.height} (${megapixels.toFixed(1)}MP, ${downloadSizeMB.toFixed(1)}MB)`);

    // Downscale if over the megapixel ceiling to prevent oversized grid output
    let processedBuffer = imageBuffer;
    if (megapixels > MAX_MEGAPIXELS) {
        const scale = Math.sqrt(MAX_MEGAPIXELS / megapixels);
        const newWidth = Math.round(metadata.width * scale);
        const newHeight = Math.round(metadata.height * scale);
        processedBuffer = await sharp(imageBuffer)
            .resize(newWidth, newHeight, { fit: 'inside' })
            .jpeg({ quality: 90 })
            .toBuffer();
        notes.push(`📐 Image downscaled to ${newWidth}x${newHeight} (was ${metadata.width}x${metadata.height})`);
    }

    await fs.mkdir(outputDir, { recursive: true });
    const tempMapPath = path.join(outputDir, `temp_${Date.now()}.png`);
    await sharp(processedBuffer).toFile(tempMapPath);

    // let (not const): the >7MB JPEG re-encode branch below reassigns this path
    let outputPath = path.join(outputDir, `${outputBasename}.png`);

    const gridSystem = new MapGridSystem(tempMapPath, {
        gridWidth,
        gridHeight,
        gridSize: Math.max(gridWidth, gridHeight), // backwards compatibility
        colOffset,
        rowOffset,
        borderSize: 80,
        lineWidth: 4,
        fontSize: 40,
        labelStyle: 'standard'
    });

    try {
        await gridSystem.initialize();
        const svgBuffer = Buffer.from(gridSystem.generateGridOverlaySVG());

        // White border canvas → map inset at (border, border) → grid overlay on top
        await sharp({
            create: {
                width: gridSystem.totalWidth,
                height: gridSystem.totalHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        })
            .composite([
                { input: tempMapPath, top: gridSystem.options.borderSize, left: gridSystem.options.borderSize },
                { input: svgBuffer, top: 0, left: 0 }
            ])
            .png({ compressionLevel: 9, palette: true })
            .toFile(outputPath);

        const fileStats = await fs.stat(outputPath);
        if (fileStats.size > OUTPUT_JPEG_THRESHOLD) {
            const jpegPath = outputPath.replace('.png', '.jpg');
            await sharp(outputPath).jpeg({ quality: 85 }).toFile(jpegPath);
            await fs.unlink(outputPath);
            outputPath = jpegPath;
            notes.push(`⚠️ Gridded image exceeded 7MB — re-encoded as JPEG`);
        }
        notes.push('✅ Generated map section with grid overlay');
    } finally {
        await fs.unlink(tempMapPath).catch(() => {});
    }

    // Original as JPEG for the storage-channel archive (same as the create flow)
    const originalJpegBuffer = megapixels > MAX_MEGAPIXELS
        ? processedBuffer
        : await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();

    return { outputPath, gridSystem, originalJpegBuffer, notes };
}
