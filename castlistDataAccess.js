// castlistDataAccess.js - Unified Data Access Layer
// Created: Phase 1 of RaP 0982 - CastlistV3 Migration
//
// This module provides the SINGLE SOURCE OF TRUTH for castlist display operations.
// Replaces 3 legacy patterns:
// - getGuildTribes() (direct string matching)
// - determineCastlistToShow() (string scanning)
// - Inline filtering (145 lines in show_castlist2 handler)

import { castlistManager } from './castlistManager.js';
import { loadPlayerData } from './storage.js';

/**
 * Get tribes for a castlist with full Discord member data (HEAVY operation)
 *
 * This is the SINGLE SOURCE OF TRUTH for castlist display operations.
 * ALL entry points (/castlist command, show_castlist2 handler, menus) should use this function.
 *
 * Architecture:
 * 1. Resolve identifier → castlist entity (via Virtual Adapter)
 * 2. Get tribe role IDs (via fixed getTribesUsingCastlist with 3-format support)
 * 3. Enrich with Discord data (roles + members)
 *
 * Handles all 3 castlist identifier formats:
 * - Legacy string: "S2 - Big Bang"
 * - Real ID: "castlist_1762187500959_1331657596087566398"
 * - Virtual ID: "virtual_UzIgLSBCaWcgQmFuZw"
 *
 * @param {string} guildId - Discord guild ID
 * @param {string} castlistIdentifier - String name, real ID, or virtual ID
 * @param {Object} client - Discord.js client for member fetching
 * @returns {Promise<Array>} Fully enriched tribe objects with members
 */
export async function getTribesForCastlist(guildId, castlistIdentifier, client) {
  console.log(`[TRIBES] Fetching tribes for castlist: ${castlistIdentifier}`);

  // ============= STEP 1: Resolve Identifier to Castlist Entity =============
  // Virtual Adapter handles all formats: string, ID, virtual ID
  const castlist = await castlistManager.getCastlist(guildId, castlistIdentifier);

  if (!castlist) {
    console.warn(`[TRIBES] Castlist not found: ${castlistIdentifier}`);
    return [];
  }

  console.log(`[TRIBES] Resolved to castlist: ${castlist.name} (${castlist.id})`);

  // ============= STEP 2: Get Tribe Role IDs =============
  // Delegates to FIXED getTribesUsingCastlist() (now supports all 3 formats)
  const roleIds = await castlistManager.getTribesUsingCastlist(guildId, castlist.id);

  if (roleIds.length === 0) {
    console.log(`[TRIBES] No tribes found for castlist ${castlist.name}`);
    return [];
  }

  console.log(`[TRIBES] Found ${roleIds.length} tribe(s): ${roleIds.join(', ')}`);

  // ============= STEP 3: Enrich with Discord Data =============
  const playerData = await loadPlayerData();
  const guildTribes = playerData[guildId]?.tribes || {};

  // Fetch guild and members in bulk (performance optimization)
  const guild = await client.guilds.fetch(guildId);
  await guild.members.fetch(); // Bulk fetch all members upfront

  const enrichedTribes = [];

  for (const roleId of roleIds) {
    // Validate role ID format
    if (!/^\d{17,19}$/.test(roleId)) {
      console.warn(`[TRIBES] Invalid role ID format: ${roleId}`);
      continue;
    }

    // Get tribe data from playerData
    const tribeData = guildTribes[roleId];
    if (!tribeData) {
      console.warn(`[TRIBES] Tribe data not found for role ${roleId}`);
      continue;
    }

    // Fetch Discord role
    try {
      const role = await guild.roles.fetch(roleId);
      if (!role) {
        console.warn(`[TRIBES] Role ${roleId} not found in Discord`);
        continue;
      }

      // Get members from role
      const members = Array.from(role.members.values());

      // Build enriched tribe object (compatible with existing display engine)
      enrichedTribes.push({
        ...tribeData,           // All playerData tribe fields (emoji, color, etc.)
        roleId,                 // Discord role ID
        name: role.name,        // Discord role name (NOT displayName override)
        members,                // Discord.js Member objects
        memberCount: members.length,
        castlistSettings: castlist.settings, // Link to parent castlist
        castlistId: castlist.id,             // Resolved castlist ID
        guildId                              // Guild context
      });

      console.log(`[TRIBES] Enriched tribe: ${role.name} (${members.length} members)`);

    } catch (error) {
      console.error(`[TRIBES] Error fetching role ${roleId}:`, error.message);
      // Continue processing other tribes even if one fails
    }
  }

  console.log(`[TRIBES] Returning ${enrichedTribes.length} enriched tribe(s)`);
  return enrichedTribes;
}

/**
 * Export the unified data access function
 */
export { getTribesForCastlist as default };
