/**
 * map_update_modal MODAL_SUBMIT handler — moved verbatim out of app.js (RaP 0894
 * Phase 2, funding the Moai line ratchet: app.js is a router, not a processor).
 * Same res.send() discipline as every MODAL_SUBMIT handler; behavior unchanged.
 */

import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';

export async function handleMapUpdateModalSubmit(req, res, client, components) {
    // Declared outside the try — the catch's error followup references hasActiveMap
    // (was resolved inside the try; any earlier throw became a ReferenceError that
    // swallowed the real error and left the admin on an eternal "thinking" state)
    let hasActiveMap = false;
    try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;

        // Parse by custom_id (Label or legacy ActionRow shapes) — the modal's shape
        // varies by Image Uploads mode, so positional indexes are no longer stable.
        const { collectModalFields, extractImageUploadIntent, validateImageAttachment } =
            await import('../images/modalImageUpload.js');
        const fields = collectModalFields(components);
        const mapRows = parseInt(fields.map_rows?.trim?.());
        const mapColumns = parseInt(fields.map_columns?.trim?.());
        const mapEmoji = (typeof fields.map_emoji === 'string' && fields.map_emoji.trim()) || '📍';

        // Upload mode: the attachment URL feeds the build pipeline exactly like a
        // pasted URL — the pipeline downloads and re-hosts its own artifacts, so no
        // pre-hosting here (docs/03-features/ImageUploads.md, download-source archetype).
        let mapUrl;
        const intent = extractImageUploadIntent(components, req.body.data?.resolved?.attachments);
        if (intent.action === 'upload') {
            const check = validateImageAttachment(intent.attachment);
            if (!check.ok) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `❌ ${check.error}`, flags: InteractionResponseFlags.EPHEMERAL }
                });
            }
            mapUrl = intent.attachment.url.trim().replace(/&+$/, '');
        } else {
            mapUrl = typeof fields.map_url === 'string' ? fields.map_url.trim() : undefined;
        }

        console.log(`🔄 DEBUG: Map update modal submitted - guild: ${guildId}, url: ${mapUrl}, dimensions: ${mapColumns}x${mapRows}`);

        // Basic URL validation — PASTED URLs only. Upload-derived URLs come from
        // Discord's own resolved payload (already MIME/size validated above) and use
        // the /ephemeral-attachments/ CDN path, which this prefix would wrongly reject.
        if (!mapUrl || (intent.action !== 'upload' && !mapUrl.startsWith('https://cdn.discordapp.com/attachments/'))) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Please provide a valid Discord CDN URL (must start with https://cdn.discordapp.com/attachments/)',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }

        // Validate dimensions
        if (isNaN(mapRows) || isNaN(mapColumns) || mapRows < 1 || mapRows > 100 || mapColumns < 1 || mapColumns > 100) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ Map dimensions must be between 1 and 100 for both rows and columns.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }

        // Calculate total channel count first
        const totalChannels = mapRows * mapColumns;

        // Validate total channel count
        if (totalChannels > 400) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `❌ ${mapColumns}x${mapRows} = ${totalChannels} channels exceeds the 400 channel limit.`,
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }

        // Pre-flight memory check BEFORE deferring — map builds are the most memory-intensive
        // thing the bot does (RaP 0896: two prod OOM kills on 2026-07-17 were map builds).
        // Below the threshold, offer an explicit Proceed Anyway instead of running blind.
        const { getAvailableMemMB, executeMapBuild, buildLowMemoryWarning } = await import('../../mapExplorer.js');
        const availMB = getAvailableMemMB();
        if (availMB !== null && availMB < 120) {
            if (!global.pendingMapBuilds) global.pendingMapBuilds = new Map();
            // Sweep expired stashes so the map can't grow unbounded
            for (const [k, v] of global.pendingMapBuilds) {
                if (v.expiresAt < Date.now()) global.pendingMapBuilds.delete(k);
            }
            global.pendingMapBuilds.set(`${guildId}_${userId}`, {
                mapUrl, mapColumns, mapRows, mapEmoji,
                expiresAt: Date.now() + 10 * 60 * 1000
            });
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: buildLowMemoryWarning(availMB)
            });
        }

        // Defer response for long operation
        await res.send({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                flags: InteractionResponseFlags.EPHEMERAL
            }
        });

        // Resolve create-vs-update for logging/error copy; executeMapBuild re-checks internally
        const { loadSafariContent } = await import('../../safariManager.js');
        const safariData = await loadSafariContent();
        hasActiveMap = Boolean(safariData[guildId]?.maps?.active);

        const result = await executeMapBuild(client, guildId, userId, { mapUrl, mapColumns, mapRows, mapEmoji });

        // Check if map creation/update failed
        const followupUrl = `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        if (result && !result.success) {
            console.log(`❌ Map operation failed: ${result.message}`);
            await fetch(followupUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: result.message,
                    flags: InteractionResponseFlags.EPHEMERAL
                })
            });
            return;
        }

        // Rebuild Map Explorer UI with the new image
        try {
            const { buildMapExplorerResponse } = await import('../../mapExplorer.js');
            const mapExplorerUI = await buildMapExplorerResponse(guildId, userId, client, true);
            await fetch(followupUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mapExplorerUI)
            });
        } catch (uiError) {
            console.log(`⚠️ Could not rebuild Map Explorer UI, falling back to text: ${uiError.message}`);
            await fetch(followupUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: result.message,
                    flags: InteractionResponseFlags.EPHEMERAL
                })
            });
        }

    } catch (error) {
        console.error('Error in map_update_modal handler:', error);

        // Try to send error as followup
        try {
            const followupUrl = `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
            await fetch(followupUrl, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: `❌ Error ${hasActiveMap ? 'updating' : 'creating'} map: ${error.message}`,
                    flags: InteractionResponseFlags.EPHEMERAL
                })
            });
        } catch (followupError) {
            console.error('Error sending followup:', followupError);
        }
    }
}
