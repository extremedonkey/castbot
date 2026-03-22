# CastBot Security & Permissions Architecture

**Purpose**: Comprehensive reference for how CastBot enforces permissions, who can access what, and how channel visibility is managed. This is the single source of truth for security decisions — individual feature docs should link here rather than re-documenting permission patterns.

**Related**: [DiscordPermissions.md](../standards/DiscordPermissions.md) (Discord API permission reference) | [ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md) (factory `requiresPermission` option)

---

## Permission Tiers

CastBot enforces three permission tiers. All permission checks happen server-side before any handler logic executes.

### Tier 1: Server Admin

A user is considered a CastBot admin if they have **any one** of these Discord permissions:

| Permission | Hex | Typical Discord Role |
|---|---|---|
| `ADMINISTRATOR` | `0x8` | Server Owner, Full Admin |
| `MANAGE_ROLES` | `0x10000000` | Moderator, Co-Host |
| `MANAGE_CHANNELS` | `0x10` | Channel Manager |
| `MANAGE_GUILD` | `0x20` | Server Settings Manager |

**Gate function** — `hasAdminPermissions(member)` in app.js:

```javascript
function hasAdminPermissions(member) {
  if (!member || !member.permissions) return false;
  const permissions = BigInt(member.permissions);
  const adminPermissions =
    PermissionFlagsBits.ManageChannels |
    PermissionFlagsBits.ManageGuild |
    PermissionFlagsBits.ManageRoles |
    PermissionFlagsBits.Administrator;
  return (permissions & BigInt(adminPermissions)) !== 0n;
}
```

**What admins can access**: Production Menu (full server management), Safari management, store creation/editing, custom actions, cast ranking, player management, data import/export.

### Tier 2: Player (Default)

Any user who fails `hasAdminPermissions()`. They see the **Player Menu** only.

**What players can access**: Personal profile (pronouns, timezones, age), Safari gameplay (map movement, store purchases, action triggers), castlist viewing, season applications.

### Tier 3: Super Admin (Reece)

Hardcoded user ID check: `userId === '391415444084490240'`

**What Reece can access**: Reece's Stuff menu, Data Admin panel (analytics exports, data nukes), emergency admin tools, bot restart, Season Planner.

---

## Enforcement Mechanisms

### 1. `hasAdminPermissions()` — The `/menu` Gate

The primary fork point. When a user runs `/menu`, this function determines whether they see the Production Menu (admin) or Player Menu (player).

```javascript
const isAdmin = hasAdminPermissions(member);
if (isAdmin) {
  // Production Menu
} else {
  // Player Menu
}
```

### 2. `permissionUtils.js` — Reusable Utilities

Located at `utils/permissionUtils.js`. Four functions:

| Function | Purpose | Sends error response? |
|---|---|---|
| `requirePermission(req, res, permission)` | Check a specific Discord permission | Yes — ephemeral denial |
| `requireAdminPermission(req, res)` | Check any of the 4 admin permissions | Yes — ephemeral denial |
| `requireSpecificUser(req, res, userId)` | Check exact user ID | Yes — ephemeral denial |
| `hasPermission(member, permission)` | Boolean check only | No — returns true/false |

**Usage pattern** (most common — used 100+ times):
```javascript
if (!requirePermission(req, res, PERMISSIONS.MANAGE_ROLES, 'You need Manage Roles permission.')) return;
```

### 3. ButtonHandlerFactory — Declarative Permission

Buttons declare their permission requirement in the factory config. The factory checks before calling the handler.

```javascript
ButtonHandlerFactory.create({
  id: 'safari_progress',
  requiresPermission: PermissionFlagsBits.ManageRoles,
  permissionName: 'Manage Roles',
  handler: async (context) => {
    // Only executes if permission check passes
  }
})
```

### 4. User ID Gate — Reece-Only Features

Checked **before** the factory call to prevent handler execution entirely:

```javascript
if (req.body.member?.user?.id !== '391415444084490240') {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: '❌ Access denied.', flags: InteractionResponseFlags.EPHEMERAL }
  });
}
return ButtonHandlerFactory.create({ ... })(req, res, client);
```

### 5. Denial Response

All permission denials are **ephemeral** (only visible to the requesting user). The handler never executes. Format:

```
❌ You need Manage Roles permission to use this feature.
```

---

## Roles & Security Settings (`globalRoleAccess`)

### Purpose

Lets server admins designate Discord roles as CastBot admins — for users who don't have Discord-level admin permissions but should be treated as CastBot admins (e.g. a "Co-Host" role).

### UI Access

`/menu` → Settings → Roles & Security (`🔐`)

### Configuration

- **Storage**: `playerData[guildId].permissions.globalRoleAccess` — array of up to 10 role IDs
- **UI**: Role Select (type 6, min 1, max 10) + red "Clear All" button
- **Handler permission**: Requires `MANAGE_ROLES` to configure
- **Code location**: UI in `safariConfigUI.js` (`createRolesSecurityUI()`), handlers in app.js

### Current Scope

`globalRoleAccess` is **only enforced in Season Applications** today. When `applicationManager.js` creates a new application channel, it adds channel permission overwrites for each `globalRoleAccess` role:

```javascript
const globalRoleAccess = data[guild.id]?.permissions?.globalRoleAccess || [];
for (const roleId of globalRoleAccess) {
  const role = guild.roles.cache.get(roleId);
  if (role) {
    permissionOverwrites.push({
      id: roleId,
      allow: [ViewChannel, SendMessages, ReadMessageHistory]
    });
  }
}
```

Application channels also display an access disclosure:
> Additional roles configured in CastBot Settings: @Co-Host, @Producer

### Target State (Not Yet Implemented)

`globalRoleAccess` should become an **additional OR condition** in `hasAdminPermissions()`:

```
User is CastBot admin if:
  ADMINISTRATOR OR MANAGE_ROLES OR MANAGE_CHANNELS OR MANAGE_GUILD
  OR member has a role in globalRoleAccess    ← future
```

This would unlock Production Menu, Safari management, and all admin-gated features for `globalRoleAccess` roles — not just application channel visibility.

**Status**: Needs design and testing before implementation. Key considerations:
- `hasAdminPermissions()` currently only receives `member.permissions` (a BigInt) — it would need the member's role list and guild ID to check `globalRoleAccess`
- Performance: requires loading `playerData` on every permission check
- Caching strategy for role lookups

---

## Channel Permission Modifications

Five systems modify Discord channel permissions. These are **gameplay mechanics**, not admin access — they control which channels individual players can see and type in.

### Season Applications

**When**: A player clicks "Apply" on a season application.

**What happens**: Creates a private application channel with permission overwrites for:
- The applicant (ViewChannel, SendMessages, ReadMessageHistory)
- `@everyone` denied ViewChannel
- Server admins (inherit from Discord permissions)
- `globalRoleAccess` roles (ViewChannel, SendMessages, ReadMessageHistory)

**Code**: `applicationManager.js` lines 320-360

### Map Movement

**When**: A player moves between map coordinates (e.g. A1 → B1).

**What happens**:
1. **Grant** ViewChannel + SendMessages on the **new** location channel (first)
2. **Revoke** ViewChannel + SendMessages on the **old** location channel (second)

Order matters — grant before revoke prevents players being locked out during transitions.

**Code**: `mapMovement.js` — `grantNewChannelPermissions()`, `removeOldChannelPermissions()`

### Map Explorer (Channel Creation)

**When**: Admin initializes the map system.

**What happens**: Creates a category (`🗺️ Map Explorer`) and per-coordinate text channels, all with `@everyone` denied ViewChannel. Also creates a hidden `🗺️map-storage` channel for map images.

**Code**: `mapExplorer.js` — `initializeMapChannels()`

### Paused Players

**When**: Admin pauses/unpauses a player (e.g. during a game break).

**What happens**: Toggles ViewChannel + SendMessages on the player's current location channel. Paused players can't see or type in their location.

**Code**: `pausedPlayersManager.js`

### Safari Deinitialization

**When**: A player is removed from Safari (admin action or self-removal).

**What happens**: Revokes ViewChannel + SendMessages on all location channels the player had access to.

**Code**: `safariDeinitialization.js`

---

## Bot Permission Requirements

CastBot itself needs these Discord permissions to function (configured when adding the bot to a server):

| Permission | Why |
|---|---|
| `MANAGE_ROLES` | Create/assign pronoun, timezone, tribe, and reaction roles |
| `MANAGE_CHANNELS` | Create application channels, map channels, categories |
| `SEND_MESSAGES` | Post messages in channels |
| `EMBED_LINKS` | Rich embeds (analytics, castlists) |
| `ATTACH_FILES` | Safari maps, emoji uploads |
| `USE_EXTERNAL_EMOJIS` | Custom emojis in UI |
| `ADD_REACTIONS` | Reaction role setup |
| `VIEW_CHANNEL` | Access channels to post in |
| `READ_MESSAGE_HISTORY` | Message context for reactions |

---

## Building New Features — Permission Checklist

When building a feature that needs access control:

1. **Decide the tier**: Should this be Admin, Player, or Reece-only?
2. **Use the right enforcement mechanism**:
   - Admin features: `requirePermission(req, res, PERMISSIONS.MANAGE_ROLES)` or factory `requiresPermission`
   - Reece-only: user ID check before factory
   - Player features: no permission check needed (default)
3. **Never inline BigInt permission checks** — use `permissionUtils.js` functions or factory options
4. **Default to ephemeral** — players should not see admin interfaces or error messages
5. **If your feature creates channels**: consider whether `globalRoleAccess` roles should have access (follow the `applicationManager.js` pattern)
6. **If your feature modifies channel permissions**: document it in this file under "Channel Permission Modifications"
7. **Don't invent parallel permission systems** — extend the existing tiers, don't create new ones

---

## Related Documentation

- **[DiscordPermissions.md](../standards/DiscordPermissions.md)** — Discord API permission flags, BigInt patterns, bit values
- **[ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md)** — `requiresPermission` factory option, permission enforcement in buttons
- **[SafariMapMovement.md](../03-features/SafariMapMovement.md)** — Map movement permission flow (grant/revoke pattern)
- **[SeasonAppBuilder.md](../03-features/SeasonAppBuilder.md)** — Application channel creation
- **[SafariMapExplorer.md](../03-features/SafariMapExplorer.md)** — Map channel initialization

---

*Last Updated: 2026-03-22*
