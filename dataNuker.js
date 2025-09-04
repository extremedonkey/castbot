/**
 * Data Nuker Module
 * 
 * Generic module for safely wiping different types of data from the system.
 * Provides confirmation dialogs and handles the actual data deletion.
 * 
 * Currently supports:
 * - playerData: All guild data from playerData.json
 * - safariContent: All Safari data from safariContent.json (coming soon)
 */

import { loadPlayerData, savePlayerData } from './dataManager.js';

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
    loadFunction: loadPlayerData,
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
    getServerName: (data, guildId) => {
      // Try to get from playerData as safari doesn't store server names
      return 'Current Server';
    },
    deleteData: (data, guildId) => {
      delete data[guildId];
      return data;
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
  const serverName = config.getServerName(data, context.guildId);
  
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
  
  // Load data
  const data = await config.loadFunction();
  const serverName = config.getServerName(data, context.guildId);
  
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