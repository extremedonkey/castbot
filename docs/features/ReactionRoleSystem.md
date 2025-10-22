# Reaction Role System

**Location**: `app.js` (lines 35908-36172 for event handlers)
**Event Handlers**: `messageReactionAdd`, `messageReactionRemove`, `messageDelete`
**Storage**: `playerData.json` per-guild persistent storage
**Status**: Active across all servers with CastBot

## Overview

The Reaction Role System allows users to self-assign roles by reacting to specific messages with emojis. It supports multiple role types with different behaviors and maintains both in-memory and persistent storage for reliability across bot restarts.

## Features

### 1. Pronoun Roles

Users can select pronoun roles by reacting to a pronoun selection message:

- Multiple roles can be held simultaneously
- Reactions persist across messages
- Created via Production Menu → Utilities → Pronoun Roles

**Example**:
- React with 🟦 → Get "He/Him" role
- React with 🟪 → Get "She/Her" role
- React with 🟩 → Get "They/Them" role

### 2. Timezone Roles

Users can select their timezone by reacting to timezone messages:

- **Mutually exclusive** - selecting a new timezone removes the old one
- Automatically converts to local time for event coordination
- Created via Production Menu → Utilities → Timezone Roles

**Timezone Role Logic** (app.js:36038-36052):
```javascript
if (isTimezoneRole) {
  // Remove all other timezone roles first
  const timezones = await getGuildTimezones(guild.id);
  const timezoneRoleIds = Object.keys(timezones);
  const currentTimezoneRoles = member.roles.cache.filter(r =>
    timezoneRoleIds.includes(r.id)
  );

  if (currentTimezoneRoles.size > 0) {
    await member.roles.remove(currentTimezoneRoles.map(r => r.id));
  }

  await member.roles.add(roleId);
}
```

### 3. Availability Tracking

Users can indicate availability for different time slots by reacting to availability messages:

- Tracks player availability for scheduling events
- Stores reactions in persistent storage
- Used for coordinating game rounds and events

**Data Structure**:
```javascript
playerData[guildId].availabilityMessages[messageId] = {
  slots: universalSlots,  // Array of time slot objects
  startHour: currentUTCHour,
  channelId: channelId
};
```

## Architecture

### Dual Storage System

The system maintains both in-memory and persistent storage:

1. **In-Memory Cache** (fast access, lost on restart):
   ```javascript
   client.roleReactions = new Map();  // messageId → role mapping
   client.availabilityReactions = new Map();  // messageId → availability data
   ```

2. **Persistent Storage** (survives restarts):
   ```javascript
   playerData[guildId].reactionMappings[messageId] = {
     mapping: { '🟦': roleId1, '🟪': roleId2 },
     isTimezone: false
   };
   ```

### Initialization on Bot Start

When the bot starts, it loads all reaction mappings from persistent storage:

```javascript
client.on('ready', async () => {
  // Load reaction mappings from persistent storage (app.js:1684-1705)
  client.roleReactions = new Map();

  for (const guild of client.guilds.cache.values()) {
    const mappings = await loadAllReactionMappings(guild.id);

    for (const [messageId, mappingData] of Object.entries(mappings)) {
      if (mappingData && mappingData.mapping) {
        client.roleReactions.set(messageId, mappingData.mapping);
      }
    }
  }
});
```

## Event Handlers

### messageReactionAdd (app.js:35908-36065)

Triggered when a user adds a reaction to any message in a server where CastBot is installed.

**Flow**:

1. **Filter Bot Reactions**:
   ```javascript
   if (user.bot) return;
   ```

2. **Debug Logging** (⚠️ Source of PM2 Error Logger false positives):
   ```javascript
   console.log(`🔍 DEBUG: Reaction added - Server: ${guildInfo} #${channelName},
     Message: ${reaction.message.id}, Emoji: ${reaction.emoji.name},
     User: ${user.tag} (ID: ${user.id}, Bot: ${user.bot}, System: ${user.system})`);
   ```

3. **Fetch Partial Reactions**:
   ```javascript
   if (reaction.partial) {
     await reaction.fetch();
   }
   ```

4. **Check Availability Message**:
   - Look in memory cache first
   - Fall back to persistent storage
   - If found, update availability data and return

5. **Check Role Reaction Message**:
   - Look in memory cache first
   - Fall back to persistent storage
   - If not found, return (ignore this reaction)

6. **Permission Checks**:
   ```javascript
   const permCheck = await checkRoleHierarchyPermission(guild, roleId, client);
   if (!permCheck.allowed) {
     await reaction.users.remove(user.id);  // Remove reaction
     // Send DM to user explaining failure
     return;
   }
   ```

7. **Role Assignment**:
   - If timezone role: Remove other timezone roles first
   - Add the new role
   - Log success

### messageReactionRemove (app.js:36067-36172)

Triggered when a user removes a reaction from a message.

**Flow**:
1. Filter bot reactions
2. Debug logging
3. Check availability messages (remove user from slot)
4. Check role reaction messages
5. Permission checks
6. Remove role from user

### messageDelete (app.js:36174-36195)

Cleans up reaction mappings when messages are deleted:

```javascript
client.on('messageDelete', async (message) => {
  if (!message.guild) return;

  const hasMapping = client.roleReactions?.has(message.id);

  if (hasMapping) {
    // Remove from in-memory cache
    client.roleReactions.delete(message.id);

    // Remove from persistent storage
    await deleteReactionMapping(message.guild.id, message.id);
  }
});
```

## Permission Handling

The system includes robust permission checks to prevent role assignment failures:

### Role Hierarchy Check

```javascript
const permCheck = await checkRoleHierarchyPermission(guild, roleId, client);

// Returns:
{
  allowed: true/false,
  reason: "Bot's highest role must be above target role"
}
```

### Common Permission Issues

1. **Bot Role Too Low**:
   - Bot's highest role must be above the role it's trying to assign
   - User sees DM: "Could not assign role in [Server]: [reason]"
   - Reaction is automatically removed

2. **Role Deleted**:
   - If role no longer exists, failure is handled silently
   - No DM sent to user (assumed role cleanup)

3. **Missing MANAGE_ROLES Permission**:
   - Bot must have `MANAGE_ROLES` permission
   - Fails with permission error

## Debug Logging

### Current Implementation

The system logs **ALL reactions** in **ALL servers** where CastBot is installed:

```javascript
console.log(`🔍 DEBUG: Reaction added - Server: ${guildInfo} #${channelName},
  Message: ${reaction.message.id}, Emoji: ${reaction.emoji.name},
  User: ${user.tag} (ID: ${user.id}, Bot: ${user.bot}, System: ${user.system})`);
```

### Why This Causes Issues

1. **Global Listener**: The `messageReactionAdd` event fires for **every reaction** in **every server**
2. **No Filtering**: The debug log runs before checking if the message has a role mapping
3. **Emoji Logging**: The log includes the emoji character, including ❌
4. **PM2 Error Logger**: Sees ❌ in logs and flags it as an error (see [PM2ErrorLogger.md](PM2ErrorLogger.md))

### Example False Positive

```
🔍 DEBUG: Reaction added - Server: Triumph Hub (1080166267136262154) #treemail,
  Message: 1430353557634154627, Emoji: ❌, User: landoftreblesandfrogs
  (ID: 203902953759703040, Bot: false, System: false)
```

**What Actually Happened**:
- User `landoftreblesandfrogs` reacted with ❌ to a message in `#treemail` channel
- This is completely normal Discord behavior
- The message has **no role mapping** (it's not a pronoun/timezone message)
- The reaction is **ignored** after the debug log
- But the log contains ❌, so PM2 Error Logger flags it

## Reaction Emojis

The system uses a predefined set of emojis for role assignment:

```javascript
const REACTION_EMOJIS = [
  '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣',
  '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'
];
```

**Limitation**: Maximum 10 roles per message.

## Data Persistence

### Storing Reaction Mappings

When a pronoun/timezone message is created:

```javascript
// Save to persistent storage
await saveReactionMapping(guildId, messageId, roleMapping);

// Also update in-memory cache
if (!client.roleReactions) client.roleReactions = new Map();
client.roleReactions.set(messageId, roleMapping);
```

### Loading on Startup

All reaction mappings are loaded when the bot starts:

```javascript
const mappings = await loadAllReactionMappings(guild.id);

for (const [messageId, mappingData] of Object.entries(mappings)) {
  client.roleReactions.set(messageId, mappingData.mapping);
}
```

## Related Features

### Commands That Create Reaction Messages

1. **`react_timezones`** (app.js:2802):
   - Creates timezone selection message in current channel
   - Adds numbered emoji reactions
   - Stores mapping with `isTimezone: true` flag

2. **`react_pronouns`** (app.js:2900):
   - Creates pronoun selection message in current channel
   - Adds numbered emoji reactions
   - Regular role assignment (not mutually exclusive)

3. **`player_set_timezone`** (app.js:3006):
   - Personal timezone selection for player menu
   - Same logic as react_timezones

4. **`prod_timezone_react`** (app.js:16865):
   - Production menu version of timezone selection
   - Includes persistent storage

## Known Issues

### 1. ✅ FIXED: Verbose Debug Logging

**Issue**: Was logging every single reaction in every server, including non-role reactions.

**Impact** (before fix):
- High log volume
- False positives in PM2 Error Logger
- Performance impact (minimal)

**Solution Implemented** (2025-10-23):
Moved debug logs AFTER filtering to only log relevant reactions:

```javascript
// ❌ Before (logged everything)
console.log(`🔍 DEBUG: Reaction added - ...`);
if (!roleMapping) return;

// ✅ After (only logs role reactions)
if (!roleMapping) return;
console.log(`🔍 DEBUG: Role reaction added - ...`);
```

**Benefits**:
- ✅ Dramatically reduced log volume
- ✅ No more PM2 Error Logger false positives
- ✅ Better performance
- ✅ More useful debugging output

### 2. No Rate Limiting

**Issue**: Rapid reaction spam could potentially cause rate limit issues.

**Impact**: Low (Discord.js has built-in rate limiting)

**Mitigation**: Not currently needed, but could add debouncing if issues arise.

## Usage Examples

### Creating Pronoun Roles

1. Admin runs `/menu` → Production Menu → Utilities → Pronoun Roles
2. Enters channel to post in
3. Bot creates message with emoji reactions
4. Users react to select pronouns
5. Bot assigns corresponding roles

### Creating Timezone Roles

1. Admin runs `/menu` → Production Menu → Utilities → Timezone Roles
2. Enters channel to post in
3. Bot creates message with emoji reactions for each timezone
4. Users react to select timezone
5. Bot removes old timezone role and adds new one

### User Experience

**Adding Role**:
1. User reacts with 🟦 to pronoun message
2. Bot detects reaction
3. Bot checks permissions
4. Bot adds "He/Him" role to user
5. User's role list updates instantly

**Removing Role**:
1. User removes 🟦 reaction
2. Bot detects removal
3. Bot removes "He/Him" role from user

**Permission Failure**:
1. User reacts with 🟦
2. Bot checks permissions → Bot role too low
3. Bot removes user's reaction
4. Bot sends DM: "Could not assign role in [Server]: Bot's role is below target role"

## Technical Design

### Role Mapping Structure

```javascript
// In-memory
client.roleReactions = Map {
  'messageId1' => {
    '1️⃣': 'roleId1',
    '2️⃣': 'roleId2',
    isTimezone: false
  },
  'messageId2' => {
    '1️⃣': 'timezoneRoleId1',
    '2️⃣': 'timezoneRoleId2',
    isTimezone: true
  }
}

// Persistent
playerData[guildId].reactionMappings = {
  'messageId1': {
    mapping: { '1️⃣': 'roleId1', '2️⃣': 'roleId2' },
    isTimezone: false
  }
}
```

### Availability Mapping Structure

```javascript
// In-memory
client.availabilityReactions = Map {
  'messageId' => {
    slots: [
      { emoji: '🕐', label: '12:00 PM', utcHour: 12 },
      { emoji: '🕑', label: '1:00 PM', utcHour: 13 }
    ],
    startHour: 12,
    channelId: 'channelId'
  }
}

// Persistent
playerData[guildId].availabilityMessages = {
  'messageId': {
    slots: [...],
    startHour: 12,
    channelId: 'channelId'
  }
}
```

## Related Documentation

- [PM2ErrorLogger.md](PM2ErrorLogger.md) - False positive source
- [DiscordPermissions.md](../standards/DiscordPermissions.md) - Permission handling details
- [DiscordInteractionAPI.md](../standards/DiscordInteractionAPI.md) - Interaction context

---

**Last Updated**: 2025-10-23
**Component Status**: ✅ Active (with verbose logging)
