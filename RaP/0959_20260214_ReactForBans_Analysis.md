# RaP 0959 - React for Bans Feature Analysis & Design

**Date**: 2026-02-14
**Author**: Claude Code
**Status**: ✅ Implemented & Deployed to Production (2026-02-14)
**Related**: [ReactionRoleSystem.md](../docs/features/ReactionRoleSystem.md)

---

## Original Context (User Prompt Summary)

Combat bot spam wave: Bots join Discord servers and auto-react to gain roles/trusted access. Admins deploy a "React for Bans" honeypot — a reaction message that looks enticing to bots but warns humans away (using quirky Unicode text). Any user/bot that reacts gets **automatically banned**.

The feature extends the existing Pronouns & Timezones menu into a broader "Reaction Roles" system.

---

## 🤔 Problem Statement

Discord servers are experiencing waves of bot accounts that join and automatically interact with role-assignment messages to elevate their permissions. Current reaction role messages (pronouns/timezones) inadvertently provide bots with a mechanism to gain trusted roles. We need a honeypot — a reaction message specifically designed to attract and automatically ban these bot accounts.

---

## 🏛️ Existing Architecture Analysis

### What Works Well (Reuse These)

| Component | Location | Reusability |
|-----------|----------|-------------|
| `saveReactionMapping()` | storage.js:579 | ✅ Direct reuse — mapping structure supports metadata flags |
| `getReactionMapping()` | storage.js:608 | ✅ Direct reuse — returns mapping with any flags |
| `loadAllReactionMappings()` | storage.js:630 | ✅ Direct reuse — loads all mappings on startup |
| `client.roleReactions` Map | app.js:1714 | ✅ Extend — add `isBan: true` flag like `isTimezone: true` |
| `messageReactionAdd` handler | app.js:42031 | 🔧 Extend — add ban branch alongside timezone/pronoun |
| `checkRoleHierarchyPermission()` | utils/roleUtils.js:13 | ✅ Reuse — permission check before ban role operations |
| `cleanupMissingRoles()` | storage.js | ✅ Reuse — cleanup before posting |
| Webhook message retrieval pattern | app.js:19875 | ✅ Reuse — more reliable than `setTimeout` + channel fetch |

### What Needs New Code

| Component | Reason |
|-----------|--------|
| `prod_ban_react` button handler | New button in the menu |
| Ban role idempotent creation | Find-or-create "React for Bans" role in Discord |
| `guild.members.ban()` call | New Discord API call (never used before in codebase) |
| Ban mapping update on re-post | Update existing ban mappings if role ID changes |
| `playerData[guildId].banRoleIds` | New persistent storage field |
| `BanMembers` permission check | New permission requirement |

### 🐛 Bugs Discovered During Analysis

#### 1. DUPLICATE `messageReactionRemove` Handlers (Critical)

**Two separate `client.on('messageReactionRemove')` handlers exist:**

- **Legacy handler** (app.js:41904-41930): Only checks in-memory cache, no persistent storage fallback, no permission checks, no availability message support. Only handles pronoun removal.
- **Comprehensive handler** (app.js:42190-42295): Full persistent storage fallback, permission checks, availability message support, proper error handling.

**Impact**: Both handlers fire on every reaction removal. The legacy handler at 41904 will process the reaction first (registered first), potentially causing double role removal or logging inconsistencies. For ban reactions, this means the legacy handler could try to remove the ban role before the comprehensive handler processes it.

**Recommendation**: Remove the legacy handler at 41904-41930 as part of this work. The comprehensive handler at 42190 covers all its functionality.

#### 2. 30-Day Cleanup Would Delete Ban Mappings

`cleanupOldReactionMappings()` (storage.js:639) deletes any reaction mapping older than 30 days. Ban messages should persist indefinitely.

**Fix**: Add `isBan` check to skip ban mappings during cleanup:
```javascript
if (mappingData.createdAt < thirtyDaysAgo && !mappingData.mapping?.isBan) {
  delete data[guildId].reactionMappings[messageId];
}
```

#### 3. `isPronoun` Flag Set But Never Read

`createPronounReactionMessage` (roleManager.js:2309) sets `roleMapping.isPronoun = true` but the `messageReactionAdd` handler never checks this flag. Only `isTimezone` is checked. Not a bug currently, but inconsistent — the ban feature should follow the timezone pattern (`isBan` actually checked in handler).

### 📋 Documentation Staleness Found

**ReactionRoleSystem.md** has stale line references:
- Says "app.js:35908-36172" for event handlers → actual: **42031-42318**
- Says "prod_timezone_react (app.js:16865)" → actual: **19791**
- Says "messageReactionAdd (app.js:35908-36065)" → actual: **42031-42188**
- Says "messageReactionRemove (app.js:36067-36172)" → actual: **42190-42295**
- Says "messageDelete (app.js:36174-36195)" → actual: **42298-42318**
- Missing: No mention of the duplicate legacy `messageReactionRemove` handler at 41904

**ButtonHandlerRegistry.md** has stale line reference:
- Says "app.js:~6328" for `prod_manage_pronouns_timezones` → actual: **7471**

These will be updated as part of implementation.

---

## 💡 Technical Design

### Data Structure

```javascript
// playerData[guildId] - NEW field alongside existing timezones/pronounRoleIDs
playerData[guildId].banRoleIds = {
  'roleId_123': {
    type: 'ban',           // Future: 'mute', 'kick', etc.
    roleName: 'React for Bans',
    createdAt: 1739520000000,
    lastUpdated: 1739520000000
  }
};
// Future extensibility: 'mute' type could use guild.members.timeout()

// Reaction mapping (reuses existing structure)
playerData[guildId].reactionMappings[messageId] = {
  mapping: {
    '🎯': 'roleId_123',
    isBan: true            // New flag, parallel to isTimezone
  },
  createdAt: Date.now(),
  lastAccessed: Date.now()
};
```

### Ban Role Idempotent Creation (Reusable Pattern)

```javascript
// Pattern: Find existing role → create if missing → store in playerData
// Same pattern as executeSetup() for pronouns/timezones

async function ensureBanRole(guild, guildId) {
  const playerData = await loadPlayerData();
  const existingBanRoles = playerData[guildId]?.banRoleIds || {};

  // 1. Search Discord for role named "React for Bans"
  const discordRole = guild.roles.cache.find(r => r.name === 'React for Bans');

  if (discordRole) {
    // Role exists in Discord — update playerData
    existingBanRoles[discordRole.id] = {
      type: 'ban',
      roleName: 'React for Bans',
      createdAt: existingBanRoles[discordRole.id]?.createdAt || Date.now(),
      lastUpdated: Date.now()
    };
  } else {
    // Create role (positioned at bottom, not assignable via hierarchy)
    const newRole = await guild.roles.create({
      name: 'React for Bans',
      color: 0xe74c3c,     // Red
      reason: 'CastBot React for Bans honeypot',
      permissions: []       // No permissions - purely a marker role
    });
    existingBanRoles[newRole.id] = {
      type: 'ban',
      roleName: 'React for Bans',
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };
  }

  // Save to playerData
  if (!playerData[guildId]) playerData[guildId] = {};
  playerData[guildId].banRoleIds = existingBanRoles;
  await savePlayerData(playerData);

  // Return the role ID (first ban role - as spec says "go with the first one")
  return Object.keys(existingBanRoles)[0];
}
```

### Update Existing Ban Mappings (Reusable for Future React-for-Pronouns/Timezones)

```javascript
// When ban role ID changes, update all existing ban reaction mappings
async function updateReactionMappingsForRole(guildId, oldRoleId, newRoleId, flagKey) {
  // flagKey: 'isBan', 'isTimezone', 'isPronoun' — makes this reusable
  const playerData = await loadPlayerData();
  const mappings = playerData[guildId]?.reactionMappings || {};
  let updated = 0;

  for (const [messageId, mappingData] of Object.entries(mappings)) {
    if (mappingData.mapping?.[flagKey]) {
      // Find and replace the old role ID
      for (const [emoji, roleId] of Object.entries(mappingData.mapping)) {
        if (roleId === oldRoleId) {
          mappingData.mapping[emoji] = newRoleId;
          updated++;
        }
      }
    }
  }

  if (updated > 0) {
    await savePlayerData(playerData);
    console.log(`🔄 Updated ${updated} ${flagKey} reaction mappings: ${oldRoleId} → ${newRoleId}`);
  }

  return updated;
}
```

### Ban Message Content (Unicode Obfuscation)

```javascript
// Unicode variants that humans can read but bots scanning for keywords would miss
const BAN_TITLE = '🎯 React for ᗷᗩᑎᔕ';  // Bans in Canadian Syllabics
const BAN_LABEL = 'ᗷᗩᑎ';                  // Ban label for reaction list

// Message description with mixed Unicode
const BAN_DESCRIPTION =
  'The following should not be used by real people — this is intended to be clicked by ᗷOTᔕ ' +
  'who may spam to gain trusted access to the server. ' +
  'Clicking this will automatically ᗷᗩᑎ you from the server.';
```

### Reaction Message Format

Uses Components V2 Container (same as pronoun reaction message):
- **Accent color**: `0xe74c3c` (bright red — danger)
- **Single reaction**: 🎯 mapped to the ban role
- **Embed title**: `🎯 React for ᗷᗩᑎᔕ`
- **Embed description**: Warning text with Unicode-obfuscated keywords

### Event Handler Extension (messageReactionAdd)

In the existing `messageReactionAdd` handler (app.js:42159-42184), add a new branch:

```javascript
if (isTimezoneRole) {
  // ... existing timezone logic ...
} else if (roleMapping.isBan) {
  // BAN THE USER
  try {
    console.log(`🎯 BAN TRAP: User ${user.tag} (${user.id}) triggered React for Bans in ${guild.name}`);

    // Remove reaction first (visual feedback)
    await reaction.users.remove(user.id);

    // Execute ban
    await guild.members.ban(user.id, {
      reason: `CastBot React for Bans honeypot - user reacted to ban trap message`,
      deleteMessageSeconds: 604800  // Delete 7 days of messages (common for spam bots)
    });

    console.log(`🔨 BANNED: ${user.tag} (${user.id}) from ${guild.name} via React for Bans`);
  } catch (banError) {
    console.error(`❌ Failed to ban ${user.tag} in ${guild.name}:`, banError.message);
    // If ban fails (missing permission), remove reaction silently
  }
} else {
  // Regular pronoun role - just add it
  await member.roles.add(roleId);
}
```

### Permission Requirements

1. **Bot needs `BanMembers` permission** — `guild.members.ban()` requires this
2. **Pre-check in button handler** — Before posting, verify bot has ban permission:
   ```javascript
   const botMember = await guild.members.fetch(client.user.id);
   if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
     return { content: '❌ CastBot needs **Ban Members** permission to use React for Bans.' };
   }
   ```
3. **Role hierarchy check** — The ban role itself doesn't need hierarchy checks (we're banning, not assigning the role). But `guild.members.ban()` has its own hierarchy — bot can't ban members with roles higher than the bot's highest role.

### messageReactionRemove Handling

For ban mappings, the `messageReactionRemove` handler should **do nothing** — if a user reacts and gets banned, they're gone. If somehow they unreact before the ban executes, we don't want to "un-ban" them. Add early return:

```javascript
// In messageReactionRemove handler
if (roleMapping?.isBan) {
  return; // Don't process reaction removal for ban traps
}
```

---

## 📊 Implementation Plan

### File Changes

| File | Changes |
|------|---------|
| **menuBuilder.js:37-40** | Rename button label: "Pronouns & Timezones" → "Reaction Roles" |
| **app.js:7471-7574** | Update `prod_manage_pronouns_timezones` menu: title, copy, add "Other" section with `prod_ban_react` button |
| **app.js (new handler)** | Add `prod_ban_react` button handler (~60 lines) |
| **app.js:42159-42184** | Extend `messageReactionAdd` with `isBan` branch |
| **app.js:42190-42295** | Add `isBan` early return in `messageReactionRemove` |
| **app.js:41904-41930** | Remove duplicate legacy `messageReactionRemove` handler |
| **storage.js:639-656** | Skip `isBan` mappings in 30-day cleanup |
| **buttonHandlerFactory.js:447-494** | Update registry labels, add `prod_ban_react` entry |
| **roleManager.js (new)** | Add `ensureBanRole()` and export it |
| **app.js:1429-1437** | No change needed — `guild.members.ban()` doesn't need a Gateway Intent, it uses REST API |
| **src/analytics/analyticsLogger.js:14** | Update label mapping |
| **src/analytics/serverUsageAnalytics.js:365** | Add `prod_ban_react` to reactForRoles tracking |

### Documentation Updates

| File | Changes |
|------|---------|
| **docs/features/ReactionRoleSystem.md** | Fix all stale line references, add React for Bans section |
| **docs/enablers/ButtonHandlerRegistry.md:22** | Update label and line reference |
| **docs/ui/MenuHierarchy.md:195-201** | Rename to "Reaction Roles" menu |
| **docs/enablers/MenuSystemArchitecture.md:165** | Update menu name |

---

## ⚠️ Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Admin accidentally clicks ban reaction | Medium | Warning text makes it very clear; could add admin-exclusion but user didn't request it |
| Bot doesn't have BanMembers permission | Low | Pre-check in button handler, graceful error in reaction handler |
| Ban trap message deleted → orphaned mapping | None | Existing `messageDelete` handler already cleans up |
| 30-day cleanup deletes ban mappings | Medium | Fixed by adding `isBan` check to cleanup function |
| Legacy duplicate handler interferes | Medium | Fixed by removing legacy handler at 41904-41930 |
| Rate limiting on rapid bot bans | Low | Discord.js has built-in rate limiting; bots likely react one at a time |

---

## 🔍 Clarifying Questions

1. **Admin self-ban protection**: Should we skip banning users who have `ManageRoles` or `Administrator` permission? (Prevents admin from accidentally banning themselves while testing.) **Recommendation**: Yes, add this safeguard.

2. **Ban notification channel**: Should the bot post a log message (e.g., to the channel where the ban message lives, or to a configured log channel) when a ban occurs? Or is the console log sufficient? **Recommendation**: Console log is sufficient for now; the Discord audit log captures the ban automatically.

3. **Delete messages on ban**: The design uses `deleteMessageSeconds: 604800` (7 days) to delete the banned user's messages. Is this the desired behavior, or should we keep their messages? **Recommendation**: Delete 7 days (standard for spam bots).

---

## 📝 TL;DR

**What**: Add a "React for Bans" honeypot to the existing reaction roles system. Bots that auto-react to gain roles will trigger an instant ban instead.

**Menu changes**: Rename "Pronouns & Timezones" button to "Reaction Roles" in prod_setup. Add an "Other" section to the submenu with a "Post React for Ban" button.

**How it works**:
1. Admin clicks "Post React for Ban" → bot finds/creates a "React for Bans" role idempotently → posts a red-accented message with Unicode-obfuscated warning text and a single 🎯 reaction
2. When any user reacts → existing `messageReactionAdd` handler checks `isBan` flag → bans the user + deletes 7 days of messages
3. Ban mappings are excluded from 30-day cleanup, persist across restarts via existing dual-storage system

**Bugs fixed along the way**:
- Remove duplicate `messageReactionRemove` handler (app.js:41904-41930)
- Fix 30-day cleanup to skip ban mappings
- Update stale line references in ReactionRoleSystem.md and other docs

**New code**: ~80 lines for handler + ~40 lines for role creation utility. Everything else is reuse/extension of existing patterns.

**Permissions**: Bot needs `BanMembers` permission (checked before posting).

---

*RaP 0959 | React for Bans | 2026-02-14*
