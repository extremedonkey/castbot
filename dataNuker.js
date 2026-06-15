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
 * Convert dataType (camelCase) to snake_case for custom_ids
 * @param {string} dataType - Data type in camelCase (playerData, safariContent, roles)
 * @returns {string} snake_case version for use in button custom_ids
 */
function convertToSnakeCase(dataType) {
  return dataType
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

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
            custom_id: `nuke_${convertToSnakeCase(dataType)}_confirm`,
            emoji: { name: '⚠️' }
          },
          {
            type: 2, // Button
            style: 2, // Secondary
            label: 'Cancel',
            custom_id: `nuke_${convertToSnakeCase(dataType)}_cancel`,
            emoji: { name: '❌' }
          }
        ]
      }
    ]
  };
}

/**
 * Action Row with a single "← Data" button returning to the Data Management menu.
 * @returns {Object} Components V2 Action Row
 */
function backToDataRow() {
  return {
    type: 1, // Action Row
    components: [
      { type: 2, style: 2, label: '← Data', custom_id: 'data_admin' } // Secondary
    ]
  };
}

/**
 * Create success message after nuking data (LeanUI conventions).
 * @param {string} dataType - Type of data nuked
 * @param {string} serverName - Server name
 * @param {string} guildId - Guild ID
 * @param {Object} [results] - Optional results (roles nuke): { rolesDeleted, pronounsCleared, timezonesCleared, errors }
 * @returns {Object} Components V2 Container structure
 */
export function createNukeSuccessUI(dataType, serverName, guildId, results = null) {
  const config = DATA_CONFIGS[dataType];

  const lines = [`-# Server: **${serverName}** \`${guildId}\``, ''];
  if (results) {
    // Roles nuke — show deletion counts
    lines.push(`• Roles Deleted: **${results.rolesDeleted}**`);
    lines.push(`• Pronouns Cleared: **${results.pronounsCleared}**`);
    lines.push(`• Timezones Cleared: **${results.timezonesCleared}**`);
    if (results.errors?.length > 0) {
      lines.push('', `**Errors:**`, ...results.errors.map(e => `• ${e}`));
    }
  } else {
    // File-based nuke — generic reset confirmation
    lines.push(`All ${config.displayName} entries for this guild have been permanently deleted.`);
    lines.push(`The guild is now reset to a blank state in ${config.displayName}.`);
  }

  return {
    type: 17, // Container
    accent_color: 0x27ae60, // Green — completed
    components: [
      { type: 10, content: `## ☢️ ${config.displayName} Nuked` },
      { type: 14 },
      { type: 10, content: '### ```📊 Results```' },
      { type: 10, content: lines.join('\n') },
      { type: 14 },
      backToDataRow()
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
    accent_color: 0xf39c12, // Orange — caution/no-op
    components: [
      { type: 10, content: `## ⚠️ Nothing to Nuke` },
      { type: 14 },
      { type: 10, content: `-# Guild \`${guildId}\`\n\nNo data found in **${config.displayName}**. Nothing was deleted.` },
      { type: 14 },
      backToDataRow()
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
    accent_color: 0x3498DB, // Blue — neutral
    components: [
      { type: 10, content: `## ❌ Nuke Cancelled` },
      { type: 14 },
      { type: 10, content: '-# No data was deleted. The guild data remains intact.' },
      { type: 14 },
      backToDataRow()
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

      // Components V2 success Container (PATCHes the parent confirmation message in place)
      return {
        components: [createNukeSuccessUI('roles', serverName, context.guildId, results)]
      };
    } catch (error) {
      console.error(`❌ ERROR nuking roles: ${error.message}`);
      return {
        components: [{
          type: 17, // Container
          accent_color: 0xe74c3c, // Red — error
          components: [
            { type: 10, content: `## ❌ Error Nuking Roles` },
            { type: 14 },
            { type: 10, content: `-# ${error.message}` },
            { type: 14 },
            backToDataRow()
          ]
        }]
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