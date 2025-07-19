import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { createAnchorMessageComponents } from './safariButtonHelper.js';

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
    return false;
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
    
    // Use DiscordRequest for Components V2 editing
    const { DiscordRequest } = await import('./utils.js');
    await DiscordRequest(`channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, {
      method: 'PATCH',
      body: {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components: updatedComponents
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