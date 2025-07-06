#!/usr/bin/env node

/**
 * Discord Restart Notification Script
 * Sends a notification to the testing channel when the development server restarts
 * Usage: node notify-restart.js [custom-message]
 */

import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Configuration
const GUILD_ID = '1331657596087566398';
const CHANNEL_ID = '1337754151655833694'; // #🧪test channel (from logs)
const TIMEOUT_MS = 8000; // 8 second timeout

// Parse command line arguments
const customMessage = process.argv[2]; // First argument after script name

/**
 * Send restart notification to Discord
 */
async function sendRestartNotification() {
    const client = new Client({ 
        intents: [GatewayIntentBits.Guilds] 
    });

    try {
        console.log('🔔 Sending restart notification to Discord...');
        
        // Login with timeout
        const loginPromise = client.login(process.env.DISCORD_TOKEN);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Login timeout')), TIMEOUT_MS)
        );
        
        await Promise.race([loginPromise, timeoutPromise]);
        console.log('✅ Discord client logged in successfully');

        // Wait for client to be ready
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Ready timeout')), TIMEOUT_MS);
            client.once('ready', () => {
                clearTimeout(timer);
                resolve();
            });
        });

        // Get the channel
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            throw new Error(`Channel ${CHANNEL_ID} not found`);
        }

        // Determine environment
        const isProduction = process.env.PRODUCTION === 'TRUE';
        const environment = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
        
        // Build message content with optional custom message
        let messageContent = `> \`\`\`⚠️ Alert! \`\`\`
# ${environment} SERVER RESTARTING NOW...

<@391415444084490240>`;

        // Add custom message if provided
        if (customMessage) {
            messageContent += `\n\n**🤖 Claude Message:** ${customMessage}`;
        }

        messageContent += `\n\n> \`\`\`⚠️ Alert! \`\`\``;
        
        // Create the notification message with button
        const messageData = {
            content: messageContent,
            components: [
                {
                    type: 1, // Action Row
                    components: [
                        {
                            type: 2, // Button
                            custom_id: "viral_menu",
                            label: "📋 Open Prod Menu",
                            style: 1 // Primary
                        }
                    ]
                }
            ]
        };

        // Send the message
        await channel.send(messageData);
        console.log(`✅ Restart notification sent to ${environment} channel`);

    } catch (error) {
        console.log(`❌ Failed to send Discord notification: ${error.message}`);
        console.log('ℹ️  Restart will continue normally');
    } finally {
        // Clean disconnect
        try {
            if (client.isReady()) {
                await client.destroy();
            }
        } catch (destroyError) {
            // Ignore cleanup errors
        }
    }
}

// Run the notification
sendRestartNotification().then(() => {
    console.log('🔔 Notification script completed');
    process.exit(0);
}).catch((error) => {
    console.log(`❌ Notification script failed: ${error.message}`);
    process.exit(0); // Exit successfully to not block restart
});