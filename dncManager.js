/**
 * dncManager.js — Structured Do Not Cast (DNC) System
 *
 * Manages DNC entries for season applications. Each entry captures:
 * - name: How the applicant knows the person (required)
 * - username: Discord username for matching (optional)
 * - userId: Discord user ID from User Select (optional, strongest match)
 * - issues: Description of past conflicts (optional)
 *
 * The person-entry pattern (select list + modal per entry) is designed
 * to be reusable for future features like alliance tracking or player notes.
 */

import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';

/**
 * Get DNC entries with backwards compatibility.
 * Reads dncEntries[] first, falls back to parsing legacy dncList string.
 */
export function getDncEntries(application) {
  if (application?.dncEntries?.length) return application.dncEntries;

  if (application?.dncList) {
    return application.dncList.split('\n').filter(l => l.trim()).map((name, i) => ({
      id: `dnc_migrated_${i}`,
      name: name.trim(),
      username: '',
      userId: null,
      issues: '',
      createdAt: Date.now()
    }));
  }

  return [];
}

/**
 * Build the player-facing DNC question UI.
 * Uses per-entry string selects (like Action Editor outcomes pattern).
 * Each entry is its own select with Edit/Delete options.
 * Max ~8 entries to stay within 40-component limit.
 */
export function buildDncQuestionUI(config, channelId, questionIndex, application) {
  const entries = getDncEntries(application);
  const isLastQuestion = questionIndex === config.questions.length - 1;
  const isSecondToLast = questionIndex === config.questions.length - 2;
  const MAX_DNC_ENTRIES = 8; // 8 entries × 2 (ActionRow+Select) = 16 + header/nav = ~24 total

  const components = [
    {
      type: 10,
      content: `## Q${questionIndex + 1}. Do Not Cast List\n\nIs there anyone in the community that you will not play with?\n-# 🔒 Confidential — only hosts will see this.`
    },
    { type: 14 }
  ];

  if (entries.length === 0) {
    components.push({
      type: 10,
      content: `-# *No one listed yet. Click below to add someone, or skip to the next question.*`
    });
  }

  // Per-entry string selects (like outcome selects in Action Editor)
  entries.forEach((entry, i) => {
    const issuePreview = entry.issues
      ? ` | ${entry.issues.substring(0, 40)}${entry.issues.length > 40 ? '...' : ''}`
      : '';
    const usernameHint = entry.username ? ` (@${entry.username})` : '';
    const summaryLabel = `${i + 1}. 🚷 ${entry.name}${usernameHint}${issuePreview}`.substring(0, 100);

    const options = [
      { label: summaryLabel, value: 'summary', description: 'Current entry summary', default: true },
      { label: 'Edit', value: `edit_${i}`, emoji: { name: '✏️' }, description: 'Edit this DNC entry' },
      { label: '───────────────────', value: `divider_${i}`, description: ' ' },
      { label: 'Delete', value: `delete_${i}`, emoji: { name: '🗑️' }, description: 'Remove this entry' }
    ];

    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: `app_dnc_select_${channelId}_${questionIndex}_${i}`,
        options
      }]
    });
  });

  // "Add person" select (same pattern as question management's "Click here to add...")
  if (entries.length < MAX_DNC_ENTRIES) {
    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: `app_dnc_select_${channelId}_${questionIndex}_add`,
        placeholder: '➕ Click here to add a person to your DNC list...',
        options: [
          { label: 'Add person to DNC list', value: 'add', emoji: { name: '➕' }, description: 'Add someone you prefer not to be cast with' }
        ]
      }]
    });
  }

  // Navigation section
  if (!isLastQuestion) {
    components.push({ type: 14 });
    components.push({
      type: 9,
      components: [{ type: 10, content: isSecondToLast ? '-# ✅ Ready? Submit your application' : '\u200b' }],
      accessory: {
        type: 2,
        custom_id: `app_next_question_${channelId}_${questionIndex}`,
        label: isSecondToLast ? 'Complete' : 'Next',
        style: isSecondToLast ? 3 : 2
      }
    });
  }

  return {
    type: 17,
    accent_color: 0xe74c3c,
    components
  };
}

/**
 * Build the DNC entry modal (4 fields: name, username, user select, issues).
 * @param {Object|null} entry - Existing entry for editing, or null for new
 * @param {string} channelId - Application channel ID
 * @param {string} questionIndex - Question index in the app
 * @param {string|number} entryIndex - Entry index or 'new'
 */
export function buildDncEntryModal(entry, channelId, questionIndex, entryIndex) {
  const isEdit = entry !== null;
  const customId = `app_dnc_entry_modal_${channelId}_${questionIndex}_${entryIndex}`;

  return {
    custom_id: customId,
    title: isEdit ? `Edit DNC Entry — ${entry.name.substring(0, 20)}` : 'Add to DNC List',
    components: [
      {
        type: 18, // Label
        label: 'Name',
        description: isEdit
          ? 'What do you know them as? Clear this field to remove the entry.'
          : 'What do you know them as?',
        component: {
          type: 4, // Text Input
          custom_id: 'dnc_name',
          style: 1,
          required: !isEdit,
          max_length: 100,
          placeholder: 'Their display name, nickname, etc.',
          ...(isEdit && entry.name ? { value: entry.name } : {})
        }
      },
      {
        type: 18, // Label
        label: 'Discord Username',
        description: 'Their exact Discord username (without @) — helps hosts match accurately',
        component: {
          type: 4, // Text Input
          custom_id: 'dnc_username',
          style: 1,
          required: false,
          max_length: 50,
          placeholder: 'e.g. coolbuy12',
          ...(isEdit && entry.username ? { value: entry.username } : {})
        }
      },
      {
        type: 18, // Label
        label: 'Search for User',
        description: 'Optional — only works if they\'re already in this server',
        component: {
          type: 5, // User Select
          custom_id: 'dnc_user_select',
          required: false,
          min_values: 0,
          max_values: 1,
          ...(isEdit && entry.userId ? { default_values: [{ id: entry.userId, type: 'user' }] } : {})
        }
      },
      {
        type: 18, // Label
        label: 'What issues have you had with this person?',
        description: 'Confidential — only hosts will see this',
        component: {
          type: 4, // Text Input
          custom_id: 'dnc_issues',
          style: 2, // Paragraph
          required: false,
          max_length: 500,
          placeholder: 'Briefly describe past conflicts or concerns...',
          ...(isEdit && entry.issues ? { value: entry.issues } : {})
        }
      }
    ]
  };
}

/**
 * Parse DNC entry modal submission into a structured entry.
 * Returns null if name is empty (signals deletion).
 */
export function parseDncModalSubmit(modalComponents, resolvedData, existingEntry = null) {
  let name = '';
  let username = '';
  let userId = null;
  let issues = '';

  for (const comp of modalComponents) {
    // Handle both Label-wrapped (comp.component) and direct (comp.components[0]) formats
    const child = comp.component || comp.components?.[0] || comp;
    const id = child.custom_id;

    if (id === 'dnc_name') {
      name = (child.value || '').trim();
    } else if (id === 'dnc_username') {
      username = (child.value || '').trim().replace(/^@/, '');
    } else if (id === 'dnc_user_select') {
      userId = child.values?.[0] || null;
    } else if (id === 'dnc_issues') {
      issues = (child.value || '').trim();
    }
  }

  // Also try to get userId from resolved data if User Select was used
  if (!userId && resolvedData?.users) {
    const userIds = Object.keys(resolvedData.users);
    if (userIds.length > 0) userId = userIds[0];
  }

  // If the user also provided a username via User Select resolved data, auto-fill
  if (userId && resolvedData?.users?.[userId] && !username) {
    username = resolvedData.users[userId].username || '';
  }

  // Empty name = delete the entry
  if (!name) return null;

  return {
    id: existingEntry?.id || `dnc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    username,
    userId,
    issues,
    createdAt: existingEntry?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

/**
 * Build admin DNC preview (what the player will see).
 */
export function buildDncPreview(questionIndex) {
  return {
    components: [{
      type: 17,
      accent_color: 0xe74c3c,
      components: [
        { type: 10, content: `-# 🔎 Preview — this is what the player will see:` },
        { type: 10, content: `## Q${questionIndex + 1}. Do Not Cast List\n\nIs there anyone in the community that you will not play with?` },
        { type: 14 },
        { type: 10, content: `-# *No one listed yet. Use the menu below to add someone, or skip to the next question.*` },
        {
          type: 1,
          components: [{
            type: 3,
            custom_id: 'preview_dnc_select_disabled',
            placeholder: 'Click to add someone...',
            disabled: true,
            options: [{ label: 'Add person to DNC list', value: 'add', emoji: { name: '➕' } }]
          }]
        }
      ]
    }],
    flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL
  };
}

/**
 * Find DNC conflicts between the current applicant and all other applicants.
 * Three-tier matching: userId (definitive), username (high), name (fuzzy).
 *
 * @param {Object} currentApp - Current applicant's application data
 * @param {Array} allApplications - All applications in the season
 * @param {Object} playerData - Full playerData for the guild
 * @param {string} guildId - Guild ID
 * @returns {Array} Array of conflict objects
 */
export function findDncConflicts(currentApp, allApplications, playerData, guildId) {
  const conflicts = [];
  const currentEntries = getDncEntries(currentApp);
  const currentUserId = currentApp.userId;

  for (const otherApp of allApplications) {
    if (otherApp.channelId === currentApp.channelId) continue;
    const otherData = playerData[guildId]?.applications?.[otherApp.channelId];
    if (!otherData) continue;

    const otherName = otherData.displayName || otherData.username || 'Unknown';
    const otherUserId = otherData.userId;
    const otherUsername = otherData.username;
    const otherEntries = getDncEntries(otherData);

    // Check: does CURRENT applicant have OTHER on their DNC?
    for (const entry of currentEntries) {
      const tier = matchEntry(entry, otherUserId, otherUsername, otherName);
      if (tier) {
        conflicts.push({
          direction: 'current_listed_other',
          otherName,
          otherChannelId: otherApp.channelId,
          entry,
          tier
        });
      }
    }

    // Check: does OTHER have CURRENT applicant on their DNC?
    for (const entry of otherEntries) {
      const tier = matchEntry(entry, currentUserId, currentApp.username, currentApp.displayName || currentApp.username);
      if (tier) {
        conflicts.push({
          direction: 'other_listed_current',
          otherName,
          otherChannelId: otherApp.channelId,
          entry,
          tier
        });
      }
    }
  }

  return conflicts;
}

/**
 * Match a DNC entry against a target user. Returns match tier or null.
 */
function matchEntry(entry, targetUserId, targetUsername, targetDisplayName) {
  // Tier 1: User ID match (definitive)
  if (entry.userId && targetUserId && entry.userId === targetUserId) {
    return 'exact';
  }

  // Tier 2: Username match (high confidence)
  if (entry.username && targetUsername &&
      entry.username.toLowerCase() === targetUsername.toLowerCase()) {
    return 'username';
  }

  // Tier 3: Name match (fuzzy)
  if (entry.name && targetDisplayName) {
    const entryLower = entry.name.toLowerCase();
    const targetLower = targetDisplayName.toLowerCase();
    if (entryLower === targetLower || targetLower.includes(entryLower) || entryLower.includes(targetLower)) {
      return 'name';
    }
  }

  // Also check username against entry name (people often list usernames in the name field)
  if (entry.name && targetUsername) {
    if (entry.name.toLowerCase() === targetUsername.toLowerCase()) {
      return 'name';
    }
  }

  return null;
}

/**
 * Build DNC warning text for Cast Ranking display.
 */
export function buildDncWarnings(conflicts) {
  if (conflicts.length === 0) return '';

  const lines = [];
  for (const c of conflicts) {
    const tierLabel = c.tier === 'exact' ? '' : c.tier === 'username' ? ' (username match)' : ' (possible match)';
    if (c.direction === 'current_listed_other') {
      lines.push(`⚠️ This applicant has listed **${c.otherName}**${tierLabel} on their DNC`);
    } else {
      lines.push(`⚠️ **${c.otherName}** has listed this applicant${tierLabel} on their DNC`);
    }
  }
  return lines.join('\n');
}

/**
 * Build DNC summary for Cast Ranking applicant card.
 */
export function buildDncSummary(application) {
  const entries = getDncEntries(application);
  if (entries.length === 0) {
    return '**DNC List:** No DNC list provided';
  }

  const names = entries.map(e => e.name).join(', ');
  const issues = entries
    .filter(e => e.issues)
    .map(e => `${e.name}: ${e.issues}`)
    .join('; ');

  return `**DNC — Names:** ${names}\n**DNC — Issues:** ${issues || 'No details provided'}`;
}
