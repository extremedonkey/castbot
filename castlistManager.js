/**
 * CastlistManager - Core entity management for castlists
 * Handles CRUD operations and integrates with virtual adapter
 */

import { loadPlayerData, savePlayerData } from './storage.js';
import { castlistVirtualAdapter } from './castlistVirtualAdapter.js';

export class CastlistManager {
  /**
   * Create a new castlist entity
   * @param {string} guildId - The guild ID
   * @param {Object} config - Castlist configuration
   * @returns {Object} The created castlist
   */
  async createCastlist(guildId, config) {
    const playerData = await loadPlayerData();
    
    // Ensure structure exists
    if (!playerData[guildId]) {
      playerData[guildId] = {};
    }
    if (!playerData[guildId].castlistConfigs) {
      playerData[guildId].castlistConfigs = {};
    }
    
    // Generate ID
    // 🔧 FIX: Use type suffix (from config.type or default 'custom'), not createdBy user ID
    // Entity ID format is castlist_{timestamp}_{type} where type = system|legacy|custom
    const id = `castlist_${Date.now()}_${config.type || 'custom'}`;
    
    // Create castlist entity
    const castlist = {
      id,
      name: config.name,
      type: config.type || 'custom',
      seasonId: config.seasonId || null,
      createdAt: Date.now(),
      createdBy: config.createdBy || 'system',
      settings: {
        sortStrategy: config.sortStrategy || 'alphabetical',
        showRankings: config.showRankings !== false,
        maxDisplay: config.maxDisplay || 25,
        visibility: config.visibility || 'public',
        ...config.settings
      },
      metadata: {
        description: config.description || '',
        emoji: config.emoji || '📋',
        ...config.metadata
      }
    };
    
    // Add type-specific defaults
    if (castlist.type === 'alumni_placements') {
      castlist.settings.sortStrategy = 'placements';
      castlist.settings.showRankings = true;
      castlist.metadata.emoji = castlist.metadata.emoji || '🏆';
    } else if (castlist.type === 'winners') {
      castlist.metadata.emoji = castlist.metadata.emoji || '👑';
      castlist.metadata.description = castlist.metadata.description || 'Winners from all seasons';
    }
    
    // Store rankings if provided
    if (config.rankings) {
      castlist.rankings = config.rankings;
    }
    
    // Save to storage
    playerData[guildId].castlistConfigs[id] = castlist;
    await savePlayerData(playerData);
    
    console.log(`[CASTLIST] Created new castlist '${castlist.name}' (${id})`);
    
    return castlist;
  }
  
  /**
   * Get a castlist (handles both real and virtual)
   * @param {string} guildId - The guild ID
   * @param {string} castlistId - The castlist ID
   * @returns {Object|null} The castlist or null
   */
  async getCastlist(guildId, castlistId) {
    // Use virtual adapter to handle both real and virtual
    return await castlistVirtualAdapter.getCastlist(guildId, castlistId);
  }
  
  /**
   * Get all castlists (includes virtual)
   * @param {string} guildId - The guild ID
   * @returns {Map} Map of all castlists
   */
  async getAllCastlists(guildId) {
    return await castlistVirtualAdapter.getAllCastlists(guildId);
  }
  
  /**
   * Update a castlist
   * @param {string} guildId - The guild ID
   * @param {string} castlistId - The castlist ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated castlist
   */
  async updateCastlist(guildId, castlistId, updates) {
    let playerData = await loadPlayerData();

    // Ensure structure exists
    if (!playerData[guildId]) {
      playerData[guildId] = {};
    }
    if (!playerData[guildId].castlistConfigs) {
      playerData[guildId].castlistConfigs = {};
    }

    // Special handling for default castlist - create it if it doesn't exist
    if (castlistId === 'default' && !playerData[guildId].castlistConfigs.default) {
      console.log(`[CASTLIST] Creating real default castlist entity on first edit`);
      // Get virtual default for initial values
      const defaultVirtual = await castlistVirtualAdapter.getCastlist(guildId, 'default');

      // Create the default castlist directly with ID 'default'
      playerData[guildId].castlistConfigs.default = {
        id: 'default',
        name: defaultVirtual?.name || 'Active Castlist',
        type: 'system', // Special type that can't be deleted
        createdAt: Date.now(),
        createdBy: 'system',
        settings: {
          sortStrategy: 'placements',
          showRankings: true,
          maxDisplay: 25,
          visibility: 'public'
        },
        metadata: {
          description: defaultVirtual?.metadata?.description || 'Active season castlist',
          emoji: defaultVirtual?.metadata?.emoji || '📋',
          isDefault: true
        }
      };

      // Save the newly created default
      await savePlayerData(playerData);
      playerData = await loadPlayerData(); // Reload to ensure consistency
    }
    // Validate not virtual (should have been materialized on selection)
    else if (castlistVirtualAdapter.isVirtualId(castlistId)) {
      throw new Error(`[CASTLIST] Virtual ID should have been materialized on selection: ${castlistId}`);
    }

    // Get the real castlist
    const castlist = playerData[guildId]?.castlistConfigs?.[castlistId];
    if (!castlist) {
      throw new Error(`Castlist ${castlistId} not found`);
    }
    
    // Apply updates
    if (updates.name !== undefined) castlist.name = updates.name;
    if (updates.type !== undefined) castlist.type = updates.type;

    // Handle season association
    if (updates.seasonId !== undefined) {
      if (updates.seasonId === null) {
        // Remove season association
        delete castlist.seasonId;
        console.log(`[CASTLIST] Removed season association from '${castlist.name}'`);
      } else {
        // Set season association
        castlist.seasonId = updates.seasonId;

        // Validate season exists (optional logging) - find by seasonId, not configId
        const season = Object.values(playerData[guildId]?.applicationConfigs || {})
          .find(config => config.seasonId === updates.seasonId);
        if (season) {
          console.log(`[CASTLIST] Associated '${castlist.name}' with season '${season.seasonName}'`);
        } else {
          console.warn(`[CASTLIST] Warning: Season ${updates.seasonId} not found for castlist '${castlist.name}'`);
        }
      }
    }
    
    if (updates.settings) {
      castlist.settings = { ...castlist.settings, ...updates.settings };
    }
    
    if (updates.metadata) {
      castlist.metadata = { ...castlist.metadata, ...updates.metadata };
    }
    
    if (updates.rankings !== undefined) {
      castlist.rankings = updates.rankings;
    }
    
    // Update modification time
    castlist.modifiedAt = Date.now();
    castlist.modifiedBy = updates.modifiedBy || 'system';
    
    // Save changes
    await savePlayerData(playerData);
    
    console.log(`[CASTLIST] Updated castlist '${castlist.name}' (${castlistId})`);
    
    return castlist;
  }
  
  /**
   * Delete a castlist
   * @param {string} guildId - The guild ID
   * @param {string} castlistId - The castlist ID
   * @returns {Object} Result with success status and clean count
   */
  async deleteCastlist(guildId, castlistId) {
    const playerData = await loadPlayerData();

    // First get castlist info for logging
    const castlist = await this.getCastlist(guildId, castlistId);
    if (!castlist) {
      return { success: false, error: 'Castlist not found', cleanedCount: 0 };
    }

    // Remove castlist references from tribes (works for both real and virtual)
    const tribes = playerData[guildId]?.tribes || {};
    let cleanedCount = 0;

    for (const [roleId, tribe] of Object.entries(tribes)) {
      if (!tribe) continue; // Skip null/undefined tribe entries

      let isLinked = false;
      let wasInMultipleCastlists = false;

      // Check multi-castlist format (array)
      if (tribe.castlistIds && Array.isArray(tribe.castlistIds)) {
        if (tribe.castlistIds.includes(castlistId)) {
          isLinked = true;

          // Track if tribe was in multiple castlists before removal
          wasInMultipleCastlists = tribe.castlistIds.length > 1;

          // Remove this castlist from the array
          tribe.castlistIds = tribe.castlistIds.filter(id => id !== castlistId);

          // If array is now empty, delete the field
          if (tribe.castlistIds.length === 0) {
            delete tribe.castlistIds;
          } else {
            // Tribe still in other castlists - update legacy castlist field to first remaining
            const firstCastlist = tribe.castlistIds[0];
            if (firstCastlist === 'default') {
              tribe.castlist = 'default';
            } else {
              // Get the name of the first remaining castlist
              const firstCastlistEntity = await this.getCastlist(guildId, firstCastlist);
              if (firstCastlistEntity) {
                tribe.castlist = firstCastlistEntity.name;
              }
            }
          }
        }
      }

      // Check single ID format
      if (!wasInMultipleCastlists && tribe.castlistId === castlistId) {
        isLinked = true;
        delete tribe.castlistId;
      }

      // Check virtual/legacy format
      if (!isLinked && castlistVirtualAdapter.isVirtualId(castlistId)) {
        const legacyName = castlistVirtualAdapter.decodeVirtualId(castlistId);
        if (tribe.castlist === legacyName) {
          isLinked = true;
        }
      }

      // Clean up castlist-related fields if tribe is no longer in ANY castlist
      if (isLinked) {
        if (!tribe.castlistId && !tribe.castlistIds) {
          // Tribe is no longer in any castlist - remove all castlist-related fields
          delete tribe.castlist;     // Legacy string field
          delete tribe.type;         // Legacy type field (alumni_placements, etc.)
          delete tribe.rankings;     // Tribe-level rankings
        }

        cleanedCount++;
      }
    }

    // If virtual castlist, just clean tribe references (no real data to delete)
    if (castlist.isVirtual) {
      await savePlayerData(playerData);
      console.log(`[CASTLIST] Deleted virtual castlist '${castlist.name}' and cleaned ${cleanedCount} tribe references`);
      return { success: true, virtual: true, cleanedCount };
    }

    // Delete real castlist entity
    if (playerData[guildId]?.castlistConfigs?.[castlistId]) {
      delete playerData[guildId].castlistConfigs[castlistId];
    }

    // Save changes
    await savePlayerData(playerData);

    console.log(`[CASTLIST] Deleted castlist '${castlist.name}' (${castlistId}) and cleaned ${cleanedCount} tribe references`);

    return { success: true, virtual: false, cleanedCount };
  }
  
  /**
   * Link a tribe to a castlist (multi-castlist support)
   * @param {string} guildId - The guild ID
   * @param {string} roleId - The role/tribe ID
   * @param {string} castlistId - The castlist ID
   * @returns {boolean} Success status
   */
  async linkTribeToCastlist(guildId, roleId, castlistId) {
    const playerData = await loadPlayerData();

    // Ensure tribe exists
    if (!playerData[guildId]?.tribes?.[roleId]) {
      console.log(`[CASTLIST] Tribe ${roleId} not found`);
      return false;
    }

    // Verify castlist exists (real or virtual)
    const castlist = await this.getCastlist(guildId, castlistId);
    if (!castlist) {
      console.log(`[CASTLIST] Castlist ${castlistId} not found`);
      return false;
    }

    // If virtual, we might want to materialize it
    let finalCastlistId = castlistId;
    if (castlistVirtualAdapter.isVirtualId(castlistId)) {
      // For now, keep as virtual until edited
      // In future, could auto-materialize based on settings
      console.log(`[CASTLIST] Linking tribe to virtual castlist '${castlist.name}'`);
    }

    const tribe = playerData[guildId].tribes[roleId];

    // Initialize castlistIds array if it doesn't exist
    if (!tribe.castlistIds) {
      tribe.castlistIds = [];
    }

    // Add castlist to array if not already present
    if (!tribe.castlistIds.includes(finalCastlistId)) {
      tribe.castlistIds.push(finalCastlistId);
    }

    // Keep the old castlist field for backwards compatibility
    // For default, always use 'default' string
    // For others, use the castlist name
    if (finalCastlistId === 'default' || castlistId === 'default') {
      tribe.castlist = 'default';
    } else {
      tribe.castlist = castlist.name;
    }

    // Save changes
    await savePlayerData(playerData);

    console.log(`[CASTLIST] Linked tribe ${roleId} to castlist '${castlist.name}' (${finalCastlistId})`);

    return true;
  }
  
  /**
   * Unlink a tribe from a specific castlist (multi-castlist support)
   * @param {string} guildId - The guild ID
   * @param {string} roleId - The role/tribe ID
   * @param {string} castlistId - The castlist ID to unlink from (optional, removes all if not specified)
   * @returns {boolean} Success status
   */
  async unlinkTribeFromCastlist(guildId, roleId, castlistId = null) {
    const playerData = await loadPlayerData();

    // Ensure tribe exists
    if (!playerData[guildId]?.tribes?.[roleId]) {
      return false;
    }

    const tribe = playerData[guildId].tribes[roleId];

    if (castlistId) {
      // Handle removal based on format
      let removed = false;

      // First, handle the new array format
      if (tribe.castlistIds && Array.isArray(tribe.castlistIds)) {
        const originalLength = tribe.castlistIds.length;
        tribe.castlistIds = tribe.castlistIds.filter(id => id !== castlistId);
        removed = tribe.castlistIds.length < originalLength;

        // Update or clean up based on remaining castlists
        if (tribe.castlistIds.length > 0) {
          // Update legacy field to first remaining castlist
          const firstCastlist = tribe.castlistIds[0];
          if (firstCastlist === 'default') {
            tribe.castlist = 'default';
          } else {
            // For non-default, might need to get the name
            const firstCastlistEntity = await this.getCastlist(guildId, firstCastlist);
            tribe.castlist = firstCastlistEntity ? firstCastlistEntity.name : firstCastlist;
          }
        } else {
          // No castlists left - clean up
          delete tribe.castlistIds;
          delete tribe.castlist; // Remove castlist entirely when no castlists assigned
        }
      }

      // Handle legacy single ID format
      if (!removed && tribe.castlistId === castlistId) {
        delete tribe.castlistId;
        delete tribe.castlist; // Remove entirely when unlinked
        removed = true;
      }

      // Handle legacy string format (for tribes not yet migrated)
      if (!removed && tribe.castlist === castlistId) {
        console.log(`[CASTLIST] Removing legacy castlist '${castlistId}' from tribe ${roleId}`);
        delete tribe.castlist;
        removed = true;
      }

      if (!removed) {
        console.log(`[CASTLIST] Tribe ${roleId} was not linked to castlist ${castlistId}`);
      }
    } else {
      // Remove all castlist links
      delete tribe.castlistIds;
      delete tribe.castlistId;
      tribe.castlist = 'default';
    }

    // Save changes
    await savePlayerData(playerData);

    console.log(`[CASTLIST] Unlinked tribe ${roleId} from castlist${castlistId ? ` ${castlistId}` : 's'}`);

    return true;
  }
  
  /**
   * Get all tribes using a castlist
   * @param {string} guildId - The guild ID
   * @param {string} castlistId - The castlist ID
   * @returns {Array} Array of role IDs
   */
  async getTribesUsingCastlist(guildId, castlistId) {
    return await castlistVirtualAdapter.getTribesUsingCastlist(guildId, castlistId);
  }
  
  /**
   * Import castlist from season applications
   * @param {string} guildId - The guild ID
   * @param {string} seasonId - The season ID
   * @param {Object} options - Import options
   * @returns {Object} Created castlist
   */
  async importFromSeason(guildId, seasonId, options = {}) {
    const playerData = await loadPlayerData();
    
    // Get season config
    const season = playerData[guildId]?.applicationConfigs?.[seasonId];
    if (!season) {
      throw new Error(`Season ${seasonId} not found`);
    }
    
    // Get accepted applications
    const applications = Object.values(playerData[guildId]?.applications || {})
      .filter(app => app.seasonId === seasonId && app.status === 'accepted');
    
    // Create castlist with members
    const castlist = await this.createCastlist(guildId, {
      name: options.name || `${season.seasonName} Cast`,
      type: options.type || 'season_cast',
      seasonId: seasonId,
      createdBy: options.createdBy,
      description: `Accepted cast members for ${season.seasonName}`,
      emoji: '🎭',
      sortStrategy: options.sortStrategy || 'alphabetical'
    });
    
    // Add member IDs as rankings (for sorting)
    const rankings = {};
    applications.forEach((app, index) => {
      rankings[app.userId] = {
        placement: index + 1,
        applicationId: app.id
      };
    });
    
    // Update castlist with rankings
    await this.updateCastlist(guildId, castlist.id, { rankings });
    
    console.log(`[CASTLIST] Imported ${applications.length} members from season ${season.seasonName}`);
    
    return castlist;
  }
  
  /**
   * Import castlist from Discord role
   * @param {string} guildId - The guild ID
   * @param {string} roleId - The role ID
   * @param {Object} options - Import options
   * @param {Object} guild - Discord guild object
   * @returns {Object} Created castlist
   */
  async importFromRole(guildId, roleId, options = {}, guild) {
    // Get role from Discord
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }
    
    // Create castlist
    const castlist = await this.createCastlist(guildId, {
      name: options.name || role.name,
      type: options.type || 'role_import',
      createdBy: options.createdBy,
      description: `Imported from @${role.name} role`,
      emoji: '👥',
      sortStrategy: options.sortStrategy || 'alphabetical',
      metadata: {
        importedFromRole: roleId,
        importedRoleName: role.name,
        importDate: Date.now()
      }
    });
    
    // Add members as rankings
    const rankings = {};
    let index = 0;
    role.members.forEach(member => {
      rankings[member.id] = {
        placement: ++index,
        importedAt: Date.now()
      };
    });
    
    // Update castlist with rankings
    await this.updateCastlist(guildId, castlist.id, { rankings });
    
    console.log(`[CASTLIST] Imported ${role.members.size} members from role @${role.name}`);
    
    return castlist;
  }
  
  /**
   * Get migration statistics
   * @param {string} guildId - The guild ID
   * @returns {Object} Migration stats
   */
  async getMigrationStats(guildId) {
    return await castlistVirtualAdapter.getMigrationStats(guildId);
  }
  
  /**
   * Search castlists by name
   * @param {string} guildId - The guild ID
   * @param {string} searchTerm - Search term
   * @returns {Array} Matching castlists
   */
  async searchCastlists(guildId, searchTerm) {
    const allCastlists = await this.getAllCastlists(guildId);
    const results = [];
    
    const search = searchTerm.toLowerCase();
    for (const castlist of allCastlists.values()) {
      if (castlist.name.toLowerCase().includes(search) ||
          castlist.metadata?.description?.toLowerCase().includes(search) ||
          castlist.type.includes(search)) {
        results.push(castlist);
      }
    }
    
    return results;
  }
}

// Singleton instance
export const castlistManager = new CastlistManager();