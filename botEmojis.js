/**
 * Bot Emoji Configuration
 * Manages application-specific emojis for CastBot Dev and Production
 * These are bot emojis that can be used in any server by the respective bot
 * 
 * @module botEmojis
 * @description Centralized management for Discord application emojis
 * 
 * HOW TO USE:
 * 1. Import: import { getBotEmoji } from './botEmojis.js';
 * 2. In buttons: .setEmoji(getBotEmoji('castbot_logo'))
 * 3. In messages: formatBotEmoji('castbot_logo') returns <:name:id>
 * 
 * TO ADD NEW EMOJIS:
 * 1. Upload to Discord Developer Portal for both Dev and Prod apps
 * 2. Add to BOT_EMOJIS object below with both IDs
 * 3. Document in CLAUDE.md
 * 
 * @see CLAUDE.md for full documentation
 */

// Detect if we're running in production or development
const isProduction = process.env.PRODUCTION === 'TRUE';

/**
 * Bot Emoji Registry
 * Maps emoji names to their IDs for both dev and production bots
 */
const BOT_EMOJIS = {
  // CastBot Logo
  castbot_logo: {
    dev: '1421388683902193825',   // CastBot-Dev application emoji
    prod: '1408700895415500911'    // CastBot production application emoji
  },
  
  // CastBot Full Logo
  castbot_logo_full: {
    dev: '1421388843654975599',   // CastBot-Dev full logo emoji
    prod: '1408708179227054222'    // CastBot production full logo emoji
  },
  
  // Command emoji (existing)
  command: {
    dev: '1396095623815495700',   // CastBot-Dev command emoji
    prod: '1396098411287285942'    // CastBot production command emoji
  }
  
  // Add more bot emojis here as needed
  // emoji_name: {
  //   dev: 'dev_emoji_id',
  //   prod: 'prod_emoji_id'
  // }
};

/**
 * Get the appropriate emoji ID for the current environment
 * @param {string} emojiName - The name of the emoji in BOT_EMOJIS
 * @param {string} [guildId] - Optional guild ID for additional context
 * @returns {string|null} The emoji ID or null if not found
 */
export function getBotEmojiId(emojiName, guildId = null) {
  const emoji = BOT_EMOJIS[emojiName];
  if (!emoji) {
    console.warn(`⚠️ Bot emoji '${emojiName}' not found in registry`);
    return null;
  }
  
  // Use production emoji if explicitly in production mode
  if (isProduction) {
    return emoji.prod;
  }
  
  // Use dev emoji for test server or when not in production
  return emoji.dev;
}

/**
 * Get emoji object for Discord button/component usage
 * @param {string} emojiName - The name of the emoji in BOT_EMOJIS
 * @param {string} [guildId] - Optional guild ID for additional context
 * @returns {Object|null} Emoji object { id: 'emoji_id' } or null
 */
export function getBotEmoji(emojiName, guildId = null) {
  const emojiId = getBotEmojiId(emojiName, guildId);
  return emojiId ? { id: emojiId } : null;
}

/**
 * Check if an emoji exists in the registry
 * @param {string} emojiName - The name to check
 * @returns {boolean} True if the emoji exists
 */
export function hasBotEmoji(emojiName) {
  return BOT_EMOJIS.hasOwnProperty(emojiName);
}

/**
 * Get all available bot emoji names
 * @returns {string[]} Array of emoji names
 */
export function getBotEmojiNames() {
  return Object.keys(BOT_EMOJIS);
}

/**
 * Format emoji for display in messages (not buttons)
 * @param {string} emojiName - The name of the emoji
 * @param {string} [guildId] - Optional guild ID
 * @returns {string} Formatted emoji string <:name:id> or empty string
 */
export function formatBotEmoji(emojiName, guildId = null) {
  const emojiId = getBotEmojiId(emojiName, guildId);
  if (!emojiId) return '';
  
  // Application emojis don't need the name part, but we'll include it for clarity
  return `<:${emojiName}:${emojiId}>`;
}

// Export the registry for direct access if needed
export { BOT_EMOJIS };

// Log the current environment on module load
console.log(`🤖 Bot Emoji System initialized - Mode: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);