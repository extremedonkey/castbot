/**
 * CastBot image storage channel (#🗺️castbot-images) — the single source of truth
 * for the channel's name, lookup, creation, and buffer uploads.
 *
 * History: this channel was born as #🗺️map-storage (map grid images + fog maps).
 * It now stores ALL CastBot-hosted images (map images, fog maps, uploaded location
 * images), so it was renamed to #🗺️castbot-images. Lookup is by NAME (legacy names
 * are adopted and renamed in place — never create a duplicate); the persisted
 * mapStorageChannelId/MessageId fields in safariContent.json are only used for
 * fresh-URL refetches and are unaffected by renames.
 *
 * Design notes (see docs/01-RaP/0980 + docs/incidents/01-MapImageOversizeOOM.md):
 * - discord.js and roleAccessUtils are imported dynamically inside functions so the
 *   pure name-matching helpers stay unit-testable without heavy imports.
 * - Creation applies the Roles & Security whitelist grants (SAFARI_CHANNEL_ACCESS);
 *   finds merge the grants in (channel outlives maps, predates whitelist changes).
 */

export const IMAGE_STORAGE_CHANNEL_NAME = '🗺️castbot-images';

/** Older names this channel may still carry in existing guilds. Order matters only
 * for readability — any match is adopted then renamed to IMAGE_STORAGE_CHANNEL_NAME. */
export const LEGACY_IMAGE_STORAGE_CHANNEL_NAMES = ['🗺️map-storage', 'map-storage'];

/** Posted (and best-effort pinned) as the first message when the channel is created. */
export const IMAGE_STORAGE_CHANNEL_BANNER =
    `# 🚨🚨🚨 ⚠️ DO NOT DELETE THIS CHANNEL ⚠️ 🚨🚨🚨\n\n` +
    `**CastBot stores images for your server here** — map images, fog-of-war maps, and images uploaded through CastBot menus.\n\n` +
    `💀 Deleting this channel (or messages in it) will **permanently break** those images across your server — map displays, location images and Safari screens will show broken pictures. 💀\n\n` +
    `🤖 CastBot manages this channel automatically — you never need to post here. Feel free to mute it. 🔇`;

/**
 * Pure predicate — is `name` one of the storage channel's known names?
 * @param {string} name - channel name to test
 * @param {Object} [options]
 * @param {string[]} [options.extraNames] - additional legacy aliases accepted by
 *   specific callers (e.g. safariImportExport also accepts 'safari-storage')
 * @returns {boolean}
 */
export function isImageStorageChannelName(name, { extraNames = [] } = {}) {
    if (!name) return false;
    return name === IMAGE_STORAGE_CHANNEL_NAME
        || LEGACY_IMAGE_STORAGE_CHANNEL_NAMES.includes(name)
        || extraNames.includes(name);
}

/**
 * Find the image storage channel in the guild's channel cache (by name, text
 * channels only). Never creates. Prefers an exact new-name match over legacy names
 * so a half-migrated guild with both channels keeps using the renamed one.
 * @param {import('discord.js').Guild} guild
 * @param {Object} [options]
 * @param {string[]} [options.extraNames] - see isImageStorageChannelName
 * @returns {import('discord.js').TextChannel|null}
 */
export function findImageStorageChannel(guild, { extraNames = [] } = {}) {
    const isText = ch => ch.type === 0;
    return guild.channels.cache.find(ch => isText(ch) && ch.name === IMAGE_STORAGE_CHANNEL_NAME)
        || guild.channels.cache.find(ch => isText(ch) && isImageStorageChannelName(ch.name, { extraNames }))
        || null;
}

/**
 * Find the image storage channel, adopting + renaming a legacy-named channel if
 * that's what exists, or create it fresh (hidden, whitelist-granted, with the
 * DO-NOT-DELETE banner). Rename failures (rate limit: 2 renames/10min, or missing
 * perms) are non-fatal — the channel keeps working under its old name and the
 * rename retries on a later call.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').TextChannel>}
 */
export async function findOrCreateImageStorageChannel(guild) {
    const { getRoleAccessOverwrites, ensureRoleAccessOnChannels, SAFARI_CHANNEL_ACCESS } =
        await import('../../utils/roleAccessUtils.js');

    let channel = findImageStorageChannel(guild);
    if (channel) {
        if (channel.name !== IMAGE_STORAGE_CHANNEL_NAME) {
            try {
                await channel.setName(IMAGE_STORAGE_CHANNEL_NAME);
                console.log(`🖼️ [CASTBOT_IMAGES] Renamed legacy storage channel → ${IMAGE_STORAGE_CHANNEL_NAME} (${channel.id})`);
            } catch (e) {
                console.warn(`⚠️ [CASTBOT_IMAGES] Could not rename legacy storage channel (${e.message}) — continuing with #${channel.name}`);
            }
        }
        // Storage channel survives map deletion, so creation-time grants can never
        // reach guilds where it already exists — merge whitelist grants in on find.
        // No-op (cache check only) when grants are already present.
        await ensureRoleAccessOnChannels(guild, [channel], SAFARI_CHANNEL_ACCESS, { logPrefix: 'CASTBOT_IMAGES' });
        return channel;
    }

    const { PermissionFlagsBits } = await import('discord.js');
    const roleAccessEntries = await getRoleAccessOverwrites(guild, SAFARI_CHANNEL_ACCESS, { logPrefix: 'CASTBOT_IMAGES' });
    channel = await guild.channels.create({
        name: IMAGE_STORAGE_CHANNEL_NAME,
        type: 0, // Text channel
        topic: 'CastBot image storage - do not delete',
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            },
            ...roleAccessEntries
        ]
    });
    console.log(`🖼️ [CASTBOT_IMAGES] Created ${IMAGE_STORAGE_CHANNEL_NAME} (${channel.id}) in guild ${guild.id}`);

    // Banner is best-effort: a failed post/pin must never break the upload that
    // triggered channel creation.
    try {
        const banner = await channel.send({ content: IMAGE_STORAGE_CHANNEL_BANNER });
        await banner.pin();
    } catch (e) {
        console.warn(`⚠️ [CASTBOT_IMAGES] Banner post/pin failed: ${e.message}`);
    }

    return channel;
}

/**
 * Post an image buffer to the storage channel and return its CDN URL.
 * Mirrors mapExplorer's fog-map pattern (AttachmentBuilder from Buffer). The
 * returned url has trailing ampersands stripped (load-bearing — see RaP 0998);
 * messageId/channelId are returned so callers can refetch a fresh signed URL
 * later (Discord CDN URLs expire ~24h for programmatic fetches).
 * @param {import('discord.js').Guild} guild
 * @param {Buffer} buffer - raw image bytes
 * @param {string} filename - attachment filename (use buildImageStorageFilename)
 * @param {string} content - message text (context for humans browsing the channel)
 * @returns {Promise<{url: string, messageId: string, channelId: string}>}
 */
export async function uploadBufferToImageStorage(guild, buffer, filename, content) {
    const { AttachmentBuilder } = await import('discord.js');
    const channel = await findOrCreateImageStorageChannel(guild);
    const message = await channel.send({
        content,
        files: [new AttachmentBuilder(buffer, { name: filename })]
    });
    const rawUrl = message.attachments.first()?.url;
    if (!rawUrl) {
        throw new Error('Image upload succeeded but Discord returned no attachment URL');
    }
    return {
        url: rawUrl.trim().replace(/&+$/, ''),
        messageId: message.id,
        channelId: channel.id
    };
}
