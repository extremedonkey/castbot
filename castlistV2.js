import { 
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
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
 * Creates a player card component for Components V2 display
 * @param {Object} member - Discord guild member
 * @param {Object} playerData - Player data from storage (age, emoji, etc.)
 * @param {string} pronouns - Formatted pronouns string
 * @param {string} timezone - Formatted timezone string
 * @param {boolean} showEmoji - Whether to display player emoji
 * @returns {Object} Player card component structure
 */
function createPlayerCard(member, playerData, pronouns, timezone, showEmoji) {
    const displayName = capitalize(member.displayName);
    const age = playerData?.age || 'Unknown';
    const emoji = (showEmoji && playerData?.emojiCode) ? playerData.emojiCode : '';
    
    // Get current time in player's timezone
    let formattedTime = '';
    if (timezone !== 'Unknown') {
        try {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', {
                timeZone: timezone.includes('UTC') ? undefined : timezone,
                hour12: true,
                hour: '2-digit',
                minute: '2-digit'
            });
            formattedTime = ` (${timeString})`;
        } catch (error) {
            formattedTime = '';
        }
    }

    return {
        type: 'row', // Components V2 row container
        components: [
            {
                type: 'image',
                url: member.user.displayAvatarURL({ size: 64, extension: 'png' }),
                width: 64,
                height: 64,
                style: 'thumbnail'
            },
            {
                type: 'container',
                style: 'vertical',
                components: [
                    {
                        type: 'text',
                        content: `${emoji}${emoji ? ' ' : ''}**${displayName}**`,
                        style: 'heading'
                    },
                    {
                        type: 'text',
                        content: `${pronouns} • ${age} • ${timezone}${formattedTime}`,
                        style: 'body'
                    }
                ]
            }
        ]
    };
}

/**
 * Creates a tribe section with player cards
 * @param {Object} tribe - Tribe data
 * @param {Array} tribeMembers - Array of Discord members in tribe
 * @param {Object} guild - Discord guild object
 * @param {Object} pronounRoleIds - Pronoun role mappings
 * @param {Object} timezones - Timezone role mappings
 * @param {number} page - Current page (0-based)
 * @param {number} playersPerPage - Number of players per page (max 10)
 * @returns {Object} Tribe section component
 */
async function createTribeSection(tribe, tribeMembers, guild, pronounRoleIds, timezones, page = 0, playersPerPage = 10) {
    const startIndex = page * playersPerPage;
    const endIndex = Math.min(startIndex + playersPerPage, tribeMembers.length);
    const pageMembers = tribeMembers.slice(startIndex, endIndex);
    
    const playerCards = [];
    
    for (const member of pageMembers) {
        // Get player pronouns
        const memberPronouns = member.roles.cache
            .filter(role => pronounRoleIds.includes(role.id))
            .map(role => role.name)
            .join(', ') || 'Unknown';
            
        // Get player timezone
        let memberTimezone = 'Unknown';
        const timezoneRole = member.roles.cache.find(role => timezones[role.id]);
        if (timezoneRole) {
            const offset = timezones[timezoneRole.id].offset;
            memberTimezone = offset >= 0 ? `UTC+${offset}` : `UTC${offset}`;
        }
        
        // Get player data from storage
        const playerData = await getPlayer(guild.id, member.id);
        
        // Create player card
        const playerCard = createPlayerCard(
            member, 
            playerData, 
            memberPronouns, 
            memberTimezone, 
            tribe.showPlayerEmojis !== false
        );
        
        playerCards.push(playerCard);
    }
    
    // Create tribe header
    const tribeHeader = {
        type: 'text',
        content: `${tribe.emoji || ''} **${tribe.name}** ${tribe.emoji || ''}`.trim(),
        style: 'heading'
    };
    
    // Create pagination info if needed
    const totalPages = Math.ceil(tribeMembers.length / playersPerPage);
    const paginationInfo = totalPages > 1 ? {
        type: 'text',
        content: `Page ${page + 1} of ${totalPages}`,
        style: 'caption'
    } : null;
    
    return {
        type: 'container',
        style: 'vertical',
        components: [
            tribeHeader,
            ...(paginationInfo ? [paginationInfo] : []),
            {
                type: 'container',
                style: 'vertical',
                components: playerCards
            }
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
 * Creates a fallback embed for when no Components V2 support is available
 * @param {Array} tribes - Processed tribe data
 * @param {string} castlistName - Name of the castlist
 * @param {Object} guild - Discord guild object
 * @returns {EmbedBuilder} Fallback embed
 */
function createFallbackEmbed(tribes, castlistName, guild) {
    const embed = new EmbedBuilder()
        .setTitle(`CastBot: Dynamic Castlist${castlistName !== 'default' ? ` (${castlistName})` : ''}`)
        .setAuthor({ 
            name: guild.name, 
            iconURL: guild.iconURL() 
        })
        .setColor('#7ED321')
        .setFooter({ 
            text: 'Your client may not support Components V2. Try /castlist for the classic view.',
        });
        
    if (tribes.length === 0) {
        embed.setDescription('No tribes have been added yet. Please have production run the `/add_tribe` command and select the Tribe role for them to show up in this list.');
    } else {
        embed.setDescription(`This server uses the modern Components V2 castlist format. If you can't see the interactive display above, try using \`/castlist\` instead.`);
    }
    
    return embed;
}

export {
    createPlayerCard,
    createTribeSection, 
    createNavigationButtons,
    processMemberData,
    createFallbackEmbed
};