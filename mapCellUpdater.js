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
export async function updateAnchorMessage(guildId, coordinate, client, { verifyImage = true } = {}) {
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
    
    // Get the fog map URL from stored coordinate data (more reliable than extracting from Discord)
    let fogMapUrl = coordData.fogMapUrl || null;
    console.log(`🔍 Using stored fog map URL: ${fogMapUrl}`);
    
    // Fallback: if no stored URL, try to extract from existing message
    if (!fogMapUrl) {
      console.log(`⚠️ No stored fog map URL, attempting extraction from Discord message...`);
      
      for (const container of message.components || []) {
        for (const component of container.components || []) {
          if (component.type === 12) { // Media gallery
            fogMapUrl = component.items?.[0]?.media?.url;
            if (fogMapUrl) break;
          }
        }
        if (fogMapUrl) break;
      }
      
      // If extracted successfully, store it for future use ONLY if not already stored
      if (fogMapUrl) {
        console.log(`🔍 Extracted fog map URL from message: ${fogMapUrl}`);
        // CRITICAL: Only store if coordinate doesn't already have a fogMapUrl
        // This prevents overwriting newer URLs with older ones from Discord messages
        if (!coordData.fogMapUrl) {
          console.log(`💾 Storing extracted fog map URL for future use`);
          coordData.fogMapUrl = fogMapUrl;
          await saveSafariContent(safariData);
        } else {
          console.log(`⚠️ Not overwriting existing stored fogMapUrl - this was just for immediate use`);
        }
      }
    }
    
    // Final fallback: try to recreate from storage channel
    if (!fogMapUrl) {
      console.log(`⚠️ Attempting fog map recovery from storage channel...`);
      const guild = await client.guilds.fetch(guildId);
      const { findImageStorageChannel } = await import('./src/images/imageStorageChannel.js');
      const storageChannel = findImageStorageChannel(guild);
      if (storageChannel) {
        const messages = await storageChannel.messages.fetch({ limit: 50 });
        const fogMessage = messages.find(m => m.content.includes(`Fog map for ${coordinate}`) || m.content.includes(`fog map for ${coordinate}`) || m.content.includes(`Updated fog map for ${coordinate}`));
        if (fogMessage && fogMessage.attachments.size > 0) {
          fogMapUrl = fogMessage.attachments.first().url;
          console.log(`🔍 Recovered fog map URL from storage: ${fogMapUrl}`);
          // Store recovered URL ONLY if not already stored
          if (!coordData.fogMapUrl) {
            console.log(`💾 Storing recovered fog map URL for future use`);
            coordData.fogMapUrl = fogMapUrl;
            await saveSafariContent(safariData);
          } else {
            console.log(`⚠️ Not overwriting existing stored fogMapUrl - this was just for immediate use`);
          }
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
    
    // Use DiscordRequest for Components V2 editing with PATCH to preserve message position
    const { DiscordRequest } = await import('./utils.js');
    try {
      await DiscordRequest(`channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, {
        method: 'PATCH',
        body: {
          flags: (1 << 15), // IS_COMPONENTS_V2
          components: validatedComponents
        }
      });
    } catch (error) {
      if (error.message?.includes('Unknown Message')) {
        console.log(`⚠️ Anchor message ${coordData.anchorMessageId} no longer exists for ${coordinate}, clearing stored ID`);
        // Clear the invalid anchor message ID and reload safari data to save the change
        const safariData = await loadSafariContent();
        const activeMapId = safariData[guildId]?.maps?.active;
        if (safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate]) {
          safariData[guildId].maps[activeMapId].coordinates[coordinate].anchorMessageId = null;
          await saveSafariContent(safariData);
        }
        return false; // This coordinate needs to be reinitialized
      }
      throw error; // Re-throw other errors
    }
    
    console.log(`✅ Updated anchor message for ${coordinate}`);
    if (verifyImage) await verifyAnchorImage(guildId, coordinate, coordData, validatedComponents);
    return true;
  } catch (error) {
    console.error(`Failed to update anchor message for ${coordinate}:`, error);
    return false;
  }
}

/**
 * Confirm Discord actually RESOLVED the anchor's image, and re-PATCH once if it didn't.
 *
 * Discord unfurls a Media Gallery URL exactly once, at edit time, to learn its
 * dimensions. If that resolution fails — including for reasons entirely outside our
 * control (observed 2026-07-29: a ~33-minute window where 3 of ~25 anchor edits failed
 * while every edit before and after succeeded, against images Discord had been serving
 * for two days) — the item is stuck at loading_state 1 FOREVER. Discord never retries;
 * only another edit re-triggers it. The host sees a permanently broken map image and has
 * no reason to know that a hidden "Refresh Anchors" button would fix it.
 *
 * loading_state: 1 = LOADING (unresolved), 2 = LOADED_SUCCESS.
 * One retry only — a genuine Discord outage must not become a loop.
 *
 * Never throws: this is best-effort repair on an already-successful update.
 * @returns {Promise<boolean>} true if the image is resolved (or there was none to check)
 */
export async function verifyAnchorImage(guildId, coordinate, coordData, components, { delayMs = 2000 } = {}) {
  try {
    // The unfurl is async on Discord's side — checking immediately always reads LOADING.
    await new Promise(resolve => setTimeout(resolve, delayMs));
    if (await isAnchorImageResolved(coordData)) return true;

    console.log(`🔁 Anchor ${coordinate}: image still unresolved — re-sending once`);
    const { DiscordRequest } = await import('./utils.js');
    await DiscordRequest(`channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, {
      method: 'PATCH',
      body: { flags: (1 << 15), components }
    });
    return false;
  } catch (error) {
    console.log(`ℹ️ Anchor ${coordinate}: image verification skipped (${error.message})`);
    return true; // never let verification failure look like an update failure
  }
}

/** Fetch the anchor and ask whether Discord resolved its image. Never throws. */
async function isAnchorImageResolved(coordData) {
  try {
    const { DiscordRequest } = await import('./utils.js');
    const message = await DiscordRequest(
      `channels/${coordData.channelId}/messages/${coordData.anchorMessageId}`, { method: 'GET' });
    return isImageResolved(message);
  } catch {
    return true; // can't tell → don't churn
  }
}

/**
 * Does this message's Media Gallery report a resolved image?
 * Pure — exported for tests. No gallery at all counts as resolved (nothing to fix).
 */
export function isImageResolved(message) {
  let sawImage = false;
  const walk = (components) => {
    for (const component of components || []) {
      if (component.type === 12) {
        for (const item of component.items || []) {
          sawImage = true;
          if (item.media?.loading_state === 1) return false; // LOADING = unresolved
        }
      }
      if (component.components && !walk(component.components)) return false;
    }
    return true;
  };
  const ok = walk(message?.components);
  return sawImage ? ok : true;
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
  
  const updated = [];
  for (const [coord, coordData] of Object.entries(coordinates)) {
    if (coordData.anchorMessageId) {
      // Skip per-cell verification here — a 2s wait × 40 cells would add minutes. One
      // sweep at the end catches the same stragglers for the cost of a single delay.
      const success = await updateAnchorMessage(guildId, coord, client, { verifyImage: false });
      if (success) {
        results.successful++;
        updated.push([coord, coordData]);
      } else {
        results.failed++;
        results.errors.push(coord);
      }
    }
  }

  // Verification sweep — ONE delay for the whole batch, then re-send only the stragglers.
  results.repaired = 0;
  if (updated.length) {
    await new Promise(resolve => setTimeout(resolve, 3000)); // let Discord finish unfurling
    for (const [coord, coordData] of updated) {
      if (await isAnchorImageResolved(coordData)) continue;
      console.log(`🔁 Anchor ${coord}: image unresolved after bulk refresh — re-sending`);
      await updateAnchorMessage(guildId, coord, client, { verifyImage: false });
      results.repaired++;
    }
    if (results.repaired) console.log(`🔁 Repaired ${results.repaired} anchor image(s) Discord left unresolved`);
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
    // Get the fog map URL from stored coordinate data first (more reliable)
    let fogMapUrl = coordData.fogMapUrl || null;
    
    // Fallback: Get from the original anchor message if not stored
    if (!fogMapUrl && coordData.anchorMessageId) {
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