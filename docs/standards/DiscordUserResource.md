# Discord User Resource API

## Overview

User management is **fundamental to CastBot's player system** - every Safari participant, cast member, and admin interaction involves user data. Understanding Discord's User API is essential for player management, member fetching, and user profile integration.

CastBot extensively fetches users for Safari participants, manages cast member data, and tracks player information across seasons.

**Source**: [Discord Developer Documentation - User Resource](https://discord.com/developers/docs/resources/user)

## 🚨 CRITICAL: CastBot User Patterns

### Primary User Operations in CastBot

1. **Member Fetching**: Safari participants, cast members, paused players
2. **User Profile Data**: Display names, avatars, roles, join dates
3. **Player Management**: Inventory tracking, season participation
4. **Permission Context**: User permissions in interactions

## User vs Member Objects

### User Object (Global Discord Profile)

```javascript
// Discord user object structure
{
  id: "snowflake",                    // User ID
  username: "string",                 // Username
  discriminator: "string",            // #0000 (legacy) or #0 (new system)
  global_name: "string",              // Display name
  avatar: "string",                   // Avatar hash
  bot: false,                         // Whether user is a bot
  system: false,                      // Whether user is a Discord system user
  mfa_enabled: true,                  // Whether 2FA is enabled
  banner: "string",                   // Banner hash
  accent_color: 0,                    // Banner color
  locale: "en-US",                    // User locale
  verified: true,                     // Whether email is verified
  email: "string",                    // User email (bot scope only)
  flags: 0,                           // User flags
  premium_type: 0,                    // Nitro type
  public_flags: 0                     // Public user flags
}
```

### Guild Member Object (Server-Specific Data)

```javascript
// Discord guild member object structure
{
  user: { /* user object */ },        // User information
  nick: "string",                     // Guild nickname
  avatar: "string",                   // Guild-specific avatar
  roles: ["snowflake"],               // Array of role IDs
  joined_at: "ISO8601",               // When user joined guild
  premium_since: "ISO8601",           // When user started boosting
  deaf: false,                        // Whether user is deafened
  mute: false,                        // Whether user is muted
  flags: 0,                           // Guild member flags
  pending: false,                     // Whether user has passed membership screening
  permissions: "string",              // Total permissions (computed)
  communication_disabled_until: "ISO8601" // Timeout expiration
}
```

## CastBot User Management System

### Safe Member Fetching (Heavy CastBot Usage)

```javascript
// CastBot safe member fetching pattern (used extensively)
export async function fetchMemberSafely(guild, userId) {
  try {
    // Check cache first for performance
    let member = guild.members.cache.get(userId);

    if (!member) {
      // Fetch from API if not cached
      member = await guild.members.fetch(userId);
    }

    return member;
  } catch (error) {
    if (error.code === 10007) { // Unknown Member
      console.log(`Member ${userId} not found in guild ${guild.name}`);
      return null;
    }

    if (error.code === 50001) { // Missing Access
      console.log(`No access to member ${userId} in guild ${guild.name}`);
      return null;
    }

    console.error(`Failed to fetch member ${userId}:`, error);
    throw error;
  }
}

// Batch member fetching for efficiency
export async function fetchMultipleMembers(guild, userIds) {
  const members = new Map();
  const uncachedIds = [];

  // Check cache first
  for (const userId of userIds) {
    const cached = guild.members.cache.get(userId);
    if (cached) {
      members.set(userId, cached);
    } else {
      uncachedIds.push(userId);
    }
  }

  // Batch fetch uncached members
  if (uncachedIds.length > 0) {
    try {
      // Discord allows fetching up to 100 members at once
      const batchSize = 100;
      for (let i = 0; i < uncachedIds.length; i += batchSize) {
        const batch = uncachedIds.slice(i, i + batchSize);

        const fetchedMembers = await guild.members.fetch({
          user: batch,
          limit: batch.length
        });

        fetchedMembers.forEach((member, id) => {
          members.set(id, member);
        });

        // Rate limit protection between batches
        if (i + batchSize < uncachedIds.length) {
          await sleep(100);
        }
      }
    } catch (error) {
      console.error('Batch member fetch failed:', error);

      // Fall back to individual fetches
      for (const userId of uncachedIds) {
        try {
          const member = await fetchMemberSafely(guild, userId);
          if (member) {
            members.set(userId, member);
          }
        } catch (individualError) {
          console.log(`Could not fetch member ${userId}:`, individualError.message);
        }
      }
    }
  }

  return members;
}
```

### CastBot Player Data Extraction

```javascript
// CastBot player data extraction system
export class PlayerDataManager {
  // Extract comprehensive player data
  static async getPlayerData(guild, userId) {
    try {
      const member = await fetchMemberSafely(guild, userId);

      if (!member) {
        return {
          exists: false,
          userId: userId,
          displayName: `Unknown User (${userId})`,
          username: 'Unknown',
          discriminator: '0000',
          roles: [],
          joinedAt: null,
          avatar: null,
          permissions: []
        };
      }

      return {
        exists: true,
        userId: member.user.id,
        username: member.user.username,
        discriminator: member.user.discriminator,
        globalName: member.user.global_name,
        displayName: member.displayName,
        nickname: member.nickname,
        avatar: member.user.avatar,
        guildAvatar: member.avatar,
        roles: member.roles.cache.map(role => ({
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position
        })),
        joinedAt: member.joinedAt,
        premiumSince: member.premiumSince,
        permissions: member.permissions.toArray(),
        flags: member.flags || 0,
        isBot: member.user.bot,
        isPending: member.pending,
        communicationDisabledUntil: member.communicationDisabledUntil
      };
    } catch (error) {
      console.error(`Failed to get player data for ${userId}:`, error);
      throw error;
    }
  }

  // Get player data for multiple users
  static async getBatchPlayerData(guild, userIds) {
    try {
      const members = await fetchMultipleMembers(guild, userIds);
      const playerData = new Map();

      for (const userId of userIds) {
        const member = members.get(userId);
        const data = member ?
          await this.getPlayerData(guild, userId) :
          {
            exists: false,
            userId: userId,
            displayName: `Unknown User (${userId})`,
            username: 'Unknown',
            discriminator: '0000',
            roles: [],
            joinedAt: null,
            avatar: null,
            permissions: []
          };

        playerData.set(userId, data);
      }

      return playerData;
    } catch (error) {
      console.error('Failed to get batch player data:', error);
      throw error;
    }
  }

  // Extract Safari-specific player info
  static async getSafariPlayerInfo(guild, userId) {
    try {
      const playerData = await this.getPlayerData(guild, userId);

      if (!playerData.exists) {
        return {
          exists: false,
          userId: userId,
          displayName: `Unknown Player (${userId})`,
          canParticipate: false,
          safariRoles: [],
          isPaused: false
        };
      }

      // Check Safari-related roles
      const safariRoles = playerData.roles.filter(role =>
        role.name.toLowerCase().includes('safari') ||
        role.name.toLowerCase().includes('cast') ||
        role.name.toLowerCase().includes('participant')
      );

      // Check if player is paused (example role check)
      const isPaused = playerData.roles.some(role =>
        role.name.toLowerCase().includes('paused')
      );

      return {
        exists: true,
        userId: playerData.userId,
        displayName: playerData.displayName,
        avatar: playerData.avatar,
        joinedAt: playerData.joinedAt,
        canParticipate: !isPaused && !playerData.isBot,
        safariRoles: safariRoles,
        isPaused: isPaused,
        isBot: playerData.isBot
      };
    } catch (error) {
      console.error(`Failed to get Safari player info for ${userId}:`, error);
      throw error;
    }
  }
}
```

### User Avatar and Profile Management

```javascript
// CastBot user avatar and profile utilities
export class UserProfileManager {
  // Get user avatar URL with fallbacks
  static getUserAvatarUrl(user, options = {}) {
    const size = options.size || 128;
    const format = options.format || 'png';

    if (user.avatar) {
      const extension = user.avatar.startsWith('a_') ? 'gif' : format;
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=${size}`;
    } else {
      // Default avatar based on discriminator or user ID
      const discriminator = user.discriminator === '0' ?
        (parseInt(user.id) >> 22) % 6 : // New username system
        parseInt(user.discriminator) % 5; // Legacy discriminator

      return `https://cdn.discordapp.com/embed/avatars/${discriminator}.png?size=${size}`;
    }
  }

  // Get guild-specific avatar URL
  static getGuildAvatarUrl(member, options = {}) {
    if (member.avatar) {
      const size = options.size || 128;
      const format = options.format || 'png';
      const extension = member.avatar.startsWith('a_') ? 'gif' : format;

      return `https://cdn.discordapp.com/guilds/${member.guild.id}/users/${member.user.id}/avatars/${member.avatar}.${extension}?size=${size}`;
    }

    // Fall back to user avatar
    return this.getUserAvatarUrl(member.user, options);
  }

  // Get user banner URL
  static getUserBannerUrl(user, options = {}) {
    if (!user.banner) return null;

    const size = options.size || 1024;
    const format = options.format || 'png';
    const extension = user.banner.startsWith('a_') ? 'gif' : format;

    return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${extension}?size=${size}`;
  }

  // Create user profile embed (for CastBot displays)
  static createUserProfileEmbed(userData) {
    const embed = {
      title: `👤 ${userData.displayName}`,
      color: 0x5865f2,
      thumbnail: {
        url: this.getUserAvatarUrl(userData)
      },
      fields: [
        {
          name: "Username",
          value: userData.globalName ?
            `${userData.globalName} (@${userData.username})` :
            `${userData.username}#${userData.discriminator}`,
          inline: true
        },
        {
          name: "User ID",
          value: userData.userId,
          inline: true
        }
      ],
      timestamp: new Date().toISOString()
    };

    if (userData.joinedAt) {
      embed.fields.push({
        name: "Joined Server",
        value: `<t:${Math.floor(userData.joinedAt.getTime() / 1000)}:R>`,
        inline: true
      });
    }

    if (userData.roles.length > 0) {
      const roleList = userData.roles
        .sort((a, b) => b.position - a.position)
        .slice(0, 10) // Limit to 10 roles
        .map(role => `<@&${role.id}>`)
        .join(', ');

      embed.fields.push({
        name: `Roles (${userData.roles.length})`,
        value: roleList,
        inline: false
      });
    }

    return embed;
  }
}
```

### User Permissions in Context

```javascript
// CastBot user permission context extraction
export class UserPermissionManager {
  // Extract user permissions from interaction context
  static extractPermissionContext(interaction) {
    const context = {
      userId: null,
      guildId: interaction.guild_id,
      channelId: interaction.channel_id,
      userPermissions: null,
      botPermissions: interaction.app_permissions,
      isDM: !interaction.guild_id,
      member: null
    };

    if (interaction.member) {
      // Guild context
      context.userId = interaction.member.user.id;
      context.userPermissions = interaction.member.permissions;
      context.member = interaction.member;
    } else if (interaction.user) {
      // DM context
      context.userId = interaction.user.id;
    }

    return context;
  }

  // Check if user has permission in context
  static hasPermission(context, permission) {
    if (context.isDM) {
      // No permissions in DMs
      return false;
    }

    if (!context.userPermissions) {
      return false;
    }

    // Administrator bypasses all permission checks
    const isAdmin = (BigInt(context.userPermissions) & PermissionFlagsBits.Administrator) !== 0n;
    if (isAdmin) {
      return true;
    }

    // Check specific permission
    return (BigInt(context.userPermissions) & permission) !== 0n;
  }

  // Get user's effective permissions for display
  static getUserPermissionSummary(context) {
    if (context.isDM) {
      return {
        context: 'DM',
        permissions: ['Send Messages', 'Read Message History'],
        isAdmin: false,
        canManageRoles: false,
        canManageChannels: false,
        canManageGuild: false
      };
    }

    if (!context.userPermissions) {
      return {
        context: 'Guild',
        permissions: [],
        isAdmin: false,
        canManageRoles: false,
        canManageChannels: false,
        canManageGuild: false
      };
    }

    const permissions = BigInt(context.userPermissions);
    const isAdmin = (permissions & PermissionFlagsBits.Administrator) !== 0n;

    return {
      context: 'Guild',
      permissions: this.parsePermissionBitfield(permissions),
      isAdmin: isAdmin,
      canManageRoles: isAdmin || (permissions & PermissionFlagsBits.ManageRoles) !== 0n,
      canManageChannels: isAdmin || (permissions & PermissionFlagsBits.ManageChannels) !== 0n,
      canManageGuild: isAdmin || (permissions & PermissionFlagsBits.ManageGuild) !== 0n
    };
  }

  // Parse permission bitfield into readable names
  static parsePermissionBitfield(permissions) {
    const permissionFlags = {
      [PermissionFlagsBits.CreateInstantInvite]: 'Create Instant Invite',
      [PermissionFlagsBits.KickMembers]: 'Kick Members',
      [PermissionFlagsBits.BanMembers]: 'Ban Members',
      [PermissionFlagsBits.Administrator]: 'Administrator',
      [PermissionFlagsBits.ManageChannels]: 'Manage Channels',
      [PermissionFlagsBits.ManageGuild]: 'Manage Guild',
      [PermissionFlagsBits.AddReactions]: 'Add Reactions',
      [PermissionFlagsBits.ViewAuditLog]: 'View Audit Log',
      [PermissionFlagsBits.PrioritySpeaker]: 'Priority Speaker',
      [PermissionFlagsBits.Stream]: 'Stream',
      [PermissionFlagsBits.ViewChannel]: 'View Channel',
      [PermissionFlagsBits.SendMessages]: 'Send Messages',
      [PermissionFlagsBits.SendTTSMessages]: 'Send TTS Messages',
      [PermissionFlagsBits.ManageMessages]: 'Manage Messages',
      [PermissionFlagsBits.EmbedLinks]: 'Embed Links',
      [PermissionFlagsBits.AttachFiles]: 'Attach Files',
      [PermissionFlagsBits.ReadMessageHistory]: 'Read Message History',
      [PermissionFlagsBits.MentionEveryone]: 'Mention Everyone',
      [PermissionFlagsBits.UseExternalEmojis]: 'Use External Emojis',
      [PermissionFlagsBits.ViewGuildInsights]: 'View Guild Insights',
      [PermissionFlagsBits.Connect]: 'Connect',
      [PermissionFlagsBits.Speak]: 'Speak',
      [PermissionFlagsBits.MuteMembers]: 'Mute Members',
      [PermissionFlagsBits.DeafenMembers]: 'Deafen Members',
      [PermissionFlagsBits.MoveMembers]: 'Move Members',
      [PermissionFlagsBits.UseVAD]: 'Use Voice Activity',
      [PermissionFlagsBits.ChangeNickname]: 'Change Nickname',
      [PermissionFlagsBits.ManageNicknames]: 'Manage Nicknames',
      [PermissionFlagsBits.ManageRoles]: 'Manage Roles',
      [PermissionFlagsBits.ManageWebhooks]: 'Manage Webhooks',
      [PermissionFlagsBits.ManageEmojisAndStickers]: 'Manage Emojis and Stickers'
    };

    const userPermissions = [];
    for (const [flag, name] of Object.entries(permissionFlags)) {
      if ((permissions & BigInt(flag)) !== 0n) {
        userPermissions.push(name);
      }
    }

    return userPermissions;
  }
}
```

## User Search and Filtering

### CastBot User Search System

```javascript
// CastBot user search and filtering
export class UserSearchManager {
  // Search users by name pattern
  static searchUsersByName(guild, searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    const results = [];

    guild.members.cache.forEach(member => {
      const user = member.user;
      const displayName = member.displayName.toLowerCase();
      const username = user.username.toLowerCase();
      const globalName = user.global_name?.toLowerCase() || '';

      // Score based on match quality
      let score = 0;
      let matchType = null;

      if (displayName === searchLower) {
        score = 100;
        matchType = 'exact_display';
      } else if (username === searchLower) {
        score = 95;
        matchType = 'exact_username';
      } else if (globalName === searchLower) {
        score = 90;
        matchType = 'exact_global';
      } else if (displayName.startsWith(searchLower)) {
        score = 80;
        matchType = 'prefix_display';
      } else if (username.startsWith(searchLower)) {
        score = 75;
        matchType = 'prefix_username';
      } else if (globalName.startsWith(searchLower)) {
        score = 70;
        matchType = 'prefix_global';
      } else if (displayName.includes(searchLower)) {
        score = 50;
        matchType = 'contains_display';
      } else if (username.includes(searchLower)) {
        score = 45;
        matchType = 'contains_username';
      } else if (globalName.includes(searchLower)) {
        score = 40;
        matchType = 'contains_global';
      }

      if (score > 0) {
        results.push({
          member,
          score,
          matchType,
          displayName: member.displayName,
          username: user.username,
          globalName: user.global_name,
          userId: user.id
        });
      }
    });

    // Sort by score (highest first)
    return results.sort((a, b) => b.score - a.score);
  }

  // Filter users by role
  static filterUsersByRole(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return [];
    }

    return role.members.map(member => ({
      member,
      displayName: member.displayName,
      username: member.user.username,
      userId: member.user.id,
      joinedAt: member.joinedAt
    }));
  }

  // Get active users (recent activity)
  static getActiveUsers(guild, daysBack = 7) {
    const cutoffDate = new Date(Date.now() - (daysBack * 24 * 60 * 60 * 1000));
    const activeUsers = [];

    guild.members.cache.forEach(member => {
      // Check if user has been active (this is a simplified check)
      // In practice, you'd need to track activity through message logs or presence
      if (member.joinedAt > cutoffDate || member.premiumSince) {
        activeUsers.push({
          member,
          displayName: member.displayName,
          userId: member.user.id,
          lastActive: member.premiumSince || member.joinedAt // Simplified
        });
      }
    });

    return activeUsers.sort((a, b) => b.lastActive - a.lastActive);
  }

  // Get users with specific permissions
  static getUsersWithPermission(guild, permission) {
    const usersWithPermission = [];

    guild.members.cache.forEach(member => {
      if (member.permissions.has(permission)) {
        usersWithPermission.push({
          member,
          displayName: member.displayName,
          userId: member.user.id,
          roles: member.roles.cache.map(r => r.name)
        });
      }
    });

    return usersWithPermission;
  }

  // Create user select menu options (for Components V2)
  static createUserSelectOptions(users, maxOptions = 25) {
    return users.slice(0, maxOptions).map(user => ({
      label: user.displayName,
      value: user.userId,
      description: `@${user.username}`,
      emoji: user.member?.premiumSince ? { name: '💎' } : undefined
    }));
  }
}
```

## User Data Validation and Sanitization

### CastBot User Data Handling

```javascript
// CastBot user data validation and sanitization
export class UserDataValidator {
  // Validate user ID format
  static isValidUserId(userId) {
    return /^\d{17,19}$/.test(userId);
  }

  // Sanitize user display name for safe display
  static sanitizeDisplayName(displayName) {
    return displayName
      .replace(/[@#:`]/g, '') // Remove potentially problematic characters
      .substring(0, 32) // Limit length
      .trim();
  }

  // Validate user mention format
  static isValidUserMention(mention) {
    return /^<@!?\d{17,19}>$/.test(mention);
  }

  // Extract user ID from mention
  static extractUserIdFromMention(mention) {
    const match = mention.match(/^<@!?(\d{17,19})>$/);
    return match ? match[1] : null;
  }

  // Validate username format (Discord's rules)
  static isValidUsername(username) {
    // New username system (no discriminator)
    if (!/^[a-z0-9_.]{2,32}$/.test(username)) {
      return false;
    }

    // Cannot be all periods or underscores
    if (/^[._]+$/.test(username)) {
      return false;
    }

    return true;
  }

  // Check if user data is complete
  static validateUserData(userData) {
    const issues = [];

    if (!userData.userId || !this.isValidUserId(userData.userId)) {
      issues.push('Invalid user ID');
    }

    if (!userData.username) {
      issues.push('Missing username');
    }

    if (!userData.displayName) {
      issues.push('Missing display name');
    }

    if (userData.username && !this.isValidUsername(userData.username)) {
      issues.push('Invalid username format');
    }

    return {
      valid: issues.length === 0,
      issues: issues
    };
  }

  // Sanitize user data for storage
  static sanitizeUserData(userData) {
    return {
      userId: userData.userId,
      username: userData.username?.toLowerCase().trim(),
      globalName: userData.globalName?.substring(0, 32).trim(),
      displayName: this.sanitizeDisplayName(userData.displayName || userData.username),
      discriminator: userData.discriminator || '0',
      avatar: userData.avatar,
      joinedAt: userData.joinedAt,
      roles: userData.roles || [],
      permissions: userData.permissions || [],
      isBot: Boolean(userData.isBot),
      isPending: Boolean(userData.isPending)
    };
  }
}
```

## User Analytics and Tracking

### CastBot User Analytics

```javascript
// CastBot user analytics and tracking
export class UserAnalyticsManager {
  constructor() {
    this.userActivity = new Map();
    this.userStats = new Map();
  }

  // Track user interaction
  trackUserInteraction(userId, interactionType, metadata = {}) {
    const now = Date.now();
    const userActivity = this.userActivity.get(userId) || {
      firstSeen: now,
      lastSeen: now,
      interactions: []
    };

    userActivity.lastSeen = now;
    userActivity.interactions.push({
      type: interactionType,
      timestamp: now,
      metadata: metadata
    });

    // Keep only last 100 interactions per user
    if (userActivity.interactions.length > 100) {
      userActivity.interactions = userActivity.interactions.slice(-100);
    }

    this.userActivity.set(userId, userActivity);
  }

  // Get user activity summary
  getUserActivitySummary(userId, daysBack = 7) {
    const userActivity = this.userActivity.get(userId);
    if (!userActivity) {
      return {
        exists: false,
        totalInteractions: 0,
        recentInteractions: 0,
        firstSeen: null,
        lastSeen: null
      };
    }

    const cutoff = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
    const recentInteractions = userActivity.interactions.filter(i => i.timestamp > cutoff);

    return {
      exists: true,
      totalInteractions: userActivity.interactions.length,
      recentInteractions: recentInteractions.length,
      firstSeen: new Date(userActivity.firstSeen),
      lastSeen: new Date(userActivity.lastSeen),
      interactionTypes: this.getInteractionTypeBreakdown(recentInteractions)
    };
  }

  // Get interaction type breakdown
  getInteractionTypeBreakdown(interactions) {
    const breakdown = {};

    interactions.forEach(interaction => {
      breakdown[interaction.type] = (breakdown[interaction.type] || 0) + 1;
    });

    return breakdown;
  }

  // Generate user analytics report
  generateUserAnalyticsReport(guildId) {
    const report = {
      guildId: guildId,
      totalUsers: this.userActivity.size,
      activeUsers: 0,
      topInteractionTypes: {},
      usersByActivity: []
    };

    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days

    this.userActivity.forEach((activity, userId) => {
      const recentInteractions = activity.interactions.filter(i => i.timestamp > cutoff);

      if (recentInteractions.length > 0) {
        report.activeUsers++;

        report.usersByActivity.push({
          userId: userId,
          interactions: recentInteractions.length,
          lastSeen: activity.lastSeen
        });

        // Count interaction types
        recentInteractions.forEach(interaction => {
          report.topInteractionTypes[interaction.type] =
            (report.topInteractionTypes[interaction.type] || 0) + 1;
        });
      }
    });

    // Sort users by activity
    report.usersByActivity.sort((a, b) => b.interactions - a.interactions);

    return report;
  }
}

// Global user analytics instance
export const userAnalytics = new UserAnalyticsManager();
```

## Error Handling for User Operations

### User-Specific Error Handling

```javascript
// CastBot user operation error handling
export async function handleUserError(error, operation, userId = null) {
  const errorCode = error.code || error.status;
  const errorMessage = error.message;

  switch (errorCode) {
    case 10013: // Unknown User
      console.error(`User ${userId} not found`);
      return {
        exists: false,
        error: 'User not found or deleted their account'
      };

    case 10007: // Unknown Member
      console.error(`Member ${userId} not found in guild`);
      return {
        exists: false,
        error: 'User is not a member of this server'
      };

    case 50001: // Missing Access
      console.error(`Missing access to user ${userId}`);
      return {
        exists: false,
        error: 'Cannot access user information'
      };

    case 50013: // Missing Permissions
      console.error(`Missing permissions for user operation: ${operation}`);
      return {
        exists: false,
        error: 'Insufficient permissions to access user data'
      };

    case 30001: // Maximum guilds reached
      console.error(`User ${userId} has reached maximum guild limit`);
      return {
        exists: true,
        error: 'User cannot join more servers'
      };

    default:
      console.error(`Unknown user error during ${operation}:`, {
        code: errorCode,
        message: errorMessage,
        userId
      });
  }

  throw error; // Re-throw for upstream handling
}

// User operation with automatic retry and fallback
export async function userOperationWithFallback(operation, fallbackValue = null) {
  try {
    return await operation();
  } catch (error) {
    const result = await handleUserError(error, 'user_operation');
    if (result && !result.exists) {
      return fallbackValue;
    }
    throw error;
  }
}
```

## Best Practices for CastBot User Operations

### 1. Always Use Safe Member Fetching
```javascript
// ✅ Correct - Handle missing members gracefully
const member = await fetchMemberSafely(guild, userId);
if (!member) {
  return { exists: false, displayName: `Unknown User (${userId})` };
}

// ❌ Wrong - Assume member exists
const member = await guild.members.fetch(userId);
```

### 2. Batch User Operations When Possible
```javascript
// ✅ Correct - Batch fetch multiple users
const members = await fetchMultipleMembers(guild, userIds);

// ❌ Wrong - Individual fetches
const members = [];
for (const userId of userIds) {
  members.push(await guild.members.fetch(userId));
}
```

### 3. Use Appropriate User Data
```javascript
// ✅ Correct - Use display name for user-facing content
const displayName = member.displayName; // Guild nickname or global name

// ❌ Wrong - Use username for display
const displayName = member.user.username; // Not user-friendly
```

### 4. Validate User Data Before Processing
```javascript
// ✅ Correct - Validate user data
const validation = UserDataValidator.validateUserData(userData);
if (!validation.valid) {
  throw new Error(`Invalid user data: ${validation.issues.join(', ')}`);
}

// ❌ Wrong - Process without validation
await processUserData(userData);
```

## CastBot-Specific User Patterns

### Safari Player Management
```javascript
// Safari player user management
export async function getSafariPlayers(guild) {
  try {
    const allMembers = guild.members.cache;
    const safariPlayers = [];

    for (const [userId, member] of allMembers) {
      const playerInfo = await PlayerDataManager.getSafariPlayerInfo(guild, userId);

      if (playerInfo.exists && playerInfo.canParticipate) {
        safariPlayers.push(playerInfo);
      }
    }

    return safariPlayers.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    console.error('Failed to get Safari players:', error);
    throw error;
  }
}
```

### Cast Member Tracking
```javascript
// Cast member user tracking
export async function getCastMembers(guild, seasonId) {
  try {
    const castRoleId = await getCastRoleId(guild.id, seasonId);
    if (!castRoleId) {
      return [];
    }

    const castRole = guild.roles.cache.get(castRoleId);
    if (!castRole) {
      return [];
    }

    const castMembers = [];
    for (const [userId, member] of castRole.members) {
      const playerData = await PlayerDataManager.getPlayerData(guild, userId);
      castMembers.push({
        ...playerData,
        seasonId: seasonId,
        castRole: castRole.name
      });
    }

    return castMembers;
  } catch (error) {
    console.error('Failed to get cast members:', error);
    throw error;
  }
}
```

## Related Documentation

- **[Discord Guild Resource](DiscordGuildResource.md)** - Guild member management
- **[Discord Permissions](DiscordPermissions.md)** - User permission handling
- **[Discord Message Resource](DiscordMessageResource.md)** - User mentions and references
- **[Discord Interaction API](DiscordInteractionAPI.md)** - User context in interactions

## References

- [Discord User Resource Documentation](https://discord.com/developers/docs/resources/user)
- [Discord Guild Member Object](https://discord.com/developers/docs/resources/guild#guild-member-object)
- [User Permissions](https://discord.com/developers/docs/topics/permissions)