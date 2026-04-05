/**
 * challengeActionCreate.js — Quick Create and CRUD for Challenge Action Categories
 *
 * Provides categorized action management for challenges: playerAll, playerIndividual,
 * tribe, host. Creates action shells via the same safariManager pattern as
 * quickActionCreate.js, with bulk creation for Individual/Tribe via multi-select.
 *
 * All business logic — no UI rendering beyond modals. app.js is pure routing.
 *
 * Spec: docs/01-RaP/0943_20260316_ChallengeActions_Analysis.md (Phase 1C)
 */

import { loadPlayerData, savePlayerData } from './storage.js';
import { resolveEmoji } from './utils/emojiUtils.js';

// ─────────────────────────────────────────────
// Backwards-compat helper: normalize assignment values
// ─────────────────────────────────────────────

/**
 * Normalize a challenge action link value to always be an array of link objects.
 * Handles 3 legacy formats:
 *   - string "actionId" → [{ actionId, timer: 'none' }]
 *   - ["actionId1", "actionId2"] → [{ actionId: "actionId1", timer: 'none' }, ...]
 *   - [{ actionId, timer }] → pass through (current format)
 * @param {string|string[]|object[]|undefined|null} value
 * @returns {{ actionId: string, timer: string }[]}
 */
export function normalizeLinks(value) {
  if (!value) return [];
  if (!Array.isArray(value)) value = [value];
  return value.map(v => {
    if (typeof v === 'string') return { actionId: v, timer: 'none' };
    if (v && typeof v === 'object' && v.actionId) return v;
    return { actionId: String(v), timer: 'none' };
  });
}

/**
 * Extract just the actionIds from a normalized link array.
 * @param {string|string[]|object[]|undefined|null} value
 * @returns {string[]}
 */
export function extractActionIds(value) {
  return normalizeLinks(value).map(link => link.actionId);
}

// Keep old name as alias for any external consumers
export const normalizeAssignment = extractActionIds;

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

// buildField5 removed — Phase 1C uses Mentionable Select + Timer instead
function _unused_buildField5(category) {
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
  for (const id of extractActionIds(challenge.actions.playerAll)) all.add(id);
  for (const ids of Object.values(challenge.actions.playerIndividual || {})) {
    for (const id of extractActionIds(ids)) all.add(id);
  }
  for (const ids of Object.values(challenge.actions.tribe || {})) {
    for (const id of extractActionIds(ids)) all.add(id);
  }
  for (const id of extractActionIds(challenge.actions.host)) all.add(id);
  challenge.actionIds = [...all];
}

// ─────────────────────────────────────────────
// Exported: Modal builder (sync)
// ─────────────────────────────────────────────

/**
 * Build Quick Create modal for challenge actions (Phase 1C).
 * 5 fields: Action Name, Action Type, Mentionable Select, Display Text (optional), Timer.
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
        label: 'Action Name',
        description: 'Name for the action (e.g., "START - Touchy Subjects")',
        component: {
          type: 4,
          custom_id: 'action_name',
          style: 1,
          placeholder: 'e.g., "START - Touchy Subjects"',
          required: true,
          max_length: 80,
        },
      },
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
        label: 'Associated Players / Tribes',
        description: 'Only use if Individual Player / Tribe Actions was selected above (special commands per user/tribe)',
        component: {
          type: 7, // Mentionable Select
          custom_id: 'assign_to',
          placeholder: 'Select players or tribe roles...',
          min_values: 0,
          max_values: 25,
          required: false,
        },
      },
      {
        type: 18,
        label: 'Display Text (Optional)',
        description: 'What the player sees when they click. Leave blank to configure later.',
        component: {
          type: 4,
          custom_id: 'display_text',
          style: 2,
          placeholder: 'Instructions, links, or content shown on click...',
          required: false,
          max_length: 2000,
        },
      },
      {
        type: 18,
        label: 'Challenge Timer',
        description: 'Should CastBot time how long the player takes?',
        component: {
          type: 3,
          custom_id: 'timer_mode',
          placeholder: 'Select timer mode...',
          min_values: 1,
          max_values: 1,
          options: [
            { label: 'No Timer', value: 'none', emoji: { name: '♾️' }, description: 'Timer is not needed for this challenge', default: true },
            { label: 'Timed', value: 'timed', emoji: { name: '⏱️' }, description: 'CastBot tracks how long the player takes' },
          ],
        },
      },
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
export async function handleQuickChallengeActionSubmit(guildId, userId, challengeId, modalComponents, guild, resolvedData) {
  // Extract values from new modal layout:
  // [0] Action Name, [1] Action Type, [2] Mentionable Select, [3] Display Text, [4] Timer
  const actionName = getModalValue(modalComponents[0]);
  const category = getModalValue(modalComponents[1]);
  const mentionableIds = getModalValues(modalComponents[2]);
  const displayText = getModalValue(modalComponents[3]);
  const timerMode = getModalValue(modalComponents[4]) || 'none';

  // Parse mentionables into users and roles using resolved data
  const resolvedUsers = resolvedData?.users ? Object.keys(resolvedData.users) : [];
  const resolvedRoles = resolvedData?.roles ? Object.keys(resolvedData.roles) : [];

  // Determine assignment IDs based on category
  let assignToIds = [];
  let warnings = [];
  if (category === 'playerIndividual') {
    assignToIds = [...new Set(resolvedUsers)]; // Deduplicate
    if (resolvedRoles.length > 0) warnings.push('Roles ignored — Individual Player Action only supports users.');
  } else if (category === 'tribe') {
    assignToIds = [...new Set(resolvedRoles)]; // Deduplicate
    if (resolvedUsers.length > 0) warnings.push('Users ignored — Tribe Action only supports roles.');
  } else if (category === 'playerAll' || category === 'host') {
    if (mentionableIds.length > 0) warnings.push(`${CATEGORY_TYPES[category]?.label} doesn't support per-player/tribe assignment. Created 1 shared action.`);
  }

  // Validate
  if (!category || !CATEGORY_TYPES[category]) {
    return { error: 'Invalid action type selected.' };
  }
  if (!actionName) {
    return { error: 'Action name is required.' };
  }

  const validatedEmoji = null; // Emoji removed from modal — configure in Action Editor

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
    // Use readable prefix + UUID suffix for guaranteed uniqueness in bulk creation
    // (generateButtonId truncates to 20 chars, causing collisions when labels share a prefix)
    const sanitized = label.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/g, '').substring(0, 20);
    const unique = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const actionId = `${sanitized}_${unique}`;

    // Build outcomes — only add display_text if content provided
    const outcomes = [];
    if (displayText && displayText.trim()) {
      outcomes.push({
        type: 'display_text',
        order: 0,
        config: { content: displayText.trim() },
        executeOn: 'true',
      });
    }

    safariData[guildId].buttons[actionId] = {
      id: actionId,
      name: label,
      label: label,
      emoji: validatedEmoji,
      style: 'Primary',
      trigger: { type: 'button', button: { style: 'Primary' } },
      actions: outcomes,
      metadata: {
        createdBy: userId,
        createdAt: now,
        lastModified: now,
        usageCount: 0,
        tags: [],
        createdVia: `quick_challenge_${category}`,
        challengeTimer: timerMode,
        challengeId,
      },
    };

    createdActionIds.push(actionId);
    return actionId;
  }

  // Create action(s) based on category
  if (category === 'playerAll') {
    const actionId = createActionShell(actionName);
    challenge.actions.playerAll.push({ actionId, timer: timerMode });
  } else if (category === 'host') {
    const actionId = createActionShell(actionName);
    challenge.actions.host.push({ actionId, timer: timerMode });
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
      const label = `${actionName} - ${displayName}`.substring(0, 100);
      const actionId = createActionShell(label, i);
      if (!challenge.actions.playerIndividual[playerId]) challenge.actions.playerIndividual[playerId] = [];
      challenge.actions.playerIndividual[playerId].push({ actionId, timer: timerMode });
    }
  } else if (category === 'tribe') {
    for (let i = 0; i < assignToIds.length; i++) {
      const roleId = assignToIds[i];
      let roleName = roleId;
      if (guild) {
        const role = guild.roles.cache.get(roleId);
        if (role) roleName = role.name;
      }
      const label = `${actionName} - ${roleName}`.substring(0, 100);
      const actionId = createActionShell(label, i);
      if (!challenge.actions.tribe[roleId]) challenge.actions.tribe[roleId] = [];
      challenge.actions.tribe[roleId].push({ actionId, timer: timerMode });
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

  return { actionIds: createdActionIds, category, count: createdActionIds.length, warnings, timerMode };
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

  const link = { actionId, timer: 'none' };

  if (category === 'playerAll') {
    if (!extractActionIds(challenge.actions.playerAll).includes(actionId)) {
      challenge.actions.playerAll.push(link);
    }
  } else if (category === 'host') {
    if (!extractActionIds(challenge.actions.host).includes(actionId)) {
      challenge.actions.host.push(link);
    }
  } else if (category === 'playerIndividual') {
    if (!assignmentId) return { linked: false, error: 'assignmentId (userId) required for playerIndividual.' };
    if (!challenge.actions.playerIndividual[assignmentId]) challenge.actions.playerIndividual[assignmentId] = [];
    const ids = extractActionIds(challenge.actions.playerIndividual[assignmentId]);
    if (!ids.includes(actionId)) {
      challenge.actions.playerIndividual[assignmentId] = [...normalizeLinks(challenge.actions.playerIndividual[assignmentId]), link];
    }
  } else if (category === 'tribe') {
    if (!assignmentId) return { linked: false, error: 'assignmentId (roleId) required for tribe.' };
    if (!challenge.actions.tribe[assignmentId]) challenge.actions.tribe[assignmentId] = [];
    const ids = extractActionIds(challenge.actions.tribe[assignmentId]);
    if (!ids.includes(actionId)) {
      challenge.actions.tribe[assignmentId] = [...normalizeLinks(challenge.actions.tribe[assignmentId]), link];
    }
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
    challenge.actions.playerAll = normalizeLinks(challenge.actions.playerAll).filter(link => link.actionId !== actionId);
  } else if (category === 'host') {
    challenge.actions.host = normalizeLinks(challenge.actions.host).filter(link => link.actionId !== actionId);
  } else if (category === 'playerIndividual') {
    for (const [key, val] of Object.entries(challenge.actions.playerIndividual)) {
      const links = normalizeLinks(val);
      const filtered = links.filter(link => link.actionId !== actionId);
      if (filtered.length < links.length) {
        if (filtered.length === 0) delete challenge.actions.playerIndividual[key];
        else challenge.actions.playerIndividual[key] = filtered;
        break;
      }
    }
  } else if (category === 'tribe') {
    for (const [key, val] of Object.entries(challenge.actions.tribe)) {
      const links = normalizeLinks(val);
      const filtered = links.filter(link => link.actionId !== actionId);
      if (filtered.length < links.length) {
        if (filtered.length === 0) delete challenge.actions.tribe[key];
        else challenge.actions.tribe[key] = filtered;
        break;
      }
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
    challenge.actions.playerAll = normalizeLinks(challenge.actions.playerAll).filter(link => link.actionId !== actionId);
  } else if (category === 'host') {
    challenge.actions.host = normalizeLinks(challenge.actions.host).filter(link => link.actionId !== actionId);
  } else if (category === 'playerIndividual') {
    for (const [key, val] of Object.entries(challenge.actions.playerIndividual)) {
      const links = normalizeLinks(val);
      const filtered = links.filter(link => link.actionId !== actionId);
      if (filtered.length < links.length) {
        if (filtered.length === 0) delete challenge.actions.playerIndividual[key];
        else challenge.actions.playerIndividual[key] = filtered;
        break;
      }
    }
  } else if (category === 'tribe') {
    for (const [key, val] of Object.entries(challenge.actions.tribe)) {
      const links = normalizeLinks(val);
      const filtered = links.filter(link => link.actionId !== actionId);
      if (filtered.length < links.length) {
        if (filtered.length === 0) delete challenge.actions.tribe[key];
        else challenge.actions.tribe[key] = filtered;
        break;
      }
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
  const indCount = Object.values(actions.playerIndividual).reduce((sum, v) => sum + normalizeLinks(v).length, 0);
  const triCount = Object.values(actions.tribe).reduce((sum, v) => sum + normalizeLinks(v).length, 0);

  return {
    playerAll: { count: actions.playerAll.length, ids: actions.playerAll },
    playerIndividual: { count: indCount, assignments: actions.playerIndividual },
    tribe: { count: triCount, assignments: actions.tribe },
    host: { count: actions.host.length, ids: actions.host },
    total: actions.playerAll.length + indCount + triCount + actions.host.length,
  };
}

// ─────────────────────────────────────────────
// Exported: Security — Access verification (sync)
// ─────────────────────────────────────────────

/**
 * Verify a member has access to execute a challenge action.
 * Called before executeButtonActions() for challenge-posted action buttons.
 * @param {object} challenge - Challenge entity
 * @param {string} actionId - The action being executed
 * @param {object} member - Discord GuildMember (needs .user.id and .roles.cache)
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function verifyChallengeActionAccess(challenge, actionId, member) {
  const actions = getChallengeActions(challenge);

  // playerAll — anyone can execute
  if (extractActionIds(actions.playerAll).includes(actionId)) {
    return { allowed: true };
  }

  // playerIndividual — only the assigned player
  for (const [userId, assignedIds] of Object.entries(actions.playerIndividual)) {
    if (extractActionIds(assignedIds).includes(actionId)) {
      if (member?.user?.id === userId) return { allowed: true };
      return { allowed: false, reason: 'This action isn\'t assigned to you.' };
    }
  }

  // tribe — only members with the tribe role
  for (const [roleId, assignedIds] of Object.entries(actions.tribe)) {
    if (extractActionIds(assignedIds).includes(actionId)) {
      if (member?.roles?.cache?.has(roleId)) return { allowed: true };
      return { allowed: false, reason: 'This action is for another tribe.' };
    }
  }

  // host — only users with ManageRoles (standard host permission)
  if (extractActionIds(actions.host).includes(actionId)) {
    const hasPermission = member?.permissions?.has?.(1n << 28n); // MANAGE_ROLES
    if (hasPermission) return { allowed: true };
    return { allowed: false, reason: 'This is a host-only action.' };
  }

  // Not found in any category — allow (backwards compat with legacy actionIds)
  return { allowed: true };
}

// ─────────────────────────────────────────────
// Exported: UI builder — Challenge Action Select (async)
// ─────────────────────────────────────────────

/**
 * Build the ⚡ Challenge Actions select components for the challenge detail screen.
 * Returns components array (heading + select) to splice into buildChallengeScreen.
 * Follows createCustomActionSelectionUI pattern (customActionUI.js).
 * @param {string} guildId
 * @param {string} challengeId
 * @returns {Promise<Array>} Components array (may be empty if no challenge found)
 */
export async function buildChallengeActionSelect(guildId, challengeId) {
  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return [];

  const { loadSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  const allButtons = safariData[guildId]?.buttons || {};

  // Gather all linked action IDs across all categories
  const actions = getChallengeActions(challenge);
  const allLinkedIds = new Set([
    ...extractActionIds(actions.playerAll),
    ...Object.values(actions.playerIndividual).flatMap(v => extractActionIds(v)),
    ...Object.values(actions.tribe).flatMap(v => extractActionIds(v)),
    ...extractActionIds(actions.host),
  ]);

  const totalActions = allLinkedIds.size;

  // Build options — fixed options first
  const options = [
    { label: '➕ Create New Challenge Action', value: 'create_new', description: 'Design a new action for this challenge', emoji: { name: '➕' } },
  ];
  if (totalActions > 10) {
    options.push({ label: '🔍 Search Actions', value: 'search_actions', description: 'Search through challenge actions', emoji: { name: '🔍' } });
  }
  if (totalActions > 0) {
    options.push({ label: '🔄 Clone Action', value: 'clone_action', description: 'Duplicate an existing action', emoji: { name: '🔄' } });
  }

  // Action options — sorted by lastModified (newest first)
  const fixedCount = options.length;
  const maxSlots = 25 - fixedCount;

  const actionEntries = [...allLinkedIds]
    .map(id => ({ id, action: allButtons[id] }))
    .filter(({ action }) => action) // skip orphaned refs
    .sort((a, b) => {
      const aTime = a.action.metadata?.lastModified || 0;
      const bTime = b.action.metadata?.lastModified || 0;
      return bTime - aTime;
    })
    .slice(0, maxSlots);

  for (const { id, action } of actionEntries) {
    const name = (action.name || action.label || 'Unnamed Action').substring(0, 100);
    const outcomeCount = action.actions?.length || 0;
    let desc = action.description || 'No description';
    if (outcomeCount > 0) desc += ` · ${outcomeCount} outcome${outcomeCount !== 1 ? 's' : ''}`;

    options.push({
      label: name,
      value: id,
      description: desc.substring(0, 100),
      emoji: resolveEmoji(action.emoji || action.trigger?.button?.emoji, '⚡'),
    });
  }

  // Build components (heading + select)
  const placeholder = totalActions > 0
    ? `${totalActions} action${totalActions === 1 ? '' : 's'} linked`
    : 'No actions — select to create...';

  return [
    { type: 10, content: `### \`\`\`⚡ Challenge Actions\`\`\`\n-# Equivalent to carlbot \`?tags\` (but better!)` },
    { type: 1, components: [{
      type: 3,
      custom_id: `challenge_action_cat_select_${challengeId}`,
      placeholder,
      options: options.slice(0, 25),
    }]},
  ];
}
