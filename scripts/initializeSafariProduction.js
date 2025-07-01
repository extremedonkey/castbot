#!/usr/bin/env node

/**
 * Production Safari Initialization Script
 * 
 * This script safely initializes Safari data structures for production servers.
 * It can be run on production without data loss and includes comprehensive logging.
 * 
 * Usage:
 *   node scripts/initializeSafariProduction.js [options]
 * 
 * Options:
 *   --guild-id <id>     Initialize specific guild only
 *   --dry-run          Preview changes without applying them
 *   --force-repair     Force repair of existing data structures
 *   --custom-config    JSON string of custom configuration
 *   --verbose          Enable verbose logging
 *   --help             Show this help message
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';

// Set up paths for imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Add project root to module resolution
process.chdir(projectRoot);

// Import modules
import {
    initializeGuildSafariData,
    initializeAllProductionGuilds,
    checkSafariInitializationStatus,
    repairSafariData,
    ensureImportExportCompatibility
} from '../safariInitialization.js';

/**
 * Script configuration
 */
const config = {
    guildId: null,
    dryRun: false,
    forceRepair: false,
    customConfig: {},
    verbose: false,
    help: false
};

/**
 * Parse command line arguments
 */
function parseArguments() {
    const args = process.argv.slice(2);
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--guild-id':
                config.guildId = args[++i];
                break;
            case '--dry-run':
                config.dryRun = true;
                break;
            case '--force-repair':
                config.forceRepair = true;
                break;
            case '--custom-config':
                try {
                    config.customConfig = JSON.parse(args[++i]);
                } catch (error) {
                    console.error('❌ ERROR: Invalid JSON for --custom-config');
                    process.exit(1);
                }
                break;
            case '--verbose':
                config.verbose = true;
                break;
            case '--help':
                config.help = true;
                break;
            default:
                if (arg.startsWith('--')) {
                    console.error(`❌ ERROR: Unknown option: ${arg}`);
                    process.exit(1);
                }
        }
    }
}

/**
 * Show help message
 */
function showHelp() {
    console.log(`
🦁 Safari Production Initialization Script

This script safely initializes Safari data structures for production servers.

Usage:
  node scripts/initializeSafariProduction.js [options]

Options:
  --guild-id <id>     Initialize specific guild only
  --dry-run          Preview changes without applying them
  --force-repair     Force repair of existing data structures
  --custom-config    JSON string of custom configuration
  --verbose          Enable verbose logging
  --help             Show this help message

Examples:
  # Initialize all production guilds
  node scripts/initializeSafariProduction.js

  # Initialize specific guild with dry run
  node scripts/initializeSafariProduction.js --guild-id 1234567890 --dry-run

  # Initialize with custom configuration
  node scripts/initializeSafariProduction.js --custom-config '{"currencyName":"gems","currencyEmoji":"💎"}'

  # Force repair corrupted data
  node scripts/initializeSafariProduction.js --guild-id 1234567890 --force-repair

  # Enable verbose logging
  node scripts/initializeSafariProduction.js --verbose

🔒 Safety Features:
  - Automatic backup creation before any changes
  - Dry-run mode for preview without changes
  - Comprehensive error handling and logging
  - Compatible with existing Import/Export system
  - No data loss - only adds missing structures

📊 Data Structures Initialized:
  - buttons: {}
  - safaris: {}
  - applications: {}
  - stores: {}
  - items: {}
  - safariConfig: { currencyName, inventoryName, currencyEmoji, etc. }
  - roundHistory: []
  - attackQueue: {}
`);
}

/**
 * Log message with timestamp
 */
function log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (level === 'debug' && !config.verbose) {
        return; // Skip debug messages unless verbose
    }
    
    console.log(prefix, message, ...args);
}

/**
 * Initialize specific guild
 */
async function initializeSpecificGuild(guildId) {
    try {
        log('info', `🔍 Checking initialization status for guild: ${guildId}`);
        
        // Check current status
        const status = await checkSafariInitializationStatus(guildId);
        log('info', `📊 Current status: ${status.status} - ${status.message}`);
        
        if (config.dryRun) {
            log('info', '🔍 DRY RUN: Would initialize/update Safari data for guild', guildId);
            if (status.initialized && !config.forceRepair) {
                log('info', '✅ DRY RUN: Guild already initialized, no changes needed');
            } else {
                log('info', '📝 DRY RUN: Would apply missing structures and configuration');
            }
            return { success: true, dryRun: true };
        }
        
        // Perform initialization or repair
        if (config.forceRepair || !status.initialized || status.status === 'partial_initialization') {
            if (config.forceRepair) {
                log('info', '🔧 Force repair requested, repairing Safari data...');
                const repairResult = await repairSafariData(guildId);
                log('info', '✅ Repair completed:', repairResult);
            } else {
                log('info', '🚀 Initializing Safari data...');
                const result = await initializeGuildSafariData(guildId, config.customConfig);
                log('info', '✅ Initialization completed successfully');
                log('debug', 'Initialization result:', result);
            }
        } else {
            log('info', '✅ Guild already fully initialized');
        }
        
        // Verify final status
        const finalStatus = await checkSafariInitializationStatus(guildId);
        log('info', `📊 Final status: ${finalStatus.status} - ${finalStatus.message}`);
        
        return { success: true, status: finalStatus };
        
    } catch (error) {
        log('error', `❌ Failed to initialize guild ${guildId}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Initialize all production guilds
 */
async function initializeAllGuilds() {
    try {
        log('info', '🚀 Starting initialization for all production guilds...');
        
        if (config.dryRun) {
            log('info', '🔍 DRY RUN: Would initialize Safari data for all production guilds');
            // We would need to load playerData.json to show what would be processed
            return { success: true, dryRun: true };
        }
        
        const results = await initializeAllProductionGuilds(config.customConfig);
        
        log('info', '📊 Batch initialization results:');
        log('info', `  ✅ Successful: ${results.successful.length}`);
        log('info', `  ❌ Failed: ${results.failed.length}`);
        log('info', `  ⏭️ Skipped: ${results.skipped.length}`);
        log('info', `  📊 Total processed: ${results.totalProcessed}`);
        
        if (config.verbose) {
            if (results.successful.length > 0) {
                log('debug', '✅ Successfully initialized guilds:', results.successful);
            }
            if (results.failed.length > 0) {
                log('debug', '❌ Failed guilds:', results.failed);
            }
            if (results.skipped.length > 0) {
                log('debug', '⏭️ Skipped guilds:', results.skipped);
            }
        }
        
        return { success: true, results };
        
    } catch (error) {
        log('error', '❌ Batch initialization failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Ensure Import/Export compatibility
 */
async function ensureCompatibility() {
    try {
        log('info', '🔍 Ensuring Import/Export system compatibility...');
        
        if (config.dryRun) {
            log('info', '🔍 DRY RUN: Would check and update Import/Export compatibility');
            return { success: true, dryRun: true };
        }
        
        const results = await ensureImportExportCompatibility();
        
        log('info', '📊 Compatibility check results:');
        log('info', `  📊 Processed: ${results.processed} guilds`);
        log('info', `  📝 Updated: ${results.updated} guilds`);
        log('info', `  ❌ Errors: ${results.errors.length}`);
        
        if (config.verbose && results.errors.length > 0) {
            log('debug', '❌ Compatibility errors:', results.errors);
        }
        
        return { success: true, results };
        
    } catch (error) {
        log('error', '❌ Compatibility check failed:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Main execution function
 */
async function main() {
    try {
        parseArguments();
        
        if (config.help) {
            showHelp();
            process.exit(0);
        }
        
        log('info', '🦁 Safari Production Initialization Script Started');
        log('info', '⚙️ Configuration:', {
            guildId: config.guildId || 'ALL',
            dryRun: config.dryRun,
            forceRepair: config.forceRepair,
            customConfig: Object.keys(config.customConfig).length > 0 ? config.customConfig : 'DEFAULT',
            verbose: config.verbose
        });
        
        // Safety warning for production
        if (!config.dryRun) {
            log('info', '⚠️ This script will modify production data. Backups will be created automatically.');
            log('info', '🔒 Use --dry-run to preview changes without applying them.');
        }
        
        let result;
        
        if (config.guildId) {
            // Initialize specific guild
            result = await initializeSpecificGuild(config.guildId);
        } else {
            // Initialize all production guilds
            result = await initializeAllGuilds();
        }
        
        // Ensure Import/Export compatibility
        const compatibilityResult = await ensureCompatibility();
        
        if (result.success && compatibilityResult.success) {
            log('info', '✅ Safari initialization completed successfully');
            process.exit(0);
        } else {
            log('error', '❌ Safari initialization completed with errors');
            process.exit(1);
        }
        
    } catch (error) {
        log('error', '💥 Script execution failed:', error.message);
        log('debug', 'Stack trace:', error.stack);
        process.exit(1);
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    log('error', '💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log('error', '💥 Uncaught Exception:', error.message);
    log('debug', 'Stack trace:', error.stack);
    process.exit(1);
});

// Run the script
main();