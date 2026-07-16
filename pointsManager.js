import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { loadPlayerData } from './storage.js';
import { MAX_STAMINA } from './config/safariLimits.js';

/**
 * Points Manager for Safari System
 * Handles all point types (stamina, HP, mana, etc.) with timezone-safe regeneration
 * Uses on-demand calculation for efficient, maintenance-free operation
 *
 * Permanent stamina boosts (non-consumable items with staminaBoost) raise the holder's
 * effective max only — a "bigger tank". The former per-charge tracking ("Phase 2") was
 * removed 2026-07-16; legacy `charges` arrays are migrated away lazily on read.
 */

// Calculate permanent stamina boost from non-consumable items
export async function calculatePermanentStaminaBoost(guildId, entityId) {
    if (!entityId.startsWith('player_')) return 0;

    const playerId = entityId.replace('player_', '');
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();

    const inventory = playerData[guildId]?.players?.[playerId]?.safari?.inventory || {};
    const items = safariData[guildId]?.items || {};

    let totalBoost = 0;
    for (const [itemId, qty] of Object.entries(inventory)) {
        const item = items[itemId];
        // Coerce — item editors have historically stored staminaBoost as a string, and
        // `0 + "1"` concatenates ("9901" max corruption). Number() makes it arithmetic.
        const boost = Number(item?.staminaBoost) || 0;
        if (item?.consumable === 'No' && boost > 0) {
            totalBoost += boost;
            console.log(`🐎 Found permanent stamina item: ${item.name} (+${boost})`);
        }
    }

    if (totalBoost > 0) {
        console.log(`🐎 Total permanent stamina boost for ${entityId}: +${totalBoost}`);
    }

    return totalBoost;
}

/**
 * Calculate attribute modifiers from player's non-consumable items
 * Phase 5: Generic function that works for ANY attribute (not just stamina)
 *
 * @param {string} guildId - Guild ID
 * @param {string} entityId - Entity ID (player_123)
 * @param {string} attributeId - Attribute to calculate (strength, mana, hp, etc.)
 * @returns {Object} { add: number, addMax: number, sources: [{itemName, itemId, value, operation}] }
 */
export async function calculateAttributeModifiers(guildId, entityId, attributeId) {
    // Only players have inventory
    if (!entityId.startsWith('player_')) {
        return { add: 0, addMax: 0, sources: [] };
    }

    const playerId = entityId.replace('player_', '');
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();

    const inventory = playerData[guildId]?.players?.[playerId]?.safari?.inventory || {};
    const items = safariData[guildId]?.items || {};

    let result = { add: 0, addMax: 0, sources: [] };

    // Scan inventory for non-consumable items with attributeModifiers
    for (const [itemId, qty] of Object.entries(inventory)) {
        const item = items[itemId];

        // Skip if no item, consumable, or no modifiers
        if (!item || item.consumable === 'Yes' || !item.attributeModifiers) {
            continue;
        }

        // Check each modifier on this item
        for (const modifier of item.attributeModifiers) {
            if (modifier.attributeId === attributeId) {
                const operation = modifier.operation || 'add';
                const value = modifier.value || 0;

                // Accumulate the modifier
                if (operation === 'add') {
                    result.add += value;
                } else if (operation === 'addMax') {
                    result.addMax += value;
                }

                // Track source for display
                result.sources.push({
                    itemName: item.name || itemId,
                    itemId: itemId,
                    value: value,
                    operation: operation
                });

                console.log(`📊 Item modifier: ${item.name} gives +${value} ${operation} to ${attributeId}`);
            }
        }
    }

    // Backward compatibility: staminaBoost field → stamina addMax
    if (attributeId === 'stamina') {
        const staminaBoost = await calculatePermanentStaminaBoost(guildId, entityId);
        if (staminaBoost > 0) {
            result.addMax += staminaBoost;
            // Note: Sources already tracked by calculatePermanentStaminaBoost logging
        }
    }

    if (result.add > 0 || result.addMax > 0) {
        console.log(`📊 Total ${attributeId} modifiers for ${entityId}: +${result.add} add, +${result.addMax} max (from ${result.sources.length} items)`);
    }

    return result;
}

// Initialize points for a new entity
export async function initializeEntityPoints(guildId, entityId, pointTypes = ['stamina']) {
    const safariData = await loadSafariContent();

    if (!safariData[guildId]) {
        safariData[guildId] = {};
    }

    if (!safariData[guildId].entityPoints) {
        safariData[guildId].entityPoints = {};
    }

    if (!safariData[guildId].entityPoints[entityId]) {
        safariData[guildId].entityPoints[entityId] = {};
    }

    // Initialize each point type for this entity
    for (const pointType of pointTypes) {
        if (!safariData[guildId].entityPoints[entityId][pointType]) {
            if (pointType === 'stamina') {
                // Use per-server stamina config with .env fallback
                const { getStaminaConfig } = await import('./safariManager.js');
                const staminaConfig = await getStaminaConfig(guildId);

                safariData[guildId].entityPoints[entityId][pointType] = {
                    current: staminaConfig.startingStamina,
                    max: staminaConfig.maxStamina,
                    lastRegeneration: Date.now(),
                    lastUse: Date.now()
                };

                console.log(`⚡ Initialized ${entityId} stamina: ${staminaConfig.startingStamina}/${staminaConfig.maxStamina} (regen: ${staminaConfig.regenerationMinutes}min)`);
            } else {
                // Other point types - check attributeDefinitions first, then fallback to pointsConfig
                const attributeDefs = safariData[guildId]?.attributeDefinitions || {};
                const pointsConfig = safariData[guildId]?.pointsConfig?.definitions || getDefaultPointsConfig();

                // Try attribute definitions first (for custom attributes like mana, hp, etc.)
                const attrConfig = attributeDefs[pointType];
                const legacyConfig = pointsConfig[pointType];

                let defaultCurrent, defaultMax;

                if (attrConfig) {
                    // Use attribute system config
                    defaultCurrent = attrConfig.defaultCurrent ?? attrConfig.defaultMax ?? attrConfig.defaultValue ?? 100;
                    defaultMax = attrConfig.defaultMax ?? attrConfig.defaultValue ?? 100;
                    console.log(`📊 Initializing ${entityId} ${pointType} from attributeDefinitions: ${defaultCurrent}/${defaultMax}`);
                } else if (legacyConfig) {
                    // Use legacy points config
                    defaultCurrent = legacyConfig.defaultMax ?? 100;
                    defaultMax = legacyConfig.defaultMax ?? 100;
                } else {
                    // Fallback defaults
                    console.warn(`⚠️ No config found for point type '${pointType}', using defaults`);
                    defaultCurrent = 100;
                    defaultMax = 100;
                }

                safariData[guildId].entityPoints[entityId][pointType] = {
                    current: defaultCurrent,
                    max: defaultMax,
                    lastRegeneration: Date.now(),
                    lastUse: Date.now()
                };
            }
        }
    }

    await saveSafariContent(safariData);
    return safariData[guildId].entityPoints[entityId];
}

// Get default points configuration
export function getDefaultPointsConfig() {
    return {
        stamina: {
            displayName: "Stamina",
            emoji: "⚡",
            defaultMax: parseInt(process.env.STAMINA_MAX || '1'),
            defaultMin: 0,
            regeneration: {
                type: "full_reset",
                interval: (parseInt(process.env.STAMINA_REGEN_MINUTES || '3')) * 60000,
                amount: "max"
            },
            visibility: "hidden" // For MVP, just show cooldown
        }
    };
}

// Get current points for an entity with automatic regeneration
export async function getEntityPoints(guildId, entityId, pointType) {
    const safariData = await loadSafariContent();

    // Ensure entity points exist
    if (!safariData[guildId]?.entityPoints?.[entityId]?.[pointType]) {
        await initializeEntityPoints(guildId, entityId, [pointType]);
        return await getEntityPoints(guildId, entityId, pointType);
    }

    const pointData = safariData[guildId].entityPoints[entityId][pointType];

    // Get config - use per-server stamina config for stamina, default for others
    let config;
    let permanentBoost = 0;

    if (pointType === 'stamina') {
        const { getStaminaConfig } = await import('./safariManager.js');
        const staminaConfig = await getStaminaConfig(guildId);

        // Calculate permanent boost from non-consumable items
        permanentBoost = await calculatePermanentStaminaBoost(guildId, entityId);

        // Convert to getDefaultPointsConfig format for regeneration calculation
        config = {
            displayName: "Stamina",
            emoji: "⚡",
            defaultMax: staminaConfig.maxStamina,
            defaultMin: 0,
            regeneration: {
                type: "full_reset",
                interval: staminaConfig.regenerationMinutes * 60000, // Convert minutes to milliseconds
                amount: staminaConfig.regenerationAmount ?? "max"
            },
            visibility: "hidden",
            permanentBoost: permanentBoost  // Add permanent boost to config
        };
    } else {
        // For custom attributes, check attributeDefinitions first
        const attrDef = safariData[guildId]?.attributeDefinitions?.[pointType];

        // Phase 5: Calculate item modifiers for non-stamina attributes
        // This provides addMax bonuses from items (e.g., Ring of +10 Max Mana)
        const itemModifiers = await calculateAttributeModifiers(guildId, entityId, pointType);
        const attributeBoost = itemModifiers.addMax; // Only addMax affects stored max, 'add' is display-only

        if (attrDef) {
            // Build a config object compatible with regeneration system
            // IMPORTANT: Only enable regeneration if it's explicitly defined AND not 'none'
            // Stats (category: 'stat') don't have regeneration, so attrDef.regeneration is undefined
            const hasRegeneration = attrDef.regeneration && attrDef.regeneration.type && attrDef.regeneration.type !== 'none';
            config = {
                displayName: attrDef.name || pointType,
                emoji: attrDef.emoji || '📊',
                defaultMax: attrDef.defaultMax ?? attrDef.defaultValue ?? 100,
                defaultMin: 0,
                regeneration: hasRegeneration ? {
                    type: attrDef.regeneration.type,
                    interval: (attrDef.regeneration.intervalMinutes || 60) * 60000,
                    amount: attrDef.regeneration.amount || 'max'
                } : { type: 'none', interval: 0, amount: 0 },
                permanentBoost: attributeBoost  // Phase 5: Item modifiers affect max
            };
        } else {
            // Fallback to legacy pointsConfig
            config = safariData[guildId]?.pointsConfig?.definitions?.[pointType] || getDefaultPointsConfig()[pointType];
            // Still apply item modifiers even for legacy config
            if (config && attributeBoost > 0) {
                config.permanentBoost = attributeBoost;
            }
        }
    }

    // Apply regeneration based on elapsed time
    const regenerated = await calculateRegenerationWithCharges(pointData, config, guildId, entityId, pointType);

    if (regenerated.hasChanged) {
        safariData[guildId].entityPoints[entityId][pointType] = regenerated.data;
        await saveSafariContent(safariData);
    }

    return regenerated.data;
}

// Regen anchor: the LATER of last spend (lastUse) and last applied regen (lastRegeneration).
// Both halves matter:
// - lastUse alone re-grants on every check in amount mode (+N/period): lastUse never advances
//   after a regen, so periods stays >0 and each check mints more — turning "1 per 12h" into
//   "full refill at 12h".
// - lastRegeneration alone goes stale while a player idles at MAX, so their first spend after
//   idling regenerates instantly (the 618737f7 bug).
// Returns undefined when neither is set (corrupt/uninitialized data) — NaN math downstream
// means no regen fires, matching prior behaviour.
export function latestRegenAnchor(pointData) {
    const { lastUse, lastRegeneration } = pointData;
    if (lastUse != null && lastRegeneration != null) return Math.max(lastUse, lastRegeneration);
    return lastUse ?? lastRegeneration;
}

// Regeneration: a single anchor-based timer per player (full-reset or drip). Permanent
// items (Consumable: No + Stamina Boost) only raise the effective max — a "bigger tank".
// The former per-charge system ("Phase 2") was removed 2026-07-16; legacy `charges`
// arrays are migrated away lazily below. See docs/03-features/StaminaArchitecture.md.
async function calculateRegenerationWithCharges(pointData, config, guildId, entityId, pointType = null) {
    const now = Date.now();
    let hasChanged = false;
    let newData = { ...pointData };

    // Boost raises capacity only. Stamina is additionally capped at MAX_STAMINA as a
    // belt-and-braces guard against corrupt stored data (string boosts once concatenated:
    // 99 + "01" = "9901"). Non-stamina attributes keep their uncapped item-modified max.
    const rawMax = config.defaultMax + (config.permanentBoost || 0);
    const effectiveMax = pointType === 'stamina' ? Math.min(rawMax, MAX_STAMINA) : rawMax;

    // Lazy one-way migration: strip legacy Phase-2 charge arrays and repair the corruption
    // some carried (string-typed max, oversized null arrays, current > max). Regen then
    // continues below on the single timer as normal.
    if (newData.charges) {
        delete newData.charges;
        newData.current = Math.min(Number(newData.current) || 0, effectiveMax);
        newData.max = effectiveMax;
        hasChanged = true;
        console.log(`🧹 Removed legacy charge array for ${entityId}: now ${newData.current}/${effectiveMax}`);
    }

    // Reconcile stored max to the server's effective max — STAMINA ONLY.
    // Stamina max is purely config-derived (staminaConfig.maxStamina + item boosts), so snapping
    // it to effectiveMax is always correct and fixes players stuck at a stale max (e.g. 1, set
    // before the admin configured maxStamina) that no regen period would otherwise correct.
    // NOT applied to attributes (hp/mana/stats): those support an admin-set custom per-player max
    // (setPlayerAttribute), which this would clobber. Their prior behaviour is preserved.
    if (pointType === 'stamina' && newData.max !== effectiveMax) {
        console.log(`⚠️ STAMINA CONFIG MISMATCH: stored max=${newData.max} → ${effectiveMax} (config.defaultMax=${config.defaultMax}, permanentBoost=${config.permanentBoost || 0}), current=${newData.current} — reconciling`);
        newData.max = effectiveMax;
        hasChanged = true;
    } else if (newData.max !== effectiveMax) {
        // Non-stamina: log-only (unchanged from original behaviour)
        console.log(`⚠️ POINTS CONFIG MISMATCH (${pointType}): stored max=${newData.max}, effectiveMax=${effectiveMax} — leaving as-is (may be an admin-set custom max)`);
    }

    if (config.regeneration.type === 'full_reset') {
        const regenAmount = (config.regeneration.amount === 'max' || !config.regeneration.amount)
            ? effectiveMax
            : config.regeneration.amount;

        // Later of last spend / last applied regen — see latestRegenAnchor for why both matter.
        const regenTimestamp = latestRegenAnchor(newData);
        const timeSinceRegen = now - regenTimestamp;
        const periods = Math.floor(timeSinceRegen / config.regeneration.interval);

        if (periods > 0 && newData.current < effectiveMax) {
            const beforeCurrent = newData.current;

            // Apply regen period by period, stopping when current >= max
            // Each period adds the FULL regen amount (never capped/partial)
            let appliedPeriods = 0;
            for (let p = 0; p < periods && newData.current < effectiveMax; p++) {
                newData.current += regenAmount;
                appliedPeriods++;
            }

            // "max" mode is a FULL RESET — fill TO max, never overshoot. Without this, a
            // partially-full player regenerating in max mode mints over-max (e.g. 98 + 99 = 197).
            // "amount" mode (numeric per-tick) intentionally adds the flat amount and MAY exceed
            // max (see tests "does NOT cap at max") — so only clamp the max-mode/full-reset case.
            if (config.regeneration.amount === 'max' || !config.regeneration.amount) {
                newData.current = Math.min(newData.current, effectiveMax);
            }

            newData.max = effectiveMax;
            // Preserve fractional period for accuracy
            newData.lastRegeneration = regenTimestamp + (appliedPeriods * config.regeneration.interval);
            hasChanged = true;

            console.log(`⚡ Stamina regenerated for ${entityId}: ${beforeCurrent}/${effectiveMax} → ${newData.current}/${effectiveMax} (+${regenAmount} x${appliedPeriods} periods)`);

            if (config.permanentBoost > 0) {
                console.log(`🐎⚡ Includes +${config.permanentBoost} permanent boost to max`);
            }
        }
    }

    return { data: newData, hasChanged };
}

// Calculate regeneration based on time elapsed (timezone-safe using UTC) - LEGACY
function calculateRegeneration(pointData, config) {
    const now = Date.now(); // Always UTC milliseconds
    let hasChanged = false;
    let newData = { ...pointData };
    
    if (config.regeneration.type === 'full_reset') {
        // Regenerate based on time since last use
        const timeSinceUse = now - pointData.lastUse;
        
        if (timeSinceUse >= config.regeneration.interval && pointData.current < pointData.max) {
            newData.current = pointData.max;
            newData.lastRegeneration = now;
            hasChanged = true;
        }
    } else if (config.regeneration.type === 'incremental') {
        // Calculate how many periods have passed
        const elapsed = now - pointData.lastRegeneration;
        const periods = Math.floor(elapsed / config.regeneration.interval);
        
        if (periods > 0 && pointData.current < pointData.max) {
            const regenAmount = periods * config.regeneration.amount;
            newData.current = Math.min(pointData.max, pointData.current + regenAmount);
            // Set last regeneration to account for partial period
            newData.lastRegeneration = now - (elapsed % config.regeneration.interval);
            hasChanged = true;
        }
    }
    
    return { data: newData, hasChanged };
}

// Use points (deduct from current) - Updated for charge system
export async function usePoints(guildId, entityId, pointType, amount) {
    const safariData = await loadSafariContent();
    const points = await getEntityPoints(guildId, entityId, pointType);

    if (points.current < amount) {
        return { success: false, message: "Insufficient points", points };
    }

    // Capture before state for snapshot
    const beforeCurrent = points.current;
    const regenTimeBefore = await getTimeUntilRegeneration(guildId, entityId, pointType);

    const now = Date.now();

    // Deduct points and update last use time (restarts the regen countdown — anchor
    // semantics in latestRegenAnchor)
    points.current -= amount;
    points.lastUse = now;

    safariData[guildId].entityPoints[entityId][pointType] = points;
    await saveSafariContent(safariData);

    // Build snapshot for logging
    const regenTime = await getTimeUntilRegeneration(guildId, entityId, pointType);
    const snapshot = createStaminaSnapshot(beforeCurrent, points.current, points.max, regenTime, regenTimeBefore);

    return { success: true, points, snapshot };
}

// Check if entity has enough points
export async function hasEnoughPoints(guildId, entityId, pointType, amount) {
    const points = await getEntityPoints(guildId, entityId, pointType);
    return points.current >= amount;
}

// Get time until next regeneration (for display)
export async function getTimeUntilRegeneration(guildId, entityId, pointType) {
    const safariData = await loadSafariContent();
    const pointData = safariData[guildId]?.entityPoints?.[entityId]?.[pointType];

    if (!pointData) return "Not initialized";

    // Get config - use per-server stamina config for stamina, default for others
    let config;
    if (pointType === 'stamina') {
        const { getStaminaConfig } = await import('./safariManager.js');
        const staminaConfig = await getStaminaConfig(guildId);

        config = {
            regeneration: {
                type: "full_reset",
                interval: staminaConfig.regenerationMinutes * 60000
            }
        };
    } else {
        config = safariData[guildId]?.pointsConfig?.definitions?.[pointType] || getDefaultPointsConfig()[pointType];
    }

    if (!config?.regeneration) {
        return "N/A";
    }

    if (pointData.current >= pointData.max) {
        return "Full";
    }

    const now = Date.now();
    let nextRegenTime;

    if (config.regeneration.type === 'full_reset') {
        // Same anchor as the regen engine, so in amount mode the countdown targets the
        // NEXT +1, not the already-applied one.
        nextRegenTime = latestRegenAnchor(pointData) + config.regeneration.interval;
    } else {
        nextRegenTime = pointData.lastRegeneration + config.regeneration.interval;
    }
    
    const remaining = nextRegenTime - now;
    
    if (remaining <= 0) return "Ready!";
    
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m`;
    }
    const seconds = Math.floor(remaining / 1000);
    return `${seconds}s`;
}

/**
 * Human summary of the pending stamina regen, for display surfaces (navigate pane,
 * player card). Applies lazy regen first (via getEntityPoints), so the summary always
 * reflects post-regen state.
 * @returns {Promise<{amountLabel: string, timeText: string, current: number, max: number}|null>}
 *   amountLabel: '+N' (drip) or 'to full' (full refill); timeText: e.g. '5h 12m' or 'now'.
 *   null when nothing is pending (at/over max, or uninitialized).
 */
export async function getStaminaRegenSummary(guildId, entityId) {
    const points = await getEntityPoints(guildId, entityId, 'stamina');
    if (!points || points.current >= points.max) return null;

    let timeText = await getTimeUntilRegeneration(guildId, entityId, 'stamina');
    if (!timeText || timeText === 'Full' || timeText === 'Not initialized' || timeText === 'N/A') return null;
    if (timeText === 'Ready!') timeText = 'now'; // razor edge: elapsed between the two reads

    const { getStaminaConfig } = await import('./safariManager.js');
    const cfg = await getStaminaConfig(guildId);
    const amountLabel = cfg.regenerationAmount != null ? `+${cfg.regenerationAmount}` : 'to full';

    return { amountLabel, timeText, current: points.current, max: points.max };
}

// Milliseconds until the next regeneration fires (raw form of getTimeUntilRegeneration).
// Returns null when nothing is pending (not initialized, no regen config, or already full).
export async function getRegenRemainingMs(guildId, entityId, pointType) {
    const safariData = await loadSafariContent();
    const pointData = safariData[guildId]?.entityPoints?.[entityId]?.[pointType];
    if (!pointData) return null;

    let interval;
    if (pointType === 'stamina') {
        const { getStaminaConfig } = await import('./safariManager.js');
        const staminaConfig = await getStaminaConfig(guildId);
        interval = staminaConfig.regenerationMinutes * 60000;
    } else {
        const config = safariData[guildId]?.pointsConfig?.definitions?.[pointType] || getDefaultPointsConfig()[pointType];
        if (!config?.regeneration?.interval) return null;
        interval = config.regeneration.interval;
    }

    const now = Date.now();
    if (pointData.current >= pointData.max) return null;
    // Same anchor as the regen engine (later of last spend / last applied regen).
    const nextRegenTime = latestRegenAnchor(pointData) + interval;
    return Math.max(0, nextRegenTime - now);
}

/**
 * Admin: set the time until the entity's next regeneration fires ("Manually Set Refresh").
 *
 * TIME-SHIFT semantics: the outcome matches what would have happened had the player simply
 * waited — the current next-fire time moves to now + durationMs. Single anchor: lastUse AND
 * lastRegeneration both move so the next period boundary lands at now + durationMs
 * (dual-anchor rule, same as setEntityPoints).
 *
 * One-shot: only the current cycle shifts; later cycles run on the server interval, and (in
 * full-reset mode) any later spend restamps lastUse as normal.
 *
 * @param {number} durationMs - Time until next refresh. 0 = refresh on next read.
 * @returns {{success: boolean, message?: string, regenTimeBefore?: string, regenTimeAfter?: string}}
 */
export async function setRegenCountdown(guildId, entityId, pointType, durationMs) {
    // Apply any lazily-pending regeneration first so we shift CURRENT state, not stale state
    // (an already-elapsed cooldown must regen, not get pushed into the future).
    await getEntityPoints(guildId, entityId, pointType);

    const safariData = await loadSafariContent();
    const points = safariData[guildId]?.entityPoints?.[entityId]?.[pointType];
    if (!points) {
        return { success: false, message: 'Player has no stamina record — initialize them on the map first.' };
    }

    const regenTimeBefore = await getTimeUntilRegeneration(guildId, entityId, pointType);
    const remainingMs = await getRegenRemainingMs(guildId, entityId, pointType);
    if (remainingMs === null) {
        return { success: false, message: 'Nothing is regenerating (♻️ MAX) — there is no refresh to set.' };
    }

    const now = Date.now();
    // Shift the whole timeline so the next fire lands at now + durationMs.
    const delta = (now + durationMs) - (now + remainingMs);

    // Same anchor as the regen engine (later of last spend / last applied regen).
    const anchor = latestRegenAnchor(points) + delta;
    points.lastUse = anchor;
    points.lastRegeneration = anchor;

    safariData[guildId].entityPoints[entityId][pointType] = points;
    await saveSafariContent(safariData);

    const regenTimeAfter = await getTimeUntilRegeneration(guildId, entityId, pointType);
    console.log(`♻️ Regen countdown for ${entityId} ${pointType} set to ${durationMs}ms (was ${regenTimeBefore}, now ${regenTimeAfter})`);

    return { success: true, regenTimeBefore, regenTimeAfter };
}

// Admin function to set points directly
export async function setEntityPoints(guildId, entityId, pointType, current, max = null, allowOverMax = false) {
    const safariData = await loadSafariContent();

    // Ensure structure exists
    if (!safariData[guildId]?.entityPoints?.[entityId]?.[pointType]) {
        await initializeEntityPoints(guildId, entityId, [pointType]);
    }

    const points = safariData[guildId].entityPoints[entityId][pointType];

    // Store previous values for trigger detection
    const previousCurrent = points.current;
    const previousMax = points.max;
    const regenTimeBefore = await getTimeUntilRegeneration(guildId, entityId, pointType);

    points.current = Math.max(0, current); // Never go below 0

    if (max !== null) {
        points.max = Math.max(1, max); // Max must be at least 1
        // Only cap at max if not allowing over-max
        if (!allowOverMax) {
            points.current = Math.min(points.current, points.max);
        }
    }

    // Reset BOTH regen anchors to now. The Phase-1 full_reset regen anchors to `lastUse`, so if we
    // only reset lastRegeneration (as before), a stale lastUse made the very next read think a full
    // period had elapsed and immediately regenerate the admin's value away (e.g. set 98 → instantly
    // refilled). Treat an explicit set as a fresh anchor so the value sticks until the next interval.
    points.lastRegeneration = Date.now();
    points.lastUse = Date.now();

    // Legacy Phase-2 charge arrays are dropped on sight (regen's lazy migration does the
    // same) — an admin set must never leave a stale charges array behind.
    if (points.charges) {
        delete points.charges;
        console.log(`🧹 Removed legacy charge array for ${entityId} during admin set`);
    }

    safariData[guildId].entityPoints[entityId][pointType] = points;
    await saveSafariContent(safariData);

    // Check and fire attribute change triggers (async, non-blocking)
    checkAttributeTriggers(guildId, entityId, pointType, previousCurrent, previousMax, points.current, points.max).catch(err => {
        console.error('Error checking attribute triggers:', err);
    });

    // Build snapshot for logging
    const regenTime = await getTimeUntilRegeneration(guildId, entityId, pointType);
    points.snapshot = createStaminaSnapshot(previousCurrent, points.current, points.max, regenTime, regenTimeBefore);

    return points;
}

/**
 * Check and fire attribute change triggers after a point value changes
 * @param {string} guildId - Guild ID
 * @param {string} entityId - Entity ID (player_123)
 * @param {string} attributeId - Attribute that changed
 * @param {number} prevCurrent - Previous current value
 * @param {number} prevMax - Previous max value
 * @param {number} newCurrent - New current value
 * @param {number} newMax - New max value
 */
async function checkAttributeTriggers(guildId, entityId, attributeId, prevCurrent, prevMax, newCurrent, newMax) {
    const safariData = await loadSafariContent();
    const triggers = safariData[guildId]?.attributeTriggers || [];

    if (triggers.length === 0) return;

    // Calculate previous and new percentages
    const prevPercent = prevMax > 0 ? (prevCurrent / prevMax) * 100 : 0;
    const newPercent = newMax > 0 ? (newCurrent / newMax) * 100 : 0;

    // Find triggers for this attribute
    const matchingTriggers = triggers.filter(t =>
        t.config?.attributeId === attributeId &&
        t.enabled !== false
    );

    for (const trigger of matchingTriggers) {
        const { event, threshold, thresholdType = 'absolute' } = trigger.config || {};

        // Calculate threshold value based on type
        let thresholdValue = threshold || 0;
        let prevValue = prevCurrent;
        let newValue = newCurrent;

        if (thresholdType === 'percent') {
            prevValue = prevPercent;
            newValue = newPercent;
        }

        // Check if trigger condition is met
        let shouldFire = false;

        switch (event) {
            case 'crosses_below':
                // Was above threshold, now at or below
                shouldFire = prevValue > thresholdValue && newValue <= thresholdValue;
                break;
            case 'crosses_above':
                // Was at or below threshold, now above
                shouldFire = prevValue <= thresholdValue && newValue > thresholdValue;
                break;
            case 'reaches_zero':
                // Value reaches exactly 0
                shouldFire = prevCurrent !== 0 && newCurrent === 0;
                break;
            case 'reaches_max':
                // Value reaches max
                shouldFire = prevCurrent < prevMax && newCurrent >= newMax;
                break;
            case 'any_change':
                // Any modification to this attribute
                shouldFire = prevCurrent !== newCurrent || prevMax !== newMax;
                break;
        }

        if (shouldFire) {
            console.log(`🎯 Attribute trigger fired: ${trigger.id} (${event}) for ${attributeId} on ${entityId}`);
            console.log(`   Previous: ${prevCurrent}/${prevMax} (${prevPercent.toFixed(1)}%)`);
            console.log(`   New: ${newCurrent}/${newMax} (${newPercent.toFixed(1)}%)`);

            // Execute trigger actions
            try {
                await executeAttributeTrigger(guildId, entityId, trigger, {
                    attributeId,
                    prevCurrent,
                    prevMax,
                    newCurrent,
                    newMax,
                    prevPercent,
                    newPercent
                });
            } catch (err) {
                console.error(`Error executing attribute trigger ${trigger.id}:`, err);
            }
        }
    }
}

/**
 * Execute actions for a fired attribute trigger
 * @param {string} guildId - Guild ID
 * @param {string} entityId - Entity ID
 * @param {Object} trigger - The trigger that fired
 * @param {Object} context - Context with attribute values
 */
async function executeAttributeTrigger(guildId, entityId, trigger, context) {
    const { executeButtonActions } = await import('./safariManager.js');

    // Build context for action execution
    const userId = entityId.startsWith('player_') ? entityId.replace('player_', '') : null;
    if (!userId) return;

    const executionContext = {
        guildId,
        userId,
        entityId,
        triggerEvent: trigger.config?.event,
        attributeId: context.attributeId,
        attributeContext: context
    };

    // Execute the trigger's actions
    if (trigger.actions && trigger.actions.length > 0) {
        console.log(`   Executing ${trigger.actions.length} action(s) for trigger ${trigger.id}`);

        // Create a minimal "button" object for executeButtonActions
        const triggerButton = {
            id: `trigger_${trigger.id}`,
            name: trigger.name || 'Attribute Trigger',
            actions: trigger.actions,
            conditions: [] // Triggers don't have additional conditions
        };

        // Note: This is a fire-and-forget execution
        // We can't send Discord responses from here since there's no interaction
        // Actions should be things like modifying other attributes, giving items, etc.
        // Display text actions will be logged but won't show to user

        await executeButtonActions(
            guildId,
            triggerButton,
            { id: userId },
            executionContext,
            true // conditionsResult is always true for triggers
        );
    }
}

// Add bonus points that can exceed max (for consumable items)
export async function addBonusPoints(guildId, entityId, pointType, amount) {
    const safariData = await loadSafariContent();

    // Ensure entity points exist
    if (!safariData[guildId]?.entityPoints?.[entityId]?.[pointType]) {
        await initializeEntityPoints(guildId, entityId, [pointType]);
        return await getEntityPoints(guildId, entityId, pointType);
    }

    const points = safariData[guildId].entityPoints[entityId][pointType];

    // Capture before state for snapshot
    const beforeCurrent = points.current;
    const regenTimeBefore = await getTimeUntilRegeneration(guildId, entityId, pointType);

    // Add bonus points (can exceed max) - does NOT reset regen timer
    // so consumable items don't punish players by restarting their cooldown
    points.current = Math.max(0, points.current + amount);

    safariData[guildId].entityPoints[entityId][pointType] = points;
    await saveSafariContent(safariData);

    // Build snapshot for logging
    const regenTime = await getTimeUntilRegeneration(guildId, entityId, pointType);
    points.snapshot = createStaminaSnapshot(beforeCurrent, points.current, points.max, regenTime, regenTimeBefore);

    return points;
}

// Initialize points configuration for a guild
export async function initializePointsConfig(guildId, customConfig = null) {
    const safariData = await loadSafariContent();
    
    if (!safariData[guildId]) {
        safariData[guildId] = {};
    }
    
    if (!safariData[guildId].pointsConfig) {
        safariData[guildId].pointsConfig = {
            definitions: customConfig || getDefaultPointsConfig(),
            movementCost: {
                stamina: 1
            }
        };
        await saveSafariContent(safariData);
    }
    
    return safariData[guildId].pointsConfig;
}

// Get formatted points display based on visibility settings
export async function getPointsDisplay(guildId, entityId, pointType) {
    const points = await getEntityPoints(guildId, entityId, pointType);
    const safariData = await loadSafariContent();

    // Get config - use per-server stamina config for stamina, default for others
    let config;
    if (pointType === 'stamina') {
        const { getStaminaConfig } = await import('./safariManager.js');
        const staminaConfig = await getStaminaConfig(guildId);

        config = {
            displayName: "Stamina",
            emoji: "⚡",
            visibility: "hidden"
        };
    } else {
        config = safariData[guildId]?.pointsConfig?.definitions?.[pointType] || getDefaultPointsConfig()[pointType];
    }

    if (config.visibility === 'hidden') {
        // For MVP, just return if they can use the points
        if (points.current > 0) {
            return { canUse: true, display: null };
        } else {
            const timeUntil = await getTimeUntilRegeneration(guildId, entityId, pointType);
            return { canUse: false, display: `Rest for ${timeUntil}` };
        }
    } else if (config.visibility === 'bar') {
        // Future: return bar representation
        const percentage = (points.current / points.max) * 100;
        return {
            canUse: points.current > 0,
            display: `${config.emoji} ${'█'.repeat(Math.floor(percentage/10))}${'░'.repeat(10-Math.floor(percentage/10))} ${points.current}/${points.max}`
        };
    } else {
        // Default: show numbers
        return {
            canUse: points.current > 0,
            display: `${config.emoji} ${points.current}/${points.max} ${config.displayName}`
        };
    }
}

// --- Stamina Snapshot Helpers ---

/**
 * Create a snapshot of a stamina/points change for logging.
 * @param {number} before - Current value before change
 * @param {number} after - Current value after change
 * @param {number} max - Effective max (base + permanent boosts)
 * @param {string} regenTime - Time until regen ("12h 0m", "Ready!", "Full")
 * @returns {Object} Snapshot object
 */
export function createStaminaSnapshot(before, after, max, regenTime, regenTimeBefore = null) {
    return { before, after, max, regenTime, regenTimeBefore };
}

/**
 * Format a stamina snapshot as a compact tag for log messages.
 * Example: "(⚡1/1 → 0/1 ♻️12hr)"
 * @param {Object} snapshot - From createStaminaSnapshot()
 * @returns {string} Formatted tag, or empty string if no snapshot
 */
export function formatStaminaTag(snapshot) {
    if (!snapshot) return '';
    const formatRegen = (t) => (!t || t === 'Full' || t === 'Ready!') ? '♻️MAX' : `♻️${t}`;
    const regenAfter = formatRegen(snapshot.regenTime);
    // Show before regen if available and different from after
    const regenBefore = snapshot.regenTimeBefore ? formatRegen(snapshot.regenTimeBefore) : null;
    const beforePart = regenBefore && regenBefore !== regenAfter
        ? `⚡${snapshot.before}/${snapshot.max} ${regenBefore}`
        : `⚡${snapshot.before}/${snapshot.max}`;
    return `(${beforePart} → ${snapshot.after}/${snapshot.max} ${regenAfter})`;
}