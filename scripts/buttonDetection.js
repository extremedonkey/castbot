#!/usr/bin/env node

/**
 * Smart Button Detection for Deployment Notifications
 * 
 * Analyzes git changes to detect which buttons/features were modified
 * and generates relevant test buttons for deployment notifications.
 * 
 * Features:
 * - Safe whitelisted buttons only
 * - Multiple fallback layers
 * - Comprehensive validation
 * - Silent error handling
 */

/**
 * Safe menu buttons that can be tested without context
 * Maps feature patterns to their safe menu entry points
 */
const SAFE_TEST_BUTTONS = {
  // Feature area -> Safe menu button mapping
  'safari': {
    custom_id: 'prod_safari_menu',
    label: '🦁 Safari',
    style: 3, // Success (green)
    priority: 1
  },
  'ranking': {
    custom_id: 'season_app_ranking',
    label: '🏆 Ranking',
    style: 1, // Primary (blue)
    priority: 2
  },
  'castlist': {
    custom_id: 'show_castlist2_default',
    label: '📋 Castlist',
    style: 2, // Secondary (grey)
    priority: 3
  },
  'analytics': {
    custom_id: 'reece_stuff_menu',  // The actual Analytics menu button
    label: '🧮 Analytics',
    style: 2, // Secondary (grey)
    priority: 4
  },
  'server_stats': {
    custom_id: 'prod_server_usage_stats',
    label: '📈 Server Stats',
    style: 2, // Secondary (grey)
    priority: 6
  },
  'applications': {
    custom_id: 'season_management_menu',
    label: '📝 Applications',
    style: 1, // Primary (blue)
    priority: 5
  },
  'menu': {
    custom_id: 'viral_menu',
    label: '📋 Prod Menu',
    style: 2, // Secondary (grey)
    priority: 10 // Lowest priority
  }
};

/**
 * Patterns to detect feature areas from file paths and content
 */
const FEATURE_PATTERNS = {
  safari: [
    /safari/i,
    /safari_.*\.js/,
    /safariManager\.js/,
    /safariContent\.json/,
    /custom_id.*safari_/,
    /prod_safari/
  ],
  ranking: [
    /ranking/i,
    /castRanking/i,
    /rank_/,
    /ranking_/,
    /season_app_ranking/
  ],
  castlist: [
    /castlist/i,
    /show_castlist/,
    /castlistV2/,
    /CASTLIST/
  ],
  analytics: [
    /analytics/i,
    /reece_stuff/i,      // Reece stuff menu
    /msg_test/i,         // Message test button
    /discordMessenger/i, // Discord messaging service
    /messaging/i,        // General messaging features
    /sendDM/i,           // DM sending functionality
    /sendMessage/i,      // Message sending
    /welcome/i,          // Welcome messages
    /notification/i,     // Notifications
    /buttonDetection/,   // Our button detection is analytics
    /notify-restart/     // Notification script is analytics
  ],
  server_stats: [
    /server.*stats/i,
    /serverUsage/,
    /prod_server_usage/,
    /analytics.*dump/,
    /server.*list/i
  ],
  applications: [
    /application/i,
    /season.*app/i,
    /apply_/,
    /season_management_menu/,
    /applicationManager/
  ]
};

/**
 * Validate a button object for Discord compatibility
 * @param {Object} button - Button object to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateButton(button) {
  try {
    // Required fields
    if (!button.custom_id || typeof button.custom_id !== 'string') {
      console.log(`🔍 Button validation failed: missing custom_id`);
      return false;
    }
    if (!button.label || typeof button.label !== 'string') {
      console.log(`🔍 Button validation failed: missing label`);
      return false;
    }
    
    // Length limits
    if (button.custom_id.length > 100) {
      console.log(`🔍 Button validation failed: custom_id too long (${button.custom_id.length} > 100)`);
      return false;
    }
    if (button.label.length > 80) {
      console.log(`🔍 Button validation failed: label too long (${button.label.length} > 80)`);
      return false;
    }
    
    // Valid style
    const validStyles = [1, 2, 3, 4, 5]; // Primary, Secondary, Success, Danger, Link
    if (button.style && !validStyles.includes(button.style)) {
      console.log(`🔍 Button validation failed: invalid style ${button.style}`);
      return false;
    }
    
    // No trailing emoji issues
    if (button.emoji && typeof button.emoji === 'string') {
      // Check for problematic trailing characters
      if (button.emoji.endsWith('\u200d') || button.emoji.endsWith('\ufe0f')) {
        console.log(`🔍 Button validation failed: emoji has trailing joiners`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.log(`🔍 Button validation error: ${error.message}`);
    return false;
  }
}

/**
 * Detect affected features from git changes
 * @param {string} filesChanged - Comma-separated list of changed files
 * @param {string} commitMessage - Commit message
 * @returns {Set<string>} Set of detected features
 */
function detectAffectedFeatures(filesChanged, commitMessage) {
  const detectedFeatures = new Set();
  
  try {
    // Parse files changed
    const files = filesChanged ? filesChanged.split(',').filter(f => f.trim()) : [];
    
    // Check each file against feature patterns
    for (const file of files) {
      for (const [feature, patterns] of Object.entries(FEATURE_PATTERNS)) {
        for (const pattern of patterns) {
          if (pattern.test(file)) {
            detectedFeatures.add(feature);
            console.log(`🔍 Detected ${feature} from file: ${file}`);
            break;
          }
        }
      }
    }
    
    // Also check commit message for feature mentions
    if (commitMessage) {
      const lowerMessage = commitMessage.toLowerCase();
      for (const [feature, patterns] of Object.entries(FEATURE_PATTERNS)) {
        for (const pattern of patterns) {
          if (pattern.test(lowerMessage)) {
            detectedFeatures.add(feature);
            console.log(`🔍 Detected ${feature} from commit message`);
            break;
          }
        }
      }
    }
    
    console.log(`🔍 Total detected features: ${Array.from(detectedFeatures).join(', ')}`);
  } catch (error) {
    console.log(`🔍 Feature detection error: ${error.message}`);
  }
  
  return detectedFeatures;
}

/**
 * Generate smart test buttons based on git changes
 * @param {string} filesChanged - Comma-separated list of changed files
 * @param {string} commitMessage - Commit message
 * @param {boolean} isProduction - Whether this is a production deployment
 * @returns {Array<Object>} Array of button objects (max 3)
 */
function generateSmartButtons(filesChanged, commitMessage, isProduction = false) {
  console.log('🔍 Starting smart button detection...');
  
  try {
    // Detect affected features
    const features = detectAffectedFeatures(filesChanged, commitMessage);
    
    // If no features detected, return default menu button
    if (features.size === 0) {
      console.log('🔍 No specific features detected, using default menu');
      return [{
        type: 2, // Button type
        custom_id: 'viral_menu',
        label: '📋 Open Prod Menu',
        style: 2 // Secondary
      }];
    }
    
    // Map features to buttons and sort by priority
    const buttons = Array.from(features)
      .map(feature => SAFE_TEST_BUTTONS[feature])
      .filter(button => button && validateButton(button))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 2) // Max 2 smart buttons
      .map(button => ({
        type: 2, // Button type
        custom_id: button.custom_id,
        label: button.label,
        style: button.style || 2
      }));
    
    // Always add the general menu as fallback (3rd button)
    if (buttons.length > 0 && buttons.length < 3) {
      buttons.push({
        type: 2,
        custom_id: 'viral_menu',
        label: '📋 Prod Menu',
        style: 2
      });
    }
    
    console.log(`🔍 Generated ${buttons.length} smart buttons: ${buttons.map(b => b.label).join(', ')}`);
    return buttons;
    
  } catch (error) {
    console.log(`🔍 Smart button generation failed: ${error.message}`);
    console.log('🔍 Falling back to default menu button');
    
    // Ultimate fallback - just the menu button
    return [{
      type: 2,
      custom_id: 'viral_menu',
      label: '📋 Open Prod Menu',
      style: 2
    }];
  }
}

/**
 * Generate buttons with multiple safety checks
 * This is the main export that should be used
 */
export function generateDeploymentButtons(filesChanged, commitMessage, isProduction = false) {
  try {
    // Get smart buttons
    const smartButtons = generateSmartButtons(filesChanged, commitMessage, isProduction);
    
    // Final validation pass
    const validButtons = smartButtons.filter(button => validateButton(button));
    
    // If all validation failed, return minimal safe button
    if (validButtons.length === 0) {
      console.log('🔍 All smart buttons failed validation, using minimal fallback');
      return [{
        type: 2,
        custom_id: 'viral_menu',
        label: '📋 Menu',
        style: 2
      }];
    }
    
    // Add standard buttons that should always be present
    const standardButtons = [
      {
        type: 2,
        custom_id: 'restart_status_passed',
        label: '✅ Pass',
        style: 2 // Will start as grey
      },
      {
        type: 2,
        custom_id: 'restart_status_failed',
        label: '❌ Fail',
        style: 2 // Will start as grey
      }
    ];
    
    // Combine smart buttons with standard buttons (max 5 total)
    const allButtons = [...validButtons.slice(0, 3), ...standardButtons].slice(0, 5);
    
    console.log(`🔍 Final button set: ${allButtons.map(b => b.label).join(', ')}`);
    return allButtons;
    
  } catch (error) {
    console.log(`🔍 Critical error in button generation: ${error.message}`);
    // Absolute minimum fallback
    return [
      {
        type: 2,
        custom_id: 'viral_menu',
        label: '📋 Menu',
        style: 2
      }
    ];
  }
}

// Export for testing
export { detectAffectedFeatures, validateButton, SAFE_TEST_BUTTONS };