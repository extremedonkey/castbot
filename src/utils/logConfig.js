/**
 * Centralized Logging Configuration
 * Controls verbosity across CastBot to reduce log spam
 *
 * Environment Variables:
 * - DEBUG_VERBOSE=true   → Full verbose logging (payloads, debug chains, component trees)
 * - DEBUG_VERBOSE=false  → Standard logging (actions, outcomes, errors only)
 * - Not set              → Auto-detect: VERBOSE in dev, STANDARD in prod
 *
 * Usage:
 * import { logConfig, shouldLog } from './src/utils/logConfig.js';
 *
 * if (shouldLog('VERBOSE')) {
 *   console.log('📊 DEBUG: Full payload:', payload);
 * }
 * if (shouldLog('STANDARD')) {
 *   console.log('✅ Action completed:', actionName);
 * }
 * if (shouldLog('MINIMAL')) {
 *   console.error('❌ Error:', error);
 * }
 */

const LOG_LEVELS = {
  MINIMAL: 1,   // Errors + critical actions only
  STANDARD: 2,  // + Outcomes + key identifiers (default dev)
  VERBOSE: 3    // + Debug chains + payloads + component trees
};

/**
 * Get current log level based on environment
 * @returns {number} Current log level (1-3)
 */
function getLogLevel() {
  // Explicit override from environment variable
  const debugVerbose = process.env.DEBUG_VERBOSE;

  if (debugVerbose === 'true' || debugVerbose === '1') {
    return LOG_LEVELS.VERBOSE;
  }

  if (debugVerbose === 'false' || debugVerbose === '0') {
    return LOG_LEVELS.MINIMAL;
  }

  // Auto-detect based on environment
  const isProduction = process.env.PRODUCTION === 'TRUE';

  return isProduction ? LOG_LEVELS.MINIMAL : LOG_LEVELS.STANDARD;
}

/**
 * Check if a log level should output
 * @param {string} level - 'MINIMAL', 'STANDARD', or 'VERBOSE'
 * @returns {boolean} True if logging at this level is enabled
 */
export function shouldLog(level) {
  const currentLevel = getLogLevel();
  const requestedLevel = LOG_LEVELS[level.toUpperCase()];

  return currentLevel >= requestedLevel;
}

/**
 * Export log configuration for direct checks
 */
export const logConfig = {
  isVerbose: () => shouldLog('VERBOSE'),
  isStandard: () => shouldLog('STANDARD'),
  isMinimal: () => shouldLog('MINIMAL'),

  // Named helpers for common patterns
  shouldLogPayloads: () => shouldLog('VERBOSE'),
  shouldLogDebugChains: () => shouldLog('VERBOSE'),
  shouldLogComponentTrees: () => shouldLog('VERBOSE'),
  shouldLogActions: () => shouldLog('STANDARD'),
  shouldLogOutcomes: () => shouldLog('STANDARD'),
  shouldLogErrors: () => true // Always log errors
};

/**
 * Get current log level name for diagnostics
 * @returns {string} 'MINIMAL', 'STANDARD', or 'VERBOSE'
 */
export function getLogLevelName() {
  const level = getLogLevel();
  return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level) || 'UNKNOWN';
}
