import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import {
    loadPlayerData,
    savePlayerData,
    updateGuildPronouns,
    getGuildPronouns,
    getGuildTimezones,
    saveReactionMapping,
    loadDSTState
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

// Timezone role color - consistent blue branding
const TIMEZONE_ROLE_COLOR = 0x3498DB; // Blue for all timezone roles

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
 * Detect timezone ID from role name and offset
 * Uses both name patterns AND offset validation for safety
 * @param {string} roleName - Discord role name (fetched from API)
 * @param {number} offset - Stored offset from playerData.json
 * @returns {string|null} - timezoneId (e.g., "PT", "MT") or null if unrecognized
 */
function detectTimezoneId(roleName, offset) {
    const name = roleName.toLowerCase();

    // Pacific Time: offset -8 or -7, name contains PST/PDT/Pacific/PT (word boundary)
    if ((name.includes('pst') || name.includes('pdt') || name.includes('pacific') || /\bpt\b/.test(name))
        && (offset === -8 || offset === -7)) {
        return 'PT';
    }

    // Mountain Time: offset -7 or -6, name contains MST/MDT/Mountain/MT (word boundary)
    if ((name.includes('mst') || name.includes('mdt') || name.includes('mountain') || /\bmt\b/.test(name))
        && (offset === -7 || offset === -6)) {
        return 'MT';
    }

    // Central Time: offset -6 or -5, name contains CST/CDT/Central/CT (word boundary)
    if ((name.includes('cst') || name.includes('cdt') || name.includes('central') || /\bct\b/.test(name))
        && (offset === -6 || offset === -5)) {
        return 'CT';
    }

    // Eastern Time: offset -5 or -4, name contains EST/EDT/Eastern/ET (word boundary)
    if ((name.includes('est') || name.includes('edt') || name.includes('eastern') || /\bet\b/.test(name))
        && (offset === -5 || offset === -4)) {
        return 'ET';
    }

    // Atlantic Time: offset -4 or -3, name contains AST/ADT/Atlantic
    if ((name.includes('ast') || name.includes('adt') || name.includes('atlantic'))
        && (offset === -4 || offset === -3)) {
        return 'AT';
    }

    // Newfoundland Time: offset -3.5 or -2.5, name contains NST/NDT/Newfoundland
    if ((name.includes('nst') || name.includes('ndt') || name.includes('newfoundland'))
        && (offset === -3.5 || offset === -2.5)) {
        return 'NT';
    }

    // GMT/UK: offset 0 or 1, name contains GMT/UTC/BST/British
    if ((name.includes('gmt') || name.includes('utc') || name.includes('bst') || name.includes('british'))
        && (offset === 0 || offset === 1)) {
        return 'GMT';
    }

    // Central European Time: offset 1 or 2, name contains CET/CEST
    if ((name.includes('cet') || name.includes('cest') || name.includes('central europe'))
        && (offset === 1 || offset === 2)) {
        return 'CET';
    }

    // Eastern European Time: offset 2 or 3, name contains EET/EEST
    if ((name.includes('eet') || name.includes('eest') || name.includes('eastern europe'))
        && (offset === 2 || offset === 3)) {
        return 'EET';
    }

    // South Africa: offset 2, name contains SAST/South Africa
    if ((name.includes('sast') || name.includes('south africa'))
        && offset === 2) {
        return 'SAST';
    }

    // India: offset 5.5, name contains IST/India
    if ((name.includes('ist') || name.includes('india'))
        && offset === 5.5) {
        return 'IST';
    }

    // Indochina: offset 7, name contains ICT/Bangkok/Vietnam
    if ((name.includes('ict') || name.includes('bangkok') || name.includes('vietnam'))
        && offset === 7) {
        return 'ICT';
    }

    // GMT+8/Western Australia: offset 8, name contains GMT+8/AWST/Perth
    if ((name.includes('gmt+8') || name.includes('awst') || name.includes('perth'))
        && offset === 8) {
        return 'GMT8';
    }

    // Japan: offset 9, name contains JST/Japan
    if ((name.includes('jst') || name.includes('japan'))
        && offset === 9) {
        return 'JST';
    }

    // Australian Eastern: offset 10 or 11, name contains AEST/AEDT/Sydney/Melbourne
    if ((name.includes('aest') || name.includes('aedt') || name.includes('sydney') || name.includes('melbourne'))
        && (offset === 10 || offset === 11)) {
        return 'AEST';
    }

    // New Zealand: offset 12 or 13, name contains NZST/NZDT/Auckland
    if ((name.includes('nzst') || name.includes('nzdt') || name.includes('nzt') || name.includes('auckland') || name.includes('new zealand'))
        && (offset === 12 || offset === 13)) {
        return 'NZST';
    }

    // No pattern matched
    return null;
}

/**
 * Convert existing timezone roles to new DST-aware standard
 * - Renames Discord roles to match dstState.json roleFormat
 * - Adds timezoneId to playerData entries
 * - Does NOT delete roles, does NOT migrate players
 * @param {Guild} guild - Discord guild object
 * @param {Object} currentTimezones - Existing timezone data from playerData
 * @returns {Object} Conversion results { renamed, unchanged, unmapped, failed }
 */
async function convertExistingTimezones(guild, currentTimezones) {
    console.log(`🔄 Starting timezone conversion for guild ${guild.id}`);

    const dstState = await loadDSTState();

    const results = {
        renamed: [],      // Roles renamed successfully
        unchanged: [],    // Role name already correct
        unmapped: [],     // Couldn't detect timezone
        failed: [],       // API error during rename
        orphaned: []      // Roles deleted from Discord but still in playerData
    };

    for (const [roleId, tzData] of Object.entries(currentTimezones)) {
        // Skip if already converted (has timezoneId) but track it in results
        if (tzData.timezoneId) {
            console.log(`✅ Role ${roleId} already has timezoneId: ${tzData.timezoneId}, already converted`);

            // Fetch role name for display purposes
            const role = await guild.roles.fetch(roleId).catch(() => null);
            if (role) {
                results.unchanged.push({
                    roleId,
                    name: role.name,
                    timezoneId: tzData.timezoneId,
                    alreadyConverted: true  // Flag to indicate this was already done
                });
            } else {
                // Already-converted role was deleted from Discord - clean it up
                console.log(`🗑️ Already-converted role ${roleId} (${tzData.timezoneId}) no longer exists in Discord, removing from playerData`);
                delete currentTimezones[roleId];
                results.orphaned.push({
                    roleId,
                    timezoneId: tzData.timezoneId,
                    offset: tzData.offset
                });
            }
            continue;
        }

        // Step 1: Fetch role from Discord API
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
            console.log(`🗑️ Role ${roleId} no longer exists in Discord, removing from playerData`);
            // Delete orphaned role from playerData (in-place modification)
            delete currentTimezones[roleId];
            // Track for reporting
            results.orphaned.push({
                roleId,
                timezoneId: tzData.timezoneId || 'unknown',
                offset: tzData.offset
            });
            continue;
        }

        // Step 2: Detect timezone from name + offset
        const timezoneId = detectTimezoneId(role.name, tzData.offset);
        if (!timezoneId) {
            results.unmapped.push({ roleId, name: role.name, offset: tzData.offset });
            console.log(`❌ Could not detect timezone for role "${role.name}" (offset: ${tzData.offset})`);
            continue;
        }

        // Step 3: Look up new role name from dstState.json
        if (!dstState[timezoneId]) {
            console.error(`❌ CRITICAL: timezoneId "${timezoneId}" detected from role "${role.name}" but not found in dstState.json!`);
            results.unmapped.push({ roleId, name: role.name, offset: tzData.offset, error: 'Missing in dstState' });
            continue;
        }
        const newRoleName = dstState[timezoneId].roleFormat;

        // Step 4: Rename role if needed
        if (role.name !== newRoleName) {
            try {
                await role.setName(newRoleName);
                await role.setColor(TIMEZONE_ROLE_COLOR);
                console.log(`🔄 Renamed role: "${role.name}" → "${newRoleName}" (blue color applied, ID: ${roleId})`);
                results.renamed.push({
                    roleId,
                    oldName: role.name,
                    newName: newRoleName,
                    timezoneId
                });

                // Add rate limit delay to avoid Discord rate limits
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(`❌ Failed to rename role ${roleId}:`, error);
                results.failed.push({
                    roleId,
                    name: role.name,
                    error: error.message,
                    timezoneId  // CRITICAL: Store which timezone this was for duplicate prevention
                });
                continue;
            }
        } else {
            results.unchanged.push({ roleId, name: role.name, timezoneId });
            console.log(`✅ Role "${role.name}" already has correct name`);
        }

        // Step 5: Add metadata to tzData (will be saved by updateCastBotStorage)
        tzData.timezoneId = timezoneId;
        tzData.dstObserved = dstState[timezoneId].dstObserved;
        tzData.standardName = dstState[timezoneId].standardName;
    }

    console.log(`✅ Conversion complete: ${results.renamed.length} renamed, ${results.unchanged.length} unchanged, ${results.unmapped.length} unmapped, ${results.failed.length} failed, ${results.orphaned.length} orphaned (cleaned up)`);

    return results;
}

/**
 * Check if duplicate timezone roles exist (same timezoneId)
 * Used to determine if consolidation is needed (idempotent check)
 * @param {Object} timezones - Guild timezones from playerData (guildId.timezones)
 * @returns {Object} Duplicate analysis { hasDuplicates, duplicateCount, groups }
 */
function checkForDuplicateTimezones(timezones) {
    const byTimezoneId = {};
    let duplicateCount = 0;

    // Group roles by timezoneId
    for (const [roleId, tzData] of Object.entries(timezones)) {
        // Skip roles without timezoneId (custom timezones)
        if (!tzData.timezoneId) continue;

        if (!byTimezoneId[tzData.timezoneId]) {
            byTimezoneId[tzData.timezoneId] = [];
        }
        byTimezoneId[tzData.timezoneId].push(roleId);
    }

    // Count timezone groups with 2+ roles
    for (const [timezoneId, roleIds] of Object.entries(byTimezoneId)) {
        if (roleIds.length > 1) {
            duplicateCount++;
        }
    }

    return {
        hasDuplicates: duplicateCount > 0,
        duplicateCount,
        groups: byTimezoneId
    };
}

/**
 * Consolidate duplicate timezone roles into single roles
 * Finds roles with same timezoneId, migrates members to most-populated role, deletes duplicates
 * @param {Guild} guild - Discord guild object
 * @param {Object} currentTimezones - Existing timezone data from playerData
 * @returns {Object} Consolidation results { merged, deleted, errors, preview }
 */
async function consolidateTimezoneRoles(guild, currentTimezones) {
    console.log(`🔀 Starting timezone role consolidation for guild ${guild.id}`);

    const results = {
        merged: [],      // Successfully merged role groups
        deleted: [],     // Roles deleted after merge
        errors: [],      // Errors during consolidation
        preview: [],     // Preview of what will happen
        memberChanges: [] // Track member migrations for reporting
    };

    // Load dstState to infer timezoneId from offset for legacy roles
    const dstState = await loadDSTState();

    // Helper: Find timezoneId from offset using dstState
    const findTimezoneIdFromOffset = (offset) => {
        for (const [timezoneId, tz] of Object.entries(dstState)) {
            // Match either standardOffset or dstOffset
            if (tz.standardOffset === offset || tz.dstOffset === offset) {
                return timezoneId;
            }
        }
        return null; // Custom timezone, can't infer
    };

    // Helper: Try to match role name against dstState patterns
    const findTimezoneIdFromRoleName = (roleName) => {
        for (const [timezoneId, tz] of Object.entries(dstState)) {
            // Match exact roleFormat (e.g., "PST / PDT")
            if (tz.roleFormat && roleName === tz.roleFormat) {
                return { timezoneId, matchType: 'roleFormat' };
            }
            // Match standardName (e.g., "PST (UTC-8)")
            if (tz.standardName && roleName === tz.standardName) {
                return { timezoneId, matchType: 'standardName' };
            }
            // Match standardNameDST (e.g., "PDT (UTC-7)")
            if (tz.standardNameDST && roleName === tz.standardNameDST) {
                return { timezoneId, matchType: 'standardNameDST' };
            }
            // Match abbreviation patterns with word boundaries (e.g., "PST", "PST WHATEVER", "WHATEVER PST")
            // Uses regex word boundaries to avoid false matches like "UPSTATE"
            if (tz.standardAbbrev) {
                const abbrevRegex = new RegExp(`\\b${tz.standardAbbrev}\\b`, 'i');
                if (abbrevRegex.test(roleName)) {
                    return { timezoneId, matchType: 'abbrev' };
                }
            }
            if (tz.dstAbbrev) {
                const abbrevRegex = new RegExp(`\\b${tz.dstAbbrev}\\b`, 'i');
                if (abbrevRegex.test(roleName)) {
                    return { timezoneId, matchType: 'abbrev' };
                }
            }
        }
        return null;
    };

    // Step 1: Find ALL timezone roles (registered in playerData + unregistered in Discord)
    const allTimezoneRoles = new Map(); // roleId -> { roleId, tzData, isRegistered, source }

    // Add registered roles from playerData
    for (const [roleId, tzData] of Object.entries(currentTimezones)) {
        allTimezoneRoles.set(roleId, {
            roleId,
            tzData,
            isRegistered: true,
            source: 'playerData'
        });
    }

    // Scan Discord roles for unregistered timezone roles
    console.log(`🔍 Scanning Discord roles for unregistered timezone roles...`);
    const discordRoles = await guild.roles.fetch();
    for (const [roleId, discordRole] of discordRoles) {
        // Skip if already in playerData
        if (allTimezoneRoles.has(roleId)) continue;

        // Try to match role name against timezone patterns
        const match = findTimezoneIdFromRoleName(discordRole.name);
        if (match) {
            const tz = dstState[match.timezoneId];
            console.log(`🔍 Found unregistered timezone role: "${discordRole.name}" → ${match.timezoneId} (matched ${match.matchType})`);

            // Create minimal tzData for unregistered role
            const inferredTzData = {
                offset: tz.currentOffset, // Use current DST-aware offset
                timezoneId: match.timezoneId,
                dstObserved: tz.dstObserved,
                standardName: tz.standardName
            };

            allTimezoneRoles.set(roleId, {
                roleId,
                tzData: inferredTzData,
                isRegistered: false,
                source: 'discord_unregistered'
            });
        }
    }

    console.log(`📊 Found ${allTimezoneRoles.size} total timezone roles (${Object.keys(currentTimezones).length} registered + ${allTimezoneRoles.size - Object.keys(currentTimezones).length} unregistered)`);

    // Step 2: Group roles by timezoneId (from all sources)
    const rolesByTimezoneId = {};
    for (const [roleId, roleInfo] of allTimezoneRoles) {
        const tzData = roleInfo.tzData;

        // Get actual timezoneId or infer from offset
        let timezoneId = tzData.timezoneId;
        let isInferred = false;

        if (!timezoneId && tzData.offset !== undefined) {
            timezoneId = findTimezoneIdFromOffset(tzData.offset);
            isInferred = true;
            if (timezoneId) {
                console.log(`🔍 Inferred timezoneId "${timezoneId}" from offset ${tzData.offset} for role ${roleId}`);
            }
        }

        if (!timezoneId) {
            console.log(`⚠️ Role ${roleId} has no timezoneId and offset ${tzData.offset} doesn't match dstState, skipping`);
            continue;
        }

        if (!rolesByTimezoneId[timezoneId]) {
            rolesByTimezoneId[timezoneId] = [];
        }

        rolesByTimezoneId[timezoneId].push({
            roleId,
            tzData,
            isInferred,
            isRegistered: roleInfo.isRegistered,
            source: roleInfo.source
        });
    }

    // Process each timezone group
    for (const [timezoneId, roles] of Object.entries(rolesByTimezoneId)) {
        // Only consolidate if there are duplicates
        if (roles.length <= 1) {
            console.log(`✅ Timezone ${timezoneId} has only 1 role, skipping`);
            continue;
        }

        console.log(`🔀 Found ${roles.length} duplicate roles for ${timezoneId}, consolidating...`);

        try {
            // Fetch Discord roles and count members
            const roleData = [];
            for (const { roleId, tzData, isInferred, isRegistered, source } of roles) {
                const discordRole = await guild.roles.fetch(roleId).catch(() => null);
                if (!discordRole) {
                    console.log(`⚠️ Role ${roleId} no longer exists in Discord, skipping`);
                    continue;
                }

                // Fetch all members with this role
                await guild.members.fetch(); // Ensure member cache is populated
                const members = guild.members.cache.filter(m => m.roles.cache.has(roleId));

                roleData.push({
                    roleId,
                    discordRole,
                    tzData,
                    isInferred,
                    isRegistered,
                    source,
                    hasDSTMetadata: !!tzData.timezoneId, // True if DST-aware, false if legacy
                    memberCount: members.size,
                    members: members.map(m => m.id)
                });
            }

            if (roleData.length <= 1) {
                console.log(`⚠️ Only 1 valid Discord role found for ${timezoneId}, skipping`);
                continue;
            }

            // Sort by registration status, DST metadata, member count, then role ID
            // Priority 1: Prefer registered roles (in playerData) over unregistered
            // Priority 2: Prefer roles WITH timezoneId metadata (DST-aware) over legacy roles
            // Priority 3: Higher member count wins
            // Priority 4: Older role (lower snowflake ID) wins
            roleData.sort((a, b) => {
                // Prefer registered roles over unregistered
                if (a.isRegistered !== b.isRegistered) {
                    return b.isRegistered ? 1 : -1; // Registered wins
                }
                // Prefer DST-aware roles (have metadata) over legacy roles (no metadata)
                if (a.hasDSTMetadata !== b.hasDSTMetadata) {
                    return b.hasDSTMetadata ? 1 : -1; // DST-aware wins
                }
                // If both have metadata or both don't, use member count
                if (b.memberCount !== a.memberCount) {
                    return b.memberCount - a.memberCount; // Higher count wins
                }
                // Tie-breaker: Lower role ID wins (older role)
                return a.roleId.localeCompare(b.roleId);
            });

            const winner = roleData[0];
            const losers = roleData.slice(1);

            const winnerType = winner.hasDSTMetadata ? '✅ DST-aware' : '⚠️ LEGACY';
            const winnerReg = winner.isRegistered ? '📝 Registered' : '⚠️ Unregistered';
            console.log(`🏆 Retained: ${winner.discordRole.name} (${winner.memberCount} members, ${winnerType}, ${winnerReg}, ID: ${winner.roleId})`);

            losers.forEach(loser => {
                const loserType = loser.hasDSTMetadata ? '✅ DST-aware' : '⚠️ LEGACY';
                const loserReg = loser.isRegistered ? '📝 Registered' : '⚠️ Unregistered';
                console.log(`  ⤷ Loser: ${loser.discordRole.name} (${loser.memberCount} members, ${loserType}, ${loserReg}, ID: ${loser.roleId})`);
            });

            // Migrate members from losers to winner
            const migratedMembers = [];
            const memberChanges = []; // Track for reporting
            for (const loser of losers) {
                for (const memberId of loser.members) {
                    try {
                        const member = guild.members.cache.get(memberId);
                        if (!member) continue;

                        // Remove loser role
                        await member.roles.remove(loser.roleId);

                        // Add winner role (only if they don't already have it)
                        if (!member.roles.cache.has(winner.roleId)) {
                            await member.roles.add(winner.roleId);
                        }

                        migratedMembers.push(memberId);
                        memberChanges.push({
                            userId: memberId,
                            username: member.user.tag,
                            fromRole: loser.discordRole.name,
                            toRole: winner.discordRole.name,
                            timezoneId
                        });
                        console.log(`  ↔️ Migrated member ${member.user.tag} from ${loser.discordRole.name} to ${winner.discordRole.name}`);

                        // Rate limit: 50ms between role changes
                        await new Promise(resolve => setTimeout(resolve, 50));
                    } catch (error) {
                        console.error(`❌ Failed to migrate member ${memberId}:`, error.message);
                        results.errors.push({
                            timezoneId,
                            memberId,
                            error: error.message
                        });
                    }
                }
            }

            // Track member changes in results
            results.memberChanges.push(...memberChanges);

            // Verify losers now have 0 members before deleting
            for (const loser of losers) {
                await guild.members.fetch(); // Refresh cache
                const remainingMembers = guild.members.cache.filter(m => m.roles.cache.has(loser.roleId));

                if (remainingMembers.size > 0) {
                    console.error(`❌ Role ${loser.discordRole.name} still has ${remainingMembers.size} members, NOT deleting`);
                    results.errors.push({
                        timezoneId,
                        roleId: loser.roleId,
                        roleName: loser.discordRole.name,
                        error: `Still has ${remainingMembers.size} members after migration`
                    });
                    continue;
                }

                // Delete the empty loser role
                try {
                    await loser.discordRole.delete('CastBot timezone consolidation - duplicate role merged');
                    console.log(`🗑️ Deleted role: ${loser.discordRole.name} (ID: ${loser.roleId})`);

                    results.deleted.push({
                        roleId: loser.roleId,
                        roleName: loser.discordRole.name,
                        timezoneId
                    });

                    // Rate limit: 200ms between role deletions
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    console.error(`❌ Failed to delete role ${loser.discordRole.name}:`, error.message);
                    results.errors.push({
                        timezoneId,
                        roleId: loser.roleId,
                        roleName: loser.discordRole.name,
                        error: error.message
                    });
                }
            }

            // NEW: Update winner role - rename and add metadata
            // (dstState already loaded at top of function)
            const standardRoleName = dstState[timezoneId]?.roleFormat;

            let wasRenamed = false;
            let metadataAdded = false;

            // Step 1: Rename winner role to standard format if needed
            if (standardRoleName && winner.discordRole.name !== standardRoleName) {
                try {
                    await winner.discordRole.setName(standardRoleName);
                    await winner.discordRole.setColor(TIMEZONE_ROLE_COLOR);
                    console.log(`🔄 Renamed retained role: "${winner.discordRole.name}" → "${standardRoleName}" (blue color applied)`);
                    wasRenamed = true;
                    // Rate limit: 200ms after rename
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    console.warn(`⚠️ Could not rename winner role ${winner.roleId}:`, error.message);
                    // Non-critical error - continue with consolidation
                    results.errors.push({
                        timezoneId,
                        roleId: winner.roleId,
                        roleName: winner.discordRole.name,
                        error: `Rename failed: ${error.message}`,
                        severity: 'warning'
                    });
                }
            } else if (standardRoleName && winner.discordRole.name === standardRoleName) {
                console.log(`✅ Retained role "${winner.discordRole.name}" already has correct name`);
            }

            // Step 2: Add metadata to winner role if missing
            if (!winner.tzData.timezoneId) {
                winner.tzData.timezoneId = timezoneId;
                winner.tzData.dstObserved = dstState[timezoneId]?.dstObserved || false;
                winner.tzData.standardName = dstState[timezoneId]?.standardName || null;
                metadataAdded = true;
                console.log(`📝 Added metadata to retained role ${winner.roleId}: timezoneId="${timezoneId}"`);
            } else {
                console.log(`✅ Retained role ${winner.roleId} already has timezoneId metadata`);
            }

            // Step 3: Register winner in playerData if it was unregistered
            if (!winner.isRegistered) {
                currentTimezones[winner.roleId] = winner.tzData;
                console.log(`📝 Registered retained role ${winner.roleId} in playerData (was unregistered)`);
            }

            // Record successful merge
            results.merged.push({
                timezoneId,
                winner: {
                    roleId: winner.roleId,
                    roleName: wasRenamed ? standardRoleName : winner.discordRole.name,
                    finalMemberCount: winner.memberCount + migratedMembers.length,
                    wasRenamed,
                    metadataAdded
                },
                losers: losers.map(l => {
                    // Find members that were migrated from this specific loser role
                    const migratedFromThisRole = memberChanges.filter(mc => mc.fromRole === l.discordRole.name);
                    return {
                        roleId: l.roleId,
                        roleName: l.discordRole.name,
                        membersMigrated: l.memberCount,
                        migratedMemberNames: migratedFromThisRole.map(mc => mc.username)
                    };
                }),
                totalMigrated: migratedMembers.length
            });

        } catch (error) {
            console.error(`❌ Failed to consolidate ${timezoneId}:`, error);
            results.errors.push({
                timezoneId,
                error: error.message
            });
        }
    }

    console.log(`✅ Consolidation complete: ${results.merged.length} merged, ${results.deleted.length} deleted, ${results.errors.length} errors`);

    return results;
}

/**
 * Execute comprehensive setup process for pronouns and timezones
 * Handles role creation, existing role detection, timezone conversion, and CastBot integration
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
            hierarchyWarnings: [],
            // NEW: Conversion tracking
            converted: [],    // Roles renamed from old format to new standard
            unmapped: [],     // Roles that couldn't be detected/converted
            conversionFailed: []  // Roles that failed during rename
        }
    };

    // Get current CastBot data to check what's already configured
    const playerData = await loadPlayerData();
    const currentPronounIds = playerData[guildId]?.pronounRoleIDs || [];
    const currentTimezones = playerData[guildId]?.timezones || {};

    // NEW: Run conversion on existing timezone roles BEFORE creating new ones
    if (Object.keys(currentTimezones).length > 0) {
        console.log(`🔄 Found ${Object.keys(currentTimezones).length} existing timezone roles, running conversion...`);
        const conversionResults = await convertExistingTimezones(guild, currentTimezones);

        // Store conversion results for user feedback
        results.timezones.converted = conversionResults.renamed;
        results.timezones.unmapped = conversionResults.unmapped;
        results.timezones.conversionFailed = conversionResults.failed;
        results.timezones.orphaned = conversionResults.orphaned;

        // Mark converted roles as "already in CastBot" (they now have timezoneId)
        conversionResults.renamed.forEach(conv => {
            results.timezones.alreadyInCastBot.push({
                id: conv.roleId,
                name: conv.newName,
                timezoneId: conv.timezoneId,
                converted: true  // Flag to show this was converted
            });
        });

        // Mark unchanged roles as "already in CastBot" too
        conversionResults.unchanged.forEach(unc => {
            results.timezones.alreadyInCastBot.push({
                id: unc.roleId,
                name: unc.name,
                timezoneId: unc.timezoneId,
                converted: false  // Already had correct name
            });
        });

        // CRITICAL: Save converted timezone metadata to playerData.json
        // The conversion modified currentTimezones in-place, but updateCastBotStorage()
        // will reload from disk, losing these changes if we don't save now
        console.log(`💾 DEBUG: Saving ${Object.keys(currentTimezones).length} timezone conversions to playerData.json`);
        playerData[guildId].timezones = currentTimezones;
        await savePlayerData(playerData);
        console.log(`✅ DEBUG: Conversion data saved successfully`);
    }

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

    // Process timezone roles - create missing roles with new standard names
    console.log('🔍 DEBUG: Processing timezone roles...');
    for (const timezone of STANDARD_TIMEZONE_ROLES) {
        try {
            // CRITICAL: Check if conversion failed for this timezone due to hierarchy
            const conversionFailed = results.timezones.conversionFailed.find(f =>
                f.timezoneId === timezone.id
            );

            if (conversionFailed) {
                // Old role exists but couldn't be renamed
                // DON'T create duplicate - add to hierarchy warnings if it's a permissions issue
                console.log(`⚠️ DEBUG: Skipping ${timezone.name} creation - conversion failed (existing role: ${conversionFailed.name})`);

                // Check if it's a hierarchy issue (Missing Permissions)
                if (conversionFailed.error === 'Missing Permissions') {
                    results.timezones.hierarchyWarnings.push({
                        ...timezone,
                        id: conversionFailed.roleId,
                        existingName: conversionFailed.name,
                        botRoleName: guild.members.me?.roles.highest?.name || 'CastBot',
                        reason: 'Role exists but is above CastBot in hierarchy'
                    });
                }
                // Conversion failure is already tracked in conversionFailed array
                continue;
            }

            const existingRole = guild.roles.cache.find(r => r.name === timezone.name);

            if (existingRole) {
                // Role exists in Discord with correct name - check if it's already in CastBot
                if (currentTimezones[existingRole.id]) {
                    // Already handled by conversion phase - skip to avoid duplicates
                    console.log(`✅ DEBUG: Timezone role ${timezone.name} already handled by conversion, skipping`);
                    continue;
                } else {
                    // New role with standard name (not in CastBot yet) - add it
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
                // Role doesn't exist - create it with new standard name
                console.log(`🔨 DEBUG: Creating new timezone role ${timezone.name}`);
                const newRole = await guild.roles.create({
                    name: timezone.name,
                    color: TIMEZONE_ROLE_COLOR,
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
            // Find the original timezone ID from STANDARD_TIMEZONE_ROLES
            const originalTimezone = STANDARD_TIMEZONE_ROLES.find(t => t.name === tz.name);
            const timezoneId = originalTimezone?.id || null; // e.g., "PT", "MT", "ET"

            currentTimezones[tz.id] = {
                offset: tz.offset,
                // Store DST information for future automatic switching
                dstObserved: tz.dstObserved || false,
                standardName: tz.standardName || null,
                // Enable new DST system via feature toggle
                timezoneId: timezoneId  // Links to dstState.json (enables DST toggle)
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
    
    // Timezone Roles Section - detailed with mentions and conversion info
    const timezoneTotal = results.timezones.created.length + results.timezones.existingAdded.length + results.timezones.alreadyInCastBot.length;

    if (timezoneTotal > 0) {
        sections.push('## 🌍 Timezone Roles\n');

        // Show conversion summary first if any roles were converted
        if (results.timezones.converted && results.timezones.converted.length > 0) {
            sections.push('### 🔄 Converted to DST-Aware Standard:');
            results.timezones.converted.forEach(conv => {
                sections.push(`• <@&${conv.roleId}> - Renamed from "${conv.oldName}" → "${conv.newName}"`);
            });
            sections.push('');
        }

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

        // Show already configured roles (excluding converted ones which are already shown)
        const unconvertedRoles = results.timezones.alreadyInCastBot.filter(r => !r.converted);
        if (unconvertedRoles.length > 0) {
            sections.push('### ✓ Already Configured in CastBot:');
            unconvertedRoles.forEach(role => {
                sections.push(`• <@&${role.id}> (${role.name})`);
            });
            sections.push('');
        }

        sections.push(`**Total Timezone Roles:** ${timezoneTotal}\n`);

        // Show unmapped roles warning if any
        if (results.timezones.unmapped && results.timezones.unmapped.length > 0) {
            sections.push('### ⚠️ Roles Not Converted (Unrecognized Pattern):');
            results.timezones.unmapped.forEach(role => {
                sections.push(`• ${role.name} (offset: ${role.offset}) - Manual review needed`);
            });
            sections.push('');
        }

        // Show conversion failures if any
        if (results.timezones.conversionFailed && results.timezones.conversionFailed.length > 0) {
            sections.push('### ❌ Conversion Failures:');
            results.timezones.conversionFailed.forEach(role => {
                sections.push(`• ${role.name} - ${role.error}`);
            });
            sections.push('');
        }

        // Show orphaned roles that were cleaned up
        if (results.timezones.orphaned && results.timezones.orphaned.length > 0) {
            sections.push('### 🗑️ Cleaned Up Orphaned Roles:');
            sections.push(`**${results.timezones.orphaned.length} roles** were removed from CastBot because they no longer exist in Discord:\n`);
            results.timezones.orphaned.forEach(orphan => {
                sections.push(`• Role ID: ${orphan.roleId} (${orphan.timezoneId || 'unknown timezone'}, offset: ${orphan.offset})`);
            });
            sections.push('');
        }
    }

    // Consolidation Section (Phase 2 integration)
    if (results.timezones?.consolidation && results.timezones.consolidation.merged.length > 0) {
        const cons = results.timezones.consolidation;
        sections.push('## 🔀 Duplicate Role Consolidation\n');

        sections.push(`**${cons.merged.length} timezone groups** were consolidated by merging duplicate roles:\n`);

        // Show each merged group
        cons.merged.forEach(merge => {
            sections.push(`### ${merge.timezoneId}`);
            sections.push(`• ✅ Retained Role: <@&${merge.winner.roleId}> (${merge.winner.finalMemberCount || 0} members)`);

            if (merge.winner.wasRenamed) {
                sections.push(`  🔄 Renamed to standard format: "${merge.winner.roleName}"`);
            }

            if (merge.winner.metadataAdded) {
                sections.push(`  📝 Added DST metadata (timezoneId, dstObserved, standardName)`);
            }

            merge.losers.forEach(loser => {
                const migratedCount = loser.membersMigrated || 0;
                sections.push(`• 🗑️ Removed: ${loser.roleName} (${migratedCount} members migrated)`);

                // Show member names inline if any were migrated
                if (loser.migratedMemberNames && loser.migratedMemberNames.length > 0) {
                    loser.migratedMemberNames.forEach(username => {
                        sections.push(`    • ${username}`);
                    });
                }
            });

            sections.push('');
        });

        // Calculate total members migrated from all merged groups
        const totalMembersMigrated = cons.merged.reduce((sum, merge) => sum + (merge.totalMigrated || 0), 0);
        sections.push(`**Summary:** ${cons.deleted.length} roles deleted, ${totalMembersMigrated} members migrated\n`);

        // Show consolidation errors if any
        if (cons.errors && cons.errors.length > 0) {
            sections.push('### ⚠️ Consolidation Warnings:');
            cons.errors.forEach(error => {
                const severityIcon = error.severity === 'warning' ? '⚠️' : '❌';
                sections.push(`${severityIcon} ${error.error}`);
            });
            sections.push('');
        }
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
                // For conversion failures, show the existing name (e.g., "PST (UTC-7)")
                const displayName = role.existingName || role.name;
                sections.push(`• <@&${role.id}> (${displayName})`);
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
    let fullMessage = sections.join('\n');
    console.log(`📊 DEBUG: Setup response V2 character count: ${fullMessage.length} characters`);

    // Discord Text Display limit is 4000 characters (ComponentsV2.md)
    const CHAR_LIMIT = 4000;
    if (fullMessage.length > CHAR_LIMIT) {
        console.warn(`⚠️ Setup response exceeded ${CHAR_LIMIT} character limit (${fullMessage.length} chars), truncating...`);
        // Truncate and add warning
        fullMessage = fullMessage.substring(0, CHAR_LIMIT - 150) + '\n\n---\n\n⚠️ **Response truncated** - Message exceeded 4000 character limit. Full details logged to console.';
    }

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
 * Build pronoun roles view menu with LEAN UI design
 * @param {string} guildId - Discord guild ID
 * @param {Object} client - Discord.js client
 * @returns {Object} Components V2 container structure
 */
async function buildPronounsViewMenu(guildId, client) {
    const guild = await client.guilds.fetch(guildId);
    const pronounRoleIDs = await getGuildPronouns(guildId);

    // Build pronoun list content
    let pronounContent = '';
    if (!pronounRoleIDs?.length) {
        pronounContent = 'No pronoun roles configured.\n\nUse **Edit Pronouns** from the main Pronouns & Timezones menu to add roles.';
    } else {
        for (const roleId of pronounRoleIDs) {
            const role = guild.roles.cache.get(roleId);
            if (role) {
                pronounContent += `<@&${roleId}>\n`;
            }
        }
    }

    // Navigation row only (no action buttons)
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const navRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prod_manage_pronouns_timezones')
                .setLabel('← Pronouns & Timezones')
                .setStyle(ButtonStyle.Secondary)
        );

    // Build LEAN container
    const containerComponents = [
        { type: 10, content: '## 💜 Pronouns | Roles for Castlist' },
        { type: 14 }, // Separator
        { type: 10, content: `> **\`💜 Configured Roles\`**` },
        { type: 10, content: pronounContent },
        { type: 14 }, // Separator before navigation
        navRow.toJSON()
    ];

    return {
        components: [{
            type: 17, // Container
            accent_color: 0x9B59B6, // Purple - identity/pronouns theme
            components: containerComponents
        }]
    };
}

/**
 * Build timezone roles view menu with LEAN UI design
 * @param {string} guildId - Discord guild ID
 * @param {Object} client - Discord.js client
 * @returns {Object} Components V2 container structure
 */
async function buildTimezonesViewMenu(guildId, client) {
    const guild = await client.guilds.fetch(guildId);
    const timezones = await getGuildTimezones(guildId);

    // Build timezone list content
    let timezoneContent = '';
    if (!Object.keys(timezones).length) {
        timezoneContent = 'No timezone roles configured.\n\nUse **Edit Timezones** or **Add Timezone** from the main Pronouns & Timezones menu to configure roles.';
    } else {
        for (const [roleId, timezoneData] of Object.entries(timezones)) {
            const role = guild.roles.cache.get(roleId);
            if (role) {
                const offset = timezoneData.offset;
                const offsetStr = offset >= 0 ? `UTC+${offset}` : `UTC${offset}`;
                timezoneContent += `<@&${roleId}> - ${offsetStr}\n`;
            }
        }
    }

    // Navigation row only (no action buttons)
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const navRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prod_manage_pronouns_timezones')
                .setLabel('← Pronouns & Timezones')
                .setStyle(ButtonStyle.Secondary)
        );

    // Build LEAN container
    const containerComponents = [
        { type: 10, content: '## 🌍 Timezone Roles | Global Time Configuration' },
        { type: 14 }, // Separator
        { type: 10, content: `> **\`🌍 Configured Roles\`**` },
        { type: 10, content: timezoneContent },
        { type: 14 }, // Separator before navigation
        navRow.toJSON()
    ];

    return {
        components: [{
            type: 17, // Container
            accent_color: 0x3498DB, // Blue - global/time theme
            components: containerComponents
        }]
    };
}

/**
 * Build timezone edit menu with LEAN UI design
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Components V2 container structure
 */
async function buildTimezoneEditMenu(guildId) {
    const timezones = await getGuildTimezones(guildId);

    // Get existing timezone role IDs
    const existingTimezoneRoles = Object.keys(timezones);

    // Use Discord.js RoleSelectMenuBuilder for better compatibility
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder } = await import('discord.js');
    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('prod_edit_timezones_select')
        .setPlaceholder('Select roles to add/remove as timezone roles')
        .setMinValues(0)
        .setMaxValues(25);

    // Set default values if any exist (limited to Discord's 25 role maximum)
    if (existingTimezoneRoles.length > 0) {
        const limitedRoles = existingTimezoneRoles.slice(0, 25);
        roleSelect.setDefaultRoles(limitedRoles);
    }

    const selectRow = new ActionRowBuilder().addComponents(roleSelect);

    // Navigation row
    const navRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('prod_manage_pronouns_timezones')
                .setLabel('← Pronouns & Timezones')
                .setStyle(ButtonStyle.Secondary)
        );

    // Build LEAN container
    const containerComponents = [
        { type: 10, content: '## ⏲️ Edit Timezone Roles | Bulk Modify' },
        { type: 14 }, // Separator
        { type: 10, content: `> **\`⏲️ Role Selection\`**` },
        { type: 10, content: 'Select which roles should be timezone roles. Currently selected roles are already ticked. Add or remove roles as needed.\n\n**Note:** If you add any new timezones, you need to set the offset afterwards using the \'Add Timezone\' button.' },
        { type: 14 }, // Separator
        selectRow.toJSON(),
        { type: 14 }, // Separator before navigation
        navRow.toJSON()
    ];

    return {
        components: [{
            type: 17, // Container
            accent_color: 0x3498DB, // Blue - global/time theme
            components: containerComponents
        }]
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
/**
 * Helper: Escape special regex characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for regex
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Determines if a Discord role matches any timezone pattern in dstState.json
 * Does NOT require registration in playerData - pattern match is sufficient
 *
 * @param {Object} role - Discord.js Role object with .id and .name
 * @param {Object} dstState - Loaded dstState.json object
 * @returns {Object|false} { timezoneId, reason, matchType } or false
 */
function isTimezoneRole(role, dstState) {
    const roleName = role.name;

    for (const [timezoneId, tzInfo] of Object.entries(dstState)) {
        // TIER 1: Exact match on current standard format
        if (roleName === tzInfo.roleFormat) {
            return {
                timezoneId,
                reason: `Exact match on roleFormat: "${tzInfo.roleFormat}"`,
                matchType: 'exact'
            };
        }

        // TIER 2: Exact match on legacy formats
        const legacyFormats = [
            tzInfo.standardName,     // "PST (UTC-8)"
            tzInfo.standardNameDST   // "PDT (UTC-7)" (if exists)
        ].filter(Boolean);

        for (const legacyFormat of legacyFormats) {
            if (roleName === legacyFormat) {
                return {
                    timezoneId,
                    reason: `Exact match on legacy format: "${legacyFormat}"`,
                    matchType: 'exact_legacy'
                };
            }
        }

        // TIER 3: Word boundary matching on abbreviations
        // Handles "My PST Role", "PST WHATEVER", etc.
        const abbrevs = [
            tzInfo.standardAbbrev,   // "PST"
            tzInfo.dstAbbrev         // "PDT" (if exists)
        ].filter(Boolean);

        for (const abbrev of abbrevs) {
            // Use word boundary to avoid false positives
            // e.g., "PST" matches "PST", "My PST Role" but not "PAST"
            const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(abbrev)}\\b`, 'i');
            if (wordBoundaryRegex.test(roleName)) {
                return {
                    timezoneId,
                    reason: `Abbreviation match: "${abbrev}" in "${roleName}"`,
                    matchType: 'fuzzy'
                };
            }
        }
    }

    return false;
}

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
        // Load playerData once for all operations
        const playerData = await loadPlayerData();
        const guildData = playerData[guildId];

        if (!guildData) {
            console.log('⚠️ DEBUG: No guild data found in playerData.json');
        }

        // PHASE 1: Clear ALL timezone entries from playerData
        // (Aggressive approach - nuke the entire timezones object)
        console.log('🗃️ DEBUG: Phase 1 - Clearing CastBot storage data...');

        if (guildData) {
            // Clear pronouns
            if (guildData.pronounRoleIDs) {
                results.pronounsCleared = guildData.pronounRoleIDs.length;
                guildData.pronounRoleIDs = [];
            }

            // Clear ALL timezones (we'll verify against Discord roles in Phase 3)
            if (guildData.timezones) {
                results.timezonesCleared = Object.keys(guildData.timezones).length;
                guildData.timezones = {};
            }

            await savePlayerData(playerData);
            console.log(`✅ DEBUG: Cleared ${results.pronounsCleared} pronouns and ${results.timezonesCleared} timezones from storage`);
        }

        // PHASE 2: Scan Discord roles and mark for deletion
        console.log('🗑️ DEBUG: Phase 2 - Scanning Discord roles for deletion...');
        const guild = client?.guilds?.cache?.get(guildId);

        if (!guild) {
            results.errors.push('Could not access guild - Discord client may not be available');
            return results;
        }

        // Load dstState.json for timezone detection
        const dstState = await loadDSTState();
        const roles = guild.roles.cache;
        const rolesToDelete = [];
        const roleIdsToDelete = new Set(); // Track IDs for playerData cleanup

        // Find roles to delete via pattern matching
        roles.forEach(role => {
            // Check if timezone role (uses dstState.json)
            const tzMatch = isTimezoneRole(role, dstState);
            if (tzMatch) {
                rolesToDelete.push(role);
                roleIdsToDelete.add(role.id);
                console.log(`🎯 DEBUG: Marked for deletion: ${role.name} (${role.id}) - ${tzMatch.reason}`);
                return;
            }

            // Check if pronoun role
            const pronounName = role.name;
            if (PRONOUN_COLORS.hasOwnProperty(pronounName)) {
                const expectedColor = PRONOUN_COLORS[pronounName];
                if (role.color === expectedColor) {
                    rolesToDelete.push(role);
                    roleIdsToDelete.add(role.id);
                    console.log(`🎯 DEBUG: Marked for deletion: ${role.name} (${role.id}) - Pronoun name and color match`);
                    return;
                }
            }
        });

        // PHASE 3: Delete Discord roles
        console.log(`🗑️ DEBUG: Phase 3 - Deleting ${rolesToDelete.length} Discord roles...`);
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

        // PHASE 4: Final cleanup - Remove any remaining references to deleted role IDs
        // This catches edge cases where roles were in playerData but not in our cleared sections
        console.log('🧹 DEBUG: Phase 4 - Final playerData cleanup...');
        if (guildData && roleIdsToDelete.size > 0) {
            let extraCleanupCount = 0;

            // Check for orphaned timezone entries (shouldn't happen after Phase 1, but safety check)
            if (guildData.timezones) {
                for (const roleId of Object.keys(guildData.timezones)) {
                    if (roleIdsToDelete.has(roleId)) {
                        delete guildData.timezones[roleId];
                        extraCleanupCount++;
                    }
                }
            }

            // Check for orphaned pronoun entries
            if (guildData.pronounRoleIDs) {
                const beforeLength = guildData.pronounRoleIDs.length;
                guildData.pronounRoleIDs = guildData.pronounRoleIDs.filter(id => !roleIdsToDelete.has(id));
                extraCleanupCount += beforeLength - guildData.pronounRoleIDs.length;
            }

            if (extraCleanupCount > 0) {
                await savePlayerData(playerData);
                console.log(`🧹 DEBUG: Cleaned up ${extraCleanupCount} additional playerData references`);
            } else {
                console.log('✅ DEBUG: No additional cleanup needed - all references already cleared');
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
    isTimezoneRole,
    nukeRoles,
    checkForDuplicateTimezones,
    consolidateTimezoneRoles,
    buildPronounsViewMenu,
    buildTimezonesViewMenu,
    buildTimezoneEditMenu
};