import { loadSafariContent } from './safariManager.js';

/**
 * Safely create emoji object for Discord button
 * @param {string} emoji - Emoji string
 * @returns {object|undefined} Valid emoji object or undefined
 */
function createSafeEmoji(emoji) {
  // Check if emoji is a valid non-empty string
  if (typeof emoji === 'string' && emoji.trim().length > 0) {
    // Clean emoji string by removing potential zero-width joiners and other problematic characters
    const cleanEmoji = emoji
      .trim()
      .replace(/[\u200D\u200C\uFEFF]/g, '') // Remove zero-width joiner, non-joiner, and BOM
      .replace(/\s+/g, '') // Remove any whitespace
      .replace(/[\uFE0E\uFE0F]/g, ''); // Remove variation selectors
    
    // Additional validation for complex emojis
    if (cleanEmoji.length > 0) {
      // Check if emoji contains only valid Unicode ranges for emojis
      const emojiRegex = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}\u{2194}-\u{21AA}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{1F191}-\u{1F19A}\u{1F1E6}-\u{1F1FF}\u{1F201}-\u{1F202}\u{1F21A}\u{1F22F}\u{1F232}-\u{1F23A}\u{1F250}-\u{1F251}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]+$/u;
      
      if (emojiRegex.test(cleanEmoji)) {
        console.log(`✅ Valid emoji: "${cleanEmoji}" (${cleanEmoji.codePointAt(0)})`);
        return { name: cleanEmoji };
      } else {
        console.warn(`⚠️ Invalid emoji rejected: "${emoji}" -> "${cleanEmoji}"`);
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Get button style value based on style string
 * @param {string} style - Button style name
 * @returns {number} Discord button style value
 */
function getButtonStyle(style) {
  const styles = {
    'Primary': 1,
    'Secondary': 2,
    'Success': 3,
    'Danger': 4,
    'Link': 5
  };
  return styles[style] || 2; // Default to Secondary
}

/**
 * Create Safari button components for location content
 * @param {Array} buttonIds - Array of Safari button IDs
 * @param {string} guildId - Discord guild ID
 * @returns {Array} Array of action row components
 */
export async function createSafariButtonComponents(buttonIds, guildId) {
  if (!buttonIds || buttonIds.length === 0) return [];
  
  // Load safari data to get button configurations
  const safariData = await loadSafariContent();
  
  const components = [];
  const rows = [];
  let currentRow = [];
  
  for (const buttonId of buttonIds) {
    // Get button data from safari system
    const button = safariData[guildId]?.buttons?.[buttonId];
    if (!button) {
      console.warn(`Safari button ${buttonId} not found for guild ${guildId}`);
      continue;
    }
    
    // Determine button label based on display_text action
    // Support both legacy (button.label) and new structure (button.trigger.button.label)
    let label = button.label || button.trigger?.button?.label || 'Action'; // Default fallback
    
    // Check if button has display_text action
    if (button.actions && button.actions.length > 0) {
      const displayTextAction = button.actions.find(action => action.type === 'display_text');
      if (displayTextAction) {
        // Use title if available, otherwise truncated content
        if (displayTextAction.config?.title) {
          label = displayTextAction.config.title;
        } else if (displayTextAction.config?.content || displayTextAction.text) {
          // Support both new format (config.content) and legacy format (text)
          const textContent = displayTextAction.config?.content || displayTextAction.text || '';
          // Truncate content to 12 characters
          label = textContent.substring(0, 12);
          if (textContent.length > 12) {
            label += '...';
          }
        }
      }
    }
    
    // Create emoji safely with logging
    const safeEmoji = createSafeEmoji(button.emoji);
    if (button.emoji && !safeEmoji) {
      console.warn(`⚠️ Rejected invalid emoji for button ${buttonId}: "${button.emoji}"`);
    }
    
    const buttonComponent = {
      type: 2, // Button
      custom_id: `safari_${guildId}_${buttonId}_${Date.now()}`,
      label: label || 'Action', // Fallback if no label found
      style: getButtonStyle(button.style),
      emoji: safeEmoji
    };
    
    currentRow.push(buttonComponent);
    
    // Max 5 buttons per row
    if (currentRow.length === 5) {
      rows.push({
        type: 1, // Action Row
        components: currentRow
      });
      currentRow = [];
    }
  }
  
  // Add remaining buttons
  if (currentRow.length > 0) {
    rows.push({
      type: 1, // Action Row
      components: currentRow
    });
  }
  
  return rows;
}

/**
 * Create anchor message components for a map cell
 * @param {Object} coordData - Coordinate data from safariContent.json
 * @param {string} guildId - Discord guild ID
 * @param {string} coord - Coordinate string (e.g., "C3")
 * @param {string} fogMapUrl - URL of the fog of war map image
 * @returns {Array} Array of container components
 */
export async function createAnchorMessageComponents(coordData, guildId, coord, fogMapUrl) {
  const components = [];
  
  // Fog of War Map
  if (fogMapUrl) {
    components.push({
      type: 12, // Media Gallery
      items: [{
        media: { url: fogMapUrl },
        description: `Map view from ${coord}`
      }]
    });
    components.push({ type: 14 }); // Separator
  }
  
  // Location Content
  const title = coordData.baseContent?.title || `📍 Location ${coord}`;
  const description = coordData.baseContent?.description || `You are at grid location ${coord}. This area hasn't been configured yet.`;
  
  components.push({
    type: 10, // Text Display
    content: `# ${title}\n\n${description}`
  });
  
  // Optional location image
  if (coordData.baseContent?.image) {
    components.push({ type: 14 }); // Separator
    components.push({
      type: 12, // Media Gallery
      items: [{
        media: { url: coordData.baseContent.image },
        description: title
      }]
    });
  }
  
  // Create all buttons array to enforce 5 per row limit
  const allButtons = [];
  
  // Add store buttons first
  if (coordData.stores?.length > 0) {
    const safariData = await loadSafariContent();
    for (const storeId of coordData.stores) {
      const store = safariData[guildId]?.stores?.[storeId];
      if (store) {
        allButtons.push({
          type: 2, // Button
          custom_id: `map_coord_store_${coord}_${storeId}`,
          label: store.name,
          style: 2, // Secondary/grey
          emoji: createSafeEmoji(store.emoji)
        });
      }
    }
  }
  
  // Add item drop buttons
  if (coordData.itemDrops?.length > 0) {
    for (const [index, drop] of coordData.itemDrops.entries()) {
      const isExhausted = drop.dropType === 'once_per_season' && drop.claimedBy;
      allButtons.push({
        type: 2, // Button
        custom_id: `map_item_drop_${coord}_${index}`,
        label: isExhausted ? `${drop.buttonText} (Taken)` : drop.buttonText,
        style: drop.buttonStyle || 2,
        emoji: createSafeEmoji(drop.buttonEmoji),
        disabled: isExhausted
      });
    }
  }
  
  // Add currency drop buttons
  if (coordData.currencyDrops?.length > 0) {
    for (const [index, drop] of coordData.currencyDrops.entries()) {
      const isExhausted = drop.dropType === 'once_per_season' && drop.claimedBy;
      allButtons.push({
        type: 2, // Button
        custom_id: `map_currency_drop_${coord}_${index}`,
        label: isExhausted ? `${drop.buttonText} (Taken)` : drop.buttonText,
        style: drop.buttonStyle || 2,
        emoji: createSafeEmoji(drop.buttonEmoji),
        disabled: isExhausted
      });
    }
  }
  
  // Safari Buttons (existing functionality)
  if (coordData.buttons?.length > 0) {
    try {
      const safariButtonRows = await createSafariButtonComponents(coordData.buttons, guildId);
      // Extract buttons from rows
      for (const row of safariButtonRows) {
        // Validate each button before adding
        for (const button of row.components) {
          if (button.emoji && button.emoji.name) {
            console.log(`🔍 DEBUG: Processing safari button ${button.custom_id} with emoji: "${button.emoji.name}"`);
          }
          allButtons.push(button);
        }
      }
    } catch (error) {
      console.error(`⚠️ Error processing safari buttons for ${coord}:`, error);
      // Continue without safari buttons rather than failing completely
    }
  }
  
  // Create action rows with 5 button limit
  if (allButtons.length > 0) {
    components.push({ type: 14 }); // Separator
    
    const buttonRows = [];
    for (let i = 0; i < allButtons.length; i += 5) {
      buttonRows.push({
        type: 1, // Action Row
        components: allButtons.slice(i, i + 5)
      });
    }
    components.push(...buttonRows);
  }
  
  // Location Actions Button (always present)
  components.push({
    type: 1, // Action Row
    components: [{
      type: 2, // Button
      custom_id: `map_location_actions_${coord}`,
      label: 'Location Actions',
      style: 2, // Secondary
      emoji: { name: '📍' }
    }]
  });
  
  return [{
    type: 17, // Container
    components: components
  }];
}