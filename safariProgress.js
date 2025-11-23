/**
 * Safari Progress Module
 * Provides comprehensive overview of safari map state across all coordinates
 * Shows configured actions, conditions, and claim status for admin debugging
 */

import { loadSafariContent } from './safariManager.js';
import { loadPlayerData } from './storage.js';
import { InteractionResponseFlags } from 'discord-interactions';

// Constants
const ROWS_PER_PAGE = 1; // Show one row (A1-A10, B1-B10, etc) per page
const MAX_COLUMNS = 10; // Standard grid is A-Z, 1-10
const CHARACTER_LIMIT = 3500; // Leave buffer for Components V2 structure

/**
 * Create the main Safari Progress UI for a specific row
 * @param {string} guildId - Discord guild ID
 * @param {string} currentRow - Current row letter (A, B, C, etc)
 * @param {Object} client - Discord client for user lookup
 * @returns {Object} Discord Components V2 response
 */
export async function createSafariProgressUI(guildId, currentRow = 'A', client = null) {
  console.log(`🚀 Creating Safari Progress UI for guild ${guildId}, row ${currentRow}`);
  
  // Load data
  const safariData = await loadSafariContent();
  const playerData = await loadPlayerData();
  const guildData = safariData[guildId] || {};
  const activeMapId = guildData.maps?.active;
  
  if (!activeMapId || !guildData.maps?.[activeMapId]) {
    return {
      components: [{
        type: 17, // Container
        components: [{
          type: 10, // Text Display
          content: '❌ No active safari map found for this server.'
        }]
      }],
      flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL
    };
  }
  
  const mapData = guildData.maps[activeMapId];
  const coordinates = mapData.coordinates || {};
  const buttons = guildData.buttons || {};
  const items = guildData.items || {};
  
  // Build content for the current row
  let content = `# 🗺️ Safari Progress Overview - Row ${currentRow}\n\n`;
  let hasContent = false;
  let characterCount = content.length;
  
  // Process each coordinate in the row
  const coordSections = [];
  for (let col = 1; col <= MAX_COLUMNS; col++) {
    const coord = `${currentRow}${col}`;
    const coordData = coordinates[coord];
    
    if (!coordData) continue;
    
    // Check if coordinate has any content
    const hasActions = coordData.buttons && coordData.buttons.length > 0;
    const hasItemDrops = coordData.itemDrops && coordData.itemDrops.length > 0;
    const hasCurrencyDrops = coordData.currencyDrops && coordData.currencyDrops.length > 0;
    
    if (!hasActions && !hasItemDrops && !hasCurrencyDrops) continue;
    
    hasContent = true;
    let coordSection = `## 📍 ${coord}${coordData.baseContent?.title ? ` - ${coordData.baseContent.title.replace('📍 Location ', '')}` : ''}\n`;
    
    // Process Custom Actions
    if (hasActions) {
      const actionCount = coordData.buttons.length;
      coordSection += `**🎯 Custom Actions (${actionCount})**\n\n`;
      
      for (const buttonId of coordData.buttons) {
        const button = buttons[buttonId];
        if (!button) {
          coordSection += `• ❌ Missing button: ${buttonId}\n`;
          continue;
        }
        
        // Button header with trigger type
        const triggerType = button.trigger?.type || 'button';
        const triggerEmoji = triggerType === 'modal' ? '📝' : '🔘';
        coordSection += `${triggerEmoji} **${button.name || button.label || 'Unnamed Action'}** (${getTriggerTypeLabel(triggerType)}`;
        
        if (triggerType === 'modal' && button.trigger?.modal?.keywords?.length > 0) {
          coordSection += ` - keywords: "${button.trigger.modal.keywords.join('", "')}"`;
        }
        coordSection += ')\n';
        
        // Conditions
        if (button.conditions && button.conditions.items && button.conditions.items.length > 0) {
          coordSection += `├─ 📋 Conditions: ${formatConditions(button.conditions, items)}\n`;
        }
        
        // Actions
        if (button.actions && button.actions.length > 0) {
          coordSection += `└─ 🎬 Actions:\n`;
          
          for (let i = 0; i < button.actions.length; i++) {
            const action = button.actions[i];
            const isLast = i === button.actions.length - 1;
            const prefix = isLast ? '   └─' : '   ├─';
            
            coordSection += await formatAction(action, prefix, guildId, items, playerData, client, buttons);
          }
        }
        
        coordSection += '\n';
      }
    }
    
    // Process Item Drops
    if (hasItemDrops) {
      coordSection += `**💎 Item Drops (${coordData.itemDrops.length})**\n`;
      
      for (const drop of coordData.itemDrops) {
        const item = items[drop.itemId];
        const itemName = item?.name || `[Unknown Item: ${drop.itemId}]`;
        
        coordSection += `• ${itemName} [${formatDropType(drop.dropType)}]`;
        
        if (drop.claimedBy && drop.claimedBy.length > 0) {
          const claimInfo = await formatClaimInfo(drop.claimedBy, drop.dropType, playerData[guildId], client);
          coordSection += `\n  └─ ${claimInfo}`;
        } else if (drop.dropType !== 'unlimited') {
          coordSection += '\n  └─ Claimed by: 🎁 Unclaimed';
        }
        
        coordSection += '\n';
      }
      coordSection += '\n';
    }
    
    // Process Currency Drops
    if (hasCurrencyDrops) {
      coordSection += `**🪙 Currency Drops (${coordData.currencyDrops.length})**\n`;
      
      for (const drop of coordData.currencyDrops) {
        coordSection += `• ${drop.amount} coins [${formatDropType(drop.dropType)}]`;
        
        if (drop.claimedBy && drop.claimedBy.length > 0) {
          const claimInfo = await formatClaimInfo(drop.claimedBy, drop.dropType, playerData[guildId], client);
          coordSection += `\n  └─ ${claimInfo}`;
        } else if (drop.dropType !== 'unlimited') {
          coordSection += '\n  └─ Claimed by: 🎁 Unclaimed';
        }
        
        coordSection += '\n';
      }
    }
    
    // Check character limit
    if (characterCount + coordSection.length > CHARACTER_LIMIT) {
      content += `*... and more coordinates. Character limit reached.*\n`;
      break;
    }
    
    coordSections.push(coordSection.trimEnd());
    characterCount += coordSection.length;
  }
  
  if (!hasContent) {
    content += `*No actions, items, or currency configured for Row ${currentRow}*\n`;
  }
  
  // Create navigation components
  const navigationButtons = createNavigationButtons(currentRow, activeMapId, coordinates);
  
  // Build components with Components V2 dividers between coordinates
  const components = [];
  
  // Add coordSections with dividers between them
  if (hasContent && coordSections.length > 0) {
    for (let i = 0; i < coordSections.length; i++) {
      // Add coordinate content
      components.push({
        type: 10, // Text Display
        content: coordSections[i].trim()
      });
      
      // Add divider between coordinates (but not after the last one)
      if (i < coordSections.length - 1) {
        components.push({
          type: 14, // Separator
          divider: true,
          spacing: 1 // Small spacing
        });
      }
    }
  } else {
    // No content case
    components.push({
      type: 10, // Text Display
      content: content.trim()
    });
  }
  
  // Add separator before navigation
  components.push({ type: 14 }); // Separator
  
  // Add navigation components
  components.push(...navigationButtons);
  
  return {
    components: [{
      type: 17, // Container
      components: components
    }],
    flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL
  };
}

/**
 * Format trigger type for display
 */
function getTriggerTypeLabel(type) {
  switch(type) {
    case 'button': return 'Button';
    case 'modal': return 'Modal';
    default: return 'Unknown';
  }
}

/**
 * Format conditions for display
 */
function formatConditions(conditions, items) {
  if (!conditions.items || conditions.items.length === 0) return 'None';
  
  const condStrings = conditions.items.map((cond, index) => {
    let str = '';
    
    // Add logic operator if not first condition
    if (index > 0) {
      str += ` ${conditions.items[index - 1].logic || 'AND'} `;
    }
    
    switch(cond.type) {
      case 'currency':
        if (cond.operator === 'gte') str += `Currency ≥ ${cond.value}`;
        else if (cond.operator === 'lte') str += `Currency ≤ ${cond.value}`;
        else if (cond.operator === 'eq_zero') str += 'Currency = 0';
        break;
        
      case 'item':
        const item = items[cond.itemId];
        const itemName = item?.name || cond.itemId;
        str += cond.operator === 'has' ? `Has ${itemName}` : `Does not have ${itemName}`;
        break;
        
      case 'role':
        str += cond.operator === 'has' ? `Has role <@&${cond.roleId}>` : `Does not have role <@&${cond.roleId}>`;
        break;
        
      default:
        str += `Unknown condition`;
    }
    
    return str;
  });
  
  return condStrings.join('');
}

/**
 * Format action for display
 */
async function formatAction(action, prefix, guildId, items, playerData, client, buttons = {}) {
  let result = '';
  
  switch(action.type) {
    case 'display_text':
      result = `${prefix} 📝 Display Text: "${(action.config?.content || '').substring(0, 50)}${action.config?.content?.length > 50 ? '...' : ''}"\n`;
      break;
      
    case 'give_item':
      const item = items[action.config?.itemId];
      const itemName = item?.name || `[Unknown: ${action.config?.itemId}]`;
      const quantity = action.config?.quantity || 1;
      
      result = `${prefix} 🎁 Give Item: ${itemName}${quantity > 1 ? ` x${quantity}` : ''} [${formatLimitType(action.config?.limit)}]\n`;
      
      // Add claim info if applicable
      if (action.config?.limit?.claimedBy) {
        const claimInfo = await formatActionClaimInfo(action.config.limit, playerData[guildId], client);
        result += `${prefix.replace('├', '│').replace('└', ' ')}    └─ ${claimInfo}\n`;
      }
      break;
      
    case 'give_currency':
      const amount = action.config?.amount || 0;
      const sign = amount >= 0 ? '+' : '';
      
      result = `${prefix} 💰 Give Currency: ${sign}${amount} [${formatLimitType(action.config?.limit)}]\n`;
      
      // Add claim info if applicable
      if (action.config?.limit?.claimedBy) {
        const claimInfo = await formatActionClaimInfo(action.config.limit, playerData[guildId], client);
        result += `${prefix.replace('├', '│').replace('└', ' ')}    └─ ${claimInfo}\n`;
      }
      break;
      
    case 'follow_up_button':
      if (action.config?.buttonIds && action.config.buttonIds.length > 0) {
        result = `${prefix} 🔗 Follow-up Actions:\n`;
        
        // Get follow-up button details
        for (let i = 0; i < action.config.buttonIds.length; i++) {
          const followUpId = action.config.buttonIds[i];
          const followUpButton = buttons[followUpId];
          
          if (!followUpButton) {
            result += `${prefix.replace('├', '│').replace('└', ' ')}    ${i === action.config.buttonIds.length - 1 ? '└─' : '├─'} ❌ Missing button: ${followUpId}\n`;
            continue;
          }
          
          const triggerType = followUpButton.trigger?.type || 'button';
          const triggerEmoji = triggerType === 'modal' ? '📝' : '🔘';
          result += `${prefix.replace('├', '│').replace('└', ' ')}    ${i === action.config.buttonIds.length - 1 ? '└─' : '├─'} ${triggerEmoji} ${followUpButton.emoji || ''} ${followUpButton.name || followUpButton.label || 'Unnamed'}\n`;
        }
      } else {
        result = `${prefix} 🔗 Follow-up Button: Show additional buttons\n`;
      }
      break;
      
    case 'conditional':
      result = `${prefix} 🔀 Conditional: Nested conditions\n`;
      break;
      
    case 'random_outcome':
      result = `${prefix} 🎲 Random Outcome: ${action.config?.outcomes?.length || 0} possible outcomes\n`;
      break;
      
    default:
      result = `${prefix} ❓ ${action.type}: [Configuration]\n`;
  }
  
  // Add executeOn info if not default
  if (action.executeOn === 'false') {
    result = result.replace('\n', ' (on condition fail)\n');
  }
  
  return result;
}

/**
 * Format limit type for display
 */
function formatLimitType(limit) {
  if (!limit) return 'Unlimited';
  
  switch(limit.type) {
    case 'unlimited': return 'Unlimited';
    case 'once_per_player': return 'Once Per Player';
    case 'once_globally': return 'Once Globally';
    case 'daily_limit': return `Daily Limit: ${limit.max || 1}`;
    default: return limit.type;
  }
}

/**
 * Format drop type for display
 */
function formatDropType(dropType) {
  switch(dropType) {
    case 'unlimited': return 'Unlimited';
    case 'once_per_player': return 'Once Per Player';
    case 'once_globally': return 'Once Globally';
    default: return dropType || 'Unlimited';
  }
}

/**
 * Format claim info for drops
 */
async function formatClaimInfo(claimedBy, dropType, guildPlayers, client) {
  if (!claimedBy || claimedBy.length === 0) return 'Claimed by: 🎁 Unclaimed';
  
  if (dropType === 'once_globally') {
    // For once_globally, claimedBy could be a string or array
    const claimedUserId = Array.isArray(claimedBy) ? claimedBy[0] : claimedBy;
    
    if (!claimedUserId) {
      return 'Claimed by: 🎁 Unclaimed';
    }
    
    const player = guildPlayers?.players?.[claimedUserId] || null;
    const displayName = player?.displayName || (client ? await getPlayerName(claimedUserId, client) : 'Unknown Player');
    return `Claimed by: 🔒 ${displayName} (@${displayName})`;
  }
  
  // For once_per_player, show claim count and first few names
  const totalPlayers = Object.keys(guildPlayers?.players || {}).length || 50; // Estimate if no data
  const claimCount = claimedBy.length;
  
  if (claimCount <= 5) {
    // Show all names if 5 or fewer
    const names = await Promise.all(claimedBy.map(async (userId) => {
      const player = guildPlayers?.players?.[userId];
      return player?.displayName || (client ? await getPlayerName(userId, client) : 'Unknown');
    }));
    
    return `Claimed by: 🔒 @${names.join(', @')} (${claimCount}/${totalPlayers} players)`;
  } else {
    // Show first 3 and count
    const firstThree = claimedBy.slice(0, 3);
    const names = await Promise.all(firstThree.map(async (userId) => {
      const player = guildPlayers?.players?.[userId];
      return player?.displayName || (client ? await getPlayerName(userId, client) : 'Unknown');
    }));
    
    return `Claimed by: 🔒 @${names.join(', @')} and ${claimCount - 3} more (${claimCount}/${totalPlayers} players)`;
  }
}

/**
 * Format claim info for action limits
 */
async function formatActionClaimInfo(limit, guildPlayers, client) {
  // Check for empty arrays or null/undefined
  if (!limit.claimedBy || (Array.isArray(limit.claimedBy) && limit.claimedBy.length === 0)) {
    return 'Claimed by: 🎁 Unclaimed';
  }
  
  if (limit.type === 'once_globally') {
    // For once_globally, claimedBy might be a string (user ID) or an array with one element
    const claimedUserId = Array.isArray(limit.claimedBy) ? limit.claimedBy[0] : limit.claimedBy;
    
    if (!claimedUserId) {
      return 'Claimed by: 🎁 Unclaimed';
    }
    
    const player = guildPlayers?.players?.[claimedUserId];
    const displayName = player?.displayName || (client ? await getPlayerName(claimedUserId, client) : 'Unknown Player');
    return `Claimed by: 🔒 ${displayName} (@${displayName})`;
  }
  
  if (limit.type === 'once_per_player' && Array.isArray(limit.claimedBy)) {
    return formatClaimInfo(limit.claimedBy, 'once_per_player', guildPlayers, client);
  }
  
  if (limit.type === 'unlimited') {
    // For unlimited items, we don't track claims
    return 'Available to all';
  }
  
  return 'Claim data available';
}

/**
 * Get player name from Discord
 */
async function getPlayerName(userId, client) {
  try {
    const user = await client.users.fetch(userId);
    return user.username;
  } catch (error) {
    console.log(`Failed to fetch user ${userId}:`, error.message);
    return 'Unknown';
  }
}

/**
 * Create navigation buttons for row navigation
 */
function createNavigationButtons(currentRow, activeMapId, coordinates) {
  const rows = getAvailableRows(coordinates);
  const currentIndex = rows.indexOf(currentRow);
  
  const components = [];
  const buttons = [];
  
  // Previous button
  if (currentIndex > 0) {
    const prevRow = rows[currentIndex - 1];
    buttons.push({
      type: 2, // Button
      custom_id: `safari_progress_prev_${currentRow}`,
      label: `◀ Row ${prevRow}`,
      style: 2 // Secondary
    });
  }
  
  // Jump to row select menu
  if (rows.length > 2) {
    const selectMenu = {
      type: 3, // String Select
      custom_id: 'safari_progress_jump',
      placeholder: '📍 Jump to Row',
      options: rows.map(row => ({
        label: `Row ${row}`,
        value: row,
        default: row === currentRow
      }))
    };
    
    components.push({
      type: 1, // Action Row
      components: [selectMenu]
    });
  }
  
  // Next button
  if (currentIndex < rows.length - 1) {
    const nextRow = rows[currentIndex + 1];
    buttons.push({
      type: 2, // Button
      custom_id: `safari_progress_next_${currentRow}`,
      label: `Row ${nextRow} ▶`,
      style: 2 // Secondary
    });
  }
  
  // Advantages button (far right)
  buttons.push({
    type: 2, // Button
    custom_id: 'safari_progress_global_items',
    label: 'Advantages',
    style: 2, // Secondary (grey)
    emoji: { name: '🎁' }
  });
  
  // Add button row if there are navigation buttons
  if (buttons.length > 0) {
    components.unshift({
      type: 1, // Action Row
      components: buttons
    });
  }
  
  return components;
}

/**
 * Get available rows that have content
 */
function getAvailableRows(coordinates) {
  const rowSet = new Set();
  
  for (const coord of Object.keys(coordinates)) {
    const row = coord.charAt(0);
    if (row >= 'A' && row <= 'Z') {
      rowSet.add(row);
    }
  }
  
  return Array.from(rowSet).sort();
}

/**
 * Get next/previous row
 */
export function getAdjacentRow(currentRow, direction) {
  const charCode = currentRow.charCodeAt(0);
  
  if (direction === 'next') {
    if (charCode >= 90) return 'A'; // Wrap Z to A
    return String.fromCharCode(charCode + 1);
  } else {
    if (charCode <= 65) return 'Z'; // Wrap A to Z  
    return String.fromCharCode(charCode - 1);
  }
}

/**
 * Create Global Items view - shows only once_globally give_item actions
 * @param {string} guildId - Discord guild ID
 * @param {Object} client - Discord client for user lookup
 * @returns {Object} Discord Components V2 response
 */
export async function createGlobalItemsUI(guildId, client = null, isPublic = false) {
  console.log(`🎁 Creating Global Items UI for guild ${guildId}`);

  // Load data
  const safariData = await loadSafariContent();
  const playerData = await loadPlayerData();

  // First try to get data for the specific guild
  let guildData = safariData[guildId] || {};
  let activeMapId = guildData.maps?.active;

  console.log(`🔍 DEBUG: guildData.maps exists: ${!!guildData.maps}`);
  console.log(`🔍 DEBUG: activeMapId: ${activeMapId}`);
  console.log(`🔍 DEBUG: guildData.maps?.[activeMapId] exists: ${!!guildData.maps?.[activeMapId]}`);

  // If no map found for this guild, find first guild with an active map
  // This allows production team to view from any channel
  if (!activeMapId || !guildData.maps?.[activeMapId]) {
    console.log(`📍 No map for guild ${guildId}, searching for any guild with active map...`);
    
    // Find first guild with an active map
    for (const searchGuildId in safariData) {
      if (searchGuildId === '/* Guild ID */' || !safariData[searchGuildId]) continue;

      const searchGuildData = safariData[searchGuildId];
      if (searchGuildData.maps?.active && searchGuildData.maps[searchGuildData.maps.active]) {
        console.log(`✅ Found active map in guild ${searchGuildId}`);
        guildData = searchGuildData;
        activeMapId = searchGuildData.maps.active;
        break;
      }
    }
  }

  // If still no map found, return error
  if (!activeMapId || !guildData.maps?.[activeMapId]) {
    console.log(`❌ No active map found after search`);
    return {
      components: [{
        type: 17, // Container
        components: [{
          type: 10, // Text Display
          content: '❌ No active safari map found.'
        }]
      }],
      flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL
    };
  }

  const mapData = guildData.maps[activeMapId];
  const coordinates = mapData.coordinates || {};
  const buttons = guildData.buttons || {};
  const items = guildData.items || {};

  console.log(`🔍 DEBUG: Found map with ${Object.keys(coordinates).length} coordinates, ${Object.keys(buttons).length} buttons`);
  
  // Build content - only coordinates with once_globally give_item actions
  let content = `# 🎁 Advantages Overview\n\n`;
  let hasContent = false;
  let characterCount = content.length;
  
  const coordSections = [];
  
  // Process all coordinates to find ones with once_globally give_item actions
  const sortedCoords = Object.keys(coordinates).sort();
  
  for (const coord of sortedCoords) {
    const coordData = coordinates[coord];
    if (!coordData || !coordData.buttons || coordData.buttons.length === 0) continue;
    
    let coordSection = '';
    let hasGlobalItems = false;
    
    // Check each button for once_globally give_item actions
    for (const buttonId of coordData.buttons) {
      const button = buttons[buttonId];
      if (!button || !button.actions) continue;
      
      // Filter to only once_globally give_item actions
      const globalItemActions = button.actions.filter(action =>
        action.type === 'give_item' &&
        action.config?.limit?.type === 'once_globally'
      );

      if (globalItemActions.length > 0) {
        console.log(`🔍 DEBUG: Found ${globalItemActions.length} global items in button ${buttonId} at ${coord}`);
      }

      if (globalItemActions.length === 0) continue;
      
      if (!hasGlobalItems) {
        // Add coordinate header
        coordSection += `## 📍 ${coord}\n`;
        hasGlobalItems = true;
      }
      
      // Add button with only global item actions
      const triggerType = button.trigger?.type || 'button';
      const triggerEmoji = triggerType === 'modal' ? '📝' : '🔘';
      coordSection += `${triggerEmoji} **${button.name || button.label || 'Unnamed Action'}** (${getTriggerTypeLabel(triggerType)})\n`;
      coordSection += `└─ 🎬 Actions:\n`;
      
      for (let i = 0; i < globalItemActions.length; i++) {
        const action = globalItemActions[i];
        const isLast = i === globalItemActions.length - 1;
        const prefix = isLast ? '   └─' : '   ├─';
        
        coordSection += await formatAction(action, prefix, guildId, items, playerData, client, buttons);
      }
      
      coordSection += '\n';
    }
    
    if (hasGlobalItems) {
      hasContent = true;
      
      // Check character limit
      if (characterCount + coordSection.length > CHARACTER_LIMIT) {
        content += `*... and more coordinates. Character limit reached.*\n`;
        break;
      }
      
      coordSections.push(coordSection.trimEnd());
      characterCount += coordSection.length;
    }
  }
  
  if (!hasContent) {
    content += `*No global items (once_globally give_item actions) found on this map.*\n`;
  }

  console.log(`🔍 DEBUG: Final result - hasContent: ${hasContent}, coordSections: ${coordSections.length}`);

  // Build components with dividers between coordinates
  const components = [];
  
  // Add coordSections with dividers between them
  if (hasContent && coordSections.length > 0) {
    for (let i = 0; i < coordSections.length; i++) {
      // Add coordinate content
      components.push({
        type: 10, // Text Display
        content: coordSections[i].trim()
      });
      
      // Add divider between coordinates (but not after the last one)
      if (i < coordSections.length - 1) {
        components.push({
          type: 14, // Separator
          divider: true,
          spacing: 1 // Small spacing
        });
      }
    }
  } else {
    // No content case
    components.push({
      type: 10, // Text Display
      content: content.trim()
    });
  }
  
  // Add separator before navigation
  components.push({ type: 14 }); // Separator
  
  // Add back button and show public button
  components.push({
    type: 1, // Action Row
    components: [
      {
        type: 2, // Button
        custom_id: 'safari_progress_back_to_rows',
        label: '← Back to Rows',
        style: 2 // Secondary
      },
      {
        type: 2, // Button
        custom_id: 'safari_show_advantages_public',
        label: 'Show Advantages (Public!)',
        style: 4, // Danger (red)
        emoji: '⚠️'
      }
    ]
  });

  // Return with appropriate flags based on isPublic parameter
  const response = {
    components: [{
      type: 17, // Container
      components: components
    }]
  };

  // Add flags - always include Components V2, optionally add ephemeral
  if (isPublic) {
    response.flags = (1 << 15); // Components V2 only (public)
  } else {
    response.flags = (1 << 15) | InteractionResponseFlags.EPHEMERAL; // Components V2 + Ephemeral
  }

  return response;
}