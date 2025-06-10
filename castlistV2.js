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
    getPlayer 
} from './storage.js';
import { capitalize } from './utils.js';

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
    const playerComponents = playerCount * 2; // Section + TextDisplay per player (Thumbnail is accessory)
    const separatorCount = includeSeparators ? Math.max(0, playerCount - 1) : 0;
    // Tribe overhead: Container + Header Section (install button is accessory, doesn't count) + Separator = 3 components
    const tribeOverhead = 3; // Container + Header Section + Separator (button is accessory)
    const messageOverhead = 0; // No ad text - removed completely
    // Navigation: ActionRow (1) + 3 buttons (3) = 4 components
    // Manage Profile: ActionRow (1) + 1 button (1) = 2 components
    const navigationOverhead = 6; // Navigation ActionRow + buttons + Manage Profile ActionRow + button
    
    return playerComponents + separatorCount + tribeOverhead + messageOverhead + navigationOverhead;
}

/**
 * Determine display scenario based on component limits
 * @param {Array} tribes - Array of tribe data with member counts
 * @returns {string} Scenario type: "ideal", "no-separators", or "multi-page"
 */
function determineDisplayScenario(tribes) {
    const COMPONENT_LIMIT = 40;
    
    // Scenario 1: Check if all tribes fit with separators
    const allTribesWithSeparators = tribes.every(tribe => 
        calculateComponentsForTribe(tribe.memberCount, true) <= COMPONENT_LIMIT
    );
    if (allTribesWithSeparators) {
        console.log('Display scenario: ideal (all tribes fit with separators)');
        return "ideal";
    }
    
    // Scenario 2: Check if removing separators fixes all tribes
    const allTribesWithoutSeparators = tribes.every(tribe => 
        calculateComponentsForTribe(tribe.memberCount, false) <= COMPONENT_LIMIT
    );
    if (allTribesWithoutSeparators) {
        console.log('Display scenario: no-separators (removing separators fixes all tribes)');
        return "no-separators";
    }
    
    // Scenario 3: Multi-page required
    console.log('Display scenario: multi-page (at least one tribe needs pagination)');
    return "multi-page";
}

/**
 * Calculate pagination for a tribe that exceeds component limits
 * @param {Object} tribe - Tribe data
 * @param {Array} members - Array of Discord members
 * @param {boolean} includeSeparators - Whether to include separators
 * @returns {Object} Pagination information
 */
function calculateTribePages(tribe, members, includeSeparators = true) {
    const COMPONENT_LIMIT = 40;
    const baseOverhead = 3 + 2 + 3; // tribe + message + navigation
    
    const availableForPlayers = COMPONENT_LIMIT - baseOverhead;
    const componentsPerPlayer = includeSeparators ? 4 : 3; // +1 for separator if included
    
    const maxPlayersPerPage = Math.floor(availableForPlayers / componentsPerPlayer);
    const totalPages = Math.ceil(members.length / maxPlayersPerPage);
    
    // Distribute players across pages (higher count on first page for odd distributions)
    const pages = [];
    let remainingMembers = [...members];
    
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        const remainingPages = totalPages - pageIndex;
        const membersForThisPage = Math.ceil(remainingMembers.length / remainingPages);
        
        pages.push(remainingMembers.slice(0, membersForThisPage));
        remainingMembers = remainingMembers.slice(membersForThisPage);
    }
    
    console.log(`Tribe ${tribe.name}: ${members.length} players across ${totalPages} pages`);
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
                calculateTribePages(tribe, tribe.members, true).totalPages : 1
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
 * @returns {Object} Player card section component
 */
function createPlayerCard(member, playerData, pronouns, timezone, formattedTime, showEmoji) {
    const displayName = capitalize(member.displayName);
    const age = playerData?.age || '';
    const emoji = (showEmoji && playerData?.emojiCode) ? playerData.emojiCode : '';
    
    // Combine all info, filtering out empty values
    const nameWithEmoji = emoji ? `${emoji} **${displayName}**` : `**${displayName}**`;
    
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

    return {
        type: 9, // Section component
        components: [
            {
                type: 10, // Text Display - single component with all info
                content: allInfo
            }
        ],
        // TEMPORARILY DISABLED for debugging
        // accessory: {
        //     type: 11, // Thumbnail
        //     media: {
        //         url: member.user.displayAvatarURL({ size: 128, extension: 'png' })
        //     },
        //     description: `${displayName}'s avatar`
        // }
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
 * @returns {Object} Tribe container component
 */
async function createTribeSection(tribe, tribeMembers, guild, pronounRoleIds, timezones, pageInfo, scenario, castlistName = 'default') {
    const { currentPage, totalPages, playersOnPage } = pageInfo;
    const pageMembers = playersOnPage;
    
    // Determine if separators should be included for this specific tribe
    // Check if this tribe fits with separators, regardless of global scenario
    const thisTribeWithSeparators = calculateComponentsForTribe(playersOnPage.length, true);
    const thisTribeWithoutSeparators = calculateComponentsForTribe(playersOnPage.length, false);
    
    let includeSeparators;
    if (thisTribeWithSeparators <= 40) {
        includeSeparators = true; // Tribe fits with separators
        console.log(`Tribe ${tribe.name}: ${playersOnPage.length} players = ${thisTribeWithSeparators} components (WITH separators)`);
    } else if (thisTribeWithoutSeparators <= 40) {
        includeSeparators = false; // Remove separators for this tribe
        console.log(`Tribe ${tribe.name}: ${playersOnPage.length} players = ${thisTribeWithoutSeparators} components (WITHOUT separators)`);
    } else {
        includeSeparators = false; // Still won't fit, but try without separators
        console.log(`Tribe ${tribe.name}: ${playersOnPage.length} players = ${thisTribeWithoutSeparators} components (STILL TOO BIG)`);
    }
    
    // Create header with just castlist name and tribe info
    const castlistDisplay = castlistName !== 'default' ? `## ${castlistName} Castlist` : '## Castlist';
    const tribeHeaderText = `${tribe.emoji || ''} **${tribe.name}** ${tribe.emoji || ''}`.trim();
    const paginationText = totalPages > 1 ? ` \`${currentPage + 1}/${totalPages}\`` : '';
    
    const combinedHeaderContent = `${castlistDisplay}\n${tribeHeaderText}${paginationText}`;
    
    // Create tribe header as Section with install button accessory
    const tribeHeader = {
        type: 9, // Section component
        components: [
            {
                type: 10, // Text Display
                content: combinedHeaderContent
            }
        ],
        // TEMPORARILY DISABLED for debugging
        // accessory: {
        //     type: 2, // Button
        //     style: 5, // Link style
        //     label: "+Install CastBot",
        //     url: `https://discord.com/oauth2/authorize?client_id=${process.env.APP_ID}&permissions=2684878912&integration_type=0&scope=bot+applications.commands`
        // }
    };
    
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
            false // Never show player emojis in castlist2
        );
        
        playerCards.push(playerCard);
        
        // Add separator after each player except the last one (conditional based on scenario)
        if (includeSeparators && pageMembers.indexOf(member) < pageMembers.length - 1) {
            playerCards.push({
                type: 14 // Separator component
            });
        }
    }
    
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

    return {
        type: 17, // Container
        accent_color: accentColor,
        components: [
            tribeHeader,
            {
                type: 14 // Separator after tribe name
            },
            ...playerCards
        ]
    };
}

/**
 * Creates context-aware navigation buttons for complex tribe/page navigation
 * @param {Object} navigationState - Complete navigation state
 * @param {string} castlistName - Name of the castlist
 * @returns {ActionRowBuilder} Action row with navigation buttons
 */
function createNavigationButtons(navigationState, castlistName) {
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
    
    // Create buttons
    const lastButton = new ButtonBuilder()
        .setCustomId(`castlist2_nav_${lastAction}_${currentTribeIndex}_${currentTribePage}_${castlistName}`)
        .setLabel(lastLabel)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(lastDisabled);
    
    const nextButton = new ButtonBuilder()
        .setCustomId(`castlist2_nav_${nextAction}_${currentTribeIndex}_${currentTribePage}_${castlistName}`)
        .setLabel(nextLabel)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(nextDisabled);
    
    // Page indicator - show only tribe context (page info is in header)
    const indicatorLabel = `Tribe ${currentTribeIndex + 1}/${totalTribes}`;
    
    const pageIndicator = new ButtonBuilder()
        .setCustomId(`castlist2_indicator_${currentTribeIndex}_${currentTribePage}`)
        .setLabel(indicatorLabel)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true);
    
    row.addComponents(lastButton, pageIndicator, nextButton);
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
    
    // Create manage profile button in separate ActionRow
    const manageProfileRow = {
        type: 1, // ActionRow
        components: [
            {
                type: 2, // Button
                style: 1, // Primary
                label: "📇 Manage Profile",
                custom_id: "viral_menu"
            }
        ]
    };

    const finalComponents = [
        ...components,
        ...navigationRows,
        manageProfileRow
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

    return {
        flags: 1 << 15, // IS_COMPONENTS_V2 flag
        components: finalComponents
    };
}

// DEBUG: Component counting function
function countComponents(components) {
    let count = 0;
    
    function countRecursive(items, depth = 0) {
        if (!Array.isArray(items)) return;
        
        for (const item of items) {
            count++; // Count the item itself
            const indent = '  '.repeat(depth);
            console.log(`${indent}Component ${count}: type ${item.type}`);
            
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
    createCastlistV2Layout
};