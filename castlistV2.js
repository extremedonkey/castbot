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
    const allInfo = `${nameWithEmoji}\n${pronouns} • ${age} • ${timezone}${formattedTime ? ` • ${formattedTime}` : ''}`;

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
 * Creates a simplified tribe section optimized for 40 component limit
 * Uses Media Gallery for avatars and a single text block for all players
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
    
    const totalPages = Math.ceil(tribeMembers.length / playersPerPage);
    
    // Create tribe header
    const tribeHeaderText = `${tribe.emoji || ''} **${tribe.name}** ${tribe.emoji || ''}`.trim();
    const paginationText = totalPages > 1 ? ` (Page ${page + 1} of ${totalPages})` : '';
    
    const tribeHeader = {
        type: 10, // Text Display
        content: `# ${tribeHeaderText}${paginationText}`
    };
    
    // Create avatars for Media Gallery
    const avatarGalleryItems = [];
    let playerListText = '';
    
    // Process each member
    for (let i = 0; i < pageMembers.length; i++) {
        const member = pageMembers[i];
        
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
        const displayName = capitalize(member.displayName);
        const age = playerData?.age || 'Unknown';
        const emoji = (tribe.showPlayerEmojis !== false && playerData?.emojiCode) ? playerData.emojiCode : '';
        
        // Add to avatar gallery
        avatarGalleryItems.push({
            media: {
                url: member.user.displayAvatarURL({ size: 256, extension: 'png' })
            },
            description: `${displayName}'s avatar`
        });
        
        // Add to player list text
        const nameWithEmoji = emoji ? `${emoji} **${displayName}**` : `**${displayName}**`;
        const details = `${memberPronouns} • ${age} • ${memberTimezone}${formattedTime ? ` • ${formattedTime}` : ''}`;
        playerListText += `${nameWithEmoji}\n${details}\n\n`;
    }
    
    // Remove last extra newlines
    playerListText = playerListText.trim();
    
    const components = [tribeHeader];
    
    // Add Media Gallery for avatars
    if (avatarGalleryItems.length > 0) {
        components.push({
            type: 12, // Media Gallery
            items: avatarGalleryItems
        });
    }
    
    // Add consolidated player text
    if (playerListText) {
        components.push({
            type: 10, // Text Display
            content: playerListText
        });
    }
    
    return {
        type: 17, // Container
        accent_color: tribe.color || 0x7ED321,
        components: components
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
    
    // Simplified header - combine title and subtitle to save components
    const headerText = castlistName !== 'default' 
        ? `# ${guild.name} - ${castlistName} Castlist\n_Interactive castlist with player thumbnails_` 
        : `# ${guild.name} - Castlist\n_Interactive castlist with player thumbnails_`;
    
    components.push({
        type: 10, // Text Display
        content: headerText
    });
    
    // Add all tribe containers directly without separators to save components
    for (const tribeComponent of tribes) {
        components.push(tribeComponent);
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