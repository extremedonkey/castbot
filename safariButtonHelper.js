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
      // Use a more permissive approach - try to use the emoji and let Discord reject it if invalid
      // The car emoji 🏎️ (U+1F3CE) should be valid but complex regex might miss some edge cases
      try {
        // Check for basic emoji patterns and common characters that break Discord
        if (cleanEmoji.includes('\n') || cleanEmoji.includes('\r') || cleanEmoji.includes('\t')) {
          console.warn(`⚠️ Emoji contains line breaks: "${emoji}"`);
          return undefined;
        }
        
        // Allow most Unicode emojis but log for debugging
        console.log(`✅ Using emoji: "${cleanEmoji}" (codepoint: ${cleanEmoji.codePointAt(0)?.toString(16)})`);
        return { name: cleanEmoji };
      } catch (error) {
        console.warn(`⚠️ Error processing emoji "${emoji}":`, error);
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
    
    // Skip non-button triggers (modal, select, etc.)
    const triggerType = button.trigger?.type || 'button'; // Default to button for legacy
    if (triggerType !== 'button') {
      console.log(`🔍 Skipping non-button action ${buttonId} with trigger type: ${triggerType}`);
      continue;
    }
    
    // Use the ORIGINAL button label from safariContent.json - NEVER override with action content
    // Support current (button.name), legacy (button.label) and new structure (button.trigger.button.label)
    let label = button.name || button.label || button.trigger?.button?.label || 'Action'; // Default fallback
    
    // ❌ REMOVED: The following logic was WRONG - it was overriding the button label
    //     with display_text action titles, causing "Fresh Meat" to become "Text Display One"
    // 
    // The button label should ALWAYS be the original action name from the Custom Action editor,
    // NOT the content of individual display_text actions within that button.
    //
    // Each button represents a SINGLE custom action that can have MULTIPLE display_text responses.
    // The button label = action name (e.g. "Fresh Meat")
    // The responses = multiple display_text titles/content (e.g. "Text Display One", "Text Display Two")
    
    console.log(`🏷️ Using original button label for ${buttonId}: "${label}"`);
    
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
        disabled: !!isExhausted // Force boolean conversion
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
        disabled: !!isExhausted // Force boolean conversion
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