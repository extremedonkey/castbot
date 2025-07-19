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
const commitMessage = process.argv[3]; // Second argument - git commit message

/**
 * Generate test steps based on commit message content
 */
function generateTestSteps(commitMessage) {
    if (!commitMessage) return null;
    
    const message = commitMessage.toLowerCase();
    
    // Safari-related changes
    if (message.includes('safari')) {
        if (message.includes('button') || message.includes('ui')) {
            return "1. Go to `/menu` → Safari\n2. Test all Safari buttons work correctly\n3. Check mobile Discord compatibility";
        }
        if (message.includes('store') || message.includes('shop')) {
            return "1. Go to `/menu` → Safari → Store\n2. Test purchase functionality\n3. Verify currency calculations";
        }
        if (message.includes('map') || message.includes('explore')) {
            return "1. Go to `/menu` → Safari → Map\n2. Test movement and exploration\n3. Check location updates";
        }
        return "1. Go to `/menu` → Safari\n2. Test affected Safari functionality\n3. Verify no regressions";
    }
    
    // Button-related changes
    if (message.includes('button')) {
        return "1. Test the affected button(s)\n2. Check for 'This interaction failed' errors\n3. Verify button styling and behavior";
    }
    
    // Menu-related changes
    if (message.includes('menu')) {
        return "1. Test `/menu` command\n2. Navigate through affected menu sections\n3. Check all buttons work correctly";
    }
    
    // Database/storage changes
    if (message.includes('storage') || message.includes('data') || message.includes('json')) {
        return "1. Test data persistence\n2. Check for any data corruption\n3. Verify backup functionality";
    }
    
    // Command changes
    if (message.includes('command') || message.includes('slash')) {
        return "1. Test the affected slash command(s)\n2. Verify command registration\n3. Check parameter handling";
    }
    
    // Fix-related changes
    if (message.includes('fix') || message.includes('bug')) {
        return "1. Reproduce the original bug scenario\n2. Verify the fix works as expected\n3. Test edge cases around the fix";
    }
    
    // General fallback
    return "1. Test the affected functionality\n2. Check for any console errors\n3. Verify no regressions in related features";
}

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
        
        // Build message content with new formatting
        let messageContent = `> # \`⚠️ ${environment} Server Restart!                                                \`

<@391415444084490240>`;

        // Add git commit message if provided
        if (commitMessage) {
            messageContent += `\n\n\n## :gem: Change\n${commitMessage}`;
            
            // Add suggested test steps based on commit message content
            const testSteps = generateTestSteps(commitMessage);
            if (testSteps) {
                messageContent += `\n\n## :test_tube: Test Steps\n${testSteps}`;
            }
        }

        // Add custom message if provided
        if (customMessage) {
            messageContent += `\n\n**🤖 Claude Message:** ${customMessage}`;
        }

        messageContent += `\n\n\n>  # \`⚠️ ${environment} Server Restart!                                            \``;
        
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