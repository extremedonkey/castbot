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

import { BUTTON_REGISTRY } from '../buttonHandlerFactory.js';

/**
 * Safe menu entry points per feature area — custom_id + priority ONLY.
 *
 * Labels, emojis and styles are deliberately NOT stored here: they are resolved from
 * BUTTON_REGISTRY at generation time (see toButton). This map drifted badly when it
 * duplicated that metadata inline — deprecated ids and stale labels shipped on every
 * deploy card for months. Now a button that leaves the registry drops off the card
 * automatically instead of silently pointing at a dead handler.
 */
const SAFE_TEST_BUTTONS = {
  'actions': { custom_id: 'safari_action_editor', priority: 1 },
  'safari': { custom_id: 'safari_map_explorer', priority: 2 },
  'ranking': { custom_id: 'season_app_ranking', priority: 2 },
  'castlist': { custom_id: 'show_castlist2_default', priority: 3 },
  'data': { custom_id: 'data_admin', priority: 4 },
  'server_stats': { custom_id: 'prod_server_usage_stats', priority: 6 },
  // season_management_menu is DEPRECATED — Season Manager owns Apps now
  'applications': { custom_id: 'season_manager', priority: 5 },
  'season_planner': { custom_id: 'season_manager', priority: 2 },
  'richcard': { custom_id: 'richcard_demo', priority: 2 },
  'experimental': { custom_id: 'reeces_stuff', priority: 3 },
  'challenges': { custom_id: 'challenge_screen_new', priority: 2 },
  'player_card': { custom_id: 'pcard_open', priority: 1 },
  'menu': { custom_id: 'viral_menu', priority: 10 } // Lowest priority fallback
};

/** Registry style names → Discord button style ints. */
const STYLE_MAP = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 };

/**
 * Find the BUTTON_REGISTRY entry for a custom_id — exact key first, then `_*`
 * wildcard prefixes (same matching the app.js router uses for dynamic buttons).
 * @param {string} customId
 * @returns {Object|null}
 */
export function resolveRegistryEntry(customId) {
  if (BUTTON_REGISTRY[customId]) return BUTTON_REGISTRY[customId];
  for (const key of Object.keys(BUTTON_REGISTRY)) {
    if (key.endsWith('_*') && customId.startsWith(key.slice(0, -1))) return BUTTON_REGISTRY[key];
  }
  return null;
}

/**
 * Build a Discord button from the registry, or null if the id is stale.
 * Some registry labels bake the emoji into the label text — strip it when the
 * emoji field would render it a second time.
 * @param {string} customId
 * @returns {Object|null}
 */
export function toButton(customId) {
  const entry = resolveRegistryEntry(customId);
  if (!entry) {
    console.log(`🔍 Dropping stale button ${customId} — no BUTTON_REGISTRY entry`);
    return null;
  }
  let label = entry.label || customId;
  if (entry.emoji && label.startsWith(entry.emoji)) {
    label = label.slice(entry.emoji.length).trim();
  }
  return {
    type: 2,
    custom_id: customId,
    label,
    style: STYLE_MAP[entry.style] || 2,
    ...(entry.emoji ? { emoji: { name: entry.emoji } } : {})
  };
}

/**
 * TLDR light-touch test steps per feature area — rendered as the 🧪 Test Steps
 * section on the restart card. One line each: what to click, what "working" looks
 * like. Keyed by the same feature names as FEATURE_PATTERNS so detection drives
 * both the smart buttons AND the checklist.
 */
const FEATURE_TEST_STEPS = {
  actions: '⚡ Action Editor → open an Action → edit an outcome → save sticks',
  safari: '🗺️ Map Explorer loads → move a player → location + channel update',
  ranking: '🏆 Casting → score an applicant → reopen, score persisted',
  castlist: '📋 `/castlist` renders → nav/paging buttons work',
  analytics: '📊 Deploy + #error cards render with working buttons',
  server_stats: '📈 Server Stats renders counts without error',
  applications: '📅 Season Manager → Apps tab loads, applicant list renders',
  season_planner: '📅 Season Manager → Planner tab loads',
  richcard: '🎴 Rich Card demo renders',
  challenges: '🏃 Challenges screen loads → a round card renders',
  player_card: '🪪 Player Card opens from /menu',
  experimental: "🐧 Reece's Stuff opens",
  menu: '📋 /menu opens (admin + player views)'
};

/**
 * Build the tldr test checklist for a deploy: one step per detected feature,
 * deduped, capped at 4 lines. Empty array when nothing matched (caller renders
 * a generic regression line instead).
 * @param {string} filesChanged - comma-separated changed files
 * @param {string} commitMessage
 * @returns {string[]}
 */
export function generateTestSteps(filesChanged, commitMessage) {
  try {
    const features = detectAffectedFeatures(filesChanged, commitMessage);
    const steps = Array.from(features)
      .map(f => FEATURE_TEST_STEPS[f])
      .filter(Boolean);
    return [...new Set(steps)].slice(0, 4);
  } catch (error) {
    console.log(`🔍 Test step generation failed: ${error.message}`);
    return [];
  }
}

/**
 * Patterns to detect feature areas from file paths and content
 */
const FEATURE_PATTERNS = {
  actions: [
    /customAction/i,
    /outcome/i,
    /action.*editor/i,
    /safari_action/,
    /safariLimits/i,
    /\bactions?\b/i
  ],
  safari: [
    /safari/i,
    /safariManager\.js/,
    /safariContent\.json/,
    /safari_map/,
    /safari_store/,
    /safari_player/,
    /safari_init/
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
  ],
  season_planner: [
    /season.?planner/i,
    /stress.?test/i,
    /select.?stress/i,
    /reeces_season_planner/i
  ],
  richcard: [
    /richcard/i,
    /rich.?card/i
  ],
  challenges: [
    /challenge/i,
    /challengeManager/i,
    /safari_rounds/,
    /challenge_select/,
    /challenge_edit/
  ],
  player_card: [
    /playerCardMenu/i,
    /pcard/i,
    /playerChallengeMockup/i,
    /poc\/player/i
  ],
  experimental: [
    /reeces_stuff/i,
    /reece.*stuff/i,
    /experimental/i
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
      return [toButton('viral_menu')].filter(Boolean);
    }

    // Map features to registry-resolved buttons: dedupe by custom_id (several
    // features share an entry point), sort by priority, keep the top 2
    const seen = new Set();
    const buttons = Array.from(features)
      .map(feature => SAFE_TEST_BUTTONS[feature])
      .filter(Boolean)
      .sort((a, b) => a.priority - b.priority)
      .filter(({ custom_id }) => !seen.has(custom_id) && seen.add(custom_id))
      .map(({ custom_id }) => toButton(custom_id))
      .filter(button => button && validateButton(button))
      .slice(0, 2);

    // Detected features with no mapped entry point (e.g. 'analytics') can leave the
    // list empty — treat that like no-features, otherwise the caller's zero-buttons
    // fallback kicks in and drops Pass/Fail from the card entirely
    if (buttons.length === 0) {
      console.log('🔍 Detected features have no mapped buttons, using default menu');
      return [toButton('viral_menu')].filter(Boolean);
    }

    // Always add the general menu as fallback (3rd button)
    if (buttons.length < 3 && !seen.has('viral_menu')) {
      const menu = toButton('viral_menu');
      if (menu) buttons.push(menu);
    }

    console.log(`🔍 Generated ${buttons.length} smart buttons: ${buttons.map(b => b.label).join(', ')}`);
    return buttons;

  } catch (error) {
    console.log(`🔍 Smart button generation failed: ${error.message}`);
    console.log('🔍 Falling back to default menu button');

    // Ultimate fallback - just the menu button (literal: registry itself may have thrown)
    return [{
      type: 2,
      custom_id: 'viral_menu',
      label: 'Open Prod Menu',
      style: 2,
      emoji: { name: '📋' }
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
    
    // Add standard buttons that should always be present (registry-resolved, with
    // literal fallbacks — Pass/Fail must never vanish from a deploy card)
    const standardButtons = [
      toButton('restart_status_passed') || { type: 2, custom_id: 'restart_status_passed', label: 'Pass', style: 2, emoji: { name: '✅' } },
      toButton('restart_status_failed') || { type: 2, custom_id: 'restart_status_failed', label: 'Fail', style: 2, emoji: { name: '❌' } }
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