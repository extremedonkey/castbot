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
    const playerComponents = playerCount * 3; // Section + TextDisplay + Thumbnail per player
    const separatorCount = includeSeparators ? Math.max(0, playerCount - 1) : 0;
    const tribeOverhead = 3; // Container + Header + Separator
    const messageOverhead = 2; // Main header + Ad
    const navigationOverhead = 3; // Navigation buttons
    
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
 * Reorder tribes based on strategy (infrastructure for future user-first feature)
 * @param {Array} tribes - Array of tribe data
 * @param {string} userId - User ID for user-first ordering
 * @param {string} strategy - Ordering strategy
 * @returns {Array} Reordered tribes
 */
function reorderTribes(tribes, userId = null, strategy = "default") {
    switch(strategy) {
        case "user-first":
            // TODO: Implement user-first ordering (not activated yet)
            console.log('User-first ordering infrastructure ready (not activated)');
            return tribes;
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
 * @param {string} pronouns - Formatted pronouns string
 * @param {string} timezone - Formatted timezone string
 * @param {string} formattedTime - Current time in player's timezone
 * @param {boolean} showEmoji - Whether to display player emoji
 * @returns {Object} Player card section component
 */
function createPlayerCard(member, playerData, pronouns, timezone, formattedTime, showEmoji) {
    const displayName = capitalize(member.displayName);
    const age = playerData?.age || 'Unknown';
    const emoji = (showEmoji && playerData?.emojiCode) ? playerData.emojiCode : '';
    
    // Combine all info into a single text component to save component count
    const nameWithEmoji = emoji ? `${emoji} **${displayName}**` : `**${displayName}**`;
    const basicInfo = `${pronouns} • ${age} • ${timezone}`;
    const timeInfo = formattedTime ? `\`🕛 Local time 🕛\` ${formattedTime}` : '';
    const allInfo = timeInfo ? `${nameWithEmoji}\n${basicInfo}\n${timeInfo}` : `${nameWithEmoji}\n${basicInfo}`;

    return {
        type: 9, // Section component
        components: [
            {
                type: 10, // Text Display - single component with all info
                content: allInfo
            }
        ],
        accessory: {
            type: 11, // Thumbnail
            media: {
                url: member.user.displayAvatarURL({ size: 128, extension: 'png' })
            },
            description: `${displayName}'s avatar`
        }
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
async function createTribeSection(tribe, tribeMembers, guild, pronounRoleIds, timezones, pageInfo, scenario) {
    const { currentPage, totalPages, playersOnPage } = pageInfo;
    const pageMembers = playersOnPage;
    
    // Determine if separators should be included
    const includeSeparators = scenario !== "no-separators";
    
    // Create tribe header with page info for multi-page tribes
    const tribeHeaderText = `${tribe.emoji || ''} **${tribe.name}** ${tribe.emoji || ''}`.trim();
    const paginationText = totalPages > 1 ? ` (${currentPage + 1}/${totalPages})` : '';
    
    const tribeHeader = {
        type: 10, // Text Display
        content: `# ${tribeHeaderText}${paginationText}`
    };
    
    const playerCards = [];
    
    // Process each member into individual Section components with inline thumbnails
    for (const member of pageMembers) {
        // Get player pronouns
        const memberPronouns = member.roles.cache
            .filter(role => pronounRoleIds.includes(role.id))
            .map(role => role.name)
            .join(', ') || 'Unknown';
            
        // Get player timezone and calculate current time
        let memberTimezone = 'Unknown';
        let formattedTime = '';
        const timezoneRole = member.roles.cache.find(role => timezones[role.id]);
        
        if (timezoneRole) {
            const offset = timezones[timezoneRole.id].offset;
            memberTimezone = offset >= 0 ? `UTC+${offset}` : `UTC${offset}`;
            
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
        lastAction = 'disabled';
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
        nextAction = 'disabled';
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
    
    // Page indicator - show tribe/page context
    let indicatorLabel;
    if (scenario === "multi-page" && isMultiPageTribe) {
        indicatorLabel = `Tribe ${currentTribeIndex + 1}/${totalTribes} • Page ${currentTribePage + 1}/${currentTribe.totalPages}`;
    } else {
        indicatorLabel = `Tribe ${currentTribeIndex + 1}/${totalTribes}`;
    }
    
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
 * @param {Object} client - Discord client for bot avatar
 * @returns {Object} Complete Components V2 message structure
 */
function createCastlistV2Layout(tribes, castlistName, guild, navigationRows = [], client = null) {
    const components = [];
    
    // Large header text using markdown formatting
    const headerText = castlistName !== 'default' 
        ? `# ${guild.name} ${castlistName} Castlist` 
        : `# ${guild.name} Castlist`;
    
    components.push({
        type: 10, // Text Display
        content: headerText
    });
    
    // Add all tribe containers with separators after tribe names
    for (const tribeComponent of tribes) {
        components.push(tribeComponent);
    }
    
    // Create clean CastBot ad (no image)
    const adComponent = {
        type: 10, // Text Display
        content: '_Click on CastBot and click \'+Add App\' to use in your ORG!_'
    };

    return {
        flags: 1 << 15, // IS_COMPONENTS_V2 flag
        components: [
            ...components,
            ...navigationRows,
            // Add CastBot ad after navigation buttons
            adComponent
        ]
    };
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