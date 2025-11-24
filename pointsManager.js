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
                // Other point types use default config
                const pointsConfig = safariData[guildId]?.pointsConfig?.definitions || getDefaultPointsConfig();
                const config = pointsConfig[pointType];

                safariData[guildId].entityPoints[entityId][pointType] = {
                    current: config.defaultMax,
                    max: config.defaultMax,
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
        config = safariData[guildId]?.pointsConfig?.definitions?.[pointType] || getDefaultPointsConfig()[pointType];
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

        if (regeneratedAny || newData.current !== availableCharges) {
            newData.current = availableCharges;
            newData.max = effectiveMax;
            newData.lastRegeneration = now;
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
    
    return points;
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