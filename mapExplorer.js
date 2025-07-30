import path from 'path';
import sharp from 'sharp';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { File } from 'buffer';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { MapGridSystem } from './services/MapGridSystem.js';
import { loadSafariContent as loadSafariContentOriginal, saveSafariContent as saveSafariContentOriginal } from './safariManager.js';

// Get directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Re-export the safari manager functions
export const loadSafariContent = loadSafariContentOriginal;
export const saveSafariContent = saveSafariContentOriginal;

/**
 * Upload an image to Discord and get the CDN URL
 * @param {Guild} guild - Discord guild object
 * @param {string} imagePath - Path to the image file
 * @param {string} fileName - Name for the uploaded file
 * @returns {string} Discord CDN URL of the uploaded image
 */
async function uploadImageToDiscord(guild, imagePath, fileName) {
  try {
    // Create a storage channel if it doesn't exist
    let storageChannel = guild.channels.cache.find(ch => ch.name === 'map-storage' && ch.type === ChannelType.GuildText);
    
    if (!storageChannel) {
      storageChannel = await guild.channels.create({
        name: 'map-storage',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          }
        ],
        topic: '🗺️ Bot storage for map images - DO NOT DELETE'
      });
    }
    
    // Read the image file
    const imageBuffer = await fs.readFile(imagePath);
    
    // Create a File object from the buffer
    const file = new File([imageBuffer], fileName, { type: 'image/png' });
    
    // Send the file to the storage channel
    const message = await storageChannel.send({
      content: `Map image: ${fileName}`,
      files: [file]
    });
    
    // Get the attachment URL
    const attachment = message.attachments.first();
    return attachment.url;
    
  } catch (error) {
    console.error('Error uploading image to Discord:', error);
    throw error;
  }
}

/**
 * Create a map grid for a guild and set up Discord channels
 * @param {Guild} guild - Discord guild object
 * @param {string} userId - User ID who initiated the creation
 * @returns {Object} Result object with success status and message
 */
async function createMapGrid(guild, userId) {
  try {
    console.log(`🏗️ Creating map grid for guild ${guild.id}`);
    
    // Load safari content data
    let safariData = await loadSafariContent();
    
    // Ensure guild structure exists
    if (!safariData[guild.id]) {
      safariData[guild.id] = {
        buttons: {},
        safaris: {},
        applications: {},
        stores: {},
        items: {},
        safariConfig: {
          currencyName: "coins",
          inventoryName: "Inventory",
          currencyEmoji: "🪙"
        }
      };
    }
    
    // Check if map already exists
    if (safariData[guild.id].maps?.active) {
      return {
        success: false,
        message: '❌ A map already exists! Delete the current map before creating a new one.'
      };
    }
    
    // Initialize maps structure if it doesn't exist
    if (!safariData[guild.id].maps) {
      safariData[guild.id].maps = {};
    }
    
    // Generate map image using MapGridSystem
    const gridSize = 7; // 7x7 grid
    const timestamp = Date.now();
    const mapId = `map_${gridSize}x${gridSize}_${timestamp}`;
    
    // Create directory for guild images if it doesn't exist
    const guildDir = path.join(__dirname, 'img', guild.id);
    await fs.mkdir(guildDir, { recursive: true });
    
    // Generate map with grid overlay
    const mapPath = path.join(__dirname, 'img', 'map.png');
    const outputPath = path.join(guildDir, `${mapId}.png`);
    
    const gridSystem = new MapGridSystem(mapPath, {
      gridSize: gridSize,
      borderSize: 80,
      lineWidth: 4,
      fontSize: 40,
      labelStyle: 'standard'
    });
    
    // Initialize grid system and generate SVG overlay (without embedded map image)
    await gridSystem.initialize();
    const svg = gridSystem.generateGridOverlaySVG();
    const svgBuffer = Buffer.from(svg);
    
    // Create a white border canvas first, then composite the map, then the grid
    await sharp({
        create: {
          width: gridSystem.totalWidth,
          height: gridSystem.totalHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .composite([
        {
          input: mapPath,
          top: gridSystem.options.borderSize,
          left: gridSystem.options.borderSize
        },
        {
          input: svgBuffer,
          top: 0,
          left: 0
        }
      ])
      .png()
      .toFile(outputPath);
    
    console.log(`✅ Generated map image: ${outputPath}`);
    
    // Create map category
    let progressMessages = [];
    progressMessages.push('🏗️ Creating map category...');
    
    // Upload map image to Discord and get CDN URL
    progressMessages.push('📤 Uploading map image to Discord...');
    const discordImageUrl = await uploadImageToDiscord(guild, outputPath, `${mapId}.png`);
    console.log(`📤 Map image uploaded to Discord CDN: ${discordImageUrl}`);
    progressMessages.push('✅ Map image uploaded to Discord CDN');
    
    const category = await guild.channels.create({
      name: '🗺️ Map Explorer',
      type: ChannelType.GuildCategory,
      position: 0
    });
    
    console.log(`✅ Created map category: ${category.id}`);
    progressMessages.push('✅ Created map category');
    
    // Create map data structure
    const mapData = {
      id: mapId,
      name: 'Adventure Map',
      gridSize: gridSize,
      imageFile: outputPath.replace(__dirname + '/', ''),
      discordImageUrl: discordImageUrl,
      category: category.id,
      coordinates: {},
      playerStates: {},
      globalState: {
        discoveredCells: []
      },
      config: {
        allowDiagonalMovement: true,
        fogOfWar: true,
        movementCost: 1
      },
      blacklistedCoordinates: []
    };
    
    // Generate coordinates for 7x7 grid
    const coordinatesList = [];
    for (let row = 1; row <= gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const coord = String.fromCharCode(65 + col) + row;
        coordinatesList.push(coord);
        mapData.coordinates[coord] = {
          channelId: null,
          anchorMessageId: null,
          baseContent: {
            title: '',
            description: `You are at location ${coord}.`
          },
          buttons: [],
          cellType: 'normal',
          discovered: false,
          navigation: {}
        };
      }
    }
    
    progressMessages.push(`📍 Creating ${coordinatesList.length} location channels...`);
    
    // Create channels for each coordinate with rate limiting
    let channelsCreated = 0;
    const maxChannelsPerBatch = 5;
    const delayBetweenBatches = 5000; // 5 seconds
    
    console.log(`📍 Creating ${coordinatesList.length} channels with rate limiting...`);
    
    for (let i = 0; i < coordinatesList.length; i++) {
      const coord = coordinatesList[i];
      
      // Rate limiting: wait after every 5 channels
      if (i > 0 && i % maxChannelsPerBatch === 0) {
        progressMessages.push(`⏳ Rate limiting: waiting 5 seconds... (${i}/${coordinatesList.length})`);
        console.log(`⏳ Rate limiting: waiting 5 seconds... (${i}/${coordinatesList.length})`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
      
      try {
        // Create the channel
        const channel = await guild.channels.create({
          name: coord.toLowerCase(),
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
        
        mapData.coordinates[coord].channelId = channel.id;
        channelsCreated++;
        
        // Post initial anchor message
        const anchorMessage = await channel.send({
          content: `**📍 Location: ${coord}**\n\nYou are at location ${coord}. Explore the map using the Navigate button!\n\n*Use \`/menu\` and visit Safari → Map Explorer → Start Exploring to begin your journey!*`,
          components: []
        });
        
        mapData.coordinates[coord].anchorMessageId = anchorMessage.id;
        
        console.log(`✅ Created channel for ${coord} (${channelsCreated}/${coordinatesList.length})`);
        
      } catch (error) {
        console.error(`❌ Error creating channel for ${coord}:`, error);
        progressMessages.push(`❌ Error creating channel for ${coord}`);
      }
    }
    
    progressMessages.push(`✅ Created ${channelsCreated} channels`);
    
    // Save the map data
    safariData[guild.id].maps[mapId] = mapData;
    safariData[guild.id].maps.active = mapId;
    await saveSafariContent(safariData);
    
    progressMessages.push('✅ Map saved to database');
    
    // Generate success message
    const successMessage = `✅ **Map Created Successfully!**

${progressMessages.join('\n')}

**Map Details:**
• Grid Size: ${gridSize}x${gridSize}
• Total Locations: ${coordinatesList.length}
• Channels Created: ${channelsCreated}

Players can now use **Start Exploring** to begin their journey!`;
    
    return {
      success: true,
      message: successMessage
    };
    
  } catch (error) {
    console.error('Error creating map grid:', error);
    return {
      success: false,
      message: `❌ Error creating map: ${error.message}`
    };
  }
}

/**
 * Delete map grid and all associated channels
 * @param {Guild} guild - Discord guild object
 * @param {string} userId - User ID who initiated the deletion
 * @returns {Object} Result object with success status and message
 */
async function deleteMapGrid(guild, userId) {
  try {
    console.log(`🗑️ Deleting map grid for guild ${guild.id}`);
    
    // Load safari content data
    let safariData = await loadSafariContent();
    
    // Check if map exists
    if (!safariData[guild.id]?.maps?.active) {
      return {
        success: false,
        message: '❌ No active map found to delete.'
      };
    }
    
    const activeMapId = safariData[guild.id].maps.active;
    const mapData = safariData[guild.id].maps[activeMapId];
    
    if (!mapData) {
      return {
        success: false,
        message: '❌ Map data not found.'
      };
    }
    
    let progressMessages = [];
    progressMessages.push('🗑️ Starting map deletion...');
    
    // Delete all coordinate channels
    const coordinates = Object.keys(mapData.coordinates);
    let channelsDeleted = 0;
    
    console.log(`🗑️ Deleting ${coordinates.length} channels...`);
    progressMessages.push(`🗑️ Deleting ${coordinates.length} channels...`);
    
    for (const coord of coordinates) {
      const channelId = mapData.coordinates[coord].channelId;
      if (channelId) {
        try {
          const channel = guild.channels.cache.get(channelId);
          if (channel) {
            await channel.delete(`Map deletion by user ${userId}`);
            channelsDeleted++;
            
            // Add small delay to avoid rate limits
            if (channelsDeleted % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        } catch (error) {
          console.error(`Error deleting channel for ${coord}:`, error);
        }
      }
    }
    
    progressMessages.push(`✅ Deleted ${channelsDeleted} channels`);
    
    // Delete the category
    if (mapData.category) {
      try {
        const category = guild.channels.cache.get(mapData.category);
        if (category) {
          await category.delete(`Map deletion by user ${userId}`);
          progressMessages.push('✅ Deleted map category');
        }
      } catch (error) {
        console.error('Error deleting category:', error);
      }
    }
    
    // Delete the map image file
    if (mapData.imageFile) {
      try {
        const imagePath = path.join(__dirname, mapData.imageFile);
        await fs.unlink(imagePath);
        progressMessages.push('✅ Deleted map image file');
      } catch (error) {
        console.error('Error deleting image file:', error);
      }
    }
    
    // Delete custom actions for this guild
    if (safariData[guild.id].buttons) {
      const actionCount = Object.keys(safariData[guild.id].buttons).length;
      safariData[guild.id].buttons = {};
      progressMessages.push(`✅ Deleted ${actionCount} custom actions`);
    }
    
    // Remove map data
    delete safariData[guild.id].maps[activeMapId];
    delete safariData[guild.id].maps.active;
    
    // Save updated data
    await saveSafariContent(safariData);
    progressMessages.push('✅ Map data removed from database');
    
    const successMessage = `✅ **Map Deleted Successfully!**

${progressMessages.join('\n')}

The map and all associated data have been permanently removed.`;
    
    return {
      success: true,
      message: successMessage
    };
    
  } catch (error) {
    console.error('Error deleting map grid:', error);
    return {
      success: false,
      message: `❌ Error deleting map: ${error.message}`
    };
  }
}

/**
 * Create the Map Explorer menu interface using Components V2
 * @param {Object} options - Menu options
 * @returns {Object} Discord interaction response
 */
async function createMapExplorerMenu(options) {
  const { guildId, safariData, isUpdate } = options;
  
  // Implementation would go here...
  // This is a placeholder
  return {
    components: [],
    flags: (1 << 15) // IS_COMPONENTS_V2
  };
}

/**
 * Update the blacklisted coordinates for a map
 * @param {string} guildId - Discord guild ID
 * @param {Array<string>} coordinatesList - Array of coordinates to blacklist
 * @returns {Object} Result with success status and message
 */
async function updateBlacklistedCoordinates(guildId, coordinatesList) {
  try {
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    
    if (!activeMapId) {
      return {
        success: false,
        message: '❌ No active map found.'
      };
    }
    
    // Ensure the map data exists
    if (!safariData[guildId].maps[activeMapId]) {
      return {
        success: false,
        message: '❌ Map data not found.'
      };
    }
    
    // Update blacklisted coordinates
    safariData[guildId].maps[activeMapId].blacklistedCoordinates = coordinatesList;
    
    // Save the updated data
    await saveSafariContent(safariData);
    
    return {
      success: true,
      message: `✅ Updated blacklisted coordinates. ${coordinatesList.length} locations are now restricted.`
    };
  } catch (error) {
    console.error('Error updating blacklisted coordinates:', error);
    return {
      success: false,
      message: `❌ Error updating blacklisted coordinates: ${error.message}`
    };
  }
}

/**
 * Get the list of blacklisted coordinates for the active map
 * @param {string} guildId - Discord guild ID
 * @returns {Array<string>} Array of blacklisted coordinates
 */
export async function getBlacklistedCoordinates(guildId) {
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  
  if (!activeMapId) return [];
  
  const mapData = safariData[guildId]?.maps?.[activeMapId];
  return mapData?.blacklistedCoordinates || [];
}

/**
 * Post imported content to map channels after they're created
 * @param {string} guildId - Discord guild ID
 * @param {Object} importedMapData - Map data from import with content
 * @param {Client} client - Discord client object
 */
async function postImportedContentToChannels(guildId, importedMapData, client) {
  try {
    // Load the current safari data to get channel IDs
    const safariData = await loadSafariContent();
    const activeMapId = safariData[guildId]?.maps?.active;
    const currentMapData = safariData[guildId]?.maps?.[activeMapId];
    
    if (!currentMapData || !currentMapData.coordinates) {
      console.log('No map data found after creation');
      return;
    }
    
    const guild = await client.guilds.fetch(guildId);
    
    // Update each coordinate with imported content
    for (const [coord, coordData] of Object.entries(currentMapData.coordinates)) {
      if (!coordData.channelId) continue;
      
      try {
        // Get imported content for this coordinate
        const importedCoordData = importedMapData.coordinates[coord];
        if (!importedCoordData) continue;
        
        // Merge imported content into current data
        if (importedCoordData.baseContent) {
          coordData.baseContent = importedCoordData.baseContent;
        }
        if (importedCoordData.buttons) {
          coordData.buttons = importedCoordData.buttons;
        }
        
        // Get the channel
        const channel = await guild.channels.fetch(coordData.channelId);
        if (!channel || !channel.isTextBased()) continue;
        
        // Find and edit the anchor message
        const messages = await channel.messages.fetch({ limit: 10 });
        const anchorMessage = messages.find(msg => 
          msg.author.id === guild.client.user.id && 
          msg.content.includes('Location:')
        );
        
        if (anchorMessage) {
          // Build updated content
          let content = `**📍 Location: ${coord}**\n\n`;
          
          if (coordData.baseContent) {
            if (coordData.baseContent.title) {
              content += `**${coordData.baseContent.title}**\n\n`;
            }
            if (coordData.baseContent.description) {
              content += `${coordData.baseContent.description}\n\n`;
            }
          }
          
          // Update the message
          await anchorMessage.edit({ content });
          console.log(`✅ Updated anchor message for ${coord}`);
        }
        
      } catch (error) {
        console.error(`Error updating content for ${coord}:`, error);
      }
    }
    
    // Save the updated data
    await saveSafariContent(safariData);
    
  } catch (error) {
    console.error('Error posting imported content to channels:', error);
  }
}

// Export functions
export { 
  createMapGrid, 
  deleteMapGrid, 
  createMapExplorerMenu, 
  loadSafariContent, 
  saveSafariContent,
  postImportedContentToChannels,
  updateBlacklistedCoordinates,
  getBlacklistedCoordinates
};