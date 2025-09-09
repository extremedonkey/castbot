/**
 * Castlist Management Hub - Central UI for all castlist operations
 * Following LEAN Menu Design standards
 */

import { ButtonBuilder, StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { ButtonStyle } from 'discord-api-types/v10';
import { castlistManager } from './castlistManager.js';
import { loadPlayerData } from './storage.js';

/**
 * Create the main Castlist Management Hub menu
 * @param {string} guildId - The guild ID
 * @param {Object} options - Menu options
 * @returns {Object} Discord interaction response
 */
export async function createCastlistHub(guildId, options = {}) {
  const {
    mode = 'list', // 'list', 'create', 'edit', 'view'
    selectedCastlistId = null,
    showVirtual = true
  } = options;
  
  // Get all castlists (including virtual)
  const allCastlists = await castlistManager.getAllCastlists(guildId);
  
  // Get migration stats
  const stats = await castlistManager.getMigrationStats(guildId);
  
  // Build components based on mode
  const containerComponents = [];
  
  // Header
  containerComponents.push({
    type: 10, // Text Display
    content: `## 📋 Castlists | Manage All Cast Lists\n-# ${stats.total} castlists (${stats.real} managed, ${stats.virtual} legacy)`
  });
  
  if (mode === 'list') {
    // Build castlist list view
    containerComponents.push({ type: 14 }); // Separator
    
    // Your Castlists section
    containerComponents.push({
      type: 10,
      content: `> **\`📊 Your Castlists\`**`
    });
    
    // Create select menu for castlists
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('castlist_select')
      .setPlaceholder('Select a castlist to manage...')
      .setMinValues(1)
      .setMaxValues(1);
    
    // Sort castlists: real first, then virtual
    const sortedCastlists = [...allCastlists.values()].sort((a, b) => {
      if (a.isVirtual !== b.isVirtual) {
        return a.isVirtual ? 1 : -1; // Real first
      }
      return a.name.localeCompare(b.name);
    });
    
    // Add castlists to select menu (max 25)
    let addedCount = 0;
    for (const castlist of sortedCastlists) {
      if (addedCount >= 25) break;
      
      // Skip virtual if not showing
      if (castlist.isVirtual && !showVirtual) continue;
      
      const emoji = castlist.metadata?.emoji || '📋';
      const label = castlist.isVirtual ? `${castlist.name} [Legacy]` : castlist.name;
      const description = castlist.metadata?.description || 
        (castlist.isVirtual ? 'Legacy castlist - click to upgrade' : 'Managed castlist');
      
      selectMenu.addOptions({
        label: label.substring(0, 100),
        value: castlist.id.substring(0, 100),
        description: description.substring(0, 100),
        emoji: emoji
      });
      
      addedCount++;
    }
    
    // If no castlists, add placeholder
    if (addedCount === 0) {
      selectMenu.addOptions({
        label: 'No castlists found',
        value: 'none',
        description: 'Create your first castlist below'
      });
      selectMenu.setDisabled(true);
    }
    
    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    containerComponents.push(selectRow.toJSON());
    
    // Create New section
    containerComponents.push({ type: 14 }); // Separator
    containerComponents.push({
      type: 10,
      content: `> **\`➕ Create New\`**`
    });
    
    const createButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('castlist_create_season')
          .setLabel('From Season')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎭'),
        new ButtonBuilder()
          .setCustomId('castlist_create_role')
          .setLabel('From Role')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('👥'),
        new ButtonBuilder()
          .setCustomId('castlist_create_custom')
          .setLabel('Custom')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✨'),
        new ButtonBuilder()
          .setCustomId('castlist_import')
          .setLabel('Import')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📥')
      );
    containerComponents.push(createButtons.toJSON());
    
    // Tools section
    containerComponents.push({ type: 14 }); // Separator
    containerComponents.push({
      type: 10,
      content: `> **\`🔧 Tools\`**`
    });
    
    const toolButtons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('castlist_templates')
          .setLabel('Templates')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📑'),
        new ButtonBuilder()
          .setCustomId('castlist_export')
          .setLabel('Export')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📤'),
        new ButtonBuilder()
          .setCustomId('castlist_settings')
          .setLabel('Settings')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚙️'),
        new ButtonBuilder()
          .setCustomId('castlist_migration')
          .setLabel(`Migrate (${stats.virtual})`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄')
          .setDisabled(stats.virtual === 0)
      );
    containerComponents.push(toolButtons.toJSON());
    
  } else if (mode === 'view' && selectedCastlistId) {
    // View specific castlist
    const castlist = await castlistManager.getCastlist(guildId, selectedCastlistId);
    
    if (!castlist) {
      containerComponents.push({
        type: 10,
        content: '❌ Castlist not found'
      });
    } else {
      containerComponents.push({ type: 14 }); // Separator
      
      // Castlist info
      containerComponents.push({
        type: 10,
        content: `> **\`${castlist.metadata?.emoji || '📋'} ${castlist.name}\`**\n` +
          `-# ${castlist.metadata?.description || 'No description'}\n` +
          `-# Type: ${castlist.type} | Created: <t:${Math.floor(castlist.createdAt / 1000)}:R>` +
          (castlist.isVirtual ? '\n-# ⚠️ Legacy castlist - will be upgraded on first edit' : '')
      });
      
      // Get tribes using this castlist
      const tribes = await castlistManager.getTribesUsingCastlist(guildId, selectedCastlistId);
      
      if (tribes.length > 0) {
        containerComponents.push({
          type: 10,
          content: `\n> **\`🏕️ Used by ${tribes.length} tribe${tribes.length !== 1 ? 's' : ''}\`**`
        });
      }
      
      // Settings
      containerComponents.push({ type: 14 }); // Separator
      containerComponents.push({
        type: 10,
        content: `> **\`⚙️ Settings\`**\n` +
          `• Sort Strategy: ${castlist.settings?.sortStrategy || 'alphabetical'}\n` +
          `• Show Rankings: ${castlist.settings?.showRankings ? 'Yes' : 'No'}\n` +
          `• Max Display: ${castlist.settings?.maxDisplay || 25}\n` +
          `• Visibility: ${castlist.settings?.visibility || 'public'}`
      });
      
      // Action buttons
      containerComponents.push({ type: 14 }); // Separator
      const actionButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`castlist_edit_${castlist.id}`)
            .setLabel('Edit')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️')
            .setDisabled(false), // Always allow edit (will materialize if virtual)
          new ButtonBuilder()
            .setCustomId(`castlist_rankings_${castlist.id}`)
            .setLabel('Rankings')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🏆'),
          new ButtonBuilder()
            .setCustomId(`castlist_link_tribe_${castlist.id}`)
            .setLabel('Link Tribe')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🔗'),
          new ButtonBuilder()
            .setCustomId(`castlist_delete_${castlist.id}`)
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(castlist.isVirtual) // Can't delete virtual
        );
      containerComponents.push(actionButtons.toJSON());
    }
  }
  
  // Navigation
  containerComponents.push({ type: 14 }); // Separator
  const navButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('prod_menu_back')
        .setLabel('← Menu')
        .setStyle(ButtonStyle.Secondary)
    );
  
  if (mode !== 'list') {
    navButtons.addComponents(
      new ButtonBuilder()
        .setCustomId('castlist_hub_main')
        .setLabel('← Castlists')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📋')
    );
  }
  
  containerComponents.push(navButtons.toJSON());
  
  // Build container
  const container = {
    type: 17, // Container
    accent_color: 0x9b59b6, // Purple for castlists
    components: containerComponents
  };
  
  return {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [container]
  };
}

/**
 * Create castlist creation wizard
 * @param {string} guildId - The guild ID
 * @param {string} createType - Type of creation (season/role/custom)
 * @returns {Object} Discord interaction response
 */
export async function createCastlistWizard(guildId, createType) {
  const containerComponents = [];
  
  // Header
  const typeEmoji = {
    season: '🎭',
    role: '👥',
    custom: '✨'
  }[createType] || '📋';
  
  const typeTitle = {
    season: 'Create from Season',
    role: 'Import from Role',
    custom: 'Create Custom Castlist'
  }[createType];
  
  containerComponents.push({
    type: 10,
    content: `## ${typeEmoji} ${typeTitle}`
  });
  containerComponents.push({ type: 14 });
  
  if (createType === 'season') {
    // Season selection
    const { createSeasonSelector } = await import('./seasonSelector.js');
    const selector = await createSeasonSelector(guildId, {
      customId: 'castlist_create_season_select',
      placeholder: 'Select a season to import from...',
      includeCreateNew: false
    });
    
    containerComponents.push({
      type: 10,
      content: `> **\`🎭 Select Season\`**\n-# Import accepted applications as castlist members`
    });
    
    const selectorRow = new ActionRowBuilder().addComponents(selector);
    containerComponents.push(selectorRow.toJSON());
    
  } else if (createType === 'role') {
    containerComponents.push({
      type: 10,
      content: `> **\`👥 Select Role\`**\n-# Import all members with this role\n\n⚠️ Role selection coming soon!`
    });
    
  } else if (createType === 'custom') {
    containerComponents.push({
      type: 10,
      content: `> **\`✨ Custom Castlist\`**\n` +
        `Enter details for your custom castlist:\n\n` +
        `• **Name**: Choose a unique name\n` +
        `• **Type**: winners, alumni, custom, etc.\n` +
        `• **Description**: Brief description\n` +
        `• **Sort**: How to order members\n\n` +
        `-# Click 'Create' to open the creation form`
    });
    
    const createButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('castlist_create_custom_form')
          .setLabel('Create Custom')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✨')
      );
    containerComponents.push(createButton.toJSON());
  }
  
  // Navigation
  containerComponents.push({ type: 14 });
  const navButtons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('castlist_hub_main')
        .setLabel('← Cancel')
        .setStyle(ButtonStyle.Secondary)
    );
  containerComponents.push(navButtons.toJSON());
  
  // Build container
  const container = {
    type: 17,
    accent_color: 0x9b59b6,
    components: containerComponents
  };
  
  return {
    flags: (1 << 15),
    components: [container]
  };
}