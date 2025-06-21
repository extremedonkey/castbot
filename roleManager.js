import { PermissionFlagsBits } from 'discord.js';
import { 
    loadPlayerData, 
    savePlayerData, 
    updateGuildPronouns, 
    getGuildPronouns,
    getGuildTimezones
} from './storage.js';

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

// Enhanced timezone structure to support future DST functionality
const STANDARD_TIMEZONE_ROLES = [
    { name: 'PDT (UTC-7)', offset: -7, dstObserved: true, standardName: 'PST (UTC-8)' },
    { name: 'MDT (UTC-6)', offset: -6, dstObserved: true, standardName: 'MST (UTC-7)' },
    { name: 'CDT (UTC-5)', offset: -5, dstObserved: true, standardName: 'CST (UTC-6)' },
    { name: 'EDT (UTC-4)', offset: -4, dstObserved: true, standardName: 'EST (UTC-5)' },
    { name: 'GMT (UTC+0)', offset: 0, dstObserved: false },
    { name: 'BST (UTC+1)', offset: 1, dstObserved: true, standardName: 'GMT (UTC+0)' },
    { name: 'CEST (UTC+2)', offset: 2, dstObserved: true, standardName: 'CET (UTC+1)' },
    { name: 'GMT+8 (UTC+8)', offset: 8, dstObserved: false },
    { name: 'AEST (UTC+10)', offset: 10, dstObserved: false },
    // New timezone roles added in Phase 1
    { name: 'NDT (UTC-2:30)', offset: -2.5, dstObserved: true, standardName: 'NST (UTC-3:30)' },
    { name: 'ADT (UTC-3)', offset: -3, dstObserved: true, standardName: 'AST (UTC-4)' }
];

/**
 * Check role hierarchy to determine if bot can manage a role
 * Critical for preventing role assignment failures due to Discord hierarchy rules
 * @param {Guild} guild - Discord guild object
 * @param {Role} role - Discord role object to check
 * @returns {Object} { canManage: boolean, botPosition: number, rolePosition: number, botRoleName: string }
 */
function checkRoleHierarchy(guild, role) {
    const botMember = guild.members.cache.get(guild.client.user.id);
    if (!botMember) {
        return { canManage: false, botPosition: 0, rolePosition: role.position, botRoleName: 'Unknown' };
    }
    
    const botHighestRole = botMember.roles.highest;
    
    return {
        canManage: botHighestRole.position > role.position,
        botPosition: botHighestRole.position,
        rolePosition: role.position,
        botRoleName: botHighestRole.name
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
                    results.pronouns.alreadyInCastBot.push({
                        name: pronounRole,
                        id: existingRole.id
                    });
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
                    results.timezones.alreadyInCastBot.push({
                        ...timezone,
                        id: existingRole.id
                    });
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
            `⚠️ **ROLE HIERARCHY WARNING**`,
            `${allWarnings.length} role(s) are above the **${allWarnings[0].botRoleName}** role in your server's hierarchy.`,
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

export {
    STANDARD_PRONOUN_ROLES,
    STANDARD_TIMEZONE_ROLES,
    executeSetup,
    generateSetupResponse,
    checkRoleHierarchy
};