import 'dotenv/config';
import { DiscordRequest } from './utils.js';

// Proper dev command registration with dev_ prefix

const APP_ID = process.env.APP_ID;
const DEV_GUILD_ID = process.env.DEV_GUILD_ID;

async function registerDevCommands() {
    console.log('=== Registering Development Commands ===');
    console.log(`APP_ID: ${APP_ID}`);
    console.log(`DEV_GUILD_ID: ${DEV_GUILD_ID}`);
    console.log('');

    try {
        // Simulate guild argument for proper dev_ prefix
        process.argv.push('guild');
        
        // Import commands with guild argument
        const { ALL_COMMANDS } = await import('./commands.js');
        
        console.log(`Registering ${ALL_COMMANDS.length} commands to development guild:`);
        ALL_COMMANDS.forEach(cmd => {
            console.log(`  - ${cmd.name}`);
        });
        console.log('');

        const response = await DiscordRequest(`applications/${APP_ID}/guilds/${DEV_GUILD_ID}/commands`, {
            method: 'PUT',
            body: ALL_COMMANDS
        });

        console.log(`✅ Successfully registered ${response.length} development commands!`);
        
        // Verify apply_button was registered
        const applyButton = response.find(cmd => cmd.name === 'dev_apply_button');
        if (applyButton) {
            console.log(`✅ dev_apply_button registered successfully (ID: ${applyButton.id})`);
        } else {
            console.log('❌ dev_apply_button not found in response');
        }

    } catch (error) {
        console.error('❌ Error registering commands:', error);
        if (error.message.includes('401')) {
            console.error('🚨 Authentication failed! Check your DISCORD_TOKEN and APP_ID');
        } else if (error.message.includes('403')) {
            console.error('🚨 Permission denied! Make sure the bot has proper permissions');
        }
    }
}

registerDevCommands();