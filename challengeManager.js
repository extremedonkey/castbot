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
    actionIds: [],
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
export async function buildChallengeScreen(guildId, selectedChallengeId = null, searchTerm = '') {
  const playerData = await loadPlayerData();
  const challenges = playerData[guildId]?.challenges || {};
  let entries = Object.entries(challenges);

  // Look up season names for descriptions
  const configs = playerData[guildId]?.applicationConfigs || {};
  const seasonNames = {};
  for (const config of Object.values(configs)) {
    if (config.seasonId && config.seasonName) seasonNames[config.seasonId] = config.seasonName;
  }

  // Filter by search term
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    entries = entries.filter(([, ch]) => {
      const matchTitle = (ch.title || '').toLowerCase().includes(term);
      const matchDesc = (ch.description || '').toLowerCase().includes(term);
      const matchSeason = ch.seasonId && seasonNames[ch.seasonId]?.toLowerCase().includes(term);
      return matchTitle || matchDesc || matchSeason;
    });
  }

  // Sort by title
  entries.sort(([, a], [, b]) => (a.title || '').localeCompare(b.title || ''));

  // Build select options
  const options = [];

  // Search + back options
  if (searchTerm) {
    options.push({ label: '🔙 Back to all', value: 'challenge_back_to_all', description: 'Return to full list' });
  } else {
    options.push({ label: 'Create New Challenge', value: 'challenge_create_new', emoji: { name: '➕' }, description: 'Create a new challenge from scratch' });
  }

  // Always show search when >10 challenges or when actively searching
  if (Object.keys(challenges).length > 10 || searchTerm) {
    options.push({
      label: '🔍 Search Challenges', value: 'challenge_search',
      description: searchTerm ? `Searching: "${searchTerm}"` : 'Search by title, description, or season',
      emoji: { name: '🔍' }
    });
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

    // Show linked actions count
    const linkedActions = ch.actionIds || [];
    if (linkedActions.length > 0) {
      components.push({ type: 10, content: `-# ⚡ ${linkedActions.length} action${linkedActions.length === 1 ? '' : 's'} linked` });
    }

    // Action buttons
    components.push(
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: `challenge_edit_${selectedChallengeId}`, label: 'Edit', style: 2, emoji: { name: '✏️' } },
        { type: 2, custom_id: `challenge_round_${selectedChallengeId}`, label: 'Round', style: 2, emoji: { name: '🔥' } },
        { type: 2, custom_id: `challenge_actions_${selectedChallengeId}`, label: 'Actions', style: linkedActions.length > 0 ? 1 : 2, emoji: { name: '⚡' } },
        { type: 2, custom_id: `challenge_post_${selectedChallengeId}`, label: 'Post to Channel', style: 2, emoji: { name: '#️⃣' } },
      ]},
      { type: 1, components: [
        { type: 2, custom_id: `challenge_publish_${selectedChallengeId}`, label: 'Publish', style: 2, emoji: { name: '📤' } },
        { type: 2, custom_id: `challenge_delete_${selectedChallengeId}`, label: 'Delete', style: 4, emoji: { name: '🗑️' } },
      ]}
    );
  }

  // Navigation
  components.push(
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'prod_menu_back', label: '← Menu', style: 2 },
      { type: 2, custom_id: 'library_home', label: 'Challenge Library', style: 2, emoji: { name: '📚' } },
    ]}
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

  const modal = buildRichCardModal({
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

  // Add Prepping Host User Select as 5th component (same pattern as Season Planner edit)
  modal.data.components.push({
    type: 18,
    label: 'Prepping Host',
    description: 'Who is planning / preparing this challenge',
    component: {
      type: 5, // User Select
      custom_id: 'prepping_host',
      placeholder: 'Select host...',
      required: false,
      min_values: 0,
      max_values: 1,
      ...(existing?.creationHost ? { default_values: [{ id: existing.creationHost, type: 'user' }] } : {})
    }
  });

  return modal;
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

// ─────────────────────────────────────────────
// Challenge Library — Cross-Server Sharing
// ─────────────────────────────────────────────

import { atomicSave } from './atomicSave.js';
import fs from 'fs';

const LIBRARY_PATH = './challengeLibrary.json';

function loadLibrary() {
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function saveLibrary(data) {
  await atomicSave(LIBRARY_PATH, data, { minSize: 0 });
}

/**
 * Publish a challenge to the community library.
 */
export async function publishChallenge(guildId, challengeId, publishData, authorInfo) {
  const { default: crypto } = await import('crypto');
  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) throw new Error('Challenge not found');

  const library = loadLibrary();
  const templateId = `tpl_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;

  library[templateId] = {
    title: challenge.title,
    description: challenge.description,
    image: challenge.image || '',
    accentColor: challenge.accentColor || DEFAULT_ACCENT,
    author: {
      userId: authorInfo.userId,
      username: authorInfo.username,
      serverName: authorInfo.serverName,
      serverId: guildId,
    },
    tags: publishData.tags || [],
    playerCount: publishData.playerCount || '',
    estimatedRounds: publishData.estimatedRounds || '',
    publishedAt: Date.now(),
    importCount: 0,
    sourceVersion: 1,
    sourceChallengeId: challengeId,
    unpublished: false,
    ratings: { average: 0, count: 0, votes: {} },
  };

  // Store library template ID on the source challenge for republish/unpublish
  challenge.libraryTemplateId = templateId;
  await savePlayerData(playerData);
  await saveLibrary(library);

  console.log(`📚 Library: Published "${challenge.title}" as ${templateId}`);
  return templateId;
}

/**
 * Unpublish a challenge from the library.
 */
export async function unpublishChallenge(templateId) {
  const library = loadLibrary();
  if (!library[templateId]) return false;
  library[templateId].unpublished = true;
  await saveLibrary(library);
  console.log(`📚 Library: Unpublished ${templateId}`);
  return true;
}

/**
 * Import a library challenge into a server.
 */
export async function importChallenge(guildId, userId, templateId) {
  const { default: crypto } = await import('crypto');
  const library = loadLibrary();
  const template = library[templateId];
  if (!template || template.unpublished) return null;

  const playerData = await loadPlayerData();
  if (!playerData[guildId]) playerData[guildId] = {};
  if (!playerData[guildId].challenges) playerData[guildId].challenges = {};

  const challengeId = `challenge_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
  playerData[guildId].challenges[challengeId] = {
    title: template.title,
    description: template.description,
    image: template.image,
    accentColor: template.accentColor,
    creationHost: userId,
    runningHost: null,
    seasonId: null,
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    importedFrom: {
      templateId,
      author: template.author,
      importedAt: Date.now(),
    },
  };

  // Increment import count
  template.importCount = (template.importCount || 0) + 1;

  await savePlayerData(playerData);
  await saveLibrary(library);

  console.log(`📚 Library: Imported "${template.title}" to guild ${guildId} as ${challengeId}`);
  return challengeId;
}

/**
 * Rate a library challenge (1-5 stars).
 */
export async function rateChallenge(templateId, userId, rating) {
  const library = loadLibrary();
  const template = library[templateId];
  if (!template) return false;
  if (template.author?.userId === userId) return false; // Can't rate own

  if (!template.ratings) template.ratings = { average: 0, count: 0, votes: {} };
  template.ratings.votes[userId] = rating;

  // Recalculate average
  const votes = Object.values(template.ratings.votes);
  template.ratings.count = votes.length;
  template.ratings.average = votes.length > 0
    ? Math.round((votes.reduce((a, b) => a + b, 0) / votes.length) * 10) / 10
    : 0;

  await saveLibrary(library);
  return true;
}

/**
 * Build the library home screen (storefront).
 */
export function buildLibraryHome(userId) {
  const library = loadLibrary();
  const entries = Object.entries(library).filter(([, t]) => !t.unpublished);

  // Featured: highest rated from last 30 days, fallback to most imported
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = entries.filter(([, t]) => t.publishedAt > thirtyDaysAgo && t.ratings.count >= 3);
  recent.sort(([, a], [, b]) => b.ratings.average - a.ratings.average);
  const featured = recent[0] || entries.sort(([, a], [, b]) => b.importCount - a.importCount)[0];

  // Build select options
  const options = [
    { label: '🔍 Search Library', value: 'library_search', emoji: { name: '🔍' } },
    { label: '🏆 Most Imported', value: 'library_most_imported', emoji: { name: '🏆' } },
    { label: '🆕 Recently Published', value: 'library_recent', emoji: { name: '🆕' } },
  ];

  // Add top challenges by import count
  const sorted = [...entries].sort(([, a], [, b]) => b.importCount - a.importCount);
  for (const [id, tpl] of sorted) {
    if (options.length >= 25) break;
    const stars = tpl.ratings.count >= 3 ? ` · ⭐${tpl.ratings.average}` : '';
    options.push({
      label: (tpl.title || 'Untitled').substring(0, 80),
      value: id,
      description: `${tpl.importCount} imports${stars} · by ${tpl.author?.username || 'Unknown'}`.substring(0, 100),
      emoji: { name: '🏃' },
    });
  }

  if (options.length === 3) {
    options.push({ label: 'No challenges published yet', value: 'none', description: 'Be the first to publish!' });
  }

  const components = [
    { type: 10, content: '# 📚 Challenge Library\n-# Discover and share challenges with the community' },
    { type: 14 },
  ];

  // Featured challenge
  if (featured) {
    const [featId, feat] = featured;
    const stars = feat.ratings.count >= 3 ? `⭐ ${feat.ratings.average}/5` : '';
    const desc = (feat.description || '').substring(0, 150);
    components.push({
      type: 9, // Section
      components: [{ type: 10, content: `### 🌟 Featured\n**${feat.title}**\n${desc}${desc.length >= 150 ? '...' : ''}\n-# ${feat.importCount} imports ${stars} · by ${feat.author?.username || 'Unknown'} (${feat.author?.serverName || 'Unknown'})` }],
      ...(feat.image ? { accessory: { type: 11, media: { url: feat.image } } } : {})
    });
    components.push({ type: 14 });
  }

  components.push(
    { type: 1, components: [{
      type: 3,
      custom_id: 'library_select',
      placeholder: 'Browse challenges...',
      options
    }]},
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: 'challenge_screen', label: '← Challenges', style: 2 },
    ]}
  );

  const container = { type: 17, accent_color: 0x9b59b6, components };
  countComponents([container], { verbosity: "summary", label: "Challenge Library" });
  return { components: [container] };
}

/**
 * Build library challenge detail view with rating buttons.
 */
export function buildLibraryDetail(templateId, userId) {
  const library = loadLibrary();
  const tpl = library[templateId];
  if (!tpl || tpl.unpublished) return buildLibraryHome(userId);

  const stars = tpl.ratings.count >= 3
    ? `⭐ ${tpl.ratings.average}/5.0 (${tpl.ratings.count} votes)`
    : tpl.ratings.count > 0
      ? `⭐ ${tpl.ratings.count} vote(s) — needs 3+ for average`
      : 'No ratings yet';
  const userVote = tpl.ratings.votes?.[userId];
  const userVoteText = userVote ? `-# Your vote: ${'⭐'.repeat(userVote)} (${userVote}/5)` : '';
  const isAuthor = tpl.author?.userId === userId;
  const tags = tpl.tags?.length ? tpl.tags.join(', ') : '';
  const meta = [
    `${tpl.importCount} imports`,
    tags,
    tpl.playerCount ? `${tpl.playerCount} players` : '',
    `by ${tpl.author?.username || 'Unknown'} (${tpl.author?.serverName || 'Unknown'})`,
  ].filter(Boolean).join(' · ');

  const components = [];
  const titleText = (tpl.title || 'Untitled').startsWith('#') ? tpl.title : `# ${tpl.title}`;
  components.push({ type: 10, content: `${titleText}\n-# ${meta}` });

  if (tpl.description) {
    components.push({ type: 10, content: tpl.description });
  }

  if (tpl.image) {
    try {
      new URL(tpl.image);
      components.push({ type: 12, items: [{ media: { url: tpl.image }, description: tpl.title || 'Challenge' }] });
    } catch { /* skip */ }
  }

  // Rating section
  components.push(
    { type: 14 },
    { type: 10, content: `### ⭐ Rating\n${stars}\n${userVoteText}` }
  );

  // Star rating buttons (1-5)
  if (!isAuthor) {
    components.push({
      type: 1, components: [1, 2, 3, 4, 5].map(n => ({
        type: 2,
        custom_id: `library_rate_${n}_${templateId}`,
        label: `${n}`,
        style: userVote === n ? 1 : 2, // Primary if current vote
        emoji: { name: '⭐' },
      }))
    });
  }

  // Action buttons — back FIRST per LEAN standard
  const actionButtons = [
    { type: 2, custom_id: 'library_home', label: '← Library', style: 2 },
    { type: 2, custom_id: `library_import_${templateId}`, label: 'Import', style: 3, emoji: { name: '📥' } },
  ];
  if (isAuthor) {
    actionButtons.push({ type: 2, custom_id: `library_unpublish_${templateId}`, label: 'Unpublish', style: 4, emoji: { name: '🗑️' } });
  }

  components.push({ type: 1, components: actionButtons });

  const container = { type: 17, accent_color: tpl.accentColor || DEFAULT_ACCENT, components };
  countComponents([container], { verbosity: "summary", label: "Library Detail" });
  return { components: [container] };
}

/**
 * Build the publish modal.
 */
export function buildPublishModal(challengeId) {
  return {
    type: 9,
    data: {
      custom_id: `library_publish_modal:${challengeId}`,
      title: 'Publish to Challenge Library',
      components: [
        {
          type: 18,
          label: 'Tags',
          description: 'Select categories that describe this challenge',
          component: {
            type: 22, // Checkbox Group
            custom_id: 'tags',
            required: false,
            min_values: 0,
            max_values: 8,
            options: [
              { label: 'Economic / Trading', value: 'economic' },
              { label: 'Physical / Endurance', value: 'physical' },
              { label: 'Social / Persuasion', value: 'social' },
              { label: 'Creative / Building', value: 'creative' },
              { label: 'Trivia / Knowledge', value: 'trivia' },
              { label: 'Puzzle / Logic', value: 'puzzle' },
              { label: 'Team-based', value: 'team' },
              { label: 'Individual', value: 'individual' },
            ]
          }
        },
        {
          type: 18,
          label: 'Player Count Range',
          description: 'Recommended number of players (e.g., 8-24)',
          component: {
            type: 4, custom_id: 'player_count', style: 1,
            placeholder: '8-24',
            required: false, max_length: 10,
          }
        },
        {
          type: 18,
          label: 'Estimated Rounds',
          description: 'How many rounds does this challenge span?',
          component: {
            type: 4, custom_id: 'estimated_rounds', style: 1,
            placeholder: '1',
            required: false, max_length: 3,
          }
        },
      ]
    }
  };
}

/**
 * Build the action selector screen for linking actions to a challenge.
 */
export async function buildActionSelector(guildId, challengeId, searchTerm = '') {
  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return { components: [{ type: 17, components: [{ type: 10, content: '❌ Challenge not found' }] }] };

  const { loadSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  const actions = safariData[guildId]?.buttons || {};
  const linkedIds = challenge.actionIds || [];

  // Build options from existing actions — same visual pattern as global action selector
  const allEntries = Object.entries(actions)
    .filter(([id, a]) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const name = (a.name || a.label || id).toLowerCase();
      return name.includes(term);
    })
    .map(([id, a]) => ({ id, action: a, isLinked: linkedIds.includes(id) }))
    .sort((a, b) => {
      // Linked first, then by last modified (newest first)
      if (a.isLinked !== b.isLinked) return a.isLinked ? -1 : 1;
      const aTime = a.action.metadata?.lastModified || 0;
      const bTime = b.action.metadata?.lastModified || 0;
      return bTime - aTime;
    });

  const options = [];

  // Search option
  if (Object.keys(actions).length > 10 || searchTerm) {
    options.push({
      label: '🔍 Search Actions',
      value: 'search_actions',
      description: searchTerm ? `Searching: "${searchTerm}"` : 'Search through all actions',
      emoji: { name: '🔍' }
    });
  }
  if (searchTerm) {
    options.push({
      label: '🔙 Back to all',
      value: 'back_to_all',
      description: 'Return to full action list'
    });
  }

  for (const { id, action, isLinked } of allEntries) {
    if (options.length >= 25) break;
    const name = (action.name || action.label || id).substring(0, 80);
    const triggerType = action.trigger?.type || 'button';
    const triggerLabels = { button: '🖱️ Button', button_modal: '🔐 Secret Code', button_input: '⌨️ User Input', modal: '🕹️ Command', schedule: '⏰ Scheduled' };
    const triggerLabel = triggerLabels[triggerType] || triggerType;

    // Use action's configured emoji, checkmark for linked
    const actionEmoji = action.emoji || action.trigger?.button?.emoji || '⚡';

    options.push({
      label: `${isLinked ? '✅ ' : ''}${name}`.substring(0, 100),
      value: id,
      description: `${triggerLabel}${isLinked ? ' — select to unlink' : ' — select to link'}`.substring(0, 100),
      emoji: { name: typeof actionEmoji === 'string' ? actionEmoji : '⚡' },
    });
  }

  const chalTitle = (challenge.title || 'Untitled').substring(0, 50);

  if (options.length === 0) {
    return { components: [{ type: 17, accent_color: challenge.accentColor || DEFAULT_ACCENT, components: [
      { type: 10, content: `## ⚡ Link Actions\n-# **${chalTitle}**\n\nNo Custom Actions found. Create actions first via **⚡ Actions** in the Production Menu.` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: `challenge_select_nav_${challengeId}`, label: '← Back', style: 2 }
      ]}
    ]}]};
  }

  const container = {
    type: 17, accent_color: challenge.accentColor || DEFAULT_ACCENT,
    components: [
      { type: 10, content: `## ⚡ Link Actions\n-# Select actions players can use during **${chalTitle}**\n-# Selecting a linked action will unlink it` },
      { type: 14 },
      { type: 1, components: [{
        type: 3,
        custom_id: `challenge_action_toggle_${challengeId}`,
        placeholder: linkedIds.length > 0 ? `${linkedIds.length} action${linkedIds.length === 1 ? '' : 's'} linked` : 'Select an action to link...',
        options: options.slice(0, 25),
      }]},
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: `challenge_select_nav_${challengeId}`, label: '← Back', style: 2 }
      ]}
    ]
  };

  countComponents([container], { verbosity: "summary", label: "Action Selector" });
  return { components: [container] };
}

/**
 * Toggle-link an action to/from a challenge.
 */
export async function toggleChallengeAction(guildId, challengeId, actionId) {
  const playerData = await loadPlayerData();
  const challenge = playerData[guildId]?.challenges?.[challengeId];
  if (!challenge) return { linked: false, error: 'Challenge not found' };

  if (!challenge.actionIds) challenge.actionIds = [];

  const idx = challenge.actionIds.indexOf(actionId);
  if (idx >= 0) {
    challenge.actionIds.splice(idx, 1);
    await savePlayerData(playerData);
    console.log(`⚡ Challenge: Unlinked action ${actionId} from ${challengeId}`);
    return { linked: false, actionId };
  } else {
    challenge.actionIds.push(actionId);
    await savePlayerData(playerData);
    console.log(`⚡ Challenge: Linked action ${actionId} to ${challengeId}`);
    return { linked: true, actionId };
  }
}

/**
 * Build the richCard container for posting a challenge to a channel.
 * Includes linked action buttons if any.
 */
export function buildChallengePost(challenge, guildId = null, safariData = null) {
  const extraComponents = [];

  // Add linked action buttons
  if (guildId && challenge.actionIds?.length > 0 && safariData) {
    const actionButtons = [];
    for (const actionId of challenge.actionIds) {
      const action = safariData[guildId]?.buttons?.[actionId];
      if (!action) continue;

      const triggerType = action.trigger?.type || 'button';
      const isModalTrigger = triggerType === 'button_modal' || triggerType === 'button_input';
      const buttonCustomId = isModalTrigger
        ? `modal_launcher_${guildId}_${actionId}_${Date.now()}`
        : `challenge_${guildId}_${actionId}_${Date.now()}`;

      const label = (action.name || action.trigger?.button?.label || action.label || 'Action').substring(0, 80);
      const emoji = action.emoji || action.trigger?.button?.emoji;
      const style = action.trigger?.button?.style || 'Primary';
      const styleMap = { Primary: 1, Secondary: 2, Success: 3, Danger: 4 };

      const button = {
        type: 2,
        custom_id: buttonCustomId,
        label,
        style: styleMap[style] || 1,
      };
      if (emoji) button.emoji = { name: emoji };
      actionButtons.push(button);

      if (actionButtons.length >= 5) break; // Max 5 per row
    }

    if (actionButtons.length > 0) {
      extraComponents.push({ type: 14 });
      extraComponents.push({ type: 1, components: actionButtons });
    }
  }

  // Add credit line
  if (challenge.creationHost) {
    extraComponents.push({ type: 14 });
    extraComponents.push({ type: 10, content: `-# Challenge by <@${challenge.creationHost}>` });
  }

  return buildRichCardContainer({
    title: challenge.title,
    content: challenge.description,
    color: challenge.accentColor,
    image: challenge.image,
    extraComponents,
  });
}
