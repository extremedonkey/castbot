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

### 1. PRIORITY 1 MUST HAVE - Castlist Tribe Sections (Instant Toggle + Visual Display)
**Status**: ✅ Approved for implementation - November 2024
**Effort**: 4-6 hours (Stage 1 implementation)
**Priority**: P1 - Critical UX improvement

---

## Original User Requirements (Verbatim)

> Now, the following Role Select (castlist_tribe_select_*) is used to Add / Edit and Remove tribes to a castlist. Once the user selects a value, it immediately brings up a modal to add or edit the tribe.
>
> However, I'm feeling the UX is very clunky, especially with the need to type "remove" in the modal to remove a tribe.
>
> What I'm considering is:
> * Keep the string select
> * Investigate if it is possible to 'pre-select' [...] such that):
> GIVEN a castlist is selected, pre-select / tick any Roles (associated tribes) with that castlist in the String select
> IF the user selects an existing / ticked role, the handler should immediately remove the tribe
> IF the user selects a new role / tribe, immediately add it to the castlist AND
> Update the castlist_hub_main UI /castlist_select with a section that prints out the Tribe Name AND an 'Edit' accessory that enables the user to Edit the specific tribe (calling the existing tribe editor modal, that has been shifted to the button handler rather than the string select)

**User Decisions:**
1. ✅ Agree with Stage 1 recommendation (pre-selection + Section UI + instant toggle)
2. ✅ Keep instant behavior (no confirmation for remove)
3. ✅ Enforce max 6 tribes limit (safety margin for component budget)
4. ✅ Role Select should allow searching at any time

---

## Feature Overview

**Current UX (Clunky):**
```
User flow:
1. Click "Tribes" button → Role Select appears
2. Select role → Modal opens with 5 fields
3. To ADD: Fill fields → Submit
4. To EDIT: Select same role → Modal opens → Edit → Submit
5. To REMOVE: Select role → Modal → Type "remove" → Submit ❌ CLUNKY!
```

**New UX (Instant & Visual):**
```
User flow:
1. Click "Tribes" button → See all tribes as Section components with Edit buttons
2. Role Select below shows ticked/pre-selected roles (currently on castlist)
3. To ADD: Select new role → ✅ Added instantly
4. To REMOVE: Deselect ticked role → ✅ Removed instantly
5. To EDIT: Click Edit button on tribe section → Modal opens → Edit → Submit
```

**Key Improvements:**
- ✅ **Visual feedback**: See all tribes at a glance with Sections
- ✅ **Instant add/remove**: No modal required for simple operations
- ✅ **Pre-selection**: Discord shows which tribes are assigned (ticked)
- ✅ **Organized layout**: Sections with Edit accessory buttons
- ✅ **Reduced friction**: 3 clicks → 1 click for add/remove

---

## Component Budget Analysis

**Maximum Discord limit**: 40 components per message

**Current Castlist Hub usage** (from user's inventory):
```
1. Container (main wrapper)
2. Castlist Manager Text Display (header)
3. Divider
4. ActionRow for Castlist Select
5. Castlist Select (String Select)
6. Divider
7. Text Display (instructions - 1 or 2)
8. Divider
9. ActionRow for buttons
10-14. Buttons in ActionRow (5 management buttons)
15. Divider
16. ActionRow for Add Tribe
17. Add Tribe Role Select
18. Divider
19. ActionRow for bottom buttons
20-22. Bottom buttons (3)

= 22 components used
= 18 components remaining
```

**New Tribe Sections allocation** (with 6 tribes max):
```
BEFORE Role Select:
- Text Display (instructions): 1 component
- Section (tribe 1): 1 component (includes Edit button accessory)
- Section (tribe 2): 1 component
- Section (tribe 3): 1 component
- Section (tribe 4): 1 component
- Section (tribe 5): 1 component
- Section (tribe 6): 1 component
- Divider (before Role Select): 1 component

= 8 components for 6 tribes
= 10 components remaining (safe margin)
```

**Enforcement**: Role Select `max_values: 6` to prevent exceeding component budget.

---

## Technical Design

### Discord Components V2 Pre-Selection Pattern

**Role Select with default_values** (from ComponentsV2.md):
```javascript
{
  type: 6, // Role Select
  custom_id: `castlist_tribe_select_${castlistId}`,
  placeholder: 'Add or remove tribes...',
  min_values: 0, // ⚠️ CRITICAL: Allows deselecting all (required for remove)
  max_values: 6, // ENFORCED: Component budget safety
  default_values: [ // ✅ Pre-selects currently assigned tribes
    { id: "1380906521084559401", type: "role" },
    { id: "1333822520737927281", type: "role" }
  ]
}
```

**Section with Button Accessory** (working example from castlistV2.js:302-311):
```javascript
{
  type: 9, // Section
  components: [{
    type: 10, // Text Display (EXACTLY ONE - Discord requirement)
    content: "🏕️ **Tribe Name**\n-# Display Name • Color: #FF5733 • Analytics: production"
  }],
  accessory: {
    type: 2, // Button
    custom_id: `tribe_edit_button_${roleId}_${castlistId}`,
    label: "Edit",
    style: 2, // Secondary
    emoji: { name: "✏️" }
  }
}
```

### Toggle Detection Logic with Race Condition Protection

**Interaction Deduplication** (prevents rapid double-clicks):
```javascript
// At top of handler file (module-level)
const recentInteractions = new Map();
const INTERACTION_TIMEOUT = 5000; // 5 seconds

function deduplicateInteraction(guildId, castlistId) {
  const key = `${guildId}_${castlistId}`;
  if (recentInteractions.has(key)) {
    return false; // Duplicate, reject
  }
  recentInteractions.set(key, Date.now());
  setTimeout(() => recentInteractions.delete(key), INTERACTION_TIMEOUT);
  return true; // Allowed
}
```

**Toggle detection with atomic operations**:
```javascript
// Discord sends NEW selection in req.body.data.values
const newlySelectedRoles = context.values || []; // Array of role IDs

// Deduplicate rapid interactions
if (!deduplicateInteraction(context.guildId, castlistId)) {
  console.log(`[CASTLIST] Duplicate interaction detected, ignoring`);
  return; // Silently ignore duplicate
}

// Get PREVIOUS selection from database
const tribesUsingCastlist = await castlistManager.getTribesUsingCastlist(context.guildId, castlistId);
const previouslySelectedRoles = tribesUsingCastlist.map(t => t.roleId);

// Calculate changes
const addedRoles = newlySelectedRoles.filter(r => !previouslySelectedRoles.includes(r));
const removedRoles = previouslySelectedRoles.filter(r => !newlySelectedRoles.includes(r));

// Prepare operations (validate before applying)
const operations = [];
for (const roleId of addedRoles) {
  operations.push({ type: 'add', roleId });
}
for (const roleId of removedRoles) {
  operations.push({ type: 'remove', roleId });
}

// Apply atomically (all-or-nothing)
try {
  for (const op of operations) {
    if (op.type === 'add') {
      const roleInfo = context.resolved?.roles?.[op.roleId];
      await castlistManager.addTribeToCastlist(context.guildId, castlistId, {
        roleId: op.roleId,
        name: roleInfo?.name || 'Unknown Role',
        castlist: castlistId,
        emoji: null,
        color: null,
        displayName: null,
        analyticsName: null
      });
    } else {
      await castlistManager.removeTribeFromCastlist(context.guildId, op.roleId);
    }
  }
} catch (error) {
  console.error(`[CASTLIST] Operation failed:`, error);
  // Note: Individual operations may need rollback in future (requires backup)
  throw error;
}
```

---

## Button ID Parsing Strategy

**⚠️ CRITICAL**: See [RaP 0992](../../RaP/0992_20251005_ButtonIdParsing_TechnicalDebt.md) for why this matters.

### The Problem (from RaP 0992)

CastBot has **46 different button ID parsing patterns** with inconsistent approaches:
- Some parse from START (breaks with underscores in IDs)
- Some parse from END (safer, handles variable-length IDs)
- Some use magic string search (fragile, breaks with unexpected IDs)

**Our button IDs will contain:**
- `roleId`: Discord snowflake (18-19 digits, no underscores)
- `castlistId`: Can contain underscores (e.g., `castlist_1762007922583_1331657596087566398`)

### Recommended Pattern: Pipe Delimiters ✅

**Why pipe delimiters**:
- ✅ No conflicts with Discord snowflakes or castlist IDs (only use `_` and digits)
- ✅ Clean, simple parsing with no ambiguity
- ✅ Handles any variable-length IDs without rejoining arrays
- ✅ Commonly used in Discord bot development

**Button ID format**:
```javascript
// Edit button on tribe section:
`tribe_edit_button|${roleId}|${castlistId}`

// Example:
'tribe_edit_button|1380906521084559401|castlist_1762007922583_1331657596087566398'
                  ↑ roleId              ↑ castlistId (can contain underscores)
```

**Parsing logic**:
```javascript
// ✅ CORRECT - Pipe delimiter makes parsing trivial
const [prefix, roleId, castlistId] = custom_id.split('|');

// Validation
if (prefix !== 'tribe_edit_button') {
  throw new Error(`Invalid button prefix: ${prefix}`);
}
if (!/^\d{17,19}$/.test(roleId)) {
  throw new Error(`Invalid role ID format: ${roleId}`);
}
if (!castlistId || castlistId.length === 0) {
  throw new Error('Missing castlist ID');
}

console.log(`Parsed: roleId=${roleId}, castlistId=${castlistId}`);
```

---

## Working Pattern: Button → Modal → Update Message

**From production logs** (`edit_placement` button flow):

### Step 1: User clicks button
```javascript
// Interaction received:
custom_id: 'edit_placement_391415444084490240_global_castlist_1762007922583_1331657596087566398_0_0_edit'
type: 3 // MESSAGE_COMPONENT (button click)
```

### Step 2: Handler returns MODAL (type 9)
```javascript
return res.send({
  type: 9, // InteractionResponseType.MODAL
  data: {
    custom_id: `save_placement_${playerId}_${namespace}_${castlistId}_${tribeIndex}_${page}_${mode}`,
    title: 'Edit Placement',
    components: [
      {
        type: 18, // Label
        label: 'Placement Value',
        component: {
          type: 4, // Text Input
          custom_id: 'placement_value',
          style: 1, // Short
          value: currentPlacement.toString(),
          required: true
        }
      }
    ]
  }
});
```

### Step 3: User submits modal
```javascript
// Interaction received:
type: 5 // MODAL_SUBMIT
custom_id: 'save_placement_391415444084490240_global_castlist_1762007922583_1331657596087566398_0_0_edit'
data: {
  components: [{
    components: [{
      custom_id: 'placement_value',
      value: '11' // User's input
    }]
  }]
}
```

### Step 4: Handler returns UPDATE_MESSAGE
```javascript
// Save the data
await savePlayerData(playerData);

// Refresh the castlist display
const responseData = await buildCastlist2ResponseData(/* ... */);

// Update the ORIGINAL message
return res.send({
  type: 7, // InteractionResponseType.UPDATE_MESSAGE
  data: responseData // Full Components V2 structure
});
```

**Key observations**:
- ✅ Modal custom_id encodes ALL context needed to refresh UI
- ✅ UPDATE_MESSAGE refreshes the original message (castlist display)
- ✅ No separate "back to menu" button needed - modal submit updates in place
- ✅ User sees updated data immediately (placement changed from 15th → 11th)

---

## Implementation Steps

### Phase 1: Update Castlist Hub UI (castlistHub.js)

**File**: `castlistHub.js:436-464` (Tribes button hot-swap interface)

**Current code**:
```javascript
case CastlistButtonType.ADD_TRIBE:
  // Text Display with instructions
  // Role Select (type 6) with NO default_values
```

**New code**:
```javascript
case CastlistButtonType.ADD_TRIBE:
  // Get tribes currently using this castlist
  const tribesUsingCastlist = await castlistManager.getTribesUsingCastlist(guildId, castlist.id);

  const interfaceComponents = [];

  // Instructions
  interfaceComponents.push({
    type: 10, // Text Display
    content: `### Manage Tribes\n\n✅ **Ticked roles** = Currently on castlist\n` +
             `• **Select new role** → Adds tribe instantly\n` +
             `• **Deselect ticked role** → Removes tribe instantly\n` +
             `• **Click Edit** → Modify tribe settings\n\n` +
             `💡 Any Discord role can become a tribe (max 6)`
  });

  // Component budget safety check (count entire hub, not just interface)
  // Note: countComponents() should recursively count all nested components
  let maxTribeLimit = 6;
  const estimatedTotal = 22 + interfaceComponents.length; // 22 base components + new interface
  if (estimatedTotal > 35) {
    console.warn(`[TRIBES] Component count high: ${estimatedTotal}/40, limiting to 5 tribes`);
    maxTribeLimit = 5; // Reduce limit if approaching budget
  }

  // Section for each existing tribe
  for (const tribe of tribesUsingCastlist) {
    interfaceComponents.push({
      type: 9, // Section
      components: [{
        type: 10, // Text Display
        content: `${tribe.emoji || '🏕️'} **${tribe.displayName || tribe.name}**\n` +
                 `-# ${tribe.color ? `Color: ${tribe.color}` : 'No custom settings'}`
      }],
      accessory: {
        type: 2, // Button
        custom_id: `tribe_edit_button|${tribe.roleId}|${castlist.id}`,
        label: "Edit",
        style: 2, // Secondary
        emoji: { name: "✏️" }
      }
    });
  }

  // Separator before Role Select
  if (tribesUsingCastlist.length > 0) {
    interfaceComponents.push({ type: 14 }); // Separator
  }

  // Role Select with pre-selection
  interfaceComponents.push({
    type: 1, // ActionRow
    components: [{
      type: 6, // Role Select
      custom_id: `castlist_tribe_select_${castlist.id}`,
      placeholder: tribesUsingCastlist.length > 0
        ? 'Add or remove tribes...'
        : 'Select roles to add as tribes...',
      min_values: 0, // CRITICAL: Allow deselecting all
      max_values: 6, // ENFORCED: Component budget limit
      default_values: tribesUsingCastlist.map(tribe => ({
        id: tribe.roleId,
        type: "role"
      }))
    }]
  });

  return interfaceComponents;
```

### Phase 2: Update Role Select Handler (castlistHandlers.js)

**File**: `castlistHandlers.js:572-674`

**Current code**: Opens modal immediately for single selection

**New code**: Detect add/remove, process instantly with deduplication and atomic operations
```javascript
// At top of file - interaction deduplication
const recentInteractions = new Map();
const INTERACTION_TIMEOUT = 5000;

function deduplicateInteraction(guildId, castlistId) {
  const key = `${guildId}_${castlistId}`;
  if (recentInteractions.has(key)) return false;
  recentInteractions.set(key, Date.now());
  setTimeout(() => recentInteractions.delete(key), INTERACTION_TIMEOUT);
  return true;
}

export async function handleCastlistTribeSelect(req, res, client, custom_id) {
  return ButtonHandlerFactory.create({
    id: custom_id,
    updateMessage: true, // ✅ Update message, not modal
    handler: async (context) => {
      const castlistId = custom_id.replace('castlist_tribe_select_', '');
      const newlySelectedRoles = context.values || [];

      // Deduplicate rapid interactions
      if (!deduplicateInteraction(context.guildId, castlistId)) {
        console.log(`[CASTLIST] Duplicate interaction, ignoring`);
        return; // Silently ignore
      }

      console.log(`[CASTLIST] Tribe selection changed for castlist ${castlistId}`);

      // Get previously selected tribes
      const tribesUsingCastlist = await castlistManager.getTribesUsingCastlist(context.guildId, castlistId);
      const previouslySelectedRoles = tribesUsingCastlist.map(t => t.roleId);

      // Calculate changes
      const addedRoles = newlySelectedRoles.filter(r => !previouslySelectedRoles.includes(r));
      const removedRoles = previouslySelectedRoles.filter(r => !newlySelectedRoles.includes(r));

      console.log(`[CASTLIST] Added: ${addedRoles.length}, Removed: ${removedRoles.length}`);

      // Prepare operations (atomic pattern)
      const operations = [];
      for (const roleId of addedRoles) {
        operations.push({ type: 'add', roleId });
      }
      for (const roleId of removedRoles) {
        operations.push({ type: 'remove', roleId });
      }

      // Apply atomically
      try {
        for (const op of operations) {
          if (op.type === 'add') {
            const roleInfo = context.resolved?.roles?.[op.roleId];
            await castlistManager.addTribeToCastlist(context.guildId, castlistId, {
              roleId: op.roleId,
              name: roleInfo?.name || 'Unknown Role',
              castlist: castlistId,
              emoji: null,
              color: null,
              displayName: null,
              analyticsName: null
            });
            console.log(`[CASTLIST] ✅ Added tribe ${roleInfo?.name} (${op.roleId})`);
          } else {
            await castlistManager.removeTribeFromCastlist(context.guildId, op.roleId);
            console.log(`[CASTLIST] ✅ Removed tribe ${op.roleId}`);
          }
        }
      } catch (error) {
        console.error(`[CASTLIST] Operation failed:`, error);
        throw error; // Let ButtonHandlerFactory handle error display
      }

      // Refresh hub with updated tribes
      const hubData = await createCastlistHub(context.guildId, {
        selectedCastlistId: castlistId,
        activeButton: 'add_tribe' // Keep Tribes button active
      });

      return hubData;
    }
  })(req, res, client);
}
```

### Phase 3: Add Edit Button Handler (app.js)

**File**: `app.js` (in button handler section)

**Add new handler**:
```javascript
} else if (custom_id.startsWith('tribe_edit_button|')) {
  // Parse button ID with pipe delimiters
  const [prefix, roleId, castlistId] = custom_id.split('|');

  // Validate
  if (prefix !== 'tribe_edit_button') {
    console.error(`[TRIBE EDIT] Invalid button prefix: ${prefix}`);
    return res.send({
      type: 4,
      data: {
        content: '❌ Error: Invalid button format',
        flags: 64 // Ephemeral
      }
    });
  }

  if (!/^\d{17,19}$/.test(roleId)) {
    console.error(`[TRIBE EDIT] Invalid role ID: ${roleId}`);
    return res.send({
      type: 4,
      data: {
        content: '❌ Error: Invalid role ID',
        flags: 64
      }
    });
  }

  if (!castlistId) {
    console.error(`[TRIBE EDIT] Missing castlist ID`);
    return res.send({
      type: 4,
      data: {
        content: '❌ Error: Missing castlist ID',
        flags: 64
      }
    });
  }

  return ButtonHandlerFactory.create({
    id: custom_id,
    updateMessage: false, // Returns modal, not message update
    handler: async (context) => {
      console.log(`[TRIBE EDIT] Opening editor for role ${roleId}, castlist ${castlistId}`);

      // Load existing tribe data
      const playerData = await loadPlayerData();
      const tribeData = playerData[context.guildId]?.tribes?.[roleId] || {};

      // Get role info
      const guild = await client.guilds.fetch(context.guildId);
      const role = await guild.roles.fetch(roleId);
      const roleName = role?.name || 'Unknown Role';

      // Return modal (NO REMOVE FIELD!)
      return {
        type: 9, // MODAL
        data: {
          custom_id: `tribe_edit_modal|${roleId}|${castlistId}`,
          title: `Edit: ${roleName.substring(0, 30)}`,
          components: [
            {
              type: 18, // Label
              label: 'Tribe Emoji',
              description: 'Unicode or Discord custom emoji',
              component: {
                type: 4, // Text Input
                custom_id: 'tribe_emoji',
                style: 1, // Short
                placeholder: '🔥 or <:custom:123>',
                value: tribeData.emoji || '',
                required: false,
                max_length: 60 // Support custom emojis
              }
            },
            {
              type: 18, // Label
              label: 'Display Name',
              description: 'Override role name in castlist',
              component: {
                type: 4, // Text Input
                custom_id: 'tribe_display_name',
                style: 1, // Short
                placeholder: 'Custom tribe name',
                value: tribeData.displayName || '',
                required: false,
                max_length: 50
              }
            },
            {
              type: 18, // Label
              label: 'Accent Color',
              description: 'Hex color code for tribe styling',
              component: {
                type: 4, // Text Input
                custom_id: 'tribe_color',
                style: 1, // Short
                placeholder: '#FF5733',
                value: tribeData.color || '',
                required: false,
                max_length: 7
              }
            },
            {
              type: 18, // Label
              label: 'Analytics Name',
              description: 'Name for tracking and reports',
              component: {
                type: 4, // Text Input
                custom_id: 'tribe_analytics_name',
                style: 1, // Short
                placeholder: 'Analytics identifier',
                value: tribeData.analyticsName || '',
                required: false,
                max_length: 30
              }
            }
          ]
        }
      };
    }
  })(req, res, client);
}
```

### Phase 4: Update Modal Submit Handler (castlistHandlers.js)

**File**: `castlistHandlers.js` - Existing `tribe_edit_modal_*` handler

**Changes needed**:
1. Remove "remove" field logic (no longer in modal)
2. Save updated tribe data
3. Return to hub with updated UI

```javascript
// In existing handler, REMOVE these lines:
if (values.tribe_remove?.trim().toLowerCase() === 'remove') {
  // Remove tribe logic
}

// Keep the rest (save emoji, displayName, color, analyticsName)
// Return to hub:
const hubData = await createCastlistHub(guildId, {
  selectedCastlistId: castlistId,
  activeButton: 'add_tribe' // Keep Tribes button active
});

return res.send({
  type: 7, // UPDATE_MESSAGE
  data: hubData
});
```

---

## Testing Checklist

### Functional Testing

**Pre-selection**:
- [ ] Tribes button clicked → Role Select shows ticked roles for tribes on castlist
- [ ] Empty castlist → No roles pre-selected
- [ ] Max 6 tribes → All 6 pre-selected
- [ ] Refresh hub → Pre-selection persists correctly

**Add tribe (instant)**:
- [ ] Select new role → Tribe added to castlist immediately
- [ ] Section appears above Role Select with tribe name
- [ ] Role becomes ticked in select menu
- [ ] Hub UI refreshes automatically
- [ ] Can add up to 6 tribes total
- [ ] Attempting to add 7th tribe → Discord prevents (max_values enforced)

**Remove tribe (instant)**:
- [ ] Deselect ticked role → Tribe removed from castlist immediately
- [ ] Section disappears from UI
- [ ] Role becomes unticked in select menu
- [ ] Hub UI refreshes automatically
- [ ] Can remove all tribes (min_values: 0 works)

**Edit tribe**:
- [ ] Click Edit button on tribe section → Modal opens
- [ ] Modal shows current values (emoji, display name, color, analytics name)
- [ ] Submit with changes → Tribe updated, hub refreshes
- [ ] Submit with no changes → No error, hub refreshes
- [ ] Submit with invalid emoji → Validation error (future enhancement)

### Edge Cases

**Component budget**:
- [ ] 6 tribes + all other components < 40 total
- [ ] Adding 6th tribe → Success
- [ ] Attempting 7th tribe → Discord prevents (max_values: 6)
- [ ] Component count logged and verified

**Button ID parsing**:
- [ ] Tribe edit button with castlistId containing underscores → Parses correctly
- [ ] Invalid button format → Error message shown
- [ ] Missing roleId or castlistId → Error message shown

**Data consistency**:
- [ ] Add tribe → `playerData[guildId].tribes[roleId]` created
- [ ] Remove tribe → `playerData[guildId].tribes[roleId]` deleted
- [ ] Edit tribe → Only specified fields updated
- [ ] Multiple rapid clicks → No duplicate tribes created

**Error handling**:
- [ ] Role doesn't exist → Error message shown
- [ ] Castlist doesn't exist → Error message shown
- [ ] Database save failure → Error message, no partial update
- [ ] Modal submit failure → Error message, original state preserved

### UI/UX Validation

**Visual feedback**:
- [ ] Section components display tribe emoji, name, settings clearly
- [ ] Edit button accessory properly aligned
- [ ] Separator between tribes and Role Select
- [ ] Instructions clear and concise
- [ ] Hub refreshes smoothly (no flicker or delay)

**Interaction flow**:
- [ ] Add → Hub updates (< 1 second)
- [ ] Remove → Hub updates (< 1 second)
- [ ] Edit → Modal → Submit → Hub updates (< 2 seconds)
- [ ] No "interaction failed" errors
- [ ] All operations feel instant and responsive

---

## Success Criteria

- ✅ Zero "interaction failed" errors during tribe management
- ✅ Add/remove operations complete in < 1 second
- ✅ Edit modal opens in < 500ms
- ✅ Component count never exceeds 40
- ✅ Button ID parsing never fails for valid IDs
- ✅ All existing castlist features continue working
- ✅ No data loss or corruption during operations
- ✅ User reports improved UX (less friction, more intuitive)

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