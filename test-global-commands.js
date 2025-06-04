import 'dotenv/config';
import { DiscordRequest } from './utils.js';

// Test script for global command registration

const APP_ID = process.env.APP_ID;

async function testGlobalCommands() {
    console.log('=== CastBot Global Command Registration Test ===');
    console.log(`APP_ID: ${APP_ID}`);
    console.log(`PRODUCTION: ${process.env.PRODUCTION}`);
    console.log('');

    try {
        // Check current global commands
        console.log('🌍 Checking current global commands...');
        const currentCommands = await DiscordRequest(`applications/${APP_ID}/commands`, {
            method: 'GET'
        });

        console.log(`Found ${currentCommands.length} registered global commands:`);
        currentCommands.forEach(cmd => {
            console.log(`  - ${cmd.name} (ID: ${cmd.id})`);
        });
        console.log('');

        // Check if apply_button command exists
        const applyButtonCmd = currentCommands.find(cmd => cmd.name === 'apply_button');
        if (applyButtonCmd) {
            console.log(`✅ apply_button command is registered globally!`);
            console.log(`   ID: ${applyButtonCmd.id}`);
            console.log(`   Description: ${applyButtonCmd.description}`);
            console.log(`   Permissions: ${applyButtonCmd.default_member_permissions || 'None'}`);
        } else {
            console.log('❌ apply_button command NOT found in global commands!');
            console.log('🔄 Re-registering global commands...');
            
            // Import and register commands
            const { ALL_COMMANDS } = await import('./commands.js');
            console.log(`Registering ${ALL_COMMANDS.length} commands globally...`);
            
            const response = await DiscordRequest(`applications/${APP_ID}/commands`, {
                method: 'PUT',
                body: ALL_COMMANDS
            });
            
            console.log('✅ Global commands re-registered successfully!');
            console.log(`Response: ${response.length} commands registered`);
            
            // Check for apply_button in response
            const newApplyButton = response.find(cmd => cmd.name === 'apply_button');
            if (newApplyButton) {
                console.log(`✅ apply_button now registered globally (ID: ${newApplyButton.id})`);
            }
        }

        console.log('\n📝 Note: Global commands can take up to 1 hour to propagate to all servers.');
        console.log('💡 For immediate testing, use guild commands with: npm run registerguild');

    } catch (error) {
        console.error('❌ Error testing global commands:', error);
        if (error.message.includes('401')) {
            console.error('🚨 Authentication failed! Check your DISCORD_TOKEN and APP_ID');
        } else if (error.message.includes('403')) {
            console.error('🚨 Permission denied! Make sure the bot has proper permissions');
        }
    }
}

testGlobalCommands();