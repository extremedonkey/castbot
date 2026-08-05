/**
 * Action ↔ map-location assignment (Action Visibility screen) — bulk add + bulk edit.
 *
 * Extracted from the add_coord_submit_ / edit_coords_submit_ handlers in app.js
 * (router, not processor). Both paths share utils/coordinateParser.js — the parser
 * extracted from the Map Explorer blacklist modal — so comma/space lists, dedupe,
 * format validation and the 'all' keyword behave identically everywhere.
 *
 * Contract kept with every other coordinate-writing path (quickActionCreate,
 * safariPlanApplier, editor auto-assign): BOTH sides of the bidirectional sync are
 * maintained — action.coordinates[] and mapData.coordinates[coord].buttons[] — and
 * anchor updates are queued (added → queueActionCoordinateUpdates; removed → ALSO a
 * per-cell queueAnchorUpdate for each vacated coordinate).
 */

import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { parseCoordinateList } from './utils/coordinateParser.js';

/** Resolve the active map's coordinate keys (null when no active map). */
function getMapCoords(safariData, guildId) {
    const activeMapId = safariData[guildId]?.maps?.active;
    return {
        activeMapId,
        mapCoords: activeMapId
            ? Object.keys(safariData[guildId]?.maps?.[activeMapId]?.coordinates || {})
            : null
    };
}

/** Format the parse-problems fragment for error messages. */
function describeProblems(parsed) {
    const problems = [];
    if (parsed.invalid.length) problems.push(`invalid format: ${parsed.invalid.join(', ')}`);
    if (parsed.unknown.length) problems.push(`not on the map: ${parsed.unknown.join(', ')}`);
    return problems.length ? ` (${problems.join('; ')})` : '';
}

/** Add actionId to a coordinate's buttons[] on the active map (no-op if cell missing). */
function linkCoordToAction(safariData, guildId, activeMapId, coordinate, actionId) {
    const coordData = activeMapId && safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate];
    if (!coordData) return;
    if (!coordData.buttons) coordData.buttons = [];
    if (!coordData.buttons.includes(actionId)) coordData.buttons.push(actionId);
}

/**
 * Edit-locations modal (Edit accessory on the collapsed Map Locations list) —
 * PRE-POPULATED with the action's current coordinates, full-replace semantics.
 * @returns {Object} modal data, or { error } when the action is gone
 */
export async function buildEditCoordsModal(guildId, actionId) {
    const safariData = await loadSafariContent();
    const action = safariData[guildId]?.buttons?.[actionId];
    if (!action) return { error: '❌ Action not found.' };

    const currentCoords = [...(action.coordinates || [])].sort();
    return {
        modal: {
            custom_id: `edit_coords_submit_${actionId}`,
            title: 'Edit Locations',
            components: [{
                type: 18, // Label
                label: 'Locations',
                description: "This REPLACES the list — remove a coordinate to remove the location. 'all' = every cell.",
                component: {
                    type: 4, // Text Input
                    custom_id: 'coordinates',
                    style: 2, // Paragraph
                    required: false, // empty submit = remove from all locations
                    value: currentCoords.join(', '),
                    placeholder: "A1, B3, D7 — or 'all', or empty to clear",
                    min_length: 0,
                    max_length: 1000
                }
            }]
        }
    };
}

/**
 * Bulk-ADD locations to an action (Location button modal — additive, existing kept).
 * @returns {{ error?: string, added?: string[], parsed?: Object }}
 */
export async function applyAddCoordinates(guildId, actionId, rawInput) {
    const input = (rawInput || '').trim();
    if (!input) return { error: '❌ At least one coordinate is required.' };

    const safariData = await loadSafariContent();
    const action = safariData[guildId]?.buttons?.[actionId];
    if (!action) return { error: '❌ Action not found.' };

    const { activeMapId, mapCoords } = getMapCoords(safariData, guildId);
    const parsed = parseCoordinateList(input, { validCoords: mapCoords });

    if (parsed.isAll && !mapCoords) {
        return { error: "❌ 'all' needs an active map — create a map first." };
    }
    if (parsed.coords.length === 0) {
        return { error: `❌ No valid coordinates found${describeProblems(parsed)}. Use format like A1, B3, D7 — or 'all'.` };
    }

    if (!action.coordinates) action.coordinates = [];
    const added = [];
    for (const coordinate of parsed.coords) {
        if (!action.coordinates.includes(coordinate)) {
            action.coordinates.push(coordinate);
            added.push(coordinate);
        }
        linkCoordToAction(safariData, guildId, activeMapId, coordinate, actionId);
    }

    await saveSafariContent(safariData);

    if (added.length > 0) {
        try {
            const { queueActionCoordinateUpdates } = await import('./anchorMessageManager.js');
            await queueActionCoordinateUpdates(guildId, actionId, 'coordinate_added');
        } catch (error) {
            console.error('Error queueing anchor updates:', error);
        }
    }

    console.log(`✅ applyAddCoordinates: +${added.length}/${parsed.coords.length} coords on ${actionId} (skipped invalid: ${parsed.invalid.length}, unknown: ${parsed.unknown.length})`);
    return { added, parsed };
}

/**
 * Bulk-EDIT locations (Edit modal submit) — FULL-REPLACE like the blacklist modal:
 * the submitted list becomes the action's location list; removals sync everywhere.
 * Empty input intentionally clears all locations; non-empty input that parses to
 * nothing is refused (probably a typo — never wipe on garbage).
 * @returns {{ error?: string, added?: string[], removed?: string[], parsed?: Object }}
 */
export async function applyEditCoordinates(guildId, actionId, rawInput) {
    const input = (rawInput || '').trim();

    const safariData = await loadSafariContent();
    const guildData = safariData[guildId] || {};
    const action = guildData.buttons?.[actionId];
    if (!action) return { error: '❌ Action not found.' };

    const { activeMapId, mapCoords } = getMapCoords(safariData, guildId);
    const parsed = parseCoordinateList(input, { validCoords: mapCoords });

    if (parsed.isAll && !mapCoords) {
        return { error: "❌ 'all' needs an active map — create a map first." };
    }
    if (input && !parsed.isAll && parsed.coords.length === 0) {
        return { error: `❌ No valid coordinates found${describeProblems(parsed)} — locations unchanged. Submit an empty field to clear all.` };
    }

    const oldCoords = action.coordinates || [];
    const newCoords = parsed.coords;
    const added = newCoords.filter(c => !oldCoords.includes(c));
    const removed = oldCoords.filter(c => !newCoords.includes(c));

    action.coordinates = newCoords;
    for (const coordinate of added) {
        linkCoordToAction(safariData, guildId, activeMapId, coordinate, actionId);
    }
    // Removed → strip the actionId from EVERY map (same sweep remove_coord_ uses)
    for (const coordinate of removed) {
        for (const mapId in guildData.maps || {}) {
            const map = guildData.maps[mapId];
            if (map.coordinates?.[coordinate]?.buttons) {
                map.coordinates[coordinate].buttons = map.coordinates[coordinate].buttons.filter(b => b !== actionId);
            }
        }
    }

    await saveSafariContent(safariData);

    try {
        const { queueAnchorUpdate, queueActionCoordinateUpdates } = await import('./anchorMessageManager.js');
        for (const coordinate of removed) {
            await queueAnchorUpdate(guildId, coordinate, { reason: 'action_removed' });
        }
        if (added.length > 0 || removed.length > 0) {
            await queueActionCoordinateUpdates(guildId, actionId, added.length > 0 ? 'coordinate_added' : 'coordinate_removed');
        }
    } catch (error) {
        console.error('Error queueing anchor updates:', error);
    }

    console.log(`✅ applyEditCoordinates: ${actionId}: +${added.length} -${removed.length} (now ${newCoords.length}; skipped invalid: ${parsed.invalid.length}, unknown: ${parsed.unknown.length})`);
    return { added, removed, parsed };
}
