/**
 * Map Explorer section pager + per-section Update/Delete handlers (RaP 0894 Phase 3).
 * app.js routes here (router, not processor). Also home of the whole-map delete
 * confirmation UI/executor, extracted from app.js to fund the Moai line ratchet.
 */

import { getSections, getSectionForCoordinate, computeBoundingBox, coordinatesForSection } from './mapSections.js';

export function clampSectionIndex(sections, idx) {
    return Math.min(Math.max(Number.isFinite(idx) ? idx : 0, 0), sections.length - 1);
}

/** Trailing-int parse (season-pager pattern): 'map_section_prev_2' → 2 */
export function parseTrailingIndex(customId) {
    const n = parseInt(customId.slice(customId.lastIndexOf('_') + 1), 10);
    return Number.isFinite(n) ? n : 0;
}

async function rebuildExplorer(context, sectionIndex) {
    const { buildMapExplorerResponse } = await import('../../mapExplorer.js');
    return buildMapExplorerResponse(context.guildId, context.userId, context.client, true, sectionIndex);
}

/**
 * ◀ / ▶ / cancel dispatcher — rebuilds the explorer at the target section.
 * map_section_prev_N → N-1, map_section_next_N → N+1, map_section_cancel_N → N.
 */
export async function handleSectionNav(context, customId) {
    const idx = parseTrailingIndex(customId);
    const delta = customId.startsWith('map_section_prev_') ? -1
        : customId.startsWith('map_section_next_') ? 1 : 0;
    return rebuildExplorer(context, idx + delta);
}

/** Per-section Update Map: show the map modal prefilled with the SECTION's dims. */
export async function handleSectionUpdateButton(context, customId) {
    const idx = parseTrailingIndex(customId);
    const { loadSafariContent } = await import('../../safariManager.js');
    const safariData = await loadSafariContent();
    const mapData = safariData[context.guildId]?.maps?.[safariData[context.guildId]?.maps?.active];
    if (!mapData) return { content: '❌ No active map found.', ephemeral: true };
    const sections = getSections(mapData);
    const section = sections[clampSectionIndex(sections, idx)];
    const { getImageUploadMode } = await import('../settings/generalSettings.js');
    const { buildMapUpdateModal } = await import('./mapUpdateModal.js');
    const { InteractionResponseType } = await import('discord-interactions');
    const modal = buildMapUpdateModal(true, mapData, await getImageUploadMode(context.guildId), {
        idx,
        name: section.name || `Section ${idx + 1}`,
        width: section.colEnd - section.colStart + 1,
        height: section.rowEnd - section.rowStart + 1
    });
    return { type: InteractionResponseType.MODAL, data: modal };
}

/** Critical-deletion confirmation for ONE section (LeanUserInterfaceDesign standard). */
export async function handleSectionDeleteRequest(context, customId) {
    const idx = parseTrailingIndex(customId);
    const { loadSafariContent } = await import('../../safariManager.js');
    const safariData = await loadSafariContent();
    const mapData = safariData[context.guildId]?.maps?.[safariData[context.guildId]?.maps?.active];
    const sections = mapData ? getSections(mapData) : [];
    if (sections.length < 2) {
        return { content: '❌ This map has a single section — use Delete Map on a one-section map to delete everything.', ephemeral: true };
    }
    const section = sections[clampSectionIndex(sections, idx)];
    const cellCount = coordinatesForSection(section).length;
    const name = section.name || `Section ${idx + 1}`;
    return {
        components: [{
            type: 17, // Container
            accent_color: 0xed4245, // Red - critical deletion
            components: [
                { type: 10, content: `## ⚠️ Delete ${name}` },
                { type: 14 },
                {
                    type: 10,
                    content: `**Section:** ${name}\n**Range:** ${coordinatesForSection(section)[0]} – ${coordinatesForSection(section)[cellCount - 1]}\n**Locations:** ${cellCount} channels\n\n**This cannot be undone.** The section's channels, categories, coordinates and their content will be permanently deleted. Other sections, players elsewhere, and Custom Actions are untouched. Players currently inside the section block deletion — teleport them out first.`
                },
                { type: 14 },
                {
                    type: 1,
                    components: [
                        { type: 2, custom_id: `map_section_cancel_${idx}`, label: 'Cancel', style: 2, emoji: { name: '❌' } },
                        { type: 2, custom_id: `map_delete_section_confirm_${idx}`, label: `Yes, Delete ${name}`.slice(0, 80), style: 4, emoji: { name: '🗑️' } }
                    ]
                }
            ]
        }],
        ephemeral: true
    };
}

/**
 * Delete ONE section: its channels + categories + coordinates + in-rect blacklist
 * entries, then recompute the bounding box. Refuses while players stand inside.
 * Unlike whole-map delete, guild Custom Actions are NOT touched.
 */
export async function executeSectionDelete(client, guildId, sectionIndex) {
    const { tryBeginMapBuild, endMapBuild, mapBuildBusyResult, loadSafariContent, saveSafariContent } = await import('../../mapExplorer.js');
    const gate = tryBeginMapBuild(guildId);
    if (gate.busy) return mapBuildBusyResult(gate);
    try {
        const safariData = await loadSafariContent();
        const activeMapId = safariData[guildId]?.maps?.active;
        const mapData = activeMapId ? safariData[guildId].maps[activeMapId] : null;
        const sections = mapData ? getSections(mapData) : [];
        if (sections.length < 2) return { success: false, message: '❌ Cannot delete the only section of a map.' };
        const idx = clampSectionIndex(sections, sectionIndex);
        const section = sections[idx];
        const name = section.name || `Section ${idx + 1}`;

        // Players standing inside the section block deletion (no silent stranding)
        const { loadPlayerData } = await import('../../storage.js');
        const playerData = await loadPlayerData();
        const inside = Object.entries(playerData[guildId]?.players || {})
            .filter(([, p]) => {
                const loc = p?.safari?.mapProgress?.[activeMapId]?.currentLocation;
                return loc && getSectionForCoordinate(mapData, loc)?.id === section.id;
            })
            .map(([uid]) => `<@${uid}>`);
        if (inside.length > 0) {
            return { success: false, message: `❌ Can't delete **${name}** — player(s) currently inside: ${inside.join(', ')}. Teleport or remove them first.` };
        }

        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
        const coords = coordinatesForSection(section);

        // Delete location channels (API-fetch, tolerant of already-gone, paced)
        let deleted = 0;
        for (const coord of coords) {
            const channelId = mapData.coordinates[coord]?.channelId;
            if (channelId) {
                const ch = await guild.channels.fetch(channelId).catch(() => null);
                if (ch) { await ch.delete().catch(e => console.log(`⚠️ Could not delete ${coord} channel: ${e.message}`)); deleted++; }
            }
            delete mapData.coordinates[coord];
            if (deleted > 0 && deleted % 5 === 0) await new Promise(r => setTimeout(r, 2000));
        }

        // Delete the section's categories and drop them from the map-level union
        for (const catId of section.categories || []) {
            const cat = await guild.channels.fetch(catId).catch(() => null);
            if (cat) await cat.delete().catch(e => console.log(`⚠️ Could not delete category: ${e.message}`));
        }
        if (Array.isArray(mapData.categories)) {
            mapData.categories = mapData.categories.filter(id => !(section.categories || []).includes(id));
        }

        // Strip in-rect blacklist entries and the section record, then re-box
        if (Array.isArray(mapData.blacklistedCoordinates)) {
            mapData.blacklistedCoordinates = mapData.blacklistedCoordinates.filter(c => !coords.includes(c));
        }
        mapData.sections.splice(idx, 1);
        const box = computeBoundingBox(getSections(mapData));
        mapData.gridWidth = box.gridWidth;
        mapData.gridHeight = box.gridHeight;
        mapData.gridSize = Math.max(box.gridWidth, box.gridHeight);
        await saveSafariContent(safariData);

        return { success: true, message: `🗑️ **${name} deleted** — ${deleted} channels removed, ${coords.length} coordinates cleared. Remaining sections and Custom Actions untouched.` };
    } catch (error) {
        console.error('Error deleting map section:', error);
        return { success: false, message: `❌ Error deleting section: ${error.message}` };
    } finally {
        const { endMapBuild } = await import('../../mapExplorer.js');
        endMapBuild();
    }
}

export async function handleSectionDeleteConfirm(context, customId) {
    const result = await executeSectionDelete(context.client, context.guildId, parseTrailingIndex(customId));
    if (!result.success) {
        return {
            components: [{ type: 17, accent_color: 0xe74c3c, components: [{ type: 10, content: result.message }] }]
        };
    }
    // Success: land the host back on the explorer (section 0) — the deleted index is gone
    return rebuildExplorer(context, 0);
}

// ── Whole-map delete (extracted verbatim from app.js — router, not processor) ──

export async function buildMapDeleteConfirmUI(context) {
    const { loadSafariContent } = await import('../../safariManager.js');
    const safariData = await loadSafariContent();
    const activeMapId = safariData[context.guildId]?.maps?.active;
    const mapData = safariData[context.guildId]?.maps?.[activeMapId];
    if (!mapData) return { content: '❌ No active map found to delete.', ephemeral: true };

    const coordinateCount = Object.keys(mapData.coordinates || {}).length;
    const actionCount = Object.keys(safariData[context.guildId]?.buttons || {}).length;
    const sectionCount = getSections(mapData).length;
    const sectionsNote = sectionCount > 1 ? ` across ALL ${sectionCount} sections` : '';

    // Critical Deletion UI (per LeanUserInterfaceDesign.md standard)
    return {
        components: [{
            type: 17, // Container
            accent_color: 0xed4245, // Red - critical deletion
            components: [
                { type: 10, content: `## ⚠️ Delete Entire Map` },
                { type: 14 }, // Separator below header (MANDATORY)
                {
                    type: 10, // Details & consequences
                    content: `**Map:** ${mapData.name || 'Adventure Map'}\n**Grid Size:** ${mapData.gridWidth || mapData.gridSize || 7}x${mapData.gridHeight || mapData.gridSize || 7}\n**Coordinates:** ${coordinateCount} locations${sectionsNote}\n**Custom Actions:** ${actionCount} actions\n\n**This action cannot be undone.** The following will be permanently deleted:\n• **All ${coordinateCount} Discord channels** (one for each map location)${sectionsNote}\n• All map coordinates and location data\n• All custom actions for this guild\n• All location content (stores, drops, etc.)\n• Map categories and images`
                },
                { type: 14 }, // Separator above buttons (MANDATORY)
                {
                    type: 1, // Action Row
                    components: [
                        { type: 2, custom_id: 'map_delete_cancel', label: 'Cancel', style: 2, emoji: { name: '❌' } },
                        { type: 2, custom_id: 'map_delete_confirm', label: 'Yes, Delete Everything', style: 4, emoji: { name: '🗑️' } }
                    ]
                }
            ]
        }],
        ephemeral: true
    };
}

export async function handleMapDeleteConfirm(context, isInMapChannel) {
    // Helper: wrap result text in Components V2 container (confirmation was V2, can't downgrade)
    const wrapResult = (text) => ({
        components: [{
            type: 17, // Container
            accent_color: 0x27ae60, // Green - success
            components: [{ type: 10, content: text }]
        }]
    });

    if (isInMapChannel) {
        // If we're in a map channel, send immediate response before deletion —
        // schedule deletion to happen after the response is sent
        setTimeout(async () => {
            try {
                const guild = await context.client.guilds.fetch(context.guildId);
                const { deleteMapGrid } = await import('../../mapExplorer.js');
                await deleteMapGrid(guild);
                console.log(`✅ Map deletion completed (from map channel)`);
            } catch (error) {
                console.error(`❌ Error during map deletion: ${error.message}`);
            }
        }, 1000);
        return wrapResult('🗑️ **Map deletion initiated!**\n\nThis channel will be deleted momentarily...');
    }
    const guild = await context.client.guilds.fetch(context.guildId);
    const { deleteMapGrid } = await import('../../mapExplorer.js');
    const result = await deleteMapGrid(guild);
    console.log(`✅ SUCCESS: map_delete_confirm - deletion completed`);
    return wrapResult(result.message);
}
