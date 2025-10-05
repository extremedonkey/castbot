import { 
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { InteractionResponseFlags } from 'discord-interactions';
import {
    getGuildTribes,
    getGuildPronouns,
    getGuildTimezones,
    getPlayer,
    loadPlayerData
} from './storage.js';
import { capitalize } from './utils.js';
import { sortCastlistMembers } from './castlistSorter.js';

/**
 * Components V2 Castlist Module for CastBot
 * Provides modern, interactive castlist display with player cards and pagination
 * Features dynamic component calculation to handle Discord's 40-component limit
 */

/**
 * Calculate total components needed for a tribe
 * @param {number} playerCount - Number of players in the tribe
 * @param {boolean} includeSeparators - Whether to include separator components
 * @returns {number} Total component count
 */
function calculateComponentsForTribe(playerCount, includeSeparators = true) {
    // IMPORTANT: Discord DOES count accessories as separate components!
    const playerComponents = playerCount * 3; // Section + TextDisplay + Thumbnail(accessory) per player
    const separatorCount = includeSeparators ? Math.max(0, playerCount - 1) : 0;
    // Tribe overhead: Container + Header Section + Separator after header = 3 components (install button moved)
    const tribeOverhead = 3; // Container + Header Section + Separator
    const installOverhead = includeSeparators ? 3 : 2; // Separator(conditional) + Install ActionRow + Install Button
    const messageOverhead = 0; // No ad text - removed completely
    // Navigation: ActionRow (1) + 3 buttons (2 arrows + manage profile) = 4 components
    const navigationOverhead = 4; // Navigation ActionRow + 3 buttons (no separate manage profile row)
    
    return playerComponents + separatorCount + tribeOverhead + installOverhead + messageOverhead + navigationOverhead;
}

/**
 * Determine display scenario based on component limits
 * @param {Array} tribes - Array of tribe data with member counts
 * @returns {string} Scenario type: "ideal", "no-separators", or "multi-page"
 */
function determineDisplayScenario(tribes) {
    // Simplified: Use multi-page for tribes with 9+ players, otherwise ideal
    const needsPagination = tribes.some(tribe => tribe.memberCount >= 9);
    
    if (needsPagination) {
        console.log('Display scenario: multi-page (tribe with 9+ players needs pagination)');
        return "multi-page";
    } else {
        console.log('Display scenario: ideal (all tribes have 8 or fewer players)');
        return "ideal";
    }
    
    // TODO: Future tech debt cleanup - remove old complex scenario logic
    // Old logic checked component limits and separator scenarios but we now
    // use simplified 8-player limit with pagination for larger tribes
}

/**
 * Calculate pagination for a tribe that exceeds component limits
 * @param {Object} tribe - Tribe data
 * @param {Array} members - Array of Discord members
 * @param {boolean} includeSeparators - Whether to include separators
 * @returns {Object} Pagination information
 */
function calculateTribePages(tribe, members) {
    // Sort members according to tribe type (alumni_placements, etc.)
    const sortedMembers = sortCastlistMembers([...members], tribe);
    
    // Simplified: Always allow 8 players per page with separators
    const maxPlayersPerPage = 8;
    const totalPages = Math.ceil(sortedMembers.length / maxPlayersPerPage);
    
    // Distribute players across pages (higher count on first page for odd distributions)
    const pages = [];
    let remainingMembers = [...sortedMembers];
    
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        const remainingPages = totalPages - pageIndex;
        const membersForThisPage = Math.ceil(remainingMembers.length / remainingPages);
        
        pages.push(remainingMembers.slice(0, membersForThisPage));
        remainingMembers = remainingMembers.slice(membersForThisPage);
    }
    
    console.log(`Tribe ${tribe.name}: ${sortedMembers.length} players across ${totalPages} pages`);
    console.log(`Page distribution: ${pages.map(p => p.length).join(', ')} players`);
    
    return {
        totalPages,
        maxPlayersPerPage,
        pages,
        tribe
    };
}

/**
 * Enhanced navigation state for complex tribe/page navigation
 * @param {Array} tribes - Array of tribe data
 * @param {string} scenario - Display scenario
 * @param {number} currentTribeIndex - Current tribe index
 * @param {number} currentTribePage - Current page within tribe
 * @returns {Object} Navigation state
 */
function createNavigationState(tribes, scenario, currentTribeIndex = 0, currentTribePage = 0) {
    return {
        currentTribeIndex,
        currentTribePage,
        totalTribes: tribes.length,
        scenario,
        tribes: tribes.map(tribe => ({
            ...tribe,
            totalPages: scenario === "multi-page" && tribe.memberCount > 0 ? 
                calculateTribePages(tribe, tribe.members).totalPages : 1
        }))
    };
}

/**
 * Reorder tribes based on strategy with user-first logic for default castlists
 * @param {Array} tribes - Array of tribe data with members
 * @param {string} userId - User ID for user-first ordering
 * @param {string} strategy - Ordering strategy
 * @param {string} castlistName - Name of the castlist ("default" triggers user-first)
 * @returns {Array} Reordered tribes
 */
function reorderTribes(tribes, userId = null, strategy = "default", castlistName = "default") {
    switch(strategy) {
        case "user-first":
            if (!userId || castlistName !== "default") {
                console.log('User-first ordering: conditions not met, using default order');
                return tribes;
            }
            
            // Find tribes that contain the user
            const userTribes = [];
            const otherTribes = [];
            
            for (const tribe of tribes) {
                const userInTribe = tribe.members && tribe.members.some(member => member.id === userId);
                if (userInTribe) {
                    userTribes.push(tribe);
                } else {
                    otherTribes.push(tribe);
                }
            }
            
            // Sort user tribes alphabetically
            userTribes.sort((a, b) => a.name.localeCompare(b.name));
            
            // Sort other tribes alphabetically  
            otherTribes.sort((a, b) => a.name.localeCompare(b.name));
            
            console.log(`User-first ordering: User ${userId} is in ${userTribes.length} tribe(s), showing ${userTribes.map(t => t.name).join(', ')} first`);
            
            // Return user tribes first, then other tribes
            return [...userTribes, ...otherTribes];
            
        case "alphabetical":
            return [...tribes].sort((a, b) => a.name.localeCompare(b.name));
        case "size":
            return [...tribes].sort((a, b) => b.memberCount - a.memberCount);
        case "default":
        default:
            return tribes;
    }
}

/**
 * Creates a condensed player card section using Components V2 Section component
 * @param {Object} member - Discord guild member
 * @param {Object} playerData - Player data from storage (age, emoji, etc.)
 * @param {string} pronouns - Formatted pronouns string (empty if none)
 * @param {string} timezone - Timezone role name (empty if none)
 * @param {string} formattedTime - Current time in player's timezone (empty if none)
 * @param {boolean} showEmoji - Whether to display player emoji
 * @param {string} displayMode - 'view' or 'edit' mode
 * @param {Object} tribeData - Tribe information (for edit button)
 * @param {string} guildId - Guild ID (for placement lookup)
 * @param {Object} allPlacements - Pre-loaded placement data (global placements map)
 * @returns {Object} Player card section component
 */
function createPlayerCard(member, playerData, pronouns, timezone, formattedTime, showEmoji, displayMode = 'view', tribeData = null, guildId = null, allPlacements = {}, castlistName = 'default', navigationState = null) {
    // Check if member has a placement prefix (from alumni_placements sorting)
    const prefix = member.displayPrefix || '';
    const displayName = capitalize(member.displayName);
    const age = playerData?.age || '';
    const emoji = (showEmoji && playerData?.emojiCode) ? playerData.emojiCode : '';
    
    // Combine all info, filtering out empty values, including placement prefix
    const nameWithEmoji = emoji ? `${emoji} **${prefix}${displayName}**` : `**${prefix}${displayName}**`;
    
    // Build info array and filter out empty values
    const infoElements = [pronouns, age, timezone].filter(info => info && info.trim() !== '');
    const basicInfo = infoElements.length > 0 ? infoElements.join(' • ') : '';
    
    // Add time info if available
    const timeInfo = formattedTime ? `\`🕛 Local time 🕛\` ${formattedTime}` : '';
    
    // Add vanity roles if available
    let vanityRolesInfo = '';
    if (playerData?.vanityRoles && playerData.vanityRoles.length > 0) {
        const validVanityRoles = [];
        for (const roleId of playerData.vanityRoles) {
            try {
                // Try to find the role in the member's guild
                const role = member.guild.roles.cache.get(roleId);
                if (role) {
                    // Use Discord role mention format <@&roleId>
                    validVanityRoles.push(`<@&${roleId}>`);
                }
                // If role doesn't exist, silently skip it (graceful handling)
            } catch (error) {
                // Silently skip invalid roles
                console.debug(`Skipping invalid vanity role ${roleId} for player ${member.id}`);
            }
        }
        
        if (validVanityRoles.length > 0) {
            vanityRolesInfo = validVanityRoles.join(' ');
        }
    }
    
    // Combine all parts, only adding newlines where there's content
    let allInfo = nameWithEmoji;
    if (basicInfo) {
        allInfo += `\n${basicInfo}`;
    }
    if (timeInfo) {
        allInfo += `\n${timeInfo}`;
    }
    if (vanityRolesInfo) {
        allInfo += `\n${vanityRolesInfo}`;
    }

    // Create accessory based on display mode
    let accessory;
    if (displayMode === 'edit' && tribeData && guildId) {
        // Edit mode - create placement edit button (use pre-loaded placement data)
        const placement = allPlacements[member.user.id]?.placement;

        // Helper function for ordinal suffixes
        const getOrdinalLabel = (placement) => {
            if (!placement) return "Set Place";

            const num = typeof placement === 'number' ? placement : parseInt(placement);
            if (isNaN(num)) return "Set Place";

            // Handle special cases 11-13
            if (num % 100 >= 11 && num % 100 <= 13) {
                return `${num}th`;
            }

            // Standard ordinal rules
            switch (num % 10) {
                case 1: return `${num}st`;
                case 2: return `${num}nd`;
                case 3: return `${num}rd`;
                default: return `${num}th`;
            }
        };

        // 🔧 PHASE 0: Get season identifier for button context
        const seasonContext = tribeData?.castlistSettings?.seasonId || 'global';

        // 🔧 FIX: Encode full navigation state like nav buttons do
        // Format: edit_placement_{userId}_{seasonContext}_{castlistName}_{tribeIndex}_{tribePage}_{displayMode}
        const tribeIndex = navigationState?.currentTribeIndex ?? 0;
        const tribePage = navigationState?.currentTribePage ?? 0;

        accessory = {
            type: 2, // Button
            custom_id: `edit_placement_${member.user.id}_${seasonContext}_${castlistName}_${tribeIndex}_${tribePage}_${displayMode}`,
            label: getOrdinalLabel(placement),
            style: 2, // Secondary
            emoji: { name: "✏️" }
        };
    } else {
        // View mode - create thumbnail
        accessory = {
            type: 11, // Thumbnail
            media: {
                url: member.user.displayAvatarURL({ size: 128, extension: 'png' })
            },
            description: `${prefix}${displayName}'s avatar`
        };
    }

    return {
        type: 9, // Section component
        components: [
            {
                type: 10, // Text Display - single component with all info
                content: allInfo
            }
        ],
        accessory: accessory
    };
}

/**
 * Creates a tribe section with dynamic component optimization
 * @param {Object} tribe - Tribe data
 * @param {Array} tribeMembers - Array of Discord members in tribe
 * @param {Object} guild - Discord guild object
 * @param {Object} pronounRoleIds - Pronoun role mappings
 * @param {Object} timezones - Timezone role mappings
 * @param {Object} pageInfo - Page information for this tribe
 * @param {string} scenario - Display scenario ("ideal", "no-separators", "multi-page")
 * @param {string} castlistName - Name of the castlist
 * @param {string} displayMode - 'view' or 'edit' mode
 * @returns {Object} Tribe container component
 */
async function createTribeSection(tribe, tribeMembers, guild, pronounRoleIds, timezones, pageInfo, scenario, castlistName = 'default', displayMode = 'view', navigationState = null) {
    const { currentPage, totalPages, playersOnPage } = pageInfo;
    const pageMembers = playersOnPage;

    // Simplified: Always include separators - we paginate instead of removing separators
    const includeSeparators = true;
    console.log(`Tribe ${tribe.name}: ${playersOnPage.length} players (always with separators)`);

    // Load placement data ONCE if in edit mode (prevents repeated async calls in sync function)
    let allPlacements = {};
    if (displayMode === 'edit') {
        const playerDataAll = await loadPlayerData();

        // 🔧 PHASE 0: Get season context from tribe data (passed via castlistSettings from Phase 2)
        const seasonId = tribe.castlistSettings?.seasonId;

        // Determine placement namespace: season-specific or global fallback
        const placementNamespace = seasonId
            ? playerDataAll[guild.id]?.placements?.[seasonId]      // Season-specific
            : playerDataAll[guild.id]?.placements?.global;         // No Season fallback

        allPlacements = placementNamespace || {};
        console.log(`[PLACEMENT UI] Loading placements from namespace: ${seasonId || 'global'} (${Object.keys(allPlacements).length} placements found)`);
    }

    // Create header with proper format: Line 1 = castlist name, Line 2 = tribe info
    const castlistDisplay = castlistName !== 'default' ? `## ${castlistName} Castlist` : '## Castlist';
    const tribeHeaderText = `${tribe.emoji || ''} **${tribe.name}** ${tribe.emoji || ''}`.trim();
    const paginationText = totalPages > 1 ? ` \`${currentPage + 1}/${totalPages}\`` : '';

    // Add season name if available (for alumni placements with seasons)
    const seasonText = tribe.seasonName ? `\n📅 **Season:** ${tribe.seasonName}` : '';

    const combinedHeaderContent = `${castlistDisplay}\n${tribeHeaderText}${paginationText}${seasonText}`;

    // Create tribe header as simple Text Display (not Section to avoid accessory requirement)
    const tribeHeader = {
        type: 10, // Text Display component
        content: combinedHeaderContent
    };

    console.log('🔍 DEBUG: tribeHeader structure:', JSON.stringify(tribeHeader, null, 2));

    const playerCards = [];
    
    // Process each member into individual Section components with inline thumbnails
    for (const member of pageMembers) {
        // Get player pronouns (hide if none)
        const memberPronouns = member.roles.cache
            .filter(role => pronounRoleIds.includes(role.id))
            .map(role => role.name)
            .join(', ') || '';
            
        // Get player timezone role name and calculate current time
        let memberTimezone = '';
        let formattedTime = '';
        const timezoneRole = member.roles.cache.find(role => timezones[role.id]);
        
        if (timezoneRole) {
            memberTimezone = timezoneRole.name; // Show role name instead of UTC offset
            
            // Calculate current time in their timezone
            try {
                const offset = timezones[timezoneRole.id].offset;
                const now = new Date();
                const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
                const targetTime = new Date(utcTime + (offset * 3600000));
                formattedTime = targetTime.toLocaleTimeString('en-US', {
                    hour12: true,
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (error) {
                formattedTime = '';
            }
        }
        
        // Get player data from storage
        const playerData = await getPlayer(guild.id, member.id);
        
        // Create individual player card with inline thumbnail (no player emojis for castlist2)
        const playerCard = createPlayerCard(
            member,
            playerData,
            memberPronouns,
            memberTimezone,
            formattedTime,
            false, // Never show player emojis in castlist2
            displayMode,
            tribe, // Pass tribe data for edit button
            guild.id, // Pass guild ID for placement lookup
            allPlacements, // Pass pre-loaded placement data (edit mode only)
            castlistName, // Pass castlist name for button context
            navigationState // Pass navigation state for button context
        );
        
        playerCards.push(playerCard);
        
        // Add separator after each player except the last one (conditional based on scenario)
        if (includeSeparators && pageMembers.indexOf(member) < pageMembers.length - 1) {
            playerCards.push({
                type: 14 // Separator component
            });
        }
    }
    
    // Add install section after all players
    if (includeSeparators) {
        playerCards.push({
            type: 14 // Separator before install section
        });
    }
    
    // Create install action row (just the button, no text)
    const installActionRow = {
        type: 1, // ActionRow
        components: [
            {
                type: 2, // Button
                style: 5, // Link style
                label: "+Add to your ORG",
                url: `https://discord.com/oauth2/authorize?client_id=${process.env.APP_ID}&permissions=2684878912&integration_type=0&scope=bot+applications.commands`,
                emoji: {
                    name: "⬇️"
                }
            }
        ]
    };
    
    playerCards.push(installActionRow);

    // Convert hex color to integer if needed
    let accentColor = 0x7ED321; // Default green
    if (tribe.color) {
        if (typeof tribe.color === 'string' && tribe.color.startsWith('#')) {
            // Convert hex string to integer
            accentColor = parseInt(tribe.color.slice(1), 16);
        } else if (typeof tribe.color === 'number') {
            accentColor = tribe.color;
        }
    }

    const containerResult = {
        type: 17, // Container
        accent_color: accentColor,
        components: [
            tribeHeader,
            // Removed top separator to allow 8 players instead of 7
            ...playerCards
        ]
    };
    
    console.log('🔍 DEBUG: Final container components[0]:', JSON.stringify(containerResult.components[0], null, 2));
    
    return containerResult;
}

/**
 * Creates context-aware navigation buttons for complex tribe/page navigation
 * @param {Object} navigationState - Complete navigation state
 * @param {string} castlistName - Name of the castlist
 * @param {string} displayMode - Display mode ('view' or 'edit') to preserve across navigation
 * @returns {ActionRowBuilder} Action row with navigation buttons
 */
function createNavigationButtons(navigationState, castlistName, displayMode = 'view') {
    const { currentTribeIndex, currentTribePage, totalTribes, scenario, tribes } = navigationState;
    const currentTribe = tribes[currentTribeIndex];
    const row = new ActionRowBuilder();

    // Determine navigation context
    const isFirstTribe = currentTribeIndex === 0;
    const isLastTribe = currentTribeIndex === totalTribes - 1;
    const isFirstPageOfTribe = currentTribePage === 0;
    const isLastPageOfTribe = currentTribePage === currentTribe.totalPages - 1;
    const isMultiPageTribe = currentTribe.totalPages > 1;

    // Last button logic
    let lastLabel, lastDisabled, lastAction;
    if (isFirstTribe && isFirstPageOfTribe) {
        lastLabel = '◀ Last Tribe';
        lastDisabled = true;
        lastAction = 'disabled_last';
    } else if (isMultiPageTribe && !isFirstPageOfTribe) {
        lastLabel = '◀ Last Page';
        lastDisabled = false;
        lastAction = 'last_page';
    } else {
        lastLabel = '◀ Last Tribe';
        lastDisabled = false;
        lastAction = 'last_tribe';
    }

    // Next button logic
    let nextLabel, nextDisabled, nextAction;
    if (isLastTribe && isLastPageOfTribe) {
        nextLabel = 'Next Tribe ▶';
        nextDisabled = true;
        nextAction = 'disabled_next';
    } else if (isMultiPageTribe && !isLastPageOfTribe) {
        nextLabel = 'Next Page ▶';
        nextDisabled = false;
        nextAction = 'next_page';
    } else {
        nextLabel = 'Next Tribe ▶';
        nextDisabled = false;
        nextAction = 'next_tribe';
    }

    // Encode displayMode in custom_id to preserve edit mode across navigation
    // Format: castlist2_nav_${action}_${tribeIndex}_${tribePage}_${castlistName}_${displayMode}
    const lastButton = new ButtonBuilder()
        .setCustomId(`castlist2_nav_${lastAction}_${currentTribeIndex}_${currentTribePage}_${castlistName}_${displayMode}`)
        .setLabel("◀")
        .setStyle(lastDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(lastDisabled);

    const nextButton = new ButtonBuilder()
        .setCustomId(`castlist2_nav_${nextAction}_${currentTribeIndex}_${currentTribePage}_${castlistName}_${displayMode}`)
        .setLabel("▶")
        .setStyle(nextDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(nextDisabled);
    
    // Menu button (shows admin menu for admins, player menu for regular users)
    const manageProfileButton = new ButtonBuilder()
        .setCustomId("viral_menu")
        .setLabel("📋 Menu")
        .setStyle(ButtonStyle.Primary);
    
    row.addComponents(lastButton, manageProfileButton, nextButton);
    return row;
}

/**
 * Processes member data to extract pronouns, timezone, and player info
 * @param {Object} member - Discord guild member
 * @param {Array} pronounRoleIds - Array of pronoun role IDs
 * @param {Object} timezones - Timezone mappings
 * @param {string} guildId - Guild ID for player data lookup
 * @returns {Object} Processed member data
 */
async function processMemberData(member, pronounRoleIds, timezones, guildId) {
    // Extract pronouns
    const pronouns = member.roles.cache
        .filter(role => pronounRoleIds.includes(role.id))
        .map(role => role.name)
        .join(', ') || 'Unknown';
        
    // Extract timezone
    let timezone = 'Unknown';
    let formattedTime = '';
    const timezoneRole = member.roles.cache.find(role => timezones[role.id]);
    
    if (timezoneRole) {
        const offset = timezones[timezoneRole.id].offset;
        timezone = offset >= 0 ? `UTC+${offset}` : `UTC${offset}`;
        
        // Calculate current time
        try {
            const now = new Date();
            const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
            const targetTime = new Date(utcTime + (offset * 3600000));
            formattedTime = targetTime.toLocaleTimeString('en-US', {
                hour12: true,
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            formattedTime = '';
        }
    }
    
    // Get player data
    const playerData = await getPlayer(guildId, member.id);
    
    return {
        member,
        pronouns,
        timezone,
        formattedTime,
        playerData,
        age: playerData?.age || 'Unknown',
        emojiCode: playerData?.emojiCode
    };
}

/**
 * Creates the main castlist layout with Components V2
 * @param {Array} tribes - Array of tribe data
 * @param {string} castlistName - Name of the castlist
 * @param {Object} guild - Discord guild object
 * @param {Array} navigationRows - Action rows with navigation buttons
 * @param {Array} viralRows - Action rows with viral growth buttons
 * @param {Object} client - Discord client for bot avatar
 * @returns {Object} Complete Components V2 message structure
 */
function createCastlistV2Layout(tribes, castlistName, guild, navigationRows = [], viralRows = [], client = null) {
    const components = [];
    
    // Add all tribe containers (header now included in tribe)
    for (const tribeComponent of tribes) {
        components.push(tribeComponent);
    }
    
    // Manage profile button now integrated into navigation row - no separate row needed

    const finalComponents = [
        ...components,
        ...navigationRows
        // Removed separate manage profile row - now integrated into navigation
    ];

    // DEBUG: Count actual components
    const componentCount = countComponents(finalComponents);
    console.log(`🔍 ACTUAL COMPONENT COUNT: ${componentCount} components`);
    console.log(`   Tribe components: ${components.length}`);
    console.log(`   Navigation rows: ${navigationRows.length}`);
    console.log(`   Manage profile row: 1`);
    
    // DEBUG: JSON dump removed to avoid spam
    
    if (componentCount > 40) {
        console.error(`❌ COMPONENT LIMIT EXCEEDED: ${componentCount}/40 components`);
    }

    // Add super detailed debugging
    console.log('🔍 FINAL MESSAGE STRUCTURE:');
    console.log('finalComponents[0]:', JSON.stringify(finalComponents[0], null, 2));
    
    return {
        flags: 1 << 15, // IS_COMPONENTS_V2 flag
        components: finalComponents
    };
}

// DEBUG: Component counting function
function countComponents(components) {
    let count = 0;
    
    const typeNames = {
        1: 'ActionRow',
        2: 'Button', 
        9: 'Section',
        10: 'TextDisplay',
        11: 'Thumbnail',
        14: 'Separator',
        17: 'Container'
    };
    
    function countRecursive(items, depth = 0) {
        if (!Array.isArray(items)) return;
        
        for (const item of items) {
            count++; // Count the item itself
            const indent = '  '.repeat(depth);
            const typeName = typeNames[item.type] || `Unknown(${item.type})`;
            const hasAccessory = item.accessory ? ' [HAS ACCESSORY]' : '';
            console.log(`${indent}${count}. ${typeName}${hasAccessory}`);
            
            // Show accessory details if present
            if (item.accessory && depth < 3) {
                const accessoryType = typeNames[item.accessory.type] || `Unknown(${item.accessory.type})`;
                console.log(`${indent}   └─ Accessory: ${accessoryType}`);
            }
            
            // Recursively count nested components
            if (item.components) {
                countRecursive(item.components, depth + 1);
            }
        }
    }
    
    console.log('📋 DETAILED COMPONENT BREAKDOWN:');
    countRecursive(components);
    return count;
}

/**
 * Extract castlist data from guild tribes for UI components
 * @param {Object} playerData - Guild player data
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Object containing allCastlists Set and castlistTribes mapping
 */
function extractCastlistData(playerData, guildId) {
    const allCastlists = new Set();
    const castlistTribes = {}; // Track tribes per castlist to get emojis
    
    if (playerData[guildId]?.tribes) {
        Object.entries(playerData[guildId].tribes).forEach(([roleId, tribeData]) => {
            if (!tribeData) return; // Skip null/undefined tribe entries
            const castlistName = tribeData.castlist || 'default';
            allCastlists.add(castlistName);
            
            // Store tribe info for each castlist (for emojis)
            if (!castlistTribes[castlistName]) {
                castlistTribes[castlistName] = [];
            }
            castlistTribes[castlistName].push({
                roleId,
                emoji: tribeData.emoji
            });
        });
    }
    
    return { allCastlists, castlistTribes };
}

/**
 * Create castlist button rows with pagination to handle Discord's 5-button ActionRow limit
 * @param {Set} allCastlists - Set of all castlist names
 * @param {Object} castlistTribes - Mapping of castlists to their tribe data
 * @param {boolean} includeAddButton - Whether to include the "+" button for adding castlists
 * @returns {Array} Array of ActionRow JSON objects
 */
function createCastlistRows(allCastlists, castlistTribes, includeAddButton = true, hasStores = false) {
    const castlistButtons = [];
    
    // Add default castlist button
    castlistButtons.push(
        new ButtonBuilder()
            .setCustomId('show_castlist2_default')
            .setLabel('Show Castlist')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋')
    );
    
    // Add buttons for custom castlists (sorted alphabetically, excluding "default")
    const customCastlists = Array.from(allCastlists)
        .filter(name => name !== 'default')
        .sort();
        
    for (const castlistName of customCastlists) {
        // Get emoji from first tribe with an emoji in this castlist
        const tribesInCastlist = castlistTribes[castlistName] || [];
        const emojiTribe = tribesInCastlist.find(tribe => tribe.emoji);
        const emoji = emojiTribe?.emoji || '📋';
        
        castlistButtons.push(
            new ButtonBuilder()
                .setCustomId(`show_castlist2_${castlistName}`)
                .setLabel(castlistName)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(emoji)
        );
    }
    
    // Plus button removed - no longer needed
    
    // Split buttons into rows of max 5 buttons each
    const rows = [];
    const maxButtonsPerRow = 5;
    
    for (let i = 0; i < castlistButtons.length; i += maxButtonsPerRow) {
        const rowButtons = castlistButtons.slice(i, i + maxButtonsPerRow);
        const row = new ActionRowBuilder().addComponents(rowButtons);
        rows.push(row.toJSON());
    }
    
    return rows;
}

/**
 * Build complete castlist response data with navigation
 * This is the main assembly function that orchestrates all display components
 * @param {Object} guild - Discord guild object
 * @param {Array} tribes - Array of tribe data with members
 * @param {string} castlistName - Name of the castlist
 * @param {Object} navigationState - Navigation state object
 * @param {Object} member - Discord member object for permission checking (optional)
 * @param {string} channelId - Channel ID for permission checking (optional)
 * @param {Function} permissionChecker - Optional function to check send permissions
 * @returns {Object} Response data ready to send
 */
export async function buildCastlist2ResponseData(guild, tribes, castlistName, navigationState, member = null, channelId = null, permissionChecker = null, displayMode = 'view') {
  const { currentTribeIndex, currentTribePage, scenario } = navigationState;
  const currentTribe = tribes[currentTribeIndex];

  // Get guild data for processing
  const pronounRoleIds = await getGuildPronouns(guild.id);
  const timezones = await getGuildTimezones(guild.id);

  // Calculate page info for current tribe
  let pageInfo;
  if (scenario === "multi-page" && currentTribe.memberCount > 0) {
    const paginationData = calculateTribePages(currentTribe, currentTribe.members, true);
    const currentPageMembers = paginationData.pages[currentTribePage] || [];

    pageInfo = {
      currentPage: currentTribePage,
      totalPages: paginationData.totalPages,
      playersOnPage: currentPageMembers
    };
  } else {
    // Single page tribe or ideal/no-separators scenario
    const sortedMembers = sortCastlistMembers([...currentTribe.members], currentTribe);

    pageInfo = {
      currentPage: 0,
      totalPages: 1,
      playersOnPage: sortedMembers
    };
  }

  // Create tribe section with current page
  let tribeSection;
  if (currentTribe.memberCount === 0) {
    // Empty tribe handling
    let accentColor = 0x7ED321;
    if (currentTribe.color) {
      if (typeof currentTribe.color === 'string' && currentTribe.color.startsWith('#')) {
        accentColor = parseInt(currentTribe.color.slice(1), 16);
      } else if (typeof currentTribe.color === 'number') {
        accentColor = currentTribe.color;
      }
    }

    tribeSection = {
      type: 17, // Container
      accent_color: accentColor,
      components: [
        { type: 10, content: `# ${currentTribe.emoji || ''} ${currentTribe.name} ${currentTribe.emoji || ''}`.trim() },
        { type: 14 }, // Separator
        { type: 10, content: 'No members in this tribe yet!' }
      ]
    };
  } else {
    // Create full tribe display
    tribeSection = await createTribeSection(
      currentTribe,
      pageInfo.playersOnPage,
      guild,
      pronounRoleIds,
      timezones,
      pageInfo,
      scenario,
      castlistName,
      displayMode,
      navigationState // Pass navigation state for placement button context
    );
  }

  // Create navigation buttons (now includes viral growth buttons)
  const navigationRow = createNavigationButtons(navigationState, castlistName, displayMode);

  // Create complete layout
  const responseData = createCastlistV2Layout(
    [tribeSection],
    castlistName,
    guild,
    [navigationRow.toJSON()],
    [], // No separate viral buttons needed
    null // Client not needed here
  );

  console.log(`Preparing castlist2 response: Tribe ${currentTribeIndex + 1}/${tribes.length}, Page ${currentTribePage + 1}/${pageInfo.totalPages}, Scenario: ${scenario}`);

  // Check permissions and apply ephemeral flag if user cannot send messages
  if (member && channelId && permissionChecker) {
    const canSendMessages = await permissionChecker(member, channelId);
    console.log(`Permission check: User ${member.user?.username} can send messages in channel ${channelId}: ${canSendMessages}`);

    if (!canSendMessages) {
      // Add ephemeral flag to response if user cannot send messages
      responseData.flags = (responseData.flags || 0) | InteractionResponseFlags.EPHEMERAL;
      console.log(`Applied ephemeral flag - castlist visible only to user ${member.user?.username}`);
    }
  }

  return responseData;
}

export {
    calculateComponentsForTribe,
    determineDisplayScenario,
    calculateTribePages,
    createNavigationState,
    reorderTribes,
    createPlayerCard,
    createTribeSection,
    createNavigationButtons,
    processMemberData,
    createCastlistV2Layout,
    extractCastlistData,
    createCastlistRows
};