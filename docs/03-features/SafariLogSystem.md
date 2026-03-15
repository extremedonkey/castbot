# Safari Log System Documentation

## Overview

The Safari Log System provides comprehensive logging and monitoring of player interactions within the Safari game environment. It captures detailed information about player actions, movements, commands, and other interactions, posting formatted messages to dedicated Discord channels for administrators to monitor gameplay.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Implementation Status](#implementation-status)
3. [Configuration](#configuration)
4. [Log Types](#log-types)
5. [Technical Implementation](#technical-implementation)
6. [Critical Debugging Discoveries](#critical-debugging-discoveries)
7. [Message Formatting](#message-formatting)
8. [Admin Interface](#admin-interface)
9. [Integration Points](#integration-points)
10. [Troubleshooting](#troubleshooting)
11. [Future Enhancements](#future-enhancements)

## System Architecture

### Core Components

1. **`safariLogger.js`** - Clean API for Safari-specific logging functions
2. **`src/analytics/analyticsLogger.js`** - Enhanced with Safari log posting capabilities
3. **`safariInitialization.js`** - Default Safari log settings structure
4. **Admin UI Integration** - Configuration interface in production menu

### Data Flow

```
Safari Interaction → safariLogger.js → analyticsLogger.js → Discord Channel
     |                    |                    |                    |
   Action Data     Clean API Call     Rate Limiting      Formatted Message
  + Context       + Validation       + Conditions       + Rich Display
```

## Implementation Status

✅ **Complete Safari Log System** - Fully functional with all interaction types
✅ **Custom Action Logging** - Safari buttons and player commands
✅ **Enhanced Formatting** - Button labels, emojis, and channel context
✅ **Admin Configuration** - Complete UI for managing log settings
✅ **Rate Limiting Fix** - Safari logs processed independently of analytics
✅ **Channel Context** - Location coordinates with channel names (#a1)
✅ **Button Label Resolution** - Shows actual button names and emojis (including BUTTON_REGISTRY fallback for wildcard patterns)
✅ **Test Message Support** - Admin testing functionality
✅ **Stamina Change Logging** - Before/after stamina tags on movement, initialization, consumable use, and action outcomes
✅ **Stamina Changes Toggle** - `staminaChanges` log type toggle for Safari Log (hosts can control independently)

## Configuration

### Default Settings Structure (safariContent.json)

```json
{
  "guildId": {
    "safariLogSettings": {
      "enabled": false,
      "logChannelId": null,
      "productionRoleId": null,
      "logTypes": {
        "whispers": true,
        "itemPickups": true,
        "currencyChanges": true,
        "storeTransactions": true,
        "buttonActions": true,
        "mapMovement": true,
        "attacks": true,
        "customActions": true,
        "testMessages": true,
        "staminaChanges": true
      },
      "formatting": {
        "accentColor": 0x9B59B6,
        "useEmbeds": false,
        "showTimestamps": true,
        "showLocations": true
      }
    }
  }
}
```

### Admin Configuration Interface

**Access Path:** `/menu` → Production Menu → Safari → Safari Log Configuration

**Available Controls:**
- **Enable/Disable Toggle** - Master switch for Safari logging
- **Log Channel Selection** - Choose Discord channel for log messages
- **Log Type Toggles** - Granular control over what gets logged
- **Send Test Message** - Verify configuration is working

## Log Types

### 1. Player Movement (SAFARI_MOVEMENT)
**Triggers:** When players move between map coordinates, or when players are initialized on the map
**Format:** `🗺️ **MOVEMENT** | [time] | @user moved from **A1** (#a1) to **B2** (#b2) (⚡1/1 → 0/1 ♻️12hr)`

**Stamina Tags:** Movement and initialization events include a stamina snapshot showing before/after state:
- Movement: `(⚡1/1 → 0/1 ♻️12hr)` — consumed 1 stamina, next regen in 12 hours
- Initialization: `(⚡0/1 → 1/1)` — started with 1/1 stamina (Ready, no regen tag)

**Initialization sub-type:** When `fromLocation` is null, the event is a player initialization rather than a movement. Activity log shows these with the 🚀 Init type.

### 2. Custom Actions (SAFARI_CUSTOM_ACTION)
**Triggers:** Safari button interactions and player commands
**Enhanced Format:** 
```
🎯 **CUSTOM ACTION** | [time] | @user at **A1** (#a1)
> Button: 🍆 Moi MVP (moi_mvp_401745)
> Display Text: "Title" - content
```

### 3. Whispers (SAFARI_WHISPER)
**Triggers:** Private player-to-player messages
**Format:** `🤫 **WHISPER** | [time] | @sender → @recipient at **A1** (#a1)`

### 4. Item Pickups (SAFARI_ITEM_PICKUP)
**Triggers:** When players collect items
**Format:** `🧰 **ITEM PICKUP** | [time] | @user at **A1** (#a1)`

### 5. Currency Changes (SAFARI_CURRENCY)
**Triggers:** Currency gains/losses
**Format:** `🪙 **CURRENCY** | [time] | @user at **A1** (#a1)`

### 6. Store Purchases (SAFARI_PURCHASE)
**Triggers:** Item purchases from Safari stores
**Format:** `🛒 **PURCHASE** | [time] | @user at **Store Name** (A1 #a1)`

### 7. Test Messages (SAFARI_TEST)
**Triggers:** Admin test button
**Format:** `🧪 **TEST MESSAGE** | [time] | @admin from safari-config`

## Stamina Change Logging

### Overview

Every stamina change — consumption, initialization, boosts, admin overrides — is logged across all three logging systems with a before/after stamina tag.

### Stamina Tag Format

```
(⚡{before}/{max} → {after}/{max} ♻️{regenTime})
```

| Event | Example Tag |
|-------|-------------|
| Movement (cost 1) | `(⚡1/1 → 0/1 ♻️12hr)` |
| Initialization | `(⚡0/1 → 1/1)` |
| Consumable use (+2) | `(⚡0/1 → 2/1)` |
| Action outcome (-2) | `(⚡3/3 → 1/3 ♻️2hr)` |
| Admin set to 5 | `(⚡1/1 → 5/1)` |

When stamina is full or just regenerated, the `♻️` regen countdown is omitted.

### Three Logging Systems

| System | Audience | Where Stamina Appears |
|--------|----------|-----------------------|
| **Live Discord Logging** | Bot owner | Appended to SAFARI_MOVEMENT log details |
| **Safari Log** | Host (per-server) | Appended to movement/init format string |
| **Player Activity Log** | Player (self) | Inline `` `⚡0/1` `` and `` `cd: 12hr` `` tags |

### Implementation Architecture

```
Stamina Change Event
  ↓
pointsManager.js — createStaminaSnapshot(before, after, max, regenTime)
  ↓
safariLogger.js — logPlayerMovement() / logPlayerInitialization()
  ↓
analyticsLogger.js — logInteraction() → postToSafariLog() + postToDiscordLogs()
  +
activityLogger.js — addActivityEntryAndSave() with { stamina, cd } opts
```

**Key files:**
- `pointsManager.js` — `createStaminaSnapshot()`, `formatStaminaTag()` — snapshot creation and formatting
- `safariLogger.js` — Orchestrates logging calls, formats stamina tags into descriptions
- `src/analytics/analyticsLogger.js` — SAFARI_MOVEMENT case reads `safariContent.staminaSnapshot`
- `activityLogger.js` — `formatActivityEntry()` renders `entry.stamina` and `entry.cd` inline

### Stamina Changes Toggle

Hosts can control stamina logging independently via the `staminaChanges` toggle in Safari Log Configuration:

```json
"logTypes": {
  "mapMovement": true,
  "staminaChanges": true,
  ...
}
```

### All Stamina Change Paths

| Path | Source File | Logged? |
|------|-----------|---------|
| Map movement | `mapMovement.js:movePlayer()` | ✅ All 3 systems via `logPlayerMovement()` |
| Player self-init | `app.js:safari_map_init_player` | ✅ All 3 systems via `logPlayerInitialization()` |
| Bulk init | `safariMapAdmin.js:bulkInitializePlayers()` | ✅ All 3 systems via `logPlayerInitialization()` |
| Custom Action init | `safariManager.js:MANAGE_PLAYER_STATE` | ✅ All 3 systems via `logPlayerInitialization()` |
| Consumable item use | `app.js:safari_use_item_*` | ✅ All 3 systems via `logItemUse()` |
| Action outcome (MODIFY_POINTS) | `safariManager.js:executeModifyPoints()` | ✅ All 3 systems |
| Passive regen | `pointsManager.js:calculateRegeneration()` | Console only (silent — computed on demand) |
| Permanent item boost (max change) | `pointsManager.js:calculatePermanentStaminaBoost()` | Console only |

## Technical Implementation

### Key Files Modified

#### 1. `safariLogger.js` (New Module)
```javascript
// Clean API for Safari logging
export async function logCustomAction({ 
  guildId, userId, username, displayName, location, 
  actionType, actionId, executedActions, success, 
  errorMessage, channelName 
}) {
  // Validation and settings check
  // Calls analyticsLogger.logInteraction
}
```

#### 2. `src/analytics/analyticsLogger.js` (Enhanced)
- **Added Safari action type mapping**
- **Enhanced message formatting with button labels**
- **Fixed rate limiting issue** (moved Safari conditions before rate check)
- **Added comprehensive debugging**

#### 3. `safariManager.js` (Integration)
- **Custom action logging at end of executeButtonActions**
- **Channel name extraction from interaction context**
- **Location coordinate detection**

#### 4. `app.js` (Button Handlers)
- **Safari Log configuration UI**
- **Test message functionality**
- **Channel name context passing**

#### 5. `buttonHandlerFactory.js` (Context Fix)
- **Added channelName extraction from req.body.channel?.name**

### Critical Architecture Patterns

#### Safari Log Posting Pipeline
```javascript
// 1. Action occurs (button click, movement, etc.)
// 2. safariLogger function called with context
// 3. Settings validation and log type check
// 4. analyticsLogger.logInteraction called
// 5. Safari conditions checked BEFORE rate limiting
// 6. postToSafariLog formats and sends message
```

#### Button Label Resolution
```javascript
// Enhanced button display in logs
const button = safariData[guildId]?.buttons?.[actionId];
const buttonDisplay = buttonEmoji && buttonLabel 
  ? `${buttonEmoji} ${buttonLabel} (${actionId})`
  : buttonLabel || actionId;
```

## Critical Debugging Discoveries

### 1. Rate Limiting Issue (MAJOR)
**Problem:** Safari Custom Actions were being rate limited by analytics logging, preventing Safari Log messages from being posted.

**Root Cause:** 
- Safari button clicks trigger two rapid `postToDiscordLogs` calls:
  1. `BUTTON_CLICK` (analytics)
  2. `SAFARI_CUSTOM_ACTION` (Safari Log)
- Rate limit of 1.2 seconds caused second call to be queued
- Safari Log conditions check happened AFTER rate limiting
- Queued messages never reached Safari Log conditions

**Solution:** Moved Safari Log conditions check to run BEFORE rate limiting:
```javascript
// BEFORE (broken)
if (now - lastMessageTime < 1200) return; // Rate limited, Safari never checked
if (safariContent && action.startsWith('SAFARI_')) { /* Safari Log */ }

// AFTER (fixed)  
if (safariContent && action.startsWith('SAFARI_')) { /* Safari Log */ }
if (now - lastMessageTime < 1200) return; // Rate limit analytics only
```

### 2. Channel Name Propagation
**Problem:** Channel names were showing as "Unknown" in Safari logs.

**Root Cause:** `ButtonHandlerFactory.extractButtonContext()` wasn't extracting `channelName` from Discord request.

**Solution:** Added channel name extraction:
```javascript
export function extractButtonContext(req) {
  return {
    // ... other context
    channelName: req.body.channel?.name || 'Unknown',
  };
}
```

### 3. Missing Action Type Mapping
**Problem:** `SAFARI_TEST` actions weren't being logged.

**Root Cause:** Test actions weren't mapped in `logTypeMap`.

**Solution:** Added mapping and log type:
```javascript
const logTypeMap = {
  // ... other mappings
  'SAFARI_TEST': 'testMessages'
};
```

## Message Formatting

### Enhanced Location Display
- **Before:** `at **A1**`
- **After:** `at **A1** (#a1)`

### Enhanced Button Display
- **Before:** `Button: moi_mvp_401745`
- **After:** `Button: 🍆 Moi MVP (moi_mvp_401745)`

### Consistent Timestamp Format
```javascript
const timestamp = new Date().toLocaleTimeString('en-US', { 
  hour: '2-digit', 
  minute: '2-digit',
  hour12: true 
});
// Results in: [08:32 PM]
```

## Admin Interface

### Configuration UI Flow
1. **Main Access:** Production Menu → Safari → Safari Log Configuration
2. **Status Display:** Shows current enabled/disabled state and log channel
3. **Toggle Controls:** Enable/disable master switch
4. **Channel Selection:** Channel select menu for log destination
5. **Log Type Management:** Individual toggles for each log type
6. **Test Functionality:** Send test message to verify setup

### Button Handler Implementation
```javascript
// Uses ButtonHandlerFactory pattern for consistency
} else if (custom_id === 'safari_configure_log') {
  return ButtonHandlerFactory.create({
    id: 'safari_configure_log',
    requiresPermission: PermissionFlagsBits.ManageRoles,
    handler: async (context) => {
      // Load current settings and display UI
    }
  })(req, res, client);
}
```

## Integration Points

### Safari Button Actions
- **Integration Point:** End of `executeButtonActions` in `safariManager.js`
- **Context:** Full interaction context including location and channel
- **Action Details:** Executed actions with configs and results

### Player Movement
- **Integration Point:** `logPlayerMovement` calls in movement handlers
- **Context:** From/to coordinates with channel names
- **Movement Details:** Full movement path and permissions

### Whisper System
- **Integration Point:** Whisper sending functions
- **Context:** Sender, recipient, location, and message content
- **Privacy Note:** Full message content is logged for moderation

## Troubleshooting

### Common Issues

#### "Safari Log not appearing in channel"
**Debug Steps:**
1. Check if Safari logging is enabled: `safariLogSettings.enabled`
2. Verify log channel ID is set: `safariLogSettings.logChannelId`
3. Confirm specific log type is enabled: `logTypes.customActions`
4. Check bot permissions in target channel
5. Review console logs for rate limiting or errors

#### "Button shows as ID instead of label"
**Debug Steps:**
1. Verify button exists in `safariContent.json`
2. Check button has `label` or `name` property
3. Confirm Safari content loading isn't failing
4. Review button label resolution debug logs

#### "Channel shows as 'Unknown'"
**Debug Steps:**
1. Verify `ButtonHandlerFactory.extractButtonContext` includes `channelName`
2. Check Discord request includes `req.body.channel?.name`
3. Confirm channel name is passed through Safari Logger functions

### Debug Logging Patterns

```javascript
// Safari Logger debug pattern
console.log(`🦁 Safari Logger: logCustomAction called for ${actionType} ${actionId}`);

// Analytics Logger debug pattern  
console.log(`📊 DEBUG: Checking Safari Log conditions - safariContent: ${!!safariContent}`);

// Safari Log posting debug pattern
console.log(`🔍 Safari Log Debug: Message sent successfully to Safari Log channel`);
```

## Future Enhancements

### Potential Improvements

1. **Log Aggregation**
   - Batch similar actions to reduce channel spam
   - Daily/hourly summary reports
   - Player activity dashboards

2. **Advanced Filtering**
   - Player-specific log filtering
   - Location-based filtering
   - Time-based filtering

3. **Analytics Integration**
   - Player behavior analysis
   - Popular action tracking
   - Engagement metrics

4. **Alert System**
   - Suspicious activity detection
   - Admin notifications for specific events
   - Rate limiting alerts

5. **Export Functionality**
   - CSV/JSON export of log data
   - Archive management
   - Data retention policies

### Performance Considerations

1. **Rate Limiting Optimization**
   - Separate rate limits for different log types
   - Priority queuing for critical events
   - Burst handling for high-activity periods

2. **Database Integration**
   - Move from file-based to database storage
   - Indexed searching and filtering
   - Better concurrent access handling

## Implementation Lessons Learned

### Key Architectural Decisions

1. **Separate Safari Logger Module:** Clean API separation allowed for easy integration across different Safari systems.

2. **Enhanced Analytics Logger:** Extending existing analytics system rather than creating parallel system reduced complexity.

3. **Rate Limiting Independence:** Safari logs must be processed independently of analytics rate limiting to ensure reliability.

4. **Context Propagation:** Passing complete context (channel names, locations, user details) through all logging functions enables rich formatting.

5. **Button Label Resolution:** Loading Safari content to resolve button details provides much more useful logs than just IDs.

### Critical Success Factors

1. **Comprehensive Debugging:** Extensive debug logging throughout the pipeline was essential for identifying the rate limiting issue.

2. **Systematic Approach:** Breaking down the problem into discrete components (settings, conditions, formatting) allowed systematic debugging.

3. **Context Awareness:** Understanding the full Discord interaction flow was crucial for proper channel name extraction.

4. **User Experience Focus:** Prioritizing readable, informative log messages over technical accuracy improved admin utility.

---

## Quick Reference

### Enable Safari Logging
1. Use `/menu` → Production Menu → Safari → Safari Log Configuration
2. Click "Enable Safari Log"
3. Set log channel using "Set Log Channel"
4. Configure log types as needed
5. Test with "Send Test Message"

### Log Format Examples
- **Movement:** `🗺️ **MOVEMENT** | [08:32 PM] | @user moved from **A1** (#a1) to **B2** (#b2) (⚡1/1 → 0/1 ♻️12hr)`
- **Initialization:** `🗺️ **MOVEMENT** | [08:32 PM] | @user moved from **null** to **D3** (⚡0/1 → 1/1)`
- **Custom Action:** `🎯 **CUSTOM ACTION** | [08:32 PM] | @user at **A1** (#a1)\n> Button: 🍆 Moi MVP (moi_mvp_401745)`
- **Whisper:** `🤫 **WHISPER** | [08:32 PM] | @sender → @recipient at **A1** (#a1)\n> Message content`

### File Locations
- **Safari Logger API:** `safariLogger.js`
- **Core Logging Logic:** `src/analytics/analyticsLogger.js`
- **Admin Interface:** `app.js` (Safari Log handlers)
- **Default Settings:** `safariInitialization.js`
- **Integration Points:** `safariManager.js`, movement handlers, whisper system

The Safari Log System provides comprehensive visibility into player behavior and game state, essential for moderation, debugging, and understanding player engagement patterns.