import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_FILE = path.join(__dirname, 'playerData.json');

async function ensureStorageFile() {
    try {
        let data;
        const exists = await fs.access(STORAGE_FILE).then(() => true).catch(() => false);
        
        if (exists) {
            data = JSON.parse(await fs.readFile(STORAGE_FILE, 'utf8'));
            
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
        return data;
    } catch (error) {
        console.error('Error in ensureStorageFile:', error);
        throw error;
    }
}

export async function loadPlayerData(guildId) {
    const data = await ensureStorageFile();
    if (!guildId) {
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
    
    return data[guildId];
}

export async function savePlayerData(data) {
    await fs.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2));
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
export async function getGuildTribes(guildId, castlist = 'default') {
  const data = await loadPlayerData();
  const tribes = [];
  
  if (data[guildId]?.tribes) {
    Object.entries(data[guildId].tribes).forEach(([roleId, tribeData]) => {
      if (tribeData.castlist === castlist) {
        tribes.push({
          roleId,
          emoji: tribeData.emoji,
          color: tribeData.color, // Make sure we include the color property
          castlist: tribeData.castlist,
          showPlayerEmojis: tribeData.showPlayerEmojis // Include the emoji visibility setting
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
