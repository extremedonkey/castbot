/**
 * Safari Logger Module
 * Provides a clean API for logging Safari-specific interactions to both analytics and Safari log channels
 */

import { logInteraction } from './src/analytics/analyticsLogger.js';
import { addActivityEntryAndSave, ACTIVITY_TYPES } from './activityLogger.js';

/**
 * Format an emoji for Discord text display.
 * Handles: objects { name, id }, full strings "<:name:id>", shorthand ":name:", unicode "🎯"
 */
function formatEmojiForText(emoji) {
  if (!emoji) return '';
  if (typeof emoji === 'object') {
    if (emoji.id) {
      return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
    }
    return emoji.name || '';
  }
  // Already a string — return as-is (handles "<:name:id>" and unicode)
  return emoji;
}

/**
 * Log a whisper between players
 * @param {Object} params - Whisper parameters
 * @param {string} params.guildId - Guild ID
 * @param {string} params.senderId - Sender user ID
 * @param {string} params.senderName - Sender username
 * @param {string} params.senderDisplayName - Sender display name
 * @param {string} params.recipientId - Recipient user ID
 * @param {string} params.recipientName - Recipient username
 * @param {string} params.location - Map location coordinate
 * @param {string} params.message - Whisper message content
 * @param {string} params.channelName - Channel name
 */
export async function logWhisper({ guildId, senderId, senderName, senderDisplayName, recipientId, recipientName, location, message, channelName }) {
  const safariContent = {
    senderId,
    recipientId,
    recipientName,
    location,
    message,
    channelName
  };
  
  await logInteraction(
    senderId,
    guildId,
    'SAFARI_WHISPER',
    `Whispered to ${recipientName}`,
    senderName,
    null, // Guild name will be fetched from playerData
    null, // No components needed
    channelName,
    senderDisplayName,
    safariContent
  );

  addActivityEntryAndSave(guildId, senderId, ACTIVITY_TYPES.whisper, `Whispered to ${recipientName}`, { loc: location });
}

/**
 * Log an item pickup
 * @param {Object} params - Item pickup parameters
 * @param {string} params.guildId - Guild ID
 * @param {string} params.userId - User ID who picked up item
 * @param {string} params.username - Username
 * @param {string} params.displayName - Display name
 * @param {string} params.location - Map location coordinate
 * @param {string} params.itemId - Item ID
 * @param {string} params.itemName - Item name
 * @param {string} params.itemEmoji - Item emoji
 * @param {number} params.quantity - Quantity picked up
 * @param {string} params.source - Source of item (e.g., "button", "drop", "reward")
 * @param {string} params.channelName - Channel name
 */
export async function logItemPickup({ guildId, userId, username, displayName, location, itemId, itemName, itemEmoji, quantity, source, channelName, channelId }) {
  const safariContent = {
    location,
    itemId,
    itemName,
    itemEmoji: itemEmoji || '📦',
    quantity,
    source,
    channelName,
    channelId,
    username
  };
  
  await logInteraction(
    userId,
    guildId,
    'SAFARI_ITEM_PICKUP',
    `Picked up ${itemName} x${quantity}`,
    username,
    null,
    null,
    channelName,
    displayName,
    safariContent
  );

  addActivityEntryAndSave(guildId, userId, ACTIVITY_TYPES.item, `Picked up ${formatEmojiForText(itemEmoji) || '📦'} ${itemName} x${quantity}`, { loc: location });
}

/**
 * Log a currency change
 * @param {Object} params - Currency change parameters
 * @param {string} params.guildId - Guild ID
 * @param {string} params.userId - User ID
 * @param {string} params.username - Username
 * @param {string} params.displayName - Display name
 * @param {string} params.location - Map location coordinate
 * @param {number} params.amount - Amount changed (positive or negative)
 * @param {string} params.currencyName - Custom currency name
 * @param {string} params.source - Source of change (e.g., "Fresh Meat button", "Store purchase")
 * @param {string} params.channelName - Channel name
 */
export async function logCurrencyChange({ guildId, userId, username, displayName, location, amount, currencyName, source, channelName }) {
  const safariContent = {
    location,
    amount,
    currencyName,
    source,
    channelName
  };
  
  await logInteraction(
    userId,
    guildId,
    'SAFARI_CURRENCY',
    `${amount > 0 ? 'Gained' : 'Lost'} ${Math.abs(amount)} ${currencyName}`,
    username,
    null,
    null,
    channelName,
    displayName,
    safariContent
  );

  addActivityEntryAndSave(guildId, userId, ACTIVITY_TYPES.currency, `${amount > 0 ? 'Gained' : 'Lost'} ${Math.abs(amount)} ${currencyName}${source ? ` from ${source}` : ''}`, { loc: location });
}

/**
 * Log a store purchase
 * @param {Object} params - Purchase parameters
 * @param {string} params.guildId - Guild ID
 * @param {string} params.userId - User ID
 * @param {string} params.username - Username
 * @param {string} params.displayName - Display name
 * @param {string} params.location - Store location coordinate
 * @param {string} params.storeId - Store ID
 * @param {string} params.storeName - Store name
 * @param {string} params.itemId - Item ID
 * @param {string} params.itemName - Item name
 * @param {string} params.itemEmoji - Item emoji
 * @param {number} params.quantity - Quantity purchased
 * @param {number} params.price - Total price paid
 * @param {string} params.currencyName - Custom currency name
 * @param {string} params.channelName - Channel name
 */
export async function logStorePurchase({ guildId, userId, username, displayName, location, storeId, storeName, itemId, itemName, itemEmoji, quantity, price, currencyName, channelName }) {
  const safariContent = {
    location,
    storeId,
    storeName,
    itemId,
    itemName,
    itemEmoji: itemEmoji || '📦',
    quantity,
    price,
    currencyName,
    channelName
  };
  
  await logInteraction(
    userId,
    guildId,
    'SAFARI_PURCHASE',
    `Purchased ${itemName} x${quantity}`,
    username,
    null,
    null,
    channelName,
    displayName,
    safariContent
  );

  addActivityEntryAndSave(guildId, userId, ACTIVITY_TYPES.purchase, `Bought ${formatEmojiForText(itemEmoji) || '📦'} ${itemName} x${quantity} for ${price} ${currencyName}`, { loc: location });
}

/**
 * Log a Safari button interaction
 * @param {Object} params - Button interaction parameters
 * @param {string} params.guildId - Guild ID
 * @param {string} params.userId - User ID
 * @param {string} params.username - Username
 * @param {string} params.displayName - Display name
 * @param {string} params.location - Map location coordinate
 * @param {string} params.buttonId - Safari button ID
 * @param {string} params.buttonLabel - Button label text
 * @param {string} params.result - Result of button interaction
 * @param {string} params.channelName - Channel name
 */
export async function logSafariButton({ guildId, userId, username, displayName, location, buttonId, buttonLabel, result, channelName }) {
  const safariContent = {
    location,
    buttonId,
    buttonLabel,
    result,
    channelName
  };
  
  await logInteraction(
    userId,
    guildId,
    'SAFARI_BUTTON',
    `Safari button: ${buttonLabel}`,
    username,
    null,
    null,
    channelName,
    displayName,
    safariContent
  );

  addActivityEntryAndSave(guildId, userId, ACTIVITY_TYPES.action, `Button: ${buttonLabel}`, { loc: location });
}

/**
 * Log player movement on the map
 * @param {Object} params - Movement parameters
 * @param {string} params.guildId - Guild ID
 * @param {string} params.userId - User ID
 * @param {string} params.username - Username
 * @param {string} params.displayName - Display name
 * @param {string} params.fromLocation - Starting location
 * @param {string} params.toLocation - Destination location
 * @param {string} params.channelName - Channel name
 */
export async function logPlayerMovement({ guildId, userId, username, displayName, fromLocation, toLocation, channelName }) {
  const safariContent = {
    fromLocation,
    toLocation,
    channelName
  };
  
  await logInteraction(
    userId,
    guildId,
    'SAFARI_MOVEMENT',
    `Moved from ${fromLocation} to ${toLocation}`,
    username,
    null,
    null,
    channelName,
    displayName,
    safariContent
  );

  addActivityEntryAndSave(guildId, userId, ACTIVITY_TYPES.movement, `Moved from ${fromLocation} to ${toLocation}`);
}

/**
 * Log a player initialization onto the Safari map
 * @param {Object} params - Initialization parameters
 * @param {string} params.guildId - Guild ID
 * @param {string} params.userId - User ID
 * @param {string} params.username - Username
 * @param {string} params.displayName - Display name
 * @param {string} params.coordinate - Starting coordinate
 * @param {number} params.currency - Starting currency amount
 * @param {string} params.currencyName - Custom currency name
 */
export async function logPlayerInitialization({ guildId, userId, username, displayName, coordinate, currency, currencyName }) {
  const safariContent = {
    toLocation: coordinate,
    fromLocation: null
  };

  await logInteraction(
    userId,
    guildId,
    'SAFARI_MOVEMENT',
    `Initialized at ${coordinate} with ${currency} ${currencyName}`,
    username,
    null,
    null,
    null,
    displayName,
    safariContent
  );

  addActivityEntryAndSave(guildId, userId, ACTIVITY_TYPES.init, `Initialized at ${coordinate} with ${currency} ${currencyName}`);
}

/**
 * Log an attack in the attack queue
 * @param {Object} params - Attack parameters
 * @param {string} params.guildId - Guild ID
 * @param {string} params.attackerId - Attacker user ID
 * @param {string} params.attackerName - Attacker username
 * @param {string} params.attackerDisplayName - Attacker display name
 * @param {string} params.targetId - Target user ID
 * @param {string} params.targetName - Target username
 * @param {string} params.location - Attack location
 * @param {string} params.result - Attack result
 * @param {string} params.channelName - Channel name
 */
export async function logAttack({ guildId, attackerId, attackerName, attackerDisplayName, targetId, targetName, location, result, channelName }) {
  const safariContent = {
    attackerId,
    targetId,
    targetName,
    location,
    result,
    channelName
  };
  
  await logInteraction(
    attackerId,
    guildId,
    'SAFARI_ATTACK',
    `Attacked ${targetName}`,
    attackerName,
    null,
    null,
    channelName,
    attackerDisplayName,
    safariContent
  );

  addActivityEntryAndSave(guildId, attackerId, ACTIVITY_TYPES.attack, `Attacked ${targetName}`, { loc: location });
}

/**
 * Log a custom action (Safari button or player command)
 * @param {Object} params - Custom action parameters
 * @param {string} params.guildId - Guild ID
 * @param {string} params.userId - User ID
 * @param {string} params.username - Username
 * @param {string} params.displayName - Display name
 * @param {string} params.location - Map location coordinate
 * @param {string} params.actionType - Type of action (e.g., "safari_button", "player_command")
 * @param {string} params.actionId - Action/Button ID or command text
 * @param {Array} params.executedActions - Array of executed actions with details
 * @param {boolean} params.success - Whether the action was successful
 * @param {string} params.errorMessage - Error message if action failed
 * @param {string} params.channelName - Channel name
 */
export async function logCustomAction({ guildId, userId, username, displayName, location, actionType, actionId, buttonLabel = null, buttonEmoji = null, executedActions = [], success = true, errorMessage = null, channelName }) {
  console.log(`🦁 Safari Logger: logCustomAction called for ${actionType} ${actionId} by user ${userId} in guild ${guildId}`);

  // Check if Safari logging is enabled
  const logSettings = await getSafariLogSettings(guildId);
  console.log(`🦁 Safari Logger: Log settings for guild ${guildId}:`, JSON.stringify(logSettings, null, 2));

  if (!logSettings?.enabled) {
    console.log(`🦁 Safari Logger: Safari logging is disabled for guild ${guildId}`);
    return;
  }

  if (!logSettings.logTypes?.customActions) {
    console.log(`🦁 Safari Logger: Custom actions logging is disabled for guild ${guildId}`);
    return;
  }

  const safariContent = {
    location,
    actionType,
    actionId,
    executedActions: executedActions.map(action => ({
      type: action.type,
      config: action.config,
      result: action.result
    })),
    success,
    errorMessage,
    channelName
  };

  let summary = '';
  if (actionType === 'player_command') {
    summary = `Player command: "${actionId}"`;
  } else if (actionType === 'safari_button') {
    summary = `Safari button: ${actionId}`;
  } else {
    summary = `Custom action: ${actionId}`;
  }

  console.log(`🦁 Safari Logger: Calling logInteraction with action SAFARI_CUSTOM_ACTION`);

  await logInteraction(
    userId,
    guildId,
    'SAFARI_CUSTOM_ACTION',
    summary,
    username,
    null,
    null,
    channelName,
    displayName,
    safariContent
  );

  // Build rich activity entry description
  const activityDesc = await _buildActionActivityDesc(guildId, actionType, actionId, buttonLabel, buttonEmoji, executedActions);
  addActivityEntryAndSave(guildId, userId, ACTIVITY_TYPES.action, activityDesc, { loc: location });
}

/**
 * Build a rich description for action activity entries.
 * Includes button label/emoji and summarizes executed actions.
 */
async function _buildActionActivityDesc(guildId, actionType, actionId, buttonLabel, buttonEmoji, executedActions) {
  // Header line: button label with emoji, or fallback to ID
  let header;
  if (actionType === 'player_command') {
    header = `Command: "${actionId}"`;
  } else if (buttonLabel) {
    const emojiStr = formatEmojiForText(buttonEmoji);
    header = `${emojiStr ? emojiStr + ' ' : ''}${buttonLabel}`;
  } else {
    header = `Button: ${actionId}`;
  }

  if (!executedActions || executedActions.length === 0) return header;

  // Resolve item names for give_item actions
  let resolveItemName;
  try {
    const { loadEntity } = await import('./entityManager.js');
    resolveItemName = async (itemId) => {
      try {
        const item = await loadEntity(guildId, 'item', itemId);
        return { name: item?.name || itemId, emoji: item?.emoji || '📦' };
      } catch { return { name: itemId, emoji: '📦' }; }
    };
  } catch {
    resolveItemName = async (id) => ({ name: id, emoji: '📦' });
  }

  // Summarize each action as a bullet point
  const details = [];
  for (const action of executedActions) {
    const cfg = action.config || {};
    switch (action.type) {
      case 'display_text': {
        const text = cfg.text || cfg.content || '';
        const preview = text.length > 60 ? text.slice(0, 57) + '...' : text;
        if (preview) details.push(`Text: "${preview}"`);
        break;
      }
      case 'give_item': {
        const { name, emoji } = await resolveItemName(cfg.itemId);
        const qty = cfg.quantity || 1;
        details.push(`Give Item: ${formatEmojiForText(emoji)} ${name} (x${qty})`);
        break;
      }
      case 'give_currency': {
        const amt = cfg.amount || 0;
        details.push(`Currency: ${amt > 0 ? '+' : ''}${amt}`);
        break;
      }
      case 'move_player': {
        const dest = cfg.destination || cfg.coordinate || '?';
        details.push(`Move: → ${dest}`);
        break;
      }
      case 'modify_points': {
        const pts = cfg.amount || cfg.points || 0;
        const entity = cfg.entityId || cfg.pointsId || '?';
        details.push(`Points: ${pts > 0 ? '+' : ''}${pts} (${entity})`);
        break;
      }
      case 'follow_up_button':
      case 'follow_up': {
        details.push(`Follow-up button`);
        break;
      }
      case 'store_display': {
        details.push(`Store: ${cfg.storeId || '?'}`);
        break;
      }
      case 'random_outcome': {
        details.push(`Random outcome`);
        break;
      }
      case 'conditional': {
        details.push(`Conditional check`);
        break;
      }
      // Skip unknown types silently
    }
  }

  if (details.length === 0) return header;
  return `${header}\n${details.map(d => `> • ${d}`).join('\n')}`;
}

/**
 * Check if Safari logging is enabled for a guild
 * @param {string} guildId - Guild ID to check
 * @returns {Promise<boolean>} Whether Safari logging is enabled
 */
export async function isSafariLoggingEnabled(guildId) {
  try {
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    return safariData[guildId]?.safariLogSettings?.enabled || false;
  } catch (error) {
    console.error('Error checking Safari logging status:', error);
    return false;
  }
}

/**
 * Get Safari log settings for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object|null>} Safari log settings or null
 */
export async function getSafariLogSettings(guildId) {
  try {
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    return safariData[guildId]?.safariLogSettings || null;
  } catch (error) {
    console.error('Error getting Safari log settings:', error);
    return null;
  }
}