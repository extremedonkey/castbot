/**
 * challengeActionCreate.js — Quick Create and CRUD for Challenge Action Categories
 *
 * Provides categorized action management for challenges: playerAll, playerIndividual,
 * tribe, host. Creates action shells via the same safariManager pattern as
 * quickActionCreate.js, with bulk creation for Individual/Tribe via multi-select.
 *
 * All business logic — no UI rendering beyond modals. app.js is pure routing.
 *
 * Spec: docs/01-RaP/0943_20260316_ChallengeActions_Analysis.md (Phase 1B)
 */

import { loadPlayerData, savePlayerData } from './storage.js';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

export const CATEGORY_TYPES = {
  playerAll:        { label: 'Player Action — All',      emoji: '⚡', description: 'Same command for all players (e.g., jigsaw link)' },
  playerIndividual: { label: 'Individual Player Action', emoji: '👤', description: 'Unique command per player (e.g., private sheet)' },
  tribe:            { label: 'Tribe Challenge Action',    emoji: '🏰', description: 'Unique command per tribe (e.g., tribe attack)' },
  host:             { label: 'Host Challenge Action',     emoji: '🔧', description: 'Automation for hosts beyond challenge text' },
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_TYPES).map(([value, meta]) => ({
  label: meta.label,
  value,
  emoji: { name: meta.emoji },
  description: meta.description,
}));

const COLOR_OPTIONS = [
  { label: 'Blue (Primary)', value: 'Primary', emoji: { name: '🔵' }, default: true },
  { label: 'Grey (Secondary)', value: 'Secondary', emoji: { name: '⚪' } },
  { label: 'Green (Success)', value: 'Success', emoji: { name: '🟢' } },
  { label: 'Red (Danger)', value: 'Danger', emoji: { name: '🔴' } },
];

// ─────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────

/**
 * Extract a single value from a modal submit component (TextInput or String Select).
 * Same pattern as quickActionCreate.js:199-208.
 */
function getModalValue(comp) {
  if (!comp?.component) return null;
  if (Array.isArray(comp.component.values)) {
    return comp.component.values[0] || null;
  }
  const val = comp.component.value;
  return typeof val === 'string' ? val.trim() || null : null;
}

/**
 * Extract all values from a modal submit component (User Select / Role Select multi).
 */
function getModalValues(comp) {
  if (!comp?.component) return [];
  if (Array.isArray(comp.component.values)) {
    return comp.component.values;
  }
  return [];
}

/**
 * Ensure challenge.actions exists, lazy-initializing from legacy actionIds.
 * Mutates challenge in place.
 */
function ensureActions(challenge) {
  if (!challenge.actions) {
    challenge.actions = {
      playerAll: [...(challenge.actionIds || [])],
      playerIndividual: {},
      tribe: {},
      host: [],
    };
  }
  // Fill any missing categories
  if (!challenge.actions.playerAll) challenge.actions.playerAll = [];
  if (!challenge.actions.playerIndividual) challenge.actions.playerIndividual = {};
  if (!challenge.actions.tribe) challenge.actions.tribe = {};
  if (!challenge.actions.host) challenge.actions.host = [];
}

/**
 * Build the 5th modal field — adapts based on category.
 */
function buildField5(category) {
  if (category === 'playerIndividual') {
    return {
      type: 18,
      label: 'Assign to Players',
      description: 'Select players to create individual actions for',
      component: {
        type: 5, // User Select
        custom_id: 'assign_to',
        placeholder: 'Select players...',
        min_values: 1,
        max_values: 25,
      },
    };
  }
  if (category === 'tribe') {
    return {
      type: 18,
      label: 'Assign to Tribes',
      description: 'Select tribe roles to create actions for',
      component: {
        type: 6, // Role Select
        custom_id: 'assign_to',
        placeholder: 'Select tribe roles...',
        min_values: 1,
        max_values: 25,
      },
    };
  }
  return {
    type: 18,
    label: 'Button Color',
    description: 'Color of the button',
    component: {
      type: 3,
      custom_id: 'button_color',
      placeholder: 'Select button color...',
      min_values: 1,
      max_values: 1,
      options: COLOR_OPTIONS,
    },
  };
}

// ─────────────────────────────────────────────
// Exported: Pure helpers (sync, no I/O)
// ─────────────────────────────────────────────

/**
 * Get categorized actions from a challenge, with fallback to legacy actionIds.
 * @param {object} challenge - Challenge entity
 * @returns {{ playerAll: string[], playerIndividual: Object<string,string>, tribe: Object<string,string>, host: string[] }}
 */
export function getChallengeActions(challenge) {
  if (challenge.actions) {
    return {
      playerAll: challenge.actions.playerAll || [],
      playerIndividual: challenge.actions.playerIndividual || {},
      tribe: challenge.actions.tribe || {},
      host: challenge.actions.host || [],
    };
  }
  return {
    playerAll: challenge.actionIds || [],
    playerIndividual: {},
    tribe: {},
    host: [],
  };
}

/**
 * Sync challenge.actionIds as flat union of all categorized action IDs.
 * Ensures backwards compatibility with all existing actionIds consumers.
 * @param {object} challenge - Challenge entity (mutated in place)
 */
export function syncActionIds(challenge) {
  if (!challenge.actions) return;
  const all = new Set();
  for (const id of (challenge.actions.playerAll || [])) all.add(id);
  for (const id of Object.values(challenge.actions.playerIndividual || {})) all.add(id);
  for (const id of Object.values(challenge.actions.tribe || {})) all.add(id);
  for (const id of (challenge.actions.host || [])) all.add(id);
  challenge.actionIds = [...all];
}

// ─────────────────────────────────────────────
// Exported: Modal builder (sync)
// ─────────────────────────────────────────────

/**
 * Build Quick Create modal for challenge actions.
 * @param {string} challengeId
 * @param {string|null} category - Pre-selected category (null = no default)
 * @returns {object} Modal data (caller wraps in { type: 9, data: ... })
 */
export function buildQuickChallengeActionModal(challengeId, category = null) {
  return {
    custom_id: `challenge_action_create_modal_${challengeId}`,
    title: 'Quick Challenge Action',
    components: [
      {
        type: 18,
        label: 'Action Type',
        description: 'What kind of challenge action is this?',
        component: {
          type: 3,
          custom_id: 'action_category',
          placeholder: 'Select action type...',
          min_values: 1,
          max_values: 1,
          options: CATEGORY_OPTIONS.map(opt => ({
            ...opt,
            default: opt.value === category,
          })),
        },
      },
      {
        type: 18,
        label: 'Action Name',
        description: 'Name for the button players will click',
        component: {
          type: 4,
          custom_id: 'action_name',
          style: 1,
          placeholder: 'e.g., "Start Jigsaw Puzzle"',
          required: true,
          max_length: 80,
        },
      },
      {
        type: 18,
        label: 'Display Text',
        description: 'What the player sees when they click. Markdown supported.',
        component: {
          type: 4,
          custom_id: 'display_text',
          style: 2,
          placeholder: 'Instructions, links, or content shown on click...',
          required: true,
          max_length: 2000,
        },
      },
      {
        type: 18,
        label: 'Button Emoji (Optional)',
        description: 'Emoji that appears on the button',
        component: {
          type: 4,
          custom_id: 'button_emoji',
          style: 1,
          placeholder: 'e.g., 🧩',
          required: false,
          max_length: 100,
        },
      },
      buildField5(category),
    ],
  };
}

// ─────────────────────────────────────────────
// Exported: Submission handler (async)
// ─────────────────────────────────────────────

/**
 * Handle Quick Challenge Action modal submission.
 * Creates 1 action (playerAll/host) or N actions (individual/tribe) and links to challenge.
 * @param {string} guildId
 * @param {string} userId - Creating host's userId
 * @param {string} challengeId
 * @param {Array} modalComponents - Modal submit components array
 * @param {object} [guild] - Discord guild object (for display name resolution)
 * @returns {Promise<{ actionIds: string[], category: string, count: number } | { error: string }>}
 */
export async function handleQuickChallengeActionSubmit(guildId, userId, challengeId, modalComponents, guild) {
  // Extract values
  const category = getModalValue(modalComponents[0]);
  const actionName = getModalValue(modalComponents[1]);
  const displayText = getModalValue(modalComponents[2]);
  const emojiInput = getModalValue(modalComponents[3]);

  // Field 5: either assignTo values (User/Role Select) or buttonColor (String Select)
  const isAssignmentCategory = category === 'playerIndividual' || category === 'tribe';
  const assignToIds = isAssignmentCategory ? getModalValues(modalComponents[4]) : [];
  const buttonColor = !isAssignmentCategory ? (getModalValue(modalComponents[4]) || 'Primary') : 'Primary';

  // Validate
  if (!category || !CATEGORY_TYPES[category]) {
    return { error: 'Invalid action type selected.' };
  }
  if (!actionName) {
    return { error: 'Action name is required.' };
  }
  if (!displayText) {
    return { error: 'Display text is required.' };
  }
  if (isAssignmentCategory && assignToIds.length === 0) {
    return { error: `At least one ${category === 'playerIndividual' ? 'player' : 'tribe role'} must be selected.` };
  }

  // Validate emoji
  let validatedEmoji = null;
  if (emojiInput) {
    const { createSafeEmoji } = await import('./safariButtonHelper.js');
    const safe = await createSafeEmoji(emojiInput);
    if (safe) validatedEmoji = emojiInput;
  }

  // Load both data stores (one load each)
  const playerData = await loadPlayerData();
  const { generateButtonId, loadSafariContent, saveSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();

  // Verify challenge exists
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return { error: 'Challenge not found.' };

  // Lazy-init categorized actions
  ensureActions(challenge);

  // Ensure guild has buttons object in safariData
  if (!safariData[guildId]) safariData[guildId] = {};
  if (!safariData[guildId].buttons) safariData[guildId].buttons = {};

  const now = Date.now();
  const createdActionIds = [];

  /**
   * Create a single action shell in safariData and return its ID.
   */
  function createActionShell(label, index = 0) {
    // Add index suffix to prevent ID collisions in bulk creation within same ms
    const idLabel = index > 0 ? `${label}_${index}` : label;
    const actionId = generateButtonId(idLabel);

    safariData[guildId].buttons[actionId] = {
      id: actionId,
      name: label,
      label: label,
      emoji: validatedEmoji,
      style: buttonColor,
      trigger: { type: 'button', button: { style: buttonColor } },
      actions: [{
        type: 'display_text',
        order: 0,
        config: { text: displayText },
        executeOn: 'true',
      }],
      metadata: {
        createdBy: userId,
        createdAt: now,
        lastModified: now,
        usageCount: 0,
        tags: [],
        createdVia: `quick_challenge_${category}`,
        challengeId,
      },
    };

    createdActionIds.push(actionId);
    return actionId;
  }

  // Create action(s) based on category
  if (category === 'playerAll') {
    const actionId = createActionShell(actionName);
    challenge.actions.playerAll.push(actionId);
  } else if (category === 'host') {
    const actionId = createActionShell(actionName);
    challenge.actions.host.push(actionId);
  } else if (category === 'playerIndividual') {
    for (let i = 0; i < assignToIds.length; i++) {
      const playerId = assignToIds[i];
      let displayName = `<@${playerId}>`;
      if (guild) {
        try {
          const member = await guild.members.fetch(playerId);
          displayName = member.displayName || member.user.username;
        } catch { /* fallback to mention */ }
      }
      const label = `${actionName} (${displayName})`.substring(0, 80);
      const actionId = createActionShell(label, i);
      challenge.actions.playerIndividual[playerId] = actionId;
    }
  } else if (category === 'tribe') {
    for (let i = 0; i < assignToIds.length; i++) {
      const roleId = assignToIds[i];
      let roleName = roleId;
      if (guild) {
        const role = guild.roles.cache.get(roleId);
        if (role) roleName = role.name;
      }
      const label = `${actionName} (${roleName})`.substring(0, 80);
      const actionId = createActionShell(label, i);
      challenge.actions.tribe[roleId] = actionId;
    }
  }

  // Sync flat actionIds for backwards compatibility
  syncActionIds(challenge);
  challenge.lastUpdated = now;

  // Save both stores
  await saveSafariContent(safariData);
  await savePlayerData(playerData);

  const typeLabel = CATEGORY_TYPES[category].label;
  console.log(`⚡ Challenge Action: Created ${createdActionIds.length}x ${typeLabel} for ${challengeId}`);

  return { actionIds: createdActionIds, category, count: createdActionIds.length };
}

// ─────────────────────────────────────────────
// Exported: CRUD helpers (async)
// ─────────────────────────────────────────────

/**
 * Link an existing action to a specific challenge category.
 * @param {string} guildId
 * @param {string} challengeId
 * @param {string} actionId
 * @param {string} category - 'playerAll' | 'playerIndividual' | 'tribe' | 'host'
 * @param {string} [assignmentId] - userId (playerIndividual) or roleId (tribe). Required for those categories.
 * @returns {Promise<{ linked: boolean, error?: string }>}
 */
export async function linkChallengeAction(guildId, challengeId, actionId, category, assignmentId = null) {
  if (!CATEGORY_TYPES[category]) return { linked: false, error: 'Invalid category.' };

  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return { linked: false, error: 'Challenge not found.' };

  ensureActions(challenge);

  if (category === 'playerAll') {
    if (!challenge.actions.playerAll.includes(actionId)) {
      challenge.actions.playerAll.push(actionId);
    }
  } else if (category === 'host') {
    if (!challenge.actions.host.includes(actionId)) {
      challenge.actions.host.push(actionId);
    }
  } else if (category === 'playerIndividual') {
    if (!assignmentId) return { linked: false, error: 'assignmentId (userId) required for playerIndividual.' };
    challenge.actions.playerIndividual[assignmentId] = actionId;
  } else if (category === 'tribe') {
    if (!assignmentId) return { linked: false, error: 'assignmentId (roleId) required for tribe.' };
    challenge.actions.tribe[assignmentId] = actionId;
  }

  syncActionIds(challenge);
  challenge.lastUpdated = Date.now();
  await savePlayerData(playerData);

  console.log(`⚡ Challenge Action: Linked ${actionId} as ${category} to ${challengeId}`);
  return { linked: true };
}

/**
 * Unlink an action from a challenge category. Action entity is preserved in safariContent.
 * @param {string} guildId
 * @param {string} challengeId
 * @param {string} actionId
 * @param {string} category
 * @returns {Promise<{ unlinked: boolean, error?: string }>}
 */
export async function unlinkChallengeAction(guildId, challengeId, actionId, category) {
  if (!CATEGORY_TYPES[category]) return { unlinked: false, error: 'Invalid category.' };

  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return { unlinked: false, error: 'Challenge not found.' };

  ensureActions(challenge);

  if (category === 'playerAll') {
    challenge.actions.playerAll = challenge.actions.playerAll.filter(id => id !== actionId);
  } else if (category === 'host') {
    challenge.actions.host = challenge.actions.host.filter(id => id !== actionId);
  } else if (category === 'playerIndividual') {
    for (const [key, val] of Object.entries(challenge.actions.playerIndividual)) {
      if (val === actionId) { delete challenge.actions.playerIndividual[key]; break; }
    }
  } else if (category === 'tribe') {
    for (const [key, val] of Object.entries(challenge.actions.tribe)) {
      if (val === actionId) { delete challenge.actions.tribe[key]; break; }
    }
  }

  syncActionIds(challenge);
  challenge.lastUpdated = Date.now();
  await savePlayerData(playerData);

  console.log(`⚡ Challenge Action: Unlinked ${actionId} from ${category} in ${challengeId}`);
  return { unlinked: true };
}

/**
 * Unlink and delete an action from a challenge category.
 * Removes from challenge.actions AND deletes from safariData[guildId].buttons.
 * @param {string} guildId
 * @param {string} challengeId
 * @param {string} actionId
 * @param {string} category
 * @returns {Promise<{ deleted: boolean, error?: string }>}
 */
export async function deleteChallengeAction(guildId, challengeId, actionId, category) {
  if (!CATEGORY_TYPES[category]) return { deleted: false, error: 'Invalid category.' };

  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return { deleted: false, error: 'Challenge not found.' };

  ensureActions(challenge);

  // Remove from challenge.actions (inline, not calling unlinkChallengeAction to avoid double load/save)
  if (category === 'playerAll') {
    challenge.actions.playerAll = challenge.actions.playerAll.filter(id => id !== actionId);
  } else if (category === 'host') {
    challenge.actions.host = challenge.actions.host.filter(id => id !== actionId);
  } else if (category === 'playerIndividual') {
    for (const [key, val] of Object.entries(challenge.actions.playerIndividual)) {
      if (val === actionId) { delete challenge.actions.playerIndividual[key]; break; }
    }
  } else if (category === 'tribe') {
    for (const [key, val] of Object.entries(challenge.actions.tribe)) {
      if (val === actionId) { delete challenge.actions.tribe[key]; break; }
    }
  }

  syncActionIds(challenge);
  challenge.lastUpdated = Date.now();

  // Delete action entity from safariContent
  const { loadSafariContent, saveSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  if (safariData[guildId]?.buttons?.[actionId]) {
    delete safariData[guildId].buttons[actionId];
    await saveSafariContent(safariData);
  }

  await savePlayerData(playerData);

  console.log(`⚡ Challenge Action: Deleted ${actionId} from ${category} in ${challengeId}`);
  return { deleted: true };
}

// ─────────────────────────────────────────────
// Exported: Summary helper (async)
// ─────────────────────────────────────────────

/**
 * Get summary counts and details for challenge actions.
 * @param {string} guildId
 * @param {string} challengeId
 * @returns {Promise<{ playerAll: { count, ids }, playerIndividual: { count, assignments }, tribe: { count, assignments }, host: { count, ids }, total: number } | null>}
 */
export async function getChallengeActionSummary(guildId, challengeId) {
  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return null;

  const actions = getChallengeActions(challenge);
  const playerIndividualAssignments = Object.entries(actions.playerIndividual);
  const tribeAssignments = Object.entries(actions.tribe);

  return {
    playerAll: { count: actions.playerAll.length, ids: actions.playerAll },
    playerIndividual: { count: playerIndividualAssignments.length, assignments: actions.playerIndividual },
    tribe: { count: tribeAssignments.length, assignments: actions.tribe },
    host: { count: actions.host.length, ids: actions.host },
    total: actions.playerAll.length + playerIndividualAssignments.length + tribeAssignments.length + actions.host.length,
  };
}
