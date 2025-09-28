/**
 * CastlistVirtualAdapter - Virtualization layer for backwards compatibility
 * Makes old string-based castlists appear as entities without migration
 */

import { loadPlayerData } from './storage.js';

export class CastlistVirtualAdapter {
  /**
   * Get all castlists (real and virtual) for a guild
   * @param {string} guildId - The guild ID
   * @returns {Map} Map of castlist ID to castlist entity
   */
  async getAllCastlists(guildId) {
    const playerData = await loadPlayerData();
    const castlists = new Map();

    // 1. Load REAL castlist entities (new system)
    const realCastlists = playerData[guildId]?.castlistConfigs || {};
    for (const [id, castlist] of Object.entries(realCastlists)) {
      castlists.set(id, { ...castlist, isVirtual: false });
    }

    // 2. Ensure default castlist exists (always first)
    const defaultCastlist = await this.ensureDefaultCastlist(guildId, realCastlists);
    if (!castlists.has('default')) {
      castlists.set('default', defaultCastlist);
    }

    // 3. Scan tribes for string-based castlists (old system)
    const tribes = playerData[guildId]?.tribes || {};
    const virtualCastlists = new Map();

    for (const [roleId, tribe] of Object.entries(tribes)) {
      // Skip if tribe already uses new castlistId or castlistIds
      if (tribe.castlistId || tribe.castlistIds) continue;

      // Skip default castlists (handled separately)
      if (!tribe.castlist || tribe.castlist === 'default') continue;

      // Generate consistent virtual ID from castlist name
      const virtualId = this.generateVirtualId(tribe.castlist);

      if (!virtualCastlists.has(virtualId)) {
        // Create virtual entity that LOOKS real
        virtualCastlists.set(virtualId, {
          id: virtualId,
          name: tribe.castlist,
          type: tribe.type || 'legacy',
          isVirtual: true,  // Flag for special handling
          tribes: [roleId],
          createdAt: Date.now(),
          createdBy: 'legacy_system',
          settings: {
            sortStrategy: tribe.type === 'alumni_placements' ? 'placements' : 'alphabetical',
            showRankings: tribe.type === 'alumni_placements',
            maxDisplay: 25,
            visibility: 'public'
          },
          metadata: {
            description: `Legacy castlist: ${tribe.castlist}`,
            emoji: this.getCastlistEmoji(tribe.castlist, tribe.type)
          }
        });
      } else {
        // Add tribe to existing virtual castlist
        virtualCastlists.get(virtualId).tribes.push(roleId);
      }
    }

    // 4. Merge (skip virtual if real version exists with same name)
    for (const [id, virtualCastlist] of virtualCastlists) {
      const realExists = [...castlists.values()].some(c =>
        c.name === virtualCastlist.name && !c.isVirtual
      );
      if (!realExists) {
        castlists.set(id, virtualCastlist);
      }
    }

    return castlists;
  }

  /**
   * Ensure default castlist exists (virtual or real)
   * @param {string} guildId - The guild ID
   * @param {Object} realCastlists - Real castlist entities
   * @returns {Object} Default castlist entity
   */
  async ensureDefaultCastlist(guildId, realCastlists) {
    // Check if default exists in real castlists
    if (realCastlists.default) {
      return { ...realCastlists.default, isVirtual: false };
    }

    // Create virtual default by scanning tribes
    const playerData = await loadPlayerData();
    const tribes = playerData[guildId]?.tribes || {};
    const defaultTribes = [];

    for (const [roleId, tribe] of Object.entries(tribes)) {
      // Check for multi-castlist format
      if (tribe.castlistIds && tribe.castlistIds.includes('default')) {
        defaultTribes.push(roleId);
        continue;
      }

      // Check for single ID format
      if (tribe.castlistId === 'default') {
        defaultTribes.push(roleId);
        continue;
      }

      // Check for legacy string format
      if (tribe.castlist === 'default') {
        defaultTribes.push(roleId);
      }
    }

    // Create virtual default entity
    return {
      id: 'default',
      name: 'Active Castlist',
      type: 'system',
      isVirtual: true,
      tribes: defaultTribes,
      createdAt: 0, // Beginning of time
      createdBy: 'system',
      settings: {
        sortStrategy: 'alphabetical',
        showRankings: false,
        maxDisplay: 25,
        visibility: 'public'
      },
      metadata: {
        description: 'Select if you don\'t know what you\'re doing. Castlist for active phase of the game.',
        emoji: '📋',
        isDefault: true
      }
    };
  }
  
  /**
   * Get a single castlist (real or virtual)
   * @param {string} guildId - The guild ID
   * @param {string} castlistId - The castlist ID (real or virtual)
   * @returns {Object|null} The castlist entity or null
   */
  async getCastlist(guildId, castlistId) {
    const castlists = await this.getAllCastlists(guildId);
    return castlists.get(castlistId) || null;
  }
  
  /**
   * Generate a consistent virtual ID from castlist name
   * @param {string} castlistName - The castlist name
   * @returns {string} Virtual ID
   */
  generateVirtualId(castlistName) {
    const base64 = Buffer.from(castlistName).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return `virtual_${base64}`;
  }
  
  /**
   * Check if an ID is virtual
   * @param {string} castlistId - The castlist ID
   * @returns {boolean} True if virtual
   */
  isVirtualId(castlistId) {
    return castlistId.startsWith('virtual_');
  }
  
  /**
   * Decode a virtual castlist ID back to the original name
   * @param {string} virtualId - The virtual castlist ID
   * @returns {string} The original castlist name
   */
  decodeVirtualId(virtualId) {
    if (!this.isVirtualId(virtualId)) {
      return virtualId; // Not virtual, return as-is
    }
    
    const base64 = virtualId.replace('virtual_', '');
    // Add back padding if needed
    const paddedBase64 = base64 + '=='.slice(0, (4 - base64.length % 4) % 4);
    // Decode from base64 (reverse the URL-safe replacements)
    const normalBase64 = paddedBase64
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    return Buffer.from(normalBase64, 'base64').toString('utf-8');
  }
  
  /**
   * Get emoji for legacy castlist based on name/type
   * @param {string} name - Castlist name
   * @param {string} type - Castlist type
   * @returns {string} Emoji
   */
  getCastlistEmoji(name, type) {
    // Smart emoji selection based on name patterns
    if (name.toLowerCase().includes('winner')) return '🏆';
    if (name.toLowerCase().includes('alumni')) return '🎓';
    if (name.toLowerCase().includes('jury')) return '⚖️';
    if (name.toLowerCase().includes('merge')) return '🤝';
    if (name.toLowerCase().includes('swap')) return '🔄';
    if (name.toLowerCase().includes('tribe')) return '🏕️';
    if (type === 'alumni_placements') return '🏆';
    return '📋';
  }
  
  /**
   * Materialize a virtual castlist into a real entity
   * @param {string} guildId - The guild ID
   * @param {string} virtualId - The virtual castlist ID
   * @returns {string} The new real castlist ID
   */
  async materializeCastlist(guildId, virtualId) {
    const playerData = await loadPlayerData();
    const virtual = await this.getCastlist(guildId, virtualId);
    
    if (!virtual || !virtual.isVirtual) {
      return virtualId; // Already real or doesn't exist
    }
    
    // Create real entity from virtual
    const realId = `castlist_${Date.now()}_system`;
    const realCastlist = {
      ...virtual,
      id: realId,
      isVirtual: false,
      createdAt: Date.now(),
      createdBy: 'migration',
      metadata: {
        ...virtual.metadata,
        migratedFrom: virtualId,
        migrationDate: Date.now()
      }
    };
    
    // Remove virtual-specific fields
    delete realCastlist.isVirtual;
    delete realCastlist.tribes; // This is computed, not stored
    
    // Save real entity
    if (!playerData[guildId].castlistConfigs) {
      playerData[guildId].castlistConfigs = {};
    }
    playerData[guildId].castlistConfigs[realId] = realCastlist;
    
    // Update tribes to point to real ID
    const tribes = playerData[guildId].tribes || {};
    for (const tribeId of virtual.tribes) {
      if (tribes[tribeId]) {
        tribes[tribeId].castlistId = realId;
        // Keep old string during transition for safety
        // tribes[tribeId].castlist remains unchanged
      }
    }
    
    // Save changes
    const { savePlayerData } = await import('./storage.js');
    await savePlayerData(playerData);
    
    console.log(`[CASTLIST] Materialized virtual castlist '${virtual.name}' to real entity ${realId}`);
    
    return realId;
  }
  
  /**
   * Get all tribes using a castlist
   * @param {string} guildId - The guild ID
   * @param {string} castlistId - The castlist ID (real or virtual)
   * @returns {Array} Array of role IDs
   */
  async getTribesUsingCastlist(guildId, castlistId) {
    const playerData = await loadPlayerData();
    const tribes = playerData[guildId]?.tribes || {};
    const usingTribes = [];

    // Check both castlistId (new) and virtual matching (old)
    for (const [roleId, tribe] of Object.entries(tribes)) {
      // Multi-castlist format (array)
      if (tribe.castlistIds && Array.isArray(tribe.castlistIds)) {
        if (tribe.castlistIds.includes(castlistId)) {
          usingTribes.push(roleId);
          continue;
        }
      }

      // Direct ID match (single ID format)
      if (tribe.castlistId === castlistId) {
        usingTribes.push(roleId);
        continue;
      }

      // Virtual ID matching (old system)
      if (this.isVirtualId(castlistId) && tribe.castlist) {
        const virtualIdForTribe = this.generateVirtualId(tribe.castlist);
        if (virtualIdForTribe === castlistId) {
          usingTribes.push(roleId);
        }
      }

      // Legacy string matching for default
      if (castlistId === 'default' && tribe.castlist === 'default' && !tribe.castlistId && !tribe.castlistIds) {
        usingTribes.push(roleId);
      }
    }

    return usingTribes;
  }
  
  /**
   * Get migration statistics
   * @param {string} guildId - The guild ID
   * @returns {Object} Migration stats
   */
  async getMigrationStats(guildId) {
    const castlists = await this.getAllCastlists(guildId);
    const stats = {
      total: castlists.size,
      real: 0,
      virtual: 0,
      migrated: 0
    };
    
    for (const castlist of castlists.values()) {
      if (castlist.isVirtual) {
        stats.virtual++;
      } else {
        stats.real++;
        if (castlist.metadata?.migratedFrom) {
          stats.migrated++;
        }
      }
    }
    
    stats.migrationProgress = stats.total > 0 
      ? Math.round((stats.real / stats.total) * 100) 
      : 100;
    
    return stats;
  }
}

// Singleton instance
export const castlistVirtualAdapter = new CastlistVirtualAdapter();