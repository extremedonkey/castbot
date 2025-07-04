import { ChannelType, PermissionFlagsBits } from 'discord.js';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAFARI_CONTENT_FILE = path.join(__dirname, 'safariContent.json');

// Import MapGridSystem from scripts
import MapGridSystem from './scripts/map-tests/mapGridSystem.js';

/**
 * Load Safari content data
 */
async function loadSafariContent() {
  try {
    const exists = await fs.access(SAFARI_CONTENT_FILE).then(() => true).catch(() => false);
    if (!exists) {
      // Create initial structure if file doesn't exist
      const initialData = {};
      await fs.writeFile(SAFARI_CONTENT_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    
    const data = JSON.parse(await fs.readFile(SAFARI_CONTENT_FILE, 'utf8'));
    return data;
  } catch (error) {
    console.error('Error loading safari content:', error);
    throw error;
  }
}

/**
 * Save Safari content data
 */
async function saveSafariContent(data) {
  try {
    await fs.writeFile(SAFARI_CONTENT_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Safari content saved successfully');
  } catch (error) {
    console.error('Error saving safari content:', error);
    throw error;
  }
}

/**
 * Creates a map grid for the guild
 * @param {Guild} guild - Discord guild object
 * @param {string} userId - User ID creating the map
 * @returns {Object} Result with success status and message
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
    const gridSize = 5; // 5x5 grid
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
    
    await gridSystem.generateGridOverlay(outputPath);
    console.log(`✅ Generated map image: ${outputPath}`);
    
    // Create map category
    let progressMessages = [];
    progressMessages.push('🏗️ Creating map category...');
    
    const category = await guild.channels.create({
      name: '🗺️ Map Explorer',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        }
      ]
    });
    
    progressMessages.push(`✅ Created category: ${category.name}`);
    
    // Generate coordinate list for 5x5 grid
    const coordinates = [];
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const coord = `${String.fromCharCode(65 + x)}${y + 1}`;
        coordinates.push(coord);
      }
    }
    
    // Create channels with rate limiting
    const channels = {};
    progressMessages.push(`📍 Creating ${coordinates.length} channels...`);
    
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i];
      
      // Rate limiting: 5 channels per 5 seconds
      if (i > 0 && i % 5 === 0) {
        progressMessages.push(`⏳ Rate limiting... (${i}/${coordinates.length} channels created)`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      try {
        const channel = await guild.channels.create({
          name: coord.toLowerCase(),
          type: ChannelType.GuildText,
          parent: category.id,
          topic: `Map location ${coord} - Use buttons to explore!`,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
        
        channels[coord] = channel.id;
        console.log(`Created channel #${coord.toLowerCase()} (${i + 1}/${coordinates.length})`);
        
        if ((i + 1) % 5 === 0 || i === coordinates.length - 1) {
          progressMessages.push(`📍 Progress: ${i + 1}/${coordinates.length} channels created`);
        }
      } catch (error) {
        console.error(`Failed to create channel for ${coord}:`, error);
        progressMessages.push(`❌ Failed to create channel for ${coord}: ${error.message}`);
      }
    }
    
    // Create map data structure
    const mapData = {
      id: mapId,
      name: 'Adventure Island',
      gridSize: gridSize,
      imageFile: outputPath.replace(__dirname + '/', ''),
      category: category.id,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      coordinates: {},
      playerStates: {},
      globalState: {
        openedChests: [],
        triggeredEvents: [],
        discoveredSecrets: []
      },
      config: {
        staminaEnabled: true,
        staminaPerMove: 1,
        maxStamina: 5,
        staminaRegenHours: 12,
        chestMechanic: 'shared',
        allowBacktracking: true,
        fogOfWar: true
      }
    };
    
    // Initialize coordinate data
    for (const coord of coordinates) {
      mapData.coordinates[coord] = {
        channelId: channels[coord] || null,
        baseContent: {
          title: `📍 Location ${coord}`,
          description: `You are at grid location ${coord}. This area hasn't been configured yet.`,
          image: null,
          clues: []
        },
        buttons: [],
        hiddenCommands: {},
        navigation: generateNavigation(coord, gridSize),
        cellType: 'unexplored',
        discovered: false,
        specialEvents: []
      };
    }
    
    // Set the map as active
    safariData[guild.id].maps.active = mapId;
    safariData[guild.id].maps[mapId] = mapData;
    
    // Save safari content data
    await saveSafariContent(safariData);
    
    progressMessages.push('✅ Map data structure created and saved');
    progressMessages.push(`🎉 **Map creation complete!**`);
    progressMessages.push(`• Grid Size: ${gridSize}x${gridSize}`);
    progressMessages.push(`• Total Locations: ${coordinates.length}`);
    progressMessages.push(`• Category: ${category.name}`);
    
    return {
      success: true,
      message: progressMessages.join('\n')
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
 * Deletes the map grid for the guild
 * @param {Guild} guild - Discord guild object
 * @returns {Object} Result with success status and message
 */
async function deleteMapGrid(guild) {
  try {
    console.log(`🗑️ Deleting map grid for guild ${guild.id}`);
    
    // Load safari content data
    let safariData = await loadSafariContent();
    
    // Check if guild has data
    if (!safariData[guild.id]) {
      return {
        success: false,
        message: '❌ No guild data found.'
      };
    }
    
    // Check if map exists
    if (!safariData[guild.id].maps?.active) {
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
    
    // Delete channels and category
    if (mapData.category) {
      try {
        const category = await guild.channels.fetch(mapData.category);
        if (category) {
          progressMessages.push(`📁 Found category: ${category.name}`);
          
          // Get all channels in the category
          const channelsInCategory = guild.channels.cache.filter(ch => ch.parentId === category.id);
          progressMessages.push(`📍 Found ${channelsInCategory.size} channels to delete`);
          
          // Delete channels with rate limiting
          let deletedCount = 0;
          for (const [channelId, channel] of channelsInCategory) {
            try {
              await channel.delete('Map deletion');
              deletedCount++;
              console.log(`Deleted channel: ${channel.name} (${deletedCount}/${channelsInCategory.size})`);
              
              // Rate limiting: pause every 5 deletions
              if (deletedCount % 5 === 0) {
                progressMessages.push(`⏳ Deleted ${deletedCount}/${channelsInCategory.size} channels...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (error) {
              console.error(`Failed to delete channel ${channel.name}:`, error);
            }
          }
          
          progressMessages.push(`✅ Deleted ${deletedCount} channels`);
          
          // Delete the category
          await category.delete('Map deletion');
          progressMessages.push('✅ Deleted map category');
        }
      } catch (error) {
        console.error('Error deleting channels/category:', error);
        progressMessages.push(`⚠️ Error deleting channels: ${error.message}`);
      }
    }
    
    // Delete map image file (but keep the base map.png)
    if (mapData.imageFile && !mapData.imageFile.includes('map.png')) {
      try {
        const imagePath = path.join(__dirname, mapData.imageFile);
        await fs.unlink(imagePath);
        progressMessages.push('✅ Deleted map image file');
      } catch (error) {
        console.error('Error deleting image file:', error);
        progressMessages.push(`⚠️ Could not delete image file: ${error.message}`);
      }
    }
    
    // Clear map data from storage
    delete safariData[guild.id].maps[activeMapId];
    delete safariData[guild.id].maps.active;
    
    // Clean up maps object if empty
    if (Object.keys(safariData[guild.id].maps).length === 0) {
      delete safariData[guild.id].maps;
    }
    
    // Save updated safari content data
    await saveSafariContent(safariData);
    progressMessages.push('✅ Cleared map data from storage');
    
    progressMessages.push('🎉 **Map deletion complete!**');
    
    return {
      success: true,
      message: progressMessages.join('\n')
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
 * Generate navigation options for a coordinate
 * @param {string} coord - Coordinate like "A1"
 * @param {number} gridSize - Size of the grid
 * @returns {Object} Navigation options
 */
function generateNavigation(coord, gridSize) {
  const x = coord.charCodeAt(0) - 65;
  const y = parseInt(coord.slice(1)) - 1;
  
  const nav = {
    north: null,
    east: null,
    south: null,
    west: null
  };
  
  // North (y - 1)
  if (y > 0) {
    nav.north = {
      to: `${String.fromCharCode(65 + x)}${y}`,
      visible: true,
      blocked: false
    };
  }
  
  // East (x + 1)
  if (x < gridSize - 1) {
    nav.east = {
      to: `${String.fromCharCode(66 + x)}${y + 1}`,
      visible: true,
      blocked: false
    };
  }
  
  // South (y + 1)
  if (y < gridSize - 1) {
    nav.south = {
      to: `${String.fromCharCode(65 + x)}${y + 2}`,
      visible: true,
      blocked: false
    };
  }
  
  // West (x - 1)
  if (x > 0) {
    nav.west = {
      to: `${String.fromCharCode(64 + x)}${y + 1}`,
      visible: true,
      blocked: false
    };
  }
  
  return nav;
}

/**
 * Create Map Explorer interface menu
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Discord UI components for Map Explorer
 */
async function createMapExplorerMenu(guildId) {
  try {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = await import('discord.js');
    
    // Load Safari content to check for existing maps
    const safariData = await loadSafariContent();
    const guildMaps = safariData[guildId]?.maps || {};
    const activeMapId = guildMaps.active;
    const hasActiveMap = activeMapId && guildMaps[activeMapId];
    
    // Create embed with map status
    const embed = new EmbedBuilder()
      .setTitle('🗺️ Safari Map Explorer')
      .setColor(0x00AE86);
    
    if (hasActiveMap) {
      const activeMap = guildMaps[activeMapId];
      embed.setDescription(`**Current Map:** ${activeMap.name || 'Adventure Map'}\n**Grid Size:** ${activeMap.gridSize}x${activeMap.gridSize}\n**Status:** Active ✅`);
      embed.setImage(`attachment://${path.basename(activeMap.imageFile)}`);
    } else {
      embed.setDescription('**No active map found**\nCreate a new map to begin exploration!');
    }
    
    // Create action buttons
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('map_create')
          .setLabel('🏗️ Create Map')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(hasActiveMap), // Disable if map already exists
        new ButtonBuilder()
          .setCustomId('map_delete')
          .setLabel('🗑️ Delete Map')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!hasActiveMap), // Disable if no map exists
        new ButtonBuilder()
          .setCustomId('prod_safari_menu')
          .setLabel('⬅️ Back to Safari')
          .setStyle(ButtonStyle.Secondary)
      );
    
    const components = [row];
    const embeds = [embed];
    
    // Include map image if available
    const files = [];
    if (hasActiveMap && guildMaps[activeMapId].imageFile) {
      try {
        const imageFile = guildMaps[activeMapId].imageFile;
        const imageExists = await fs.access(imageFile).then(() => true).catch(() => false);
        if (imageExists) {
          files.push({
            attachment: imageFile,
            name: path.basename(imageFile)
          });
        }
      } catch (error) {
        console.warn('Could not attach map image:', error.message);
      }
    }
    
    return {
      content: '',
      embeds,
      components,
      files
    };
    
  } catch (error) {
    console.error('Error creating Map Explorer menu:', error);
    throw error;
  }
}

// Export functions
export { createMapGrid, deleteMapGrid, createMapExplorerMenu };