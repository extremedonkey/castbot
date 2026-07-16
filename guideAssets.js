/**
 * Guide Assets — resolves committed guide images (img/guides/*.png) to Discord CDN URLs.
 *
 * The guides (staminaGuide.js) embed infographics via Media Gallery (type 12), which the
 * ButtonHandlerFactory's Components-V2 update path can only reference by URL — it cannot
 * upload file binaries (its webhook helpers strip `attachments`). So each committed PNG is
 * uploaded ONCE per environment to a central storage channel (same channel/pattern as the
 * Tips Gallery — fetched by ID via client.channels.fetch, so one URL works in every guild)
 * and the CDN URL is cached in the gitignored img/guides/guides.json.
 *
 * Cache invalidation is by sha256 content hash (NOT mtime — git clones reset mtimes and
 * would force spurious re-uploads). Regenerating a PNG changes its hash → next request
 * re-uploads and refreshes the cached URL for the current environment only.
 *
 * Contract: getGuideImageUrl NEVER throws — it returns null on any failure, and callers
 * must omit the Media Gallery component entirely (a gallery with a broken URL is a 400
 * from Discord; a guide page without its picture is fine).
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCurrentEnvironment, getEnvironmentLabel } from './tipsGalleryManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIDES_DIR = path.join(__dirname, 'img/guides');
const GUIDES_JSON = path.join(GUIDES_DIR, 'guides.json');

// Central storage channel in the CastBot home server (same one the Tips Gallery uses).
// Lives in the JSON so it can be repointed without a code change. Do NOT create channels
// per guild — that's exactly why the old per-guild tips uploader was disabled (RaP 0980).
const DEFAULT_CHANNEL = '1439277270400503870';

// Per-process memo (cleared on restart) + in-flight dedupe so two simultaneous
// cache-miss clicks don't double-upload.
const urlMemo = new Map();      // basename -> url
const inflight = new Map();     // basename -> Promise<string|null>

async function loadGuidesConfig() {
    try {
        return JSON.parse(await fs.readFile(GUIDES_JSON, 'utf8'));
    } catch {
        return { version: '1.0', channel: DEFAULT_CHANNEL, assets: {} };
    }
}

async function saveGuidesConfig(config) {
    config.lastUpdated = new Date().toISOString();
    await fs.writeFile(GUIDES_JSON, JSON.stringify(config, null, 2));
}

/**
 * Resolve a committed guide image to a Discord CDN URL, uploading once per environment
 * on first request (or when the file's content hash changes).
 * @param {import('discord.js').Client} client
 * @param {string} basename - e.g. 'player-stamina-drip.png' (must live in img/guides/)
 * @returns {Promise<string|null>} CDN URL, or null on any failure (omit the gallery)
 */
export async function getGuideImageUrl(client, basename) {
    if (!client || !basename) return null;
    if (urlMemo.has(basename)) return urlMemo.get(basename);
    if (inflight.has(basename)) return inflight.get(basename);

    const task = (async () => {
        try {
            const env = getCurrentEnvironment();
            const imagePath = path.join(GUIDES_DIR, basename);

            let fileBuffer;
            try {
                fileBuffer = await fs.readFile(imagePath);
            } catch {
                console.warn(`⚠️ guideAssets: ${basename} not found in img/guides/ — omitting gallery`);
                return null;
            }
            const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

            const config = await loadGuidesConfig();
            const asset = config.assets[basename] || { urls: {}, hashes: {} };

            if (asset.urls[env] && asset.hashes[env] === hash) {
                urlMemo.set(basename, asset.urls[env]);
                return asset.urls[env];
            }

            // Stale or never uploaded for this environment → upload to the storage channel.
            const channel = await client.channels.fetch(config.channel || DEFAULT_CHANNEL);
            const { AttachmentBuilder } = await import('discord.js');
            const message = await channel.send({
                content: `Guide asset ${basename} [${getEnvironmentLabel()}]`,
                files: [new AttachmentBuilder(fileBuffer, { name: basename })]
            });
            const url = message.attachments.first()?.url?.trim().replace(/&+$/, '');
            if (!url) return null;

            asset.urls[env] = url;
            asset.hashes[env] = hash;
            config.assets[basename] = asset;
            await saveGuidesConfig(config);

            console.log(`📤 guideAssets: uploaded ${basename} [${env}] → cached CDN URL`);
            urlMemo.set(basename, url);
            return url;
        } catch (error) {
            console.error(`❌ guideAssets: failed to resolve ${basename}:`, error.message);
            return null;
        } finally {
            inflight.delete(basename);
        }
    })();

    inflight.set(basename, task);
    return task;
}
