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
import { generateDeploymentButtons } from './buttonDetection.js';

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
const testSummary = process.argv[6]; // Fifth argument - test results (e.g. "29 pass, 0 fail (6 suites)")

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
            
        }

        // Add test results if tests were run
        if (testSummary) {
            messageContent += `\n\n## :white_check_mark: Unit Tests\n\`${testSummary}\``;
        }

        // Add custom message only if explicitly provided
        if (customMessage) {
            messageContent += `\n\n**🤖 Claude:** ${customMessage}`;
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
                        components: (() => {
                            try {
                                // Generate smart buttons based on changes
                                console.log('🔍 Generating smart deployment buttons...');
                                const smartButtons = generateDeploymentButtons(filesChanged, commitMessage, isProduction);
                                
                                // Always add Moai first
                                const moaiButton = {
                                    type: 2,
                                    custom_id: "moai_ask",
                                    label: "🗿 Moai",
                                    style: 2
                                };

                                // Combine fixed buttons with smart buttons (max 5 total)
                                const allButtons = [moaiButton, ...smartButtons].slice(0, 5);
                                console.log(`🔍 Using ${allButtons.length} buttons: ${allButtons.map(b => b.label).join(', ')}`);
                                return allButtons;
                                
                            } catch (error) {
                                console.log(`🔍 Button generation failed, using defaults: ${error.message}`);
                                // Fallback to original buttons if smart detection fails
                                return [
                                    {
                                        type: 2,
                                        custom_id: "moai_ask",
                                        label: "🗿 Moai",
                                        style: 2
                                    },
                                    {
                                        type: 2,
                                        custom_id: "viral_menu",
                                        label: "📋 Prod Menu",
                                        style: 2
                                    },
                                    {
                                        type: 2,
                                        custom_id: "restart_status_passed",
                                        label: "✅ Pass",
                                        style: 2
                                    },
                                    {
                                        type: 2,
                                        custom_id: "restart_status_failed",
                                        label: "❌ Fail",
                                        style: 2
                                    }
                                ];
                            }
                        })()
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