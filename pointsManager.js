import { loadSafariContent, saveSafariContent } from './safariManager.js';

/**
 * Points Manager for Safari System
 * Handles all point types (stamina, HP, mana, etc.) with timezone-safe regeneration
 * Uses on-demand calculation for efficient, maintenance-free operation
 */

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
    
    const pointsConfig = safariData[guildId]?.pointsConfig?.definitions || getDefaultPointsConfig();
    
    // Initialize each point type for this entity
    for (const pointType of pointTypes) {
        if (!safariData[guildId].entityPoints[entityId][pointType]) {
            const config = pointsConfig[pointType];
            safariData[guildId].entityPoints[entityId][pointType] = {
                current: config.defaultMax,
                max: config.defaultMax,
                lastRegeneration: Date.now(),
                lastUse: Date.now()
            };
        }
    }
    
    await saveSafariContent(safariData);
    return safariData[guildId].entityPoints[entityId];
}

// Get default points configuration
function getDefaultPointsConfig() {
    return {
        stamina: {
            displayName: "Stamina",
            emoji: "⚡",
            defaultMax: 1,
            defaultMin: 0,
            regeneration: {
                type: "full_reset",
                interval: 180000, // 3 minutes
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
    const config = safariData[guildId]?.pointsConfig?.definitions?.[pointType] || getDefaultPointsConfig()[pointType];
    
    // Apply regeneration based on elapsed time
    const regenerated = calculateRegeneration(pointData, config);
    
    if (regenerated.hasChanged) {
        safariData[guildId].entityPoints[entityId][pointType] = regenerated.data;
        await saveSafariContent(safariData);
    }
    
    return regenerated.data;
}

// Calculate regeneration based on time elapsed (timezone-safe using UTC)
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

// Use points (deduct from current)
export async function usePoints(guildId, entityId, pointType, amount) {
    const safariData = await loadSafariContent();
    const points = await getEntityPoints(guildId, entityId, pointType);
    
    if (points.current < amount) {
        return { success: false, message: "Insufficient points", points };
    }
    
    // Deduct points and update last use time
    points.current -= amount;
    points.lastUse = Date.now();
    
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
    
    const config = safariData[guildId]?.pointsConfig?.definitions?.[pointType] || getDefaultPointsConfig()[pointType];
    
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
export async function setEntityPoints(guildId, entityId, pointType, current, max = null) {
    const safariData = await loadSafariContent();
    
    // Ensure structure exists
    if (!safariData[guildId]?.entityPoints?.[entityId]?.[pointType]) {
        await initializeEntityPoints(guildId, entityId, [pointType]);
    }
    
    const points = safariData[guildId].entityPoints[entityId][pointType];
    points.current = Math.max(0, current); // Never go below 0
    
    if (max !== null) {
        points.max = Math.max(1, max); // Max must be at least 1
        points.current = Math.min(points.current, points.max); // Current can't exceed max
    }
    
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
    const config = safariData[guildId]?.pointsConfig?.definitions?.[pointType] || getDefaultPointsConfig()[pointType];
    
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