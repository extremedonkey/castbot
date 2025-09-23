import { loadSafariContent } from './safariManager.js';

/**
 * Advanced emoji parsing and validation for Discord buttons
 * Supports Unicode emojis, Discord custom emojis, shortcodes, and animated emojis
 * @param {string} emojiInput - Emoji input (🧀, :cheese:, <:Cheese2:123>, <a:spin:456>)
 * @returns {object|undefined} Valid Discord emoji object or undefined
 */
export async function createSafeEmoji(emojiInput) {
  if (!emojiInput || typeof emojiInput !== 'string' || !emojiInput.trim()) {
    return undefined;
  }

  try {
    // Import advanced emoji parsing utilities
    const { parseTextEmoji } = await import('./utils/emojiUtils.js');
    
    // Use advanced parsing to handle all Discord emoji formats
    const { emoji } = parseTextEmoji(emojiInput.trim(), null);
    
    if (!emoji) {
      console.warn(`⚠️ No valid emoji found in: "${emojiInput}"`);
      return undefined;
    }

    // Handle Discord custom emojis (with ID)
    if (emoji.id) {
      console.log(`✅ Using Discord custom emoji: ${emoji.name} (ID: ${emoji.id}${emoji.animated ? ', animated' : ''})`);
      return {
        name: emoji.name,
        id: emoji.id,
        animated: emoji.animated || false
      };
    }
    
    // Handle Unicode emojis - apply enhanced validation
    if (emoji.name) {
      const cleanEmoji = emoji.name
        .replace(/[\u200D\u200C\uFEFF]/g, '') // Remove zero-width joiners
        .replace(/[\uFE0E\uFE0F]/g, ''); // Remove variation selectors
      
      // Check for problematic characters
      if (cleanEmoji.includes('\n') || cleanEmoji.includes('\r') || cleanEmoji.includes('\t')) {
        console.warn(`⚠️ Emoji contains line breaks: "${emojiInput}"`);
        return undefined;
      }
      
      // Enhanced Unicode validation - check if it's actually an emoji
      const firstCodePoint = cleanEmoji.codePointAt(0);
      
      // Check if it's in valid emoji Unicode ranges
      const isValidEmojiRange = (
        // Emoji ranges (comprehensive coverage)
        (firstCodePoint >= 0x1F600 && firstCodePoint <= 0x1F64F) || // Emoticons
        (firstCodePoint >= 0x1F300 && firstCodePoint <= 0x1F5FF) || // Misc Symbols and Pictographs
        (firstCodePoint >= 0x1F680 && firstCodePoint <= 0x1F6FF) || // Transport and Map
        (firstCodePoint >= 0x1F700 && firstCodePoint <= 0x1F77F) || // Alchemical Symbols
        (firstCodePoint >= 0x1F780 && firstCodePoint <= 0x1F7FF) || // Geometric Shapes Extended
        (firstCodePoint >= 0x1F800 && firstCodePoint <= 0x1F8FF) || // Supplemental Arrows-C
        (firstCodePoint >= 0x1F900 && firstCodePoint <= 0x1F9FF) || // Supplemental Symbols and Pictographs
        (firstCodePoint >= 0x1FA00 && firstCodePoint <= 0x1FA6F) || // Chess Symbols
        (firstCodePoint >= 0x1FA70 && firstCodePoint <= 0x1FAFF) || // Symbols and Pictographs Extended-A
        (firstCodePoint >= 0x2600 && firstCodePoint <= 0x26FF) ||   // Misc symbols
        (firstCodePoint >= 0x2700 && firstCodePoint <= 0x27BF) ||   // Dingbats
        (firstCodePoint >= 0x1FB00 && firstCodePoint <= 0x1FBFF) || // Symbols for Legacy Computing
        (firstCodePoint >= 0x23E9 && firstCodePoint <= 0x23F3) ||   // Media control symbols
        (firstCodePoint >= 0x23F8 && firstCodePoint <= 0x23FA) ||   // More media controls
        // Additional common symbols
        cleanEmoji.match(/^[\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26A7\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26C8\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]$/)
      );
      
      if (!isValidEmojiRange) {
        console.warn(`⚠️ Invalid emoji - not in valid Unicode emoji range: "${cleanEmoji}" (codepoint: ${firstCodePoint?.toString(16)})`);
        return undefined;
      }
      
      console.log(`✅ Using Unicode emoji: "${cleanEmoji}" (codepoint: ${firstCodePoint?.toString(16)})`);
      return { name: cleanEmoji };
    }
    
    console.warn(`⚠️ Emoji parsing returned unexpected result for: "${emojiInput}"`);
    return undefined;
    
  } catch (error) {
    console.error(`❌ Error processing emoji "${emojiInput}":`, error);
    return undefined;
  }
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
    const safeEmoji = await createSafeEmoji(button.emoji);
    if (button.emoji && !safeEmoji) {
      console.warn(`⚠️ Rejected invalid emoji for button ${buttonId}: "${button.emoji}"`);
    }
    
    const buttonComponent = {
      type: 2, // Button
      custom_id: `safari_${guildId}_${buttonId}_${Date.now()}`,
      label: label || 'Action', // Fallback if no label found
      style: getButtonStyle(button.trigger?.button?.style || button.style),
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
          emoji: await createSafeEmoji(store.emoji)
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
        emoji: await createSafeEmoji(drop.buttonEmoji),
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
        emoji: await createSafeEmoji(drop.buttonEmoji),
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