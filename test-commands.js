import 'dotenv/config';
import { DiscordRequest } from './utils.js';

// Test script to check command registration status and re-register if needed

const APP_ID = process.env.APP_ID;
const DEV_GUILD_ID = process.env.DEV_GUILD_ID;

async function testCommands() {
    console.log('=== CastBot Command Registration Test ===');
    console.log(`APP_ID: ${APP_ID}`);
    console.log(`DEV_GUILD_ID: ${DEV_GUILD_ID}`);
    console.log(`PRODUCTION: ${process.env.PRODUCTION}`);
    console.log('');

    try {
        // Check current guild commands
        console.log('📋 Checking current guild commands...');
        const currentCommands = await DiscordRequest(`applications/${APP_ID}/guilds/${DEV_GUILD_ID}/commands`, {
            method: 'GET'
        });

        console.log(`Found ${currentCommands.length} registered commands:`);
        currentCommands.forEach(cmd => {
            console.log(`  - ${cmd.name} (ID: ${cmd.id})`);
        });
        console.log('');

        // Check if apply_button command exists (could be with or without dev_ prefix)
        const applyButtonCmd = currentCommands.find(cmd => cmd.name === 'apply_button' || cmd.name === 'dev_apply_button');
        if (applyButtonCmd) {
            console.log(`✅ ${applyButtonCmd.name} command is registered!`);
            console.log(`   ID: ${applyButtonCmd.id}`);
            console.log(`   Description: ${applyButtonCmd.description}`);
        } else {
            console.log('❌ apply_button command NOT found!');
            console.log('🔄 Re-registering commands...');
            
            // Import and register commands
            const { ALL_COMMANDS } = await import('./commands.js');
            console.log(`Registering ${ALL_COMMANDS.length} commands to guild ${DEV_GUILD_ID}...`);
            
            const response = await DiscordRequest(`applications/${APP_ID}/guilds/${DEV_GUILD_ID}/commands`, {
                method: 'PUT',
                body: ALL_COMMANDS
            });
            
            console.log('✅ Commands re-registered successfully!');
            console.log(`Response: ${response.length} commands registered`);
        }

    } catch (error) {
        console.error('❌ Error testing commands:', error);
        if (error.message.includes('401')) {
            console.error('🚨 Authentication failed! Check your DISCORD_TOKEN and APP_ID');
        } else if (error.message.includes('403')) {
            console.error('🚨 Permission denied! Make sure the bot has proper permissions');
        } else if (error.message.includes('404')) {
            console.error('🚨 Guild not found! Check your DEV_GUILD_ID');
        }
    }
}

// Helper function to clear all commands (useful for debugging)
async function clearAllCommands() {
    try {
        console.log('🗑️ Clearing all guild commands...');
        await DiscordRequest(`applications/${APP_ID}/guilds/${DEV_GUILD_ID}/commands`, {
            method: 'PUT',
            body: []
        });
        console.log('✅ All commands cleared!');
    } catch (error) {
        console.error('❌ Error clearing commands:', error);
    }
}

// Helper function to force re-register
async function forceReRegister() {
    try {
        console.log('🔄 Force re-registering all commands...');
        const { ALL_COMMANDS } = await import('./commands.js');
        
        // Clear first
        await clearAllCommands();
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Re-register
        const response = await DiscordRequest(`applications/${APP_ID}/guilds/${DEV_GUILD_ID}/commands`, {
            method: 'PUT',
            body: ALL_COMMANDS
        });
        
        console.log(`✅ ${response.length} commands force re-registered!`);
        return response;
    } catch (error) {
        console.error('❌ Error force re-registering:', error);
        throw error;
    }
}

// Check command line arguments
const args = process.argv.slice(2);

if (args.includes('--clear')) {
    clearAllCommands();
} else if (args.includes('--force')) {
    forceReRegister();
} else {
    testCommands();
}

export { testCommands, clearAllCommands, forceReRegister };