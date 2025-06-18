/**
 * Utility functions for Discord interaction data analysis
 * Provides functions to extract human-readable button information from interactions
 */

/**
 * Extract button information from a Discord interaction
 * @param {Object} interaction - The full Discord interaction object (req.body)
 * @returns {Object|null} Button information or null if not found
 */
function extractButtonInfo(interaction) {
    // Ensure this is a button interaction
    if (interaction.type !== 3) { // MESSAGE_COMPONENT
        return null;
    }
    
    const customId = interaction.data?.custom_id;
    if (!customId) {
        return null;
    }
    
    // Find the button in the message components
    const buttonData = findButtonByCustomId(interaction.message, customId);
    
    if (!buttonData) {
        return null;
    }
    
    return {
        customId: customId,
        label: buttonData.label,
        emoji: buttonData.emoji,
        style: buttonData.style,
        disabled: buttonData.disabled,
        humanReadable: formatButtonLabel(buttonData)
    };
}

/**
 * Find a button component by custom_id in message components
 * @param {Object} message - Discord message object
 * @param {string} targetCustomId - The custom_id to search for
 * @returns {Object|null} Button component data or null if not found
 */
function findButtonByCustomId(message, targetCustomId) {
    if (!message?.components) {
        return null;
    }
    
    for (const actionRow of message.components) {
        if (actionRow.type === 1) { // ACTION_ROW
            for (const component of actionRow.components || []) {
                if (component.type === 2 && component.custom_id === targetCustomId) { // BUTTON
                    return component;
                }
            }
        }
    }
    
    return null;
}

/**
 * Format button data into human-readable string
 * @param {Object} buttonData - Button component data
 * @returns {string} Formatted button description
 */
function formatButtonLabel(buttonData) {
    let label = '';
    
    // Add emoji if present
    if (buttonData.emoji) {
        if (buttonData.emoji.id) {
            // Custom emoji
            label += `<:${buttonData.emoji.name}:${buttonData.emoji.id}> `;
        } else {
            // Unicode emoji
            label += `${buttonData.emoji.name} `;
        }
    }
    
    // Add text label if present
    if (buttonData.label) {
        label += buttonData.label;
    }
    
    // Add style context if no label/emoji
    if (!label.trim()) {
        const styleNames = {
            1: 'Primary Button',
            2: 'Secondary Button', 
            3: 'Success Button',
            4: 'Danger Button',
            5: 'Link Button'
        };
        label = styleNames[buttonData.style] || 'Button';
    }
    
    return label.trim();
}

/**
 * Get all button information from a message
 * @param {Object} message - Discord message object
 * @returns {Array} Array of button information objects
 */
function getAllButtonsInfo(message) {
    const buttons = [];
    
    if (!message?.components) {
        return buttons;
    }
    
    for (const actionRow of message.components) {
        if (actionRow.type === 1) { // ACTION_ROW
            for (const component of actionRow.components || []) {
                if (component.type === 2) { // BUTTON
                    buttons.push({
                        customId: component.custom_id,
                        label: component.label,
                        emoji: component.emoji,
                        style: component.style,
                        disabled: component.disabled,
                        humanReadable: formatButtonLabel(component)
                    });
                }
            }
        }
    }
    
    return buttons;
}

/**
 * Enhanced logging function for button interactions
 * @param {Object} interaction - The full Discord interaction object
 * @param {string} prefix - Log prefix (optional)
 */
function logButtonInteraction(interaction, prefix = 'BUTTON') {
    const buttonInfo = extractButtonInfo(interaction);
    
    if (buttonInfo) {
        console.log(`${prefix} INTERACTION:`, {
            customId: buttonInfo.customId,
            humanLabel: buttonInfo.humanReadable,
            user: interaction.member?.user?.username || interaction.user?.username || 'Unknown',
            userId: interaction.member?.user?.id || interaction.user?.id || 'Unknown'
        });
    } else {
        console.log(`${prefix} INTERACTION: No button data found`);
    }
}

export {
    extractButtonInfo,
    findButtonByCustomId,
    formatButtonLabel,
    getAllButtonsInfo,
    logButtonInteraction
};