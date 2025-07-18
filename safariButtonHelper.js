import { loadSafariContent } from './safariManager.js';

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
    let label = button.label; // Default fallback
    
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
    
    const buttonComponent = {
      type: 2, // Button
      custom_id: `safari_${guildId}_${buttonId}_${Date.now()}`,
      label: label || 'Action', // Fallback if no label found
      style: getButtonStyle(button.style),
      emoji: button.emoji ? { name: button.emoji } : undefined
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
          emoji: store.emoji ? { name: store.emoji } : undefined
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
        emoji: drop.buttonEmoji ? { name: drop.buttonEmoji } : undefined,
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
        emoji: drop.buttonEmoji ? { name: drop.buttonEmoji } : undefined,
        disabled: isExhausted
      });
    }
  }
  
  // Safari Buttons (existing functionality)
  if (coordData.buttons?.length > 0) {
    const safariButtonRows = await createSafariButtonComponents(coordData.buttons, guildId);
    // Extract buttons from rows
    for (const row of safariButtonRows) {
      allButtons.push(...row.components);
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