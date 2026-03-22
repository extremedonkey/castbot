/**
 * Custom Reacts — Generalized Reaction Role Panels
 *
 * Admins define panels (groups of emoji→role mappings), then post them to channels.
 * Players react to self-assign roles.
 *
 * Data: playerData[guildId].customReacts[reactId]
 * Spec: docs/01-RaP/0934_20260322_CustomReacts_Analysis.md
 */

import { loadPlayerData, savePlayerData, saveReactionMapping } from './storage.js';
import { countComponents } from './utils.js';
import { PermissionFlagsBits } from 'discord.js';
import { formatRoleColor, hexToColorInt } from './utils/colorUtils.js';

// ── Constants ──────────────────────────────────────────────────────

const MAX_PANELS = 25;         // Per guild
const MAX_MAPPINGS = 20;       // Per panel (Discord reaction limit)
const MAPPINGS_PER_PAGE = 7;   // String selects per page in detail view

// Dangerous permissions to warn about
const DANGEROUS_PERMS =
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.KickMembers;

// ── Data helpers ───────────────────────────────────────────────────

export function generateReactId(userId) {
  return `cr_${Date.now()}_${userId}`;
}

export async function getCustomReacts(guildId) {
  const pd = await loadPlayerData();
  return pd[guildId]?.customReacts || {};
}

export async function getCustomReact(guildId, reactId) {
  const reacts = await getCustomReacts(guildId);
  return reacts[reactId] || null;
}

export async function saveCustomReact(guildId, reactId, data) {
  const pd = await loadPlayerData();
  if (!pd[guildId]) pd[guildId] = {};
  if (!pd[guildId].customReacts) pd[guildId].customReacts = {};
  pd[guildId].customReacts[reactId] = data;
  await savePlayerData(pd);
}

export async function deleteCustomReact(guildId, reactId) {
  const pd = await loadPlayerData();
  if (pd[guildId]?.customReacts?.[reactId]) {
    delete pd[guildId].customReacts[reactId];
    await savePlayerData(pd);
  }
}

/**
 * Check if a Discord role has dangerous permissions
 * @param {Role} role - Discord.js Role object
 * @returns {{ dangerous: boolean, permNames: string[] }}
 */
export function checkDangerousPermissions(role) {
  const perms = role.permissions.bitfield;
  const found = [];
  if (perms & PermissionFlagsBits.Administrator) found.push('Administrator');
  if (perms & PermissionFlagsBits.ManageRoles) found.push('Manage Roles');
  if (perms & PermissionFlagsBits.ManageChannels) found.push('Manage Channels');
  if (perms & PermissionFlagsBits.ManageGuild) found.push('Manage Server');
  if (perms & PermissionFlagsBits.BanMembers) found.push('Ban Members');
  if (perms & PermissionFlagsBits.KickMembers) found.push('Kick Members');
  return { dangerous: found.length > 0, permNames: found };
}

// ── UI Builders ────────────────────────────────────────────────────

/**
 * Build the Custom Reacts list view (string-select per panel + "Add New")
 */
export async function buildCustomReactsListUI(guildId) {
  const reacts = await getCustomReacts(guildId);
  const panels = Object.entries(reacts);

  const components = [
    { type: 10, content: '## 🧩 Custom Reacts | Reaction Role Panels\n-# Create reaction role panels that players can react to for self-serve roles' },
    { type: 14 },
  ];

  if (panels.length === 0) {
    components.push({ type: 10, content: '-# No custom react panels yet. Create one below!' });
  }

  // Each panel as a StringSelect
  for (const [reactId, panel] of panels) {
    const mappingCount = panel.mappings?.length || 0;
    const emoji = panel.mappings?.[0]?.emoji || '🧩';

    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: `cr_panel_select_${reactId}`,
        options: [
          {
            label: `${panel.name} (${mappingCount} role${mappingCount !== 1 ? 's' : ''})`,
            value: 'summary',
            emoji: { name: emoji },
            default: true
          },
          { label: 'Edit Panel', value: 'edit', emoji: { name: '✏️' } },
          { label: 'Post to Channel', value: 'post', emoji: { name: '📨' } },
          { label: '───────────', value: 'divider', description: ' ' },
          { label: 'Delete Panel', value: 'delete', emoji: { name: '🗑️' } },
        ]
      }]
    });
  }

  // "Add New Panel" button (not a select — keeps it simple)
  if (panels.length < MAX_PANELS) {
    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: 'cr_add_panel',
        placeholder: '➕ Create a new reaction panel...',
        options: [
          { label: 'Create New Panel', value: 'create', emoji: { name: '➕' }, description: 'Name your reaction role panel' },
        ]
      }]
    });
  }

  // Navigation
  components.push({ type: 14 });
  components.push({
    type: 1,
    components: [{
      type: 2,
      custom_id: 'prod_manage_pronouns_timezones',
      label: '← Reaction Roles',
      style: 2
    }]
  });

  const container = {
    type: 17,
    accent_color: 0x9b59b6,
    components
  };

  countComponents([container], { verbosity: 'summary', label: 'Custom Reacts List' });

  return { components: [container] };
}

/**
 * Build the panel detail/editor view (string-select per mapping + "Add")
 */
export async function buildPanelDetailUI(guildId, reactId, guild, page = 0) {
  const panel = await getCustomReact(guildId, reactId);
  if (!panel) {
    return {
      components: [{
        type: 17,
        accent_color: 0xe74c3c,
        components: [
          { type: 10, content: '## ❌ Panel Not Found\n-# This panel may have been deleted.' },
          { type: 14 },
          { type: 1, components: [{ type: 2, custom_id: 'cr_list', label: '← Back', style: 2 }] }
        ]
      }]
    };
  }

  const mappings = panel.mappings || [];
  const totalPages = Math.max(1, Math.ceil(mappings.length / MAPPINGS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const startIdx = currentPage * MAPPINGS_PER_PAGE;
  const pageMappings = mappings.slice(startIdx, startIdx + MAPPINGS_PER_PAGE);

  const components = [
    {
      type: 10,
      content: `## 🧩 ${panel.name} | ${mappings.length} Reaction Role${mappings.length !== 1 ? 's' : ''}${totalPages > 1 ? ` (Page ${currentPage + 1}/${totalPages})` : ''}`
    },
    { type: 14 },
  ];

  if (mappings.length === 0) {
    components.push({ type: 10, content: '-# No reaction roles yet. Add one below!' });
  }

  // Each mapping as a StringSelect
  for (let i = 0; i < pageMappings.length; i++) {
    const mapping = pageMappings[i];
    const globalIdx = startIdx + i;
    const options = [
      {
        label: `${mapping.label}`,
        value: 'summary',
        description: `@${mapping.roleName || 'Unknown Role'}`,
        emoji: { name: mapping.emoji },
        default: true
      },
      { label: 'Edit', value: 'edit', emoji: { name: '✏️' } },
    ];

    // Move up/down (not for first/last)
    if (globalIdx > 0) options.push({ label: 'Move Up', value: 'move_up', emoji: { name: '⬆️' } });
    if (globalIdx < mappings.length - 1) options.push({ label: 'Move Down', value: 'move_down', emoji: { name: '⬇️' } });

    options.push({ label: '───────────', value: 'divider', description: ' ' });
    options.push({ label: 'Remove', value: 'remove', emoji: { name: '🗑️' } });

    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: `cr_mapping_select_${reactId}_${globalIdx}`,
        options
      }]
    });
  }

  // "Add Reaction Role" select (on last page only, if under limit)
  const isLastPage = currentPage === totalPages - 1 || mappings.length === 0;
  if (isLastPage && mappings.length < MAX_MAPPINGS) {
    components.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: `cr_add_mapping_${reactId}`,
        placeholder: '➕ Add a reaction role...',
        options: [
          { label: 'Add Existing Role', value: 'add_existing', emoji: { name: '🏷️' }, description: 'Select a role already in your server' },
          { label: 'Create New Role', value: 'create_role', emoji: { name: '✨' }, description: 'Create a new Discord role and add it' },
        ]
      }]
    });
  }

  // Navigation row
  components.push({ type: 14 });
  const navButtons = [];

  navButtons.push({ type: 2, custom_id: 'cr_list', label: '← Back', style: 2 });

  if (totalPages > 1) {
    navButtons.push({
      type: 2,
      custom_id: `cr_detail_page_${reactId}_${currentPage - 1}`,
      label: '◀',
      style: 2,
      disabled: currentPage === 0
    });
    navButtons.push({
      type: 2,
      custom_id: `cr_detail_page_${reactId}_${currentPage + 1}`,
      label: '▶',
      style: 2,
      disabled: currentPage >= totalPages - 1
    });
  }

  if (mappings.length > 0) {
    navButtons.push({ type: 2, custom_id: `cr_post_channel_${reactId}`, label: 'Post to Channel', style: 1, emoji: { name: '📨' } });
  }

  components.push({ type: 1, components: navButtons });

  const container = {
    type: 17,
    accent_color: 0x9b59b6,
    components
  };

  countComponents([container], { verbosity: 'summary', label: `Custom React Detail: ${panel.name}` });

  return { components: [container] };
}

/**
 * Build the "Add Existing Role" view with a Role Select
 */
export function buildAddExistingRoleUI(reactId) {
  const container = {
    type: 17,
    accent_color: 0x3498db,
    components: [
      { type: 10, content: '## 🏷️ Add Existing Role\n-# Select a Discord role from your server to add as a reaction role' },
      { type: 14 },
      {
        type: 1,
        components: [{
          type: 6, // Role Select
          custom_id: `cr_role_select_${reactId}`,
          placeholder: 'Select a role...',
          min_values: 1,
          max_values: 1
        }]
      },
      { type: 14 },
      {
        type: 1,
        components: [
          { type: 2, custom_id: `cr_detail_page_${reactId}_0`, label: '← Back', style: 2 }
        ]
      }
    ]
  };

  return { components: [container] };
}

/**
 * Build the "Post to Channel" view with a Channel Select
 */
export function buildPostToChannelUI(reactId) {
  const container = {
    type: 17,
    accent_color: 0x27ae60,
    components: [
      { type: 10, content: '## 📨 Post Panel\n-# Select a channel to post the reaction role panel in' },
      { type: 14 },
      {
        type: 1,
        components: [{
          type: 8, // Channel Select
          custom_id: `cr_channel_select_${reactId}`,
          placeholder: 'Select a channel...',
          min_values: 1,
          max_values: 1
        }]
      },
      { type: 14 },
      {
        type: 1,
        components: [
          { type: 2, custom_id: `cr_detail_page_${reactId}_0`, label: '← Back', style: 2 }
        ]
      }
    ]
  };

  return { components: [container] };
}

/**
 * Build the "Dangerous Permission Warning" confirmation screen
 */
export function buildDangerousPermWarningUI(reactId, roleId, roleName, permNames, emoji, label) {
  const container = {
    type: 17,
    accent_color: 0xed4245,
    components: [
      { type: 10, content: `## ⚠️ Dangerous Permission Detected` },
      { type: 14 },
      {
        type: 10,
        content: `**Role:** @${roleName}\n**Permissions:** ${permNames.join(', ')}\n\nThis role has elevated permissions. **Anyone who reacts will receive these permissions.** Only add this role if you are certain.`
      },
      { type: 14 },
      {
        type: 1,
        components: [
          { type: 2, custom_id: `cr_detail_page_${reactId}_0`, label: 'Cancel', style: 2, emoji: { name: '❌' } },
          {
            type: 2,
            custom_id: `cr_confirm_dangerous_${reactId}_${roleId}_${encodeURIComponent(emoji)}_${encodeURIComponent(label)}`,
            label: 'Add Anyway',
            style: 4,
            emoji: { name: '⚠️' }
          }
        ]
      }
    ]
  };

  return { components: [container] };
}

/**
 * Build the delete confirmation screen
 */
export function buildDeleteConfirmUI(reactId, panelName) {
  const container = {
    type: 17,
    accent_color: 0xed4245,
    components: [
      { type: 10, content: `## ⚠️ Delete Panel` },
      { type: 14 },
      {
        type: 10,
        content: `**Panel:** ${panelName}\n\n**This action cannot be undone.** The panel definition will be permanently deleted.\n\nNote: Any already-posted reaction messages will continue to work until they are manually deleted or expire after 30 days.`
      },
      { type: 14 },
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'cr_list', label: 'Cancel', style: 2, emoji: { name: '❌' } },
          { type: 2, custom_id: `cr_delete_confirm_${reactId}`, label: 'Yes, Delete', style: 4, emoji: { name: '🗑️' } }
        ]
      }
    ]
  };

  return { components: [container] };
}

/**
 * Post a custom react panel to a channel as a public reaction message.
 * Adds reactions and saves the mapping for the reaction handler.
 */
export async function postPanelToChannel(guildId, reactId, channelId, client) {
  const panel = await getCustomReact(guildId, reactId);
  if (!panel || !panel.mappings?.length) {
    return { success: false, error: 'Panel has no reaction roles to post.' };
  }

  // Build the public message
  const lines = panel.mappings.map(m => `${m.emoji} — ${m.label}`);
  const container = {
    type: 17,
    accent_color: 0x9b59b6,
    components: [
      { type: 10, content: `## ${panel.name}\n\n${lines.join('\n')}` }
    ]
  };

  try {
    // Post message via REST
    const postResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        components: [container],
        flags: (1 << 15) // IS_COMPONENTS_V2
      })
    });
    const postedMessage = await postResponse.json();

    if (!postedMessage.id) {
      console.error('❌ Failed to post custom react message:', postedMessage);
      return { success: false, error: 'Failed to post message to channel.' };
    }

    const messageId = postedMessage.id;
    console.log(`🧩 Custom react panel "${panel.name}" posted: ${messageId}`);

    // Add reactions with rate limiting
    for (const mapping of panel.mappings) {
      try {
        await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(mapping.emoji)}/@me`,
          {
            method: 'PUT',
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
          }
        );
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        console.error(`❌ Failed to add reaction ${mapping.emoji}:`, error.message);
      }
    }

    // Save reaction mapping with reactId for the handler
    const roleMapping = Object.fromEntries(
      panel.mappings.map(m => [m.emoji, m.roleId])
    );
    roleMapping.reactId = reactId;
    await saveReactionMapping(guildId, messageId, roleMapping);

    // Update in-memory cache
    if (!client.roleReactions) client.roleReactions = new Map();
    client.roleReactions.set(messageId, roleMapping);

    // Track posted message in panel data
    if (!panel.postedMessages) panel.postedMessages = [];
    panel.postedMessages.push(messageId);
    await saveCustomReact(guildId, reactId, panel);

    console.log(`✅ Custom react panel "${panel.name}" setup complete for message ${messageId}`);
    return { success: true, messageId };
  } catch (error) {
    console.error('❌ Error posting custom react panel:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a mapping to a panel
 */
export async function addMappingToPanel(guildId, reactId, mapping) {
  const pd = await loadPlayerData();
  const panel = pd[guildId]?.customReacts?.[reactId];
  if (!panel) return false;
  if (!panel.mappings) panel.mappings = [];
  panel.mappings.push(mapping);
  await savePlayerData(pd);
  return true;
}

/**
 * Remove a mapping from a panel by index
 */
export async function removeMappingFromPanel(guildId, reactId, index) {
  const pd = await loadPlayerData();
  const panel = pd[guildId]?.customReacts?.[reactId];
  if (!panel?.mappings?.[index]) return false;
  panel.mappings.splice(index, 1);
  await savePlayerData(pd);
  return true;
}

/**
 * Swap two mappings in a panel (for move up/down)
 */
export async function swapMappings(guildId, reactId, idxA, idxB) {
  const pd = await loadPlayerData();
  const panel = pd[guildId]?.customReacts?.[reactId];
  if (!panel?.mappings) return false;
  if (idxA < 0 || idxB < 0 || idxA >= panel.mappings.length || idxB >= panel.mappings.length) return false;
  [panel.mappings[idxA], panel.mappings[idxB]] = [panel.mappings[idxB], panel.mappings[idxA]];
  await savePlayerData(pd);
  return true;
}
