import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { createAnchorMessageComponents } from './safariButtonHelper.js';

/**
 * Validate component structure for Discord API compatibility
 * @param {Array} components - Array of components to validate
 * @returns {Array|null} Validated components or null if invalid
 */
function validateComponents(components) {
  if (!Array.isArray(components)) {
    console.error('Components must be an array');
    return null;
  }
  
  try {
    for (const component of components) {
      // Check if it's a valid container (type 17)
      if (component.type !== 17) {
        console.error(`Invalid top-level component type: ${component.type}, expected 17 (Container)`);
        return null;
      }
      
      if (!Array.isArray(component.components)) {
        console.error('Container must have components array');
        return null;
      }
      
      // Validate nested components
      for (const nestedComponent of component.components) {
        if (!validateNestedComponent(nestedComponent)) {
          return null;
        }
      }
    }
    
    console.log(`✅ Component validation passed for ${components.length} components`);
    return components;
  } catch (error) {
    console.error('Error validating components:', error);
    return null;
  }
}

/**
 * Validate individual nested component
 * @param {Object} component - Component to validate
 * @returns {boolean} True if valid
 */
function validateNestedComponent(component) {
  const validTypes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  
  if (!validTypes.includes(component.type)) {
    console.error(`Invalid component type: ${component.type}, valid types: ${validTypes.join(', ')}`);
    return false;
  }
  
  // Special validation for Action Rows (type 1)
  if (component.type === 1) {
    if (!Array.isArray(component.components)) {
      console.error('Action Row must have components array');
      return false;
    }
    
    if (component.components.length > 5) {
      console.error(`Action Row has ${component.components.length} components, maximum is 5`);
      return false;
    }
    
    // Validate nested components in action row
    for (const nestedComponent of component.components) {
      if (!validateNestedComponent(nestedComponent)) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Update anchor message for a map cell when content changes
 * @param {string} guildId - Discord guild ID
 * @param {string} coordinate - Map coordinate (e.g., "C3")
 * @param {Object} client - Discord client
 * @returns {boolean} Success status
 */
export async function updateAnchorMessage(guildId, coordinate, client) {
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  const coordData = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate];
  
  if (!coordData?.channelId) {
    console.error(`No channel ID found for ${coordinate}`);
    return false;
  }
  
  if (!coordData?.anchorMessageId) {
    console.warn(`⚠️ No anchor message ID found for ${coordinate}. The location may need to be initialized first.`);
    // This is not an error - some coordinates may not have anchor messages yet
    return true; // Return true to indicate this is expected behavior
  }
  
  try {
    const channel = await client.channels.fetch(coordData.channelId);
    const message = await channel.messages.fetch(coordData.anchorMessageId);
    
    // Get the fog map URL from the existing message
    let fogMapUrl = null;
    
    // Check all components for media gallery
    for (const container of message.components || []) {
      for (const component of container.components || []) {
        if (component.type === 12) { // Media gallery
          fogMapUrl = component.items?.[0]?.media?.url;
          if (fogMapUrl) break;
        }
      }
      if (fogMapUrl) break;
    }
    
    console.log(`🔍 Found fog map URL: ${fogMapUrl}`);
    
    // If no fog map URL found, try to recreate from storage channel
    if (!fogMapUrl) {
      const guild = await client.guilds.fetch(guildId);
      const storageChannel = guild.channels.cache.find(ch => ch.name === 'map-storage' && ch.type === 0);
      if (storageChannel) {
        const messages = await storageChannel.messages.fetch({ limit: 50 });
        const fogMessage = messages.find(m => m.content.includes(`Fog map for ${coordinate}`));
        if (fogMessage && fogMessage.attachments.size > 0) {
          fogMapUrl = fogMessage.attachments.first().url;
          console.log(`🔍 Recovered fog map URL from storage: ${fogMapUrl}`);
        }
      }
    }
    
    // Reconstruct the message with updated content
    const updatedComponents = await createAnchorMessageComponents(coordData, guildId, coordinate, fogMapUrl);
    
    // Validate components before sending to Discord
    const validatedComponents = validateComponents(updatedComponents);
    if (!validatedComponents) {
      console.error(`❌ Invalid components structure for ${coordinate}, skipping update`);
      return false;
    }
    
    // Use DiscordRequest for Components V2 editing
    const { DiscordRequest } = await import('./utils.js');
    await DiscordRequest(`channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, {
      method: 'PATCH',
      body: {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components: validatedComponents
      }
    });
    
    console.log(`✅ Updated anchor message for ${coordinate}`);
    return true;
  } catch (error) {
    console.error(`Failed to update anchor message for ${coordinate}:`, error);
    return false;
  }
}

/**
 * Safely update anchor message if it exists
 * @param {string} guildId - Discord guild ID
 * @param {string} coordinate - Map coordinate
 * @param {Object} client - Discord client
 * @returns {boolean} Success status
 */
export async function safeUpdateAnchorMessage(guildId, coordinate, client) {
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  const coordData = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate];
  
  // Check if coordinate has an anchor message before trying to update
  if (!coordData?.anchorMessageId) {
    console.log(`⏭️ Skipping anchor update for ${coordinate} - no anchor message ID found`);
    return true; // This is expected behavior, not an error
  }
  
  // Delegate to the actual update function
  return await updateAnchorMessage(guildId, coordinate, client);
}

/**
 * Update all anchor messages for a guild's active map
 * @param {string} guildId - Discord guild ID
 * @param {Object} client - Discord client
 * @returns {Object} Results of updates
 */
export async function updateAllAnchorMessages(guildId, client) {
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  const coordinates = safariData[guildId]?.maps?.[activeMapId]?.coordinates || {};
  
  const results = {
    successful: 0,
    failed: 0,
    errors: []
  };
  
  for (const [coord, coordData] of Object.entries(coordinates)) {
    if (coordData.anchorMessageId) {
      const success = await updateAnchorMessage(guildId, coord, client);
      if (success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push(coord);
      }
    }
  }
  
  return results;
}

/**
 * Repost anchor message (creates a new message without updating the stored ID)
 * @param {string} guildId - Discord guild ID
 * @param {string} coordinate - Map coordinate
 * @param {Object} channel - Discord channel
 * @returns {Object} New message or null
 */
export async function repostAnchorMessage(guildId, coordinate, channel) {
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  const coordData = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate];
  
  if (!coordData) {
    console.error(`No coordinate data found for ${coordinate}`);
    return null;
  }
  
  try {
    // Get the fog map URL from the original anchor message if possible
    let fogMapUrl = null;
    if (coordData.anchorMessageId) {
      try {
        const originalMessage = await channel.messages.fetch(coordData.anchorMessageId);
        if (originalMessage.components?.[0]?.components?.[0]?.type === 12) {
          fogMapUrl = originalMessage.components[0].components[0].items?.[0]?.media?.url;
        }
      } catch (error) {
        console.warn(`Could not fetch original message for fog map URL: ${error.message}`);
      }
    }
    
    // Create components for the new message
    const components = await createAnchorMessageComponents(coordData, guildId, coordinate, fogMapUrl);
    
    // Send new message (but don't update the stored anchorMessageId)
    const newMessage = await channel.send({
      flags: (1 << 15), // IS_COMPONENTS_V2
      components: components
    });
    
    console.log(`✅ Reposted anchor message for ${coordinate}`);
    return newMessage;
  } catch (error) {
    console.error(`Failed to repost anchor message for ${coordinate}:`, error);
    return null;
  }
}