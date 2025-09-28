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
    const id = `castlist_${Date.now()}_${config.createdBy || 'system'}`;
    
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
    const playerData = await loadPlayerData();
    
    // Check if virtual - if so, materialize first
    if (castlistVirtualAdapter.isVirtualId(castlistId)) {
      console.log(`[CASTLIST] Materializing virtual castlist before update`);
      castlistId = await castlistVirtualAdapter.materializeCastlist(guildId, castlistId);
    }
    
    // Get the real castlist
    const castlist = playerData[guildId]?.castlistConfigs?.[castlistId];
    if (!castlist) {
      throw new Error(`Castlist ${castlistId} not found`);
    }
    
    // Apply updates
    if (updates.name !== undefined) castlist.name = updates.name;
    if (updates.type !== undefined) castlist.type = updates.type;
    if (updates.seasonId !== undefined) castlist.seasonId = updates.seasonId;
    
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
      if (tribe.castlistId === castlistId) {
        delete tribe.castlistId;
        // Keep legacy castlist field for backwards compatibility
        cleanedCount++;
      }
    }

    // If virtual castlist, just clean tribe references (no real data to delete)
    if (castlist.isVirtual) {
      await savePlayerData(playerData);
      console.log(`[CASTLIST] Unlinked virtual castlist '${castlist.name}' from ${cleanedCount} tribes`);
      return { success: true, virtual: true, cleanedCount };
    }

    // Delete real castlist entity
    if (playerData[guildId]?.castlistConfigs?.[castlistId]) {
      delete playerData[guildId].castlistConfigs[castlistId];
    }

    // Save changes
    await savePlayerData(playerData);

    console.log(`[CASTLIST] Deleted castlist '${castlist.name}' (${castlistId}) and unlinked from ${cleanedCount} tribes`);

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

    // Keep the old castlist field for backwards compatibility (set to first castlist)
    tribe.castlist = tribe.castlistIds[0] === 'default' ? 'default' : castlist.name;

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
      // Remove specific castlist from array
      if (tribe.castlistIds && Array.isArray(tribe.castlistIds)) {
        tribe.castlistIds = tribe.castlistIds.filter(id => id !== castlistId);

        // Update legacy castlist field to first remaining castlist
        if (tribe.castlistIds.length > 0) {
          tribe.castlist = tribe.castlistIds[0] === 'default' ? 'default' : tribe.castlistIds[0];
        } else {
          tribe.castlist = 'default';
          delete tribe.castlistIds; // Clean up empty array
        }
      } else if (tribe.castlistId === castlistId) {
        // Single ID format - remove it
        delete tribe.castlistId;
        tribe.castlist = 'default';
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