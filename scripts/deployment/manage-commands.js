import 'dotenv/config';
import { DiscordRequest } from '../../utils.js';
import { ALL_COMMANDS } from '../../commands.js';

/**
 * CastBot Command Management Script
 * 
 * Simplified global-only command deployment script.
 * Handles cleanup, registration, and verification of slash commands.
 * 
 * Usage:
 *   npm run deploy-commands        - Full deployment (global only)
 *   npm run analyze-commands       - Preview changes without deploying
 *   npm run clean-commands         - Only clean existing commands
 *   npm run verify-commands        - Only verify current commands
 *   node manage-commands.js --analyze-only  - Same as analyze-commands
 *   node manage-commands.js --dry-run       - Same as analyze-commands
 * 
 * Note: dev_ prefix system has been removed. All commands deploy globally.
 */

// Configuration
const APP_ID = process.env.APP_ID;
// DEV_GUILD_ID deprecated - keeping for backward compatibility only
const DEV_GUILD_ID = process.env.DEV_GUILD_ID;
const IS_PRODUCTION = process.env.PRODUCTION === 'TRUE';

// Parse command line arguments
const args = process.argv.slice(2);
const CLEAN_ONLY = args.includes('--clean-only');
const VERIFY_ONLY = args.includes('--verify-only');
const ANALYZE_ONLY = args.includes('--analyze-only') || args.includes('--dry-run');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
        'info': '📋',
        'success': '✅',
        'error': '❌',
        'warning': '⚠️',
        'debug': '🔍'
    }[level] || '📋';
    
    console.log(`${prefix} ${message}`);
    if (VERBOSE && level === 'debug') {
        console.log(`   [${timestamp}]`);
    }
}

async function rateLimitAwareRequest(endpoint, options, retries = 3) {
    try {
        const response = await DiscordRequest(endpoint, options);
        return response;
    } catch (error) {
        if (error?.message?.includes('rate limited') && retries > 0) {
            const retryAfter = error.message.includes('retry_after') 
                ? JSON.parse(error.message).retry_after * 1000 
                : 30000;
            
            log(`Rate limited. Waiting ${retryAfter/1000} seconds before retry...`, 'warning');
            await sleep(retryAfter);
            return rateLimitAwareRequest(endpoint, options, retries - 1);
        }
        throw error;
    }
}

async function getExistingCommands(appId) {
    try {
        const endpoint = `applications/${appId}/commands`;
        
        const response = await rateLimitAwareRequest(endpoint, { method: 'GET' });
        
        // Handle different response formats
        if (Array.isArray(response)) {
            return response;
        } else if (response && typeof response === 'object') {
            return response;
        } else if (response instanceof Response) {
            return await response.json();
        }
        
        log('Unexpected response format from Discord API', 'warning');
        return [];
        
    } catch (error) {
        log(`Error fetching existing commands: ${error.message}`, 'error');
        return [];
    }
}

async function deleteCommand(appId, commandId) {
    try {
        const endpoint = `applications/${appId}/commands/${commandId}`;
        
        await rateLimitAwareRequest(endpoint, { method: 'DELETE' });
        return true;
    } catch (error) {
        log(`Error deleting command ${commandId}: ${error.message}`, 'error');
        return false;
    }
}

async function cleanExistingCommands() {
    log('🧹 Cleaning existing commands...', 'info');
    
    // Get existing commands
    const globalCommands = await getExistingCommands(APP_ID);
    
    log(`Found ${globalCommands.length} global commands`, 'debug');
    
    let cleanupCount = 0;
    
    // Remove any unexpected commands (dev_ prefix or duplicates)
    log('Checking for unexpected or duplicate commands', 'info');
    
    // Remove dev_ commands from global
    for (const cmd of globalCommands) {
        if (cmd.name.startsWith('dev_')) {
            log(`Deleting unexpected dev command: ${cmd.name}`, 'debug');
            const success = await deleteCommand(APP_ID, cmd.id);
            if (success) cleanupCount++;
            await sleep(500); // Rate limiting
        }
    }
    
    // Find and remove duplicate global commands
    const globalNameCount = {};
    const globalDuplicates = [];
    
    globalCommands.forEach(cmd => {
        globalNameCount[cmd.name] = (globalNameCount[cmd.name] || 0) + 1;
        if (globalNameCount[cmd.name] > 1) {
            globalDuplicates.push(cmd);
        }
    });
    
    // Delete duplicates
    for (const cmd of globalDuplicates) {
        log(`Deleting duplicate global command: ${cmd.name}`, 'debug');
        const success = await deleteCommand(APP_ID, cmd.id);
        if (success) cleanupCount++;
        await sleep(500);
    }
    
    if (cleanupCount > 0) {
        log(`Cleaned up ${cleanupCount} commands`, 'success');
        await sleep(2000); // Give Discord a moment after cleanup
    } else {
        log('No cleanup needed', 'success');
    }
    
    return cleanupCount;
}

async function analyzeCommandChanges() {
    log('🔍 Analyzing command changes...', 'info');
    
    // Get current commands
    const currentGlobal = await getExistingCommands(APP_ID);
    
    // Get expected commands
    const expectedCommands = ALL_COMMANDS.map(cmd => cmd.name);
    
    const changes = {
        global: {
            added: [],
            removed: [],
            unchanged: []
        }
    };
    
    // Analyze global commands
    const currentGlobalNames = currentGlobal.map(cmd => cmd.name);
    
    for (const expectedName of expectedCommands) {
        if (!currentGlobalNames.includes(expectedName)) {
            changes.global.added.push(expectedName);
        } else {
            changes.global.unchanged.push(expectedName);
        }
    }
    
    for (const currentName of currentGlobalNames) {
        if (!expectedCommands.includes(currentName)) {
            changes.global.removed.push(currentName);
        }
    }
    
    // Log analysis
    const hasChanges = changes.global.added.length > 0 || changes.global.removed.length > 0;
    
    if (hasChanges) {
        log('Command changes detected:', 'warning');
        
        if (changes.global.added.length > 0) {
            log(`  Global commands to ADD: ${changes.global.added.join(', ')}`, 'info');
        }
        if (changes.global.removed.length > 0) {
            log(`  Global commands to REMOVE: ${changes.global.removed.join(', ')}`, 'warning');
        }
        
        log(`Unchanged: ${changes.global.unchanged.length} global`, 'debug');
    } else {
        log('No command changes detected', 'success');
    }
    
    return changes;
}

async function deployCommands() {
    log('🚀 Deploying commands...', 'info');
    
    let deployCount = 0;
    
    // Deploy global commands only
    log('Deploying global commands', 'info');
    
    const commandsToRegister = ALL_COMMANDS.map(cmd => ({
        ...cmd,
        dm_permission: false // Disable DM usage for all commands
    }));
    
    log(`Registering ${commandsToRegister.length} global commands...`, 'debug');
    
    const response = await rateLimitAwareRequest(`applications/${APP_ID}/commands`, {
        method: 'PUT',
        body: commandsToRegister,
    });
    
    deployCount = Array.isArray(response) ? response.length : 0;
    log(`Deployed ${deployCount} global commands`, 'success');
    log('Note: Global commands may take up to 1 hour to propagate to all servers', 'info');
    
    return deployCount;
}

async function verifyCommands() {
    log('🔍 Verifying command registration...', 'info');
    
    const globalCommands = await getExistingCommands(APP_ID);
    
    let verificationResults = {
        global: { expected: 0, found: 0, missing: [] }
    };
    
    // Verify all expected commands are globally registered
    verificationResults.global.expected = ALL_COMMANDS.length;
    
    for (const expectedCmd of ALL_COMMANDS) {
        const found = globalCommands.find(cmd => cmd.name === expectedCmd.name);
        if (found) {
            verificationResults.global.found++;
            log(`✓ Global command verified: ${found.name}`, 'debug');
        } else {
            verificationResults.global.missing.push(expectedCmd.name);
            log(`✗ Missing global command: ${expectedCmd.name}`, 'debug');
        }
    }
    
    // Check for unexpected dev_ commands
    const devCommands = globalCommands.filter(cmd => cmd.name.startsWith('dev_'));
    if (devCommands.length > 0) {
        log(`Warning: Found ${devCommands.length} unexpected dev_ commands`, 'warning');
    }
    
    // Report results
    log('Verification Results:', 'info');
    log(`  Global: ${verificationResults.global.found}/${verificationResults.global.expected} commands found`, 'info');
    
    if (verificationResults.global.missing.length > 0) {
        log(`  Missing global commands: ${verificationResults.global.missing.join(', ')}`, 'warning');
    }
    
    const allCommandsRegistered = verificationResults.global.missing.length === 0;
    
    if (allCommandsRegistered) {
        log('All commands verified successfully!', 'success');
    } else {
        log('Some commands may not have registered properly', 'warning');
    }
    
    return verificationResults;
}

async function main() {
    try {
        log('=== CastBot Command Management ===', 'info');
        log(`Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`, 'info');
        log(`App ID: ${APP_ID}`, 'debug');
        log('', 'info');
        
        // Validate configuration
        if (!APP_ID) {
            throw new Error('APP_ID environment variable is required');
        }
        
        if (ALL_COMMANDS.length === 0) {
            throw new Error('No commands found in commands.js');
        }
        
        log(`Loaded ${ALL_COMMANDS.length} commands from commands.js`, 'debug');
        
        let results = {
            cleaned: 0,
            deployed: 0,
            verified: false
        };
        
        // Execute based on mode
        if (VERIFY_ONLY) {
            results.verified = await verifyCommands();
        } else if (CLEAN_ONLY) {
            results.cleaned = await cleanExistingCommands();
        } else if (ANALYZE_ONLY) {
            const changes = await analyzeCommandChanges();
            log('', 'info');
            log('=== Analysis Complete (No Changes Made) ===', 'success');
            log('Use npm run deploy-commands to apply these changes', 'info');
        } else {
            // Full deployment process
            
            // Analyze what changes will be made
            const changes = await analyzeCommandChanges();
            
            results.cleaned = await cleanExistingCommands();
            results.deployed = await deployCommands();
            
            // Wait a moment then verify
            await sleep(3000);
            results.verified = await verifyCommands();
        }
        
        log('', 'info');
        log('=== Deployment Complete ===', 'success');
        
        if (!VERIFY_ONLY && !CLEAN_ONLY && !ANALYZE_ONLY) {
            log(`✅ Cleaned: ${results.cleaned} commands`, 'success');
            log(`✅ Deployed: ${results.deployed} commands`, 'success');
            
            log('📝 Global commands may take up to 1 hour to propagate', 'info');
        }
        
        // Future automation hooks
        if (process.env.DEPLOYMENT_WEBHOOK) {
            // Hook for future AWS deployment automation
            log('Sending deployment notification...', 'debug');
        }
        
        process.exit(0);
        
    } catch (error) {
        log(`Deployment failed: ${error.message}`, 'error');
        
        if (error.message.includes('401')) {
            log('Authentication failed! Check your DISCORD_TOKEN and APP_ID', 'error');
        } else if (error.message.includes('403')) {
            log('Permission denied! Make sure the bot has proper permissions', 'error');
        } else if (error.message.includes('404')) {
            log('Resource not found! Check your APP_ID', 'error');
        }
        
        if (VERBOSE) {
            console.error('Full error details:', error);
        }
        
        process.exit(1);
    }
}

// Handle script termination gracefully
process.on('SIGINT', () => {
    log('Deployment interrupted by user', 'warning');
    process.exit(1);
});

process.on('SIGTERM', () => {
    log('Deployment terminated', 'warning');
    process.exit(1);
});

// Run the script
main();