/**
 * Safe guild member fetching utilities.
 *
 * Discord.js guild.members.fetch({ user: [...ids] }) hangs indefinitely
 * if ANY user in the array has left the guild. These utilities fetch
 * members individually with error handling to gracefully skip departed members.
 */

/**
 * Safely fetch multiple guild members by user ID.
 * Fetches individually to avoid the batch-fetch hang when members have left.
 *
 * @param {Guild} guild - Discord.js Guild object (already fetched)
 * @param {string[]} userIds - Array of user IDs to fetch
 * @param {Object} [options] - Options
 * @param {boolean} [options.silent=false] - Suppress per-member warning logs
 * @returns {Promise<Map<string, GuildMember>>} Map of userId -> GuildMember (only found members)
 */
export async function safeFetchMembers(guild, userIds, options = {}) {
  const { silent = false } = options;
  const members = new Map();

  for (const userId of userIds) {
    try {
      const member = await guild.members.fetch(userId);
      members.set(userId, member);
    } catch (e) {
      if (!silent) {
        console.log(`⚠️ Member ${userId} not in guild (${guild.name}), skipping`);
      }
    }
  }

  return members;
}

/**
 * Safely fetch a single guild member, returning null if not found.
 *
 * @param {Guild} guild - Discord.js Guild object
 * @param {string} userId - User ID to fetch
 * @returns {Promise<GuildMember|null>} The member, or null if not in guild
 */
export async function safeFetchMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch (e) {
    return null;
  }
}

/**
 * Resolve a display name for a user, with guild member fetch fallback.
 * Tries: guild member -> stored playerData fields -> truncated userId.
 *
 * @param {Guild} guild - Discord.js Guild object
 * @param {string} userId - User ID
 * @param {Object} [storedData] - Stored player data with displayName/globalName/username fields
 * @returns {Promise<string>} Best available display name
 */
export async function resolveDisplayName(guild, userId, storedData = {}) {
  const member = await safeFetchMember(guild, userId);
  if (member) {
    return member.displayName || member.user?.globalName || member.user?.username || `Player ${userId.slice(-4)}`;
  }
  return storedData.displayName || storedData.globalName || storedData.username || `Player ${userId.slice(-4)}`;
}
