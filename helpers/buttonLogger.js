/**
 * Button Logger Utilities
 * 
 * Standardized logging for button handlers to prevent "This interaction failed" confusion.
 * These utilities ensure consistent logging patterns across all button handlers.
 */

/**
 * Log the start of a button handler execution
 * @param {string} customId - The button's custom ID
 * @param {string} userId - The user who clicked the button
 * @param {string} [guildId] - Optional guild ID for context
 */
export function logButtonStart(customId, userId, guildId = null) {
  const context = guildId ? ` guild ${guildId}` : '';
  console.log(`🔍 START: ${customId} - user ${userId}${context}`);
}

/**
 * Log successful completion of a button handler
 * @param {string} customId - The button's custom ID
 * @param {number} [startTime] - Optional start timestamp for duration calculation
 */
export function logButtonSuccess(customId, startTime = null) {
  const duration = startTime ? ` in ${Date.now() - startTime}ms` : '';
  console.log(`✅ SUCCESS: ${customId} - completed${duration}`);
}

/**
 * Log a button handler failure
 * @param {string} customId - The button's custom ID
 * @param {Error} error - The error that occurred
 * @param {number} [startTime] - Optional start timestamp for duration calculation
 */
export function logButtonFailure(customId, error, startTime = null) {
  const duration = startTime ? ` after ${Date.now() - startTime}ms` : '';
  console.error(`❌ FAILURE: ${customId} - Error${duration}:`, error);
}

/**
 * Log a deferred response warning
 * @param {string} customId - The button's custom ID
 * @param {number} duration - How long the operation took
 */
export function logDeferredWarning(customId, duration) {
  if (duration > 2500) { // Warning at 2.5s (before 3s timeout)
    console.warn(`⚠️ SLOW: ${customId} took ${duration}ms - consider using deferred: true`);
  }
}

/**
 * Create a wrapped handler with automatic logging
 * This is a higher-order function that adds logging to any handler
 * 
 * @param {string} customId - The button's custom ID
 * @param {Function} handler - The actual handler function
 * @returns {Function} Wrapped handler with logging
 * 
 * @example
 * handler: withButtonLogging('my_button', async (context) => {
 *   // Your logic here
 *   return { content: 'Success!' };
 * })
 */
export function withButtonLogging(customId, handler) {
  return async (context) => {
    const startTime = Date.now();
    logButtonStart(customId, context.userId, context.guildId);
    
    try {
      const result = await handler(context);
      const duration = Date.now() - startTime;
      
      logButtonSuccess(customId, startTime);
      logDeferredWarning(customId, duration);
      
      return result;
    } catch (error) {
      logButtonFailure(customId, error, startTime);
      throw error; // Re-throw to let factory handle error response
    }
  };
}

/**
 * Log button interaction analytics
 * Useful for tracking button usage patterns
 * 
 * @param {string} customId - The button's custom ID
 * @param {string} userId - The user who clicked
 * @param {Object} [metadata] - Additional data to log
 */
export function logButtonAnalytics(customId, userId, metadata = {}) {
  console.log(`📊 ANALYTICS: Button ${customId} clicked`, {
    userId,
    timestamp: new Date().toISOString(),
    ...metadata
  });
}

/**
 * Log button registration (for factory pattern migration)
 * @param {string} customId - The button's custom ID
 * @param {string} type - 'FACTORY' or 'LEGACY'
 */
export function logButtonRegistration(customId, type) {
  const emoji = type === 'FACTORY' ? '✨' : '🪨';
  console.log(`🔍 BUTTON DEBUG: Registered ${customId} [${emoji} ${type}]`);
}

/**
 * Debug helper to log button component structure
 * Useful when debugging component validation issues
 * 
 * @param {Object} components - Discord components array
 * @param {string} context - Where this is being logged from
 */
export function debugComponents(components, context = '') {
  console.log(`🔍 COMPONENTS DEBUG${context ? ` (${context})` : ''}:`);
  components.forEach((row, rowIndex) => {
    if (row.type === 1) { // ACTION_ROW
      console.log(`  Row ${rowIndex}: ${row.components.length} components`);
      row.components.forEach((comp, compIndex) => {
        const label = comp.label || comp.placeholder || 'No label';
        const emoji = comp.emoji ? ` ${comp.emoji.name}` : '';
        console.log(`    [${compIndex}] ${comp.custom_id}: "${label}"${emoji}`);
      });
    }
  });
}

/**
 * Standard button handler template with all best practices
 * Copy this template when creating new handlers
 */
export const BUTTON_HANDLER_TEMPLATE = `
} else if (custom_id === 'your_button_id') {
  return ButtonHandlerFactory.create({
    id: 'your_button_id',
    deferred: false, // Set to true for operations >3s
    ephemeral: true, // Set to false for public responses
    requiresPermission: PermissionFlagsBits.ManageRoles, // Optional
    permissionName: 'Manage Roles', // Optional
    handler: async (context) => {
      const startTime = Date.now();
      console.log(\`🔍 START: your_button_id - user \${context.userId}\`);
      
      try {
        // Your logic here
        const { guildId, userId, member, client } = context;
        
        // Do something...
        
        console.log(\`✅ SUCCESS: your_button_id - completed in \${Date.now() - startTime}ms\`);
        return {
          content: 'Success!',
          ephemeral: true
        };
        
      } catch (error) {
        console.error(\`❌ FAILURE: your_button_id\`, error);
        throw error; // Let factory handle error response
      }
    }
  })(req, res, client);
}
`;

// Export all functions and constants
export default {
  logButtonStart,
  logButtonSuccess,
  logButtonFailure,
  logDeferredWarning,
  withButtonLogging,
  logButtonAnalytics,
  logButtonRegistration,
  debugComponents,
  BUTTON_HANDLER_TEMPLATE
};