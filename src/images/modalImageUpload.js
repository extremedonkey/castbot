/**
 * Modal image upload — File Upload (type 19) handling for image fields.
 *
 * Part of the Image Uploads pilot (Settings → General → Image Uploads =
 * 🖼️ Upload Component). When a guild opts in, image-URL text inputs become
 * File Upload components; on submit the uploaded file is re-hosted in the
 * #🗺️castbot-images storage channel and the resulting CDN URL is stored in the
 * SAME field the paste-URL flow uses (plain URL string — full backwards compat).
 *
 * Guards (docs/incidents/01-MapImageOversizeOOM.md): content-type must be image/*,
 * size capped at 15MB (checked via Discord's attachment metadata BEFORE download,
 * re-checked on the downloaded buffer). No sharp processing happens here — bytes
 * are re-posted verbatim — so no memory-guard preflight is needed.
 *
 * Pure helpers (intent extraction, validation, filenames) live at top level with
 * no heavy imports so they're unit-testable (tests/modalImageUpload.test.js).
 */

/** Custom_id of the File Upload component emitted by upload-mode modals. Distinct
 * from the text field's 'image' on purpose: parseModalSubmission's generic path
 * would otherwise store the raw attachment SNOWFLAKE as the image "URL". */
export const IMAGE_UPLOAD_COMPONENT_ID = 'image_upload';

export const MAX_UPLOAD_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB — incident-01 download guard

/**
 * Pure — walk modal-submit components (Label wrappers nest the real component in
 * `.component`; ActionRows in `.components`) and return the first component of
 * the given type, or null.
 * @param {Array} components - modal submit data.components
 * @param {number} type - component type to find (e.g. 19)
 * @returns {Object|null}
 */
export function findModalComponentByType(components, type) {
    for (const row of components || []) {
        const candidates = row?.component ? [row.component] : (row?.components || []);
        if (row?.type === type) return row;
        for (const comp of candidates) {
            if (comp?.type === type) return comp;
        }
    }
    return null;
}

/**
 * Pure — determine what the user asked for via the File Upload component.
 * 0 files uploaded = keep the current image (there is deliberately no clearing in
 * upload mode — switch the guild setting back to Paste URL to clear a field).
 * @param {Array} components - modal submit data.components
 * @param {Object} resolvedAttachments - data.resolved.attachments (id → attachment)
 * @returns {{action: 'none'} | {action: 'upload', attachment: Object}}
 */
export function extractImageUploadIntent(components, resolvedAttachments) {
    const upload = findModalComponentByType(components, 19);
    const attachmentId = upload?.values?.[0];
    const attachment = attachmentId ? resolvedAttachments?.[attachmentId] : null;
    if (!attachment) return { action: 'none' };
    return { action: 'upload', attachment };
}

/**
 * Pure — validate a resolved attachment as an uploadable image (MIME whitelist +
 * size cap from Discord's metadata, i.e. BEFORE downloading any bytes).
 * @param {Object} attachment - entry from data.resolved.attachments
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateImageAttachment(attachment) {
    if (!attachment?.content_type?.startsWith('image/')) {
        return { ok: false, error: `Uploaded file must be an image (got ${attachment?.content_type || 'unknown type'})` };
    }
    if (typeof attachment.size === 'number' && attachment.size > MAX_UPLOAD_IMAGE_BYTES) {
        const mb = (attachment.size / (1024 * 1024)).toFixed(1);
        return { ok: false, error: `Image too large (${mb}MB — max ${MAX_UPLOAD_IMAGE_BYTES / (1024 * 1024)}MB)` };
    }
    return { ok: true };
}

/**
 * Pure — build a contextual storage filename that correlates the upload back to
 * its entity, mirroring the fog-map convention (a2_fogmap.png → a2_location.png).
 * Keeps the original file's extension; falls back to .png.
 * @param {Object} p
 * @param {string} p.context - entity context slug, e.g. 'a2_location'
 * @param {string} [p.originalName] - the user's uploaded filename (extension source)
 * @returns {string}
 */
export function buildImageStorageFilename({ context, originalName }) {
    const safeContext = String(context || 'image')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'image';
    const extMatch = /\.([a-z0-9]{1,5})$/i.exec(originalName || '');
    const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
    return `${safeContext}.${ext}`;
}

/**
 * Pure — display filename from a stored image URL (last path segment, query
 * stripped, decoded). Works for CastBot-hosted and user-pasted CDN URLs alike;
 * used by modal builders for "Current: a2_location.png" Label descriptions.
 * @param {string} url
 * @param {number} [maxLength=60] - truncated with … to fit Label description budgets
 * @returns {string|null} null when no filename can be derived
 */
export function filenameFromImageUrl(url, maxLength = 60) {
    if (!url || typeof url !== 'string') return null;
    let path;
    try {
        path = new URL(url).pathname; // absolute URLs: host can never masquerade as a filename
    } catch {
        path = url.split(/[?#]/)[0]; // relative/odd strings: best-effort
    }
    const segment = path.split('/').filter(Boolean).pop();
    if (!segment || !segment.includes('.')) return null;
    let name = segment;
    try { name = decodeURIComponent(segment); } catch { /* keep raw segment */ }
    return name.length > maxLength ? `${name.slice(0, maxLength - 1)}…` : name;
}

/**
 * Resolve an upload-mode image field on modal submit, mutating `fields` in place:
 * - Always strips the raw File Upload key so the attachment snowflake can never
 *   reach entity storage via parseModalSubmission's generic path.
 * - No file uploaded → leaves fields.image untouched (keep current image).
 * - File uploaded → validates, downloads, re-hosts in #🗺️castbot-images, and sets
 *   fields.image to the hosted CDN URL (plain string, same shape as pasted URLs).
 *
 * Throws on any failure (invalid type, too large, download/upload error) — callers
 * run this BEFORE saving so a bad image aborts the submit with nothing persisted.
 * Must be called AFTER the interaction is deferred (network work inside).
 *
 * @param {Object} p
 * @param {Object} p.fields - parseModalSubmission output (mutated)
 * @param {Object} p.data - modal submit interaction data (components + resolved)
 * @param {import('discord.js').Guild} p.guild
 * @param {string} p.context - filename context slug, e.g. 'a2_location'
 * @param {string} [p.description] - storage message text (defaults to context)
 * @returns {Promise<void>}
 */
export async function resolveUploadedImageField({ fields, data, guild, context, description }) {
    delete fields[IMAGE_UPLOAD_COMPONENT_ID];

    const intent = extractImageUploadIntent(data?.components, data?.resolved?.attachments);
    if (intent.action !== 'upload') return;

    const check = validateImageAttachment(intent.attachment);
    if (!check.ok) throw new Error(check.error);

    const response = await fetch(intent.attachment.url);
    if (!response.ok) {
        throw new Error(`Could not download the uploaded image (HTTP ${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_UPLOAD_IMAGE_BYTES) {
        throw new Error(`Image too large (max ${MAX_UPLOAD_IMAGE_BYTES / (1024 * 1024)}MB)`);
    }

    const filename = buildImageStorageFilename({ context, originalName: intent.attachment.filename });
    const { uploadBufferToImageStorage } = await import('./imageStorageChannel.js');
    const { url } = await uploadBufferToImageStorage(
        guild,
        buffer,
        filename,
        description || `Image for ${context} (uploaded via CastBot)`
    );
    fields.image = url;
    console.log(`🖼️ [CASTBOT_IMAGES] Re-hosted upload as ${filename} for guild ${guild.id}: ${url}`);
}
