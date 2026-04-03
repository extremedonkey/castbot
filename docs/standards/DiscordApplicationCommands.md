# Discord Application Commands Reference

## Overview

Application Commands are the primary way users interact with Discord bots. This document covers all three command types: slash commands, user context menus, and message context menus — their registration, structure, permissions, and interaction payloads.

**Source**: [Discord Developer Documentation](https://docs.discord.com/developers/interactions/application-commands)

**Related CastBot Docs**:
- **[DiscordInteractionAPI.md](DiscordInteractionAPI.md)** - How interactions are received and responded to
- **[ComponentsV2.md](ComponentsV2.md)** - UI component structure for responses
- **[ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md)** - CastBot's handler framework

## Application Command Types

| Type | Value | Trigger | Description |
|------|-------|---------|-------------|
| `CHAT_INPUT` | 1 | User types `/` in chat | Slash commands with options and autocomplete |
| `USER` | 2 | Right-click a user → Apps | Context menu on user profiles |
| `MESSAGE` | 3 | Right-click a message → Apps | Context menu on messages |
| `PRIMARY_ENTRY_POINT` | 4 | Activity launcher | For Discord Activities only (not used in CastBot) |

### Key Differences Between Types

| Feature | CHAT_INPUT (1) | USER (2) | MESSAGE (3) |
|---------|---------------|----------|-------------|
| Description field | Required (1-100 chars) | **Empty string** (not allowed) | **Empty string** (not allowed) |
| Options | Up to 25 | **None** | **None** |
| Name constraints | Lowercase, no spaces, 1-32 chars | Mixed case, spaces allowed, 1-32 chars | Mixed case, spaces allowed, 1-32 chars |
| Autocomplete | Supported | No | No |
| Where it appears | `/` command picker | Right-click user → Apps | Right-click message → Apps |
| Interaction data | `options[]` with user input | `target_id` + `resolved.users` + `resolved.members` | `target_id` + `resolved.messages` |

## Application Command Object

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | snowflake | Unique command identifier (set by Discord) | Read-only |
| `type` | integer | Command type (1-4), defaults to 1 | Optional |
| `application_id` | snowflake | Parent application ID | Read-only |
| `guild_id` | snowflake | Guild ID (only for guild commands) | Read-only |
| `name` | string | 1-32 characters | Required |
| `name_localizations` | dictionary | Localized names by locale | Optional |
| `description` | string | 1-100 chars for CHAT_INPUT; empty string for USER/MESSAGE | Required for CHAT_INPUT |
| `description_localizations` | dictionary | Localized descriptions by locale | Optional |
| `options` | array | Up to 25 parameters (CHAT_INPUT only) | Optional |
| `default_member_permissions` | string | Bitwise permission flags as string | Optional |
| `dm_permission` | boolean | **Deprecated** — use `contexts` instead | Optional |
| `nsfw` | boolean | Age-restricted content marker | Optional |
| `integration_types` | list | Installation contexts (`GUILD_INSTALL`, `USER_INSTALL`) | Optional |
| `contexts` | list | Where command can be used (0=GUILD, 1=BOT_DM, 2=PRIVATE_CHANNEL) | Optional |
| `version` | snowflake | Auto-incrementing version | Read-only |

### Command Name Constraints

**Regex**: `^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$` (with unicode flag)

- **CHAT_INPUT**: Must be lowercase, no spaces. If a letter has a lowercase variant, you must use it.
- **USER and MESSAGE**: Can be mixed case and include spaces (e.g., `❄️ Start Timer`).
- Length: 1-32 characters for all types.

## Command Options (CHAT_INPUT Only)

### Option Types

| Type | Value | Description | Constraints |
|------|-------|-------------|-------------|
| `SUB_COMMAND` | 1 | Subcommand container | Nests other options |
| `SUB_COMMAND_GROUP` | 2 | Groups subcommands | Contains only SUB_COMMANDs |
| `STRING` | 3 | Text input | min/max_length: 0-6000 |
| `INTEGER` | 4 | Whole number | Range: -2^53+1 to 2^53-1 |
| `BOOLEAN` | 5 | True/false | No additional constraints |
| `USER` | 6 | User picker | Resolves to user object |
| `CHANNEL` | 7 | Channel picker | Can filter by channel_types |
| `ROLE` | 8 | Role picker | Resolves to role object |
| `MENTIONABLE` | 9 | User or role picker | Includes users and roles |
| `NUMBER` | 10 | Decimal number | Range: -2^53 to 2^53 |
| `ATTACHMENT` | 11 | File upload | Resolves to attachment object |

### Option Object Structure

| Field | Type | Description | Valid For |
|-------|------|-------------|-----------|
| `type` | integer | Option type (1-11) | All |
| `name` | string | 1-32 characters | All |
| `name_localizations` | dictionary | Localized names | All |
| `description` | string | 1-100 characters | All |
| `description_localizations` | dictionary | Localized descriptions | All |
| `required` | boolean | Default false | All except SUB_COMMAND/GROUP |
| `choices` | array | Up to 25 predefined values | STRING, INTEGER, NUMBER |
| `options` | array | Up to 25 nested options | SUB_COMMAND, SUB_COMMAND_GROUP |
| `channel_types` | array | Restrict channel types | CHANNEL only |
| `min_value` | integer/double | Minimum allowed | INTEGER, NUMBER |
| `max_value` | integer/double | Maximum allowed | INTEGER, NUMBER |
| `min_length` | integer | Min string length (0-6000) | STRING |
| `max_length` | integer | Max string length (1-6000) | STRING |
| `autocomplete` | boolean | Enable dynamic suggestions | STRING, INTEGER, NUMBER |

**Critical rules**:
- Required options must be listed before optional options
- `autocomplete` cannot be true if `choices` are present
- If `choices` are specified, they are the **only** valid values

### Choice Object

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | 1-100 character display name |
| `name_localizations` | dictionary | Localized choice names |
| `value` | string/int/double | Value returned when selected (up to 100 chars if string) |

### Subcommands & Groups

- Using subcommands makes the base command unusable (e.g., having `/perms add` means `/perms` alone won't work)
- Only one level of nesting: command → group → subcommand (no groups within groups)
- Valid: command → subcommands directly
- Valid: command → groups → subcommands
- Valid: command → mix of groups and direct subcommands

## Registration

### Global vs Guild Commands

| Aspect | Global | Guild |
|--------|--------|-------|
| Availability | All guilds where app is installed | Specific guild only |
| DM support | Available in DMs | Not available in DMs |
| Update speed | Near-instant (read-repair on use) | **Instant** |
| Use case | Production deployment | Development/testing |
| Uniqueness | Per app, per type, globally | Per app, per type, per guild |

**Important**: Guild commands and global commands with the same name **both appear** in the command list — this causes duplicates. When testing with guild commands, delete or don't register the same commands globally.

### API Endpoints

**Global Commands**:
```
POST   /applications/{app_id}/commands              # Create (201 new, 200 update)
GET    /applications/{app_id}/commands              # List all
GET    /applications/{app_id}/commands/{cmd_id}     # Get one
PATCH  /applications/{app_id}/commands/{cmd_id}     # Update fields
DELETE /applications/{app_id}/commands/{cmd_id}     # Delete (204)
PUT    /applications/{app_id}/commands              # Bulk overwrite ALL types
```

**Guild Commands** (same structure, different base path):
```
POST   /applications/{app_id}/guilds/{guild_id}/commands
GET    /applications/{app_id}/guilds/{guild_id}/commands
GET    /applications/{app_id}/guilds/{guild_id}/commands/{cmd_id}
PATCH  /applications/{app_id}/guilds/{guild_id}/commands/{cmd_id}
DELETE /applications/{app_id}/guilds/{guild_id}/commands/{cmd_id}
PUT    /applications/{app_id}/guilds/{guild_id}/commands
```

**Authorization**: Bot token or client credentials token with `applications.commands.update` scope.

**Upsert behavior**: Creating a command with an already-used name for your app will update the existing command.

**Bulk overwrite (PUT)**: Overwrites **all** command types (slash, user, message). Commands not included in the array are deleted.

### CastBot Registration

```javascript
// commands.js — Define commands
const ALL_COMMANDS = [
  { name: 'castlist', type: 1, description: '...', options: [...] },
  { name: 'menu', type: 1, description: '...' },
  { name: '❄️ Start Timer', type: 3 },   // MESSAGE context menu
  { name: '❄️ Stop Timer', type: 3 },    // MESSAGE context menu
  { name: '❄️ Snowflake Info', type: 3 }, // MESSAGE context menu
];

// Deploy globally (production):
npm run deploy-commands

// Deploy to dev guild (instant, for testing):
node --input-type=module -e "
import { InstallGlobalCommands } from './utils.js';
import { ALL_COMMANDS } from './commands.js';
await InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS, process.env.DEV_GUILD_ID);
"
```

**Warning**: Guild deploy + existing global commands = duplicates. Only deploy context menus (type 3) to guild if slash commands are already global:
```javascript
const contextMenusOnly = ALL_COMMANDS.filter(c => c.type === 3);
await InstallGlobalCommands(appId, contextMenusOnly, guildId);
```

## Limits

| Limit | Value |
|-------|-------|
| Global CHAT_INPUT commands | 100 per app |
| Global USER commands | 15 per app |
| Global MESSAGE commands | 15 per app |
| Guild commands (each type) | Same as global limits, per guild |
| Options per command | 25 |
| Choices per option | 25 |
| Command name + description + values | 8000 characters combined (per command, including localizations) |
| Command creation rate | 200 per day, per guild |
| Command permissions per guild | 100 per command |

## Permissions

### default_member_permissions

Controls who can see/use the command by default. Set as a string of bitwise permission flags.

```javascript
// Only admins can see this command by default
{ default_member_permissions: '0' }

// Require MANAGE_CHANNELS
{ default_member_permissions: PermissionFlagsBits.ManageChannels.toString() }

// Anyone can use (default — omit the field)
```

Server admins can override these defaults via Server Settings → Integrations.

### Interaction Contexts

```javascript
{
  integration_types: [0, 1],  // 0 = GUILD_INSTALL, 1 = USER_INSTALL
  contexts: [0, 1, 2]        // 0 = GUILD, 1 = BOT_DM, 2 = PRIVATE_CHANNEL
}
```

### Runtime Permission Notes

- Members with Administrator permission can use all commands
- If a user doesn't have permission, the command is hidden from their picker
- Context menu commands require the user to have Send Messages permission in the channel
- Thread permissions inherit from parent channel

## Interaction Payloads

All command types produce an interaction with `type: 2` (APPLICATION_COMMAND). The `data.type` field distinguishes the command type.

### Slash Command Payload (data.type === 1)

```javascript
{
  type: 2,  // APPLICATION_COMMAND
  data: {
    type: 1,              // CHAT_INPUT
    id: "command_id",
    name: "castlist",
    options: [
      { type: 3, name: "castlist", value: "Season 47" }
    ]
  },
  guild_id: "...",
  channel_id: "...",
  member: { user: { id: "..." }, permissions: "..." },
  token: "...",           // 15-minute response token
  id: "...",              // Interaction snowflake
  app_permissions: "...", // Bot's permissions in this channel
  locale: "en-US",        // User's locale
  guild_locale: "en-US"   // Server's locale
}
```

### User Context Menu Payload (data.type === 2)

```javascript
{
  type: 2,  // APPLICATION_COMMAND
  data: {
    type: 2,              // USER
    id: "command_id",
    name: "View Profile",
    target_id: "user_snowflake",
    resolved: {
      users: {
        "user_snowflake": { id: "...", username: "...", avatar: "...", ... }
      },
      members: {
        "user_snowflake": { nick: "...", roles: [...], joined_at: "...", ... }
      }
    }
  },
  // ... same wrapper fields as slash commands
}
```

### Message Context Menu Payload (data.type === 3)

```javascript
{
  type: 2,  // APPLICATION_COMMAND
  data: {
    type: 3,              // MESSAGE
    id: "command_id",
    name: "❄️ Snowflake Info",
    target_id: "message_snowflake",
    resolved: {
      messages: {
        "message_snowflake": {
          id: "...",
          content: "message text...",
          author: { id: "...", username: "...", ... },
          channel_id: "...",
          timestamp: "2026-04-03T15:42:15.000Z",
          attachments: [...],
          embeds: [...],
          // ... full message object
        }
      }
    }
  },
  // ... same wrapper fields as slash commands
}
```

**Critical for CastBot**: The `target_id` is the message's snowflake ID, which encodes the message creation timestamp. This is the foundation of the Snowflake Timer system — `snowflakeToTimestamp(data.target_id)` extracts the exact time the message was created.

## CastBot Context Menu Implementation

### Handler Location

Context menu handlers MUST be dispatched **before** analytics logging in the APPLICATION_COMMAND section of `app.js`. The analytics code (channel fetch, logInteraction, loadPlayerData) takes >3 seconds and causes Discord timeout.

```javascript
if (type === InteractionType.APPLICATION_COMMAND) {
  const name = data.name;

  // CONTEXT MENUS FIRST — before analytics
  if (data.type === 3) {
    const targetMessageId = data.target_id;
    const targetMessage = data.resolved?.messages?.[targetMessageId];
    // ... handler logic (pure snowflake math, instant response)
    return res.send({ ... });
  }

  // Analytics logging (slow — channel fetch, DB load)
  // ... existing analytics code ...

  // Slash command handlers
  if (name === 'castlist') { ... }
  if (name === 'menu') { ... }
}
```

### Discord Sorts Context Menus Alphabetically

Commands in the right-click → Apps submenu are sorted alphabetically by name. Plan names accordingly:

```
❄️ Snowflake Info   (S comes first)
❄️ Start Timer      (St after Sn)
❄️ Stop Timer       (Sto after Sta)
```

## Autocomplete

Autocomplete enables dynamic option suggestions as the user types. Only for STRING, INTEGER, and NUMBER options.

```javascript
// Register with autocomplete
{ type: 3, name: 'search', description: '...', autocomplete: true }

// Handle autocomplete interaction (type 4)
if (type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
  const focused = data.options.find(o => o.focused);
  const results = searchItems(focused.value); // partial user input
  return res.send({
    type: InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: { choices: results.slice(0, 25).map(r => ({ name: r.label, value: r.id })) }
  });
}
```

**Notes**:
- Cannot use `autocomplete: true` with `choices` on the same option
- User input is client-side validated only — the value sent may not match any suggestion
- The `focused: true` field marks which option the user is currently typing in

## Localization

Command names and descriptions can be localized per Discord locale.

```javascript
{
  name: 'castlist',
  name_localizations: { 'es-ES': 'lista', 'fr': 'liste' },
  description: 'Display castlist',
  description_localizations: { 'es-ES': 'Mostrar lista', 'fr': 'Afficher la liste' }
}
```

**Locale fallbacks**: en-US falls back to en-GB (and vice versa), es-419 falls back to es-ES.

**Size limit**: When localizations are present, only the longest localization per field counts toward the 8000-character command limit.

## References

- [Discord Application Commands](https://docs.discord.com/developers/interactions/application-commands)
- [Discord Interaction Types](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Discord Permissions](https://docs.discord.com/developers/topics/permissions)
- [RaP 0925: Snowflake Timer Analysis](../01-RaP/0925_20260403_SnowflakeTimer_Analysis.md) - Context menu implementation spec
