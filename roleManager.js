import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { 
    loadPlayerData, 
    savePlayerData, 
    updateGuildPronouns, 
    getGuildPronouns,
    getGuildTimezones,
    saveReactionMapping
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

// Standard pronoun roles that CastBot can create/manage (updated order)
const STANDARD_PRONOUN_ROLES = [
    'She/Her',
    'He/Him', 
    'They/Them',
    'She/They',
    'They/He',
    'Ask',
    'Any',
    'All Pronouns'
];

// Pronoun role colors matching heart emojis (RGB to integer conversion)
const PRONOUN_COLORS = {
    'He/Him': 0xFF0000,      // ❤️ Red
    'She/Her': 0xFFC0CB,     // 🩷 Pink 
    'They/Them': 0x800080,   // 💜 Purple
    'They/He': 0x00FF00,     // 💚 Green
    'She/They': 0x87CEEB,    // 🩵 Light Blue
    'Ask': 0xFFFF00,         // 💛 Yellow
    'Any': 0xA52A2A,         // 🤎 Brown
    'All Pronouns': 0xFFFFFF // 🤍 White (same as Any)
};

// Heart emojis for pronoun reactions
const PRONOUN_HEART_EMOJIS = {
    'He/Him': '❤️',
    'She/Her': '🩷', 
    'They/Them': '💜',
    'They/He': '💚',
    'She/They': '🩵',
    'Ask': '💛',
    'Any': '🤎',
    'All Pronouns': '🤍'
};

// Enhanced pronoun matching patterns for fuzzy role detection
const PRONOUN_PATTERNS = {
    'He/Him': [
        'he/him', 'he / him', 'him/he', 'him / he', 
        'he', 'him', 'he-him', 'him-he'
    ],
    'She/Her': [
        'she/her', 'she / her', 'her/she', 'her / she',
        'she', 'her', 'she-her', 'her-she'
    ],
    'They/Them': [
        'they/them', 'they / them', 'them/they', 'them / they',
        'they', 'them', 'they-them', 'them-they'
    ],
    'They/He': [
        'they/he', 'they / he', 'he/they', 'he / they',
        'they-he', 'he-they'
    ],
    'She/They': [
        'she/they', 'she / they', 'they/she', 'they / she',
        'she-they', 'they-she',
        'they/her', 'they / her', 'her/they', 'her / they'
    ],
    'Ask': [
        'ask', 'ask pronouns', 'ask me', 'just ask'
    ],
    'Any': [
        'any', 'any pronouns', 'whatever', 'dont care', "don't care"
    ],
    'All Pronouns': [
        'all pronouns', 'all', 'any pronouns', 'any/all'
    ]
};

/**
 * Find existing pronoun role using fuzzy matching
 * @param {Guild} guild - Discord guild object
 * @param {string} standardName - Standard pronoun name (e.g., 'She/Her')
 * @returns {Role|null} Found Discord role or null
 */
function findExistingPronounRole(guild, standardName) {
    // First try exact match (current behavior)
    let existingRole = guild.roles.cache.find(r => r.name === standardName);
    if (existingRole) {
        console.log(`✅ DEBUG: Found exact match for ${standardName}: ${existingRole.name}`);
        return existingRole;
    }
    
    // Try fuzzy matching with patterns
    const patterns = PRONOUN_PATTERNS[standardName] || [];
    for (const pattern of patterns) {
        existingRole = guild.roles.cache.find(r => 
            r.name.toLowerCase().trim() === pattern.toLowerCase()
        );
        if (existingRole) {
            console.log(`🔍 DEBUG: Found fuzzy match for ${standardName}: "${existingRole.name}" matches pattern "${pattern}"`);
            return existingRole;
        }
    }
    
    console.log(`❌ DEBUG: No existing role found for ${standardName} (tried ${patterns.length + 1} patterns)`);
    return null;
}

// Reaction emojis for role selection - Discord limit: 20 for regular servers, 50 for boosted
// Using conservative 20-emoji limit for maximum compatibility
const REACTION_EMOJIS = [
    '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
    '🇦', '🇧', '🇨', '🇩', '🇪', '🇫', '🇬', '🇭', '🇮', '🇯'
];

// NEW: Single-role timezone structure with DST awareness
// Consolidated from 20 dual roles to 17 single roles with global DST state
// Each role shows both states (e.g., "PST / PDT") and links to dstState.json via `id`
const STANDARD_TIMEZONE_ROLES = [
    // North American zones
    {
        id: 'PT',
        name: 'PST / PDT',
        description: 'Pacific Time',
        offset: -8,
        offsetDST: -7,
        dstObserved: true,
        standardName: 'PST (UTC-8)',
        standardNameDST: 'PDT (UTC-7)'
    },
    {
        id: 'MT',
        name: 'MST / MDT',
        description: 'Mountain Time',
        offset: -7,
        offsetDST: -6,
        dstObserved: true,
        standardName: 'MST (UTC-7)',
        standardNameDST: 'MDT (UTC-6)'
    },
    {
        id: 'CT',
        name: 'CST / CDT',
        description: 'Central Time',
        offset: -6,
        offsetDST: -5,
        dstObserved: true,
        standardName: 'CST (UTC-6)',
        standardNameDST: 'CDT (UTC-5)'
    },
    {
        id: 'ET',
        name: 'EST / EDT',
        description: 'Eastern Time',
        offset: -5,
        offsetDST: -4,
        dstObserved: true,
        standardName: 'EST (UTC-5)',
        standardNameDST: 'EDT (UTC-4)'
    },
    {
        id: 'AT',
        name: 'AST / ADT',
        description: 'Atlantic Time',
        offset: -4,
        offsetDST: -3,
        dstObserved: true,
        standardName: 'AST (UTC-4)',
        standardNameDST: 'ADT (UTC-3)'
    },
    {
        id: 'NT',
        name: 'NST / NDT',
        description: 'Newfoundland Time',
        offset: -3.5,
        offsetDST: -2.5,
        dstObserved: true,
        standardName: 'NST (UTC-3:30)',
        standardNameDST: 'NDT (UTC-2:30)'
    },

    // European zones
    {
        id: 'GMT',
        name: 'GMT / BST',
        description: 'UK and Ireland',
        offset: 0,
        offsetDST: 1,
        dstObserved: true,
        standardName: 'GMT (UTC+0)',
        standardNameDST: 'BST (UTC+1)'
    },
    {
        id: 'CET',
        name: 'CET / CEST',
        description: 'Central European Time',
        offset: 1,
        offsetDST: 2,
        dstObserved: true,
        standardName: 'CET (UTC+1)',
        standardNameDST: 'CEST (UTC+2)'
    },
    {
        id: 'EET',
        name: 'EET / EEST',
        description: 'Eastern European Time',
        offset: 2,
        offsetDST: 3,
        dstObserved: true,
        standardName: 'EET (UTC+2)',
        standardNameDST: 'EEST (UTC+3)'
    },

    // Non-DST zones
    {
        id: 'SAST',
        name: 'SAST',
        description: 'South Africa Standard Time',
        offset: 2,
        dstObserved: false,
        standardName: 'SAST (UTC+2)'
    },
    {
        id: 'IST',
        name: 'IST',
        description: 'India Time',
        offset: 5.5,
        dstObserved: false,
        standardName: 'IST (UTC+5.5)'
    },
    {
        id: 'ICT',
        name: 'ICT',
        description: 'Indochina Time',
        offset: 7,
        dstObserved: false,
        standardName: 'ICT (UTC+7)'
    },
    {
        id: 'GMT8',
        name: 'GMT+8',
        description: 'Western Australia and SE Asia',
        offset: 8,
        dstObserved: false,
        standardName: 'GMT+8 (UTC+8)'
    },
    {
        id: 'JST',
        name: 'JST',
        description: 'Japan Time',
        offset: 9,
        dstObserved: false,
        standardName: 'JST (UTC+9)'
    },
    {
        id: 'AEST',
        name: 'AEST / AEDT',
        description: 'Australian Eastern Time',
        offset: 10,
        offsetDST: 11,
        dstObserved: true,
        standardName: 'AEST (UTC+10)',
        standardNameDST: 'AEDT (UTC+11)'
    },
    {
        id: 'NZST',
        name: 'NZST / NZDT',
        description: 'New Zealand Time',
        offset: 12,
        offsetDST: 13,
        dstObserved: true,
        standardName: 'NZST (UTC+12)',
        standardNameDST: 'NZDT (UTC+13)'
    }
    // Total: 16 roles (down from 20!) - better Discord limit compliance
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
async function testRoleHierarchy(guild, client) {
    console.log('🔍 DEBUG: Testing role hierarchy with all CastBot-managed roles...');
    
    // Get all CastBot-managed roles from the server
    const playerData = await loadPlayerData();
    const guildData = playerData[guild.id];
    
    if (!guildData) {
        console.log('❌ No CastBot data found for this guild');
        return {
            testsPassed: 0,
            testsFailed: 0,
            details: [],
            error: 'No CastBot configuration found for this guild'
        };
    }

    const testRoles = [];
    
    // Add pronoun roles
    const pronounRoleIds = guildData.pronounRoleIDs || [];
    for (const roleId of pronounRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
            testRoles.push({
                id: roleId,
                name: role.name,
                category: 'pronoun'
            });
        }
    }
    
    // Add timezone roles
    const timezoneRoles = guildData.timezones || {};
    for (const [, roleId] of Object.entries(timezoneRoles)) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
            testRoles.push({
                id: roleId,
                name: role.name,
                category: 'timezone'
            });
        }
    }

    console.log(`Found ${testRoles.length} CastBot-managed roles to test`);

    const results = {
        testsPassed: 0,
        testsFailed: 0,
        details: [],
        totalRoles: testRoles.length
    };

    // Get bot's highest role position for reference
    const botMember = guild.members.me || guild.members.cache.get(client.user.id);
    const botHighestRole = botMember ? botMember.roles.highest : null;
    const botPosition = botHighestRole ? botHighestRole.position : 0;

    console.log(`Bot's highest role: ${botHighestRole ? botHighestRole.name : 'Unknown'} (position ${botPosition})`);

    for (const testRole of testRoles) {
        const check = canBotManageRole(guild, testRole.id, client);
        const role = guild.roles.cache.get(testRole.id);
        
        // Bot should be able to manage roles that are BELOW it in hierarchy
        // A role is below the bot if its position is LESS than the bot's highest role position
        const expectedResult = role ? role.position < botPosition : false;
        const passed = check.canManage === expectedResult;
        
        const result = {
            roleId: testRole.id,
            roleName: testRole.name,
            category: testRole.category,
            expected: expectedResult,
            actual: check.canManage,
            passed,
            details: check.details,
            hierarchyInfo: check,
            rolePosition: role ? role.position : 0,
            botPosition: botPosition
        };

        results.details.push(result);
        
        if (passed) {
            results.testsPassed++;
            console.log(`✅ ${testRole.name} - Bot ${check.canManage ? 'CAN' : 'CANNOT'} manage (expected: ${expectedResult})`);
        } else {
            results.testsFailed++;
            console.log(`❌ ${testRole.name} - Bot ${check.canManage ? 'CAN' : 'CANNOT'} manage (expected: ${expectedResult})`);
            console.log(`   Role position: ${role ? role.position : 'Unknown'}, Bot position: ${botPosition}`);
        }
        
        if (check.details) {
            console.log(`   Details: ${check.details}`);
        }
    }

    console.log(`🎯 Role Hierarchy Test Summary: ${results.testsPassed} passed, ${results.testsFailed} failed (${testRoles.length} total)`);
    
    // Report problematic roles
    const problemRoles = results.details.filter(r => !r.passed);
    if (problemRoles.length > 0) {
        console.log('⚠️ Problematic roles:');
        problemRoles.forEach(role => {
            console.log(`   ${role.roleName} (${role.category}): Expected ${role.expected}, Got ${role.actual}`);
        });
    }
    
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
            const existingRole = findExistingPronounRole(guild, pronounRole);
            
            if (existingRole) {
                // Role exists in Discord - check if it's already in CastBot
                if (currentPronounIds.includes(existingRole.id)) {
                    console.log(`✅ DEBUG: Pronoun role ${pronounRole} already in CastBot`);
                    
                    // Check hierarchy even for existing roles but don't store canManage in results
                    const hierarchyCheck = checkRoleHierarchy(guild, existingRole);
                    
                    results.pronouns.alreadyInCastBot.push({
                        name: pronounRole,
                        id: existingRole.id
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
                // Create new pronoun role with color
                console.log(`🔨 DEBUG: Creating new pronoun role ${pronounRole}`);
                const roleColor = PRONOUN_COLORS[pronounRole] || 0x99AAB5; // Default Discord gray
                
                const newRole = await guild.roles.create({
                    name: pronounRole,
                    color: roleColor,
                    mentionable: true,
                    reason: 'CastBot pronoun role generation'
                });
                
                console.log(`✅ DEBUG: Created pronoun role ${pronounRole} with ID ${newRole.id} and color 0x${roleColor.toString(16).toUpperCase()}`);
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
                    
                    // Check hierarchy even for existing roles but don't store canManage in results
                    const hierarchyCheck = checkRoleHierarchy(guild, existingRole);
                    
                    results.timezones.alreadyInCastBot.push({
                        ...timezone,
                        id: existingRole.id
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
    
    // Load fresh data before each update to avoid race conditions
    let playerData = await loadPlayerData();
    
    // Initialize guild data structure if needed
    if (!playerData[guildId]) {
        playerData[guildId] = {
            players: {},
            tribes: {},
            timezones: {},
            pronounRoleIDs: []
        };
        await savePlayerData(playerData);
    }

    // Update pronoun roles - add new and existing roles to CastBot tracking
    const newPronounIds = [
        ...results.pronouns.created.map(r => r.id),
        ...results.pronouns.existingAdded.map(r => r.id)
    ];
    
    if (newPronounIds.length > 0) {
        // Reload data to get any concurrent changes
        playerData = await loadPlayerData();
        const currentPronounIds = playerData[guildId].pronounRoleIDs || [];
        const updatedPronounIds = [...new Set([...currentPronounIds, ...newPronounIds])];
        
        console.log(`💾 DEBUG: Adding ${newPronounIds.length} pronoun roles to storage:`, newPronounIds);
        console.log(`💾 DEBUG: Current pronoun IDs:`, currentPronounIds);
        console.log(`💾 DEBUG: Updated pronoun IDs:`, updatedPronounIds);
        
        // Update pronouns directly in our data object
        playerData[guildId].pronounRoleIDs = updatedPronounIds;
        await savePlayerData(playerData);
        console.log(`💾 DEBUG: Successfully updated ${updatedPronounIds.length} pronoun roles in storage`);
    }

    // Update timezone roles - add new and existing roles with metadata
    const newTimezoneEntries = [...results.timezones.created, ...results.timezones.existingAdded];
    
    if (newTimezoneEntries.length > 0) {
        // Reload data again to preserve pronoun changes
        playerData = await loadPlayerData();
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
    
    // Pronoun Roles Section - concise summary
    const pronounTotal = results.pronouns.created.length + results.pronouns.existingAdded.length + results.pronouns.alreadyInCastBot.length;
    
    if (pronounTotal > 0) {
        const pronounParts = [];
        if (results.pronouns.created.length > 0) pronounParts.push(`✅ ${results.pronouns.created.length} created`);
        if (results.pronouns.existingAdded.length > 0) pronounParts.push(`➕ ${results.pronouns.existingAdded.length} existing added`);
        if (results.pronouns.alreadyInCastBot.length > 0) pronounParts.push(`✓ ${results.pronouns.alreadyInCastBot.length} already configured`);
        
        sections.push(`**🔀 Pronoun Roles:** ${pronounTotal} total (${pronounParts.join(', ')})`);
    }
    
    // Timezone Roles Section - concise summary
    const timezoneTotal = results.timezones.created.length + results.timezones.existingAdded.length + results.timezones.alreadyInCastBot.length;
    
    if (timezoneTotal > 0) {
        const timezoneParts = [];
        if (results.timezones.created.length > 0) timezoneParts.push(`✅ ${results.timezones.created.length} created`);
        if (results.timezones.existingAdded.length > 0) timezoneParts.push(`➕ ${results.timezones.existingAdded.length} existing added`);
        if (results.timezones.alreadyInCastBot.length > 0) timezoneParts.push(`✓ ${results.timezones.alreadyInCastBot.length} already configured`);
        
        sections.push(`**🌍 Timezone Roles:** ${timezoneTotal} total (${timezoneParts.join(', ')})`);
    }
    
    // Critical hierarchy warnings - concise version
    const allWarnings = [...results.pronouns.hierarchyWarnings, ...results.timezones.hierarchyWarnings];
    if (allWarnings.length > 0) {
        sections.push(`⚠️ **Role Hierarchy Issue:** ${allWarnings.length} role(s) need to be moved below the CastBot role in Server Settings > Roles for auto-assignment to work.`);
    }
    
    // Failed roles - concise summary
    const allFailed = [...results.pronouns.failed, ...results.timezones.failed];
    if (allFailed.length > 0) {
        sections.push(`❌ **Failed:** ${allFailed.length} role(s) couldn't be created/added. Check bot permissions.`);
    }
    
    // Success summary if no issues
    if (sections.length === 0 || (allWarnings.length === 0 && allFailed.length === 0)) {
        sections.push('🎉 **Setup completed successfully!** Your server is ready for CastBot pronoun and timezone management.');
    }
    
    return sections.join('\n\n');
}

/**
 * Generate a detailed setup response using Components V2 format
 * @param {Object} results - Setup results containing pronouns and timezones data
 * @returns {Object} Components V2 formatted response with Container and TextDisplay
 */
function generateSetupResponseV2(results) {
    const sections = [];
    
    // Header
    sections.push('# ✅ CastBot Setup Complete\n');
    
    // Pronoun Roles Section - detailed with mentions
    const pronounTotal = results.pronouns.created.length + results.pronouns.existingAdded.length + results.pronouns.alreadyInCastBot.length;
    
    if (pronounTotal > 0) {
        sections.push('## 🔀 Pronoun Roles\n');
        
        if (results.pronouns.created.length > 0) {
            sections.push('### ✅ Newly Created Pronoun Roles:');
            results.pronouns.created.forEach(role => {
                sections.push(`• <@&${role.id}> (${role.name})`);
            });
            sections.push('');
        }
        
        if (results.pronouns.existingAdded.length > 0) {
            sections.push('### ➕ Existing Roles Added to CastBot:');
            results.pronouns.existingAdded.forEach(role => {
                sections.push(`• <@&${role.id}> (${role.name})`);
            });
            sections.push('');
        }
        
        if (results.pronouns.alreadyInCastBot.length > 0) {
            sections.push('### ✓ Already Configured in CastBot:');
            results.pronouns.alreadyInCastBot.forEach(role => {
                sections.push(`• <@&${role.id}> (${role.name})`);
            });
            sections.push('');
        }
        
        sections.push(`**Total Pronoun Roles:** ${pronounTotal}\n`);
    }
    
    // Timezone Roles Section - detailed with mentions
    const timezoneTotal = results.timezones.created.length + results.timezones.existingAdded.length + results.timezones.alreadyInCastBot.length;
    
    if (timezoneTotal > 0) {
        sections.push('## 🌍 Timezone Roles\n');
        
        if (results.timezones.created.length > 0) {
            sections.push('### ✅ Newly Created Timezone Roles:');
            results.timezones.created.forEach(role => {
                sections.push(`• <@&${role.id}> (${role.name})`);
            });
            sections.push('');
        }
        
        if (results.timezones.existingAdded.length > 0) {
            sections.push('### ➕ Existing Roles Added to CastBot:');
            results.timezones.existingAdded.forEach(role => {
                sections.push(`• <@&${role.id}> (${role.name})`);
            });
            sections.push('');
        }
        
        if (results.timezones.alreadyInCastBot.length > 0) {
            sections.push('### ✓ Already Configured in CastBot:');
            results.timezones.alreadyInCastBot.forEach(role => {
                sections.push(`• <@&${role.id}> (${role.name})`);
            });
            sections.push('');
        }
        
        sections.push(`**Total Timezone Roles:** ${timezoneTotal}\n`);
    }
    
    // Warnings and Errors Section
    const allWarnings = [...results.pronouns.hierarchyWarnings, ...results.timezones.hierarchyWarnings];
    const allFailed = [...results.pronouns.failed, ...results.timezones.failed];
    
    if (allWarnings.length > 0 || allFailed.length > 0) {
        sections.push('## ⚠️ Important Notes\n');
        
        if (allWarnings.length > 0) {
            sections.push('### 🔺 Role Hierarchy Issues:');
            sections.push('The following roles need to be moved **below** the CastBot role in Server Settings → Roles for auto-assignment to work properly:\n');
            allWarnings.forEach(role => {
                sections.push(`• <@&${role.id}> (${role.name})`);
            });
            sections.push('\n**How to fix:** Go to Server Settings → Roles and drag these roles below the CastBot role.\n');
        }
        
        if (allFailed.length > 0) {
            sections.push('### ❌ Failed Operations:');
            sections.push('The following roles could not be created or added:\n');
            allFailed.forEach(role => {
                sections.push(`• ${role.name} - ${role.reason || 'Unknown error'}`);
            });
            sections.push('\n**Possible causes:** Insufficient bot permissions, role limit reached, or Discord API issues.\n');
        }
    }
    
    // Success summary
    if (allWarnings.length === 0 && allFailed.length === 0) {
        sections.push('## 🎉 Setup Status\n');
        sections.push('**All operations completed successfully!**\n');
        sections.push('Your server is now fully configured for CastBot pronoun and timezone management. Players can use `/menu` to set their pronouns and timezones, or you can create reaction posts for bulk assignment.');
    } else {
        sections.push('## 📋 Next Steps\n');
        sections.push('1. Fix any role hierarchy issues mentioned above');
        sections.push('2. Players can use `/menu` to set their pronouns and timezones');
        sections.push('3. Create reaction posts for bulk role assignment using the Production Menu');
    }
    
    // Calculate character count for the detailed message
    const fullMessage = sections.join('\n');
    console.log(`📊 DEBUG: Setup response V2 character count: ${fullMessage.length} characters`);
    
    // Create Components V2 Container with TextDisplay
    return {
        type: 17, // Container component
        accent_color: 0x7ED321, // Green accent color
        components: [
            {
                type: 10, // TextDisplay component
                content: fullMessage
            }
        ]
    };
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
                    content: '❌ **No Timezone Roles Configured**\n\nYou need to run **Setup** first to create timezone roles before you can create reaction messages.\n\n**Steps:**\n1. Use `/menu` command\n2. Click **👑 Admin** button\n3. Click **⚙️ Initial Setup**\n4. Follow the setup process\n5. Return here to create timezone reactions',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }

        // Convert to role objects and sort by UTC offset (most negative first)
        const roleObjects = timezoneEntries.map(([roleId, data]) => ({
            id: roleId,
            name: `${getTimezoneDisplayName(data)} (${formatOffset(data.offset)})`,
            offset: data.offset
        })).sort((a, b) => a.offset - b.offset);

        // Check Discord reaction limit
        if (roleObjects.length > REACTION_EMOJIS.length) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `❌ Too many timezone roles to post React for Pronouns prompt (${roleObjects.length}). Maximum ${REACTION_EMOJIS.length} supported due to Discord limits.\n\n💡 Please remove timezones from \`/menu\` > :purple_heart: Pronouns & Timezones > Bulk Modify (no offset) until you have ${REACTION_EMOJIS.length} or less.`,
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
                
                // Save to persistent storage
                if (guildData.guildId) {
                    await saveReactionMapping(guildData.guildId, message.id, roleMapping);
                    console.log(`💾 Persisted timezone reaction mapping for message ${message.id}`);
                }
                
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
                    content: '❌ **No Pronoun Roles Configured**\n\nYou need to run **Setup** first to create pronoun roles before you can create reaction messages.\n\n**Steps:**\n1. Use `/menu` command\n2. Click **👑 Admin** button\n3. Click **⚙️ Initial Setup**\n4. Follow the setup process\n5. Return here to create pronoun reactions',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }

        // Get Discord client to fetch role names
        const guild = client?.guilds?.cache?.get(guildData.guildId);
        
        if (!guild) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ **Cannot Access Guild**\n\nThere was an issue accessing the Discord server. Please try again in a moment.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }
        
        // Convert to role objects with actual names and determine appropriate emojis
        const roleObjects = pronounRoleIds.map(roleId => {
            const discordRole = guild.roles.cache.get(roleId);
            if (!discordRole) {
                console.log(`⚠️ WARNING: Pronoun role ${roleId} not found in Discord - may have been deleted`);
                return null; // Filter out deleted roles
            }
            
            const roleName = discordRole.name;
            
            // Find matching heart emoji based on role name using fuzzy matching
            let emoji = null;
            
            // First try exact match
            if (PRONOUN_HEART_EMOJIS[roleName]) {
                emoji = PRONOUN_HEART_EMOJIS[roleName];
            } else {
                // Use fuzzy matching to find the standard pronoun name
                for (const [standardName, patterns] of Object.entries(PRONOUN_PATTERNS)) {
                    const roleNameLower = roleName.toLowerCase().trim();
                    if (patterns.some(pattern => pattern.toLowerCase() === roleNameLower)) {
                        emoji = PRONOUN_HEART_EMOJIS[standardName];
                        console.log(`🎯 DEBUG: Mapped existing role "${roleName}" to standard "${standardName}" with emoji ${emoji}`);
                        break;
                    }
                }
            }
            
            return {
                id: roleId,
                name: roleName,
                emoji: emoji // Will be null if no heart emoji matches
            };
        }).filter(role => role !== null) // Remove deleted roles
          .sort((a, b) => a.name.localeCompare(b.name));
        
        // Check if we have any valid roles left after filtering
        if (roleObjects.length === 0) {
            return {
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ **No Valid Pronoun Roles Found**\n\nAll configured pronoun roles appear to have been deleted from Discord. Please run **Setup** again to recreate them.\n\n**Steps:**\n1. Use `/menu` command\n2. Click **👑 Admin** button\n3. Click **⚙️ Initial Setup**',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            };
        }

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

        // Generate reaction emojis and description
        const reactionList = [];
        const usedEmojis = [];
        let numberEmojiIndex = 0;
        
        for (let i = 0; i < roleObjects.length; i++) {
            const role = roleObjects[i];
            let reactionEmoji;
            
            if (role.emoji && !usedEmojis.includes(role.emoji)) {
                // Use heart emoji if available and not already used
                reactionEmoji = role.emoji;
                usedEmojis.push(role.emoji);
            } else {
                // Fall back to numbered emoji
                reactionEmoji = REACTION_EMOJIS[numberEmojiIndex];
                numberEmojiIndex++;
            }
            
            reactionList.push(`${reactionEmoji} - ${role.name}`);
            roleObjects[i].reactionEmoji = reactionEmoji; // Store for later use
        }

        // Create embed with pronoun list
        const embed = new EmbedBuilder()
            .setTitle('💜 Pronoun Role Selection')
            .setDescription('React with the emoji corresponding to your pronouns:\n\n' + reactionList.join('\n'))
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

        // Add reactions asynchronously using determined emojis
        setTimeout(async () => {
            try {
                console.log('🔍 DEBUG: Adding reactions to pronoun message');
                
                // Get message ID from the response
                const message = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
                }).then(r => r.json()).then(messages => messages[0]);

                if (!message) {
                    console.error('❌ DEBUG: Could not retrieve posted message for reactions');
                    return;
                }

                // Add reactions with rate limiting using the determined emojis
                for (let i = 0; i < roleObjects.length; i++) {
                    try {
                        const emoji = roleObjects[i].reactionEmoji;
                        await fetch(
                            `https://discord.com/api/v10/channels/${channelId}/messages/${message.id}/reactions/${encodeURIComponent(emoji)}/@me`,
                            {
                                method: 'PUT',
                                headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
                            }
                        );
                        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
                    } catch (error) {
                        console.error(`❌ DEBUG: Failed to add reaction ${roleObjects[i].reactionEmoji}:`, error);
                    }
                }

                // Store role mappings for reaction handler
                if (!client.roleReactions) client.roleReactions = new Map();
                const roleMapping = Object.fromEntries(roleObjects.map(role => [role.reactionEmoji, role.id]));
                roleMapping.isPronoun = true; // Mark as pronoun for handler
                client.roleReactions.set(message.id, roleMapping);
                
                // Save to persistent storage
                if (guildData.guildId) {
                    await saveReactionMapping(guildData.guildId, message.id, roleMapping);
                    console.log(`💾 Persisted pronoun reaction mapping for message ${message.id}`);
                }
                
                console.log('✅ DEBUG: Pronoun reaction message setup complete with heart emojis');
                
            } catch (error) {
                console.error('❌ DEBUG: Error setting up pronoun reactions:', error);
            }
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

/**
 * Nuke all CastBot-created pronoun and timezone roles for testing
 * This resets the server to a fresh state for testing setup functionality
 * @param {string} guildId - Discord guild ID
 * @param {Object} client - Discord.js client instance
 * @returns {Object} Results object with counts and details
 */
async function nukeRoles(guildId, client) {
    console.log(`💥 DEBUG: Starting role nuke for guild ${guildId}`);
    
    const results = {
        success: true,
        pronounsCleared: 0,
        timezonesCleared: 0,
        rolesDeleted: 0,
        errors: []
    };

    try {
        // 1. Clear CastBot storage data for this guild
        console.log('🗃️ DEBUG: Clearing CastBot storage data...');
        const playerData = await loadPlayerData();
        
        if (playerData[guildId]) {
            // Clear pronoun and timezone role arrays
            if (playerData[guildId].pronounRoleIDs) {
                results.pronounsCleared = playerData[guildId].pronounRoleIDs.length;
                playerData[guildId].pronounRoleIDs = [];
            }
            
            if (playerData[guildId].timezones) {
                results.timezonesCleared = Object.keys(playerData[guildId].timezones).length;
                playerData[guildId].timezones = {};
            }
            
            // Save the updated data
            await savePlayerData(playerData);
            console.log(`✅ DEBUG: Cleared ${results.pronounsCleared} pronouns and ${results.timezonesCleared} timezones from storage`);
        }

        // 2. Delete Discord roles that match CastBot patterns
        console.log('🗑️ DEBUG: Deleting Discord roles...');
        const guild = client?.guilds?.cache?.get(guildId);
        
        if (!guild) {
            results.errors.push('Could not access guild - Discord client may not be available');
            return results;
        }

        const roles = guild.roles.cache;
        const rolesToDelete = [];

        // Find roles to delete
        roles.forEach(role => {
            const shouldDelete = isCastBotRole(role);
            if (shouldDelete) {
                rolesToDelete.push(role);
                console.log(`🎯 DEBUG: Marked for deletion: ${role.name} (${role.id}) - ${shouldDelete.reason}`);
            }
        });

        // Delete the roles
        for (const role of rolesToDelete) {
            try {
                await role.delete('Nuke Roles - Testing reset');
                results.rolesDeleted++;
                console.log(`🗑️ DEBUG: Deleted role: ${role.name}`);
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                const errorMsg = `Failed to delete role ${role.name}: ${error.message}`;
                results.errors.push(errorMsg);
                console.error(`❌ DEBUG: ${errorMsg}`);
            }
        }

        console.log(`💥 DEBUG: Nuke complete! Deleted ${results.rolesDeleted} roles, cleared ${results.pronounsCleared} pronouns and ${results.timezonesCleared} timezones`);
        
    } catch (error) {
        console.error('❌ DEBUG: Error during role nuke:', error);
        results.success = false;
        results.errors.push(`Nuke operation failed: ${error.message}`);
    }

    return results;
}

/**
 * Determines if a role was created by CastBot and should be deleted during nuke
 * @param {Object} role - Discord role object
 * @returns {Object|false} Object with reason if should delete, false otherwise
 */
function isCastBotRole(role) {
    // Check timezone pattern: Name like "PST (UTC-8)" or "AEDT (UTC+11)"
    const timezonePattern = /^[A-Z]{2,4} \(UTC[+-][\d:]+\)$/;
    if (timezonePattern.test(role.name)) {
        return { reason: 'Timezone pattern match' };
    }

    // Check for GMT+X timezone pattern specifically (handles cases like "GMT+8 (UTC+8)")
    const gmtPattern = /^GMT[+-]\d+(\.\d+)? \(UTC[+-]\d+(\:\d+)?\)$/;
    if (gmtPattern.test(role.name)) {
        return { reason: 'GMT timezone pattern match' };
    }

    // Check for standalone UTC patterns that might be timezone roles
    const standaloneUtcPattern = /^UTC[+-]\d+(\:\d+)?$/;
    if (standaloneUtcPattern.test(role.name)) {
        return { reason: 'Standalone UTC timezone pattern match' };
    }

    // Check pronoun pattern: If role name matches our standard pronouns AND has our color
    const pronounName = role.name;
    if (PRONOUN_COLORS.hasOwnProperty(pronounName)) {
        const expectedColor = PRONOUN_COLORS[pronounName];
        if (role.color === expectedColor) {
            return { reason: 'Pronoun name and color match' };
        }
    }

    return false;
}

export {
    STANDARD_PRONOUN_ROLES,
    STANDARD_TIMEZONE_ROLES,
    REACTION_EMOJIS,
    executeSetup,
    generateSetupResponse,
    generateSetupResponseV2,
    checkRoleHierarchy,
    createTimezoneReactionMessage,
    createPronounReactionMessage,
    canBotManageRole,
    canBotManageRoles,
    generateHierarchyWarning,
    testRoleHierarchy,
    nukeRoles
};