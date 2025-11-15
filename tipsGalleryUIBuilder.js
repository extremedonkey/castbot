/**
 * Tips Gallery UI Builder - Reusable UI Component Functions
 *
 * Extracted from app.js to reduce code duplication and improve maintainability.
 * Follows LeanUserInterfaceDesign.md standards.
 *
 * @module tipsGalleryUIBuilder
 */

/**
 * Create navigation buttons for tips gallery
 * Follows Lean UI design: Back button FIRST (far left), then Previous, then Next
 *
 * @param {number} index - Current tip index (0-based)
 * @param {number} totalTips - Total number of tips
 * @param {string} backButtonId - Custom ID for back button ('viral_menu' or 'dm_back_to_welcome')
 * @returns {object[]} Array of button components in correct order
 */
export function createTipsNavigationButtons(index, totalTips, backButtonId = 'viral_menu') {
  return [{
    type: 2, // Button - BACK FIRST (far left)
    custom_id: backButtonId,
    label: '← Back',
    style: 2 // Secondary (grey), NO emoji per LeanUserInterfaceDesign.md
  }, {
    type: 2, // Button - Previous second
    custom_id: `tips_prev_${index}`,
    label: '◀ Previous',
    style: 2, // Secondary (grey)
    disabled: index === 0  // Disabled on first tip
  }, {
    type: 2, // Button - Next third (far right)
    custom_id: `tips_next_${index}`,
    label: 'Next ▶',
    style: 2, // Secondary (grey)
    disabled: index === totalTips - 1  // Disabled on last tip
  }];
}

/**
 * Create complete tips display UI (Container with all components)
 * Components V2 format with proper structure
 *
 * @param {number} index - Current tip index (0-based)
 * @param {number} totalTips - Total number of tips
 * @param {object} tipMetadata - {id, title, description, showcase}
 * @param {string} cdnUrl - Discord CDN URL for tip image
 * @param {string} backButtonId - Custom ID for back button
 * @returns {object} Complete UI response object with Container
 */
export function createTipsDisplayUI(index, totalTips, tipMetadata, cdnUrl, backButtonId = 'viral_menu') {
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      accent_color: 0x9b59b6, // Purple (tips gallery)
      components: [{
        type: 10, // Text Display - Header
        content: `## 💡 CastBot Features Tour (${index + 1}/${totalTips})\n\n### ${tipMetadata.title}\n\n${tipMetadata.description}`
      }, {
        type: 14 // Separator
      }, {
        type: 12, // Media Gallery - Discord CDN URL
        items: [{
          media: { url: cdnUrl },
          description: tipMetadata.title
        }]
      }, {
        type: 14 // Separator
      }, {
        type: 10, // Text Display - Showcase text
        content: `> ${tipMetadata.showcase}`
      }, {
        type: 14 // Separator
      }, {
        type: 1, // Action Row - Navigation buttons
        components: createTipsNavigationButtons(index, totalTips, backButtonId)
      }]
    }]
  };
}

/**
 * Create tips display for navigation handlers (tips_next_/tips_prev_)
 * Same as createTipsDisplayUI but explicitly for UPDATE_MESSAGE context
 *
 * @param {number} newIndex - New tip index after navigation
 * @param {number} totalTips - Total number of tips
 * @param {object} tipMetadata - {id, title, description, showcase}
 * @param {string} cdnUrl - Discord CDN URL for tip image
 * @param {string} backButtonId - Custom ID for back button
 * @returns {object} UI response for UPDATE_MESSAGE
 */
export function createTipsNavigationUI(newIndex, totalTips, tipMetadata, cdnUrl, backButtonId = 'dm_back_to_welcome') {
  // Navigation handlers typically use dm_back_to_welcome, not viral_menu
  return createTipsDisplayUI(newIndex, totalTips, tipMetadata, cdnUrl, backButtonId);
}
