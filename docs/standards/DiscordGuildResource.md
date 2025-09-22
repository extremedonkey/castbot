# Discord Guild Resource Management

## Overview

Guild (server) management is **central to CastBot's architecture** - the bot creates roles, channels, manages members, and handles server-wide configuration. Understanding Discord's Guild API is essential for working with CastBot's administrative features.

CastBot performs extensive guild operations: role creation for pronouns/timezones, channel creation for applications, member management for player systems, and more.

**Source**: [Discord Developer Documentation - Guild Resource](https://discord.com/developers/docs/resources/guild)

## 🚨 CRITICAL: CastBot Guild Patterns

### Primary Guild Operations in CastBot

1. **Role Management**: Pronoun roles, timezone roles, cast roles
2. **Channel Management**: Application channels, private channels
3. **Member Management**: Player data, paused players, cast members
4. **Server Configuration**: Guild-wide settings, permissions

## Guild Object Structure

### Core Guild Properties

```javascript
// Guild object from Discord API
{
  id: "snowflake",                    // Guild ID
  name: "Server Name",                // Guild name
  icon: "hash",                       // Guild icon hash
  owner_id: "snowflake",              // Server owner ID
  permissions: "string",              // Bot's permissions in guild
  region: "string",                   // Voice region
  verification_level: 0,              // Verification level
  default_message_notifications: 0,   // Default notification level
  explicit_content_filter: 0,         // Content filter level
  roles: [/* role objects */],        // All guild roles
  channels: [/* channel objects */],  // All guild channels
  members: [/* member objects */],    // Guild members (limited)
  features: ["FEATURE_NAME"]          // Guild features
}
```

### CastBot Guild Context Extraction

```javascript
// Standard guild context extraction in CastBot
async function extractGuildContext(interaction, client) {
  const { guild_id } = interaction;

  if (!guild_id) {
    throw new Error('This command can only be used in a server.');
  }

  // Fetch full guild object
  const guild = await client.guilds.fetch(guild_id);

  return {
    guild,
    guildId: guild_id,
    isOwner: guild.ownerId === interaction.member?.user?.id,
    botMember: guild.members.me || await guild.members.fetch(client.user.id)
  };
}
```

## Role Management Patterns

### CastBot Role Creation (Heavy Usage)

From `utils/roleUtils.js`:

```javascript
// CastBot's role creation pattern (used extensively)
export async function createRoleIfNotExists(guild, roleName, color = '#99AAB5', reason = 'CastBot setup') {
  try {
    // Check if role already exists
    let role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());

    if (!role) {
      console.log(`Creating role: ${roleName}`);
      role = await guild.roles.create({
        name: roleName,
        color: color,
        reason: reason,
        mentionable: false,
        hoist: false
      });

      console.log(`✅ Created role: ${roleName} (${role.id})`);
    } else {
      console.log(`✅ Role already exists: ${roleName} (${role.id})`);
    }

    return role;
  } catch (error) {
    console.error(`❌ Failed to create role ${roleName}:`, error);
    throw error;
  }
}
```

### Pronoun Role System

```javascript
// CastBot's pronoun role creation (from codebase patterns)
const PRONOUN_ROLES = [
  { name: 'He/Him', color: '#3498db' },
  { name: 'She/Her', color: '#e91e63' },
  { name: 'They/Them', color: '#9b59b6' },
  { name: 'He/They', color: '#1abc9c' },
  { name: 'She/They', color: '#f39c12' },
  { name: 'Any Pronouns', color: '#95a5a6' },
  { name: 'Ask for Pronouns', color: '#34495e' }
];

async function setupPronounRoles(guild) {
  const createdRoles = [];

  for (const pronounData of PRONOUN_ROLES) {
    try {
      const role = await createRoleIfNotExists(
        guild,
        pronounData.name,
        pronounData.color,
        'CastBot pronoun role setup'
      );
      createdRoles.push(role);

      // Rate limit protection
      await sleep(100);
    } catch (error) {
      console.error(`Failed to create pronoun role ${pronounData.name}:`, error);
    }
  }

  return createdRoles;
}
```

### Role Assignment/Removal

```javascript
// CastBot role management patterns
export async function assignRoleToMember(guild, userId, roleName) {
  try {
    const member = await guild.members.fetch(userId);
    const role = guild.roles.cache.find(r => r.name === roleName);

    if (!role) {
      throw new Error(`Role ${roleName} not found in guild ${guild.name}`);
    }

    if (member.roles.cache.has(role.id)) {
      console.log(`Member ${member.displayName} already has role ${roleName}`);
      return;
    }

    await member.roles.add(role, 'CastBot role assignment');
    console.log(`✅ Assigned role ${roleName} to ${member.displayName}`);
  } catch (error) {
    console.error(`❌ Failed to assign role ${roleName} to user ${userId}:`, error);
    throw error;
  }
}

export async function removeRoleFromMember(guild, userId, roleName) {
  try {
    const member = await guild.members.fetch(userId);
    const role = guild.roles.cache.find(r => r.name === roleName);

    if (!role || !member.roles.cache.has(role.id)) {
      console.log(`Member ${member.displayName} doesn't have role ${roleName}`);
      return;
    }

    await member.roles.remove(role, 'CastBot role removal');
    console.log(`✅ Removed role ${roleName} from ${member.displayName}`);
  } catch (error) {
    console.error(`❌ Failed to remove role ${roleName} from user ${userId}:`, error);
    throw error;
  }
}
```

## Channel Management Patterns

### CastBot Channel Creation

From `applicationManager.js`:

```javascript
// CastBot's channel creation pattern
async function createApplicationChannel(guild, applicationName, applicantId) {
  try {
    const channelName = `application-${applicationName.toLowerCase().replace(/\s+/g, '-')}`;

    // Check if channel already exists
    const existingChannel = guild.channels.cache.find(
      c => c.name === channelName && c.type === ChannelType.GuildText
    );

    if (existingChannel) {
      console.log(`Application channel already exists: ${existingChannel.name}`);
      return existingChannel;
    }

    // Create new channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: `Application discussion for ${applicationName}`,
      reason: 'CastBot application channel creation',
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: applicantId, // Applicant
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: guild.members.me.id, // Bot
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels
          ]
        }
      ]
    });

    console.log(`✅ Created application channel: ${channel.name} (${channel.id})`);
    return channel;
  } catch (error) {
    console.error(`❌ Failed to create application channel:`, error);
    throw error;
  }
}
```

### Channel Permission Management

```javascript
// CastBot channel permission patterns
async function updateChannelPermissions(channel, userId, permissions) {
  try {
    await channel.permissionOverwrites.edit(userId, permissions, {
      reason: 'CastBot permission update'
    });

    console.log(`✅ Updated permissions for user ${userId} in channel ${channel.name}`);
  } catch (error) {
    console.error(`❌ Failed to update channel permissions:`, error);
    throw error;
  }
}

// Example: Grant access to production team
async function grantProductionAccess(channel, userIds) {
  const permissions = {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    ManageMessages: true
  };

  for (const userId of userIds) {
    await updateChannelPermissions(channel, userId, permissions);
    await sleep(100); // Rate limit protection
  }
}
```

## Member Management Patterns

### CastBot Member Fetching (Heavy Usage)

```javascript
// CastBot member fetching patterns (from codebase analysis)
export async function fetchMemberSafely(guild, userId) {
  try {
    // Try cache first
    let member = guild.members.cache.get(userId);

    if (!member) {
      // Fetch from API if not in cache
      member = await guild.members.fetch(userId);
    }

    return member;
  } catch (error) {
    if (error.code === 10007) { // Unknown Member
      console.log(`Member ${userId} not found in guild ${guild.name}`);
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
      const fetchedMembers = await guild.members.fetch({
        user: uncachedIds,
        limit: uncachedIds.length
      });

      fetchedMembers.forEach((member, id) => {
        members.set(id, member);
      });
    } catch (error) {
      console.error('Batch member fetch failed:', error);
      // Fall back to individual fetches
      for (const userId of uncachedIds) {
        try {
          const member = await guild.members.fetch(userId);
          members.set(userId, member);
        } catch (individualError) {
          console.log(`Could not fetch member ${userId}:`, individualError.message);
        }
      }
    }
  }

  return members;
}
```

### Player Management Integration

```javascript
// CastBot player management patterns
export async function getPlayerData(guild, userId) {
  try {
    const member = await fetchMemberSafely(guild, userId);

    if (!member) {
      return {
        exists: false,
        displayName: `Unknown User (${userId})`,
        roles: [],
        joinedAt: null
      };
    }

    return {
      exists: true,
      displayName: member.displayName,
      username: member.user.username,
      discriminator: member.user.discriminator,
      roles: member.roles.cache.map(role => ({
        id: role.id,
        name: role.name,
        color: role.hexColor
      })),
      joinedAt: member.joinedAt,
      premiumSince: member.premiumSince,
      permissions: member.permissions.toArray()
    };
  } catch (error) {
    console.error(`Failed to get player data for ${userId}:`, error);
    throw error;
  }
}
```

## Guild Configuration Management

### CastBot Guild Settings

```javascript
// CastBot guild configuration patterns
export class GuildConfigManager {
  constructor(guildId) {
    this.guildId = guildId;
    this.configPath = `./data/guilds/${guildId}/config.json`;
  }

  async getGuildSettings() {
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      return {
        prefix: config.prefix || '!',
        timezone: config.timezone || 'UTC',
        locale: config.locale || 'en-US',
        features: config.features || [],
        safariConfig: config.safari || {},
        castlistConfig: config.castlist || {},
        ...config
      };
    } catch (error) {
      // Return defaults if no config exists
      return this.getDefaultSettings();
    }
  }

  async updateGuildSettings(updates) {
    const current = await this.getGuildSettings();
    const updated = { ...current, ...updates };

    fs.writeFileSync(this.configPath, JSON.stringify(updated, null, 2));
    console.log(`✅ Updated guild settings for ${this.guildId}`);

    return updated;
  }

  getDefaultSettings() {
    return {
      prefix: '!',
      timezone: 'UTC',
      locale: 'en-US',
      features: ['safari', 'castlist', 'applications'],
      safari: {
        enabled: true,
        autoResults: false,
        customTerms: {}
      },
      castlist: {
        defaultSeason: null,
        showAlumni: true
      }
    };
  }
}
```

### Guild Feature Detection

```javascript
// Detect guild capabilities and features
export async function analyzeGuildCapabilities(guild) {
  const capabilities = {
    // Basic info
    memberCount: guild.memberCount,
    premiumTier: guild.premiumTier,
    features: guild.features,

    // Permission analysis
    botPermissions: guild.members.me?.permissions.toArray() || [],
    canManageRoles: guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles),
    canManageChannels: guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels),
    canManageGuild: guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild),

    // Limits
    roleLimit: guild.features.includes('MORE_EMOJI') ? 250 : 250, // Standard limit
    channelLimit: guild.features.includes('MORE_CHANNELS') ? 500 : 500,
    emojiLimit: guild.features.includes('MORE_EMOJI') ? 100 : 50,

    // Current usage
    currentRoles: guild.roles.cache.size,
    currentChannels: guild.channels.cache.size,
    currentEmojis: guild.emojis.cache.size,

    // CastBot specific
    hasRequiredPermissions: guild.members.me?.permissions.has(
      PermissionFlagsBits.ManageRoles |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.EmbedLinks
    ),
  };

  // Calculate available capacity
  capabilities.availableRoles = capabilities.roleLimit - capabilities.currentRoles;
  capabilities.availableChannels = capabilities.channelLimit - capabilities.currentChannels;
  capabilities.availableEmojis = capabilities.emojiLimit - capabilities.currentEmojis;

  return capabilities;
}
```

## Guild Event Handling

### Guild Member Updates

```javascript
// Handle guild member events (webhooks or gateway)
export async function handleGuildMemberUpdate(oldMember, newMember) {
  const roleChanges = {
    added: newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id)),
    removed: oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id))
  };

  // Log role changes for CastBot tracking
  if (roleChanges.added.size > 0 || roleChanges.removed.size > 0) {
    console.log(`Role changes for ${newMember.displayName}:`, {
      added: roleChanges.added.map(r => r.name),
      removed: roleChanges.removed.map(r => r.name)
    });

    // Update CastBot player data if needed
    await updatePlayerRoleData(newMember.guild.id, newMember.id, {
      roles: newMember.roles.cache.map(r => ({ id: r.id, name: r.name }))
    });
  }

  // Handle nickname changes
  if (oldMember.displayName !== newMember.displayName) {
    console.log(`Nickname change: ${oldMember.displayName} → ${newMember.displayName}`);
    await updatePlayerDisplayName(newMember.guild.id, newMember.id, newMember.displayName);
  }
}
```

### Guild Role Updates

```javascript
// Handle role updates (important for CastBot role tracking)
export async function handleGuildRoleUpdate(oldRole, newRole) {
  const changes = {};

  if (oldRole.name !== newRole.name) {
    changes.nameChange = { from: oldRole.name, to: newRole.name };
  }

  if (oldRole.color !== newRole.color) {
    changes.colorChange = { from: oldRole.hexColor, to: newRole.hexColor };
  }

  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
    changes.permissionChange = {
      added: newRole.permissions.missing(oldRole.permissions),
      removed: oldRole.permissions.missing(newRole.permissions)
    };
  }

  if (Object.keys(changes).length > 0) {
    console.log(`Role update for ${newRole.name} (${newRole.id}):`, changes);

    // Update CastBot data if this is a tracked role
    await updateTrackedRoleData(newRole.guild.id, newRole.id, changes);
  }
}
```

## Error Handling Patterns

### Common Guild API Errors

```javascript
// CastBot guild error handling patterns
export async function handleGuildOperationError(error, operation, guildId) {
  const errorCode = error.code;
  const errorMessage = error.message;

  switch (errorCode) {
    case 10004: // Unknown Guild
      console.error(`Guild ${guildId} not found or bot was removed`);
      await handleGuildRemoval(guildId);
      break;

    case 50013: // Missing Permissions
      console.error(`Missing permissions for ${operation} in guild ${guildId}`);
      await notifyAdminsAboutPermissions(guildId, operation);
      break;

    case 50001: // Missing Access
      console.error(`Missing access for ${operation} in guild ${guildId}`);
      break;

    case 50035: // Invalid Form Body
      console.error(`Invalid data for ${operation}:`, error.errors);
      break;

    case 30005: // Maximum Guilds
      console.error(`Cannot join guild ${guildId}: Maximum guilds reached`);
      break;

    case 30013: // Maximum Roles
      console.error(`Cannot create role in guild ${guildId}: Maximum roles reached`);
      break;

    case 30015: // Maximum Channels
      console.error(`Cannot create channel in guild ${guildId}: Maximum channels reached`);
      break;

    default:
      console.error(`Unknown error during ${operation} in guild ${guildId}:`, {
        code: errorCode,
        message: errorMessage
      });
  }

  throw error; // Re-throw for upstream handling
}
```

### Guild Operation Validation

```javascript
// Pre-validate guild operations
export async function validateGuildOperation(guild, operation, data = {}) {
  const capabilities = await analyzeGuildCapabilities(guild);

  switch (operation) {
    case 'CREATE_ROLE':
      if (capabilities.availableRoles <= 0) {
        throw new Error(`Cannot create role: Guild has reached role limit (${capabilities.roleLimit})`);
      }
      if (!capabilities.canManageRoles) {
        throw new Error('Bot lacks Manage Roles permission');
      }
      break;

    case 'CREATE_CHANNEL':
      if (capabilities.availableChannels <= 0) {
        throw new Error(`Cannot create channel: Guild has reached channel limit (${capabilities.channelLimit})`);
      }
      if (!capabilities.canManageChannels) {
        throw new Error('Bot lacks Manage Channels permission');
      }
      break;

    case 'MANAGE_MEMBER':
      if (!capabilities.canManageRoles) {
        throw new Error('Bot lacks Manage Roles permission for member management');
      }
      break;

    default:
      console.warn(`Unknown operation for validation: ${operation}`);
  }

  return true;
}
```

## Performance Optimization

### Guild Cache Management

```javascript
// Optimize guild data caching
export class GuildCacheManager {
  constructor() {
    this.roleCache = new Map();
    this.memberCache = new Map();
    this.channelCache = new Map();
    this.cacheTimestamps = new Map();
  }

  async getCachedRoles(guildId, maxAge = 300000) { // 5 minutes
    const cacheKey = `roles_${guildId}`;
    const cached = this.roleCache.get(cacheKey);
    const timestamp = this.cacheTimestamps.get(cacheKey);

    if (cached && timestamp && Date.now() - timestamp < maxAge) {
      return cached;
    }

    // Refresh cache
    const guild = await client.guilds.fetch(guildId);
    const roles = guild.roles.cache;

    this.roleCache.set(cacheKey, roles);
    this.cacheTimestamps.set(cacheKey, Date.now());

    return roles;
  }

  invalidateCache(guildId, type = 'all') {
    if (type === 'all' || type === 'roles') {
      this.roleCache.delete(`roles_${guildId}`);
      this.cacheTimestamps.delete(`roles_${guildId}`);
    }

    if (type === 'all' || type === 'members') {
      this.memberCache.delete(`members_${guildId}`);
      this.cacheTimestamps.delete(`members_${guildId}`);
    }

    if (type === 'all' || type === 'channels') {
      this.channelCache.delete(`channels_${guildId}`);
      this.cacheTimestamps.delete(`channels_${guildId}`);
    }
  }
}
```

## Best Practices for CastBot Guild Operations

### 1. Always Validate Permissions First
```javascript
// ✅ Correct - Check permissions before attempting operation
const capabilities = await analyzeGuildCapabilities(guild);
if (!capabilities.canManageRoles) {
  throw new Error('Missing Manage Roles permission');
}
await createRoleIfNotExists(guild, roleName);

// ❌ Wrong - Attempt operation without validation
await guild.roles.create({ name: roleName }); // May fail
```

### 2. Use Batch Operations When Possible
```javascript
// ✅ Correct - Batch member fetching
const members = await guild.members.fetch({ user: userIds });

// ❌ Wrong - Individual fetching
const members = [];
for (const userId of userIds) {
  members.push(await guild.members.fetch(userId));
}
```

### 3. Handle Rate Limits in Guild Operations
```javascript
// ✅ Correct - Rate limit protection
for (const roleData of rolesToCreate) {
  await createRoleIfNotExists(guild, roleData.name, roleData.color);
  await sleep(100); // Prevent rate limiting
}

// ❌ Wrong - No rate limit protection
await Promise.all(rolesToCreate.map(data =>
  guild.roles.create({ name: data.name, color: data.color })
));
```

### 4. Cache Guild Data Appropriately
```javascript
// ✅ Correct - Use cache when available
let member = guild.members.cache.get(userId);
if (!member) {
  member = await guild.members.fetch(userId);
}

// ❌ Wrong - Always fetch from API
const member = await guild.members.fetch(userId);
```

## Related Documentation

- **[Discord Permissions](DiscordPermissions.md)** - Guild permission management
- **[Discord Rate Limits](DiscordRateLimits.md)** - Rate limiting for guild operations
- **[Discord Channel Resource](DiscordChannelResource.md)** - Channel-specific operations
- **[Discord User Resource](DiscordUserResource.md)** - Member and user management

## References

- [Discord Guild Resource Documentation](https://discord.com/developers/docs/resources/guild)
- [Guild Management Guide](https://discord.com/developers/docs/resources/guild#guild-management)
- [Discord.js Guild Documentation](https://discord.js.org/#/docs/discord.js/stable/class/Guild)