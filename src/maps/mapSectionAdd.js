/**
 * Add Map Section (RaP 0894 Phase 2) — a host adds a new map SECTION to the one
 * active map: own image, own category+channels, coordinates continuing the shared
 * namespace from the anchor section's edge ('right' or 'below'). Existing sections'
 * channels and anchor messages are NEVER touched. Cross-section travel is
 * teleport-only — movement bounds seal each section (mapMovement.getMovementBounds).
 *
 * Crash-ordering is deliberate:
 *   image (disk) → CDN upload → persist section {building:true} FIRST →
 *   channel loop (incremental saves) → fog+anchors (existing pipeline) →
 *   reload + finalize (building:false, bounding box).
 * A crash mid-build leaves a visible `building: true` stub, never silent orphans;
 * created channels are real and teleportable, and section-scoped movement keeps
 * anyone inside them bounded.
 */

import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import {
    getSections, materializeSections, planSectionPlacement,
    coordinatesForSection, computeBoundingBox, generateSectionNavigation
} from './mapSections.js';
import { processMapImageWithGrid } from './mapImagePipeline.js';
import { preflightBudget } from '../channels/channelPlan.js';

const MAX_CHANNELS_PER_CATEGORY = 50; // Discord's limit per category
const MAX_SECTION_CELLS = 400;        // same rationale as map create: build time + fog memory

/**
 * Create a section's category(ies) + channels, mirroring the map-create loop
 * (50-per-category overflow, 5-channels-per-5s pacing, @everyone deny + role access).
 * @returns {Promise<{channels: Object<string,string>, categoryIds: string[], notes: string[]}>}
 */
export async function createSectionChannels(guild, coords, { categoryBaseName, emoji, roleAccessEntries, onCategoryCreated }) {
    const notes = [];
    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...roleAccessEntries
    ];

    const makeCategory = async (name) => guild.channels.create({
        name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites
    });

    let currentCategory = await makeCategory(`🗺️ ${categoryBaseName}`);
    const categoryIds = [currentCategory.id];
    if (onCategoryCreated) await onCategoryCreated(currentCategory.id);
    notes.push(`✅ Created category: ${currentCategory.name}`);

    const channels = {};
    let channelsInCurrentCategory = 0;

    for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];

        if (channelsInCurrentCategory >= MAX_CHANNELS_PER_CATEGORY) {
            const groupNumber = Math.floor(i / MAX_CHANNELS_PER_CATEGORY) + 1;
            currentCategory = await makeCategory(`🗺️ ${categoryBaseName} - Group ${groupNumber}`);
            categoryIds.push(currentCategory.id);
            if (onCategoryCreated) await onCategoryCreated(currentCategory.id);
            channelsInCurrentCategory = 0;
            notes.push(`✅ Created category: ${currentCategory.name}`);
        }

        // Rate limiting: 5 channels per 5 seconds (same pacing as map create)
        if (i > 0 && i % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        const channel = await guild.channels.create({
            name: `${emoji}${coord.toLowerCase()}`,
            type: ChannelType.GuildText,
            parent: currentCategory.id,
            topic: `Map location ${coord} - Use buttons to explore!`,
            permissionOverwrites: overwrites
        });
        channels[coord] = channel.id;
        channelsInCurrentCategory++;
        console.log(`Created channel #${emoji}${coord.toLowerCase()} (${i + 1}/${coords.length})`);
    }

    notes.push(`📍 Created ${Object.keys(channels).length}/${coords.length} channels`);
    return { channels, categoryIds, notes };
}

/**
 * Orchestrate a section add end-to-end. Returns {success, message} like executeMapBuild.
 */
export async function executeSectionAdd(client, guildId, userId, { imageUrl, rows, cols, direction, emoji, anchorIndex }) {
    const {
        tryBeginMapBuild, endMapBuild, mapBuildBusyResult, postFogOfWarMapsToChannels,
        findOrCreateMapStorageChannel, uploadImageToDiscord, getAvailableMemMB,
        loadSafariContent, saveSafariContent
    } = await import('../../mapExplorer.js');

    const gate = tryBeginMapBuild(guildId);
    if (gate.busy) return mapBuildBusyResult(gate);
    try {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);

        // Bot permission pre-flight (same requirement as map create)
        const me = guild.members?.me ?? (await guild.members.fetchMe().catch(() => null));
        const missing = [];
        if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) missing.push('Manage Channels');
        if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) missing.push('Manage Roles');
        if (missing.length > 0) {
            return { success: false, message: `❌ CastBot is missing the **${missing.join('** and **')}** permission — needed to create the section's category and channels. Grant it on the CastBot role and retry.` };
        }

        const safariData = await loadSafariContent();
        const activeMapId = safariData[guildId]?.maps?.active;
        const mapData = activeMapId ? safariData[guildId].maps[activeMapId] : null;
        if (!mapData) {
            return { success: false, message: '❌ No active map — create a map first, then add sections to it.' };
        }

        // Geometry: materialize sections, resolve anchor, plan placement
        const sections = materializeSections(mapData);
        const anchor = sections[Math.min(Math.max(anchorIndex, 0), sections.length - 1)];
        const plan = planSectionPlacement(sections, anchor, direction, cols, rows);
        if (plan.error) return { success: false, message: `❌ ${plan.error}` };
        const rect = plan.rect;
        const cells = rows * cols;
        if (cells > MAX_SECTION_CELLS) {
            return { success: false, message: `❌ ${cols}x${rows} = ${cells} channels exceeds the ${MAX_SECTION_CELLS} channel limit per section.` };
        }

        // Guild channel budget (the 500-channel guard map create never had)
        const cache = guild.channels.cache;
        const budget = preflightBudget({
            existing: {
                channels: cache.filter(c => c.type !== ChannelType.GuildCategory).size,
                categories: cache.filter(c => c.type === ChannelType.GuildCategory).size,
                roles: guild.roles.cache.size
            },
            create: { channels: cells, categories: Math.ceil(cells / MAX_CHANNELS_PER_CATEGORY) }
        });
        if (!budget.ok) {
            const v = budget.violations[0];
            return { success: false, message: `❌ This section would put the server at ${v.after} ${v.ceiling} (Discord limit: ${v.limit}). Free up ${v.after - v.limit} ${v.ceiling} and retry.` };
        }

        // Memory hard floor (RaP 0896) — builds are the most memory-intensive thing the bot does
        const availMB = getAvailableMemMB();
        if (availMB !== null && availMB < 50) {
            return { success: false, message: '❌ CastBot is under very heavy ORG usage right now and can\'t safely build a map section. Please try again in a few hours.' };
        }

        const progress = [];
        const sectionNumber = sections.length + 1;
        const sectionName = `Section ${sectionNumber}`;
        const width = rect.colEnd - rect.colStart + 1;
        const height = rect.rowEnd - rect.rowStart + 1;
        const coords = coordinatesForSection(rect);
        progress.push(`🏗️ Adding **${sectionName}** (${width}x${height}, ${coords[0]} – ${coords[coords.length - 1]}) ${direction} of ${anchor.name || 'Section ' + (sections.indexOf(anchor) + 1)}...`);
        if (availMB !== null && availMB < 120) {
            progress.push(`⚠️ High CastBot usage right now — the build will run, but may be slow.`);
        }

        // 1. Image pipeline (disk only) — grid labels carry the section's TRUE origin
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const repoRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
        const sectionId = `section_${Date.now()}`;
        const { outputPath, gridSystem, originalJpegBuffer, notes: imageNotes } = await processMapImageWithGrid({
            imageUrl,
            gridWidth: width,
            gridHeight: height,
            colOffset: rect.colStart,
            rowOffset: rect.rowStart,
            outputDir: path.join(repoRoot, 'img', guildId),
            outputBasename: `${activeMapId}_${sectionId}`
        });
        progress.push(...imageNotes);

        // 2. Upload original + gridded image to the storage channel
        const { AttachmentBuilder } = await import('discord.js');
        try {
            const storageChannel = await findOrCreateMapStorageChannel(guild);
            await storageChannel.send({
                content: `🖼️ Original pre-grid image for ${sectionName} (${guild.name})`,
                files: [new AttachmentBuilder(originalJpegBuffer, { name: `original_${sectionId}.jpg` })]
            });
        } catch (e) {
            console.log(`⚠️ Could not post original section image to storage: ${e.message}`);
        }
        const uploadFilename = outputPath.endsWith('.jpg') ? `${sectionId}.jpg` : `${sectionId}.png`;
        const uploadResult = await uploadImageToDiscord(guild, outputPath, uploadFilename);
        const discordImageUrl = uploadResult.url || uploadResult;
        progress.push('✅ Section image uploaded to Discord CDN');

        // 3. Persist the section record FIRST (building: true) — crash-visible stub
        const section = {
            id: sectionId,
            name: sectionName,
            colStart: rect.colStart, rowStart: rect.rowStart,
            colEnd: rect.colEnd, rowEnd: rect.rowEnd,
            imageFile: path.relative(repoRoot, outputPath),
            discordImageUrl,
            mapStorageMessageId: uploadResult.messageId,
            mapStorageChannelId: uploadResult.channelId,
            categories: [],
            emoji,
            building: true,
            createdAt: new Date().toISOString(),
            createdBy: userId
        };
        mapData.sections.push(section);
        await saveSafariContent(safariData);

        // 4. Category + channel loop, coordinates persisted incrementally every 5
        const { getRoleAccessOverwrites, SAFARI_CHANNEL_ACCESS } = await import('../../utils/roleAccessUtils.js');
        const roleAccessEntries = await getRoleAccessOverwrites(guild, SAFARI_CHANNEL_ACCESS, { logPrefix: 'SECTION_ADD' });

        let persisted = 0;
        const persistCoords = async (channels) => {
            for (const coord of Object.keys(channels)) {
                if (mapData.coordinates[coord]) continue;
                mapData.coordinates[coord] = {
                    channelId: channels[coord],
                    emoji,
                    baseContent: { title: coord, description: `You are at grid location ${coord}.`, image: null, clues: [] },
                    buttons: [],
                    hiddenCommands: {},
                    navigation: generateSectionNavigation(coord, rect),
                    cellType: 'unexplored',
                    discovered: false,
                    specialEvents: [],
                    fogMapUrl: null
                };
                persisted++;
                if (persisted % 5 === 0) await saveSafariContent(safariData);
            }
            await saveSafariContent(safariData);
        };

        const { channels, categoryIds, notes: channelNotes } = await createSectionChannels(guild, coords, {
            categoryBaseName: sectionName,
            emoji,
            roleAccessEntries,
            onCategoryCreated: async (categoryId) => {
                // Union invariant: section owns its categories AND map.categories carries
                // them all, so deleteMapGrid removes every section with zero changes.
                section.categories.push(categoryId);
                if (!Array.isArray(mapData.categories)) mapData.categories = mapData.category ? [mapData.category] : [];
                mapData.categories.push(categoryId);
                await saveSafariContent(safariData);
            }
        });
        await persistCoords(channels);
        progress.push(...channelNotes);

        // 5. Fog + anchors — existing pipeline, per-section image + offset gridSystem.
        //    It reloads safariContent itself (our coords are saved above) and persists
        //    fogMapUrl/anchorMessageId incrementally.
        progress.push('🌫️ Generating fog of war maps for each location...');
        await postFogOfWarMapsToChannels(guild, outputPath, gridSystem, channels, coords);

        // 6. Finalize on FRESH data (postFog saved its own copy — ours is stale now)
        const freshData = await loadSafariContent();
        const freshMap = freshData[guildId].maps[activeMapId];
        const freshSection = (freshMap.sections || []).find(s => s.id === sectionId);
        if (freshSection) freshSection.building = false;
        const box = computeBoundingBox(getSections(freshMap));
        freshMap.gridWidth = box.gridWidth;
        freshMap.gridHeight = box.gridHeight;
        freshMap.gridSize = Math.max(box.gridWidth, box.gridHeight); // legacy readers
        await saveSafariContent(freshData);

        progress.push(`🎉 **${sectionName} added!** ${coords.length} locations (${coords[0]} – ${coords[coords.length - 1]}). Players can only reach it via a Teleport action — wire one up in the Action Editor.`);
        return { success: true, message: progress.join('\n') };

    } catch (error) {
        console.error('Error adding map section:', error);
        if (error?.code === 50013) {
            return { success: false, message: '❌ Discord blocked a channel operation (Missing Permissions). Check the CastBot role has Manage Channels + Manage Roles and sits above managed roles, then use the section\'s ⚠️ incomplete state to resume.' };
        }
        return { success: false, message: `❌ Error adding section: ${error.message}` };
    } finally {
        const { endMapBuild } = await import('../../mapExplorer.js');
        endMapBuild();
    }
}

/**
 * MODAL_SUBMIT handler for map_section_add_modal_<anchorIdx>. Mirrors the
 * map_update_modal submit shape: validate fast, defer, run the build, PATCH the
 * @original followup with the rebuilt Map Explorer (or the error).
 */
export async function handleMapSectionAddModal(req, res, client, custom_id) {
    try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        const anchorIndex = parseInt(custom_id.replace('map_section_add_modal_', ''), 10) || 0;
        const components = req.body.data.components;

        const { collectModalFields, extractImageUploadIntent, validateImageAttachment } =
            await import('../images/modalImageUpload.js');
        const fields = collectModalFields(components);
        const rows = parseInt(fields.section_rows?.trim?.());
        const cols = parseInt(fields.section_columns?.trim?.());
        const emoji = (typeof fields.section_emoji === 'string' && fields.section_emoji.trim()) || '📍';
        const direction = fields.section_direction === 'below' ? 'below' : 'right';

        let imageUrl;
        const intent = extractImageUploadIntent(components, req.body.data?.resolved?.attachments);
        if (intent.action === 'upload') {
            const check = validateImageAttachment(intent.attachment);
            if (!check.ok) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `❌ ${check.error}`, flags: InteractionResponseFlags.EPHEMERAL }
                });
            }
            imageUrl = intent.attachment.url.trim().replace(/&+$/, '');
        } else {
            imageUrl = typeof fields.section_url === 'string' ? fields.section_url.trim() : undefined;
        }

        if (!imageUrl || (intent.action !== 'upload' && !imageUrl.startsWith('https://cdn.discordapp.com/attachments/'))) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '❌ Please provide a valid Discord CDN URL (must start with https://cdn.discordapp.com/attachments/)', flags: InteractionResponseFlags.EPHEMERAL }
            });
        }
        if (isNaN(rows) || isNaN(cols) || rows < 1 || rows > 100 || cols < 1 || cols > 100) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '❌ Section dimensions must be between 1 and 100 for both rows and columns.', flags: InteractionResponseFlags.EPHEMERAL }
            });
        }

        await res.send({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: InteractionResponseFlags.EPHEMERAL }
        });

        const result = await executeSectionAdd(client, guildId, userId, { imageUrl, rows, cols, direction, emoji, anchorIndex });

        const followupUrl = `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        if (!result.success) {
            await fetch(followupUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: result.message, flags: InteractionResponseFlags.EPHEMERAL })
            });
            return;
        }
        try {
            const { buildMapExplorerResponse } = await import('../../mapExplorer.js');
            const ui = await buildMapExplorerResponse(guildId, userId, client, true);
            await fetch(followupUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ui)
            });
        } catch (uiError) {
            console.log(`⚠️ Could not rebuild Map Explorer UI after section add: ${uiError.message}`);
            await fetch(followupUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: result.message, flags: InteractionResponseFlags.EPHEMERAL })
            });
        }
    } catch (error) {
        console.error('Error in map_section_add_modal handler:', error);
        try {
            const followupUrl = `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
            await fetch(followupUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: `❌ Error adding section: ${error.message}`, flags: InteractionResponseFlags.EPHEMERAL })
            });
        } catch (followupError) {
            console.error('Error sending followup:', followupError);
        }
    }
}
