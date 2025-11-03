# TribeManager: Unified Tribe Management System

## Overview

**Status**: 🔵 DESIGN PHASE
**Created**: November 2024
**Purpose**: Centralized, atomic tribe management system to replace scattered tribe operations across 15+ handlers

This document outlines the comprehensive design for TribeManager, a foundational service that will enable advanced features like Season Planner and automated Tribe Swaps/Merges.

## Original User Request (Preserved Verbatim)

> So this Select > Modal approach will let us /add/ an emoji to a tribe, but what are our UI/UX @docs/standards/ComponentsV2.md options to remove or edit an emoji for a tribe? How about future other features? What functions / classes currently support management of tribes? Is there a broader need for an atomic management function, or is it already handled (I honestly have no idea and asking your opinion :)) ultrathink

## Requirements Translation

### Immediate Needs
1. **Add/Edit/Remove Emoji**: Single interface for all emoji operations
2. **Atomic Operations**: Ensure data consistency across all tribe modifications
3. **UI/UX Flexibility**: Support various interaction patterns within Discord's constraints

### Discovered Needs (from Research)
1. **Centralized Management**: Currently 15+ separate handlers directly modify tribe data
2. **Validation Consistency**: No unified validation for emojis, colors, or other properties
3. **Transaction Safety**: No rollback or error recovery for failed operations
4. **Bulk Operations**: No support for managing multiple tribes efficiently
5. **Audit Trail**: No tracking of who changed what and when

### Future Feature Support
1. **Season Planner**: Automated tribe generation and role creation
2. **Tribe Swaps/Merges**: Bulk reassignment with history preservation
3. **Cross-Season Analytics**: Track tribe performance across seasons
4. **Template System**: Reusable tribe configurations

## Current State Analysis

### Existing Tribe Operations (Scattered)
```
app.js handlers:
├── prod_add_tribe (18301)
├── prod_add_tribe_role_select (28665)
├── prod_add_tribe_castlist_select
├── prod_clear_tribe
├── prod_view_tribes
├── prod_create_emojis
└── prod_manage_tribes (6502)

castlistHandlers.js:
├── handleCastlistTribeSelect (198)
└── (various castlist tribe operations)

Direct playerData manipulation in:
├── 15+ different locations
├── No validation consistency
└── No error recovery
```

### Data Structure (Current)
```javascript
// In playerData.json
"tribes": {
  "1391142520787832904": {      // Discord Role ID
    "emoji": "🔥",               // Unicode or <:name:id>
    "castlist": "Haszo",         // Legacy string reference
    "castlistId": "castlist_...", // New entity reference
    "type": "alumni_placements",
    "rankings": {},
    "customSort": [],
    "showPlayerEmojis": true,
    "analyticsName": "Production",
    "color": "#2ecc71",
    "displayName": "Custom Name"
  }
}
```

## Proposed Architecture

### Core TribeManager Class

```javascript
// tribeManager.js
import { loadPlayerData, savePlayerData } from './storage.js';
import { validateDiscordEmoji } from './utils/emojiUtils.js';

export class TribeManager {
  constructor() {
    this.validators = {
      emoji: this.validateEmoji.bind(this),
      color: this.validateColor.bind(this),
      displayName: this.validateDisplayName.bind(this)
    };

    this.auditLog = [];
    this.hooks = new Map(); // Event hooks for UI updates
  }

  // ============= CRUD Operations =============

  async createTribe(guildId, roleId, config = {}) {
    const playerData = await loadPlayerData();

    // Validate role exists in Discord
    const guild = await this.getGuild(guildId);
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found in guild`);
    }

    // Check if tribe already exists
    if (playerData[guildId]?.tribes?.[roleId]) {
      throw new Error(`Tribe for role ${roleId} already exists`);
    }

    // Build tribe object with defaults
    const tribe = {
      roleId,
      roleName: role.name, // Cache for display
      emoji: null,
      castlistId: null,
      displayName: null,
      color: null,
      analyticsName: null,
      showPlayerEmojis: true,
      createdAt: Date.now(),
      createdBy: config.createdBy || 'system',
      lastModified: Date.now(),
      ...config
    };

    // Validate all provided fields
    await this.validateTribeData(tribe);

    // Atomic save
    if (!playerData[guildId]) playerData[guildId] = {};
    if (!playerData[guildId].tribes) playerData[guildId].tribes = {};

    playerData[guildId].tribes[roleId] = tribe;
    await savePlayerData(playerData);

    // Audit log
    this.logAction('CREATE', guildId, roleId, config.createdBy, tribe);

    // Emit event for UI updates
    this.emit('tribeCreated', { guildId, roleId, tribe });

    return tribe;
  }

  async updateTribe(guildId, roleId, updates, userId = 'system') {
    const playerData = await loadPlayerData();
    const tribe = playerData[guildId]?.tribes?.[roleId];

    if (!tribe) {
      throw new Error(`Tribe ${roleId} not found in guild ${guildId}`);
    }

    // Store original for rollback
    const original = { ...tribe };

    try {
      // Validate updates
      const validatedUpdates = await this.validateUpdates(updates);

      // Apply updates atomically
      Object.assign(tribe, validatedUpdates, {
        lastModified: Date.now(),
        lastModifiedBy: userId
      });

      await savePlayerData(playerData);

      // Audit log
      this.logAction('UPDATE', guildId, roleId, userId, {
        before: original,
        after: tribe,
        changes: validatedUpdates
      });

      // Emit event
      this.emit('tribeUpdated', { guildId, roleId, tribe, changes: validatedUpdates });

      return tribe;

    } catch (error) {
      // Rollback on error
      playerData[guildId].tribes[roleId] = original;
      await savePlayerData(playerData);
      throw error;
    }
  }

  async deleteTribe(guildId, roleId, userId = 'system') {
    const playerData = await loadPlayerData();
    const tribe = playerData[guildId]?.tribes?.[roleId];

    if (!tribe) {
      throw new Error(`Tribe ${roleId} not found`);
    }

    // Check dependencies
    const dependencies = await this.checkDependencies(guildId, roleId);
    if (dependencies.blocking.length > 0) {
      throw new Error(
        `Cannot delete tribe: Used by ${dependencies.blocking.join(', ')}`
      );
    }

    // Store for audit
    const deletedTribe = { ...tribe };

    // Delete
    delete playerData[guildId].tribes[roleId];
    await savePlayerData(playerData);

    // Audit log
    this.logAction('DELETE', guildId, roleId, userId, deletedTribe);

    // Emit event
    this.emit('tribeDeleted', { guildId, roleId, tribe: deletedTribe });

    return true;
  }

  async getTribe(guildId, roleId) {
    const playerData = await loadPlayerData();
    return playerData[guildId]?.tribes?.[roleId] || null;
  }

  async getAllTribes(guildId) {
    const playerData = await loadPlayerData();
    return playerData[guildId]?.tribes || {};
  }

  // ============= Bulk Operations =============

  async updateMultipleTribes(guildId, updates, userId = 'system') {
    // updates = { roleId1: { emoji: '🔥' }, roleId2: { emoji: '💧' } }
    const results = {
      success: [],
      failed: []
    };

    for (const [roleId, tribeUpdates] of Object.entries(updates)) {
      try {
        const tribe = await this.updateTribe(guildId, roleId, tribeUpdates, userId);
        results.success.push({ roleId, tribe });
      } catch (error) {
        results.failed.push({ roleId, error: error.message });
      }
    }

    return results;
  }

  async clearAllEmojis(guildId, userId = 'system') {
    const tribes = await this.getAllTribes(guildId);
    const updates = {};

    for (const roleId of Object.keys(tribes)) {
      updates[roleId] = { emoji: null };
    }

    return this.updateMultipleTribes(guildId, updates, userId);
  }

  async copyTribeSettings(guildId, sourceRoleId, targetRoleIds, fields = ['emoji', 'color'], userId = 'system') {
    const sourceTribe = await this.getTribe(guildId, sourceRoleId);
    if (!sourceTribe) {
      throw new Error(`Source tribe ${sourceRoleId} not found`);
    }

    const updates = {};
    const settingsToCopy = {};

    for (const field of fields) {
      if (sourceTribe[field] !== undefined) {
        settingsToCopy[field] = sourceTribe[field];
      }
    }

    for (const targetId of targetRoleIds) {
      updates[targetId] = settingsToCopy;
    }

    return this.updateMultipleTribes(guildId, updates, userId);
  }

  // ============= Validation =============

  validateEmoji(emoji) {
    if (!emoji || emoji === '') return null;

    // Custom Discord emoji: <:name:id> or <a:name:id> (animated)
    const customMatch = emoji.match(/^<(a?):(\w{2,32}):(\d{17,19})>$/);
    if (customMatch) {
      return {
        valid: true,
        type: 'custom',
        animated: !!customMatch[1],
        name: customMatch[2],
        id: customMatch[3],
        formatted: emoji
      };
    }

    // Unicode emoji (comprehensive check)
    const trimmed = emoji.trim();
    const unicodeRegex = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F910}-\u{1F96B}\u{1F980}-\u{1F9E0}]/u;

    if (unicodeRegex.test(trimmed) && trimmed.length <= 8) {
      return {
        valid: true,
        type: 'unicode',
        formatted: trimmed
      };
    }

    throw new Error(`Invalid emoji format: ${emoji}. Use Unicode (🔥) or Discord custom (<:name:id>)`);
  }

  validateColor(color) {
    if (!color || color === '') return null;

    const trimmed = color.trim();

    // Hex color validation
    if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
      throw new Error(`Invalid hex color: ${color}. Use format #RRGGBB`);
    }

    return trimmed.toUpperCase();
  }

  validateDisplayName(name) {
    if (!name || name === '') return null;

    const trimmed = name.trim();

    if (trimmed.length > 50) {
      throw new Error('Display name must be 50 characters or less');
    }

    return trimmed;
  }

  async validateTribeData(tribe) {
    const errors = [];

    for (const [field, validator] of Object.entries(this.validators)) {
      if (tribe[field] !== undefined) {
        try {
          const validated = validator(tribe[field]);
          if (validated?.formatted) {
            tribe[field] = validated.formatted;
          } else if (validated !== undefined) {
            tribe[field] = validated;
          }
        } catch (error) {
          errors.push(`${field}: ${error.message}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation failed:\n${errors.join('\n')}`);
    }

    return tribe;
  }

  async validateUpdates(updates) {
    const validated = {};

    for (const [field, value] of Object.entries(updates)) {
      if (this.validators[field]) {
        const result = this.validators[field](value);
        if (result?.formatted) {
          validated[field] = result.formatted;
        } else {
          validated[field] = result;
        }
      } else {
        validated[field] = value;
      }
    }

    return validated;
  }

  // ============= Queries =============

  async findTribesWithEmoji(guildId, emoji) {
    const tribes = await this.getAllTribes(guildId);
    return Object.entries(tribes)
      .filter(([_, tribe]) => tribe.emoji === emoji)
      .map(([roleId, tribe]) => ({ roleId, ...tribe }));
  }

  async findTribesForCastlist(guildId, castlistId) {
    const tribes = await this.getAllTribes(guildId);
    return Object.entries(tribes)
      .filter(([_, tribe]) => tribe.castlistId === castlistId)
      .map(([roleId, tribe]) => ({ roleId, ...tribe }));
  }

  async getTribeStats(guildId) {
    const tribes = await this.getAllTribes(guildId);
    const entries = Object.entries(tribes);

    return {
      total: entries.length,
      withEmoji: entries.filter(([_, t]) => t.emoji).length,
      withCastlist: entries.filter(([_, t]) => t.castlistId).length,
      withCustomName: entries.filter(([_, t]) => t.displayName).length,
      withColor: entries.filter(([_, t]) => t.color).length,
      byType: this.groupByType(tribes),
      recentlyModified: entries
        .filter(([_, t]) => t.lastModified)
        .sort((a, b) => b[1].lastModified - a[1].lastModified)
        .slice(0, 5)
        .map(([roleId, tribe]) => ({ roleId, ...tribe }))
    };
  }

  groupByType(tribes) {
    const grouped = {};
    for (const [roleId, tribe] of Object.entries(tribes)) {
      const type = tribe.type || 'default';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push({ roleId, ...tribe });
    }
    return grouped;
  }

  // ============= Dependencies =============

  async checkDependencies(guildId, roleId) {
    const dependencies = {
      blocking: [],  // Must be resolved before deletion
      warnings: []   // Can be deleted but may have impact
    };

    // Check if tribe has active players
    const guild = await this.getGuild(guildId);
    const role = guild.roles.cache.get(roleId);
    if (role && role.members.size > 0) {
      dependencies.blocking.push(`${role.members.size} active players`);
    }

    // Check castlist usage
    const playerData = await loadPlayerData();
    const tribe = playerData[guildId]?.tribes?.[roleId];
    if (tribe?.castlistId) {
      dependencies.warnings.push(`Linked to castlist ${tribe.castlistId}`);
    }

    // Check safari usage (future)
    // if (await this.checkSafariUsage(guildId, roleId)) {
    //   dependencies.blocking.push('Active in Safari round');
    // }

    return dependencies;
  }

  // ============= Season Planner Support =============

  async generateTribesForSeason(guildId, config) {
    /**
     * config = {
     *   seasonId: 'season_xxx',
     *   playerCount: 20,
     *   tribeCount: 2,
     *   tribeNames: ['Heroes', 'Villains'],
     *   tribeColors: ['#FF0000', '#0000FF'],
     *   tribeEmojis: ['🦸', '🦹'],
     *   autoCreateRoles: true,
     *   autoAssignPlayers: true
     * }
     */

    const results = {
      tribes: [],
      roles: [],
      assignments: []
    };

    // Calculate players per tribe
    const playersPerTribe = Math.ceil(config.playerCount / config.tribeCount);

    for (let i = 0; i < config.tribeCount; i++) {
      const tribeName = config.tribeNames[i] || `Tribe ${i + 1}`;
      const tribeColor = config.tribeColors?.[i] || null;
      const tribeEmoji = config.tribeEmojis?.[i] || null;

      // Create Discord role if requested
      let roleId;
      if (config.autoCreateRoles) {
        const guild = await this.getGuild(guildId);
        const role = await guild.roles.create({
          name: tribeName,
          color: tribeColor ? parseInt(tribeColor.replace('#', ''), 16) : null,
          reason: `Season Planner: ${config.seasonId}`
        });
        roleId = role.id;
        results.roles.push(role);
      }

      // Create tribe entity
      if (roleId) {
        const tribe = await this.createTribe(guildId, roleId, {
          displayName: tribeName,
          color: tribeColor,
          emoji: tribeEmoji,
          castlistId: config.castlistId || 'default',
          seasonId: config.seasonId,
          createdBy: 'season_planner'
        });
        results.tribes.push(tribe);
      }
    }

    return results;
  }

  // ============= Tribe Swap/Merge Support =============

  async performTribeSwap(guildId, config) {
    /**
     * config = {
     *   oldTribes: ['roleId1', 'roleId2'],
     *   newTribes: [
     *     { name: 'Merged Tribe', color: '#800080', emoji: '🎭' }
     *   ],
     *   archiveCastlist: 'custom_castlist_id',
     *   reassignPlayers: true,
     *   randomize: true
     * }
     */

    const transaction = {
      archived: [],
      created: [],
      reassignments: []
    };

    // Start transaction
    const playerData = await loadPlayerData();
    const backup = JSON.parse(JSON.stringify(playerData[guildId].tribes));

    try {
      // 1. Archive old tribes to custom castlist
      if (config.archiveCastlist) {
        for (const oldRoleId of config.oldTribes) {
          const tribe = playerData[guildId].tribes[oldRoleId];
          if (tribe) {
            tribe.castlistId = config.archiveCastlist;
            tribe.archived = true;
            tribe.archivedAt = Date.now();
            transaction.archived.push(oldRoleId);
          }
        }
      }

      // 2. Create new tribe roles
      const guild = await this.getGuild(guildId);
      const newRoles = [];

      for (const newTribe of config.newTribes) {
        const role = await guild.roles.create({
          name: newTribe.name,
          color: newTribe.color ? parseInt(newTribe.color.replace('#', ''), 16) : null,
          reason: 'Tribe Swap/Merge'
        });

        newRoles.push(role);

        // Create tribe entity
        const tribe = await this.createTribe(guildId, role.id, {
          displayName: newTribe.name,
          color: newTribe.color,
          emoji: newTribe.emoji,
          castlistId: 'default',
          createdBy: 'tribe_swap'
        });

        transaction.created.push(tribe);
      }

      // 3. Reassign players if requested
      if (config.reassignPlayers) {
        // Get all players from old tribes
        const allPlayers = [];
        for (const oldRoleId of config.oldTribes) {
          const role = guild.roles.cache.get(oldRoleId);
          if (role) {
            allPlayers.push(...role.members.values());
          }
        }

        // Randomize if requested
        if (config.randomize) {
          this.shuffleArray(allPlayers);
        }

        // Distribute to new tribes
        const playersPerTribe = Math.ceil(allPlayers.length / newRoles.length);

        for (let i = 0; i < newRoles.length; i++) {
          const startIdx = i * playersPerTribe;
          const endIdx = Math.min(startIdx + playersPerTribe, allPlayers.length);
          const tribePlayers = allPlayers.slice(startIdx, endIdx);

          for (const member of tribePlayers) {
            // Remove old tribe roles
            for (const oldRoleId of config.oldTribes) {
              await member.roles.remove(oldRoleId, 'Tribe swap');
            }

            // Add new tribe role
            await member.roles.add(newRoles[i].id, 'Tribe swap');

            transaction.reassignments.push({
              playerId: member.id,
              oldRoles: config.oldTribes,
              newRole: newRoles[i].id
            });
          }
        }
      }

      // 4. Save all changes
      await savePlayerData(playerData);

      // 5. Emit events
      this.emit('tribeSwapCompleted', transaction);

      return transaction;

    } catch (error) {
      // Rollback on error
      playerData[guildId].tribes = backup;
      await savePlayerData(playerData);
      throw error;
    }
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // ============= Event System =============

  on(event, callback) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event).push(callback);
  }

  emit(event, data) {
    if (this.hooks.has(event)) {
      for (const callback of this.hooks.get(event)) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }

  // ============= Audit System =============

  logAction(action, guildId, roleId, userId, data) {
    const entry = {
      timestamp: Date.now(),
      action,
      guildId,
      roleId,
      userId,
      data
    };

    this.auditLog.push(entry);

    // Keep last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    console.log(`[TRIBE] ${action}: Role ${roleId} by ${userId}`);
  }

  getAuditLog(guildId, limit = 50) {
    return this.auditLog
      .filter(entry => entry.guildId === guildId)
      .slice(-limit);
  }

  // ============= Discord Integration =============

  async getGuild(guildId) {
    // This would be injected or passed from the Discord client
    // For now, return a mock or throw
    throw new Error('Guild fetching not implemented - pass guild from handler');
  }
}

// Export singleton instance
export const tribeManager = new TribeManager();
```

## UI/UX Patterns

### Current Select → Modal Pattern (Immediate Implementation)

**Location**: `castlistHandlers.js`

```javascript
// Modified handleCastlistTribeSelect for single-select → modal
export function handleCastlistTribeSelect(req, res, client, custom_id) {
  const parts = custom_id.split('_');
  const castlistId = parts.slice(3).join('_');

  return ButtonHandlerFactory.create({
    id: `castlist_tribe_select_${castlistId}`,
    updateMessage: false, // Allow modal response
    handler: async (context) => {
      const { guildId, values } = context;
      const selectedRoleId = values[0];

      // Load existing tribe data
      const tribe = await tribeManager.getTribe(guildId, selectedRoleId);

      // Return modal for editing
      return {
        type: InteractionResponseType.MODAL,
        data: {
          custom_id: `tribe_edit_modal_${selectedRoleId}_${castlistId}`,
          title: `Edit Tribe Settings`,
          components: [
            // Modal fields as designed
          ]
        }
      };
    }
  })(req, res, client);
}
```

### Future Patterns

1. **Bulk Edit Interface**: Multi-select → action menu
2. **Quick Actions Bar**: Common operations as buttons
3. **Template Selector**: Pre-configured tribe setups
4. **Visual Editor**: Drag-and-drop for tribe swaps

## Integration Points

### With Existing Systems

- **[CastlistV3](../features/CastlistV3.md)**: Tribes linked via `castlistId`
- **[Season Lifecycle](../concepts/SeasonLifecycle.md)**: Tribes tied to active season
- **[Components V2](../standards/ComponentsV2.md)**: All UI follows V2 patterns
- **[ButtonHandlerFactory](../enablers/ButtonHandlerFactory.md)**: Standardized button handling

### With Future Systems

- **Season Planner**: Auto-generate tribes for new seasons
- **Tribe Swaps**: Automated merge/split operations
- **Cast Ranking**: Sort players into tribes via draft
- **Analytics**: Track tribe performance metrics

## Implementation Backlog

### 1. Must Have - Tribe Emoji Editor (Immediate)
**Status**: Ready to implement
**Effort**: 1-2 hours

Tasks:
- [ ] Modify `castlist_tribe_select` to single-select mode
- [ ] Add modal handler for `tribe_edit_modal_*`
- [ ] Implement emoji validation (Unicode + Discord custom)
- [ ] Add fields for display name, color, analytics name
- [ ] Test with various emoji formats
- [ ] Update hub to show success message

### 2. Should Have - TribeManager Core
**Status**: Designed
**Effort**: 1 day

Tasks:
- [ ] Create `tribeManager.js` with CRUD operations
- [ ] Implement validation system
- [ ] Add audit logging
- [ ] Create event system for UI updates
- [ ] Write unit tests
- [ ] Migrate existing handlers to use TribeManager

### 3. Should Have - Season Planner
**Status**: Conceptual
**Effort**: 1 week

Features:
- Specify player count and tribe count
- Auto-calculate distribution
- Generate Discord roles automatically
- Link to Season Manager
- Integration with Castlist system
- "Sort into tribes" via Cast Ranking

Dependencies:
- TribeManager core (required)
- Season Management enhancements
- Role creation permissions

### 4. Should Have - Tribe Swap/Merge
**Status**: Conceptual
**Effort**: 3-5 days

Features:
- Specify new tribe configurations
- Randomize player assignments
- Create archive castlist of old tribes
- Automated role creation and assignment
- Transaction safety with rollback
- History preservation

Dependencies:
- TribeManager core (required)
- Castlist archival system
- Bulk role operations

## Migration Strategy

### Phase 1: Parallel Operation
- Implement TribeManager alongside existing handlers
- New features use TribeManager
- Legacy handlers continue working

### Phase 2: Gradual Migration
- Update handlers one by one to use TribeManager
- Maintain backwards compatibility
- Add deprecation warnings

### Phase 3: Cleanup
- Remove legacy handlers
- Consolidate all tribe operations
- Update documentation

## Success Metrics

- **Code Reduction**: 15+ handlers → 1 manager class
- **Validation Consistency**: 100% of operations validated
- **Error Recovery**: All operations support rollback
- **Performance**: Bulk operations < 1s for 25 tribes
- **User Satisfaction**: Reduced "interaction failed" errors

## Risk Mitigation

### Data Corruption
- Implement transaction pattern with rollback
- Automatic backups before bulk operations
- Validation before any writes

### Discord API Limits
- Batch role operations
- Implement rate limiting
- Queue system for bulk changes

### Backwards Compatibility
- Maintain both `castlist` and `castlistId` fields
- Virtual adapter pattern for legacy data
- Gradual migration with feature flags

## Related Documentation

- **[CastlistV3](../features/CastlistV3.md)**: Castlist system redesign
- **[Components V2](../standards/ComponentsV2.md)**: UI component patterns
- **[Discord Emoji Resource](../standards/DiscordEmojiResource.md)**: Emoji handling
- **[ButtonHandlerFactory](../enablers/ButtonHandlerFactory.md)**: Button patterns
- **[Season Lifecycle](../concepts/SeasonLifecycle.md)**: Season management
- **[Entity Edit Framework](../enablers/EntityEditFramework.md)**: CRUD UI patterns

---

**Next Step**: Implement the tribe emoji editor by modifying the Role Select to trigger a modal (Backlog Item #1)