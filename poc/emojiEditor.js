/**
 * Emoji Editor PoC — Self-contained emoji management for CastBot
 *
 * Features:
 * 1. Gallery: Browse guild emojis in paginated string select
 * 2. Detail: View emoji info, usage, copy code, delete
 * 3. Upload: Create guild emoji via File Upload modal
 * 4. Dashboard: Slot usage, CastBot entity cross-reference
 * 5. Reaction Pick: React to any message to capture an emoji
 * 6. Steal: Import emoji from another server via CDN download
 */

import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { PermissionFlagsBits } from 'discord.js';

const EMOJIS_PER_PAGE = 23; // Reserve 2 slots for pagination nav

// ═══════════════════════════════════════════════════════════
// Slot Limits (by boost tier)
// ═══════════════════════════════════════════════════════════

function getEmojiLimits(guild) {
  let limit = 50;
  if (guild.premiumTier === 1) limit = 100;
  else if (guild.premiumTier === 2) limit = 150;
  else if (guild.premiumTier === 3) limit = 250;
  return limit;
}

function getSlotInfo(guild) {
  const emojis = guild.emojis.cache;
  const staticCount = emojis.filter(e => !e.animated).size;
  const animatedCount = emojis.filter(e => e.animated).size;
  const limit = getEmojiLimits(guild);
  return { staticCount, animatedCount, limit };
}

// ═══════════════════════════════════════════════════════════
// Main Menu
// ═══════════════════════════════════════════════════════════

export async function buildEmojiEditorMenu(guild, guildId, page = 0) {
  await guild.emojis.fetch(); // Ensure cache is fresh
  const { staticCount, animatedCount, limit } = getSlotInfo(guild);
  const pickerSelect = buildEmojiPickerPage(guild, page);
  const canManage = guild.members.me?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions) ?? false;

  const components = [
    { type: 10, content: `## 🎨 Emoji Editor\n📊 **${staticCount}**/${limit} static · **${animatedCount}**/${limit} animated` },
    { type: 14 },
  ];

  // Picker select (or empty state)
  if (pickerSelect) {
    components.push({ type: 1, components: [pickerSelect] });
  } else {
    components.push({ type: 10, content: `-# No custom emojis in this server yet.` });
  }

  components.push({ type: 14 });

  // Action buttons row
  const actionButtons = [];
  if (canManage) {
    actionButtons.push({ type: 2, custom_id: 'emoji_upload', label: 'Upload', style: 1, emoji: { name: '📤' } });
  }
  actionButtons.push({ type: 2, custom_id: 'emoji_react_pick', label: 'React Pick', style: 2, emoji: { name: '👆' } });
  actionButtons.push({ type: 2, custom_id: 'emoji_dashboard', label: 'Dashboard', style: 2, emoji: { name: '📊' } });

  components.push({ type: 1, components: actionButtons });
  components.push({ type: 14 });
  components.push({ type: 1, components: [{ type: 2, custom_id: 'reeces_stuff', label: '← Back', style: 2 }] });

  return {
    components: [{
      type: 17,
      accent_color: 0x9B59B6,
      components
    }],
    flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL
  };
}

// ═══════════════════════════════════════════════════════════
// Emoji Picker (paginated string select)
// ═══════════════════════════════════════════════════════════

function buildEmojiPickerPage(guild, page = 0) {
  const allEmojis = [...guild.emojis.cache.values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  if (allEmojis.length === 0) return null;

  const totalPages = Math.ceil(allEmojis.length / EMOJIS_PER_PAGE);
  const validPage = Math.max(0, Math.min(page, totalPages - 1));
  const start = validPage * EMOJIS_PER_PAGE;
  const pageEmojis = allEmojis.slice(start, start + EMOJIS_PER_PAGE);

  const options = pageEmojis.map(e => ({
    label: e.name.substring(0, 100),
    value: `select_${e.id}`,
    description: e.animated ? 'Animated' : 'Static',
    emoji: { name: e.name, id: e.id, animated: e.animated }
  }));

  // Add pagination nav
  if (totalPages > 1) {
    if (validPage > 0) {
      options.push({
        label: `◀ Previous (${validPage * EMOJIS_PER_PAGE - EMOJIS_PER_PAGE + 1}-${validPage * EMOJIS_PER_PAGE})`,
        value: `page_${validPage - 1}`,
        emoji: { name: '◀️' }
      });
    }
    if (validPage < totalPages - 1) {
      options.push({
        label: `▶ Next (${(validPage + 1) * EMOJIS_PER_PAGE + 1}-${Math.min((validPage + 2) * EMOJIS_PER_PAGE, allEmojis.length)})`,
        value: `page_${validPage + 1}`,
        emoji: { name: '▶️' }
      });
    }
  }

  return {
    type: 3,
    custom_id: `emoji_picker_${validPage}`,
    placeholder: `Browse server emojis (page ${validPage + 1}/${totalPages})...`,
    options
  };
}

// ═══════════════════════════════════════════════════════════
// Emoji Detail View
// ═══════════════════════════════════════════════════════════

export async function buildEmojiDetailView(guild, emojiId, guildId) {
  const emoji = guild.emojis.cache.get(emojiId);
  if (!emoji) {
    return {
      components: [{ type: 17, accent_color: 0xED4245, components: [
        { type: 10, content: '❌ Emoji not found — it may have been deleted.' },
        { type: 1, components: [{ type: 2, custom_id: 'emoji_editor', label: '← Back', style: 2 }] }
      ]}],
      flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL
    };
  }

  const emojiCode = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
  const cdnUrl = emoji.url;

  // Find CastBot usage
  const usage = await findEmojiUsage(guildId, emojiCode, emoji.name, emoji.id);

  const components = [
    { type: 10, content: `## ${emojiCode} ${emoji.name}` },
    { type: 10, content: `${emoji.animated ? 'Animated' : 'Static'} custom emoji` },
    { type: 14 },
    { type: 10, content: `📋 **Code:** \`${emojiCode}\`\n🔗 **CDN:** [${emoji.name}](${cdnUrl})` },
    { type: 14 },
  ];

  if (usage.length > 0) {
    components.push({ type: 10, content: `### Used by CastBot:\n${usage.join('\n')}` });
  } else {
    components.push({ type: 10, content: `-# Not currently used by any CastBot entity.` });
  }

  components.push({ type: 14 });

  const canManage = guild.members.me?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions) ?? false;
  const actionButtons = [
    { type: 2, custom_id: `emoji_copy_${emojiId}`, label: 'Copy Code', style: 2, emoji: { name: '📋' } },
  ];
  if (canManage) {
    actionButtons.push({ type: 2, custom_id: `emoji_delete_${emojiId}`, label: 'Delete', style: 4, emoji: { name: '🗑️' } });
  }
  actionButtons.push({ type: 2, custom_id: 'emoji_editor', label: '← Back', style: 2 });

  components.push({ type: 1, components: actionButtons });

  return {
    components: [{ type: 17, accent_color: 0x9B59B6, components }],
    flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL
  };
}

// ═══════════════════════════════════════════════════════════
// Upload Modal
// ═══════════════════════════════════════════════════════════

export function buildEmojiUploadModal(guildId) {
  return {
    custom_id: `emoji_upload_modal_${guildId}`,
    title: 'Upload Custom Emoji',
    components: [
      {
        type: 18, // Label
        label: 'Emoji Name',
        description: '2-32 characters. Letters, numbers, underscores only.',
        component: {
          type: 4, // Text Input
          custom_id: 'emoji_name',
          style: 1,
          required: true,
          min_length: 2,
          max_length: 32,
          placeholder: 'e.g. deku_shield'
        }
      },
      {
        type: 18, // Label
        label: 'Image File',
        description: 'PNG or GIF, max 256KB. 128x128 recommended. GIF = animated emoji.',
        component: {
          type: 19, // File Upload
          custom_id: 'emoji_file',
          required: true,
          min_values: 1,
          max_values: 1
        }
      }
    ]
  };
}

/**
 * Process emoji upload from modal submission
 */
export async function handleEmojiUpload(guild, guildId, name, attachmentUrl, filename) {
  // Validate name format
  if (!/^[a-zA-Z0-9_]{2,32}$/.test(name)) {
    return { success: false, message: '❌ Invalid name. Use 2-32 characters: letters, numbers, underscores only.' };
  }

  // Check slot limits
  const { staticCount, animatedCount, limit } = getSlotInfo(guild);
  const isAnimated = filename?.toLowerCase().endsWith('.gif');

  if (isAnimated && animatedCount >= limit) {
    return { success: false, message: `❌ Animated emoji slots full (${animatedCount}/${limit}). Delete some or boost the server.` };
  }
  if (!isAnimated && staticCount >= limit) {
    return { success: false, message: `❌ Static emoji slots full (${staticCount}/${limit}). Delete some or boost the server.` };
  }

  // Download the attachment
  try {
    const response = await fetch(attachmentUrl);
    if (!response.ok) {
      return { success: false, message: `❌ Failed to download image: HTTP ${response.status}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Check size (256KB limit for Discord emojis)
    if (buffer.length > 256 * 1024) {
      return { success: false, message: `❌ Image too large (${(buffer.length / 1024).toFixed(0)}KB). Discord limit is 256KB.` };
    }

    // Create the emoji
    const emoji = await guild.emojis.create({
      attachment: buffer,
      name: name,
      reason: 'Created via CastBot Emoji Editor'
    });

    const emojiCode = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
    return {
      success: true,
      message: `✅ Created emoji ${emojiCode} **${emoji.name}**\n\n📋 Emoji Code (copy to use in CastBot items, buttons, etc):\n${emojiCode}`,
      emoji
    };
  } catch (error) {
    if (error.code === 30008) {
      return { success: false, message: '❌ Server has reached the maximum number of emojis.' };
    }
    console.error('Emoji upload error:', error);
    return { success: false, message: `❌ Upload failed: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════

export async function buildEmojiDashboard(guild, guildId) {
  await guild.emojis.fetch();
  const { staticCount, animatedCount, limit } = getSlotInfo(guild);
  const { loadSafariContent } = await import('../safariManager.js');
  const safariData = await loadSafariContent();

  const allEmojis = [...guild.emojis.cache.values()];
  const inUse = [];
  const notUsed = [];

  for (const emoji of allEmojis) {
    const emojiCode = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
    const usage = await findEmojiUsage(guildId, emojiCode, emoji.name, emoji.id);
    if (usage.length > 0) {
      inUse.push({ emoji, usage });
    } else {
      notUsed.push(emoji);
    }
  }

  // Find broken references (emojis referenced in data but not in guild)
  const broken = findBrokenEmojiReferences(safariData[guildId], guild);

  const components = [
    { type: 10, content: `## 📊 Emoji Dashboard\n**${staticCount}**/${limit} static · **${animatedCount}**/${limit} animated` },
    { type: 14 },
  ];

  // In use
  if (inUse.length > 0) {
    const lines = inUse.slice(0, 10).map(({ emoji, usage }) => {
      const code = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
      return `${code} **${emoji.name}** — ${usage.join(', ')}`;
    });
    if (inUse.length > 10) lines.push(`-# ...and ${inUse.length - 10} more`);
    components.push({ type: 10, content: `### In Use by CastBot (${inUse.length})\n${lines.join('\n')}` });
  }

  // Not used
  if (notUsed.length > 0) {
    const names = notUsed.slice(0, 15).map(e => {
      const code = e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`;
      return `${code} ${e.name}`;
    });
    if (notUsed.length > 15) names.push(`...+${notUsed.length - 15} more`);
    components.push({ type: 10, content: `### Not Used by CastBot (${notUsed.length})\n${names.join(' · ')}` });
  }

  // Broken references
  if (broken.length > 0) {
    components.push({ type: 10, content: `### ⚠️ Broken References (${broken.length})\n${broken.slice(0, 5).join('\n')}` });
  }

  components.push({ type: 14 });
  components.push({ type: 1, components: [
    { type: 2, custom_id: 'emoji_editor', label: '← Back', style: 2 }
  ]});

  return {
    components: [{ type: 17, accent_color: 0x9B59B6, components }],
    flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL
  };
}

// ═══════════════════════════════════════════════════════════
// Reaction Pick
// ═══════════════════════════════════════════════════════════

/**
 * Set up a pending emoji pick for a user.
 * The messageReactionAdd handler in app.js checks this map.
 */
export function setupReactionPick(userId, guildId, interactionToken) {
  if (!global.pendingEmojiPicks) global.pendingEmojiPicks = new Map();

  const pickId = `${guildId}_${userId}`;

  // Clear any existing pick for this user
  if (global.pendingEmojiPicks.has(pickId)) {
    clearTimeout(global.pendingEmojiPicks.get(pickId).timeout);
    global.pendingEmojiPicks.delete(pickId);
  }

  const entry = {
    userId,
    guildId,
    interactionToken,
    timestamp: Date.now(),
    timeout: setTimeout(() => {
      global.pendingEmojiPicks.delete(pickId);
      console.log(`⏱️ Emoji pick timed out for user ${userId} in guild ${guildId}`);
    }, 60000)
  };

  global.pendingEmojiPicks.set(pickId, entry);
  return pickId;
}

/**
 * Process a captured emoji reaction for the emoji picker.
 * Called from the messageReactionAdd handler in app.js.
 */
export async function processReactionPick(reaction, user, pick) {
  const emoji = reaction.emoji;
  const isCustom = !!emoji.id;
  const isFromThisGuild = isCustom && reaction.message.guild?.emojis.cache.has(emoji.id);

  const emojiDisplay = isCustom
    ? (emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`)
    : emoji.name;

  const components = [
    { type: 10, content: `## 👆 Emoji Captured!\n${emojiDisplay} **${emoji.name}**` },
    { type: 14 },
  ];

  if (isCustom) {
    const emojiCode = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
    components.push({ type: 10, content: `📋 **Code:** \`${emojiCode}\`\n🔗 **CDN:** [View](https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=128)` });

    if (!isFromThisGuild) {
      components.push({ type: 14 });
      components.push({ type: 10, content: `⚠️ This emoji is from **another server**. Import it to use in CastBot.` });
      components.push({ type: 1, components: [
        { type: 2, custom_id: `emoji_steal_${emoji.id}_${emoji.name}_${emoji.animated ? '1' : '0'}`, label: 'Import to This Server', style: 1, emoji: { name: '📥' } }
      ]});
    }
  } else {
    components.push({ type: 10, content: `This is a Unicode emoji — works everywhere, no import needed.\n📋 **Character:** \`${emoji.name}\`` });
  }

  components.push({ type: 14 });
  components.push({ type: 1, components: [
    { type: 2, custom_id: 'emoji_react_pick', label: 'Pick Another', style: 2, emoji: { name: '🔄' } },
    { type: 2, custom_id: 'emoji_editor', label: '← Back', style: 2 }
  ]});

  return {
    flags: (1 << 15),
    components: [{ type: 17, accent_color: 0x57F287, components }]
  };
}

// ═══════════════════════════════════════════════════════════
// Steal / Import Emoji
// ═══════════════════════════════════════════════════════════

export async function handleEmojiSteal(guild, emojiId, emojiName, animated) {
  const { staticCount, animatedCount, limit } = getSlotInfo(guild);

  if (animated && animatedCount >= limit) {
    return { success: false, message: `❌ Animated emoji slots full (${animatedCount}/${limit}).` };
  }
  if (!animated && staticCount >= limit) {
    return { success: false, message: `❌ Static emoji slots full (${staticCount}/${limit}).` };
  }

  try {
    const ext = animated ? 'gif' : 'png';
    const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128`;
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, message: `❌ Failed to download emoji: HTTP ${response.status}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const emoji = await guild.emojis.create({
      attachment: buffer,
      name: emojiName,
      reason: 'Imported via CastBot Emoji Editor'
    });

    const emojiCode = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
    return {
      success: true,
      message: `✅ Imported! ${emojiCode} **${emoji.name}** is now available in this server.\n\n📋 Code: \`${emojiCode}\``
    };
  } catch (error) {
    if (error.code === 30008) {
      return { success: false, message: '❌ Server has reached the maximum number of emojis.' };
    }
    console.error('Emoji steal error:', error);
    return { success: false, message: `❌ Import failed: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/**
 * Find which CastBot entities reference a given emoji.
 */
async function findEmojiUsage(guildId, emojiCode, emojiName, emojiId) {
  const { loadSafariContent } = await import('../safariManager.js');
  const safariData = await loadSafariContent();
  const guildData = safariData[guildId] || {};
  const usage = [];
  const idStr = String(emojiId);

  // Check items
  for (const [id, item] of Object.entries(guildData.items || {})) {
    if (matchesEmoji(item.emoji, emojiCode, emojiName, idStr)) {
      usage.push(`📦 Item: ${item.name || id}`);
    }
  }

  // Check stores
  for (const [id, store] of Object.entries(guildData.stores || {})) {
    if (matchesEmoji(store.emoji, emojiCode, emojiName, idStr)) {
      usage.push(`🏪 Store: ${store.name || id}`);
    }
  }

  // Check enemies
  for (const [id, enemy] of Object.entries(guildData.enemies || {})) {
    if (matchesEmoji(enemy.emoji, emojiCode, emojiName, idStr)) {
      usage.push(`👹 Enemy: ${enemy.name || id}`);
    }
  }

  // Check actions (buttons)
  for (const [id, action] of Object.entries(guildData.buttons || {})) {
    if (matchesEmoji(action.emoji, emojiCode, emojiName, idStr) ||
        matchesEmoji(action.trigger?.button?.emoji, emojiCode, emojiName, idStr)) {
      usage.push(`⚡ Action: ${action.name || action.label || id}`);
    }
  }

  return usage;
}

function matchesEmoji(stored, emojiCode, emojiName, emojiId) {
  if (!stored) return false;
  const s = String(stored);
  return s === emojiCode || s.includes(emojiId) || s === emojiName;
}

/**
 * Find broken emoji references in CastBot data (emojis that don't exist in guild).
 */
function findBrokenEmojiReferences(guildData, guild) {
  if (!guildData) return [];
  const broken = [];
  const customEmojiRegex = /<a?:(\w+):(\d+)>/g;

  const checkField = (emoji, entityType, entityName) => {
    if (!emoji || typeof emoji !== 'string') return;
    let match;
    customEmojiRegex.lastIndex = 0;
    while ((match = customEmojiRegex.exec(emoji)) !== null) {
      const id = match[2];
      if (!guild.emojis.cache.has(id)) {
        broken.push(`❌ \`${match[0]}\` — ${entityType}: ${entityName}`);
      }
    }
  };

  for (const [id, item] of Object.entries(guildData.items || {})) {
    checkField(item.emoji, '📦 Item', item.name || id);
  }
  for (const [id, store] of Object.entries(guildData.stores || {})) {
    checkField(store.emoji, '🏪 Store', store.name || id);
  }
  for (const [id, enemy] of Object.entries(guildData.enemies || {})) {
    checkField(enemy.emoji, '👹 Enemy', enemy.name || id);
  }
  for (const [id, action] of Object.entries(guildData.buttons || {})) {
    checkField(action.emoji, '⚡ Action', action.name || action.label || id);
  }

  return broken;
}
