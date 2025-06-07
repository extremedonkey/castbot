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
 */

/**
 * Creates a player card section using Components V2 Section component
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
    
    const nameWithEmoji = emoji ? `${emoji} **${displayName}**` : `**${displayName}**`;
    const details = `${pronouns} • ${age} • ${timezone}${formattedTime ? ` • ${formattedTime}` : ''}`;

    return {
        type: 9, // Section component
        components: [
            {
                type: 10, // Text Display
                content: nameWithEmoji
            },
            {
                type: 10, // Text Display  
                content: details
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
 * Creates a tribe container with player cards for Components V2
 * @param {Object} tribe - Tribe data
 * @param {Array} tribeMembers - Array of Discord members in tribe
 * @param {Object} guild - Discord guild object
 * @param {Object} pronounRoleIds - Pronoun role mappings
 * @param {Object} timezones - Timezone role mappings
 * @param {number} page - Current page (0-based)
 * @param {number} playersPerPage - Number of players per page (max 10)
 * @returns {Object} Tribe container component
 */
async function createTribeSection(tribe, tribeMembers, guild, pronounRoleIds, timezones, page = 0, playersPerPage = 10) {
    const startIndex = page * playersPerPage;
    const endIndex = Math.min(startIndex + playersPerPage, tribeMembers.length);
    const pageMembers = tribeMembers.slice(startIndex, endIndex);
    
    const playerCards = [];
    const totalPages = Math.ceil(tribeMembers.length / playersPerPage);
    
    // Create tribe header
    const tribeHeaderText = `${tribe.emoji || ''} **${tribe.name}** ${tribe.emoji || ''}`.trim();
    const paginationText = totalPages > 1 ? ` (Page ${page + 1} of ${totalPages})` : '';
    
    const tribeHeader = {
        type: 10, // Text Display
        content: `# ${tribeHeaderText}${paginationText}`
    };
    
    // Process each member into a player card
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
        
        // Create player card section
        const playerCard = createPlayerCard(
            member, 
            playerData, 
            memberPronouns, 
            memberTimezone,
            formattedTime,
            tribe.showPlayerEmojis !== false
        );
        
        playerCards.push(playerCard);
    }
    
    // Add separator between players if more than one
    const componentsWithSeparators = [];
    for (let i = 0; i < playerCards.length; i++) {
        componentsWithSeparators.push(playerCards[i]);
        
        // Add separator between players (but not after the last one)
        if (i < playerCards.length - 1) {
            componentsWithSeparators.push({
                type: 14, // Separator
                divider: false,
                spacing: 1
            });
        }
    }
    
    return {
        type: 17, // Container
        accent_color: tribe.color || 0x7ED321,
        components: [
            tribeHeader,
            {
                type: 14, // Separator after header
                divider: true,
                spacing: 1
            },
            ...componentsWithSeparators
        ]
    };
}

/**
 * Creates navigation buttons for pagination
 * @param {string} tribeId - Tribe role ID for button identification
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 * @param {string} castlistName - Name of the castlist
 * @returns {ActionRowBuilder} Action row with navigation buttons
 */
function createNavigationButtons(tribeId, currentPage, totalPages, castlistName) {
    const row = new ActionRowBuilder();
    
    // Previous button
    const prevButton = new ButtonBuilder()
        .setCustomId(`castlist2_prev_${tribeId}_${currentPage}_${castlistName}`)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0);
    
    // Next button  
    const nextButton = new ButtonBuilder()
        .setCustomId(`castlist2_next_${tribeId}_${currentPage}_${castlistName}`)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= totalPages - 1);
        
    // Page indicator (non-interactive)
    const pageIndicator = new ButtonBuilder()
        .setCustomId(`castlist2_page_${tribeId}_${currentPage}`)
        .setLabel(`${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true);
    
    row.addComponents(prevButton, pageIndicator, nextButton);
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
 * @returns {Object} Complete Components V2 message structure
 */
function createCastlistV2Layout(tribes, castlistName, guild, navigationRows = []) {
    const components = [];
    
    // Add main header
    const headerText = castlistName !== 'default' 
        ? `# ${guild.name} - ${castlistName} Castlist` 
        : `# ${guild.name} - Castlist`;
    
    components.push({
        type: 10, // Text Display
        content: headerText
    });
    
    // Add subtitle
    components.push({
        type: 10, // Text Display  
        content: '_Modern interactive castlist with player thumbnails_'
    });
    
    // Add separator
    components.push({
        type: 14, // Separator
        divider: true,
        spacing: 2
    });
    
    // Add all tribe containers
    for (const tribeComponent of tribes) {
        components.push(tribeComponent);
        
        // Add spacer between tribes
        components.push({
            type: 14, // Separator
            divider: false,
            spacing: 2
        });
    }
    
    // Remove last spacer if any tribes were added
    if (tribes.length > 0) {
        components.pop();
    }
    
    return {
        flags: 1 << 15, // IS_COMPONENTS_V2 flag
        components: [
            ...components,
            ...navigationRows
        ]
    };
}

export {
    createPlayerCard,
    createTribeSection, 
    createNavigationButtons,
    processMemberData,
    createCastlistV2Layout
};