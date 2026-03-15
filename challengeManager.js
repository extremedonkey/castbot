/**
 * Challenge Manager — CRUD operations and UI for Season Challenges
 *
 * A Challenge is a content card (title, description, image, hosts) that
 * optionally links to a Season Planner round via challengeIDs.
 *
 * Spec: docs/01-RaP/0945_20260316_Challenges_Analysis.md
 */

import { loadPlayerData, savePlayerData } from './storage.js';
import { buildRichCardModal, extractRichCardValues, buildRichCardContainer, parseAccentColor } from './richCardUI.js';
import { countComponents } from './utils.js';

const DEFAULT_ACCENT = 0x5865F2; // Discord blurple

// ─────────────────────────────────────────────
// CRUD Operations
// ─────────────────────────────────────────────

/**
 * Create a new challenge.
 */
export async function createChallenge(guildId, userId, data) {
  const { default: crypto } = await import('crypto');
  const playerData = await loadPlayerData();

  if (!playerData[guildId]) playerData[guildId] = {};
  if (!playerData[guildId].challenges) playerData[guildId].challenges = {};

  const challengeId = `challenge_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;

  playerData[guildId].challenges[challengeId] = {
    title: data.title || 'Untitled Challenge',
    description: data.content || '',
    image: data.image || '',
    accentColor: parseAccentColor(data.color) || DEFAULT_ACCENT,
    creationHost: data.creationHost || userId,
    runningHost: data.runningHost || null,
    seasonId: data.seasonId || null,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };

  await savePlayerData(playerData);
  console.log(`🏃 Challenge: Created "${data.title}" (${challengeId})`);
  return challengeId;
}

/**
 * Update an existing challenge.
 */
export async function updateChallenge(guildId, challengeId, data) {
  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return false;

  if (data.title !== undefined) challenge.title = data.title;
  if (data.content !== undefined) challenge.description = data.content;
  if (data.image !== undefined) challenge.image = data.image;
  if (data.color !== undefined) challenge.accentColor = parseAccentColor(data.color) || challenge.accentColor;
  if (data.creationHost !== undefined) challenge.creationHost = data.creationHost;
  if (data.runningHost !== undefined) challenge.runningHost = data.runningHost;
  challenge.lastUpdated = Date.now();

  await savePlayerData(playerData);
  console.log(`🏃 Challenge: Updated "${challenge.title}" (${challengeId})`);
  return true;
}

/**
 * Delete a challenge and unlink from any rounds.
 */
export async function deleteChallenge(guildId, challengeId) {
  const playerData = await loadPlayerData();
  if (!playerData[guildId]?.challenges?.[challengeId]) return false;

  const title = playerData[guildId].challenges[challengeId].title;
  delete playerData[guildId].challenges[challengeId];

  // Unlink from any rounds that reference this challenge
  const seasonRounds = playerData[guildId]?.seasonRounds;
  if (seasonRounds) {
    for (const seasonId of Object.keys(seasonRounds)) {
      for (const round of Object.values(seasonRounds[seasonId])) {
        if (round.challengeIDs?.primary === challengeId) {
          round.challengeIDs = {};
          round.challengeName = '';
        }
      }
    }
  }

  await savePlayerData(playerData);
  console.log(`🏃 Challenge: Deleted "${title}" (${challengeId})`);
  return true;
}

// ─────────────────────────────────────────────
// UI Builders
// ─────────────────────────────────────────────

/**
 * Build the challenge management screen.
 */
export async function buildChallengeScreen(guildId, selectedChallengeId = null) {
  const playerData = await loadPlayerData();
  const challenges = playerData[guildId]?.challenges || {};
  const entries = Object.entries(challenges);

  // Build select options
  const options = [
    { label: 'Create New Challenge', value: 'challenge_create_new', emoji: { name: '➕' }, description: 'Create a new challenge from scratch' },
  ];

  // Sort by title
  entries.sort(([, a], [, b]) => (a.title || '').localeCompare(b.title || ''));

  // Look up season names for descriptions
  const configs = playerData[guildId]?.applicationConfigs || {};
  const seasonNames = {};
  for (const config of Object.values(configs)) {
    if (config.seasonId && config.seasonName) seasonNames[config.seasonId] = config.seasonName;
  }

  for (const [id, challenge] of entries) {
    if (options.length >= 25) break;
    const label = (challenge.title || 'Untitled').substring(0, 100);
    const seasonLabel = challenge.seasonId && seasonNames[challenge.seasonId]
      ? seasonNames[challenge.seasonId].substring(0, 50)
      : '';
    const desc = seasonLabel
      ? `${seasonLabel}`.substring(0, 100)
      : (challenge.description?.substring(0, 100) || 'No description');
    options.push({
      label, value: id,
      description: desc,
      emoji: { name: '🏃' },
      ...(id === selectedChallengeId ? { default: true } : {})
    });
  }

  const components = [
    { type: 10, content: '# 🏃 Challenges' },
    { type: 14 },
    { type: 1, components: [{
      type: 3,
      custom_id: 'challenge_select',
      placeholder: 'Select or create a challenge...',
      options
    }]},
  ];

  // If a challenge is selected, show its preview
  if (selectedChallengeId && challenges[selectedChallengeId]) {
    const ch = challenges[selectedChallengeId];
    components.push({ type: 14 });

    // RichCard preview
    const hostText = ch.creationHost ? `-# Host: <@${ch.creationHost}>` : '';
    const titleText = (ch.title || 'Untitled').startsWith('#') ? ch.title : `# ${ch.title}`;
    components.push({ type: 10, content: `${titleText}\n${hostText}` });
    if (ch.description) {
      components.push({ type: 10, content: ch.description });
    }

    if (ch.image) {
      try {
        new URL(ch.image);
        components.push({ type: 12, items: [{ media: { url: ch.image }, description: ch.title || 'Challenge' }] });
      } catch { /* invalid URL, skip */ }
    }

    // Action buttons
    components.push(
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: `challenge_edit_${selectedChallengeId}`, label: 'Edit', style: 2, emoji: { name: '✏️' } },
        { type: 2, custom_id: `challenge_round_${selectedChallengeId}`, label: 'Round', style: 2, emoji: { name: '🔥' } },
        { type: 2, custom_id: `challenge_post_${selectedChallengeId}`, label: 'Post to Channel', style: 2, emoji: { name: '#️⃣' } },
        { type: 2, custom_id: `challenge_delete_${selectedChallengeId}`, label: 'Delete', style: 4, emoji: { name: '🗑️' } },
      ]}
    );
  }

  // Back button
  components.push(
    { type: 14 },
    { type: 1, components: [{ type: 2, custom_id: 'prod_menu_back', label: '← Menu', style: 2 }] }
  );

  const container = {
    type: 17,
    accent_color: selectedChallengeId && challenges[selectedChallengeId]
      ? (challenges[selectedChallengeId].accentColor || DEFAULT_ACCENT)
      : DEFAULT_ACCENT,
    components
  };

  countComponents([container], { verbosity: "summary", label: "Challenges" });

  return { components: [container] };
}

/**
 * Build the create/edit challenge modal.
 */
export function buildChallengeModal(challengeId = null, existing = null) {
  const customId = challengeId ? `challenge_modal_edit:${challengeId}` : 'challenge_modal_create';
  const title = challengeId ? 'Edit Challenge' : 'Create Challenge';

  return buildRichCardModal({
    customId,
    modalTitle: title,
    values: existing ? {
      title: existing.title || '',
      content: existing.description || '',
      color: existing.accentColor ? `#${existing.accentColor.toString(16).padStart(6, '0')}` : '',
      image: existing.image || '',
    } : {},
    fields: {
      title: { label: 'Challenge Title', placeholder: 'e.g., "Tycoons of the Nile"', required: true, description: 'The name players will see' },
      content: { label: 'Challenge Writeup', placeholder: 'Challenge rules, instructions, flavor text...', required: false, maxLength: 4000, description: 'Supports formatting: **bold**, *italic*, ## Heading, > quote' },
      color: { label: 'Accent Color', placeholder: '#e74c3c', description: 'Hex color code for the card accent bar' },
      image: { label: 'Image URL', placeholder: 'https://...', description: 'Link to a challenge image (upload to Discord first)' },
    },
  });
}

/**
 * Build the round selector screen for linking a challenge to a round.
 * Follows entity-edit pattern with search support.
 */
export async function buildRoundSelector(guildId, challengeId, searchTerm = '') {
  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return { components: [{ type: 17, components: [{ type: 10, content: '❌ Challenge not found' }] }] };

  const configs = playerData[guildId]?.applicationConfigs || {};
  const allRounds = playerData[guildId]?.seasonRounds || {};
  const challenges = playerData[guildId]?.challenges || {};

  // Collect all rounds across all seasons with their season names
  const roundOptions = [];

  for (const [configId, config] of Object.entries(configs)) {
    if (!config.seasonId || !allRounds[config.seasonId]) continue;
    const seasonName = config.seasonName || 'Unknown Season';
    const rounds = allRounds[config.seasonId];

    for (const [roundId, round] of Object.entries(rounds)) {
      if (round.fNumber === 1) continue; // Skip reunion

      const linkedChalTitle = round.challengeIDs?.primary && challenges[round.challengeIDs.primary]
        ? challenges[round.challengeIDs.primary].title
        : null;
      const label = `F${round.fNumber} - ${linkedChalTitle || `Round ${round.seasonRoundNo}`}`;
      const isLinkedHere = round.challengeIDs?.primary === challengeId;

      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchLabel = label.toLowerCase().includes(term);
        const matchSeason = seasonName.toLowerCase().includes(term);
        const matchF = `f${round.fNumber}`.includes(term);
        if (!matchLabel && !matchSeason && !matchF) continue;
      }

      roundOptions.push({
        label: label.substring(0, 100),
        value: `${config.seasonId}:${roundId}`,
        description: `${seasonName}${isLinkedHere ? ' (currently linked)' : ''}`.substring(0, 100),
        emoji: { name: isLinkedHere ? '✅' : '🔥' },
        ...(isLinkedHere ? { default: true } : {})
      });
    }
  }

  // Sort by season name then round number
  roundOptions.sort((a, b) => a.description.localeCompare(b.description) || a.label.localeCompare(b.label));

  // Build options with search
  const options = [];
  if (roundOptions.length > 10 || searchTerm) {
    options.push({ label: '🔍 Search Rounds', value: 'search_rounds', description: searchTerm ? `Searching: "${searchTerm}"` : 'Search by round, season, or F-number', emoji: { name: '🔍' } });
  }
  if (searchTerm) {
    options.push({ label: '🔙 Back to all', value: 'back_to_all', description: 'Return to full list' });
  }

  // Cap at 25
  for (const opt of roundOptions) {
    if (options.length >= 25) break;
    options.push(opt);
  }

  if (options.length === 0) {
    options.push({ label: 'No rounds found', value: 'none', description: searchTerm ? 'Try a different search' : 'Create a season first' });
  }

  const chalTitle = (challenge.title || 'Untitled').substring(0, 50);
  const container = {
    type: 17, accent_color: challenge.accentColor || DEFAULT_ACCENT,
    components: [
      { type: 10, content: `## 🔥 Link to Round\n-# Assign **${chalTitle}** to a season round` },
      { type: 14 },
      { type: 1, components: [{
        type: 3,
        custom_id: `challenge_round_select_${challengeId}`,
        placeholder: searchTerm ? `Results for "${searchTerm}"...` : 'Select a round...',
        options
      }]},
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: `challenge_select_nav_${challengeId}`, label: '← Back', style: 2 }
      ]}
    ]
  };

  countComponents([container], { verbosity: "summary", label: "Round Selector" });
  return { components: [container] };
}

/**
 * Build the richCard container for posting a challenge to a channel.
 */
export function buildChallengePost(challenge) {
  return buildRichCardContainer({
    title: challenge.title,
    content: challenge.description,
    color: challenge.accentColor,
    image: challenge.image,
    extraComponents: challenge.creationHost ? [
      { type: 14 },
      { type: 10, content: `-# Challenge by <@${challenge.creationHost}>` },
    ] : [],
  });
}
