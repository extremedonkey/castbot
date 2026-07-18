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
import { generateDeploymentButtons, generateTestSteps } from './buttonDetection.js';

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
const testDeployStatus = process.argv[7]; // Sixth - test-instance deploy result: deployed|skipped|failed

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

        // Determine environment (INSTANCE_ROLE=test wins, else PRODUCTION flag, else dev)
        const isProduction = process.env.PRODUCTION === 'TRUE';
        const environment = process.env.INSTANCE_ROLE === 'test' ? 'TEST'
            : isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
        
        // Get current time — pinned to GMT+8 (Reece's local time) so it renders
        // correctly regardless of which box runs this script. The dev notify runs on
        // the laptop (GMT+8) but the test self-announce runs on the AWS box (UTC),
        // which otherwise showed UTC. Asia/Singapore is a fixed GMT+8 zone (no DST).
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Singapore'
        });

        // Build message content — LEAN layout (triple-backtick section headings,
        // -# small-text metadata). The old giant "## Time" / "## Risk Level" sections
        // were mostly noise (app.js is in nearly every commit, so risk was always HIGH).
        let messageContent = `## 🖥️ ${environment} Server Restart\n-# 🕐 ${timeString} · <@391415444084490240>`;

        // Add git commit message if provided
        if (commitMessage) {
            messageContent += `\n### \`\`\`💎 Change\`\`\`\n${commitMessage}`;

            const fileSummary = generateFileSummary(filesChanged, gitStats);
            if (fileSummary) {
                messageContent += `\n-# 📁 ${fileSummary}${gitStats ? ` — ${gitStats}` : ''}`;
            }
        }

        // TLDR test checklist — one line per detected feature area, plus a
        // regression floor. The smart buttons below are the deep-links for these.
        const testSteps = generateTestSteps(filesChanged, commitMessage);
        messageContent += `\n### \`\`\`🧪 Test Steps\`\`\`\n`;
        messageContent += testSteps.length > 0
            ? testSteps.map(s => `☐ ${s}`).join('\n')
            : '☐ Click the smart buttons below — each should open its screen cleanly';
        messageContent += `\n-# Regression: /menu opens · no new noise in #error`;

        // Compact status line: unit tests + deploy targets
        const statusBits = [];
        if (testSummary) {
            statusBits.push(`🧪 ${testSummary}`);
        }
        if (testDeployStatus) {
            const targets = {
                deployed: '🎯 🖥️ dev + 🟦 test',
                skipped: '🎯 🖥️ dev only (`-dev-only`)',
                failed: '🎯 🖥️ dev — ⚠️ TEST deploy FAILED (run `npm run deploy-test`)'
            };
            statusBits.push(targets[testDeployStatus] || `🎯 ${testDeployStatus}`);
        }
        if (statusBits.length > 0) {
            messageContent += `\n\n-# ${statusBits.join(' · ')}`;
        }

        // Add custom message only if explicitly provided
        if (customMessage) {
            messageContent += `\n\n**🤖 Claude:** ${customMessage}`;
        }

        // Create the notification message with Components V2 structure using direct API
        // Blue for prod, orange for test, red for development
        const accentColor = environment === 'TEST' ? 0xf39c12 : isProduction ? 0x3498db : 0xe74c3c;
        
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
                            // Context-aware Ask Moai: prefills the modal with THIS card's
                            // text (commit, files, test results). DEV/TEST only — the Moai
                            // has no Claude CLI in production.
                            const moaiButton = environment !== 'PRODUCTION' ? [{
                                type: 2,
                                custom_id: 'moai_ask_msg',
                                label: 'Ask Moai',
                                style: 2,
                                emoji: { name: '🗿' }
                            }] : [];
                            try {
                                // Generate smart buttons based on changes (registry-resolved)
                                console.log('🔍 Generating smart deployment buttons...');
                                const smartButtons = generateDeploymentButtons(filesChanged, commitMessage, isProduction);
                                // Row cap is 5: overflow sheds the lowest-priority SMART
                                // buttons — never Pass/Fail (the card's whole point) or Moai
                                let allButtons = [...moaiButton, ...smartButtons];
                                if (allButtons.length > 5) {
                                    const passFail = allButtons.filter(b => b.custom_id.startsWith('restart_status_'));
                                    const rest = allButtons.filter(b => !b.custom_id.startsWith('restart_status_'));
                                    allButtons = [...rest.slice(0, 5 - passFail.length), ...passFail];
                                }
                                console.log(`🔍 Using ${allButtons.length} buttons: ${allButtons.map(b => b.label).join(', ')}`);
                                return allButtons;
                            } catch (error) {
                                console.log(`🔍 Button generation failed, using defaults: ${error.message}`);
                                // Fallback if smart detection fails
                                return [
                                    ...moaiButton,
                                    { type: 2, custom_id: 'viral_menu', label: 'Prod Menu', style: 2, emoji: { name: '📋' } },
                                    { type: 2, custom_id: 'restart_status_passed', label: 'Pass', style: 2, emoji: { name: '✅' } },
                                    { type: 2, custom_id: 'restart_status_failed', label: 'Fail', style: 2, emoji: { name: '❌' } }
                                ].slice(0, 5);
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