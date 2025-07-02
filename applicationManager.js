import { 
    PermissionFlagsBits,
    ChannelType,
    OverwriteType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import { InteractionResponseFlags } from 'discord-interactions';
import { loadPlayerData, savePlayerData } from './storage.js';

/**
 * Application Management Module for CastBot
 * Handles application button creation and channel management for prospective players
 */

// Button style mapping for Discord API
const BUTTON_STYLES = {
    'Primary': ButtonStyle.Primary,
    'Secondary': ButtonStyle.Secondary, 
    'Success': ButtonStyle.Success,
    'Danger': ButtonStyle.Danger
};

/**
 * Sanitize a display name for use in channel names
 * Removes/replaces foreign characters and special symbols
 */
function sanitizeChannelName(displayName) {
    return displayName
        .normalize('NFD')  // Decompose accented characters
        .replace(/[\u0300-\u036f]/g, '')  // Remove accents
        .replace(/[^a-zA-Z0-9\-_]/g, '')  // Only allow alphanumeric, hyphens, underscores
        .toLowerCase()
        .substring(0, 90);  // Discord channel name limit is 100 chars, leave room for suffix
}

/**
 * Get application configuration for a guild
 */
async function getApplicationConfig(guildId, configId) {
    const data = await loadPlayerData();
    if (!data[guildId]) return null;
    if (!data[guildId].applicationConfigs) return null;
    return data[guildId].applicationConfigs[configId] || null;
}

/**
 * Save application configuration for a guild
 */
async function saveApplicationConfig(guildId, configId, config) {
    const data = await loadPlayerData();
    if (!data[guildId]) {
        data[guildId] = { players: {}, tribes: {}, timezones: {}, pronounRoleIDs: [] };
    }
    if (!data[guildId].applicationConfigs) {
        data[guildId].applicationConfigs = {};
    }
    
    data[guildId].applicationConfigs[configId] = {
        ...config,
        createdAt: Date.now(),
        lastUpdated: Date.now()
    };
    
    await savePlayerData(data);
    return configId;
}

/**
 * Create the application button modal for configuration
 */
function createApplicationButtonModal() {
    const modal = new ModalBuilder()
        .setCustomId('application_button_modal')
        .setTitle('Create Application Button');

    // Button text input
    const buttonTextInput = new TextInputBuilder()
        .setCustomId('button_text')
        .setLabel('Button Text')
        .setPlaceholder('e.g., "Apply to Season 3!"')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80);

    // Explanatory text input
    const explanatoryTextInput = new TextInputBuilder()
        .setCustomId('explanatory_text')
        .setLabel('Explanatory Text')
        .setPlaceholder('Give your applicants some information about the season. This will display above the apply button.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(2000);

    // Welcome message title input
    const welcomeTitleInput = new TextInputBuilder()
        .setCustomId('welcome_title')
        .setLabel('Welcome Message Title')
        .setPlaceholder('Title that displays when applicant\'s channel opens')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    // Welcome message description input
    const welcomeDescriptionInput = new TextInputBuilder()
        .setCustomId('welcome_description')
        .setLabel('Welcome Message Description')
        .setPlaceholder('Tell users what to do to start their application (e.g. type ?q1 to continue)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(2000);

    // Channel name format input
    const channelFormatInput = new TextInputBuilder()
        .setCustomId('channel_format')
        .setLabel('Channel Name Format')
        .setPlaceholder('%name%-app')
        .setValue('%name%-app')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

    const firstRow = new ActionRowBuilder().addComponents(buttonTextInput);
    const secondRow = new ActionRowBuilder().addComponents(explanatoryTextInput);
    const thirdRow = new ActionRowBuilder().addComponents(welcomeTitleInput);
    const fourthRow = new ActionRowBuilder().addComponents(welcomeDescriptionInput);
    const fifthRow = new ActionRowBuilder().addComponents(channelFormatInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

    return modal;
}

/**
 * Create Components v2 native channel select menu
 */
function createChannelSelectMenu() {
    return new ChannelSelectMenuBuilder()
        .setCustomId('select_target_channel')
        .setPlaceholder('Select channel to post your app button in')
        .setChannelTypes([ChannelType.GuildText])
        .setMinValues(1)
        .setMaxValues(1);
}

/**
 * Create the category selection component
 */
function createCategorySelectMenu(categories) {
    return new StringSelectMenuBuilder()
        .setCustomId('select_application_category')
        .setPlaceholder('Select the category new apps will be added to')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            categories.map(category => ({
                label: category.name,
                description: `${category.children.cache.size} channels`,
                value: category.id
            }))
        );
}

/**
 * Create the button style selection component
 */
function createButtonStyleSelectMenu() {
    return new StringSelectMenuBuilder()
        .setCustomId('select_button_style')
        .setPlaceholder('Select app button color/style')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions([
            {
                label: 'Primary (Blue)',
                description: 'Blue button style',
                value: 'Primary',
                emoji: '🔵'
            },
            {
                label: 'Secondary (Gray)',
                description: 'Gray button style',
                value: 'Secondary',
                emoji: '⚪'
            },
            {
                label: 'Success (Green)',
                description: 'Green button style',
                value: 'Success',
                emoji: '🟢'
            },
            {
                label: 'Danger (Red)',
                description: 'Red button style',
                value: 'Danger',
                emoji: '🔴'
            }
        ]);
}

/**
 * Create the actual application button
 */
function createApplicationButton(buttonText, configId) {
    return new ButtonBuilder()
        .setCustomId(`apply_${configId}`)
        .setLabel(buttonText)
        .setStyle(ButtonStyle.Primary)  // Default style, will be updated from config
        .setEmoji('📝');
}

/**
 * Create an application channel for a user
 */
async function createApplicationChannel(guild, user, config, configId = 'unknown') {
    try {
        // Get the category
        const category = await guild.channels.fetch(config.categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
            throw new Error('Invalid category selected');
        }

        // Generate channel name
        const sanitizedName = sanitizeChannelName(user.displayName || user.username);
        const channelName = config.channelFormat.replace('%name%', sanitizedName);

        // Check if channel already exists
        const existingChannel = guild.channels.cache.find(
            channel => channel.name === channelName && channel.parentId === category.id
        );
        
        if (existingChannel) {
            return { success: false, error: 'You already have an application channel!', channel: existingChannel };
        }

        // Clean up any orphaned application data for this user (where channel was manually deleted)
        // This ensures users can reapply after their channel is deleted by admins
        const data = await loadPlayerData();
        if (data[guild.id]?.applications) {
            // Find any applications for this user where the channel no longer exists
            const orphanedApplications = Object.entries(data[guild.id].applications)
                .filter(([channelId, application]) => {
                    return application.userId === user.id && !guild.channels.cache.has(channelId);
                });
            
            // Remove orphaned application data
            for (const [channelId] of orphanedApplications) {
                console.log(`🧹 Cleaning up orphaned application data for channel ${channelId} (user: ${user.displayName})`);
                delete data[guild.id].applications[channelId];
            }
            
            if (orphanedApplications.length > 0) {
                await savePlayerData(data);
                console.log(`🧹 Cleaned up ${orphanedApplications.length} orphaned application(s) for user ${user.displayName}`);
            }
        }

        // Create the channel with proper permissions
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.AddReactions,
                        PermissionFlagsBits.UseExternalEmojis
                    ]
                }
            ]
        });

        // Removed old welcome embed as per user request

        // Send interactive welcome container (Components V2) to help applicant get started
        const welcomeButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('player_menu')
                    .setLabel('Start your application')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🚀')
            );

        const welcomeContainer = {
            type: 17, // Container
            accent_color: 0x3498db, // Blue color (#3498db)
            components: [
                {
                    type: 10, // Text Display
                    content: `## 🚀 Get Started with Your Application

Welcome ${user}! This is your private application channel.

Only you and the admin team can see this channel.

To get your application started, please set up your basic information using the button below:

• **Pronouns** - Let us know your preferred pronouns
• **Timezone** - Help other players understand your availability  
• **Age** - Set how old you are

Click the button below to get started!`
                },
                welcomeButtons.toJSON(), // Convert to JSON format
                {
                    type: 10, // Text Display  
                    content: `-# You can update this information from any channel at any time by typing \`/menu\``
                }
            ]
        };

        await channel.send({ 
            flags: (1 << 15), // IS_COMPONENTS_V2
            components: [welcomeContainer]
        });

        // Store application data in playerData for cast ranking system (reuse data from cleanup above)
        if (!data[guild.id]) data[guild.id] = {};
        if (!data[guild.id].applications) data[guild.id].applications = {};
        
        console.log('Debug - Storing application data:');
        console.log('Debug - Guild ID:', guild.id);
        console.log('Debug - Channel ID:', channel.id);
        console.log('Debug - User:', user.displayName || user.user?.username || user.username);
        
        data[guild.id].applications[channel.id] = {
            userId: user.id,
            channelId: channel.id,
            username: user.user ? user.user.username : user.username,
            displayName: user.displayName || user.user?.username || user.username,
            avatarURL: user.user ? user.user.displayAvatarURL({ size: 128 }) : user.displayAvatarURL({ size: 128 }),
            channelName: channel.name,
            createdAt: new Date().toISOString(),
            configId: configId
        };
        
        await savePlayerData(data);
        console.log(`Stored application data for ${data[guild.id].applications[channel.id].displayName} in channel ${channel.name}`);
        console.log('Debug - Application stored in playerData:', JSON.stringify(data[guild.id].applications[channel.id], null, 2));

        return { success: true, channel };

    } catch (error) {
        console.error('Error creating application channel:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Handle the completion of the application button modal
 */
async function handleApplicationButtonModalSubmit(interactionBody, guild) {
    try {
        // Extract data from modal components
        const components = interactionBody.data.components;
        const buttonText = components[0].components[0].value;
        const explanatoryText = components[1].components[0].value;
        const welcomeTitle = components[2].components[0].value;
        const welcomeDescription = components[3].components[0].value;
        const channelFormat = components[4].components[0].value;

        // Validate channel format
        if (!channelFormat.includes('%name%')) {
            return {
                success: false,
                error: 'Channel format must include %name% placeholder'
            };
        }


        // Get categories for selection - use server order (position)
        const categories = guild.channels.cache
            .filter(channel => channel.type === ChannelType.GuildCategory)
            .sort((a, b) => a.position - b.position) // Use server order
            .first(25); // Discord select menu limit

        if (categories.length === 0) {
            return {
                success: false,
                error: 'No categories available for application channels'
            };
        }

        // Clean up any existing temp configs for this user first
        const playerData = await loadPlayerData();
        if (playerData[guild.id]?.applicationConfigs) {
            const existingTempConfigs = Object.keys(playerData[guild.id].applicationConfigs)
                .filter(id => id.startsWith(`temp_`) && id.includes(interactionBody.member.user.id));
            
            for (const tempId of existingTempConfigs) {
                delete playerData[guild.id].applicationConfigs[tempId];
            }
            await savePlayerData(playerData);
        }

        // Store fresh temporary config data
        const tempConfigId = `temp_${Date.now()}_${interactionBody.member.user.id}`;
        const tempConfig = {
            buttonText,
            explanatoryText,
            welcomeTitle,
            welcomeDescription,
            channelFormat,
            stage: 'awaiting_selections'
            // Note: intentionally not setting targetChannelId, categoryId, buttonStyle
        };

        await saveApplicationConfig(guild.id, tempConfigId, tempConfig);

        // Create selection components
        const channelSelect = createChannelSelectMenu();
        const categorySelect = createCategorySelectMenu(categories);
        const styleSelect = createButtonStyleSelectMenu();

        const channelRow = new ActionRowBuilder().addComponents(channelSelect);
        const categoryRow = new ActionRowBuilder().addComponents(categorySelect);
        const styleRow = new ActionRowBuilder().addComponents(styleSelect);

        const responseData = {
            components: [channelRow, categoryRow, styleRow]
        };

        // Components v2: No content needed, just ephemeral flags
        responseData.flags = InteractionResponseFlags.EPHEMERAL;

        return {
            success: true,
            response: responseData,
            tempConfigId
        };

    } catch (error) {
        console.error('Error handling application button modal:', error);
        return {
            success: false,
            error: 'Error processing application button configuration'
        };
    }
}

export {
    sanitizeChannelName,
    getApplicationConfig,
    saveApplicationConfig,
    createApplicationButtonModal,
    createChannelSelectMenu,
    createCategorySelectMenu,
    createButtonStyleSelectMenu,
    createApplicationButton,
    createApplicationChannel,
    handleApplicationButtonModalSubmit,
    BUTTON_STYLES
};