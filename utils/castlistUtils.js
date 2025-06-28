// Castlist utility functions extracted from app.js
// Handles castlist calculations, field generation, and display logic

import { capitalize } from '../utils.js';
import { loadPlayerData, getGuildPronouns, getGuildTimezones, getPlayer } from '../storage.js';

/**
 * Calculate total fields needed for a castlist including spacers
 * @param {Object} guild - Discord guild object
 * @param {string|Object} roleIdOrOption - Role ID or option object containing role ID
 * @param {string} castlistName - Name of the castlist (default: 'default')
 * @returns {number} Total number of fields needed
 */
export async function calculateCastlistFields(guild, roleIdOrOption, castlistName = 'default') {
  try {
    // Extract the actual role ID from the option object if needed
    let roleId;
    if (typeof roleIdOrOption === 'object' && roleIdOrOption.value) {
      roleId = roleIdOrOption.value;
      console.log(`Extracted roleId ${roleId} from roleIdOrOption object`);
    } else {
      roleId = roleIdOrOption;
    }

    const guildData = await loadPlayerData();
    const guildTribes = guildData[guild.id]?.tribes || {};
    
    // Count existing tribes in this castlist (excluding the one being updated)
    const existingTribes = Object.entries(guildTribes)
      .filter(([id, tribe]) => tribe.castlist === castlistName && id !== roleId)
      .map(([id]) => id);
    
    console.log(`Found ${existingTribes.length} existing tribes in castlist "${castlistName}"`);
    
    // Get all members for the new/updated tribe
    const newRole = await guild.roles.fetch(roleId);
    const newRoleMembers = newRole ? newRole.members.size : 0;
    console.log(`New tribe "${newRole?.name}" has ${newRoleMembers} members`);
    
    // Count fields without spacers first
    let fieldsWithoutSpacers = 0;
    
    // Count existing tribes and their members
    for (const tribeId of existingTribes) {
      try {
        const role = await guild.roles.fetch(tribeId);
        if (role) {
          // Header + members
          const memberCount = role.members.size;
          fieldsWithoutSpacers += 1 + memberCount;
          console.log(`Existing tribe ${role.name}: 1 header + ${memberCount} members = ${1 + memberCount} fields`);
        }
      } catch (err) {
        console.warn(`Could not fetch role ${tribeId}:`, err.message);
      }
    }
    
    // Add the new tribe's fields
    fieldsWithoutSpacers += 1 + newRoleMembers;
    console.log(`New tribe ${newRole?.name}: 1 header + ${newRoleMembers} members = ${1 + newRoleMembers} fields`);
    
    // Calculate total number of fields with spacers
    const totalTribes = existingTribes.length + 1;
    const spacerFields = Math.max(0, totalTribes - 1);
    const fieldsWithSpacers = fieldsWithoutSpacers + spacerFields;
    
    console.log(`Fields without spacers: ${fieldsWithoutSpacers}`);
    console.log(`Number of spacers needed: ${spacerFields}`);
    console.log(`Fields with spacers: ${fieldsWithSpacers}`);
    
    // Check if we need to omit spacers to fit within Discord's 25 field limit
    if (fieldsWithSpacers > 25 && fieldsWithoutSpacers <= 25) {
      console.log(`Will need to omit spacers to fit within 25 field limit`);
      // Return fields without spacers (we'll handle spacers in the castlist command)
      return fieldsWithoutSpacers;
    }
    
    // Otherwise return the total count with spacers
    return fieldsWithSpacers;
  } catch (error) {
    console.error('Error calculating castlist fields:', error);
    throw error;
  }
}

/**
 * Create Discord embed fields for members in a tribe
 * @param {Collection} members - Discord members collection
 * @param {Object} guild - Discord guild object
 * @param {Object} tribeData - Tribe data object (optional)
 * @returns {Array} Array of Discord embed field objects
 */
export async function createMemberFields(members, guild, tribeData = null) {
  const fields = [];
  const pronounRoleIDs = await getGuildPronouns(guild.id);
  const timezones = await getGuildTimezones(guild.id);
  
  // Convert members to array for sorting
  const membersArray = Array.from(members.values());
  // Sort members by displayName
  membersArray.sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  for (const member of membersArray) {
    try {
      let pronouns = pronounRoleIDs
        .filter(pronounRoleID => member.roles.cache.has(pronounRoleID))
        .map(pronounRoleID => {
          const role = guild.roles.cache.get(pronounRoleID);
          return role ? role.name : '';
        })
        .filter(name => name !== '')
        .join(', ');

      // Add friendly message if no pronoun roles
      if (!pronouns) {
        pronouns = 'No pronoun roles';
      }

      // Update timezone handling to properly check roleId against timezones
      let timezone = 'No timezone roles';
      let memberTime = Math.floor(Date.now() / 1000);

      // Check member's roles against the timezones object
      for (const [roleId] of member.roles.cache) {
        if (timezones[roleId]) {
          const role = guild.roles.cache.get(roleId);
          timezone = role ? role.name : 'Unknown timezone';
          memberTime = Math.floor(Date.now() / 1000) + (timezones[roleId].offset * 3600);
          break;
        }
      }

      const date = new Date(memberTime * 1000);
      const hours = date.getUTCHours() % 12 || 12;
      const minutes = date.getUTCMinutes().toString().padStart(2, '0');
      const ampm = date.getUTCHours() >= 12 ? 'PM' : 'AM';
      const formattedTime = `\`🕐 ${hours}:${minutes} ${ampm} 🕐\``;

      // Get player data from storage
      const playerData = await getPlayer(guild.id, member.id);
      const age = playerData?.age ? `${playerData.age}` : 'No age set';
      
      // Create name field with emoji if it exists and tribe allows it!
      const shouldShowEmoji = playerData?.emojiCode && (tribeData?.showPlayerEmojis !== false);
      const nameWithEmoji = shouldShowEmoji ? 
        `${playerData.emojiCode} ${capitalize(member.displayName)}` : 
        capitalize(member.displayName);

      let value = `> * ${age}\n> * ${pronouns}\n> * ${timezone}\n> * ${formattedTime}`;
      fields.push({
        name: nameWithEmoji,
        value: value,
        inline: true
      });
    } catch (err) {
      console.error(`Error processing member ${member.displayName}:`, err);
    }
  }
  return fields;
}

/**
 * Determine which castlist to show based on user context
 * @param {string} guildId - Discord guild ID
 * @param {string} userId - Discord user ID
 * @param {string} requestedCastlist - Explicitly requested castlist (optional)
 * @param {Client} client - Discord.js client instance (optional)
 * @returns {string} Name of castlist to display
 */
export async function determineCastlistToShow(guildId, userId, requestedCastlist = null, client = null) {
  const data = await loadPlayerData();
  const tribes = data[guildId]?.tribes || {};
  
  // If specific castlist requested, always use that
  if (requestedCastlist) {
    return requestedCastlist;
  }

  // Get all unique castlists in this guild
  const castlists = new Set(
    Object.values(tribes)
      .filter(tribe => tribe?.castlist)
      .map(tribe => tribe.castlist)
  );

  // If only one castlist exists, use it
  if (castlists.size <= 1) {
    return Array.from(castlists)[0] || 'default';
  }

  // Find which castlists the user appears in
  const userCastlists = new Set();
  
  // If no client provided, fall back to default castlist
  if (!client) {
    return 'default';
  }
  
  for (const [tribeId, tribe] of Object.entries(tribes)) {
    if (!tribe?.castlist) continue;
    
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      if (member.roles.cache.has(tribeId)) {
        userCastlists.add(tribe.castlist);
      }
    } catch (error) {
      console.error(`Error checking user roles for castlist determination:`, error);
      // Continue to next tribe instead of failing entirely
      continue;
    }
  }

  // If user not in any castlist, show default
  if (userCastlists.size === 0) {
    return 'default';
  }

  // If user in exactly one castlist, show that
  if (userCastlists.size === 1) {
    return Array.from(userCastlists)[0];
  }

  // If user in multiple castlists including default, show default
  if (userCastlists.has('default')) {
    return 'default';
  }

  // Otherwise show first alphabetically
  return Array.from(userCastlists).sort()[0];
}

/**
 * Check if spacers should be omitted to fit within Discord's 25 field limit
 * @param {Array} tribes - Array of tribe objects
 * @param {Object} guild - Discord guild object
 * @returns {boolean} True if spacers should be omitted
 */
export async function shouldOmitSpacers(tribes, guild) {
  // Calculate total fields without spacers
  let totalFields = 0;
  let tribeCount = 0;
  
  for (const tribe of tribes) {
    try {
      const tribeRole = await guild.roles.fetch(tribe.roleId);
      if (!tribeRole) continue;
      
      // Add tribe header (1 field)
      totalFields++;
      tribeCount++;
      
      // Get members with this role
      const tribeMembers = guild.members.cache.filter(member => member.roles.cache.has(tribe.roleId));
      totalFields += tribeMembers.size;
    } catch (error) {
      console.error(`Error processing tribe ${tribe.roleId}:`, error);
    }
  }
  
  // Calculate fields with spacers (spacers = tribeCount - 1)
  const totalFieldsWithSpacers = totalFields + (tribeCount - 1);
  
  // Check if removing spacers would help stay within the 25 field limit
  return totalFieldsWithSpacers > 25 && totalFields <= 25;
}