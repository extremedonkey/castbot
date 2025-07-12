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
    
    const buttonComponent = {
      type: 2, // Button
      custom_id: `safari_${guildId}_${buttonId}_${Date.now()}`,
      label: button.label,
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
  
  // Safari Buttons Container (if any)
  if (coordData.buttons?.length > 0) {
    components.push({ type: 14 }); // Separator
    const safariButtonRows = await createSafariButtonComponents(coordData.buttons, guildId);
    components.push(...safariButtonRows);
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