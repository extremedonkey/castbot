/**
 * Data Nuker Module
 * 
 * Generic module for safely wiping different types of data from the system.
 * Provides confirmation dialogs and handles the actual data deletion.
 * 
 * Currently supports:
 * - playerData: All guild data from playerData.json
 * - safariContent: All Safari data from safariContent.json
 * - roles: All CastBot-managed Discord roles
 */

import { loadPlayerData, savePlayerData } from './storage.js';
import { nukeRoles } from './roleManager.js';

/**
 * Data type configurations
 */
const DATA_CONFIGS = {
  playerData: {
    displayName: 'playerData.json',
    warningItems: [
      'All Season Application Data (season questions, player applications)',
      'All Player Data (age, pronoun, timezone, etc)',
      'All Safari Data (currency, inventory, map progress)',
      'Analytics version info stored in playerData.json',
      '**EVERYTHING** stored for this guild in playerData.json'
    ],
    note: 'This only affects playerData.json. Other files (safariContent.json, etc) are NOT affected.',
    loadFunction: () => loadPlayerData(), // Call without guildId to get all data
    saveFunction: savePlayerData,
    getServerName: (data, guildId) => data[guildId]?.serverName || 'Unknown Server',
    deleteData: (data, guildId) => {
      delete data[guildId];
      return data;
    }
  },
  safariContent: {
    displayName: 'safariContent.json',
    warningItems: [
      'All Safari maps and configurations',
      'All custom Safari buttons and actions',
      'All Safari stores and items',
      'All Safari terminology customizations',
      '**EVERYTHING** Safari-related for this guild'
    ],
    note: 'This only affects safariContent.json. Player progress in playerData.json is NOT affected.',
    loadFunction: async () => {
      const { loadSafariContent } = await import('./safariManager.js');
      return loadSafariContent();
    },
    saveFunction: async (data) => {
      const { saveSafariContent } = await import('./safariManager.js');
      return saveSafariContent(data);
    },
    getServerName: async (data, guildId) => {
      // Try to get from playerData as safari doesn't store server names
      const playerData = await loadPlayerData();
      return playerData[guildId]?.serverName || 'Unknown Server';
    },
    deleteData: (data, guildId) => {
      delete data[guildId];
      return data;
    }
  },
  roles: {
    displayName: 'Discord Roles',
    warningItems: [
      'All timezone roles (PST, EST, GMT, etc.)',
      'All pronoun roles created by CastBot',
      'All temporary event/season roles',
      'Stored pronoun and timezone configurations',
      '**ALL** CastBot-managed Discord roles'
    ],
    note: 'This will DELETE actual Discord roles from your server. User data in playerData.json is preserved.',
    requiresClient: true, // Special flag - needs Discord client
    loadFunction: async () => {
      // For roles, we don't load from a file, just return empty object
      return {};
    },
    saveFunction: async () => {
      // No save operation for roles
      return true;
    },
    getServerName: async (data, guildId) => {
      const playerData = await loadPlayerData();
      return playerData[guildId]?.serverName || 'Unknown Server';
    },
    deleteData: async (data, guildId, context) => {
      // For roles, we need to call the nukeRoles function
      if (!context?.client) {
        throw new Error('Discord client required for role operations');
      }
      const results = await nukeRoles(guildId, context.client);
      return results;
    }
  }
};

/**
 * Create confirmation dialog UI for data nuke
 * @param {string} dataType - Type of data to nuke (playerData, safariContent, etc)
 * @param {string} guildId - Guild ID
 * @param {string} serverName - Server name for display
 * @returns {Object} Components V2 Container structure
 */
export function createNukeConfirmationUI(dataType, guildId, serverName) {
  const config = DATA_CONFIGS[dataType];
  if (!config) {
    throw new Error(`Unknown data type: ${dataType}`);
  }

  const warningList = config.warningItems.map(item => `• ${item}`).join('\n');
  
  return {
    type: 17, // Container
    components: [
      {
        type: 10, // Text Display
        content: '☢️ **DANGER ZONE - DATA NUKE**'
      },
      {
        type: 14 // Separator
      },
      {
        type: 10, // Text Display
        content: `⚠️ **WARNING**: This action will **PERMANENTLY DELETE** all data from ${config.displayName} for:\n\n**Server:** ${serverName}\n**Guild ID:** ${guildId}\n\n**This will remove from ${config.displayName}:**\n${warningList}\n\n**Note:** ${config.note}\n\n**This action CANNOT be undone!**`
      },
      {
        type: 14 // Separator
      },
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 4, // Danger
            label: 'Yes, Nuke All Data',
            custom_id: `nuke_${dataType}_confirm`,
            emoji: { name: '⚠️' }
          },
          {
            type: 2, // Button
            style: 2, // Secondary
            label: 'Cancel',
            custom_id: `nuke_${dataType}_cancel`,
            emoji: { name: '❌' }
          }
        ]
      }
    ]
  };
}

/**
 * Create success message after nuking data
 * @param {string} dataType - Type of data nuked
 * @param {string} serverName - Server name
 * @param {string} guildId - Guild ID
 * @returns {Object} Components V2 Container structure
 */
export function createNukeSuccessUI(dataType, serverName, guildId) {
  const config = DATA_CONFIGS[dataType];
  
  return {
    type: 17, // Container
    components: [
      {
        type: 10, // Text Display
        content: `☢️ **DATA NUKED SUCCESSFULLY**\n\nAll ${config.displayName} entries for **${serverName}** (Guild ID: ${guildId}) have been permanently deleted.\n\nThe guild has been completely reset to a blank state in ${config.displayName}.`
      }
    ]
  };
}

/**
 * Create "no data found" message
 * @param {string} dataType - Type of data
 * @param {string} guildId - Guild ID
 * @returns {Object} Components V2 Container structure
 */
export function createNoDataUI(dataType, guildId) {
  const config = DATA_CONFIGS[dataType];
  
  return {
    type: 17, // Container
    components: [
      {
        type: 10, // Text Display
        content: `⚠️ No data found for guild ${guildId} in ${config.displayName}. Nothing to nuke.`
      }
    ]
  };
}

/**
 * Create cancellation message
 * @returns {Object} Components V2 Container structure
 */
export function createNukeCancelUI() {
  return {
    type: 17, // Container
    components: [
      {
        type: 10, // Text Display
        content: '❌ **Data nuke cancelled**\n\nNo data was deleted. The guild data remains intact.'
      }
    ]
  };
}

/**
 * Handle the initial nuke button click - show confirmation
 * @param {string} dataType - Type of data to nuke
 * @param {Object} context - Button context from ButtonHandlerFactory
 * @returns {Object} Response object for Discord
 */
export async function handleNukeRequest(dataType, context) {
  console.log(`☢️ NUKE DATA WARNING: ${dataType} for Guild ${context.guildId}, User ${context.userId}`);
  
  // Security check - only allow specific Discord ID
  if (context.userId !== '391415444084490240') {
    console.log(`❌ ACCESS DENIED: nuke_${dataType} - user ${context.userId} not authorized`);
    return {
      content: 'Access denied. This feature is restricted.',
      ephemeral: true
    };
  }
  
  const config = DATA_CONFIGS[dataType];
  if (!config) {
    return {
      content: `❌ Unknown data type: ${dataType}`,
      ephemeral: true
    };
  }
  
  // Load data to get server name
  const data = await config.loadFunction();
  const serverName = await Promise.resolve(config.getServerName(data, context.guildId));
  
  // Create and return confirmation UI
  const confirmationContainer = createNukeConfirmationUI(dataType, context.guildId, serverName);
  
  return {
    content: '',
    components: [confirmationContainer]
  };
}

/**
 * Handle confirmation of data nuke
 * @param {string} dataType - Type of data to nuke
 * @param {Object} context - Button context from ButtonHandlerFactory
 * @returns {Object} Response object for Discord
 */
export async function handleNukeConfirm(dataType, context) {
  console.log(`☢️ NUKE DATA CONFIRMED: ${dataType} for Guild ${context.guildId}, User ${context.userId}`);
  
  // Security check
  if (context.userId !== '391415444084490240') {
    console.log(`❌ ACCESS DENIED: nuke_${dataType}_confirm - user ${context.userId} not authorized`);
    return {
      components: [createNoDataUI(dataType, context.guildId)]
    };
  }
  
  const config = DATA_CONFIGS[dataType];
  if (!config) {
    return {
      components: [createNoDataUI(dataType, context.guildId)]
    };
  }
  
  // Get server name
  const serverName = await Promise.resolve(config.getServerName({}, context.guildId));
  
  // Special handling for roles
  if (dataType === 'roles') {
    console.log(`☢️ NUKING ROLES for guild ${context.guildId} (${serverName})`);
    
    try {
      // Execute the role nuke
      const results = await config.deleteData({}, context.guildId, context);
      
      // Create custom success message for roles (deferred response doesn't use Container)
      return {
        content: [
          `☢️ **ROLES NUKED SUCCESSFULLY**`,
          ``,
          `Server: **${serverName}** (Guild ID: ${context.guildId})`,
          ``,
          `**Results:**`,
          `• Roles Deleted: **${results.rolesDeleted}**`,
          `• Pronouns Cleared: **${results.pronounsCleared}**`,
          `• Timezones Cleared: **${results.timezonesCleared}**`,
          results.errors.length > 0 ? `\n**Errors:**\n${results.errors.map(e => `• ${e}`).join('\n')}` : '',
          ``,
          `🎯 **Next Step:** Run \`/menu\` → Production Menu → Setup to configure fresh roles!`
        ].filter(Boolean).join('\n')
      };
    } catch (error) {
      console.error(`❌ ERROR nuking roles: ${error.message}`);
      return {
        content: `❌ **Error nuking roles:** ${error.message}`
      };
    }
  }
  
  // Standard handling for file-based data
  const data = await config.loadFunction();
  
  // Check if data exists for this guild
  if (data[context.guildId]) {
    console.log(`☢️ NUKING DATA for guild ${context.guildId} (${serverName}) from ${config.displayName}`);
    
    // Delete the data
    const updatedData = config.deleteData(data, context.guildId);
    
    // Save the updated data
    await config.saveFunction(updatedData);
    
    return {
      components: [createNukeSuccessUI(dataType, serverName, context.guildId)]
    };
  } else {
    return {
      components: [createNoDataUI(dataType, context.guildId)]
    };
  }
}

/**
 * Handle cancellation of data nuke
 * @param {Object} context - Button context from ButtonHandlerFactory
 * @returns {Object} Response object for Discord
 */
export async function handleNukeCancel(context) {
  console.log(`❌ NUKE DATA CANCELLED: Guild ${context.guildId}, User ${context.userId}`);
  
  return {
    components: [createNukeCancelUI()]
  };
}

export default {
  handleNukeRequest,
  handleNukeConfirm,
  handleNukeCancel,
  createNukeConfirmationUI,
  createNukeSuccessUI,
  createNoDataUI,
  createNukeCancelUI
};