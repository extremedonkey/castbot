import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_FILE = path.join(__dirname, 'playerData.json');

// Request-scoped cache for player data
const requestCache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

// Clear the request cache (called at start of each Discord interaction)
export function clearRequestCache() {
    if (requestCache.size > 0) {
        console.log(`🗑️ Clearing request cache (${requestCache.size} entries, ${cacheHits} hits, ${cacheMisses} misses)`);
    }
    requestCache.clear();
    cacheHits = 0;
    cacheMisses = 0;
}

async function ensureStorageFile() {
    // Check cache for full data
    const cacheKey = 'playerData_all';
    if (requestCache.has(cacheKey)) {
        cacheHits++;
        return requestCache.get(cacheKey);
    }
    
    cacheMisses++;
    try {
        let data;
        const exists = await fs.access(STORAGE_FILE).then(() => true).catch(() => false);

        if (exists) {
            // PRIORITY 2: Validate file BEFORE reading to catch corruption early
            const stats = await fs.stat(STORAGE_FILE);
            if (stats.size < 50000) {
                console.error('🚨 playerData.json suspiciously small:', stats.size, 'bytes (expected >50KB)');
                console.error('🚨 Check .backup file or VS Code history before proceeding');
                console.error('🚨 File location:', STORAGE_FILE);
                throw new Error(`Corrupted storage file detected - too small (${stats.size} bytes)`);
            }

            // Read file content
            const fileContent = await fs.readFile(STORAGE_FILE, 'utf8');

            // PRIORITY 2: Verify we read the full file (network issues can cause partial reads)
            if (fileContent.length < 50000) {
                console.error('🚨 File read incomplete:', fileContent.length, 'bytes (file is', stats.size, 'bytes)');
                console.error('🚨 This indicates a network or I/O issue during read');
                throw new Error(`Incomplete file read detected - possible network issue (read ${fileContent.length} of ${stats.size} bytes)`);
            }

            // Parse JSON
            data = JSON.parse(fileContent);

            // PRIORITY 2: Validate structure has minimum guilds
            const guildCount = Object.keys(data).filter(k => k.match(/^\d+$/)).length;
            if (guildCount < 10) {
                console.error('🚨 Loaded data missing guilds:', guildCount, '(expected 15+)');
                console.error('🚨 This may indicate corrupted read or data loss');
                console.error('🚨 Check .backup file immediately');
                throw new Error(`Invalid data structure - only ${guildCount} guilds found (expected 15+)`);
            }

            console.log(`✅ Loaded playerData.json (${fileContent.length} bytes, ${guildCount} guilds)`);

            // Initialize or ensure guild data structure
            Object.keys(data).forEach(guildId => {
                // Skip the comment entry
                if (guildId === '/* Server ID */') return;
                
                // Ensure proper structure exists
                if (!data[guildId]) {
                    data[guildId] = {
                        players: {},
                        tribes: {},
                        timezones: {}
                    };
                }
                
                // Ensure substructures exist
                if (!data[guildId].players) data[guildId].players = {};
                if (!data[guildId].tribes) {
                    data[guildId].tribes = {
                        tribe1: null, tribe1emoji: null,
                        tribe2: null, tribe2emoji: null,
                        tribe3: null, tribe3emoji: null,
                        tribe4: null, tribe4emoji: null
                    };
                }
                if (!data[guildId].timezones) data[guildId].timezones = {};
            });
        } else {
            data = {
                "/* Server ID */": null
            };
        }
        
        // Cache the full data before returning
        requestCache.set(cacheKey, data);
        return data;
    } catch (error) {
        console.error('Error in ensureStorageFile:', error);
        throw error;
    }
}

export async function loadPlayerData(guildId) {
    const cacheKey = `playerData_${guildId || 'all'}`;
    
    // Check cache first
    if (requestCache.has(cacheKey)) {
        cacheHits++;
        return requestCache.get(cacheKey);
    }
    
    cacheMisses++;
    const data = await ensureStorageFile();
    
    if (!guildId) {
        // Cache the full data
        requestCache.set(cacheKey, data);
        return data;
    }
    
    // Initialize structure if it doesn't exist
    if (!data[guildId]) {
        data[guildId] = {
            players: {},
            tribes: {
                tribe1: null, tribe1emoji: null,
                tribe2: null, tribe2emoji: null,
                tribe3: null, tribe3emoji: null,
                tribe4: null, tribe4emoji: null
            },
            timezones: {}
        };
    }
    
    // Cache the guild-specific data
    requestCache.set(cacheKey, data[guildId]);
    return data[guildId];
}

export async function savePlayerData(data) {
    // PRIORITY 1: Add 7 layers of safety to prevent data loss

    // 1. SIZE VALIDATION - Refuse if suspiciously small
    const dataStr = JSON.stringify(data, null, 2);
    if (dataStr.length < 50000) {
        console.error('🚨 REFUSING to save suspiciously small playerData:', dataStr.length, 'bytes');
        console.error('🚨 Expected >50KB (normal is 168KB), got', dataStr.length, 'bytes');
        console.error('🚨 Dumping attempted save to playerData.json.REJECTED for analysis');
        await fs.writeFile(STORAGE_FILE + '.REJECTED', dataStr);
        throw new Error(`Data validation failed - file too small (${dataStr.length} bytes < 50KB threshold)`);
    }

    // 2. STRUCTURE VALIDATION - Ensure we have enough guilds
    const guildCount = Object.keys(data).filter(k => k.match(/^\d+$/)).length;
    if (guildCount < 10) {
        console.error('🚨 REFUSING to save - only', guildCount, 'guilds (expected 15+)');
        console.error('🚨 This indicates corrupted or incomplete data structure');
        console.error('🚨 Dumping attempted save to playerData.json.REJECTED for analysis');
        await fs.writeFile(STORAGE_FILE + '.REJECTED', dataStr);
        throw new Error(`Data validation failed - only ${guildCount} guilds (expected 15+)`);
    }

    // 3. BACKUP BEFORE WRITE - Keep .backup copy for recovery
    const backupPath = STORAGE_FILE + '.backup';
    try {
        const fileExists = await fs.access(STORAGE_FILE).then(() => true).catch(() => false);
        if (fileExists) {
            await fs.copyFile(STORAGE_FILE, backupPath);
            console.log('✅ Backup created:', backupPath);
        }
    } catch (error) {
        console.error('⚠️ Backup failed:', error.message);
        // Continue anyway - better to save than lose in-memory changes
    }

    // 4. ATOMIC WRITE - Write to temp file first (prevents partial writes)
    const tempPath = STORAGE_FILE + '.tmp';
    await fs.writeFile(tempPath, dataStr);

    // 5. VERIFY TEMP FILE - Check it before committing
    const tempStats = await fs.stat(tempPath);
    if (tempStats.size < 50000) {
        await fs.unlink(tempPath);
        throw new Error(`Temp file verification failed - too small (${tempStats.size} bytes)`);
    }

    // 6. ATOMIC RENAME - This is atomic on most filesystems (prevents corruption)
    await fs.rename(tempPath, STORAGE_FILE);

    // 7. CLEAR CACHE - Only after successful write
    requestCache.clear();

    console.log(`✅ Saved playerData.json (${dataStr.length} bytes, ${guildCount} guilds)`);
}

export async function updatePlayer(guildId, playerId, data) {
    const storage = await ensureStorageFile();
    if (!storage[guildId]) {
        storage[guildId] = { players: {}, tribes: {} };
    }
    if (!storage[guildId].players) {
        storage[guildId].players = {};
    }
    if (!storage[guildId].players[playerId]) {
        storage[guildId].players[playerId] = {};
    }
    storage[guildId].players[playerId] = {
        ...storage[guildId].players[playerId],
        ...data
    };
    await savePlayerData(storage);
    return storage[guildId].players[playerId];
}

export async function getPlayer(guildId, playerId) {
    const storage = await loadPlayerData();
    if (!storage[guildId]?.players) {
        return null;
    }
    return storage[guildId].players[playerId] || null;
}

// Update getGuildTribes to include the color property from tribes
export async function getGuildTribes(guildId, castlistIdentifier = 'default') {
  const data = await loadPlayerData();
  const tribes = [];

  if (data[guildId]?.tribes) {
    Object.entries(data[guildId].tribes).forEach(([roleId, tribeData]) => {
      if (!tribeData) return; // Skip null/undefined tribe entries

      // ✅ FIX: Check BOTH legacy name field AND new ID field
      // This supports:
      // 1. Legacy castlists: tribe.castlist = "legacyList"
      // 2. Migrated castlists: tribe.castlistId = "castlist_1759638936214_system"
      // 3. Multi-castlist: tribe.castlistIds = ["default", "alumni_id"]
      // 4. Default fallback: tribes with no castlist field
      const matches = (
        // Legacy name matching
        tribeData.castlist === castlistIdentifier ||
        // New single ID matching
        tribeData.castlistId === castlistIdentifier ||
        // Multi-castlist array support
        (tribeData.castlistIds && Array.isArray(tribeData.castlistIds) &&
         tribeData.castlistIds.includes(castlistIdentifier)) ||
        // Default castlist fallback
        (!tribeData.castlist && !tribeData.castlistId && !tribeData.castlistIds && castlistIdentifier === 'default')
      );

      if (matches) {
        // Include ALL tribe data to support new features like type and rankings
        tribes.push({
          roleId,
          ...tribeData // Include all fields for extensibility (type, rankings, etc.)
        });
      }
    });
  }

  return tribes;
}

export async function updateGuildTribes(guildId, updates) {
  const data = await loadPlayerData();
  if (!data[guildId]) {
    data[guildId] = {};
  }
  if (!data[guildId].tribes) {
    data[guildId].tribes = {};
  }
  
  // Handle new tribe format
  const roleId = updates.roleId;
  if (roleId) {
    data[guildId].tribes[roleId] = {
      emoji: updates.emoji || null,
      castlist: updates.castlist || 'default'
    };
  }
  
  await savePlayerData(data);
  return data[guildId].tribes;
}

export async function getTribesByCastlist(guildId, castlistName = 'default') {
    const tribes = await getGuildTribes(guildId);
    return Object.entries(tribes)
        .filter(([_, tribe]) => tribe.castlist === castlistName)
        .reduce((acc, [id, tribe]) => {
            acc[id] = tribe;
            return acc;
        }, {});
}

export async function saveAllPlayerData(members, guild, roleConfig) {
    try {
        const guildId = guild.id;
        const data = await loadPlayerData();
        
        // Ensure guild structure exists
        if (!data[guildId]) {
            data[guildId] = {
                players: {},
                tribes: {},
                timezones: {}
            };
        }

        // Get tribe role IDs from the new structure
        const tribeRoleIds = Object.keys(data[guildId].tribes || {});

        for (const member of members) {
            // Check if member has any tribe role
            if (tribeRoleIds.some(roleId => member.roles.cache.has(roleId))) {
                if (!data[guildId].players[member.id]) {
                    data[guildId].players[member.id] = {};
                }
                // Only update if emojiCode doesn't exist
                if (!data[guildId].players[member.id].emojiCode) {
                    continue;
                }
            }
        }

        await savePlayerData(data);
        return data[guildId];
    } catch (error) {
        console.error('Error in saveAllPlayerData:', error);
        throw error;
    }
}

// Add this function to get pronouns for a guild
export async function getGuildPronouns(guildId) {
  const data = await loadPlayerData();
  if (!data[guildId]) {
    data[guildId] = {};
  }
  if (!data[guildId].pronounRoleIDs) {
    data[guildId].pronounRoleIDs = [];
  }
  return data[guildId].pronounRoleIDs;
}

// Add this function to update pronouns for a guild
export async function updateGuildPronouns(guildId, pronounRoleIDs) {
  const data = await loadPlayerData();
  if (!data[guildId]) {
    data[guildId] = {};
  }
  data[guildId].pronounRoleIDs = pronounRoleIDs;
  await savePlayerData(data);
  return data[guildId].pronounRoleIDs;
}

// Optional: Add migration function if needed
export async function migratePronounsData() {
  try {
    const data = await loadPlayerData();
    const oldPronouns = JSON.parse(fs.readFileSync('./pronouns.json'));
    
    // For each guild in the data
    for (const guildId of Object.keys(data)) {
      if (!data[guildId].pronounRoleIDs) {
        data[guildId].pronounRoleIDs = oldPronouns.pronounRoleIDs || [];
      }
    }
    
    await savePlayerData(data);
    console.log('Pronouns data migrated successfully');
  } catch (error) {
    console.error('Error migrating pronouns data:', error);
  }
}

// Add this function to get timezones for a guild
export async function getGuildTimezones(guildId) {
  const data = await loadPlayerData();
  if (!data[guildId]) {
    data[guildId] = {};
  }
  if (!data[guildId].timezones) {
    data[guildId].timezones = {};
  }
  return data[guildId].timezones;
}

// Add this function to get timezone offset for a role
export async function getTimezoneOffset(guildId, roleId) {
  const timezones = await getGuildTimezones(guildId);
  return timezones[roleId]?.offset || 0;
}

// Environment configuration functions
export async function loadEnvironmentConfig() {
  const data = await loadPlayerData();
  const isProduction = process.env.PRODUCTION === 'TRUE';
  
  if (!data.environmentConfig) {
    data.environmentConfig = {
      liveDiscordLogging: {
        enabled: false,
        targetGuildId: "1331657596087566398",
        // Environment-specific channel IDs
        productionChannelId: "1385059476243218552",  // #🪵logs (original production channel)
        developmentChannelId: "1386998800215969904", // #🪵logs-dev (new dev channel)
        // Environment-specific timezone offsets (hours to add to UTC)
        productionTimezoneOffset: 8,   // AWS server is UTC, add 8 hours for GMT+8
        developmentTimezoneOffset: 0,  // Local dev is already GMT+8, no offset needed
        excludedUserIds: {
          production: ["391415444084490240"],  // Keep you excluded in prod
          development: []                      // Allow all users in dev for testing
        },
        rateLimitQueue: [],
        lastMessageTime: 0
      }
    };
    await savePlayerData(data);
  }
  
  // Add new channel IDs and timezone offsets to existing config if they don't exist
  let configUpdated = false;
  
  if (!data.environmentConfig.liveDiscordLogging.productionChannelId) {
    data.environmentConfig.liveDiscordLogging.productionChannelId = "1385059476243218552";
    data.environmentConfig.liveDiscordLogging.developmentChannelId = "1386998800215969904";
    // Remove old single channel ID
    delete data.environmentConfig.liveDiscordLogging.targetChannelId;
    configUpdated = true;
  }
  
  if (data.environmentConfig.liveDiscordLogging.productionTimezoneOffset === undefined) {
    data.environmentConfig.liveDiscordLogging.productionTimezoneOffset = 8;   // AWS server UTC + 8 hours
    data.environmentConfig.liveDiscordLogging.developmentTimezoneOffset = 0;  // Local dev already GMT+8
    configUpdated = true;
  }

  // Migrate excludedUserIds from array to environment-specific object
  if (Array.isArray(data.environmentConfig.liveDiscordLogging.excludedUserIds)) {
    const legacyExcludedUsers = data.environmentConfig.liveDiscordLogging.excludedUserIds;
    data.environmentConfig.liveDiscordLogging.excludedUserIds = {
      production: legacyExcludedUsers,  // Keep existing exclusions in production
      development: []                  // Allow all users in development for testing
    };
    configUpdated = true;
    console.log('📊 Migrated excludedUserIds to environment-specific format');
  }
  
  if (configUpdated) {
    await savePlayerData(data);
  }
  
  return data.environmentConfig;
}

export async function saveEnvironmentConfig(config) {
  const data = await loadPlayerData();
  
  // Create a clean copy without runtime-only fields
  const cleanConfig = {
    ...config,
    liveDiscordLogging: {
      ...config.liveDiscordLogging,
      // Remove runtime-only fields that should never be persisted
      rateLimitQueue: undefined,
      lastMessageTime: undefined
    }
  };
  
  // Remove undefined fields
  if (cleanConfig.liveDiscordLogging.rateLimitQueue === undefined) {
    delete cleanConfig.liveDiscordLogging.rateLimitQueue;
  }
  if (cleanConfig.liveDiscordLogging.lastMessageTime === undefined) {
    delete cleanConfig.liveDiscordLogging.lastMessageTime;
  }
  
  data.environmentConfig = cleanConfig;
  await savePlayerData(data);
}

// Get the appropriate channel ID based on current environment
export async function getLoggingChannelId() {
  const config = await loadEnvironmentConfig();
  const isProduction = process.env.PRODUCTION === 'TRUE';
  
  return isProduction 
    ? config.liveDiscordLogging.productionChannelId 
    : config.liveDiscordLogging.developmentChannelId;
}

// Get the appropriate timezone offset based on current environment
export async function getLoggingTimezoneOffset() {
  const config = await loadEnvironmentConfig();
  const isProduction = process.env.PRODUCTION === 'TRUE';
  
  return isProduction 
    ? config.liveDiscordLogging.productionTimezoneOffset 
    : config.liveDiscordLogging.developmentTimezoneOffset;
}

export async function updateLiveLoggingStatus(enabled) {
  const config = await loadEnvironmentConfig();
  config.liveDiscordLogging.enabled = enabled;
  await saveEnvironmentConfig(config);
  return config.liveDiscordLogging;
}

// Reaction mapping persistence functions
export async function saveReactionMapping(guildId, messageId, roleMapping) {
  const data = await loadPlayerData();
  
  // Initialize guild structure if needed
  if (!data[guildId]) {
    data[guildId] = {
      players: {},
      tribes: {},
      timezones: {},
      pronounRoleIDs: []
    };
  }
  
  // Initialize reaction mappings structure if it doesn't exist
  if (!data[guildId].reactionMappings) {
    data[guildId].reactionMappings = {};
  }
  
  // Store the mapping with metadata
  data[guildId].reactionMappings[messageId] = {
    mapping: roleMapping,
    createdAt: Date.now(),
    lastAccessed: Date.now()
  };
  
  await savePlayerData(data);
  console.log(`💾 Saved reaction mapping for message ${messageId} in guild ${guildId}`);
}

export async function getReactionMapping(guildId, messageId) {
  const data = await loadPlayerData();
  if (!data[guildId] || !data[guildId].reactionMappings || !data[guildId].reactionMappings[messageId]) {
    return null;
  }
  
  // Update last accessed time
  data[guildId].reactionMappings[messageId].lastAccessed = Date.now();
  await savePlayerData(data);
  
  return data[guildId].reactionMappings[messageId].mapping;
}

export async function deleteReactionMapping(guildId, messageId) {
  const data = await loadPlayerData();
  if (data[guildId] && data[guildId].reactionMappings && data[guildId].reactionMappings[messageId]) {
    delete data[guildId].reactionMappings[messageId];
    await savePlayerData(data);
    console.log(`🗑️ Deleted reaction mapping for message ${messageId} in guild ${guildId}`);
  }
}

export async function loadAllReactionMappings(guildId) {
  const data = await loadPlayerData();
  if (!data[guildId] || !data[guildId].reactionMappings) {
    return {};
  }
  return data[guildId].reactionMappings;
}

// Clean up old reaction mappings (older than 30 days)
export async function cleanupOldReactionMappings(guildId) {
  const data = await loadPlayerData();
  if (!data[guildId] || !data[guildId].reactionMappings) return 0;
  
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  let cleanedCount = 0;
  
  for (const [messageId, mappingData] of Object.entries(data[guildId].reactionMappings)) {
    if (mappingData.createdAt < thirtyDaysAgo) {
      delete data[guildId].reactionMappings[messageId];
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    await savePlayerData(data);
    console.log(`🧹 Cleaned up ${cleanedCount} old reaction mappings in guild ${guildId}`);
  }
  
  return cleanedCount;
}

// Clean up missing roles from both timezones and pronouns data
export async function cleanupMissingRoles(guildId, guild) {
  const data = await loadPlayerData();
  if (!data[guildId]) return { cleaned: 0, errors: [] };
  
  let cleanedCount = 0;
  const errors = [];
  
  // Clean up timezone roles
  if (data[guildId].timezones) {
    const timezoneRoleIds = Object.keys(data[guildId].timezones);
    for (const roleId of timezoneRoleIds) {
      try {
        const discordRole = guild.roles.cache.get(roleId);
        if (!discordRole) {
          console.log(`🧹 CLEANUP: Removing missing timezone role ${roleId} from guild ${guildId}`);
          delete data[guildId].timezones[roleId];
          cleanedCount++;
        }
      } catch (error) {
        console.log(`⚠️ WARNING: Error checking timezone role ${roleId}:`, error.message);
        errors.push(`timezone role ${roleId}: ${error.message}`);
      }
    }
  }
  
  // Clean up pronoun roles
  if (data[guildId].pronounRoleIDs && Array.isArray(data[guildId].pronounRoleIDs)) {
    const validPronounRoles = [];
    for (const roleId of data[guildId].pronounRoleIDs) {
      try {
        const discordRole = guild.roles.cache.get(roleId);
        if (discordRole) {
          validPronounRoles.push(roleId);
        } else {
          console.log(`🧹 CLEANUP: Removing missing pronoun role ${roleId} from guild ${guildId}`);
          cleanedCount++;
        }
      } catch (error) {
        console.log(`⚠️ WARNING: Error checking pronoun role ${roleId}:`, error.message);
        errors.push(`pronoun role ${roleId}: ${error.message}`);
      }
    }
    data[guildId].pronounRoleIDs = validPronounRoles;
  }
  
  // Save changes if any cleanup occurred
  if (cleanedCount > 0) {
    await savePlayerData(data);
    console.log(`🧹 CLEANUP: Cleaned up ${cleanedCount} missing roles in guild ${guildId}`);
  }
  
  return { cleaned: cleanedCount, errors };
}

/**
 * Get all applications for a guild from playerData
 * @param {string} guildId - Guild ID
 * @returns {Array} Array of application objects
 */
export async function getAllApplicationsFromData(guildId) {
  const playerData = await loadPlayerData();
  const guildApplications = playerData[guildId]?.applications || {};
  return Object.values(guildApplications);
}

/**
 * Get applications filtered by season configId
 * @param {string} guildId - Guild ID
 * @param {string} configId - Season config ID to filter by
 * @returns {Array} Array of applications for the specified season
 */
export async function getApplicationsForSeason(guildId, configId) {
  const playerData = await loadPlayerData();
  const guildApplications = playerData[guildId]?.applications || {};
  
  return Object.values(guildApplications).filter(app => {
    // Handle backward compatibility for applications without configId
    if (!app.configId || app.configId === 'unknown') {
      // Applications without configId are treated as legacy and excluded from season filtering
      return false;
    }
    return app.configId === configId;
  });
}

/**
 * Create a new season in the unified season registry
 * @param {string} guildId - Guild ID
 * @param {Object} seasonData - Season data including name, userId, source
 * @returns {string} The created season ID
 */
export async function createSeason(guildId, seasonData) {
  const playerData = await loadPlayerData();
  const guildData = playerData[guildId] || {};
  
  if (!guildData.seasons) {
    guildData.seasons = {};
  }
  
  const seasonId = `season_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  guildData.seasons[seasonId] = {
    id: seasonId,
    name: seasonData.name,
    createdAt: Date.now(),
    createdBy: seasonData.userId,
    source: seasonData.source || 'manual',
    archived: false,
    linkedEntities: {
      applicationConfigs: [],
      tribes: [],
      castRankings: []
    }
  };
  
  playerData[guildId] = guildData;
  await savePlayerData(playerData);
  
  console.log(`📅 Created new season: ${seasonData.name} (${seasonId}) from ${seasonData.source}`);
  return seasonId;
}

/**
 * Get all seasons for a guild
 * @param {string} guildId - Guild ID
 * @returns {Array} Array of season objects
 */
export async function getAllSeasons(guildId) {
  const playerData = await loadPlayerData();
  const guildData = playerData[guildId] || {};
  const seasons = guildData.seasons || {};
  
  // Also check for seasons in applicationConfigs for backwards compatibility
  const applicationConfigs = guildData.applicationConfigs || {};
  const configSeasons = [];
  
  for (const [configId, config] of Object.entries(applicationConfigs)) {
    if (config.seasonId && !seasons[config.seasonId]) {
      // Create season entry from config for backwards compatibility
      configSeasons.push({
        id: config.seasonId,
        name: config.seasonName || 'Unknown Season',
        source: 'application_builder',
        createdAt: 0,
        archived: false,
        linkedEntities: {
          applicationConfigs: [configId],
          tribes: [],
          castRankings: []
        }
      });
    }
  }
  
  return [...Object.values(seasons), ...configSeasons];
}

/**
 * Get a specific season
 * @param {string} guildId - Guild ID
 * @param {string} seasonId - Season ID
 * @returns {Object|null} Season object or null if not found
 */
export async function getSeason(guildId, seasonId) {
  const seasons = await getAllSeasons(guildId);
  return seasons.find(s => s.id === seasonId) || null;
}

/**
 * Link a season to an entity (tribe, config, etc.)
 * @param {string} guildId - Guild ID
 * @param {string} seasonId - Season ID
 * @param {string} entityType - Type of entity (tribes, applicationConfigs, castRankings)
 * @param {string} entityId - Entity ID
 */
export async function linkSeasonToEntity(guildId, seasonId, entityType, entityId) {
  const playerData = await loadPlayerData();
  const guildData = playerData[guildId] || {};
  
  if (!guildData.seasons) {
    guildData.seasons = {};
  }
  
  // Ensure season exists
  let season = guildData.seasons[seasonId];
  if (!season) {
    // Check if it's from applicationConfigs
    const configs = guildData.applicationConfigs || {};
    const config = Object.values(configs).find(c => c.seasonId === seasonId);
    if (config) {
      // Create season entry for backwards compatibility
      season = {
        id: seasonId,
        name: config.seasonName || 'Unknown Season',
        source: 'application_builder',
        createdAt: Date.now(),
        archived: false,
        linkedEntities: {
          applicationConfigs: [],
          tribes: [],
          castRankings: []
        }
      };
      guildData.seasons[seasonId] = season;
    } else {
      console.warn(`⚠️ Cannot link to non-existent season: ${seasonId}`);
      return;
    }
  }
  
  if (season.linkedEntities[entityType] && !season.linkedEntities[entityType].includes(entityId)) {
    season.linkedEntities[entityType].push(entityId);
    playerData[guildId] = guildData;
    await savePlayerData(playerData);
    console.log(`🔗 Linked ${entityType}:${entityId} to season ${seasonId}`);
  }
}

/**
 * Archive a season (soft delete)
 * @param {string} guildId - Guild ID
 * @param {string} seasonId - Season ID
 * @returns {boolean} True if archived, false if has dependencies
 */
export async function archiveSeason(guildId, seasonId) {
  const playerData = await loadPlayerData();
  const season = playerData[guildId]?.seasons?.[seasonId];
  
  if (!season) {
    console.warn(`⚠️ Cannot archive non-existent season: ${seasonId}`);
    return false;
  }
  
  // Check for active dependencies
  const dependencies = [];
  if (season.linkedEntities.applicationConfigs?.length > 0) {
    dependencies.push(`${season.linkedEntities.applicationConfigs.length} application configs`);
  }
  if (season.linkedEntities.tribes?.length > 0) {
    dependencies.push(`${season.linkedEntities.tribes.length} castlist tribes`);
  }
  if (season.linkedEntities.castRankings?.length > 0) {
    dependencies.push(`${season.linkedEntities.castRankings.length} cast rankings`);
  }
  
  if (dependencies.length > 0) {
    console.log(`⚠️ Cannot archive season with dependencies: ${dependencies.join(', ')}`);
    return false;
  }
  
  season.archived = true;
  season.archivedAt = Date.now();
  await savePlayerData(playerData);
  
  console.log(`📦 Archived season: ${season.name} (${seasonId})`);
  return true;
}

/**
 * Migrate existing seasons to unified registry
 * @param {string} guildId - Guild ID
 */
export async function migrateToUnifiedSeasons(guildId) {
  const playerData = await loadPlayerData();
  const guildData = playerData[guildId] || {};
  
  // Initialize seasons registry if not exists
  if (!guildData.seasons) {
    guildData.seasons = {};
  }
  
  let migrated = 0;
  
  // Migrate from applicationConfigs
  const configs = guildData.applicationConfigs || {};
  for (const [configId, config] of Object.entries(configs)) {
    if (config.seasonId && !guildData.seasons[config.seasonId]) {
      guildData.seasons[config.seasonId] = {
        id: config.seasonId,
        name: config.seasonName || 'Unknown Season',
        source: 'application_builder',
        createdAt: Date.now(),
        createdBy: null,
        archived: false,
        linkedEntities: {
          applicationConfigs: [configId],
          tribes: [],
          castRankings: []
        }
      };
      migrated++;
    } else if (config.seasonId && guildData.seasons[config.seasonId]) {
      // Link existing season to config
      if (!guildData.seasons[config.seasonId].linkedEntities.applicationConfigs.includes(configId)) {
        guildData.seasons[config.seasonId].linkedEntities.applicationConfigs.push(configId);
      }
    }
  }
  
  // Future: Migrate alumni castlists with seasons
  const tribes = guildData.tribes || {};
  for (const [tribeId, tribe] of Object.entries(tribes)) {
    if (!tribe) continue; // Skip null/undefined tribe entries
    if (tribe.seasonId && guildData.seasons[tribe.seasonId]) {
      if (!guildData.seasons[tribe.seasonId].linkedEntities.tribes.includes(tribeId)) {
        guildData.seasons[tribe.seasonId].linkedEntities.tribes.push(tribeId);
      }
    }
  }
  
  if (migrated > 0) {
    playerData[guildId] = guildData;
    await savePlayerData(playerData);
    console.log(`🔄 Migrated ${migrated} seasons to unified registry for guild ${guildId}`);
  }
  
  return migrated;
}
