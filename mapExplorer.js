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
 * Convert column index to Excel-style column label (0=A, 25=Z, 26=AA, etc.)
 * @param {number} index - Zero-based column index
 * @returns {string} Excel-style column label
 */
function getExcelColumn(index) {
  let column = '';
  while (index >= 0) {
    column = String.fromCharCode(65 + (index % 26)) + column;
    index = Math.floor(index / 26) - 1;
  }
  return column;
}

/**
 * Convert Excel-style column label to column index
 * @param {string} column - Excel-style column label (A, AA, etc.)
 * @returns {number} Zero-based column index
 */
function parseExcelColumn(column) {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + (column.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * Generate coordinate string from x,y position
 * @param {number} x - Column index (0-based)
 * @param {number} y - Row index (0-based)
 * @returns {string} Coordinate string (e.g., "A1", "AA10")
 */
function generateCoordinate(x, y) {
  return `${getExcelColumn(x)}${y + 1}`;
}

/**
 * Parse coordinate string to x,y position
 * @param {string} coord - Coordinate string (e.g., "A1", "AA10")
 * @returns {{x: number, y: number}} Zero-based x,y position
 */
function parseCoordinate(coord) {
  const match = coord.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid coordinate: ${coord}`);
  }
  const x = parseExcelColumn(match[1]);
  const y = parseInt(match[2]) - 1;
  return { x, y };
}

/**
 * Get grid dimensions with backwards compatibility
 * @param {Object} mapData - Map data object
 * @returns {{width: number, height: number}} Grid dimensions
 */
function getGridDimensions(mapData) {
  if (mapData.gridWidth && mapData.gridHeight) {
    return { width: mapData.gridWidth, height: mapData.gridHeight };
  }
  // Fallback for old maps
  const gridSize = mapData.gridSize || 7;
  return { width: gridSize, height: gridSize };
}

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
    
    // Find or create storage channel (backwards compatible - renames old channel if found)
    let storageChannel = guild.channels.cache.find(ch => (ch.name === '🗺️map-storage' || ch.name === 'map-storage') && ch.type === 0);
    if (storageChannel && storageChannel.name === 'map-storage') {
      try { await storageChannel.setName('🗺️map-storage'); } catch (e) { /* rate limited or no perms */ }
    }

    if (!storageChannel) {
      storageChannel = await guild.channels.create({
        name: '🗺️map-storage',
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

    // Return the Discord CDN URL - cleaned of trailing ampersand
    // Also return message/channel IDs so we can fetch fresh URLs later
    const rawUrl = message.attachments.first().url;
    const cleanUrl = rawUrl.trim().replace(/&+$/, '');
    console.log(`📤 Upload: Raw URL had trailing &: ${rawUrl.endsWith('&')}, Clean URL: ${cleanUrl}`);
    console.log(`📤 Upload: Storage message ID: ${message.id}, Channel ID: ${storageChannel.id}`);

    return {
      url: cleanUrl,
      messageId: message.id,
      channelId: storageChannel.id
    };
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
        let storageChannel = guild.channels.cache.find(ch => (ch.name === '🗺️map-storage' || ch.name === 'map-storage') && ch.type === 0);
        if (storageChannel && storageChannel.name === 'map-storage') {
          try { await storageChannel.setName('🗺️map-storage'); } catch (e) { /* rate limited or no perms */ }
        }
        if (!storageChannel) {
          storageChannel = await guild.channels.create({
            name: '🗺️map-storage',
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
      gridWidth: gridWidth,
      gridHeight: gridHeight,
      gridSize: Math.max(gridWidth, gridHeight), // Keep for backwards compatibility
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
    const uploadResult = await uploadImageToDiscord(guild, outputPath, `${mapId}.png`);
    const discordImageUrl = uploadResult.url || uploadResult; // Backwards compatibility
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
      name: guild.name || 'Adventure Island',
      gridWidth: gridWidth,
      gridHeight: gridHeight,
      gridSize: Math.max(gridWidth, gridHeight), // Keep for backwards compatibility
      imageFile: outputPath.replace(__dirname + '/', ''),
      discordImageUrl: discordImageUrl, // Store Discord CDN URL
      mapStorageMessageId: uploadResult.messageId, // Store for URL refresh
      mapStorageChannelId: uploadResult.channelId, // Store for URL refresh
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
        navigation: generateNavigation(coord, gridWidth || 7, gridHeight || 7),
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
    progressMessages.push(`• Grid Size: ${gridWidth || 7}x${gridHeight || 7}`);
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

    // Collect all category IDs to delete (supports multi-category maps)
    const categoryIds = [];
    if (mapData.categories && mapData.categories.length > 0) {
      categoryIds.push(...mapData.categories);
    } else if (mapData.category) {
      categoryIds.push(mapData.category);
    }

    // Delete channels from ALL categories using API fetch (not cache)
    let totalDeletedChannels = 0;
    for (const categoryId of categoryIds) {
      try {
        const category = await guild.channels.fetch(categoryId).catch(() => null);
        if (!category) {
          progressMessages.push(`⚠️ Category ${categoryId} not found (already deleted?)`);
          continue;
        }
        progressMessages.push(`📁 Found category: ${category.name}`);

        // Fetch ALL channels from API (not cache — cache only holds ~50)
        const allChannels = await guild.channels.fetch();
        const channelsInCategory = allChannels.filter(ch => ch && ch.parentId === categoryId);
        progressMessages.push(`📍 Found ${channelsInCategory.size} channels in ${category.name}`);

        // Delete channels with rate limiting
        let deletedCount = 0;
        for (const [channelId, channel] of channelsInCategory) {
          try {
            await channel.delete('Map deletion');
            deletedCount++;
            totalDeletedChannels++;
            console.log(`Deleted channel: ${channel.name} (${deletedCount}/${channelsInCategory.size})`);

            // Rate limiting: pause every 5 deletions
            if (deletedCount % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error) {
            console.error(`Failed to delete channel ${channel.name}:`, error);
          }
        }

        progressMessages.push(`✅ Deleted ${deletedCount} channels from ${category.name}`);

        // Delete the category itself
        await category.delete('Map deletion');
        progressMessages.push(`✅ Deleted category: ${category.name}`);
      } catch (error) {
        console.error(`Error deleting category ${categoryId}:`, error);
        progressMessages.push(`⚠️ Error deleting category: ${error.message}`);
      }
    }

    if (totalDeletedChannels > 0) {
      progressMessages.push(`✅ Total: ${totalDeletedChannels} channels deleted across ${categoryIds.length} categories`);
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
 * @param {string} coord - Coordinate like "A1" or "AA1"
 * @param {number} gridWidth - Width of the grid (columns)
 * @param {number} gridHeight - Height of the grid (rows)
 * @returns {Object} Navigation options
 */
function generateNavigation(coord, gridWidth, gridHeight) {
  const { x, y } = parseCoordinate(coord);
  
  const nav = {
    north: null,
    east: null,
    south: null,
    west: null,
    northeast: null,
    northwest: null,
    southeast: null,
    southwest: null
  };
  
  // North (y - 1)
  if (y > 0) {
    nav.north = {
      to: generateCoordinate(x, y - 1),
      visible: true,
      blocked: false
    };
  }
  
  // East (x + 1)
  if (x < gridWidth - 1) {
    nav.east = {
      to: generateCoordinate(x + 1, y),
      visible: true,
      blocked: false
    };
  }
  
  // South (y + 1)
  if (y < gridHeight - 1) {
    nav.south = {
      to: generateCoordinate(x, y + 1),
      visible: true,
      blocked: false
    };
  }
  
  // West (x - 1)
  if (x > 0) {
    nav.west = {
      to: generateCoordinate(x - 1, y),
      visible: true,
      blocked: false
    };
  }
  
  // Northeast
  if (y > 0 && x < gridWidth - 1) {
    nav.northeast = {
      to: generateCoordinate(x + 1, y - 1),
      visible: true,
      blocked: false
    };
  }
  
  // Northwest
  if (y > 0 && x > 0) {
    nav.northwest = {
      to: generateCoordinate(x - 1, y - 1),
      visible: true,
      blocked: false
    };
  }
  
  // Southeast
  if (y < gridHeight - 1 && x < gridWidth - 1) {
    nav.southeast = {
      to: generateCoordinate(x + 1, y + 1),
      visible: true,
      blocked: false
    };
  }
  
  // Southwest
  if (y < gridHeight - 1 && x > 0) {
    nav.southwest = {
      to: generateCoordinate(x - 1, y + 1),
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
      .setLabel('Blacklist')
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
      { type: 14 }, // Separator (Components V2)
      mapButtonRow.toJSON(),
      { type: 14 }, // Separator (Components V2)
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

    // Post original pre-grid image to map-storage for reference/fallback
    try {
      const { AttachmentBuilder } = await import('discord.js');
      let storageChannel = guild.channels.cache.find(ch => (ch.name === '🗺️map-storage' || ch.name === 'map-storage') && ch.type === 0);
      if (storageChannel) {
        const origAttachment = new AttachmentBuilder(imageBuffer, { name: `original_${Date.now()}.png` });
        await storageChannel.send({
          content: `🖼️ Original pre-map image for ${guild.name} (updated ${new Date().toISOString().split('T')[0]})`,
          files: [origAttachment]
        });
        progressMessages.push('🖼️ Original image saved to map-storage');
      }
    } catch (e) {
      console.log(`⚠️ Could not post original image to storage: ${e.message}`);
    }

    // Create a temporary file for the new map
    const tempMapPath = path.join(__dirname, 'img', guild.id, `temp_${Date.now()}.png`);
    await fs.mkdir(path.dirname(tempMapPath), { recursive: true });
    await sharp(imageBuffer).toFile(tempMapPath);

    // Initialize grid system with the new map
    const gridSystem = new MapGridSystem(tempMapPath, {
      gridWidth: mapData.gridWidth || mapData.gridSize || 7,
      gridHeight: mapData.gridHeight || mapData.gridSize || 7,
      gridSize: mapData.gridSize, // Keep for backwards compatibility
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
    const uploadResult = await uploadImageToDiscord(guild, outputPath, `${activeMapId}_updated.png`);
    progressMessages.push('✅ Map image uploaded to Discord CDN');

    // Update map data with new image URL and storage info
    mapData.discordImageUrl = uploadResult.url || uploadResult; // Backwards compatibility
    mapData.mapStorageMessageId = uploadResult.messageId;
    mapData.mapStorageChannelId = uploadResult.channelId;
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
        let storageChannel = guild.channels.cache.find(ch => (ch.name === '🗺️map-storage' || ch.name === 'map-storage') && ch.type === 0);
        if (storageChannel && storageChannel.name === 'map-storage') {
          try { await storageChannel.setName('🗺️map-storage'); } catch (e) { /* rate limited or no perms */ }
        }
        if (!storageChannel) {
          storageChannel = await guild.channels.create({
            name: '🗺️map-storage',
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
 * @param {number} gridWidth - Number of columns (default 7)
 * @param {number} gridHeight - Number of rows (default 7)
 * @returns {Object} Result with success status and message
 */
async function createMapGridWithCustomImage(guild, userId, mapUrl, gridWidth = 7, gridHeight = 7) {
  try {
    console.log(`🏗️ Creating map grid with custom image for guild ${guild.id} - dimensions: ${gridWidth}x${gridHeight}`);
    
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
    progressMessages.push(`🏗️ Starting map creation with custom image (${gridWidth}x${gridHeight})...`);
    
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
    const timestamp = Date.now();
    const mapId = `map_${gridWidth}x${gridHeight}_${timestamp}`;
    
    // Create directory for guild images if it doesn't exist
    const guildDir = path.join(__dirname, 'img', guild.id);
    await fs.mkdir(guildDir, { recursive: true });
    
    // Save the custom image temporarily
    const tempMapPath = path.join(guildDir, `temp_${timestamp}.png`);
    await sharp(imageBuffer).toFile(tempMapPath);
    
    // Generate map with grid overlay
    const outputPath = path.join(guildDir, `${mapId}.png`);
    
    const gridSystem = new MapGridSystem(tempMapPath, {
      gridWidth: gridWidth,
      gridHeight: gridHeight,
      gridSize: Math.max(gridWidth, gridHeight), // Keep for backwards compatibility
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
    
    // Post original pre-grid image to map-storage FIRST (before grid image)
    progressMessages.push('📤 Uploading images to Discord...');
    try {
      const { AttachmentBuilder } = await import('discord.js');
      // Find or create storage channel (same logic as uploadImageToDiscord)
      let storageChannel = guild.channels.cache.find(ch => (ch.name === '🗺️map-storage' || ch.name === 'map-storage') && ch.type === 0);
      if (storageChannel && storageChannel.name === 'map-storage') {
        try { await storageChannel.setName('🗺️map-storage'); } catch (e) { /* rate limited */ }
      }
      if (!storageChannel) {
        storageChannel = await guild.channels.create({
          name: '🗺️map-storage',
          type: 0,
          topic: 'Storage for map images - do not delete',
          permissionOverwrites: [{ id: guild.roles.everyone.id, deny: ['ViewChannel', 'SendMessages'] }]
        });
      }
      const origAttachment = new AttachmentBuilder(imageBuffer, { name: `original_${Date.now()}.png` });
      await storageChannel.send({
        content: `🖼️ Original pre-map image for ${guild.name} (created ${new Date().toISOString().split('T')[0]})`,
        files: [origAttachment]
      });
      progressMessages.push('🖼️ Original image saved to map-storage');
    } catch (e) {
      console.log(`⚠️ Could not post original image to storage: ${e.message}`);
    }

    // Upload grid image to Discord (storage channel already exists)
    const uploadResult = await uploadImageToDiscord(guild, outputPath, `${mapId}.png`);
    const discordImageUrl = uploadResult.url || uploadResult;
    console.log(`📤 Map image uploaded to Discord CDN: ${discordImageUrl}`);
    progressMessages.push('✅ Grid map image uploaded to Discord CDN');

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

    // Generate coordinate list for custom grid
    const coordinates = [];
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const coord = generateCoordinate(x, y);
        coordinates.push(coord);
      }
    }
    
    // Create channels with rate limiting and category splitting
    const channels = {};
    const categories = [category]; // Start with the first category
    let currentCategory = category;
    let channelsInCurrentCategory = 0;
    const MAX_CHANNELS_PER_CATEGORY = 50; // Discord's limit per category
    
    progressMessages.push(`📍 Creating ${coordinates.length} channels...`);
    
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i];
      
      // Check if we need a new category
      if (channelsInCurrentCategory >= MAX_CHANNELS_PER_CATEGORY) {
        const groupNumber = Math.floor(i / MAX_CHANNELS_PER_CATEGORY) + 1;
        progressMessages.push(`📂 Creating new category: Map Explorer - Group ${groupNumber}`);
        
        currentCategory = await guild.channels.create({
          name: `🗺️ Map Explorer - Group ${groupNumber}`,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
        
        categories.push(currentCategory);
        channelsInCurrentCategory = 0;
        progressMessages.push(`✅ Created category: ${currentCategory.name}`);
      }
      
      // Rate limiting: 5 channels per 5 seconds
      if (i > 0 && i % 5 === 0) {
        progressMessages.push(`⏳ Rate limiting... (${i}/${coordinates.length} channels created)`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      try {
        const channel = await guild.channels.create({
          name: coord.toLowerCase(),
          type: ChannelType.GuildText,
          parent: currentCategory.id,
          topic: `Map location ${coord} - Use buttons to explore!`,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            }
          ]
        });
        
        channels[coord] = channel.id;
        channelsInCurrentCategory++;
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
      name: guild.name || 'Adventure Island',
      gridWidth: gridWidth,
      gridHeight: gridHeight,
      gridSize: Math.max(gridWidth, gridHeight), // Keep for backwards compatibility
      imageFile: outputPath.replace(__dirname + '/', ''),
      discordImageUrl: discordImageUrl, // Store Discord CDN URL
      mapStorageMessageId: uploadResult.messageId, // Store for URL refresh
      mapStorageChannelId: uploadResult.channelId, // Store for URL refresh
      category: category.id,
      categories: categories.map(cat => cat.id), // Store all category IDs
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
        navigation: generateNavigation(coord, gridWidth || 7, gridHeight || 7),
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
    progressMessages.push(`• Grid Size: ${gridWidth || 7}x${gridHeight || 7}`);
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

/**
 * Generate dynamic multi-color legend for reverse blacklist items
 *
 * @param {Array} sortedItems - Reverse blacklist items sorted by priority (lastModified desc → alphabetical)
 * @param {Map} itemColorMap - Map of itemId -> color object with emoji and name
 * @param {Array} blacklistedCoords - Array of blacklisted coordinate strings
 * @returns {string} Formatted legend text with color coding and warnings
 */
export function generateMultiColorLegend(sortedItems, itemColorMap, blacklistedCoords) {
  const legendLines = ['**Legend:**', '🟥 Red overlay = Blacklisted (impossible to pass)'];

  // Add color lines for first 4 items (unique colors)
  sortedItems.slice(0, 4).forEach((item, index) => {
    const color = itemColorMap.get(item.id);
    legendLines.push(`${color.emoji} ${color.name} overlay = ${item.emoji} ${item.name}`);
  });

  // Add brown overflow line if 5+ items
  if (sortedItems.length >= 5) {
    legendLines.push('🟫 Brown overlay = Reverse blacklist unlock (various items)');
  }

  legendLines.push('⬜ No overlay = Normal access');

  // Add reverse blacklist items section with warnings for non-blacklisted coords
  legendLines.push('', '**Reverse Blacklist Items:**');
  let hasNonBlacklistedCoords = false;

  sortedItems.forEach(item => {
    const coords = item.coordinates || [];
    const formattedCoords = coords.map(coord => {
      if (!blacklistedCoords.includes(coord)) {
        hasNonBlacklistedCoords = true;
        return `${coord}¹`;  // Add superscript warning
      }
      return coord;
    }).join(', ');

    legendLines.push(`• ${item.emoji} ${item.name}: ${formattedCoords}`);
  });

  // Add warning footnote if any non-blacklisted coords were found
  if (hasNonBlacklistedCoords) {
    legendLines.push('', '¹ You need to add these coordinates to the Blacklist, or players will be able to access it even without the item!');
  }

  return legendLines.join('\n');
}

/**
 * Generate a map image with blacklist overlays (multi-color enhancement)
 *
 * @param {string} guildId - Guild ID
 * @param {string} originalImageUrl - Discord CDN URL of original clean map
 * @param {number} gridSize - Map grid size (e.g., 7 for 7x7)
 * @param {Object} client - Discord.js client instance
 * @returns {Promise<string>} Discord CDN URL of overlaid image
 */
export async function generateBlacklistOverlay(guildId, originalImageUrl, gridSize, client) {
  try {
    console.log(`🎨 Generating blacklist overlay for guild ${guildId}`);

    // Step 1: Get fresh URL by fetching the storage message
    // Discord CDN URLs expire after 24h, so we need to fetch fresh auth parameters
    let freshImageUrl = originalImageUrl;

    try {
      const safariData = await loadSafariContent();
      const activeMapId = safariData[guildId]?.maps?.active;
      const mapData = safariData[guildId]?.maps?.[activeMapId];

      // If we have storage message info, fetch fresh URL
      if (mapData?.mapStorageMessageId && mapData?.mapStorageChannelId) {
        console.log(`🔄 Fetching fresh URL from storage message ${mapData.mapStorageMessageId}`);
        const { DiscordRequest } = await import('./utils.js');

        const message = await DiscordRequest(
          `channels/${mapData.mapStorageChannelId}/messages/${mapData.mapStorageMessageId}`,
          { method: 'GET' }
        );

        if (message?.attachments?.[0]?.url) {
          freshImageUrl = message.attachments[0].url.trim().replace(/&+$/, '');
          console.log(`✅ Got fresh URL with updated auth parameters`);
        }
      }
    } catch (fetchError) {
      console.warn(`⚠️ Could not fetch fresh URL, using stored URL: ${fetchError.message}`);
      freshImageUrl = originalImageUrl.trim().replace(/&+$/, '');
    }

    // Step 2: Download map image from Discord CDN
    const imageResponse = await fetch(freshImageUrl);

    // Check if the fetch was successful
    if (!imageResponse.ok) {
      console.error(`❌ Failed to fetch image from Discord CDN: ${imageResponse.status} ${imageResponse.statusText}`);
      console.error(`❌ URL: ${freshImageUrl}`);
      return originalImageUrl; // Return original URL as fallback
    }

    // Check content type to ensure it's an image
    const contentType = imageResponse.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      console.error(`❌ Invalid content type from Discord CDN: ${contentType}`);
      console.error(`❌ URL: ${freshImageUrl}`);
      return originalImageUrl; // Return original URL as fallback
    }

    const imageBuffer = await Buffer.from(await imageResponse.arrayBuffer());

    // Validate buffer is not empty
    if (!imageBuffer || imageBuffer.length === 0) {
      console.error(`❌ Empty image buffer from Discord CDN`);
      return originalImageUrl;
    }

    // Step 2: Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();

    // Account for border (80px on each side)
    const borderSize = 80;
    const innerWidth = metadata.width - (borderSize * 2);
    const innerHeight = metadata.height - (borderSize * 2);
    const cellWidth = innerWidth / gridSize;
    const cellHeight = innerHeight / gridSize;

    console.log(`📐 Map dimensions: ${metadata.width}x${metadata.height} (with ${borderSize}px border)`);
    console.log(`📐 Inner dimensions: ${innerWidth}x${innerHeight}, Cell size: ${cellWidth}x${cellHeight}`);

    // Step 3: Get blacklisted coordinates
    const blacklistedCoords = await getBlacklistedCoordinates(guildId);
    console.log(`🚫 Found ${blacklistedCoords.length} blacklisted cells: ${blacklistedCoords.join(', ')}`);

    // Step 4: Get reverse blacklist items WITH metadata
    const { getReverseBlacklistItemSummary } = await import('./playerLocationManager.js');
    const reverseBlacklistItems = await getReverseBlacklistItemSummary(guildId);

    // Step 4a: Define color palette for multi-color enhancement
    const COLOR_PALETTE = [
      { r: 0, g: 255, b: 0, alpha: 0.4, emoji: '🟩', name: 'Green' },    // 1st item
      { r: 255, g: 165, b: 0, alpha: 0.4, emoji: '🟧', name: 'Orange' }, // 2nd item
      { r: 255, g: 255, b: 0, alpha: 0.4, emoji: '🟨', name: 'Yellow' }, // 3rd item
      { r: 128, g: 0, b: 128, alpha: 0.4, emoji: '🟪', name: 'Purple' }, // 4th item
    ];
    const OVERFLOW_COLOR = { r: 139, g: 69, b: 19, alpha: 0.4, emoji: '🟫', name: 'Brown' };

    // Step 4b: Sort items by priority (lastModified desc → alphabetical)
    const sortedItems = reverseBlacklistItems.sort((a, b) => {
      const timestampA = a.metadata?.lastModified || 0;
      const timestampB = b.metadata?.lastModified || 0;

      if (timestampA !== timestampB) {
        return timestampB - timestampA;  // Most recent first
      }

      return a.name.localeCompare(b.name);  // Alphabetical fallback
    });

    console.log(`🔓 Found ${sortedItems.length} reverse blacklist items (sorted by priority)`);

    // Step 4c: Assign colors to items based on priority
    const itemColorMap = new Map();
    sortedItems.forEach((item, index) => {
      const color = index < 4 ? COLOR_PALETTE[index] : OVERFLOW_COLOR;
      itemColorMap.set(item.id, color);
      console.log(`  ${index + 1}. ${item.emoji} ${item.name} → ${color.emoji} ${color.name}`);
    });

    // Step 4d: Resolve overlapping coordinates (highest priority wins)
    const coordToItemMap = new Map();  // coord -> item
    for (const item of sortedItems) {
      for (const coord of item.coordinates || []) {
        if (!coordToItemMap.has(coord)) {
          coordToItemMap.set(coord, item);
        }
      }
    }

    console.log(`🎨 Resolved ${coordToItemMap.size} unique coordinate overlays`);

    // Step 5: Create overlay rectangles
    const overlays = [];

    // Helper function to convert coordinate to pixel position (accounting for border)
    const coordToPosition = (coord) => {
      const col = coord.charCodeAt(0) - 65;  // A=0, B=1, etc.
      const row = parseInt(coord.substring(1)) - 1;  // 1-based to 0-based
      return {
        left: Math.floor(borderSize + (col * cellWidth)),
        top: Math.floor(borderSize + (row * cellHeight))
      };
    };

    // Red overlay for blacklisted cells (drawn first, underneath colored overlays)
    for (const coord of blacklistedCoords) {
      const pos = coordToPosition(coord);

      // Create red semi-transparent rectangle
      const redOverlay = await sharp({
        create: {
          width: Math.floor(cellWidth),
          height: Math.floor(cellHeight),
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 0.3 }  // 30% red
        }
      }).png().toBuffer();

      overlays.push({
        input: redOverlay,
        top: pos.top,
        left: pos.left
      });
    }

    // Colored overlays for reverse blacklist unlocks (drawn on top of red)
    for (const [coord, item] of coordToItemMap) {
      if (blacklistedCoords.includes(coord)) {
        const pos = coordToPosition(coord);
        const color = itemColorMap.get(item.id);

        const coloredOverlay = await sharp({
          create: {
            width: Math.floor(cellWidth),
            height: Math.floor(cellHeight),
            channels: 4,
            background: { r: color.r, g: color.g, b: color.b, alpha: color.alpha }  // Extract only color values for Sharp
          }
        }).png().toBuffer();

        overlays.push({
          input: coloredOverlay,
          top: pos.top,
          left: pos.left
        });
      }
    }

    console.log(`🎨 Created ${overlays.length} overlay rectangles`);

    // If no overlays needed, return original URL
    if (overlays.length === 0) {
      console.log(`⏭️ No overlays needed, returning original image`);
      return originalImageUrl;
    }

    // Step 6: Composite all overlays onto the original image
    const overlaidImage = await sharp(imageBuffer)
      .composite(overlays)
      .png()
      .toBuffer();

    // Step 7: Save to temporary file
    const tempDir = path.join(__dirname, 'temp');
    if (!await fs.access(tempDir).then(() => true).catch(() => false)) {
      await fs.mkdir(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `map_overlay_${guildId}_${Date.now()}.png`);
    await sharp(overlaidImage).toFile(tempFilePath);

    console.log(`💾 Saved overlaid image to: ${tempFilePath}`);

    // Step 8: Upload to Discord and get CDN URL
    const guild = await client.guilds.fetch(guildId);
    const uploadResult = await uploadImageToDiscord(guild, tempFilePath, `map_overlay_${Date.now()}.png`);
    const discordUrl = uploadResult.url || uploadResult; // Backwards compatibility

    // Step 9: Clean up temporary file
    await fs.unlink(tempFilePath);
    console.log(`🗑️ Cleaned up temporary file: ${tempFilePath}`);

    console.log(`✅ Generated overlay image: ${discordUrl}`);
    return discordUrl;

  } catch (error) {
    console.error('❌ Error generating blacklist overlay:', error);
    // Fallback: Return original image URL if overlay fails
    return originalImageUrl;
  }
}

/**
 * Build Map Explorer response data structure (extracted for reusability)
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {Object} client - Discord client
 * @param {boolean} isEphemeral - Whether response should be ephemeral (default: true)
 * @returns {Promise<Object>} Response data structure with flags and components
 */
export async function buildMapExplorerResponse(guildId, userId, client, isEphemeral = true) {
  console.log(`🗺️ DEBUG: Building Map Explorer response for guild ${guildId}, ephemeral: ${isEphemeral}`);

  // Import ButtonBuilder for button creation
  const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');

  // Load safari content to check for existing maps
  const { loadSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  const guildMaps = safariData[guildId]?.maps || {};
  const activeMapId = guildMaps.active;
  const hasActiveMap = activeMapId && guildMaps[activeMapId];

  // Get pause status data (used in header and button label)
  const { getPausedPlayers, getSafariPlayers } = await import('./pausedPlayersManager.js');
  const pausedPlayersList = hasActiveMap ? await getPausedPlayers(guildId) : [];
  const safariPlayersList = hasActiveMap ? await getSafariPlayers(guildId) : [];
  const pausedCount = pausedPlayersList.length;
  const totalPlayers = safariPlayersList.length;
  const pauseRatio = totalPlayers > 0 ? pausedCount / totalPlayers : 0;

  // Create header text based on map status
  const guild = client.guilds.cache.get(guildId);
  const guildName = guild?.name || 'Unknown Server';
  let headerText;
  if (hasActiveMap) {
    const activeMap = guildMaps[activeMapId];
    const gridW = activeMap.gridWidth || activeMap.gridSize || 7;
    const gridH = activeMap.gridHeight || activeMap.gridSize || 7;

    let statusText;
    if (pauseRatio >= 0.75) {
      statusText = '⏸️ Paused';
    } else if (pauseRatio > 0) {
      statusText = '⏯️ Some Players Paused';
    } else {
      statusText = '✅ Active';
    }

    headerText = `# 🗺️ Map Explorer\n\n**Active Map:** ${guildName}\n**Grid Size:** ${gridW}x${gridH}\n**Status:** ${statusText}\n**Source Images:** <#${activeMap.mapStorageChannelId || ''}> (don't delete!)`;
  } else {
    headerText = `# 🗺️ Map Explorer\n\n**No active map**\nCastBot will create a map, grid and channels for you - all you need to do is:\n1. Upload an image to any Discord channel\n2. Right click / long press the image\n3. Click **Copy Link** (computer) / **Copy Media Link** (phone)\n4. Click the **Create / Update Map** button below and paste it into the Discord Image URL text input.`;
  }

  // Build container components starting with text display
  const containerComponents = [
    {
      type: 10, // Text Display
      content: headerText
    },
    {
      type: 14 // Separator
    }
  ];

  // Add Media Gallery with overlay if there's an active map with Discord CDN URL
  if (hasActiveMap && guildMaps[activeMapId].discordImageUrl) {
    console.log(`🖼️ DEBUG: Generating blacklist overlay for map from Discord CDN: ${guildMaps[activeMapId].discordImageUrl}`);

    // Generate overlay image with blacklist indicators
    let imageUrl = guildMaps[activeMapId].discordImageUrl;
    try {
      imageUrl = await generateBlacklistOverlay(
        guildId,
        guildMaps[activeMapId].discordImageUrl,  // Original clean map
        guildMaps[activeMapId].gridSize,
        client
      );
      console.log(`✅ Using overlaid image: ${imageUrl}`);
    } catch (error) {
      console.error(`❌ Error generating overlay, using original: ${error.message}`);
      // Fallback to original image
    }

    containerComponents.push({
      type: 12, // Media Gallery
      items: [
        {
          media: {
            url: imageUrl
          }
        }
      ]
    });

    // Generate multi-color legend with per-item color coding
    console.log(`🔍 DEBUG Map Explorer: Generating multi-color legend for guild ${guildId}`);

    let legendContent = '';

    // Get reverse blacklist items with metadata
    const { getReverseBlacklistItemSummary } = await import('./playerLocationManager.js');
    const reverseBlacklistItems = await getReverseBlacklistItemSummary(guildId);

    if (reverseBlacklistItems.length > 0) {
      // Define color palette (same as in generateBlacklistOverlay)
      const COLOR_PALETTE = [
        { r: 0, g: 255, b: 0, alpha: 0.4, emoji: '🟩', name: 'Green' },
        { r: 255, g: 165, b: 0, alpha: 0.4, emoji: '🟧', name: 'Orange' },
        { r: 255, g: 255, b: 0, alpha: 0.4, emoji: '🟨', name: 'Yellow' },
        { r: 128, g: 0, b: 128, alpha: 0.4, emoji: '🟪', name: 'Purple' },
      ];
      const OVERFLOW_COLOR = { r: 139, g: 69, b: 19, alpha: 0.4, emoji: '🟫', name: 'Brown' };

      // Sort items by priority (lastModified desc → alphabetical)
      const sortedItems = reverseBlacklistItems.sort((a, b) => {
        const timestampA = a.metadata?.lastModified || 0;
        const timestampB = b.metadata?.lastModified || 0;
        if (timestampA !== timestampB) {
          return timestampB - timestampA;
        }
        return a.name.localeCompare(b.name);
      });

      // Assign colors to items
      const itemColorMap = new Map();
      sortedItems.forEach((item, index) => {
        const color = index < 4 ? COLOR_PALETTE[index] : OVERFLOW_COLOR;
        itemColorMap.set(item.id, color);
      });

      // Get blacklisted coordinates for warning detection
      const blacklistedCoords = await getBlacklistedCoordinates(guildId);

      // Generate multi-color legend with warnings for non-blacklisted coords
      legendContent = generateMultiColorLegend(sortedItems, itemColorMap, blacklistedCoords);
    } else {
      // No reverse blacklist items - show basic legend
      legendContent = `**Legend:**
🟥 Red overlay = Blacklisted (restricted access)
⬜ No overlay = Normal access`;
    }

    console.log(`🔍 DEBUG Map Explorer: Generated legend with ${reverseBlacklistItems.length} items`);

    containerComponents.push({
      type: 10,  // Text Display
      content: legendContent
    });

    containerComponents.push({
      type: 14 // Separator
    });
  } else if (hasActiveMap && guildMaps[activeMapId].imageFile) {
    // Fallback for maps without Discord CDN URL
    console.log(`🖼️ DEBUG: Map exists but no Discord CDN URL: ${guildMaps[activeMapId].imageFile}`);
    containerComponents.push({
      type: 10, // Text Display
      content: `📍 **Map Image:** \`${guildMaps[activeMapId].imageFile.split('/').pop()}\``
    });
    containerComponents.push({
      type: 14 // Separator
    });
  }

  // Create map management buttons
  const createUpdateButton = new ButtonBuilder()
    .setCustomId('map_update')
    .setLabel('Create / Update Map')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🗺️');

  const deleteButton = new ButtonBuilder()
    .setCustomId('map_delete')
    .setLabel('Delete Map')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🗑️');

  const playerLocationsButton = new ButtonBuilder()
    .setCustomId('map_player_locations')
    .setLabel('Player Locations')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('👥');

  // Set states based on whether map exists
  if (hasActiveMap) {
    deleteButton.setDisabled(false);
    playerLocationsButton.setDisabled(false);
  } else {
    deleteButton.setDisabled(true);
    playerLocationsButton.setDisabled(true);
  }

  // Create blacklist button
  const blacklistButton = new ButtonBuilder()
    .setCustomId('map_admin_blacklist')
    .setLabel('Blacklist')  // Changed from 'Blacklisted Coords'
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🚫')
    .setDisabled(!hasActiveMap);

  // Create refresh anchors button
  const refreshAnchorsButton = new ButtonBuilder()
    .setCustomId('map_admin_refresh_anchors')
    .setLabel('Refresh Anchors')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🔄')
    .setDisabled(!hasActiveMap);

  // Create paused players button (pausedCount already computed above for header)
  const pausedPlayersButton = new ButtonBuilder()
    .setCustomId('safari_paused_players')
    .setLabel(pausedCount > 0 ? `Paused Players (${pausedCount})` : 'Paused Players')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏸️')
    .setDisabled(!hasActiveMap);

  // Create Start Safari button for bulk player initialization
  const startSafariButton = new ButtonBuilder()
    .setCustomId('safari_start_safari')
    .setLabel('Start Safari')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🦁')
    .setDisabled(!hasActiveMap);

  // Create Remove Players button for bulk de-initialization
  const removePlayersButton = new ButtonBuilder()
    .setCustomId('safari_remove_players')
    .setLabel('Remove Players')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🚪')
    .setDisabled(!hasActiveMap);

  // Row 1: Map management
  const mapButtonRow1 = new ActionRowBuilder().addComponents([createUpdateButton, deleteButton]);

  // Row 2: Player lifecycle
  const mapButtonRow2 = new ActionRowBuilder().addComponents([startSafariButton, pausedPlayersButton, removePlayersButton]);

  // Row 3: Map views & data
  const locationEditorButton = new ButtonBuilder()
    .setCustomId('safari_location_editor')
    .setLabel('Location Editor')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('📍')
    .setDisabled(!hasActiveMap);

  const safariProgressButton = new ButtonBuilder()
    .setCustomId('safari_progress')
    .setLabel('Safari Progress')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🚀')
    .setDisabled(!hasActiveMap);

  const sharedMapButton = new ButtonBuilder()
    .setCustomId('safari_shared_map')
    .setLabel('Shared Map')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('🗺️')
    .setDisabled(!hasActiveMap);

  blacklistButton.setLabel('Blacklist Coords');

  const mapButtonRow3 = new ActionRowBuilder().addComponents([playerLocationsButton, sharedMapButton, blacklistButton, safariProgressButton]);

  // Row 4: Tools
  const mapButtonRow4 = new ActionRowBuilder().addComponents([locationEditorButton, refreshAnchorsButton]);

  // Create back button (only for ephemeral messages)
  if (isEphemeral) {
    const backButton = new ButtonBuilder()
      .setCustomId('prod_menu_back')
      .setLabel('← Menu')
      .setStyle(ButtonStyle.Secondary);

    const backRow = new ActionRowBuilder().addComponents([backButton]);

    // Add action row components to container
    containerComponents.push(mapButtonRow1.toJSON());
    containerComponents.push(mapButtonRow2.toJSON());
    containerComponents.push({ type: 14 }); // Separator between player lifecycle and map tools
    containerComponents.push(mapButtonRow3.toJSON());
    containerComponents.push(mapButtonRow4.toJSON());
    containerComponents.push({
      type: 14 // Separator
    });
    containerComponents.push(backRow.toJSON());
  } else {
    // For non-ephemeral (shared) maps, no back button
    containerComponents.push(mapButtonRow1.toJSON());
    containerComponents.push(mapButtonRow2.toJSON());
    containerComponents.push({ type: 14 });
    containerComponents.push(mapButtonRow3.toJSON());
    containerComponents.push(mapButtonRow4.toJSON());
  }

  // Create container using Components V2 format
  const mapExplorerContainer = {
    type: 17, // Container component
    accent_color: 0x00AE86, // Teal accent for map theme
    components: containerComponents
  };

  console.log(`🔍 DEBUG: Built Map Explorer response, ephemeral: ${isEphemeral}`);

  return {
    flags: (1 << 15), // IS_COMPONENTS_V2 flag
    components: [mapExplorerContainer]
  };
}

// Export functions
// createMapGrid removed - legacy hardcoded map functionality replaced by createMapGridWithCustomImage
// buildMapExplorerResponse is exported directly with the function declaration above
export { deleteMapGrid, createMapExplorerMenu, updateMapImage, createMapGridWithCustomImage, loadSafariContent, saveSafariContent };