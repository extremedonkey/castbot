/**
 * Player Card Menu - Combined Player Management Interface (UI Mockup)
 *
 * Merges Player Menu + Players Admin Menu + Player Admin Menu into a single
 * hot-swappable interface with three category rows.
 *
 * Self-contained module — delete this file to purge.
 *
 * WIRING (3 additions):
 * 1. app.js      → Add routing for custom_id.startsWith('pcard_')
 * 2. menuBuilder → Add button to setup_menu ActionRow (next to Privacy Policy)
 * 3. buttonHandlerFactory → Optional BUTTON_REGISTRY entries
 */

import { loadPlayerData, getGuildPronouns, getGuildTimezones } from './storage.js';
import { loadSafariContent, getCustomTerms, getAttributeDefinitions } from './safariManager.js';
import { createPlayerDisplaySection, createAttributeDisplaySection } from './playerManagement.js';
import { extractCastlistData } from './castlistV2.js';
import { countComponents } from './utils.js';

// ════════════════════════════════════════════════════════════════════════════
// CATEGORY DEFINITIONS — Three button rows
// ════════════════════════════════════════════════════════════════════════════

const ROW1_BUTTONS = [
  { id: 'castlists', label: 'Castlists', emoji: '📋' },
  { id: 'pronouns',  label: 'Pronouns',  emoji: '💜' },
  { id: 'timezone',  label: 'Timezone',  emoji: '🌍' },
  { id: 'age',       label: 'Age',       emoji: '🎂' },
  { id: 'logs',      label: 'Logs',      emoji: '🪵' }
];

const ROW2_BUTTONS = [
  { id: 'inventory', label: 'Inventory', emoji: '🎒' },
  { id: 'crafting',  label: 'Crafting',  emoji: '🛠️' },
  { id: 'actions',   label: 'Actions',   emoji: '⚡' },
  { id: 'stores',    label: 'Stores',    emoji: '🏪' },
  { id: 'commands',  label: 'Commands',  emoji: '🕹️' }
];

const ROW3_BUTTONS = [
  { id: 'safari',   label: 'Safari',      emoji: '🦁' },
  { id: 'currency', label: 'Currency',    emoji: '💰' },
  { id: 'stats',    label: 'Stats',       emoji: '📊' },
  { id: 'location', label: 'Location',    emoji: '📍' },
  { id: 'vanity',   label: 'Vanity Roles',emoji: '🎭' }
];

// Which categories show text info instead of a select menu
const TEXT_CATEGORIES = new Set(['logs', 'inventory', 'commands', 'currency', 'location']);

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a category button row (ActionRow with 5 buttons)
 */
function buildCategoryRow(buttons, targetUserId, activeButton, disabled = false) {
  return {
    type: 1, // ActionRow
    components: buttons.map(cat => ({
      type: 2, // Button
      custom_id: disabled
        ? `pcard_btn_${cat.id}_pending`
        : `pcard_btn_${cat.id}_${targetUserId}`,
      label: cat.label,
      style: activeButton === cat.id ? 1 : 2, // Primary if active, Secondary otherwise
      emoji: { name: cat.emoji },
      disabled
    }))
  };
}

/**
 * Build a disabled placeholder select
 */
function buildDisabledSelect(placeholder) {
  return {
    type: 1, // ActionRow
    components: [{
      type: 3, // String Select
      custom_id: 'pcard_sel_placeholder',
      placeholder,
      disabled: true,
      min_values: 0,
      max_values: 1,
      options: [{ label: 'Waiting...', value: 'none' }]
    }]
  };
}

/**
 * Build safari quick-status line (currency | items | stamina)
 */
async function buildSafariStatusLine(targetUserId, playerData, safariData, guildId) {
  const safari = playerData[guildId]?.players?.[targetUserId]?.safari;
  if (!safari) return null;

  const customTerms = await getCustomTerms(guildId);
  const parts = [];

  // Currency
  const currency = safari.currency ?? 0;
  const currName = customTerms?.currencyName || 'Currency';
  const currEmoji = customTerms?.currencyEmoji || '💰';
  parts.push(`${currEmoji} **${currName}:** ${currency}`);

  // Items
  const itemCount = Object.keys(safari.inventory || {}).length;
  const invName = customTerms?.inventoryName || 'Inventory';
  const invEmoji = customTerms?.inventoryEmoji || '🎒';
  parts.push(`${invEmoji} **${invName}:** ${itemCount} items`);

  // Stamina
  const stamina = safari.points?.stamina;
  if (stamina) {
    const current = stamina.current ?? 0;
    const max = stamina.maximum ?? current;
    const pct = max > 0 ? Math.floor((current / max) * 100) : 0;
    const filled = Math.floor(pct / 10);
    const empty = 10 - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    parts.push(`⚡ **Stamina:** ${bar} ${current}/${max}`);
  }

  // Safari state
  const isPaused = safari.isPaused;
  const stateLabel = isPaused ? '⏸️ Paused' : '✅ Active';
  parts.push(`**State:** ${stateLabel}`);

  return {
    type: 10, // Text Display
    content: parts.join(' **|** ')
  };
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN UI BUILDER
// ════════════════════════════════════════════════════════════════════════════

export async function createPlayerCardUI(options) {
  const {
    mode = 'admin',
    guildId,
    userId,
    targetMember = null,
    activeButton = null,
    client,
    guild
  } = options;

  const playerData = await loadPlayerData();
  const safariData = await loadSafariContent();
  const isAdmin = mode === 'admin';

  const container = {
    type: 17, // Container
    accent_color: 0x3498DB,
    components: []
  };

  // ── Header ──────────────────────────────────────────────────────────────
  const title = targetMember
    ? `Player Card | ${targetMember.displayName}`
    : 'CastBot | Player Card';
  container.components.push({ type: 10, content: `## ${title}` });

  // ── User Select (admin only) ───────────────────────────────────────────
  if (isAdmin) {
    container.components.push({ type: 14 });
    const userSelectRow = {
      type: 1,
      components: [{
        type: 5, // User Select
        custom_id: 'pcard_user_select',
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

  // ── Player Info (when target selected) ─────────────────────────────────
  if (targetMember) {
    container.components.push({ type: 14 });

    // Player card: avatar, name, pronouns, timezone, current time
    const playerSection = await createPlayerDisplaySection(targetMember, playerData, guildId);
    if (playerSection) container.components.push(playerSection);

    // Safari quick-status: currency | items | stamina | state
    const statusLine = await buildSafariStatusLine(targetMember.id, playerData, safariData, guildId);
    if (statusLine) container.components.push(statusLine);

    // Attributes/Stats (if guild has attributes configured)
    const statsLabel = isAdmin
      ? `${targetMember.displayName}'s Stats`
      : 'Your Stats';
    const attrSection = await createAttributeDisplaySection(guildId, targetMember.id, statsLabel);
    if (attrSection) {
      container.components.push({ type: 14 });
      container.components.push(attrSection);
    }

    // ── Category Button Rows ───────────────────────────────────────────
    container.components.push({ type: 14 });

    // Row 1: Castlists & Profile
    container.components.push({
      type: 10, content: '> **`✏️ Castlists & Profile`**'
    });
    container.components.push(
      buildCategoryRow(ROW1_BUTTONS, targetMember.id, activeButton)
    );

    // Row 2: Safari & Gameplay
    container.components.push({
      type: 10, content: '> **`🦁 Safari & Gameplay`**'
    });
    container.components.push(
      buildCategoryRow(ROW2_BUTTONS, targetMember.id, activeButton)
    );

    // Row 3: Advanced Management (admin only)
    if (isAdmin) {
      container.components.push({
        type: 10, content: '> **`⚙️ Advanced Management`**'
      });
      container.components.push(
        buildCategoryRow(ROW3_BUTTONS, targetMember.id, activeButton)
      );
    }

    // ── Hot-swap Select Area ─────────────────────────────────────────
    container.components.push({ type: 14 });
    const selectArea = await buildCardSelect(
      activeButton, targetMember, playerData, safariData, guildId, client, guild, isAdmin
    );
    if (selectArea) container.components.push(selectArea);

  } else if (isAdmin) {
    // ── No player selected state ─────────────────────────────────────
    container.components.push({ type: 14 });
    container.components.push({ type: 10, content: '> **`✏️ Castlists & Profile`**' });
    container.components.push(buildCategoryRow(ROW1_BUTTONS, null, null, true));
    container.components.push({ type: 10, content: '> **`🦁 Safari & Gameplay`**' });
    container.components.push(buildCategoryRow(ROW2_BUTTONS, null, null, true));
    container.components.push({ type: 10, content: '> **`⚙️ Advanced Management`**' });
    container.components.push(buildCategoryRow(ROW3_BUTTONS, null, null, true));
    container.components.push({ type: 14 });
    container.components.push(buildDisabledSelect('Select a player first...'));
  }

  // ── Back Button ────────────────────────────────────────────────────────
  container.components.push({
    type: 1,
    components: [{
      type: 2,
      custom_id: 'reeces_stuff',
      label: "← Reece's Stuff",
      style: 2
    }]
  });

  // Validate component count
  const count = countComponents([container], { enableLogging: false });
  console.log(`📊 Player Card Menu: ${count}/40 components (active: ${activeButton || 'none'})`);

  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [container]
  };
}

// ════════════════════════════════════════════════════════════════════════════
// HOT-SWAP SELECT BUILDER
// ════════════════════════════════════════════════════════════════════════════

async function buildCardSelect(activeButton, targetMember, playerData, safariData, guildId, client, guild, isAdmin) {
  if (!activeButton || !targetMember) {
    return buildDisabledSelect('Click a button above to explore...');
  }

  const targetId = targetMember.id;
  const customId = `pcard_sel_${activeButton}_${targetId}`;
  const safari = playerData[guildId]?.players?.[targetId]?.safari;
  const customTerms = await getCustomTerms(guildId);

  switch (activeButton) {

    // ── ROW 1: Castlists & Profile ─────────────────────────────────────

    case 'castlists': {
      const { allCastlists } = await extractCastlistData(playerData, guildId);
      if (!allCastlists || allCastlists.size === 0) {
        return buildDisabledSelect('No castlists configured');
      }
      const options = [];
      for (const [id, castlist] of allCastlists) {
        const emoji = castlist?.metadata?.emoji || '📋';
        options.push({
          label: (id === 'default' ? 'Default Castlist' : (castlist.name || id)).slice(0, 100),
          value: id.slice(0, 100),
          description: id === 'default' ? 'Main castlist' : (castlist.isVirtual ? 'Legacy castlist' : 'Custom castlist'),
          emoji: { name: typeof emoji === 'string' ? emoji : '📋' }
        });
        if (options.length >= 23) break;
      }
      return wrapSelect(customId, 'Click a castlist to show...', options);
    }

    case 'pronouns': {
      const pronounRoleIds = await getGuildPronouns(guildId);
      if (!pronounRoleIds || pronounRoleIds.length === 0) {
        return buildDisabledSelect('No pronouns configured — use Tools → Reaction Roles');
      }
      const pronounRoles = [];
      for (const roleId of pronounRoleIds.slice(0, 25)) {
        try {
          const role = await guild.roles.fetch(roleId);
          if (role) pronounRoles.push(role);
        } catch (e) { /* skip invalid roles */ }
      }
      if (pronounRoles.length === 0) return buildDisabledSelect('No valid pronoun roles found');

      const currentPronouns = targetMember.roles.cache
        .filter(role => pronounRoleIds.includes(role.id))
        .map(role => role.id);

      return {
        type: 1,
        components: [{
          type: 3, // String Select
          custom_id: customId,
          placeholder: currentPronouns.length > 0
            ? `Current: ${targetMember.roles.cache.filter(r => currentPronouns.includes(r.id)).map(r => r.name).join(', ')}`
            : 'Select pronouns',
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

    case 'timezone': {
      const timezones = await getGuildTimezones(guildId);
      const tzEntries = Object.entries(timezones || {});
      if (tzEntries.length === 0) {
        return buildDisabledSelect('No timezones configured — use Tools → Reaction Roles');
      }

      // Load DST state for descriptions
      let dstState = {};
      try {
        const { loadDSTState } = await import('./storage.js');
        dstState = await loadDSTState() || {};
      } catch (e) { /* fallback to offset-only */ }

      const timezoneRoles = [];
      for (const [roleId, data] of tzEntries.slice(0, 25)) {
        try {
          const role = await guild.roles.fetch(roleId);
          if (role) timezoneRoles.push({ role, offset: data.offset, data });
        } catch (e) { /* skip */ }
      }
      if (timezoneRoles.length === 0) return buildDisabledSelect('No valid timezone roles found');

      timezoneRoles.sort((a, b) => a.offset - b.offset);
      const currentTz = targetMember.roles.cache
        .find(role => Object.keys(timezones).includes(role.id));

      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: customId,
          placeholder: currentTz ? `Current: ${currentTz.name}` : 'Select timezone',
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
              default: currentTz?.id === role.id
            };
          })
        }]
      };
    }

    case 'age': {
      const currentAge = playerData[guildId]?.players?.[targetId]?.age;
      const ageOptions = [];
      for (let a = 16; a <= 39; a++) {
        ageOptions.push({
          label: a.toString(),
          value: `age_${a}`,
          description: `${a} years old`
        });
      }
      ageOptions.push({
        label: 'Custom Age',
        value: 'age_custom',
        description: "Age not shown or '30s' style age",
        emoji: { name: '✏️' }
      });
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

    case 'logs': {
      // Info display — activity logging placeholder
      const player = playerData[guildId]?.players?.[targetId] || {};
      const hasAge = player.age ? `🎂 Age: ${player.age}` : '🎂 Age: Not set';
      const hasSafari = safari ? '🦁 Safari: Initialized' : '🦁 Safari: Not initialized';
      const vanityCount = (player.vanityRoles || []).length;
      return {
        type: 10,
        content: `📜 **Player Profile Summary**\n${hasAge} **|** ${hasSafari} **|** 🎭 Vanity Roles: ${vanityCount}\n\n*Detailed activity log — coming soon*`
      };
    }

    // ── ROW 2: Safari & Gameplay ───────────────────────────────────────

    case 'inventory': {
      if (!safari || !safari.inventory) {
        return {
          type: 10,
          content: `🎒 **${customTerms?.inventoryName || 'Inventory'}**\n*Player not initialized in Safari system*`
        };
      }
      const items = safari.inventory;
      const entries = Object.entries(items);
      if (entries.length === 0) {
        return {
          type: 10,
          content: `🎒 **${customTerms?.inventoryName || 'Inventory'}** — Empty`
        };
      }
      // Load item definitions for names
      const allItems = safariData[guildId]?.items || {};
      const lines = entries.slice(0, 15).map(([itemId, data]) => {
        const def = allItems[itemId];
        const name = def?.name || itemId;
        const emoji = def?.emoji || '📦';
        const qty = typeof data === 'object' ? (data.count ?? data.quantity ?? 1) : data;
        return `${emoji} ${name} ×${qty}`;
      });
      const more = entries.length > 15 ? `\n*...and ${entries.length - 15} more items*` : '';
      return {
        type: 10,
        content: `🎒 **${customTerms?.inventoryName || 'Inventory'}** (${entries.length} items)\n${lines.join(' **|** ')}${more}`
      };
    }

    case 'crafting': {
      const allButtons = safariData[guildId]?.buttons || {};
      const craftingActions = Object.entries(allButtons)
        .filter(([, action]) => {
          const vis = action.menuVisibility || 'none';
          return vis === 'crafting_menu' && action.trigger?.type === 'button';
        })
        .map(([id, action]) => ({ id, ...action }))
        .sort((a, b) => (a.inventoryConfig?.sortOrder ?? 999) - (b.inventoryConfig?.sortOrder ?? 999));

      if (craftingActions.length === 0) {
        return buildDisabledSelect('No crafting recipes configured');
      }
      const options = craftingActions.slice(0, 23).map(action => ({
        label: (action.inventoryConfig?.buttonLabel || action.trigger?.button?.label || action.name || 'Recipe').slice(0, 100),
        value: action.id.slice(0, 100),
        description: (action.description || 'Crafting recipe').slice(0, 100),
        emoji: { name: action.inventoryConfig?.buttonEmoji || action.trigger?.button?.emoji || '🛠️' }
      }));
      return wrapSelect(customId, 'Select a recipe to craft...', options);
    }

    case 'actions': {
      const allButtons = safariData[guildId]?.buttons || {};
      const menuActions = Object.entries(allButtons)
        .filter(([, action]) => {
          const vis = action.menuVisibility || (action.showInInventory ? 'player_menu' : 'none');
          return vis === 'player_menu' && action.trigger?.type === 'button';
        })
        .map(([id, action]) => ({ id, ...action }))
        .sort((a, b) => (a.inventoryConfig?.sortOrder ?? 999) - (b.inventoryConfig?.sortOrder ?? 999));

      if (menuActions.length === 0) {
        return buildDisabledSelect('No global actions configured');
      }
      const options = menuActions.slice(0, 23).map(action => ({
        label: (action.inventoryConfig?.buttonLabel || action.trigger?.button?.label || action.name || 'Action').slice(0, 100),
        value: action.id.slice(0, 100),
        description: (action.description || 'Player action').slice(0, 100),
        emoji: { name: action.inventoryConfig?.buttonEmoji || action.trigger?.button?.emoji || '⚡' }
      }));
      return wrapSelect(customId, 'Click a global action...', options);
    }

    case 'stores': {
      const globalStoreIds = (safariData[guildId]?.globalStores || []).slice(0, 23);
      const stores = safariData[guildId]?.stores || {};
      if (globalStoreIds.length === 0) {
        return buildDisabledSelect('No global stores configured');
      }
      const options = [];
      for (const storeId of globalStoreIds) {
        const store = stores[storeId];
        if (!store) continue;
        const itemCount = Object.keys(store.items || {}).length;
        options.push({
          label: (store.name || storeId).slice(0, 100),
          value: storeId.slice(0, 100),
          description: `${itemCount} items available`,
          emoji: { name: store.emoji || '🏪' }
        });
      }
      if (options.length === 0) return buildDisabledSelect('No valid stores found');
      return wrapSelect(customId, 'Select a global store...', options);
    }

    case 'commands': {
      const allButtons = safariData[guildId]?.buttons || {};
      const commandActions = Object.entries(allButtons)
        .filter(([, action]) => action.trigger?.type === 'command');

      if (commandActions.length === 0) {
        return {
          type: 10,
          content: '🕹️ **Player Commands**\n*No player commands configured*'
        };
      }
      const lines = commandActions.slice(0, 10).map(([id, action]) => {
        const cmd = action.trigger?.command?.keyword || id;
        const desc = action.description || action.name || 'Command';
        return `\`${cmd}\` — ${desc}`;
      });
      return {
        type: 10,
        content: `🕹️ **Player Commands** (${commandActions.length})\n${lines.join('\n')}`
      };
    }

    // ── ROW 3: Advanced Management (admin only) ────────────────────────

    case 'safari': {
      if (!isAdmin) return buildDisabledSelect('Admin only');
      const isInitialized = safari && (
        safari.currency !== undefined ||
        safari.inventory !== undefined ||
        safari.points !== undefined
      );
      const isPaused = safari?.isPaused;

      const options = [];
      if (!isInitialized) {
        options.push({
          label: 'Initialize Player',
          value: 'init',
          description: 'Set up Safari data for this player',
          emoji: { name: '🚀' }
        });
      } else {
        options.push({
          label: isPaused ? 'Unpause Player' : 'Pause Player',
          value: isPaused ? 'unpause' : 'pause',
          description: isPaused ? 'Resume Safari participation' : 'Temporarily pause Safari participation',
          emoji: { name: isPaused ? '▶️' : '⏸️' }
        });
        options.push({
          label: 'De-initialize Player',
          value: 'deinit',
          description: 'Remove all Safari data for this player',
          emoji: { name: '❌' }
        });
      }
      options.push({
        label: 'Starting Info',
        value: 'starting_info',
        description: 'Configure starting currency, items, location',
        emoji: { name: '🚩' }
      });

      const stateLabel = !isInitialized ? 'Not Initialized'
        : isPaused ? 'Paused'
        : 'Active';

      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: customId,
          placeholder: `Safari State: ${stateLabel}`,
          min_values: 0,
          max_values: 1,
          options
        }]
      };
    }

    case 'currency': {
      if (!isAdmin) return buildDisabledSelect('Admin only');
      const currName = customTerms?.currencyName || 'Currency';
      const currEmoji = customTerms?.currencyEmoji || '💰';
      const amount = safari?.currency ?? 0;
      const defaultAmount = customTerms?.defaultStartingCurrencyValue ?? 0;

      return {
        type: 10,
        content: `${currEmoji} **${currName} Management**\n**Current Balance:** ${amount} ${currEmoji}\n**Server Default:** ${defaultAmount} ${currEmoji}\n\n*Use Player Admin (🧭) to edit currency*`
      };
    }

    case 'stats': {
      if (!isAdmin) return buildDisabledSelect('Admin only');
      const definitions = await getAttributeDefinitions(guildId);
      const attrEntries = Object.entries(definitions);

      if (attrEntries.length === 0) {
        return buildDisabledSelect('No attributes configured — use Tools → Attributes');
      }

      // Add stamina as first option if player has stamina
      const options = [];
      if (safari?.points?.stamina) {
        const st = safari.points.stamina;
        options.push({
          label: 'Stamina',
          value: 'stamina',
          description: `${st.current ?? 0}/${st.maximum ?? 0} — Regeneration & limits`,
          emoji: { name: '⚡' }
        });
      }

      for (const [id, attr] of attrEntries.slice(0, 24)) {
        const isResource = attr.category === 'resource';
        options.push({
          label: attr.name,
          value: id,
          description: `${isResource ? 'Resource' : 'Stat'} — Click to modify`,
          emoji: { name: attr.emoji || '📊' }
        });
      }

      return {
        type: 1,
        components: [{
          type: 3,
          custom_id: customId,
          placeholder: 'Select an attribute to modify',
          min_values: 1,
          max_values: 1,
          options: options.slice(0, 25)
        }]
      };
    }

    case 'location': {
      if (!isAdmin) return buildDisabledSelect('Admin only');
      const activeMapId = safariData[guildId]?.maps?.active;
      const mapProgress = safari?.mapProgress?.[activeMapId];

      const lines = [];
      if (!safari) {
        lines.push('*Player not initialized in Safari system*');
      } else if (!activeMapId) {
        lines.push('*No active map configured*');
      } else if (!mapProgress?.currentLocation) {
        lines.push('*Player not placed on map*');
      } else {
        lines.push(`**Current Location:** ${mapProgress.currentLocation}`);
        const explored = mapProgress.exploredCoordinates?.length || 0;
        lines.push(`**Explored Cells:** ${explored}`);
        const lastMove = mapProgress.movementHistory?.slice(-1)[0];
        if (lastMove) {
          const moveTime = new Date(lastMove.timestamp).toLocaleString();
          lines.push(`**Last Move:** ${lastMove.from} → ${lastMove.to} (${moveTime})`);
        }
      }

      // Starting location
      const { getStaminaConfig } = await import('./safariManager.js');
      const staminaConfig = await getStaminaConfig(guildId);
      const serverDefault = staminaConfig?.defaultStartingCoordinate || 'A1';
      const playerStart = mapProgress?.startingLocation;
      const startDisplay = playerStart
        ? `${playerStart} (player-specific)`
        : `${serverDefault} (server default)`;
      lines.push(`**Starting Location:** ${startDisplay}`);

      return {
        type: 10,
        content: `📍 **Location Management**\n${lines.join('\n')}\n\n*Use Player Admin (🧭) to move player*`
      };
    }

    case 'vanity': {
      if (!isAdmin) return buildDisabledSelect('Admin only');
      const currentVanityRoles = playerData[guildId]?.players?.[targetId]?.vanityRoles || [];
      return {
        type: 1,
        components: [{
          type: 6, // Role Select
          custom_id: customId,
          placeholder: currentVanityRoles.length > 0
            ? `${currentVanityRoles.length} vanity role(s) assigned`
            : 'Select vanity roles',
          min_values: 0,
          max_values: 25,
          default_values: currentVanityRoles.map(id => ({ id, type: 'role' }))
        }]
      };
    }

    default:
      return buildDisabledSelect('Click a button above to explore...');
  }
}

/**
 * Wrap options in a StringSelect ActionRow
 */
function wrapSelect(customId, placeholder, options) {
  return {
    type: 1, // ActionRow
    components: [{
      type: 3, // String Select
      custom_id: customId,
      placeholder,
      min_values: 0,
      max_values: 1,
      options
    }]
  };
}

// ════════════════════════════════════════════════════════════════════════════
// INTERACTION HANDLER
// ════════════════════════════════════════════════════════════════════════════

/**
 * Handle all pcard_ interactions. Called from ButtonHandlerFactory in app.js.
 *
 * @param {Object} context - ButtonHandlerFactory context
 * @returns {Object} Components V2 response data
 */
export async function handlePlayerCardInteraction(context) {
  const { guildId, userId, client, guild, customId, values } = context;

  // ── Entry point ────────────────────────────────────────────────────────
  if (customId === 'pcard_open') {
    return await createPlayerCardUI({
      mode: 'admin',
      guildId,
      userId,
      client,
      guild
    });
  }

  // ── User select ────────────────────────────────────────────────────────
  if (customId === 'pcard_user_select') {
    const selectedId = values?.[0];
    let targetMember = null;
    if (selectedId) {
      targetMember = await guild.members.fetch(selectedId);
    }
    return await createPlayerCardUI({
      mode: 'admin',
      guildId,
      userId,
      targetMember,
      client,
      guild
    });
  }

  // ── Category button click ──────────────────────────────────────────────
  if (customId.startsWith('pcard_btn_')) {
    const rest = customId.replace('pcard_btn_', '');
    const lastUnderscore = rest.lastIndexOf('_');
    const category = rest.substring(0, lastUnderscore);
    const targetUserId = rest.substring(lastUnderscore + 1);

    if (targetUserId === 'pending') {
      // Disabled button clicked — shouldn't happen, but be safe
      return await createPlayerCardUI({
        mode: 'admin',
        guildId,
        userId,
        client,
        guild
      });
    }

    const targetMember = await guild.members.fetch(targetUserId);
    return await createPlayerCardUI({
      mode: 'admin',
      guildId,
      userId,
      targetMember,
      activeButton: category,
      client,
      guild
    });
  }

  // ── Select interaction (mockup — acknowledge only) ─────────────────────
  if (customId.startsWith('pcard_sel_')) {
    const rest = customId.replace('pcard_sel_', '');
    const lastUnderscore = rest.lastIndexOf('_');
    const category = rest.substring(0, lastUnderscore);
    const targetUserId = rest.substring(lastUnderscore + 1);

    const targetMember = await guild.members.fetch(targetUserId);
    return await createPlayerCardUI({
      mode: 'admin',
      guildId,
      userId,
      targetMember,
      activeButton: category,
      client,
      guild
    });
  }

  // ── Fallback ───────────────────────────────────────────────────────────
  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      components: [{ type: 10, content: '❌ Unknown Player Card interaction' }]
    }]
  };
}
