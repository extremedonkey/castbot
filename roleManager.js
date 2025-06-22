import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { 
    loadPlayerData, 
    savePlayerData, 
    updateGuildPronouns, 
    getGuildPronouns,
    getGuildTimezones
} from './storage.js';
import { 
    InteractionResponseType,
    InteractionResponseFlags
} from 'discord-interactions';

/**
 * CastBot Role Management System - Phase 1: Setup Functionality
 * 
 * This module provides centralized role management for CastBot with:
 * - Standard role definitions with DST support structure
 * - Role hierarchy checking to prevent assignment failures
 * - Intelligent setup logic with detailed user feedback
 * - Foundation for future role management features
 */

// Standard pronoun roles that CastBot can create/manage
const STANDARD_PRONOUN_ROLES = [
    'He/Him',
    'She/Her',
    'They/Them',
    'They/He',
    'She/They',
    'Ask',
    'Any',
    'All Pronouns'
];

// Reaction emojis for role selection - Discord limit: 20 for regular servers, 50 for boosted
// Using conservative 20-emoji limit for maximum compatibility
const REACTION_EMOJIS = [
    '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
    '🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'
];

// Enhanced timezone structure optimized for Discord's 20-reaction limit
// Prioritized list with most common timezones and both standard/daylight versions
const STANDARD_TIMEZONE_ROLES = [
    // North American zones (most common for Discord communities)
    { name: 'PST (UTC-8)', offset: -8, dstObserved: true, standardName: 'PST (UTC-8)' },
    { name: 'PDT (UTC-7)', offset: -7, dstObserved: true, standardName: 'PST (UTC-8)' },
    { name: 'MST (UTC-7)', offset: -7, dstObserved: true, standardName: 'MST (UTC-7)' },
    { name: 'MDT (UTC-6)', offset: -6, dstObserved: true, standardName: 'MST (UTC-7)' },
    { name: 'CST (UTC-6)', offset: -6, dstObserved: true, standardName: 'CST (UTC-6)' },
    { name: 'CDT (UTC-5)', offset: -5, dstObserved: true, standardName: 'CST (UTC-6)' },
    { name: 'EST (UTC-5)', offset: -5, dstObserved: true, standardName: 'EST (UTC-5)' },
    { name: 'EDT (UTC-4)', offset: -4, dstObserved: true, standardName: 'EST (UTC-5)' },
    { name: 'AST (UTC-4)', offset: -4, dstObserved: true, standardName: 'AST (UTC-4)' },
    { name: 'ADT (UTC-3)', offset: -3, dstObserved: true, standardName: 'AST (UTC-4)' },
    { name: 'NST (UTC-3:30)', offset: -3.5, dstObserved: true, standardName: 'NST (UTC-3:30)' },
    { name: 'NDT (UTC-2:30)', offset: -2.5, dstObserved: true, standardName: 'NST (UTC-3:30)' },
    
    // European zones
    { name: 'GMT (UTC+0)', offset: 0, dstObserved: false },
    { name: 'BST (UTC+1)', offset: 1, dstObserved: true, standardName: 'GMT (UTC+0)' },
    { name: 'CET (UTC+1)', offset: 1, dstObserved: true, standardName: 'CET (UTC+1)' },
    { name: 'CEST (UTC+2)', offset: 2, dstObserved: true, standardName: 'CET (UTC+1)' },
    
    // Asia-Pacific zones
    { name: 'SGT (UTC+8)', offset: 8, dstObserved: false },
    { name: 'AEST (UTC+10)', offset: 10, dstObserved: false },
    { name: 'AEDT (UTC+11)', offset: 11, dstObserved: true, standardName: 'AEST (UTC+10)' },
    { name: 'NZST (UTC+12)', offset: 12, dstObserved: true, standardName: 'NZST (UTC+12)' }
    // Total: 20 roles - exactly at Discord's conservative limit
];

/**
 * Discord Role Hierarchy Management Utilities
 * 
 * Discord's role hierarchy determines what a bot can and cannot manage:
 * - Bots cannot manage roles equal to or higher than their highest role
 * - Role position (higher number = higher in hierarchy)
 * - When bots join, they get a role with their name at the bottom
 * - Server admins can move bot roles up/down or assign additional roles
 */

/**
 * Check if bot can manage a specific role in a guild
 * @param {Guild} guild - Discord guild object
 * @param {string} targetRoleId - Role ID to check
 * @param {Client} client - Discord.js client (optional, defaults to guild.client)
 * @returns {Object} Detailed hierarchy analysis
 */
function canBotManageRole(guild, targetRoleId, client = null) {
    try {
        // Get bot member - try multiple methods for reliability
        const botClient = client || guild.client;
        const botMember = guild.members.me || guild.members.cache.get(botClient.user.id);
        
        if (!botMember) {
            return {
                canManage: false,
                error: 'Bot member not found in guild',
                botPosition: 0,
                targetPosition: 0,
                botRoleName: 'Unknown',
                targetRoleName: 'Unknown',
                details: 'Bot member not cached or accessible'
            };
        }

        // Get target role
        const targetRole = guild.roles.cache.get(targetRoleId);
        if (!targetRole) {
            return {
                canManage: false,
                error: 'Target role not found',
                botPosition: botMember.roles.highest.position,
                targetPosition: 0,
                botRoleName: botMember.roles.highest.name,
                targetRoleName: 'Unknown',
                details: `Role ${targetRoleId} not found in guild cache`
            };
        }

        // Get bot's highest role
        const botHighestRole = botMember.roles.highest;
        const canManage = botHighestRole.position > targetRole.position;

        return {
            canManage,
            error: null,
            botPosition: botHighestRole.position,
            targetPosition: targetRole.position,
            botRoleName: botHighestRole.name,
            targetRoleName: targetRole.name,
            details: canManage 
                ? `Bot role "${botHighestRole.name}" (pos ${botHighestRole.position}) can manage "${targetRole.name}" (pos ${targetRole.position})`
                : `Bot role "${botHighestRole.name}" (pos ${botHighestRole.position}) CANNOT manage "${targetRole.name}" (pos ${targetRole.position}) - target is equal or higher`,
            positionDifference: botHighestRole.position - targetRole.position
        };

    } catch (error) {
        console.error('Error in canBotManageRole:', error);
        return {
            canManage: false,
            error: error.message,
            botPosition: 0,
            targetPosition: 0,
            botRoleName: 'Error',
            targetRoleName: 'Error',
            details: `Exception: ${error.message}`
        };
    }
}

/**
 * Check multiple roles at once for batch operations
 * @param {Guild} guild - Discord guild object
 * @param {string[]} roleIds - Array of role IDs to check
 * @param {Client} client - Discord.js client (optional)
 * @returns {Object} Summary of manageable vs unmanageable roles
 */
function canBotManageRoles(guild, roleIds, client = null) {
    const results = {
        manageable: [],
        unmanageable: [],
        errors: [],
        summary: {
            total: roleIds.length,
            manageableCount: 0,
            unmanageableCount: 0,
            errorCount: 0
        }
    };

    for (const roleId of roleIds) {
        const check = canBotManageRole(guild, roleId, client);
        
        if (check.error) {
            results.errors.push({ roleId, ...check });
            results.summary.errorCount++;
        } else if (check.canManage) {
            results.manageable.push({ roleId, ...check });
            results.summary.manageableCount++;
        } else {
            results.unmanageable.push({ roleId, ...check });
            results.summary.unmanageableCount++;
        }
    }

    return results;
}

/**
 * Generate user-friendly warning message for hierarchy issues
 * @param {Object} hierarchyCheck - Result from canBotManageRole
 * @returns {string} Formatted warning message
 */
function generateHierarchyWarning(hierarchyCheck) {
    if (hierarchyCheck.canManage) {
        return null; // No warning needed
    }

    if (hierarchyCheck.error) {
        return `❌ **Role Check Error**: ${hierarchyCheck.error}`;
    }

    return [
        `⚠️ **ROLE HIERARCHY WARNING**`,
        ``,
        `The role **${hierarchyCheck.targetRoleName}** is positioned above or equal to the **${hierarchyCheck.botRoleName}** role in your server's hierarchy.`,
        ``,
        `**Current Positions:**`,
        `• Bot role: **${hierarchyCheck.botRoleName}** (position ${hierarchyCheck.botPosition})`,
        `• Target role: **${hierarchyCheck.targetRoleName}** (position ${hierarchyCheck.targetPosition})`,
        ``,
        `**Impact:** CastBot cannot assign this role to users until it's moved below the bot role.`,
        ``,
        `**How to fix:** Server Settings → Roles → Drag **${hierarchyCheck.targetRoleName}** below **${hierarchyCheck.botRoleName}**`
    ].join('\n');
}

/**
 * Test role hierarchy with specific role IDs for debugging
 * @param {Guild} guild - Discord guild object
 * @param {Client} client - Discord.js client
 * @returns {Object} Test results for debugging
 */
function testRoleHierarchy(guild, client) {
    console.log('🔍 DEBUG: Testing role hierarchy with specific test roles...');
    
    // Test roles as specified by user
    const testRoles = [
        { id: '1335645022774886490', name: 'He/Him (should FAIL - above bot)', expectedResult: false },
        { id: '1385964464393949276', name: 'NZST (should SUCCEED - below bot)', expectedResult: true }
    ];

    const results = {
        testsPassed: 0,
        testsFailed: 0,
        details: []
    };

    for (const testRole of testRoles) {
        const check = canBotManageRole(guild, testRole.id, client);
        const passed = check.canManage === testRole.expectedResult;
        
        const result = {
            roleId: testRole.id,
            roleName: testRole.name,
            expected: testRole.expectedResult,
            actual: check.canManage,
            passed,
            details: check.details,
            hierarchyInfo: check
        };

        results.details.push(result);
        
        if (passed) {
            results.testsPassed++;
            console.log(`✅ TEST PASSED: ${testRole.name} - Expected: ${testRole.expectedResult}, Got: ${check.canManage}`);
        } else {
            results.testsFailed++;
            console.log(`❌ TEST FAILED: ${testRole.name} - Expected: ${testRole.expectedResult}, Got: ${check.canManage}`);
        }
        
        console.log(`   Details: ${check.details}`);
    }

    console.log(`🎯 Role Hierarchy Test Summary: ${results.testsPassed} passed, ${results.testsFailed} failed`);
    return results;
}

/**
 * Legacy function for backward compatibility - maps to new implementation
 * @param {Guild} guild - Discord guild object
 * @param {Role} role - Discord role object to check
 * @returns {Object} Legacy format result
 */
function checkRoleHierarchy(guild, role) {
    const check = canBotManageRole(guild, role.id);
    return {
        canManage: check.canManage,
        botPosition: check.botPosition,
        rolePosition: check.targetPosition,
        botRoleName: check.botRoleName
    };
}

/**
 * Execute comprehensive setup process for pronouns and timezones
 * Handles role creation, existing role detection, and CastBot integration
 * @param {string} guildId - Discord guild ID
 * @param {Guild} guild - Discord guild object
 * @returns {Object} Detailed setup results for user feedback
 */
async function executeSetup(guildId, guild) {
    console.log(`🔍 DEBUG: Starting role setup for guild ${guildId}`);
    
    const results = {
        pronouns: {
            created: [],
            existingAdded: [],
            alreadyInCastBot: [],
            failed: [],
            hierarchyWarnings: []
        },
        timezones: {
            created: [],
            existingAdded: [],
            alreadyInCastBot: [],
            failed: [],
            hierarchyWarnings: []
        }
    };

    // Get current CastBot data to check what's already configured
    const playerData = await loadPlayerData();
    const currentPronounIds = playerData[guildId]?.pronounRoleIDs || [];
    const currentTimezones = playerData[guildId]?.timezones || {};

    // Process pronoun roles
    console.log('🔍 DEBUG: Processing pronoun roles...');
    for (const pronounRole of STANDARD_PRONOUN_ROLES) {
        try {
            const existingRole = guild.roles.cache.find(r => r.name === pronounRole);
            
            if (existingRole) {
                // Role exists in Discord - check if it's already in CastBot
                if (currentPronounIds.includes(existingRole.id)) {
                    console.log(`✅ DEBUG: Pronoun role ${pronounRole} already in CastBot`);
                    
                    // Check hierarchy even for existing roles
                    const hierarchyCheck = checkRoleHierarchy(guild, existingRole);
                    
                    results.pronouns.alreadyInCastBot.push({
                        name: pronounRole,
                        id: existingRole.id,
                        canManage: hierarchyCheck.canManage
                    });
                    
                    if (!hierarchyCheck.canManage) {
                        results.pronouns.hierarchyWarnings.push({
                            name: pronounRole,
                            id: existingRole.id,
                            botRoleName: hierarchyCheck.botRoleName
                        });
                    }
                } else {
                    // Add existing Discord role to CastBot
                    console.log(`🔄 DEBUG: Adding existing pronoun role ${pronounRole} to CastBot`);
                    const hierarchyCheck = checkRoleHierarchy(guild, existingRole);
                    
                    results.pronouns.existingAdded.push({
                        name: pronounRole,
                        id: existingRole.id,
                        canManage: hierarchyCheck.canManage
                    });
                    
                    if (!hierarchyCheck.canManage) {
                        results.pronouns.hierarchyWarnings.push({
                            name: pronounRole,
                            id: existingRole.id,
                            botRoleName: hierarchyCheck.botRoleName
                        });
                    }
                }
            } else {
                // Create new pronoun role
                console.log(`🔨 DEBUG: Creating new pronoun role ${pronounRole}`);
                const newRole = await guild.roles.create({
                    name: pronounRole,
                    mentionable: true,
                    reason: 'CastBot pronoun role generation'
                });
                
                console.log(`✅ DEBUG: Created pronoun role ${pronounRole} with ID ${newRole.id}`);
                results.pronouns.created.push({
                    name: pronounRole,
                    id: newRole.id
                });
            }
        } catch (error) {
            console.error(`❌ DEBUG: Failed to process pronoun role ${pronounRole}:`, error);
            results.pronouns.failed.push({
                name: pronounRole,
                error: error.message
            });
        }
    }

    // Process timezone roles
    console.log('🔍 DEBUG: Processing timezone roles...');
    for (const timezone of STANDARD_TIMEZONE_ROLES) {
        try {
            const existingRole = guild.roles.cache.find(r => r.name === timezone.name);
            
            if (existingRole) {
                // Role exists in Discord - check if it's already in CastBot
                if (currentTimezones[existingRole.id]) {
                    console.log(`✅ DEBUG: Timezone role ${timezone.name} already in CastBot`);
                    
                    // Check hierarchy even for existing roles
                    const hierarchyCheck = checkRoleHierarchy(guild, existingRole);
                    
                    results.timezones.alreadyInCastBot.push({
                        ...timezone,
                        id: existingRole.id,
                        canManage: hierarchyCheck.canManage
                    });
                    
                    if (!hierarchyCheck.canManage) {
                        results.timezones.hierarchyWarnings.push({
                            ...timezone,
                            id: existingRole.id,
                            botRoleName: hierarchyCheck.botRoleName
                        });
                    }
                } else {
                    // Add existing Discord role to CastBot
                    console.log(`🔄 DEBUG: Adding existing timezone role ${timezone.name} to CastBot`);
                    const hierarchyCheck = checkRoleHierarchy(guild, existingRole);
                    
                    results.timezones.existingAdded.push({
                        ...timezone,
                        id: existingRole.id,
                        canManage: hierarchyCheck.canManage
                    });
                    
                    if (!hierarchyCheck.canManage) {
                        results.timezones.hierarchyWarnings.push({
                            ...timezone,
                            id: existingRole.id,
                            botRoleName: hierarchyCheck.botRoleName
                        });
                    }
                }
            } else {
                // Create new timezone role
                console.log(`🔨 DEBUG: Creating new timezone role ${timezone.name}`);
                const newRole = await guild.roles.create({
                    name: timezone.name,
                    mentionable: true,
                    reason: 'CastBot timezone role generation'
                });
                
                console.log(`✅ DEBUG: Created timezone role ${timezone.name} with ID ${newRole.id}`);
                results.timezones.created.push({
                    ...timezone,
                    id: newRole.id
                });
            }
        } catch (error) {
            console.error(`❌ DEBUG: Failed to process timezone role ${timezone.name}:`, error);
            results.timezones.failed.push({
                name: timezone.name,
                error: error.message
            });
        }
    }

    // Update CastBot storage with all new and existing roles
    await updateCastBotStorage(guildId, results);

    console.log(`✅ DEBUG: Setup completed for guild ${guildId}`);
    return results;
}

/**
 * Update CastBot storage with setup results
 * Maintains existing data while adding new role configurations
 * @param {string} guildId - Discord guild ID
 * @param {Object} results - Setup results from executeSetup
 */
async function updateCastBotStorage(guildId, results) {
    console.log(`💾 DEBUG: Updating CastBot storage for guild ${guildId}`);
    
    const playerData = await loadPlayerData();
    
    // Initialize guild data structure if needed
    if (!playerData[guildId]) {
        playerData[guildId] = {
            players: {},
            tribes: {},
            timezones: {},
            pronounRoleIDs: []
        };
    }

    // Update pronoun roles - add new and existing roles to CastBot tracking
    const newPronounIds = [
        ...results.pronouns.created.map(r => r.id),
        ...results.pronouns.existingAdded.map(r => r.id)
    ];
    
    if (newPronounIds.length > 0) {
        const currentPronounIds = playerData[guildId].pronounRoleIDs || [];
        const updatedPronounIds = [...new Set([...currentPronounIds, ...newPronounIds])];
        await updateGuildPronouns(guildId, updatedPronounIds);
        console.log(`💾 DEBUG: Updated ${newPronounIds.length} pronoun roles in storage`);
    }

    // Update timezone roles - add new and existing roles with metadata
    const newTimezoneEntries = [...results.timezones.created, ...results.timezones.existingAdded];
    
    if (newTimezoneEntries.length > 0) {
        const currentTimezones = playerData[guildId].timezones || {};
        
        // Add new timezone data with enhanced structure for future DST support
        newTimezoneEntries.forEach(tz => {
            currentTimezones[tz.id] = { 
                offset: tz.offset,
                // Store DST information for future automatic switching
                dstObserved: tz.dstObserved || false,
                standardName: tz.standardName || null
            };
        });
        
        // Save updated timezone data
        playerData[guildId].timezones = currentTimezones;
        await savePlayerData(playerData);
        console.log(`💾 DEBUG: Updated ${newTimezoneEntries.length} timezone roles in storage`);
    }
}

/**
 * Generate comprehensive setup response message with detailed feedback
 * Uses Discord role tag syntax for better UX
 * @param {Object} results - Setup results from executeSetup
 * @returns {string} Formatted message for user display
 */
function generateSetupResponse(results) {
    const sections = [];
    
    // Pronouns section
    const pronounSections = [];
    
    if (results.pronouns.created.length > 0) {
        pronounSections.push(`✅ **Created ${results.pronouns.created.length} new pronoun roles:**\n${
            results.pronouns.created.map(role => `   • ${role.name}`).join('\n')
        }`);
    }
    
    if (results.pronouns.existingAdded.length > 0) {
        pronounSections.push(`🔄 **Added ${results.pronouns.existingAdded.length} existing pronoun roles to CastBot:**\n${
            results.pronouns.existingAdded.map(role => `   • <@&${role.id}> (${role.name})`).join('\n')
        }`);
    }
    
    if (results.pronouns.alreadyInCastBot.length > 0) {
        pronounSections.push(`✅ **Already configured in CastBot:**\n${
            results.pronouns.alreadyInCastBot.map(role => `   • <@&${role.id}>`).join('\n')
        }`);
    }
    
    if (pronounSections.length > 0) {
        sections.push(`**🔀 Pronoun Roles:**\n${pronounSections.join('\n\n')}`);
    }
    
    // Timezones section
    const timezoneSections = [];
    
    if (results.timezones.created.length > 0) {
        timezoneSections.push(`✅ **Created ${results.timezones.created.length} new timezone roles:**\n${
            results.timezones.created.map(role => `   • ${role.name}`).join('\n')
        }`);
    }
    
    if (results.timezones.existingAdded.length > 0) {
        timezoneSections.push(`🔄 **Added ${results.timezones.existingAdded.length} existing timezone roles to CastBot:**\n${
            results.timezones.existingAdded.map(role => `   • <@&${role.id}> (${role.name})`).join('\n')
        }`);
    }
    
    if (results.timezones.alreadyInCastBot.length > 0) {
        timezoneSections.push(`✅ **Already configured in CastBot:**\n${
            results.timezones.alreadyInCastBot.map(role => `   • <@&${role.id}>`).join('\n')
        }`);
    }
    
    if (timezoneSections.length > 0) {
        sections.push(`**🌍 Timezone Roles:**\n${timezoneSections.join('\n\n')}`);
    }
    
    // Critical hierarchy warnings - shown prominently
    const allWarnings = [...results.pronouns.hierarchyWarnings, ...results.timezones.hierarchyWarnings];
    if (allWarnings.length > 0) {
        const warningText = [
            `⚠️ **WARNING: Below CastBot in role hierarchy (role still added)**`,
            '',
            `${allWarnings.length} role(s) are positioned above the **${allWarnings[0].botRoleName}** role in your server's hierarchy.`,
            `CastBot cannot assign these roles to users until they are moved below the bot role:`,
            '',
            allWarnings.map(role => `   • <@&${role.id}> (${role.name})`).join('\n'),
            '',
            '💡 **How to fix:** Server Settings → Roles → Drag highlighted roles below the CastBot role'
        ].join('\n');
        
        sections.push(warningText);
    }
    
    // Failed roles
    const allFailed = [...results.pronouns.failed, ...results.timezones.failed];
    if (allFailed.length > 0) {
        const failedText = [
            '❌ **Failed to create/add:**',
            allFailed.map(role => `   • ${role.name}: ${role.error}`).join('\n')
        ].join('\n');
        sections.push(failedText);
    }
    
    // Success summary if no issues
    if (sections.length === 0 || (allWarnings.length === 0 && allFailed.length === 0)) {
        sections.push('🎉 **Setup completed successfully!** Your server is ready for CastBot pronoun and timezone management.');
    }
    
    return sections.join('\n\n');
}

/**
 * Create timezone reaction message with emoji-based role selection
 * Handles Discord's 20-reaction limit gracefully
 * @param {Object} guildData - Guild data with timezone roles
 * @param {string} channelId - Channel ID to post message
 * @param {string} token - Discord interaction token
 * @param {Object} client - Discord client for storing reaction mappings
 * @returns {Object} Response object for Discord API
 */
async function createTimezoneReactionMessage(guildData, channelId, token, client) {
    try {
        console.log('🔍 DEBUG: Creating timezone reaction message');
        
        // Get all timezone roles for this guild
        const timezoneEntries = Object.entries(guildData.timezones || {});
        if (timezoneEntries.length === 0) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ No timezone roles configured. Run Setup first.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }

        // Convert to role objects and sort
        const roleObjects = timezoneEntries.map(([roleId, data]) => ({
            id: roleId,
            name: `${getTimezoneDisplayName(data)} (${formatOffset(data.offset)})`,
            offset: data.offset
        })).sort((a, b) => a.name.localeCompare(b.name));

        // Check Discord reaction limit
        if (roleObjects.length > REACTION_EMOJIS.length) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `❌ Too many timezone roles (${roleObjects.length}). Maximum ${REACTION_EMOJIS.length} supported due to Discord limits.\n\n💡 Consider using fewer timezone roles or contact admin to remove unused ones.`,
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }

        // Create embed with timezone list
        const embed = new EmbedBuilder()
            .setTitle('🌍 Timezone Role Selection')
            .setDescription('React with the emoji corresponding to your timezone:\n\n' + 
                roleObjects.map((role, i) => `${REACTION_EMOJIS[i]} - ${role.name}`).join('\n'))
            .setColor('#7ED321')
            .setFooter({ text: 'Click an emoji to get that timezone role' });

        // Return message for Discord to post
        const response = {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                embeds: [embed.toJSON()],
                components: []
            }
        };

        // Add reactions and store mappings asynchronously
        setTimeout(async () => {
            try {
                console.log('🔍 DEBUG: Adding reactions to timezone message');
                
                // Get message ID from the response (will be available after posting)
                const message = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
                }).then(r => r.json()).then(messages => messages[0]);

                if (!message) {
                    console.error('❌ DEBUG: Could not retrieve posted message for reactions');
                    return;
                }

                // Add reactions with rate limiting
                for (let i = 0; i < roleObjects.length; i++) {
                    try {
                        await fetch(
                            `https://discord.com/api/v10/channels/${channelId}/messages/${message.id}/reactions/${encodeURIComponent(REACTION_EMOJIS[i])}/@me`,
                            {
                                method: 'PUT',
                                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
                            }
                        );
                        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
                    } catch (error) {
                        console.error(`❌ DEBUG: Failed to add reaction ${REACTION_EMOJIS[i]}:`, error);
                    }
                }

                // Store role mappings for reaction handler
                if (!client.roleReactions) client.roleReactions = new Map();
                const roleMapping = Object.fromEntries(roleObjects.map((role, i) => [REACTION_EMOJIS[i], role.id]));
                roleMapping.isTimezone = true; // Mark as timezone for handler
                client.roleReactions.set(message.id, roleMapping);
                
                console.log('✅ DEBUG: Timezone reaction message setup complete');
                
            } catch (error) {
                console.error('❌ DEBUG: Error setting up timezone reactions:', error);
            }
        }, 500); // Delay to ensure message is posted

        return response;

    } catch (error) {
        console.error('❌ DEBUG: Error creating timezone reaction message:', error);
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Error creating timezone selection. Please try again.',
                flags: InteractionResponseFlags.EPHEMERAL
            }
        };
    }
}

/**
 * Create pronoun reaction message with emoji-based role selection
 * @param {Object} guildData - Guild data with pronoun roles  
 * @param {string} channelId - Channel ID to post message
 * @param {string} token - Discord interaction token
 * @param {Object} client - Discord client for storing reaction mappings
 * @returns {Object} Response object for Discord API
 */
async function createPronounReactionMessage(guildData, channelId, token, client) {
    try {
        console.log('🔍 DEBUG: Creating pronoun reaction message');
        
        const pronounRoleIds = guildData.pronounRoleIDs || [];
        if (pronounRoleIds.length === 0) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ No pronoun roles configured. Run Setup first.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }

        // Convert to role objects (names will be fetched from Discord)
        const roleObjects = pronounRoleIds.map(roleId => ({
            id: roleId,
            name: `Role ${roleId}` // Placeholder - actual names from Discord cache
        })).sort((a, b) => a.name.localeCompare(b.name));

        // Check Discord reaction limit
        if (roleObjects.length > REACTION_EMOJIS.length) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `❌ Too many pronoun roles (${roleObjects.length}). Maximum ${REACTION_EMOJIS.length} supported due to Discord limits.`,
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }

        // Create embed with pronoun list
        const embed = new EmbedBuilder()
            .setTitle('💜 Pronoun Role Selection')
            .setDescription('React with the emoji corresponding to your pronouns:\n\n' + 
                roleObjects.map((role, i) => `${REACTION_EMOJIS[i]} - ${role.name}`).join('\n'))
            .setColor('#7ED321')
            .setFooter({ text: 'You can select multiple pronoun roles' });

        // Similar async reaction setup as timezone function
        const response = {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                embeds: [embed.toJSON()],
                components: []
            }
        };

        // Add reactions asynchronously (similar to timezone function)
        setTimeout(async () => {
            // Implementation similar to timezone reactions
            console.log('🔍 DEBUG: Adding reactions to pronoun message');
            // ... (reaction setup code)
        }, 500);

        return response;

    } catch (error) {
        console.error('❌ DEBUG: Error creating pronoun reaction message:', error);
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ Error creating pronoun selection. Please try again.',
                flags: InteractionResponseFlags.EPHEMERAL
            }
        };
    }
}

/**
 * Helper function to get timezone display name with DST awareness
 * @param {Object} timezoneData - Timezone data with offset and DST info
 * @returns {string} Display name for timezone
 */
function getTimezoneDisplayName(timezoneData) {
    // For now, just use a generic name - this would be enhanced with actual role names
    const offset = timezoneData.offset;
    if (offset === 0) return 'GMT';
    if (offset > 0) return `GMT+${offset}`;
    return `GMT${offset}`;
}

/**
 * Helper function to format UTC offset for display
 * @param {number} offset - UTC offset in hours
 * @returns {string} Formatted offset string
 */
function formatOffset(offset) {
    if (offset === 0) return 'UTC+0';
    if (offset > 0) return `UTC+${offset}`;
    return `UTC${offset}`;
}

export {
    STANDARD_PRONOUN_ROLES,
    STANDARD_TIMEZONE_ROLES,
    REACTION_EMOJIS,
    executeSetup,
    generateSetupResponse,
    checkRoleHierarchy,
    createTimezoneReactionMessage,
    createPronounReactionMessage,
    canBotManageRole,
    canBotManageRoles,
    generateHierarchyWarning,
    testRoleHierarchy
};