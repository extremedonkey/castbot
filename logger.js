/**
 * CastBot Environment-Aware Logging Utility
 * 
 * Provides structured logging with environment-based filtering:
 * - Development: All logs including debug
 * - Production: Only info, warn, error (unless FORCE_DEBUG=true)
 * 
 * Usage:
 *   import { logger } from './logger.js';
 *   logger.debug('SAFARI', 'Processing attack', { userId, itemId });
 *   logger.info('MENU', 'User opened production menu', { userId });
 *   logger.error('BUTTON', 'Failed to process interaction', error);
 */

// Environment detection
const isDev = process.env.NODE_ENV !== 'production';
const forceDebug = process.env.FORCE_DEBUG === 'true';
const DEBUG = isDev || forceDebug;

/**
 * Format timestamp for logs
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Environment-aware logger with structured output
 */
export const logger = {
    /**
     * Debug logging - only in development or when FORCE_DEBUG=true
     * @param {string} feature - Feature category (SAFARI, MENU, BUTTON, etc.)
     * @param {string} message - Log message
     * @param {object} data - Optional data object
     */
    debug: (feature, message, data = null) => {
        if (DEBUG) {
            const timestamp = getTimestamp();
            const logMsg = `🔍 [${timestamp}] [${feature}] ${message}`;
            if (data) {
                console.log(logMsg, data);
            } else {
                console.log(logMsg);
            }
        }
    },
    
    /**
     * Info logging - always logged
     * @param {string} feature - Feature category
     * @param {string} message - Log message
     * @param {object} data - Optional data object
     */
    info: (feature, message, data = null) => {
        const timestamp = getTimestamp();
        const logMsg = `ℹ️ [${timestamp}] [${feature}] ${message}`;
        if (data) {
            console.log(logMsg, data);
        } else {
            console.log(logMsg);
        }
    },
    
    /**
     * Warning logging - always logged
     * @param {string} feature - Feature category
     * @param {string} message - Log message
     * @param {object} data - Optional data object
     */
    warn: (feature, message, data = null) => {
        const timestamp = getTimestamp();
        const logMsg = `⚠️ [${timestamp}] [${feature}] ${message}`;
        if (data) {
            console.warn(logMsg, data);
        } else {
            console.warn(logMsg);
        }
    },
    
    /**
     * Error logging - always logged
     * @param {string} feature - Feature category
     * @param {string} message - Log message
     * @param {Error} error - Error object
     */
    error: (feature, message, error = null) => {
        const timestamp = getTimestamp();
        const logMsg = `❌ [${timestamp}] [${feature}] ${message}`;
        if (error) {
            console.error(logMsg, error);
        } else {
            console.error(logMsg);
        }
    },
    
    /**
     * Performance logging - only in development or when FORCE_DEBUG=true
     * @param {string} feature - Feature category
     * @param {string} operation - Operation description
     * @param {number} duration - Duration in milliseconds
     */
    perf: (feature, operation, duration) => {
        if (DEBUG) {
            const timestamp = getTimestamp();
            console.log(`⏱️ [${timestamp}] [PERF] [${feature}] ${operation} took ${duration}ms`);
        }
    }
};

/**
 * Quick performance measurement helper
 * @param {function} fn - Function to measure
 * @param {string} feature - Feature category
 * @param {string} operation - Operation description
 * @returns {Promise<any>} Result of the function
 */
export async function measurePerf(fn, feature, operation) {
    const start = Date.now();
    try {
        const result = await fn();
        logger.perf(feature, operation, Date.now() - start);
        return result;
    } catch (error) {
        logger.perf(feature, `${operation} (failed)`, Date.now() - start);
        throw error;
    }
}

/**
 * Environment status
 */
export const loggingConfig = {
    isDev,
    forceDebug,
    debugEnabled: DEBUG,
    environment: isDev ? 'development' : 'production'
};

// Log initialization
if (DEBUG) {
    console.log(`🔍 [${getTimestamp()}] [LOGGER] Logging initialized: ${loggingConfig.environment} mode, debug=${DEBUG}`);
}