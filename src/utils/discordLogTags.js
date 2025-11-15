/**
 * Educational Discord Interaction Logging Tags
 *
 * Provides suffix tags for logs to help learn Discord API patterns.
 * Usage: Append these to log messages for visual pattern recognition.
 *
 * @example
 * console.log(`Sent response ${tags.response.DEFERRED_NEW} ${tags.visibility.EPHEMERAL}`);
 * // Output: Sent response [🔄 DEFERRED-NEW] [🔒 EPHEMERAL]
 */

export const discordLogTags = {
  // Response Types (What you send to Discord)
  response: {
    IMMEDIATE_NEW: '[⚡ IMMEDIATE-NEW]',      // CHANNEL_MESSAGE_WITH_SOURCE (type 4)
    IMMEDIATE_UPDATE: '[⚡ IMMEDIATE-UPDATE]', // UPDATE_MESSAGE (type 7)
    DEFERRED_NEW: '[🔄 DEFERRED-NEW]',        // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE (type 5)
    DEFERRED_UPDATE: '[🔄 DEFERRED-UPDATE]',  // DEFERRED_UPDATE_MESSAGE (type 6)
    MODAL: '[📝 MODAL]',                      // MODAL (type 9)
    WEBHOOK_PATCH: '[🔗 WEBHOOK-PATCH]',      // PATCH /webhooks/.../messages/@original
    WEBHOOK_POST: '[🔗 WEBHOOK-POST]',        // POST /webhooks/... (new message)
  },

  // Message Visibility (Who can see it)
  visibility: {
    EPHEMERAL: '[🔒 EPHEMERAL]',  // Only visible to user
    PUBLIC: '[👁️ PUBLIC]',         // Visible to everyone
  },

  // Interaction Source (What triggered this)
  source: {
    SLASH: '[🎯 SLASH]',       // Slash command
    BUTTON: '[🔘 BUTTON]',     // Button click
    SELECT: '[📋 SELECT]',     // Select menu
    MODAL_SUBMIT: '[📝 SUBMIT]', // Modal submission
  },

  // Pattern Type (Architecture patterns)
  pattern: {
    FACTORY: '[✨ FACTORY]',   // Uses ButtonHandlerFactory
    LEGACY: '[🪨 LEGACY]',     // Legacy handler
    UNIFIED: '[📂 UNIFIED]',   // Unified data access
  },

  // Cache Status
  cache: {
    HIT: '[⚡ CACHE-HIT]',     // Found in cache (fast)
    MISS: '[🔍 CACHE-MISS]',   // Had to fetch (slow)
  },

  // Component Status
  components: {
    OK: '[✅ COMPONENTS-OK]',       // Under 40 limit
    NEAR: '[⚠️ COMPONENTS-NEAR]',   // 35-40 components
    OVER: '[❌ COMPONENTS-OVER]',   // Over 40 limit
  },

  // Permissions
  perms: {
    OK: '[✅ PERMS-OK]',       // Has permissions
    FAIL: '[❌ PERMS-FAIL]',   // Lacks permissions
  }
};

/**
 * Helper to determine response type from interaction response object
 */
export function getResponseTag(responseType) {
  const typeMap = {
    4: discordLogTags.response.IMMEDIATE_NEW,
    5: discordLogTags.response.DEFERRED_NEW,
    6: discordLogTags.response.DEFERRED_UPDATE,
    7: discordLogTags.response.IMMEDIATE_UPDATE,
    9: discordLogTags.response.MODAL,
  };
  return typeMap[responseType] || `[TYPE-${responseType}]`;
}

/**
 * Helper to determine visibility tag from flags
 */
export function getVisibilityTag(flags) {
  // EPHEMERAL flag is (1 << 6) = 64
  const isEphemeral = flags && (flags & 64);
  return isEphemeral ? discordLogTags.visibility.EPHEMERAL : discordLogTags.visibility.PUBLIC;
}

/**
 * Helper to determine component status tag
 */
export function getComponentTag(count, max = 40) {
  if (count > max) return discordLogTags.components.OVER;
  if (count >= max - 5) return discordLogTags.components.NEAR;
  return discordLogTags.components.OK;
}

/**
 * Complete response summary (combines type + visibility)
 */
export function getResponseSummary(responseType, flags) {
  return `${getResponseTag(responseType)} ${getVisibilityTag(flags)}`;
}
