import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import {
  InteractionResponseType,
  InteractionResponseFlags
} from 'discord-interactions';
import { createPlayerCard, extractCastlistData, createCastlistRows, limitAndSortCastlists } from './castlistV2.js';
import { getPlayer, updatePlayer, getGuildPronouns, getGuildTimezones, loadPlayerData } from './storage.js';
import { hasStoresInGuild, getEligiblePlayersFixed, getCustomTerms, getPlayerAttributes, getAttributeDefinitions, loadSafariContent, MAX_GLOBAL_STORES, getCoordinateFromChannelId } from './safariManager.js';
import { countComponents } from './utils.js';
import { parseAndValidateEmoji, parseTextEmoji, resolveEmoji } from './utils/emojiUtils.js';
import { createBackButton } from './src/ui/backButtonFactory.js';
import { getTimeUntilRegeneration } from './pointsManager.js';
import { getChallengeActions, normalizeLinks, extractActionIds } from './challengeActionCreate.js';

/**
 * Player management modes
 */
export const PlayerManagementMode = {
  ADMIN: 'admin',
  PLAYER: 'player'
};

/**
 * Button types for player management
 */
export const PlayerButtonType = {
  PRONOUNS: 'pronouns',
  TIMEZONE: 'timezone',
  AGE: 'age',
  VANITY: 'vanity'
};

/**
 * Creates a player display section using castlistV2 components
 * @param {Object} player - Discord member object
 * @param {Object} playerData - Guild player data
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Player display section component
 */
export async function createPlayerDisplaySection(player, playerData, guildId) {
  if (!player) {
    return null;
  }

  // Guard against accessing roles before guild cache is populated (e.g. during bot startup)
  let roleCache;
  try {
    roleCache = player.roles?.cache;
  } catch {
    console.warn(`⚠️ createPlayerDisplaySection: Guild role cache not available for player ${player.id} — bot may still be starting`);
    return null;
  }
  if (!roleCache) return null;

  // Prepare parameters for castlistV2 createPlayerCard
  const pronounRoleIds = playerData[guildId]?.pronounRoleIDs || [];
  const timezones = playerData[guildId]?.timezones || {};

  // Get player pronouns
  const memberPronouns = roleCache
    .filter(role => pronounRoleIds.includes(role.id))
    .map(role => role.name)
    .join(', ') || '';

  // Get player timezone and calculate current time
  let memberTimezone = '';
  let formattedTime = '';
  const timezoneRole = roleCache.find(role => timezones[role.id]);
  
  if (timezoneRole) {
    memberTimezone = timezoneRole.name;

    try {
      const tzData = timezones[timezoneRole.id];
      let offset;

      // Feature toggle: Check if this timezone uses new DST system
      if (tzData.timezoneId) {
        // New system: read from dstState.json via getDSTOffset
        const { getDSTOffset, loadDSTState } = await import('./storage.js');

        // Ensure DST state is loaded
        await loadDSTState();
        offset = getDSTOffset(tzData.timezoneId);

        console.log(`🌍 DST lookup for ${tzData.timezoneId}: offset=${offset}, stored=${tzData.offset}`);

        // Fallback to stored offset if DST state not found
        if (offset === null) {
          console.log(`⚠️ No DST state for ${tzData.timezoneId}, using stored offset`);
          offset = tzData.offset;
        }
      } else {
        // Legacy system: read offset directly from playerData
        offset = tzData.offset;
      }

      const now = new Date();
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
      const targetTime = new Date(utcTime + (offset * 3600000));
      formattedTime = targetTime.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error calculating timezone:', error);
      formattedTime = '';
    }
  }
  
  // Get stored player data
  const storedPlayerData = playerData[guildId]?.players?.[player.id] || {};
  
  // Create player card using castlistV2 function
  const playerCard = createPlayerCard(
    player,
    storedPlayerData,
    memberPronouns,
    memberTimezone,
    formattedTime,
    false // Never show emoji in player management
  );
  
  // Fix avatar URL for webhook context
  const avatarHash = player.user.avatar;
  const userId = player.user.id;
  const avatarUrl = avatarHash 
    ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${userId % 5}.png`;
  
  return {
    ...playerCard,
    accessory: {
      ...playerCard.accessory,
      media: {
        url: avatarUrl
      }
    }
  };
}

/**
 * Creates an attribute display section showing player's attributes
 * Only shows if the guild has attributes configured
 * @param {string} guildId - Discord guild ID
 * @param {string} playerId - Player's Discord user ID
 * @param {string} [label] - Optional label override (defaults to "Your Stats", use player name for admin view)
 * @returns {Object|null} Text display component or null if no attributes
 */
export async function createAttributeDisplaySection(guildId, playerId, label = 'Your Stats') {
  try {
    // Clear safari cache before reading attributes to ensure fresh data
    // This prevents showing stale values after admin modifications
    const { clearSafariCache } = await import('./safariManager.js');
    clearSafariCache();

    // Check if guild has any attributes configured
    const definitions = await getAttributeDefinitions(guildId);
    const definitionEntries = Object.entries(definitions);

    if (definitionEntries.length === 0) {
      return null; // No attributes configured for this server
    }

    // Get player's attribute values
    const attributes = await getPlayerAttributes(guildId, playerId);
    const attributeEntries = Object.entries(attributes);

    if (attributeEntries.length === 0) {
      return null;
    }

    // Sort by display order
    attributeEntries.sort((a, b) => {
      const orderA = a[1].display?.order || 100;
      const orderB = b[1].display?.order || 100;
      return orderA - orderB;
    });

    // Phase 5: Import calculateAttributeModifiers for item bonus display
    const { calculateAttributeModifiers } = await import('./pointsManager.js');
    const entityId = `player_${playerId}`;

    // Build attribute lines
    const attrLines = [];
    for (const [attrId, attr] of attributeEntries) {
      const emoji = attr.emoji || '📊';
      const name = attr.name;
      const value = attr.value;

      // Phase 5: Get item modifiers for this attribute
      const itemModifiers = await calculateAttributeModifiers(guildId, entityId, attrId);
      const hasItemBonus = itemModifiers.add > 0 || itemModifiers.addMax > 0;

      if (attr.category === 'resource') {
        // Resource type - show current/max with optional bar
        const current = value.current ?? attr.defaultCurrent ?? 0;
        const max = value.max ?? attr.defaultMax ?? current;
        const percentage = max > 0 ? Math.floor((current / max) * 100) : 0;

        // Create simple bar
        const filledBlocks = Math.floor(percentage / 10);
        const emptyBlocks = 10 - filledBlocks;
        const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

        let line = `${emoji} **${name}**: ${bar} ${current}/${max}`;

        // Phase 5: Show item bonus for max capacity
        if (itemModifiers.addMax > 0) {
          line += ` *(+${itemModifiers.addMax} max from items)*`;
        }
        // Add regen time if not at max (only if no item bonus shown)
        else if (current < max && attr.regeneration?.type !== 'none') {
          try {
            const regenTime = await getTimeUntilRegeneration(guildId, entityId, attrId);
            if (regenTime && regenTime !== 'Full') {
              line += ` *(${regenTime})*`;
            }
          } catch (e) {
            // Ignore regen time errors
          }
        }

        attrLines.push(line);
      } else {
        // Stat type - show single value with item bonuses
        const baseValue = value.current ?? value ?? attr.defaultValue ?? 0;
        const totalValue = baseValue + itemModifiers.add;

        let line = `${emoji} **${name}**: ${totalValue}`;

        // Phase 5: Show item bonus breakdown
        if (itemModifiers.add > 0) {
          line += ` *(+${itemModifiers.add} from items)*`;
        }

        attrLines.push(line);
      }
    }

    if (attrLines.length === 0) {
      return null;
    }

    return {
      type: 10, // Text Display
      content: `### \`\`\`📊 ${label}\`\`\`\n${attrLines.join('\n')}`
    };
  } catch (error) {
    console.error('Error creating attribute display:', error);
    return null;
  }
}

/**
 * Creates management buttons based on mode and state
 * @param {string} targetUserId - Target user ID
 * @param {string} mode - PlayerManagementMode
 * @param {boolean} enabled - Whether buttons should be enabled
 * @param {string} activeButton - Which button is currently active
 * @param {boolean} showVanityRoles - Whether to show vanity roles button (admin only)
 * @returns {Object} ActionRow with buttons
 */
export function createManagementButtons(targetUserId, mode, enabled = true, activeButton = null, showVanityRoles = false) {
  const prefix = mode === PlayerManagementMode.ADMIN ? 'admin' : 'player';
  const suffix = mode === PlayerManagementMode.ADMIN && !enabled ? '_pending' : '';
  const userIdPart = mode === PlayerManagementMode.ADMIN && enabled ? `_${targetUserId}` : '';
  
  const components = [
    {
      type: 2, // Button
      style: activeButton === 'pronouns' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      label: 'Pronouns',
      custom_id: `${prefix}_set_pronouns${suffix}${userIdPart}`,
      emoji: { name: '💜' },
      disabled: !enabled
    },
    {
      type: 2, // Button
      style: activeButton === 'timezone' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      label: 'Timezone',
      custom_id: `${prefix}_set_timezone${suffix}${userIdPart}`,
      emoji: { name: '🌍' },
      disabled: !enabled
    },
    {
      type: 2, // Button
      style: activeButton === 'age' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      label: 'Age',
      custom_id: `${prefix}_set_age${suffix}${userIdPart}`,
      emoji: { name: '🎂' },
      disabled: !enabled
    }
  ];

  // Add vanity roles button for admin mode
  if (mode === PlayerManagementMode.ADMIN && showVanityRoles) {
    components.push({
      type: 2, // Button
      style: activeButton === 'vanity' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      label: 'Vanity Roles',
      custom_id: `admin_manage_vanity${suffix}${userIdPart}`,
      emoji: { name: '🎭' },
      disabled: !enabled
    });
  }

  // Add attributes/stats button for both admin and player mode
  components.push({
    type: 2, // Button
    style: activeButton === 'attributes' ? ButtonStyle.Primary : ButtonStyle.Secondary,
    label: 'Stats',
    custom_id: `${prefix}_set_attributes${suffix}${userIdPart}`,
    emoji: { name: '📊' },
    disabled: !enabled
  });

  return {
    type: 1, // ActionRow
    components
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SECTION HELPERS — calculateVisibility, buildSectionRow, buildSuperSelect
// ════════════════════════════════════════════════════════════════════════════

/**
 * Pre-calculates which buttons should be visible/enabled in the player menu.
 * @param {string} guildId
 * @param {string} targetUserId - The user being viewed (may be null in admin mode)
 * @param {Object} playerData
 * @param {Object} safariData
 * @param {string} mode - PlayerManagementMode
 * @param {Object} client - Discord client
 * @param {string} channelId - Current channel ID (for navigate detection)
 * @returns {Object} Visibility map: { featureName: { show: bool, disabled: bool, label?: string, emoji?: string } }
 */
async function calculateVisibility(guildId, targetUserId, playerData, safariData, mode, client, channelId) {
  const safariConfig = safariData[guildId]?.safariConfig || {};
  const allButtons = safariData[guildId]?.buttons || {};
  const isAdmin = mode === PlayerManagementMode.ADMIN;
  const hasTarget = !!targetUserId;

  // Player initialization state
  const safariObj = playerData[guildId]?.players?.[targetUserId]?.safari;
  const isInitialized = safariObj !== undefined;
  const hasPoints = safariObj?.points !== undefined; // true init (not just skeleton)
  const currentRound = safariConfig.currentRound;

  // Map location state
  const activeMapId = safariData[guildId]?.maps?.active;
  const playerMapData = activeMapId ? playerData[guildId]?.players?.[targetUserId]?.safari?.mapProgress?.[activeMapId] : null;
  const hasMapLocation = playerMapData?.currentLocation !== undefined;

  // Feature configuration checks
  const pronounRoleIds = playerData[guildId]?.pronounRoleIDs || [];
  const timezones = playerData[guildId]?.timezones || {};
  const timezoneEntries = Object.entries(timezones);
  const hasPronounsConfigured = pronounRoleIds.length > 0;
  const hasTimezonesConfigured = timezoneEntries.length > 0;

  const attributeDefinitions = await getAttributeDefinitions(guildId);
  const hasAttributesConfigured = Object.keys(attributeDefinitions).length > 0;

  // Inventory visibility
  const inventoryVisibilityMode = safariConfig.inventoryVisibilityMode || 'always';
  let showInventory = false;
  switch (inventoryVisibilityMode) {
    case 'always': showInventory = true; break;
    case 'never': showInventory = false; break;
    case 'initialized_only': showInventory = isInitialized; break;
    case 'standard': default: showInventory = isInitialized && currentRound && currentRound !== 0; break;
  }

  // Challenges — check if any have actions visible to this player
  const challenges = playerData[guildId]?.challenges || {};
  let hasChallengeActions = false;
  for (const [chId, ch] of Object.entries(challenges)) {
    const actions = getChallengeActions(ch);
    if (actions.playerAll.length > 0) { hasChallengeActions = true; break; }
    if (targetUserId && normalizeLinks(actions.playerIndividual[targetUserId]).length > 0) { hasChallengeActions = true; break; }
    // tribe check needs member roles — defer to runtime if we have entries
    if (Object.keys(actions.tribe).length > 0) { hasChallengeActions = true; break; }
  }

  // Crafting actions
  const craftingActions = Object.values(allButtons).filter(a => {
    const vis = a.menuVisibility || 'none';
    const tt = a.trigger?.type || 'button';
    return vis === 'crafting_menu' && (tt === 'button' || tt === 'button_modal' || tt === 'button_input');
  });
  const hasCraftingConfigured = craftingActions.length > 0;

  // Player menu actions
  const menuActions = Object.values(allButtons).filter(a => {
    const vis = a.menuVisibility || (a.showInInventory ? 'player_menu' : 'none');
    const tt = a.trigger?.type || 'button';
    return vis === 'player_menu' && (tt === 'button' || tt === 'button_modal' || tt === 'button_input');
  });
  const hasActionsConfigured = menuActions.length > 0;

  // Global stores visibility
  const globalStoresVisibilityMode = safariConfig.globalStoresVisibilityMode || 'always';
  let showStores = false;
  switch (globalStoresVisibilityMode) {
    case 'always': showStores = true; break;
    case 'never': showStores = false; break;
    case 'initialized_only': showStores = isInitialized; break;
    case 'standard': default: showStores = isInitialized && currentRound && currentRound !== 0; break;
  }
  const globalStores = (safariData[guildId]?.globalStores || []).slice(0, MAX_GLOBAL_STORES);
  const stores = safariData[guildId]?.stores || {};
  const hasStoresExist = globalStores.some(id => stores[id]);

  // Commands
  const enableGlobalCommands = safariConfig.enableGlobalCommands !== false;

  // Custom inventory terms
  const customTerms = await getCustomTerms(guildId);

  // Navigate coordinate
  const currentCoordinate = playerMapData?.currentLocation;

  // Build visibility map
  // For admin with no target: show as DISABLED if feature IS configured, HIDE if not configured
  const vis = {};

  // === Row 1: Castlists & Profile ===
  vis.castlists = { show: true, disabled: isAdmin && !hasTarget, label: 'Castlists', emoji: '📋' };
  vis.pronouns = { show: isAdmin ? hasPronounsConfigured : hasPronounsConfigured, disabled: isAdmin && !hasTarget, label: 'Pronouns', emoji: '💜' };
  vis.timezone = { show: isAdmin ? hasTimezonesConfigured : hasTimezonesConfigured, disabled: isAdmin && !hasTarget, label: 'Timezone', emoji: '🌍' };
  vis.age = { show: true, disabled: isAdmin && !hasTarget, label: 'Age', emoji: '🎂' };

  // === Row 2: Safari ===
  vis.inventory = { show: isAdmin ? showInventory : (showInventory && hasTarget), disabled: isAdmin && !hasTarget, label: customTerms.inventoryName || 'Inventory', emoji: customTerms.inventoryEmoji || '🧰', immediate: true };
  vis.challenges = { show: isAdmin ? hasChallengeActions : hasChallengeActions, disabled: isAdmin && !hasTarget, label: 'Challenges', emoji: '🏃' };
  vis.crafting = { show: isAdmin ? hasCraftingConfigured : hasCraftingConfigured, disabled: isAdmin && !hasTarget, label: customTerms.craftingName || 'Crafting', emoji: customTerms.craftingEmoji || '🛠️' };
  vis.actions = { show: isAdmin ? hasActionsConfigured : hasActionsConfigured, disabled: isAdmin && !hasTarget, label: 'Actions', emoji: '⚡' };
  vis.stores = { show: isAdmin ? (showStores && hasStoresExist) : (showStores && hasStoresExist), disabled: isAdmin && !hasTarget, label: 'Stores', emoji: '🏪' };

  // === Row 3: Advanced ===
  vis.attributes = { show: isAdmin ? hasAttributesConfigured : hasAttributesConfigured, disabled: isAdmin && !hasTarget, label: 'Stats', emoji: '📊' };
  vis.commands = { show: enableGlobalCommands, disabled: isAdmin && !hasTarget, label: 'Commands', emoji: '🕹️', immediate: true };
  vis.vanity = { show: isAdmin, disabled: isAdmin && !hasTarget, label: 'Vanity Roles', emoji: '🎭' };
  vis.navigate = { show: hasTarget && isInitialized && hasMapLocation, disabled: false, label: 'Navigate', emoji: '🗺️', immediate: true, coordinate: currentCoordinate };

  // Metadata for footer
  vis._meta = { isInitialized: hasPoints, hasTarget, isAdmin };

  console.log(`📊 Visibility calc for ${guildId}/${targetUserId || 'none'}: ${Object.entries(vis).filter(([k,v]) => k !== '_meta' && v.show).map(([k]) => k).join(', ')}`);

  return vis;
}

/**
 * Builds a section ActionRow from button definitions, respecting visibility.
 * @param {string[]} buttonIds - Ordered list of button category IDs
 * @param {string} targetUserId - Target user (for custom_id suffix)
 * @param {string} activeCategory - Currently active category (renders as Primary)
 * @param {Object} visibility - From calculateVisibility()
 * @param {string} mode - PlayerManagementMode
 * @returns {Object|null} ActionRow component or null if no buttons visible
 */
function buildSectionRow(buttonIds, targetUserId, activeCategory, visibility, mode) {
  const prefix = mode === PlayerManagementMode.ADMIN ? 'admin' : 'player';
  const userIdPart = mode === PlayerManagementMode.ADMIN && targetUserId ? `_${targetUserId}` : '';
  const components = [];

  for (const id of buttonIds) {
    const vis = visibility[id];
    if (!vis || !vis.show) continue;

    const isActive = activeCategory === id;
    const isDisabled = vis.disabled;

    // Build custom_id based on button type
    let customId;
    if (id === 'vanity') {
      customId = `admin_manage_vanity${isDisabled ? '_pending' : ''}${userIdPart}`;
    } else if (id === 'inventory') {
      customId = mode === 'admin' && targetUserId ? `safari_player_inventory_${targetUserId}` : 'safari_player_inventory';
    } else if (id === 'navigate') {
      customId = `safari_navigate_${targetUserId}_${vis.coordinate || 'unknown'}`;
    } else if (id === 'commands') {
      customId = 'player_enter_command_global';
    } else {
      customId = `${prefix}_set_${id}${isDisabled ? '_pending' : ''}${userIdPart}`;
    }

    const button = {
      type: 2, // Button
      style: isActive ? 1 : 2, // Primary if active, Secondary otherwise
      label: vis.label,
      custom_id: customId,
      disabled: isDisabled
    };

    const emoji = resolveEmoji(vis.emoji, undefined);
    if (emoji) button.emoji = emoji;

    components.push(button);
  }

  if (components.length === 0) return null;

  return {
    type: 1, // ActionRow
    components
  };
}

/**
 * Builds the hot-swap select menu for the active category.
 * Returns a single ActionRow with either a StringSelect or RoleSelect.
 * @param {string} activeCategory
 * @param {Object} targetMember - Discord GuildMember or null
 * @param {Object} playerData
 * @param {Object} safariData
 * @param {string} guildId
 * @param {string} mode
 * @param {Object} client - Discord client
 * @param {Object} guild - Discord guild (pre-fetched)
 * @param {string} userId - The interacting user's ID
 * @returns {Object} ActionRow component (always returns something - disabled placeholder if no category)
 */
async function buildSuperSelect(activeCategory, targetMember, playerData, safariData, guildId, mode, client, guild, userId) {
  const prefix = mode === PlayerManagementMode.ADMIN ? 'admin' : 'player';
  const userIdPart = mode === PlayerManagementMode.ADMIN && targetMember ? `_${targetMember.id}` : '';

  // No active category or no target — disabled placeholder
  if (!activeCategory || !targetMember) {
    const placeholder = !targetMember
      ? 'Select player first..'
      : 'Click a button above to configure..';
    return {
      type: 1, // ActionRow
      components: [{
        type: 6, // Role Select (always valid as placeholder)
        custom_id: targetMember ? 'admin_integrated_select_inactive' : 'admin_integrated_select_pending',
        placeholder,
        min_values: 0,
        max_values: 1,
        disabled: true
      }]
    };
  }

  // IMMEDIATE-NEW categories don't have selects — show disabled placeholder
  const immediateCategories = ['inventory', 'navigate', 'commands'];
  if (immediateCategories.includes(activeCategory)) {
    return {
      type: 1, // ActionRow
      components: [{
        type: 6, // Role Select
        custom_id: 'admin_integrated_select_inactive',
        placeholder: `${activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)} opens in a new message`,
        min_values: 0,
        max_values: 1,
        disabled: true
      }]
    };
  }

  switch (activeCategory) {
    // ─── Castlists ───────────────────────────────────────────────────────
    case 'castlists': {
      const { allCastlists } = await extractCastlistData(playerData, guildId);
      const safariConfig = safariData[guildId]?.safariConfig || {};
      const showCustomCastlists = safariConfig.showCustomCastlists !== false;

      const options = [
        {
          label: 'Post Castlist',
          value: 'show_castlist2_default',
          description: 'Publicly post an interactive Castlist. Use in subs for privacy.',
          emoji: { name: '📋' }
        },
        {
          label: 'Compact Castlist',
          value: 'compact_castlist_default',
          description: 'Posts an image version of the castlist',
          emoji: { name: '🍒' }
        }
      ];

      // Add custom castlists sorted by last updated
      if (showCustomCastlists && allCastlists) {
        const sorted = limitAndSortCastlists(allCastlists, 22); // 25 - 2 fixed - 1 safety
        for (const [id, castlist] of sorted) {
          if (id === 'default') continue; // Already covered by first option
          if (options.length >= 25) break;
          const emoji = resolveEmoji(castlist?.metadata?.emoji || castlist.emoji, '📋');
          options.push({
            label: (castlist.name || id).slice(0, 100),
            value: `show_castlist2_${id}`,
            description: castlist.description?.slice(0, 100) || undefined,
            emoji
          });
        }
      }

      if (options.length >= 25) {
        options[24] = { label: '❌ Max Castlists shown', value: '_error_max', description: 'Too many castlists to display' };
      }

      return {
        type: 1,
        components: [{
          type: 3, // String Select
          custom_id: 'player_menu_sel_castlists',
          placeholder: 'Select a castlist to post',
          min_values: 1,
          max_values: 1,
          options
        }]
      };
    }

    // ─── Challenges ──────────────────────────────────────────────────────
    case 'challenges': {
      const challenges = playerData[guildId]?.challenges || {};
      const allBtns = safariData[guildId]?.buttons || {};
      const options = [];

      // Viewer admin-status for status gating (playerAll/individual/tribe all use this bypass)
      // Bits: ManageChannels(4) | ManageGuild(5) | ManageRoles(28) | Administrator(3)
      const viewerIsAdmin = (() => {
        const p = targetMember?.permissions;
        if (!p) return false;
        const perms = BigInt(p);
        const mask = (1n << 4n) | (1n << 5n) | (1n << 28n) | (1n << 3n);
        return (perms & mask) !== 0n;
      })();

      for (const [chId, ch] of Object.entries(challenges)) {
        const actions = getChallengeActions(ch);
        const chalTitle = (ch.title || 'Challenge').slice(0, 50);

        // Status gate: paused → hidden for all; testing → admin-only
        const chStatus = ch.status || 'active';
        if (chStatus === 'paused') continue;
        if (chStatus === 'testing' && !viewerIsAdmin) continue;

        // playerAll — link objects with .actionId
        for (const link of normalizeLinks(actions.playerAll)) {
          const action = allBtns[link.actionId];
          if (!action) continue;
          const emoji = resolveEmoji(action.emoji || action.trigger?.button?.emoji, '🏃');
          options.push({
            label: (action.name || 'Action').slice(0, 100),
            value: link.actionId,
            description: chalTitle,
            emoji
          });
        }

        // playerIndividual — only if assigned to target
        const targetId = targetMember.id;
        for (const link of normalizeLinks(actions.playerIndividual[targetId])) {
          const action = allBtns[link.actionId];
          if (action) {
            const emoji = resolveEmoji(action.emoji || action.trigger?.button?.emoji, '🏃');
            options.push({
              label: (action.name || 'Action').slice(0, 100),
              value: link.actionId,
              description: chalTitle,
              emoji
            });
          }
        }

        // tribe — check roles (role check always applies; status gate above already handled admin bypass during testing)
        for (const [roleId, triLinks] of Object.entries(actions.tribe)) {
          if (targetMember?.roles?.cache?.has?.(roleId)) {
            for (const link of normalizeLinks(triLinks)) {
              const action = allBtns[link.actionId];
              if (action) {
                const emoji = resolveEmoji(action.emoji || action.trigger?.button?.emoji, '🏃');
                options.push({
                  label: (action.name || 'Action').slice(0, 100),
                  value: link.actionId,
                  description: chalTitle,
                  emoji
                });
              }
            }
          }
        }
      }

      if (options.length === 0) {
        return {
          type: 1,
          components: [{
            type: 3,
            custom_id: 'player_menu_sel_challenges',
            placeholder: 'No active challenge actions',
            min_values: 0,
            max_values: 1,
            disabled: true,
            options: [{ label: 'No challenges', value: 'none', description: 'No challenge actions available' }]
          }]
        };
      }

      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: 'player_menu_sel_challenges',
          placeholder: '🏃 Select challenge action',
          min_values: 1,
          max_values: 1,
          options: options.slice(0, 25)
        }]
      };
    }

    // ─── Crafting ────────────────────────────────────────────────────────
    case 'crafting': {
      const customTerms = await getCustomTerms(guildId);
      const craftingNameLower = (customTerms.craftingName || 'Crafting').toLowerCase();
      const allBtns = safariData[guildId]?.buttons || {};
      const craftingActions = Object.entries(allBtns)
        .filter(([id, a]) => {
          const vis = a.menuVisibility || 'none';
          const tt = a.trigger?.type || 'button';
          return vis === 'crafting_menu' && (tt === 'button' || tt === 'button_modal' || tt === 'button_input');
        })
        .map(([id, a]) => ({ ...a, actionId: id }))
        .sort((a, b) => {
          const orderA = a.inventoryConfig?.sortOrder ?? 999;
          const orderB = b.inventoryConfig?.sortOrder ?? 999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '');
        });

      if (craftingActions.length === 0) {
        return {
          type: 1,
          components: [{
            type: 3,
            custom_id: 'player_menu_sel_crafting',
            placeholder: `No ${craftingNameLower} recipes available`,
            min_values: 0,
            max_values: 1,
            disabled: true,
            options: [{ label: 'No recipes', value: 'none', description: `No ${craftingNameLower} recipes configured` }]
          }]
        };
      }

      const options = craftingActions.slice(0, 25).map(action => {
        const label = (action.inventoryConfig?.buttonLabel || action.trigger?.button?.label || action.name || 'Recipe').slice(0, 100);
        // Recipe's own emoji → server's crafting emoji → Unicode default.
        // Pass custom-emoji strings as PRIMARY so resolveEmoji parses them; fallback must stay Unicode per contract.
        const rawEmojiStr =
          action.inventoryConfig?.buttonEmoji
          || action.trigger?.button?.emoji
          || action.emoji
          || customTerms.craftingEmoji;
        const emoji = resolveEmoji(rawEmojiStr, '🛠️');
        return {
          label,
          value: action.actionId,
          emoji
        };
      });

      if (craftingActions.length >= 25) {
        options[24] = { label: '❌ Max recipes shown', value: '_error_max' };
      }

      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: 'player_menu_sel_crafting',
          placeholder: `Select a ${craftingNameLower} recipe`,
          min_values: 1,
          max_values: 1,
          options
        }]
      };
    }

    // ─── Actions (Player Menu Actions) ──────────────────────────────────
    case 'actions': {
      const allBtns = safariData[guildId]?.buttons || {};
      const menuActions = Object.entries(allBtns)
        .filter(([id, a]) => {
          const vis = a.menuVisibility || (a.showInInventory ? 'player_menu' : 'none');
          const tt = a.trigger?.type || 'button';
          return vis === 'player_menu' && (tt === 'button' || tt === 'button_modal' || tt === 'button_input');
        })
        .map(([id, a]) => ({ ...a, actionId: id }))
        .sort((a, b) => {
          const orderA = a.inventoryConfig?.sortOrder ?? 999;
          const orderB = b.inventoryConfig?.sortOrder ?? 999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '');
        });

      if (menuActions.length === 0) {
        return {
          type: 1,
          components: [{
            type: 3,
            custom_id: 'player_menu_sel_actions',
            placeholder: 'No actions available',
            min_values: 0,
            max_values: 1,
            disabled: true,
            options: [{ label: 'No actions', value: 'none', description: 'No player menu actions configured' }]
          }]
        };
      }

      const options = menuActions.slice(0, 25).map(action => {
        const label = (action.inventoryConfig?.buttonLabel || action.trigger?.button?.label || action.name || 'Action').slice(0, 100);
        const emoji = resolveEmoji(action.inventoryConfig?.buttonEmoji || action.trigger?.button?.emoji || action.emoji, '⚡');
        return {
          label,
          value: action.actionId,
          emoji
        };
      });

      if (menuActions.length >= 25) {
        options[24] = { label: '❌ Max actions shown', value: '_error_max' };
      }

      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: 'player_menu_sel_actions',
          placeholder: 'Select an action',
          min_values: 1,
          max_values: 1,
          options
        }]
      };
    }

    // ─── Stores ──────────────────────────────────────────────────────────
    case 'stores': {
      const globalStores = (safariData[guildId]?.globalStores || []).slice(0, MAX_GLOBAL_STORES);
      const stores = safariData[guildId]?.stores || {};
      const options = [];

      for (const storeId of globalStores) {
        const store = stores[storeId];
        if (!store) continue;
        const itemCount = Object.keys(store.items || {}).length;
        const emoji = resolveEmoji(store.emoji, '🏪');
        options.push({
          label: (store.name || 'Store').slice(0, 100),
          value: storeId,
          description: `${itemCount} item${itemCount !== 1 ? 's' : ''}`,
          emoji
        });
      }

      if (options.length === 0) {
        return {
          type: 1,
          components: [{
            type: 3,
            custom_id: 'player_menu_sel_stores',
            placeholder: 'No stores available',
            min_values: 0,
            max_values: 1,
            disabled: true,
            options: [{ label: 'No stores', value: 'none', description: 'No global stores configured' }]
          }]
        };
      }

      if (options.length >= 25) {
        options[24] = { label: '❌ Max stores shown', value: '_error_max' };
      }

      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: 'player_menu_sel_stores',
          placeholder: 'Select a store to browse',
          min_values: 1,
          max_values: 1,
          options
        }]
      };
    }

    // ─── Pronouns (ported from createHotSwappableSelect) ────────────────
    case 'pronouns': {
      const pronounRoleIds = await getGuildPronouns(guildId);
      if (!pronounRoleIds || pronounRoleIds.length === 0) return null;

      if (pronounRoleIds.length > 25) {
        console.error(`❌ Too many pronoun roles (${pronounRoleIds.length}). Discord limit is 25.`);
        return {
          type: 1,
          components: [{
            type: 3,
            custom_id: `${prefix}_integrated_pronouns${userIdPart}`,
            placeholder: `❌ Too many pronoun roles (${pronounRoleIds.length}/25)`,
            min_values: 0,
            max_values: 1,
            disabled: true,
            options: [{ label: 'Error', value: 'error', description: 'Too many pronoun roles configured' }]
          }]
        };
      }

      const resolvedGuild = guild || await client.guilds.fetch(guildId);
      const pronounRoles = [];
      for (const roleId of pronounRoleIds) {
        try {
          const role = await resolvedGuild.roles.fetch(roleId);
          if (role) pronounRoles.push(role);
        } catch (error) {
          console.warn(`Could not fetch pronoun role ${roleId}:`, error.message);
        }
      }
      if (pronounRoles.length === 0) return null;

      const currentPronouns = targetMember.roles.cache
        .filter(role => pronounRoleIds.includes(role.id))
        .map(role => role.id);

      const customId = `${prefix}_integrated_pronouns${userIdPart}`;
      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: customId,
          placeholder: 'Select pronouns',
          min_values: 0,
          max_values: Math.min(pronounRoles.length, 3),
          options: pronounRoles.sort((a, b) => a.name.localeCompare(b.name)).map(role => ({
            label: role.name,
            value: role.id,
            emoji: { name: '💜' },
            default: currentPronouns.includes(role.id)
          }))
        }]
      };
    }

    // ─── Timezone (ported from createHotSwappableSelect) ────────────────
    case 'timezone': {
      const resolvedGuild = guild || await client.guilds.fetch(guildId);

      const { cleanupMissingRoles } = await import('./storage.js');
      const cleanupResult = await cleanupMissingRoles(guildId, resolvedGuild);
      if (cleanupResult.cleaned > 0) {
        console.log(`🧹 CLEANUP: Cleaned up ${cleanupResult.cleaned} missing roles before creating timezone select`);
      }

      const timezones = await getGuildTimezones(guildId);
      const timezoneEntries = Object.entries(timezones || {});
      if (timezoneEntries.length === 0) return null;

      if (timezoneEntries.length > 25) {
        console.error(`❌ Too many timezone roles (${timezoneEntries.length}). Discord limit is 25.`);
        return {
          type: 1,
          components: [{
            type: 3,
            custom_id: `${prefix}_integrated_timezone${userIdPart}`,
            placeholder: `❌ Too many timezone roles (${timezoneEntries.length}/25)`,
            min_values: 0,
            max_values: 1,
            disabled: true,
            options: [{ label: 'Error', value: 'error', description: 'Too many timezone roles configured' }]
          }]
        };
      }

      const { loadDSTState } = await import('./storage.js');
      const dstState = await loadDSTState();

      const timezoneRoles = [];
      for (const [roleId, data] of timezoneEntries) {
        try {
          const role = await resolvedGuild.roles.fetch(roleId);
          if (role) timezoneRoles.push({ role, offset: data.offset, data });
        } catch (error) {
          console.warn(`🚨 Skipping invalid timezone role ${roleId}:`, error.message);
        }
      }
      if (timezoneRoles.length === 0) return null;

      timezoneRoles.sort((a, b) => a.offset - b.offset);

      const currentTimezone = targetMember.roles.cache
        .find(role => Object.keys(timezones).includes(role.id));

      const customId = `${prefix}_integrated_timezone${userIdPart}`;
      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: customId,
          placeholder: 'Select timezone',
          min_values: 0,
          max_values: 1,
          options: timezoneRoles.map(({ role, offset, data }) => {
            let description;
            if (data.timezoneId && dstState[data.timezoneId]) {
              description = dstState[data.timezoneId].displayName;
            } else {
              description = `UTC${offset >= 0 ? '+' : ''}${offset}`;
            }
            return {
              label: role.name,
              value: role.id,
              description,
              emoji: { name: '🌍' },
              default: currentTimezone?.id === role.id
            };
          })
        }]
      };
    }

    // ─── Age (ported from createHotSwappableSelect) ─────────────────────
    case 'age': {
      const ageOptions = [];
      for (let age = 16; age <= 39; age++) {
        ageOptions.push({
          label: age.toString(),
          value: `age_${age}`,
          description: `${age} years old`
        });
      }
      ageOptions.push({
        label: 'Custom Age',
        value: 'age_custom',
        description: "Age not shown or '30s' style age",
        emoji: { name: '✏️' }
      });

      const currentAge = playerData[guildId]?.players?.[targetMember.id]?.age;
      const customId = `${prefix}_integrated_age${userIdPart}`;
      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: customId,
          placeholder: currentAge ? `Current age: ${currentAge}` : 'Select age',
          min_values: 0,
          max_values: 1,
          options: ageOptions
        }]
      };
    }

    // ─── Vanity (ported from createHotSwappableSelect) ──────────────────
    case 'vanity': {
      if (mode !== PlayerManagementMode.ADMIN) return null;

      const currentVanityRoles = playerData[guildId]?.players?.[targetMember.id]?.vanityRoles || [];
      return {
        type: 1,
        components: [{
          type: 6, // Role Select
          custom_id: `admin_integrated_vanity_${targetMember.id}`,
          placeholder: 'Select vanity roles',
          min_values: 0,
          max_values: 25,
          default_values: currentVanityRoles.map(id => ({ id, type: 'role' }))
        }]
      };
    }

    // ─── Stats / Attributes (ported from createHotSwappableSelect) ──────
    case 'attributes': {
      const attributes = await getAttributeDefinitions(guildId);
      const attrEntries = Object.entries(attributes);

      if (attrEntries.length === 0) {
        return {
          type: 1,
          components: [{
            type: 3,
            custom_id: `admin_integrated_attributes_${targetMember.id}`,
            placeholder: 'No attributes configured - use Tools → Attributes',
            min_values: 0,
            max_values: 1,
            disabled: true,
            options: [{ label: 'No attributes', value: 'none', description: 'Configure attributes in Tools menu' }]
          }]
        };
      }

      const attrOptions = attrEntries.slice(0, 25).map(([id, attr]) => {
        const isResource = attr.category === 'resource';
        return {
          label: attr.name,
          value: id,
          description: `${isResource ? 'Resource' : 'Stat'} - Click to modify`,
          emoji: resolveEmoji(attr.emoji, '📊')
        };
      });

      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: `admin_integrated_attributes_${targetMember.id}`,
          placeholder: 'Select attribute to modify',
          min_values: 1,
          max_values: 1,
          options: attrOptions
        }]
      };
    }

    default:
      return null;
  }
}

/**
 * Creates the complete player management UI
 * @param {Object} options - Configuration options
 * @returns {Object} Components V2 message structure
 */
export async function createPlayerManagementUI(options) {
  const {
    mode = PlayerManagementMode.PLAYER,
    targetMember,
    playerData,
    guildId,
    userId,
    showUserSelect = (mode === PlayerManagementMode.ADMIN),
    showVanityRoles = (mode === PlayerManagementMode.ADMIN),
    title = mode === PlayerManagementMode.ADMIN ? 'CastBot | Player Management' : 'CastBot | Player Menu',
    activeButton = null, // Which button/category is currently active
    client = null, // Discord client for fetching data
    channelId = null, // Discord channel ID for location context
    // Application context options
    isApplicationContext = false, // Whether this is being used in application channel
    hideBottomButtons = false // Whether to hide bottom action row buttons
  } = options;

  const isAdmin = mode === PlayerManagementMode.ADMIN;
  const activeCategory = activeButton; // conceptual rename

  // Load safari data once (lazy — may not be loaded yet)
  const safariData = await loadSafariContent();

  // Pre-fetch guild if we have a client (needed by buildSuperSelect and visibility)
  let guild = null;
  if (client) {
    try { guild = await client.guilds.fetch(guildId); } catch (e) { console.warn('Could not fetch guild:', e.message); }
  }

  // Calculate visibility for all buttons
  const targetUserId = targetMember?.id || null;
  const visibility = await calculateVisibility(guildId, targetUserId, playerData, safariData, mode, client, channelId);

  // ════════════════════════════════════════════════════════════════════════
  // BUILD SINGLE CONTAINER
  // ════════════════════════════════════════════════════════════════════════
  const container = {
    type: 17, // Container
    accent_color: 0x3498DB, // Blue accent (matching production menu)
    components: []
  };

  // ── Header ──
  container.components.push({
    type: 10, // Text Display
    content: `## ${title}`
  });

  // ── Admin: User Select ──
  if (showUserSelect) {
    container.components.push({ type: 14 }); // Separator

    const userSelectRow = {
      type: 1, // ActionRow
      components: [{
        type: 5, // User Select
        custom_id: 'admin_player_select_update',
        placeholder: 'Select a player to manage',
        min_values: 0,
        max_values: 1
      }]
    };

    if (targetMember) {
      userSelectRow.components[0].default_values = [{
        id: targetMember.id,
        type: 'user'
      }];
    }

    container.components.push(userSelectRow);
  }

  // ── Player Info Section ──
  if (targetMember) {
    container.components.push({ type: 14 }); // Separator
    const playerSection = await createPlayerDisplaySection(targetMember, playerData, guildId);
    if (playerSection) {
      container.components.push(playerSection);
    }
  }

  // ── Separator before button rows ──
  container.components.push({ type: 14 }); // Separator

  // ════════════════════════════════════════════════════════════════════════
  // 3 SECTION ROWS (conditional — hide row if no buttons visible)
  // ════════════════════════════════════════════════════════════════════════

  if (!hideBottomButtons) {
    // Row 1: Castlists & Profile
    const row1 = buildSectionRow(
      ['castlists', 'pronouns', 'timezone', 'age'],
      targetUserId, activeCategory, visibility, mode
    );
    if (row1) {
      container.components.push({
        type: 10,
        content: '### ```✏️ Castlists & Profile```'
      });
      container.components.push(row1);
    }

    // Row 2: Safari (conditional — hide if no buttons visible)
    const row2Ids = ['inventory', 'challenges', 'crafting', 'actions', 'stores'];
    const row2HasAny = row2Ids.some(id => visibility[id]?.show);
    if (row2HasAny) {
      const row2 = buildSectionRow(row2Ids, targetUserId, activeCategory, visibility, mode);
      if (row2) {
        container.components.push({
          type: 10,
          content: '### ```🦁 Idol Hunts, Challenges and Safari```'
        });
        container.components.push(row2);
      }
    }

    // Row 3: Advanced (conditional — hide if no buttons visible)
    const row3Ids = ['attributes', 'commands', 'vanity', 'navigate'];
    const row3HasAny = row3Ids.some(id => visibility[id]?.show);
    if (row3HasAny) {
      const row3 = buildSectionRow(row3Ids, targetUserId, activeCategory, visibility, mode);
      if (row3) {
        container.components.push({
          type: 10,
          content: '### ```💎 Advanced```'
        });
        container.components.push(row3);
      }
    }
  } else {
    // hideBottomButtons mode (application context) — just show Row 1 essentials
    const row1 = buildSectionRow(
      ['pronouns', 'timezone', 'age'],
      targetUserId, activeCategory, visibility, mode
    );
    if (row1) {
      container.components.push(row1);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // HOT-SWAP SELECT
  // ════════════════════════════════════════════════════════════════════════
  container.components.push({ type: 14 }); // Separator

  const selectMenu = await buildSuperSelect(
    activeCategory, targetMember, playerData, safariData,
    guildId, mode, client, guild, userId
  );
  if (selectMenu) {
    container.components.push(selectMenu);
  }

  // ════════════════════════════════════════════════════════════════════════
  // STATS DISPLAY (below select when Stats button active)
  // ════════════════════════════════════════════════════════════════════════
  if (activeCategory === 'attributes' && targetMember) {
    const displayName = targetMember.displayName || targetMember.user?.username || 'Player';
    const statsLabel = isAdmin ? `${displayName}'s Stats` : 'Your Stats';
    const attributeSection = await createAttributeDisplaySection(guildId, targetMember.id, statsLabel);
    if (attributeSection) {
      container.components.push(attributeSection);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // APPLICATION CONTEXT — "Move on to main questions" button
  // ════════════════════════════════════════════════════════════════════════
  if (isApplicationContext) {
    container.components.push({ type: 14 }); // Separator
    container.components.push({
      type: 1, // ActionRow
      components: [{
        type: 2, // Button
        custom_id: `app_continue_${guildId}_${userId}`,
        label: 'Move on to the main questions',
        style: 1, // Primary
        emoji: { name: '❔' }
      }]
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // FOOTER — ← Menu, Logs, Guide
  // ════════════════════════════════════════════════════════════════════════
  if (!hideBottomButtons) {
    const footerButtons = [];

    // ← Menu button (admin mode only)
    if (isAdmin) {
      footerButtons.push(createBackButton('prod_menu_back'));
    }

    // Logs button
    const showLogs = visibility._meta.isInitialized || isAdmin;
    if (showLogs) {
      if (isAdmin && targetMember) {
        footerButtons.push({
          type: 2,
          style: 2, // Secondary
          label: 'Logs',
          custom_id: `admin_view_logs_${targetMember.id}`,
          emoji: { name: '📜' }
        });
      } else if (!isAdmin) {
        footerButtons.push({
          type: 2,
          style: 2,
          label: 'Logs',
          custom_id: 'player_view_logs',
          emoji: { name: '📜' }
        });
      }
    }

    // Guide button (player mode, initialized only)
    if (!isAdmin && visibility._meta.isInitialized) {
      footerButtons.push({
        type: 2,
        style: 2,
        label: 'Guide',
        custom_id: 'safari_guide_0',
        emoji: { name: '🦁' }
      });
    }

    if (footerButtons.length > 0) {
      container.components.push({ type: 14 }); // Separator
      container.components.push({
        type: 1, // ActionRow
        components: footerButtons
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // COMPONENT COUNT VALIDATION
  // ════════════════════════════════════════════════════════════════════════
  const finalCount = countComponents([container], {
    enableLogging: true,
    verbosity: 'full',
    label: 'Player Menu'
  });

  if (finalCount > 40) {
    console.error(`🚨 CRITICAL: Player Menu exceeded component limit: ${finalCount}/40`);
  }

  return {
    flags: (1 << 15), // IS_COMPONENTS_V2 only - ephemeral handled by caller
    components: [container]
  };
}

/**
 * Creates the age input modal
 * @param {string} userId - Target user ID
 * @param {string} mode - PlayerManagementMode
 * @returns {Object} Modal object
 */
export function createAgeModal(userId, mode) {
  const modalId = mode === PlayerManagementMode.ADMIN ? 
    `admin_age_modal_${userId}` : 
    'player_age_modal';

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle('Set Player Age');

  const ageInput = new TextInputBuilder()
    .setCustomId('age')
    .setLabel('Enter your age')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setPlaceholder('e.g. 25');

  const row = new ActionRowBuilder().addComponents(ageInput);
  modal.addComponents(row);

  return modal;
}

/**
 * Handles player button clicks
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {string} customId - Button custom ID
 * @param {Object} playerData - Guild player data
 * @param {Object} client - Discord client (optional, for fetching guild)
 * @returns {Promise<void>}
 */
export async function handlePlayerButtonClick(req, res, customId, playerData, client = null) {
  const guildId = req.body.guild_id;
  const userId = req.body.member.user.id;
  
  // Parse the custom ID to extract mode, button type, and target user
  let mode, buttonType, targetUserId;
  
  if (customId.startsWith('player_set_')) {
    mode = PlayerManagementMode.PLAYER;
    targetUserId = userId;
    buttonType = customId.replace('player_set_', '');
  } else if (customId.startsWith('admin_set_')) {
    mode = PlayerManagementMode.ADMIN;
    const parts = customId.split('_');
    buttonType = parts[2]; // pronouns, timezone, or age
    targetUserId = parts[3] || userId;
  } else if (customId.startsWith('admin_manage_vanity_')) {
    mode = PlayerManagementMode.ADMIN;
    buttonType = 'vanity';
    targetUserId = customId.replace('admin_manage_vanity_', '');
  } else {
    console.error('Unknown button pattern:', customId);
    return;
  }

  // Special handling for age button - show modal for custom age
  if (buttonType === 'age' && req.body.data?.values?.[0] === 'age_custom') {
    const modal = createAgeModal(targetUserId, mode);
    return res.send({
      type: InteractionResponseType.MODAL,
      data: modal.toJSON()
    });
  }

  // For all other buttons, rebuild the UI with the active button
  if (!client) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Error: Discord client not available",
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }

  const guild = await client.guilds.fetch(guildId);
  const targetMember = await guild.members.fetch(targetUserId);

  // Check if this is an application channel context (same logic as player_menu handler)
  const channelId = req.body.channel_id;
  const isApplicationChannel = playerData[guildId]?.applications && 
    Object.values(playerData[guildId].applications).some(app => app.channelId === channelId);
  
  // Use custom title and hide bottom buttons if in application context
  const applicationTitle = 'Set your age, pronouns and timezone.';
  const defaultTitle = mode === PlayerManagementMode.ADMIN ? 
    `Player Management | ${targetMember.displayName}` : 
    'CastBot | Player Menu';
  
  const title = isApplicationChannel ? applicationTitle : defaultTitle;
  const hideBottomButtons = isApplicationChannel;
  
  console.log(`🔍 Player Button Context: Channel ${channelId}, Application Channel: ${isApplicationChannel}, Title: "${title}"`);

  // Rebuild the UI with the active button
  const updatedUI = await createPlayerManagementUI({
    mode,
    targetMember,
    playerData,
    guildId,
    userId: mode === PlayerManagementMode.PLAYER ? userId : req.body.member.user.id,
    showUserSelect: mode === PlayerManagementMode.ADMIN,
    showVanityRoles: mode === PlayerManagementMode.ADMIN,
    title: title,
    activeButton: buttonType,
    hideBottomButtons: hideBottomButtons,
    isApplicationContext: isApplicationChannel,
    client
  });

  // Remove ephemeral flag for update
  if (mode === PlayerManagementMode.ADMIN) {
    updatedUI.flags = (1 << 15); // Only IS_COMPONENTS_V2
  }

  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: updatedUI
  });
}

/**
 * Handles player modal submissions
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {string} customId - Modal custom ID
 * @param {Object} playerData - Guild player data
 * @param {Object} client - Discord client
 * @returns {Promise<void>}
 */
export async function handlePlayerModalSubmit(req, res, customId, playerData, client) {
  const guildId = req.body.guild_id;
  const submitterId = req.body.member.user.id;
  
  // Extract age value
  const age = req.body.data.components[0].components[0].value;
  
  // Validate age
  const ageNum = parseInt(age);
  if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Please enter a valid age between 1 and 120.",
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }

  // Determine mode and target user
  let mode, targetUserId;
  
  if (customId === 'player_age_modal') {
    mode = PlayerManagementMode.PLAYER;
    targetUserId = submitterId;
  } else if (customId.startsWith('admin_age_modal_')) {
    mode = PlayerManagementMode.ADMIN;
    targetUserId = customId.replace('admin_age_modal_', '');
  } else {
    console.error('Unknown modal pattern:', customId);
    return;
  }

  // Update player data
  await updatePlayer(guildId, targetUserId, { age: age.toString() });

  // For admin mode, rebuild the interface
  if (mode === PlayerManagementMode.ADMIN) {
    // Fetch the target member
    const guild = await client.guilds.fetch(guildId);
    const targetMember = await guild.members.fetch(targetUserId);
    
    // Reload player data
    const freshPlayerData = await loadPlayerData();
    
    // Rebuild the UI
    const updatedUI = await createPlayerManagementUI({
      mode: PlayerManagementMode.ADMIN,
      targetMember,
      playerData: freshPlayerData,
      guildId,
      showUserSelect: true,
      showVanityRoles: true
    });

    return res.send({
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: updatedUI
    });
  } else {
    // For player mode, just confirm
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Your age has been updated to ${age}.`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
}

/**
 * Legacy wrapper — delegates to buildSuperSelect.
 * Kept for backward compatibility with external callers.
 * @deprecated Use buildSuperSelect directly within this module.
 */
async function createHotSwappableSelect(activeButton, targetMember, playerData, guildId, mode, client) {
  if (!activeButton || !targetMember) return null;
  const safariData = await loadSafariContent();
  let guild = null;
  if (client) {
    try { guild = await client.guilds.fetch(guildId); } catch (e) { /* */ }
  }
  return buildSuperSelect(activeButton, targetMember, playerData, safariData, guildId, mode, client, guild, targetMember.id);
}

export {
  createHotSwappableSelect
};