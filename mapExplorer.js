import { ChannelType, PermissionFlagsBits } from 'discord.js';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import MapGridSystem from scripts
import MapGridSystem from './scripts/map-tests/mapGridSystem.js';

// Import loadSafariContent and saveSafariContent from safariManager to benefit from caching
import { loadSafariContent, saveSafariContent } from './safariManager.js';

/**
 * Upload image to Discord and get CDN URL by sending it to a channel
 * @param {Guild} guild - Discord guild object
 * @param {string} imagePath - Path to image file
 * @param {string} filename - Filename for upload
 * @returns {string} Discord CDN URL
 */
async function uploadImageToDiscord(guild, imagePath, filename) {
  try {
    const { AttachmentBuilder } = await import('discord.js');
    
    // Find or create a temporary storage channel
    let storageChannel = guild.channels.cache.find(ch => ch.name === 'map-storage' && ch.type === 0);
    
    if (!storageChannel) {
      storageChannel = await guild.channels.create({
        name: 'map-storage',
        type: 0, // Text channel
        topic: 'Storage for map images - do not delete',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: ['ViewChannel', 'SendMessages']
          }
        ]
      });
    }
    
    // Create attachment and send to storage channel
    const attachment = new AttachmentBuilder(imagePath, { name: filename });
    const message = await storageChannel.send({
      content: `Map image for ${guild.name}`,
      files: [attachment]
    });
    
    // Return the Discord CDN URL
    return message.attachments.first().url;
  } catch (error) {
    console.error('❌ Failed to upload image to Discord:', error);
    throw error;
  }
}

/**
 * Create fog of war maps and post to their corresponding channels
 * @param {Guild} guild - Discord guild object
 * @param {string} fullMapPath - Path to the complete map with grid
 * @param {MapGridSystem} gridSystem - Initialized grid system
 * @param {Object} channels - Map of coordinates to channel IDs
 * @param {Array} coordinates - Array of coordinate strings
 */
async function postFogOfWarMapsToChannels(guild, fullMapPath, gridSystem, channels, coordinates) {
  try {
    console.log(`🌫️ Starting fog of war map generation for ${coordinates.length} locations...`);
    
    const { AttachmentBuilder } = await import('discord.js');
    const { createAnchorMessageComponents } = await import('./safariButtonHelper.js');
    
    // Load safari data to update with anchor message IDs
    let safariData = await loadSafariContent();
    const activeMapId = safariData[guild.id]?.maps?.active;
    
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i];
      const channelId = channels[coord];
      
      if (!channelId) {
        console.log(`⚠️ No channel found for coordinate ${coord}`);
        continue;
      }
      
      try {
        // Get the channel with retry logic for newly created channels
        let channel;
        let retries = 3;
        while (retries > 0) {
          try {
            channel = await guild.channels.fetch(channelId);
            if (channel) break;
          } catch (fetchError) {
            console.log(`⚠️ Retry ${4 - retries}/3 - Could not fetch channel for ${coord}: ${fetchError.message}`);
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            }
          }
        }
        
        if (!channel) {
          console.log(`❌ Failed to fetch channel for ${coord} after 3 retries`);
          continue;
        }
        
        // Create fog of war map for this specific coordinate
        const fogOfWarBuffer = await createFogOfWarMap(fullMapPath, gridSystem, coord, coordinates);
        
        // Create attachment
        const attachment = new AttachmentBuilder(fogOfWarBuffer, { 
          name: `${coord.toLowerCase()}_fogmap.png` 
        });
        
        // Upload fog of war map to storage channel to get URL without redundant message in coordinate channel
        let storageChannel = guild.channels.cache.find(ch => ch.name === 'map-storage' && ch.type === 0);
        if (!storageChannel) {
          storageChannel = await guild.channels.create({
            name: 'map-storage',
            type: 0,
            topic: 'Storage for map images - do not delete',
            permissionOverwrites: [{
              id: guild.roles.everyone.id,
              deny: ['ViewChannel', 'SendMessages']
            }]
          });
        }
        
        const storageMessage = await storageChannel.send({
          content: `Fog map for ${coord}`,
          files: [attachment]
        });
        const fogMapUrl = storageMessage.attachments.first()?.url;
        
        // Get coordinate data
        const coordData = safariData[guild.id]?.maps?.[activeMapId]?.coordinates?.[coord];
        
        if (!coordData) {
          console.error(`No coordinate data found for ${coord}`);
          continue;
        }
        
        // Create anchor message components
        const components = await createAnchorMessageComponents(coordData, guild.id, coord, fogMapUrl);
        
        // Send anchor message using DiscordRequest for Components V2
        const { DiscordRequest } = await import('./utils.js');
        
        const messagePayload = {
          flags: (1 << 15), // IS_COMPONENTS_V2
          components: components
        };
        
        const anchorMessage = await DiscordRequest(`channels/${channel.id}/messages`, {
          method: 'POST',
          body: messagePayload
        });
        
        // Check if anchor message was created successfully
        if (!anchorMessage || !anchorMessage.id) {
          console.error(`❌ Failed to create anchor message for ${coord} - response:`, anchorMessage);
          throw new Error('Anchor message creation failed - no message ID returned');
        }
        
        // Store anchor message ID and fog map URL
        safariData[guild.id].maps[activeMapId].coordinates[coord].anchorMessageId = anchorMessage.id;
        safariData[guild.id].maps[activeMapId].coordinates[coord].fogMapUrl = fogMapUrl;
        console.log(`💾 map_create: Stored fog map URL for ${coord}: ${fogMapUrl}`);
        console.log(`💾 map_create: Stored anchor message ID for ${coord}: ${anchorMessage.id}`);
        
        // Save incrementally to prevent data loss if later coordinates fail
        if ((i + 1) % 5 === 0 || i === coordinates.length - 1) {
          await saveSafariContent(safariData);
          console.log(`💾 Saved safari data after processing ${i + 1} coordinates`);
        }
        
        console.log(`✅ Posted anchor message for ${coord} to #${channel.name} (${i + 1}/${coordinates.length})`);
        
        // Rate limiting: pause every 5 posts
        if ((i + 1) % 5 === 0 && i < coordinates.length - 1) {
          console.log(`⏳ Rate limiting: pausing after ${i + 1} fog maps...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`❌ Failed to post fog map for ${coord}:`, error);
        
        // Even if anchor message creation fails, try to at least save the fog map URL
        if (fogMapUrl && coordData) {
          console.log(`🔧 Attempting to save fog map URL despite anchor message failure for ${coord}`);
          safariData[guild.id].maps[activeMapId].coordinates[coord].fogMapUrl = fogMapUrl;
          // Note: anchorMessageId will remain null and needs to be repaired later
          
          // Save data immediately to prevent loss
          await saveSafariContent(safariData);
          console.log(`💾 Saved partial data for ${coord} with fog map URL but no anchor message ID`);
        }
      }
    }
    
    // Save safari data with anchor message IDs
    await saveSafariContent(safariData);
    
    console.log(`🎉 Completed fog of war map posting for all ${coordinates.length} locations!`);
    
  } catch (error) {
    console.error('❌ Error in fog of war process:', error);
  }
}

/**
 * Create a fog of war version of the map with only one cell visible
 * @param {string} fullMapPath - Path to the complete map with grid
 * @param {MapGridSystem} gridSystem - Initialized grid system
 * @param {string} visibleCoord - The coordinate that should remain visible
 * @param {Array} allCoordinates - Array of all coordinate strings
 * @returns {Buffer} Image buffer of the fog of war map
 */
async function createFogOfWarMap(fullMapPath, gridSystem, visibleCoord, allCoordinates) {
  try {
    // Start with the full map
    let mapImage = sharp(fullMapPath);
    
    // Create a composite array for all the fog overlays
    const fogOverlays = [];
    
    for (const coord of allCoordinates) {
      // Skip the visible coordinate
      if (coord === visibleCoord) continue;
      
      // Parse coordinate and get pixel boundaries
      const pos = gridSystem.parseCoordinate(coord);
      const cellCoords = gridSystem.getCellPixelCoordinatesWithBorder(pos.x, pos.y);
      
      // Create a semi-transparent black overlay for this cell
      const fogOverlay = await sharp({
        create: {
          width: Math.round(cellCoords.width),
          height: Math.round(cellCoords.height),
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.7 } // 70% transparent black
        }
      }).png().toBuffer();
      
      fogOverlays.push({
        input: fogOverlay,
        top: Math.round(cellCoords.y),
        left: Math.round(cellCoords.x)
      });
    }
    
    // Apply all fog overlays at once
    const foggedMapBuffer = await mapImage
      .composite(fogOverlays)
      .png()
      .toBuffer();
    
    return foggedMapBuffer;
    
  } catch (error) {
    console.error(`❌ Error creating fog of war map for ${visibleCoord}:`, error);
    throw error;
  }
}

/**
 * LEGACY: Creates a map grid for the guild using hardcoded map.png
 * @deprecated Use createMapGridWithCustomImage instead
 * @param {Guild} guild - Discord guild object
 * @param {string} userId - User ID creating the map
 * @returns {Object} Result with success status and message
 */
// COMMENTED OUT - Legacy hardcoded map functionality replaced by custom image upload
/*
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
        
        // Skip initial welcome message - fog of war anchor message is more useful
        
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
      discordImageUrl: discordImageUrl, // Store Discord CDN URL
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
      },
      blacklistedCoordinates: [] // Array to store restricted coordinates
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
        specialEvents: [],
        fogMapUrl: null // Store fog of war map URL persistently
      };
    }
    
    // Set the map as active
    safariData[guild.id].maps.active = mapId;
    safariData[guild.id].maps[mapId] = mapData;
    
    // Save safari content data
    await saveSafariContent(safariData);
    
    progressMessages.push('✅ Map data structure created and saved');
    
    // Post fog of war maps to each channel
    progressMessages.push('🌫️ Generating fog of war maps for each location...');
    await postFogOfWarMapsToChannels(guild, outputPath, gridSystem, channels, coordinates);
    progressMessages.push('✅ Fog of war maps posted to all channels');
    
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
*/

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
    
    // Clear custom actions for this guild
    let deletedActionCount = 0;
    if (safariData[guild.id].buttons) {
      deletedActionCount = Object.keys(safariData[guild.id].buttons).length;
      delete safariData[guild.id].buttons;
      if (deletedActionCount > 0) {
        progressMessages.push(`✅ Deleted ${deletedActionCount} custom actions`);
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
 * Create Map Explorer interface menu using Components V2 format
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Components V2 format for Map Explorer
 */
async function createMapExplorerMenu(guildId) {
  try {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    
    // Load Safari content to check for existing maps
    const safariData = await loadSafariContent();
    const guildMaps = safariData[guildId]?.maps || {};
    const activeMapId = guildMaps.active;
    const hasActiveMap = activeMapId && guildMaps[activeMapId];
    
    console.log(`🗺️ Map Explorer Debug - Guild: ${guildId}, Active Map ID: ${activeMapId}, Has Active Map: ${hasActiveMap}`);
    
    // Create header text based on map status
    let headerText;
    if (hasActiveMap) {
      const activeMap = guildMaps[activeMapId];
      headerText = `# 🗺️ Map Explorer\n\n**Active Map:** ${activeMap.name || 'Adventure Map'}\n**Grid Size:** ${activeMap.gridSize}x${activeMap.gridSize}\n**Status:** Active ✅`;
    } else {
      headerText = "# 🗺️ Map Explorer\n\n**No active map found**\nCreate a new map to begin exploration!";
    }
    
    // Create text display component
    const textDisplay = {
      type: 10, // Text display component
      content: headerText
    };
    
    // Create map management buttons
    const createButton = new ButtonBuilder()
      .setCustomId('map_create')
      .setLabel('Create Map')
      .setEmoji('🏗️');
    
    const deleteButton = new ButtonBuilder()
      .setCustomId('map_delete')
      .setLabel('Delete Map')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️');
    
    const blacklistButton = new ButtonBuilder()
      .setCustomId('map_admin_blacklist')
      .setLabel('Blacklisted Coords')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚫');
    
    // Set states based on whether map exists
    if (hasActiveMap) {
      createButton.setStyle(ButtonStyle.Secondary).setDisabled(true);
      deleteButton.setDisabled(false);
      blacklistButton.setDisabled(false);
    } else {
      createButton.setStyle(ButtonStyle.Primary).setDisabled(false);
      deleteButton.setDisabled(true);
      blacklistButton.setDisabled(true);
    }
    
    const mapButtons = [createButton, deleteButton, blacklistButton];
    
    const mapButtonRow = new ActionRowBuilder().addComponents(mapButtons);
    
    // Create back button
    const backButton = new ButtonBuilder()
      .setCustomId('prod_safari_menu')
      .setLabel('⬅ Safari Menu')
      .setStyle(ButtonStyle.Secondary);
    
    const backRow = new ActionRowBuilder().addComponents([backButton]);
    
    // Build container components
    const containerComponents = [
      textDisplay,
      { type: 13 }, // Separator
      mapButtonRow.toJSON(),
      { type: 14 }, // Thin separator
      backRow.toJSON()
    ];
    
    // Create container using Components V2 format
    const mapExplorerContainer = {
      type: 17, // Container component
      accent_color: 0x00AE86, // Teal accent for map theme
      components: containerComponents
    };
    
    // Return Components V2 format - remove ephemeral flag for troubleshooting
    return {
      flags: 32768, // IS_COMPONENTS_V2 flag only (1 << 15)
      components: [mapExplorerContainer]
    };
    
  } catch (error) {
    console.error('Error creating Map Explorer menu:', error);
    throw error;
  }
}

/**
 * Updates the map image and regenerates fog of war maps
 * @param {Guild} guild - Discord guild object
 * @param {string} userId - User ID updating the map
 * @param {string} mapUrl - Discord CDN URL of the new map image
 * @returns {Object} Result with success status and message
 */
async function updateMapImage(guild, userId, mapUrl) {
  try {
    console.log(`🔄 Starting map image update for guild ${guild.id}`);
    
    // Load safari content data
    let safariData = await loadSafariContent();
    
    // Check if map exists
    const activeMapId = safariData[guild.id]?.maps?.active;
    if (!activeMapId) {
      return {
        success: false,
        message: '❌ No active map found to update.'
      };
    }
    
    const mapData = safariData[guild.id].maps[activeMapId];
    if (!mapData) {
      return {
        success: false,
        message: '❌ Map data not found.'
      };
    }
    
    let progressMessages = [];
    progressMessages.push('🔄 Starting map update process...');
    
    // Download the new map image
    progressMessages.push('📥 Downloading new map image...');
    const response = await fetch(mapUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // Get image metadata to validate dimensions
    const metadata = await sharp(imageBuffer).metadata();
    progressMessages.push(`✅ Image downloaded: ${metadata.width}x${metadata.height} pixels`);
    
    // Create a temporary file for the new map
    const tempMapPath = path.join(__dirname, 'img', guild.id, `temp_${Date.now()}.png`);
    await fs.mkdir(path.dirname(tempMapPath), { recursive: true });
    await sharp(imageBuffer).toFile(tempMapPath);
    
    // Initialize grid system with the new map
    const gridSystem = new MapGridSystem(tempMapPath, {
      gridSize: mapData.gridSize,
      borderSize: 80,
      lineWidth: 4,
      fontSize: 40,
      labelStyle: 'standard'
    });
    
    await gridSystem.initialize();
    
    // Validate dimensions match
    const expectedWidth = gridSystem.totalWidth;
    const expectedHeight = gridSystem.totalHeight;
    
    // Create the map with grid overlay
    const outputPath = path.join(__dirname, 'img', guild.id, `${activeMapId}_updated.png`);
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
          input: tempMapPath,
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
    
    progressMessages.push('✅ Generated updated map with grid overlay');
    
    // Upload the updated map to Discord
    progressMessages.push('📤 Uploading updated map to Discord...');
    const discordImageUrl = await uploadImageToDiscord(guild, outputPath, `${activeMapId}_updated.png`);
    progressMessages.push('✅ Map image uploaded to Discord CDN');
    
    // Update map data with new image URL
    mapData.discordImageUrl = discordImageUrl;
    mapData.lastUpdated = new Date().toISOString();
    mapData.updatedBy = userId;
    
    // Generate fog of war maps for each coordinate
    progressMessages.push(`🌫️ Generating fog of war maps for ${Object.keys(mapData.coordinates).length} locations...`);
    
    const coordinates = Object.keys(mapData.coordinates);
    const { DiscordRequest } = await import('./utils.js');
    
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i];
      const coordData = mapData.coordinates[coord];
      
      if (!coordData.anchorMessageId || !coordData.channelId) {
        console.log(`⏭️ Skipping ${coord} - no anchor message`);
        continue;
      }
      
      try {
        // Create fog of war map for this specific coordinate
        const fogOfWarBuffer = await createFogOfWarMap(outputPath, gridSystem, coord, coordinates);
        
        // Upload fog map to storage channel
        let storageChannel = guild.channels.cache.find(ch => ch.name === 'map-storage' && ch.type === 0);
        if (!storageChannel) {
          storageChannel = await guild.channels.create({
            name: 'map-storage',
            type: 0,
            topic: 'Storage for map images - do not delete',
            permissionOverwrites: [{
              id: guild.roles.everyone.id,
              deny: ['ViewChannel', 'SendMessages']
            }]
          });
        }
        
        const { AttachmentBuilder } = await import('discord.js');
        const attachment = new AttachmentBuilder(fogOfWarBuffer, { 
          name: `${coord.toLowerCase()}_fogmap_updated.png` 
        });
        
        const storageMessage = await storageChannel.send({
          content: `Updated fog map for ${coord}`,
          files: [attachment]
        });
        const fogMapUrl = storageMessage.attachments.first()?.url;
        
        // Store fog map URL in coordinate data for persistence
        safariData[guild.id].maps[activeMapId].coordinates[coord].fogMapUrl = fogMapUrl;
        console.log(`💾 map_update: Updated fog map URL for ${coord}: ${fogMapUrl}`);
        
        // Rebuild anchor message components using stored data
        const { createAnchorMessageComponents } = await import('./safariButtonHelper.js');
        const updatedComponents = await createAnchorMessageComponents(coordData, guild.id, coord, fogMapUrl);
        
        // Update the anchor message
        await DiscordRequest(`channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, {
          method: 'PATCH',
          body: {
            flags: (1 << 15), // IS_COMPONENTS_V2
            components: updatedComponents
          }
        });
        
        console.log(`✅ Updated fog map for ${coord} (${i + 1}/${coordinates.length})`);
        
        // Rate limiting
        if ((i + 1) % 5 === 0 && i < coordinates.length - 1) {
          progressMessages.push(`⏳ Progress: ${i + 1}/${coordinates.length} fog maps updated...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`❌ Failed to update fog map for ${coord}:`, error);
        progressMessages.push(`⚠️ Failed to update ${coord}: ${error.message}`);
      }
    }
    
    // Save updated safari data
    await saveSafariContent(safariData);
    progressMessages.push('✅ Map data saved');
    
    // Clean up temporary files
    try {
      await fs.unlink(tempMapPath);
      // Keep the updated map file as backup
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
    
    progressMessages.push(`🎉 **Map update complete!**`);
    progressMessages.push(`• Updated ${coordinates.length} fog of war maps`);
    progressMessages.push(`• New map saved and distributed`);
    
    return {
      success: true,
      message: progressMessages.join('\n')
    };
    
  } catch (error) {
    console.error('Error updating map image:', error);
    return {
      success: false,
      message: `❌ Error updating map: ${error.message}`
    };
  }
}

/**
 * Creates a map grid for the guild using a custom image URL
 * @param {Guild} guild - Discord guild object
 * @param {string} userId - User ID creating the map
 * @param {string} mapUrl - Discord CDN URL of the map image
 * @returns {Object} Result with success status and message
 */
async function createMapGridWithCustomImage(guild, userId, mapUrl) {
  try {
    console.log(`🏗️ Creating map grid with custom image for guild ${guild.id}`);
    
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
    
    let progressMessages = [];
    progressMessages.push('🏗️ Starting map creation with custom image...');
    
    // Download the custom map image
    progressMessages.push('📥 Downloading custom map image...');
    const response = await fetch(mapUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // Validate it's an image
    const metadata = await sharp(imageBuffer).metadata();
    progressMessages.push(`✅ Image downloaded: ${metadata.width}x${metadata.height} pixels`);
    
    // Generate map data
    const gridSize = 7; // 7x7 grid
    const timestamp = Date.now();
    const mapId = `map_${gridSize}x${gridSize}_${timestamp}`;
    
    // Create directory for guild images if it doesn't exist
    const guildDir = path.join(__dirname, 'img', guild.id);
    await fs.mkdir(guildDir, { recursive: true });
    
    // Save the custom image temporarily
    const tempMapPath = path.join(guildDir, `temp_${timestamp}.png`);
    await sharp(imageBuffer).toFile(tempMapPath);
    
    // Generate map with grid overlay
    const outputPath = path.join(guildDir, `${mapId}.png`);
    
    const gridSystem = new MapGridSystem(tempMapPath, {
      gridSize: gridSize,
      borderSize: 80,
      lineWidth: 4,
      fontSize: 40,
      labelStyle: 'standard'
    });
    
    // Initialize grid system and generate SVG overlay
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
          input: tempMapPath,
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
    progressMessages.push('✅ Generated map with grid overlay');
    
    // Clean up temp file
    await fs.unlink(tempMapPath);
    
    // Create map category
    progressMessages.push('🏗️ Creating map category...');
    
    // Upload map image to Discord and get CDN URL
    progressMessages.push('📤 Uploading map image to Discord...');
    const discordImageUrl = await uploadImageToDiscord(guild, outputPath, `${mapId}.png`);
    console.log(`📤 Map image uploaded to Discord CDN: ${discordImageUrl}`);
    progressMessages.push('✅ Map image uploaded to Discord CDN');
    
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
    
    // Generate coordinate list for 7x7 grid
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
      discordImageUrl: discordImageUrl, // Store Discord CDN URL
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
      },
      blacklistedCoordinates: [] // Array to store restricted coordinates
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
        specialEvents: [],
        fogMapUrl: null // Store fog of war map URL persistently
      };
    }
    
    // Set the map as active
    safariData[guild.id].maps.active = mapId;
    safariData[guild.id].maps[mapId] = mapData;
    
    // Save safari content data
    await saveSafariContent(safariData);
    
    progressMessages.push('✅ Map data structure created and saved');
    
    // Post fog of war maps to each channel
    progressMessages.push('🌫️ Generating fog of war maps for each location...');
    await postFogOfWarMapsToChannels(guild, outputPath, gridSystem, channels, coordinates);
    progressMessages.push('✅ Fog of war maps posted to all channels');
    
    progressMessages.push(`🎉 **Map creation complete!**`);
    progressMessages.push(`• Grid Size: ${gridSize}x${gridSize}`);
    progressMessages.push(`• Total Locations: ${coordinates.length}`);
    progressMessages.push(`• Category: ${category.name}`);
    progressMessages.push(`• Custom Image: Used`);
    
    return {
      success: true,
      message: progressMessages.join('\n')
    };
    
  } catch (error) {
    console.error('Error creating map grid with custom image:', error);
    return {
      success: false,
      message: `❌ Error creating map: ${error.message}`
    };
  }
}

/**
 * Check if a coordinate is blacklisted for a given map
 * @param {string} guildId - Discord guild ID
 * @param {string} coordinate - Coordinate to check (e.g., "A1", "B3")
 * @returns {boolean} True if blacklisted, false otherwise
 */
export async function isCoordinateBlacklisted(guildId, coordinate) {
  console.log(`🔍 DEBUG: isCoordinateBlacklisted called - guildId: ${guildId}, coordinate: ${coordinate}`);
  
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  
  console.log(`🔍 DEBUG: activeMapId: ${activeMapId}`);
  
  if (!activeMapId) {
    console.log(`🔍 DEBUG: No active map found, returning false`);
    return false;
  }
  
  const mapData = safariData[guildId]?.maps?.[activeMapId];
  const blacklistedCoordinates = mapData?.blacklistedCoordinates || [];
  
  console.log(`🔍 DEBUG: blacklistedCoordinates:`, blacklistedCoordinates);
  console.log(`🔍 DEBUG: coordinate ${coordinate} is blacklisted: ${blacklistedCoordinates.includes(coordinate)}`);
  
  return blacklistedCoordinates.includes(coordinate);
}

/**
 * Update the blacklisted coordinates for a map
 * @param {string} guildId - Discord guild ID
 * @param {Array<string>} coordinatesList - Array of blacklisted coordinates
 * @returns {Object} Result with success status and message
 */
export async function updateBlacklistedCoordinates(guildId, coordinatesList) {
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
    
    // Update navigation blocked properties for all coordinates
    const mapData = safariData[guildId].maps[activeMapId];
    const coordinates = mapData.coordinates || {};
    
    // First, reset all blocked properties to false
    for (const coord in coordinates) {
      const coordData = coordinates[coord];
      if (coordData.navigation) {
        for (const direction in coordData.navigation) {
          if (coordData.navigation[direction] && coordData.navigation[direction].to) {
            coordData.navigation[direction].blocked = false;
          }
        }
      }
    }
    
    // Then set blocked = true for any navigation pointing to blacklisted coordinates
    for (const coord in coordinates) {
      const coordData = coordinates[coord];
      if (coordData.navigation) {
        for (const direction in coordData.navigation) {
          const navData = coordData.navigation[direction];
          if (navData && navData.to && coordinatesList.includes(navData.to)) {
            navData.blocked = true;
            console.log(`🚫 DEBUG: Set ${coord} -> ${direction} (${navData.to}) as blocked`);
          }
        }
      }
    }
    
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

// Export functions
// createMapGrid removed - legacy hardcoded map functionality replaced by createMapGridWithCustomImage
export { deleteMapGrid, createMapExplorerMenu, updateMapImage, createMapGridWithCustomImage, loadSafariContent, saveSafariContent };