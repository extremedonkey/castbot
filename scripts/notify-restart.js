#!/usr/bin/env node

/**
 * Discord Restart Notification Script
 * Sends a notification to the deploy channel when the development or production server restarts
 * Usage: node notify-restart.js [custom-message]
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DiscordRequest } from '../utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Configuration
const GUILD_ID = '1331657596087566398';
const CHANNEL_ID = '1337754151655833694'; // #💎deploy channel
const TIMEOUT_MS = 8000; // 8 second timeout

// Parse command line arguments
const customMessage = process.argv[2]; // First argument after script name
const commitMessage = process.argv[3]; // Second argument - git commit message
const filesChanged = process.argv[4]; // Third argument - files changed
const gitStats = process.argv[5]; // Fourth argument - git stats

/**
 * Analyze files changed and provide risk assessment
 */
function analyzeChanges(filesChanged, commitMessage) {
    if (!filesChanged) return null;
    
    const files = filesChanged.split(',').filter(f => f.length > 0);
    const analysis = {
        riskLevel: 'low',
        warnings: [],
        insights: []
    };
    
    // Risk assessment based on files
    if (files.includes('app.js')) {
        analysis.riskLevel = 'high';
        analysis.warnings.push('Core app.js modified - test all interactions');
    }
    
    if (files.some(f => f.includes('safariManager'))) {
        analysis.riskLevel = 'medium';
        analysis.insights.push('Safari system changes - check player data');
    }
    
    if (files.some(f => f.includes('.json'))) {
        analysis.insights.push('Data structure changes detected');
    }
    
    if (files.some(f => f.includes('button') || f.includes('Button'))) {
        analysis.insights.push('Button system changes - verify handlers');
    }
    
    // Feature detection
    const features = [];
    if (files.some(f => f.includes('safari'))) features.push('Safari');
    if (files.some(f => f.includes('menu'))) features.push('Menu');
    if (files.some(f => f.includes('command'))) features.push('Commands');
    
    if (features.length > 0) {
        analysis.insights.push(`Affects: ${features.join(', ')}`);
    }
    
    return analysis;
}

/**
 * Generate file summary
 */
function generateFileSummary(filesChanged, gitStats) {
    if (!filesChanged) return null;
    
    const files = filesChanged.split(',').filter(f => f.length > 0);
    if (files.length === 0) return null;
    
    const summary = files.slice(0, 5).map(f => `\`${f}\``).join(', ');
    const moreFiles = files.length > 5 ? ` (+${files.length - 5} more)` : '';
    
    return summary + moreFiles;
}

/**
 * Generate auto Claude message based on commit content
 */
function generateAutoClaudeMessage(commitMessage) {
    if (!commitMessage) return "Server restarted - ready for testing!";
    
    const message = commitMessage.toLowerCase();
    
    // Safari-related changes
    if (message.includes('safari')) {
        if (message.includes('fix')) return "Safari issue resolved - check it out!";
        if (message.includes('button')) return "Safari buttons updated - they should work better now!";
        if (message.includes('map')) return "Safari map improvements deployed!";
        if (message.includes('store')) return "Safari store functionality enhanced!";
        return "Safari system updated - test the changes!";
    }
    
    // UI/UX improvements
    if (message.includes('ui') || message.includes('layout')) {
        return "UI improvements deployed - interface should look better!";
    }
    
    // Button-related changes
    if (message.includes('button')) {
        return "Button system updated - interactions should be smoother!";
    }
    
    // Menu-related changes
    if (message.includes('menu')) {
        return "Menu system enhanced - navigation improved!";
    }
    
    // Fix-related changes
    if (message.includes('fix') || message.includes('bug')) {
        return "Bug fix deployed - issue should be resolved!";
    }
    
    // Cast ranking changes
    if (message.includes('cast ranking') || message.includes('ranking')) {
        return "Cast Ranking system updated - check the improvements!";
    }
    
    // Database/storage changes
    if (message.includes('storage') || message.includes('data')) {
        return "Data system improvements deployed!";
    }
    
    // General improvements
    if (message.includes('improve') || message.includes('enhance')) {
        return "System enhancements deployed - performance should be better!";
    }
    
    // Add feature detection
    if (message.includes('add') || message.includes('new')) {
        return "New feature added - give it a try!";
    }
    
    // Cleanup/refactor
    if (message.includes('cleanup') || message.includes('refactor')) {
        return "Code cleanup completed - system should run smoother!";
    }
    
    // Default fallback
    return "Changes deployed - ready for testing!";
}

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
    try {
        console.log('🔔 Sending restart notification to Discord...');

        // Determine environment
        const isProduction = process.env.PRODUCTION === 'TRUE';
        const environment = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
        
        // Get current time
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });

        // Build message content with new formatting
        let messageContent = `> # \`🖥️ ${environment} Server Restart!                                                \`

<@391415444084490240>

## :clock1: Time
\`${timeString}\``;

        // Add git commit message if provided
        if (commitMessage) {
            messageContent += `\n\n## :gem: Change\n${commitMessage}`;
            
            // Add file summary
            const fileSummary = generateFileSummary(filesChanged, gitStats);
            if (fileSummary) {
                messageContent += `\n\n## :file_folder: Files Changed\n${fileSummary}`;
                
                if (gitStats) {
                    messageContent += `\n*${gitStats}*`;
                }
            }
            
            // Add risk analysis
            const analysis = analyzeChanges(filesChanged, commitMessage);
            if (analysis) {
                const riskEmoji = analysis.riskLevel === 'high' ? ':red_circle:' : 
                                analysis.riskLevel === 'medium' ? ':yellow_circle:' : ':green_circle:';
                messageContent += `\n\n## ${riskEmoji} Risk Level: ${analysis.riskLevel.toUpperCase()}`;
                
                if (analysis.warnings.length > 0) {
                    messageContent += `\n**⚠️ Warnings:**\n${analysis.warnings.map(w => `• ${w}`).join('\n')}`;
                }
                
                if (analysis.insights.length > 0) {
                    messageContent += `\n**💡 Insights:**\n${analysis.insights.map(i => `• ${i}`).join('\n')}`;
                }
            }
            
            // Add suggested test steps based on commit message content
            const testSteps = generateTestSteps(commitMessage);
            if (testSteps) {
                messageContent += `\n\n## :test_tube: Test Steps\n${testSteps}`;
            }
        }

        // Add custom message - generate one if not provided
        const finalCustomMessage = customMessage || generateAutoClaudeMessage(commitMessage);
        if (finalCustomMessage) {
            messageContent += `\n\n**🤖 Claude Message:** ${finalCustomMessage}`;
        }

        // Create the notification message with Components V2 structure using direct API
        // Use blue accent for production, red for development
        const accentColor = isProduction ? 0x3498db : 0xe74c3c; // Blue for prod, Red for dev
        
        const messageData = {
            flags: (1 << 15), // IS_COMPONENTS_V2
            components: [{
                type: 17, // Container
                accent_color: accentColor,
                components: [
                    {
                        type: 10, // Text Display
                        content: messageContent
                    },
                    { type: 14 }, // Separator
                    {
                        type: 1, // Action Row
                        components: [
                            {
                                type: 2, // Button
                                label: "💎 Go to #deploy",
                                style: 5, // Link style
                                url: `https://discord.com/channels/1331657596087566398/1337754151655833694`
                            },
                            {
                                type: 2, // Button
                                custom_id: "viral_menu",
                                label: "📋 Open Prod Menu",
                                style: 2 // Secondary (grey)
                            },
                            {
                                type: 2, // Button
                                custom_id: "restart_test_not_tested",
                                label: "⏳ Not Tested",
                                style: 2, // Secondary (grey)
                                disabled: true // Start inactive
                            },
                            {
                                type: 2, // Button
                                custom_id: "restart_test_tested", 
                                label: "✅ Tested",
                                style: 2 // Secondary (grey) - starts active
                            }
                        ]
                    }
                ]
            }]
        };

        // Send using direct Discord API to support Components V2
        await DiscordRequest(`channels/${CHANNEL_ID}/messages`, {
            method: 'POST',
            body: messageData
        });
        console.log(`✅ Restart notification sent to ${environment} channel`);

    } catch (error) {
        console.log(`❌ Failed to send Discord notification: ${error.message}`);
        console.log('ℹ️  Restart will continue normally');
    } finally {
        // No cleanup needed for direct API calls
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