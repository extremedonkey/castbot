# Discord Permissions Reference

## Overview

Discord permissions control what users and bots can do in servers and channels. This is **foundational knowledge** for any Claude instance working with CastBot - permissions are checked in **100+ locations** throughout the codebase.

**Source**: [Discord Developer Documentation - Permissions](https://discord.com/developers/docs/topics/permissions)

## 🚨 CRITICAL: CastBot Permission Model

**CastBot uses MANAGE_ROLES as the primary admin permission** for nearly all administrative functions. This is a **deliberate architectural decision** - understanding this is essential for working with CastBot.

```javascript
// CastBot's primary permission pattern (used 100+ times)
if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission.')) return;
```

## Permission System Fundamentals

### Permission Structure

Permissions in Discord are represented as **64-bit integers** (BigInt in JavaScript):

```javascript
// Permission checking pattern in CastBot
const hasPermission = (BigInt(member.permissions) & BigInt(PERMISSIONS.MANAGE_ROLES)) !== 0n;

// CastBot's permission utility
import { PERMISSIONS } from './utils/permissionUtils.js';
const canManage = (BigInt(member.permissions) & PERMISSIONS.MANAGE_ROLES) !== 0n;
```

### CastBot Permission Constants

```javascript
// From utils/permissionUtils.js
export const PERMISSIONS = {
    MANAGE_ROLES: PermissionFlagsBits.ManageRoles,        // Primary CastBot admin permission
    MANAGE_CHANNELS: PermissionFlagsBits.ManageChannels,  // Channel creation/editing
    MANAGE_GUILD: PermissionFlagsBits.ManageGuild,        // Server-wide settings
    ADMINISTRATOR: PermissionFlagsBits.Administrator      // Full access
};
```

## Core Permission Flags

### Administrative Permissions (CastBot's Focus)

| Permission | Bit Value | Hex | CastBot Usage |
|------------|-----------|-----|---------------|
| **MANAGE_ROLES** | `1 << 28` | `0x10000000` | **Primary admin permission** - Safari, stores, custom actions |
| **MANAGE_GUILD** | `1 << 5` | `0x20` | Server configuration, global settings |
| **MANAGE_CHANNELS** | `1 << 4` | `0x10` | Channel creation (application channels) |
| **ADMINISTRATOR** | `1 << 3` | `0x8` | Ultimate permission (bypasses all checks) |

### Content Permissions (Used by CastBot)

| Permission | Bit Value | Hex | CastBot Usage |
|------------|-----------|-----|---------------|
| **SEND_MESSAGES** | `1 << 11` | `0x800` | Bot message posting |
| **EMBED_LINKS** | `1 << 14` | `0x4000` | Rich embeds (analytics, castlists) |
| **ATTACH_FILES** | `1 << 15` | `0x8000` | Safari maps, emoji uploads |
| **USE_EXTERNAL_EMOJIS** | `1 << 18` | `0x40000` | Custom emojis in UI |
| **MENTION_EVERYONE** | `1 << 17` | `0x20000` | @everyone notifications |

### Membership Permissions (Used by CastBot)

| Permission | Bit Value | Hex | CastBot Usage |
|------------|-----------|-----|---------------|
| **VIEW_CHANNEL** | `1 << 10` | `0x400` | Channel visibility |
| **READ_MESSAGE_HISTORY** | `1 << 16` | `0x10000` | Message context |
| **ADD_REACTIONS** | `1 << 6` | `0x40` | Button interactions |

## Permission Calculation Patterns

### Basic Permission Check (CastBot Standard)

```javascript
// Standard CastBot permission checking
function hasPermission(member, permission) {
  if (!member?.permissions) return false;
  return (BigInt(member.permissions) & permission) !== 0n;
}

// Usage throughout CastBot
if (!hasPermission(context.member, PERMISSIONS.MANAGE_ROLES)) {
  return sendPermissionDenied(res, 'Manage Roles');
}
```

### Administrator Override (Always True)

```javascript
// Administrator permission bypasses ALL other checks
const isAdmin = (BigInt(member.permissions) & PermissionFlagsBits.Administrator) !== 0n;
if (isAdmin) {
  // Administrator can do anything
  return true;
}
```

### Multiple Permission Check

```javascript
// Check if user has ANY of multiple permissions
const adminPermissions =
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.Administrator;

const hasAnyAdmin = (BigInt(member.permissions) & adminPermissions) !== 0n;
```

## Permission Context Hierarchy

### 1. Server-Level Permissions (Guild)
```javascript
// From interaction context
const { member } = interaction;
const serverPermissions = BigInt(member.permissions);

// These are the "base" permissions for the user in the server
```

### 2. Channel-Level Permissions (Overwrites)
```javascript
// Channel permissions can override server permissions
const channel = await guild.channels.fetch(channelId);
const channelPermissions = channel.permissionsFor(member);

// Channel permissions = Server permissions + Channel overwrites
```

### 3. Bot Application Permissions
```javascript
// Bot's permissions in the interaction context
const { app_permissions } = interaction;
const botPermissions = BigInt(app_permissions);

// Check if bot can perform actions
const botCanAttachFiles = (botPermissions & PermissionFlagsBits.AttachFiles) !== 0n;
```

## CastBot Permission Patterns

### Pattern 1: Standard Admin Check (Most Common)

```javascript
// Used 100+ times throughout CastBot
if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to use this feature.')) {
  return;
}

// Extracted from app.js examples:
// - Safari management
// - Store creation/editing
// - Custom action configuration
// - Player management
// - Data import/export
```

### Pattern 2: ButtonHandlerFactory Permission Check

```javascript
// Built into the button handler system
return ButtonHandlerFactory.create({
  id: 'admin_button',
  requiresPermission: PERMISSIONS.MANAGE_ROLES,
  permissionName: 'Manage Roles',
  handler: async (context) => {
    // Handler only runs if permission check passes
  }
});
```

### Pattern 3: Context-Based Permission Extraction

```javascript
// Standard context extraction in CastBot handlers
const { guild_id, member } = interaction;
const hasManageRoles = member?.permissions &&
  (BigInt(member.permissions) & PERMISSIONS.MANAGE_ROLES) !== 0n;

if (!hasManageRoles) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: '❌ You need Manage Roles permission to use this feature.',
      flags: InteractionResponseFlags.EPHEMERAL
    }
  });
}
```

## Permission Error Handling

### Standard Error Response

```javascript
// CastBot standard permission denied response
export function sendPermissionDenied(res, permissionName) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `❌ You need ${permissionName} permission to use this feature.`,
      flags: InteractionResponseFlags.EPHEMERAL
    }
  });
}
```

### Permission Check Utility

```javascript
// From buttonHandlerUtils.js
export function requirePermission(req, res, requiredPermission, errorMessage = 'You do not have permission to use this feature.') {
  const { member } = req.body;

  if (!member?.permissions) {
    res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `❌ ${errorMessage}`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
    return false;
  }

  const hasPermission = Boolean(BigInt(member.permissions) & requiredPermission);

  if (!hasPermission) {
    res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `❌ ${errorMessage}`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
    return false;
  }

  return true;
}
```

## Special Permission Cases

### DM vs Guild Context

```javascript
// Check if interaction is in a guild (has permissions)
const isInGuild = interaction.guild_id && interaction.member;

if (!isInGuild) {
  // DM context - no guild permissions available
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: '❌ This command can only be used in a server.',
      flags: InteractionResponseFlags.EPHEMERAL
    }
  });
}
```

### Bot vs User Permissions

```javascript
// User permissions (what the user can do)
const userPermissions = BigInt(interaction.member.permissions);

// Bot permissions (what the bot can do)
const botPermissions = BigInt(interaction.app_permissions);

// Both may be needed for some operations
const userCanManageRoles = (userPermissions & PermissionFlagsBits.ManageRoles) !== 0n;
const botCanManageRoles = (botPermissions & PermissionFlagsBits.ManageRoles) !== 0n;

if (userCanManageRoles && !botCanManageRoles) {
  return res.send({
    data: {
      content: '❌ I need Manage Roles permission to perform this action.',
      flags: InteractionResponseFlags.EPHEMERAL
    }
  });
}
```

## Permission Best Practices for CastBot

### 1. Always Use MANAGE_ROLES for Admin Features
```javascript
// ✅ Correct - Consistent with CastBot architecture
if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;

// ❌ Wrong - Don't mix different admin permissions without reason
if (!requirePermission(req, res, PERMISSIONS.ADMINISTRATOR)) return;
```

### 2. Provide Clear Error Messages
```javascript
// ✅ Clear, specific error message
if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to create Safari stores.')) return;

// ❌ Generic error message
if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
```

### 3. Check Context Before Permissions
```javascript
// ✅ Validate context first
const { guild_id, member } = interaction;
if (!guild_id || !member) {
  return sendError('This command can only be used in a server.');
}

if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)) return;
```

### 4. Use ButtonHandlerFactory for Consistent Checking
```javascript
// ✅ Built-in permission handling
return ButtonHandlerFactory.create({
  id: 'admin_function',
  requiresPermission: PERMISSIONS.MANAGE_ROLES,
  permissionName: 'Manage Roles',
  handler: async (context) => {
    // Permission already validated
  }
});
```

## Common Permission Patterns in CastBot

### Safari Management
```javascript
// All Safari admin functions use MANAGE_ROLES
if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage Safari.')) return;
```

### Store/Custom Action Management
```javascript
// Store and custom action management
if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage stores.')) return;
```

### Player Data Management
```javascript
// Player inventory, paused players, etc.
if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission to manage player data.')) return;
```

### Channel/Role Creation
```javascript
// When CastBot creates Discord resources
const botCanManageChannels = (BigInt(interaction.app_permissions) & PermissionFlagsBits.ManageChannels) !== 0n;
const userCanManageChannels = (BigInt(interaction.member.permissions) & PermissionFlagsBits.ManageChannels) !== 0n;

if (!userCanManageChannels || !botCanManageChannels) {
  return sendError('Both you and I need Manage Channels permission for this feature.');
}
```

## Debugging Permission Issues

### Common Issues and Solutions

| Problem | Symptom | Solution |
|---------|---------|----------|
| **BigInt not used** | Permission check always fails | Use `BigInt()` wrapper |
| **Wrong permission checked** | Unexpected access denied | Check if MANAGE_ROLES is correct |
| **DM context check missing** | Crashes on DM usage | Check `guild_id` first |
| **Bot permission not checked** | User can trigger but bot can't execute | Check `app_permissions` |

### Debug Permission Values
```javascript
// Add to any handler for debugging
console.log('Debug permissions:', {
  userId: interaction.member?.user?.id,
  userPermissions: interaction.member?.permissions,
  botPermissions: interaction.app_permissions,
  hasManageRoles: interaction.member?.permissions ?
    (BigInt(interaction.member.permissions) & PERMISSIONS.MANAGE_ROLES) !== 0n : false
});
```

## Related Documentation

- **[Discord Interaction API](DiscordInteractionAPI.md)** - How permissions arrive in interactions
- **[Discord Interaction Patterns](DiscordInteractionPatterns.md)** - CastBot-specific permission patterns
- **[ButtonHandlerFactory](../enablers/ButtonHandlerFactory.md)** - Built-in permission handling
- **[Guild Resource Management](DiscordGuildResource.md)** - Server-level permission operations

## References

- [Discord Permissions Documentation](https://discord.com/developers/docs/topics/permissions)
- [Discord Permission Calculator](https://discordapi.com/permissions.html)
- [Permission Flag Bits Reference](https://discord-api-types.dev/api/discord-api-types-v10/enum/PermissionFlagsBits)