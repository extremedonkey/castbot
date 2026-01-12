import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { loadPlayerData } from './storage.js';

/**
 * Points Manager for Safari System
 * Handles all point types (stamina, HP, mana, etc.) with timezone-safe regeneration
 * Uses on-demand calculation for efficient, maintenance-free operation
 *
 * SUPER HORSE UPDATE: Supports permanent stamina boosts via non-consumable items
 * - Phase 1: Simple boost on regeneration
 * - Phase 2: Individual charge tracking for better UX
 */

// Calculate permanent stamina boost from non-consumable items
async function calculatePermanentStaminaBoost(guildId, entityId) {
    if (!entityId.startsWith('player_')) return 0;

    const playerId = entityId.replace('player_', '');
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();

    const inventory = playerData[guildId]?.players?.[playerId]?.safari?.inventory || {};
    const items = safariData[guildId]?.items || {};

    let totalBoost = 0;
    for (const [itemId, qty] of Object.entries(inventory)) {
        const item = items[itemId];
        if (item?.consumable === 'No' && item?.staminaBoost > 0) {
            totalBoost += item.staminaBoost;
            console.log(`🐎 Found permanent stamina item: ${item.name} (+${item.staminaBoost})`);
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
                amount: "max"
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
    const regenerated = await calculateRegenerationWithCharges(pointData, config, guildId, entityId);

    if (regenerated.hasChanged) {
        safariData[guildId].entityPoints[entityId][pointType] = regenerated.data;
        await saveSafariContent(safariData);
    }

    return regenerated.data;
}

// New regeneration with individual charge tracking (Phase 2) and permanent boosts
async function calculateRegenerationWithCharges(pointData, config, guildId, entityId) {
    const now = Date.now();
    let hasChanged = false;
    let newData = { ...pointData };

    // Initialize charges array if needed (Phase 2)
    const effectiveMax = config.defaultMax + (config.permanentBoost || 0);

    if (config.permanentBoost > 0 && !newData.charges) {
        console.log(`🐎 Initializing charge system for ${entityId} with ${effectiveMax} total charges`);
        newData.charges = new Array(effectiveMax).fill(null);

        // Migrate existing state to charges
        const chargesInUse = effectiveMax - newData.current;
        for (let i = 0; i < chargesInUse; i++) {
            newData.charges[i] = newData.lastUse || now;
        }
        hasChanged = true;
    }

    // Phase 2: Individual charge regeneration
    if (newData.charges) {
        // Safety: Ensure charges array has correct length (fixes migration bugs)
        if (newData.charges.length < effectiveMax) {
            console.log(`🐎 Extending charges array from ${newData.charges.length} to ${effectiveMax}`);
            while (newData.charges.length < effectiveMax) {
                newData.charges.push(null);  // Add missing charges as available
            }
            hasChanged = true;
        }

        let availableCharges = 0;
        let regeneratedAny = false;

        for (let i = 0; i < newData.charges.length; i++) {
            if (!newData.charges[i]) {
                // Charge is available
                availableCharges++;
            } else if ((now - newData.charges[i]) >= config.regeneration.interval) {
                // Charge has regenerated
                newData.charges[i] = null;
                availableCharges++;
                regeneratedAny = true;
                console.log(`🐎⚡ Charge ${i + 1} regenerated for ${entityId}`);
            }
        }

        // Only INCREASE current when charges regenerate - never decrease (preserves consumable bonuses)
        // usePoints() handles decreasing current when stamina is used
        if (availableCharges > newData.current) {
            newData.current = availableCharges;
            newData.max = effectiveMax;
            newData.lastRegeneration = now;
            hasChanged = true;
            console.log(`🐎⚡ Charges regenerated: ${newData.current} available`);
        } else if (newData.max !== effectiveMax) {
            // Still update max if it changed (e.g., player got new permanent item)
            newData.max = effectiveMax;
            hasChanged = true;
        }
    } else {
        // Phase 1: Simple full reset with permanent boost
        if (config.regeneration.type === 'full_reset') {
            const timeSinceUse = now - newData.lastUse;

            if (timeSinceUse >= config.regeneration.interval && newData.current < effectiveMax) {
                newData.current = effectiveMax;
                newData.max = effectiveMax;
                newData.lastRegeneration = now;
                hasChanged = true;

                if (config.permanentBoost > 0) {
                    console.log(`🐎⚡ Stamina regenerated with +${config.permanentBoost} permanent boost`);
                }
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

    const now = Date.now();

    // Phase 2: Track individual charges if available
    if (points.charges) {
        let chargesUsed = 0;
        for (let i = 0; i < points.charges.length && chargesUsed < amount; i++) {
            if (!points.charges[i]) {  // Charge is available
                points.charges[i] = now;  // Mark charge as used with timestamp
                chargesUsed++;
                console.log(`🐎⚡ Used charge ${i + 1} for ${entityId}`);
            }
        }
    }

    // Deduct points and update last use time
    points.current -= amount;
    points.lastUse = now;  // Keep for backward compatibility

    safariData[guildId].entityPoints[entityId][pointType] = points;
    await saveSafariContent(safariData);

    return { success: true, points };
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

    if (pointData.current >= pointData.max) {
        return "Full";
    }

    const now = Date.now();
    let nextRegenTime;

    if (config.regeneration.type === 'full_reset') {
        nextRegenTime = pointData.lastUse + config.regeneration.interval;
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
    return `${minutes}m`;
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

    points.current = Math.max(0, current); // Never go below 0

    if (max !== null) {
        points.max = Math.max(1, max); // Max must be at least 1
        // Only cap at max if not allowing over-max
        if (!allowOverMax) {
            points.current = Math.min(points.current, points.max);
        }
    }

    points.lastRegeneration = Date.now();

    safariData[guildId].entityPoints[entityId][pointType] = points;
    await saveSafariContent(safariData);

    // Check and fire attribute change triggers (async, non-blocking)
    checkAttributeTriggers(guildId, entityId, pointType, previousCurrent, previousMax, points.current, points.max).catch(err => {
        console.error('Error checking attribute triggers:', err);
    });

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
    
    // Add bonus points (can exceed max)
    points.current = Math.max(0, points.current + amount);
    
    // Reset use timer when stamina is added
    points.lastUse = Date.now();
    points.lastRegeneration = Date.now();
    
    safariData[guildId].entityPoints[entityId][pointType] = points;
    await saveSafariContent(safariData);
    
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