# Timezone & DST Management System

**Version:** 1.0
**Status:** ✅ Production Ready
**Dependencies:** Components V2, Button Handler Factory, Global State Management
**Permissions:** Admin-restricted DST toggle (specific user ID)

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture & Design](#architecture--design)
3. [Core Features](#core-features)
4. [Timezone Conversion System](#timezone-conversion-system)
5. [DST Toggle Interface](#dst-toggle-interface)
6. [Role Consolidation](#role-consolidation)
7. [Technical Implementation](#technical-implementation)
8. [Data Structures](#data-structures)
9. [Deployment Guide](#deployment-guide)
10. [Future Enhancements](#future-enhancements)

---

## Overview

The Timezone & DST Management System provides CastBot with intelligent handling of Daylight Saving Time (DST) changes through a single-role paradigm. Instead of forcing users to manually switch between separate roles for standard and daylight time (e.g., PST ↔ PDT), the system uses one role per timezone with dynamic offset management.

### The Problem Solved

**Before:** Users had to manually switch roles twice a year when DST changed:
- Winter: User assigns "EST (UTC-5)" role
- Spring: DST begins → User must manually switch to "EDT (UTC-4)" role
- Result: Confusion, wrong times displayed, manual overhead

**After:** Users have one role that automatically reflects the correct time:
- All seasons: User has "EST / EDT" role
- Winter: System reads currentOffset = -5 from global state
- Summer: Admin toggles DST → System reads currentOffset = -4
- Result: Always correct time, no user action needed

### Key Benefits

- **Zero User Friction**: Players never need to change roles for DST
- **Global Control**: One toggle updates all servers simultaneously
- **Backwards Compatible**: Legacy roles continue working during transition
- **Automatic Conversion**: Existing dual-role setups convert to new format
- **Non-Destructive**: Conversion preserves all player assignments

---

## Architecture & Design

### Single-Role Paradigm

The core design principle: **One timezone = One role** with dynamic offset lookup.

```
┌────────────────────────────────────────────────────────┐
│ OLD SYSTEM: Dual-Role Approach (MANUAL)                │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Discord Role: PST (UTC-8)  ──┐                       │
│                               │ User must switch      │
│  Discord Role: PDT (UTC-7)  ──┘ manually twice/year  │
│                                                         │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ NEW SYSTEM: Single-Role with Dynamic Offset (AUTO)     │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Discord Role: "PST / PDT"                             │
│       ↓                                                 │
│  playerData: { timezoneId: "PT" }                      │
│       ↓                                                 │
│  dstState.json: PT.currentOffset = -8 (winter)         │
│                 PT.currentOffset = -7 (summer)         │
│       ↓                                                 │
│  Time Calculation: Always uses current offset ✅       │
│                                                         │
└────────────────────────────────────────────────────────┘
```

### Three-Layer Architecture

#### Layer 1: Global State (`dstState.json`)
Single source of truth for timezone definitions and current DST state.

```json
{
  "PT": {
    "displayName": "Pacific Time",
    "roleFormat": "PST / PDT",
    "standardOffset": -8,
    "dstOffset": -7,
    "currentOffset": -7,  // ← Updated by DST toggle
    "isDST": true,        // ← Updated by DST toggle
    "standardAbbrev": "PST",
    "dstAbbrev": "PDT",
    "dstObserved": true
  }
}
```

**Properties:**
- 16 global timezones (North America, Europe, Asia-Pacific)
- Non-DST zones (India, Japan, South Africa)
- Half-hour offsets supported (Newfoundland: -3.5)

#### Layer 2: Server Configuration (`playerData.json`)
Links Discord roles to global timezone definitions.

```json
{
  "1008584295193006121": {
    "timezones": {
      "1234567890": {
        "offset": -8,          // ← Backwards compat
        "timezoneId": "PT",    // ← Links to dstState.json
        "dstObserved": true,
        "standardName": "PST (UTC-8)"
      }
    }
  }
}
```

**Many-to-Many Mapping:**
Multiple Discord roles can map to same `timezoneId`:
- Old "PST (UTC-8)" role → `timezoneId: "PT"`
- Old "PDT (UTC-7)" role → `timezoneId: "PT"`
- Result: Both roles show correct time after DST toggle

#### Layer 3: Discord Roles
Physical Discord roles assigned to users.

```
Discord Server:
  Role ID 1234567890: Name = "PST / PDT"
  Role ID 9876543210: Name = "EST / EDT"

Users keep their role assignments, no migration needed.
```

---

## Core Features

### 1. Automatic Timezone Conversion

Converts legacy dual-role setups to DST-aware format automatically during `executeSetup()`.

**Conversion Process:**
1. **Detection**: Scans existing timezone roles using pattern matching + offset validation
2. **Renaming**: Updates Discord role names to match `dstState.json` format (e.g., "PST (UTC-8)" → "PST / PDT")
3. **Metadata**: Adds `timezoneId`, `dstObserved`, `standardName` to playerData
4. **Persistence**: Saves updated data immediately to prevent loss

**Pattern Matching:**
Uses **dual validation** (name + offset) to prevent false positives:
```javascript
// Pacific Time detection
if ((name.includes('pst') || name.includes('pdt') || name.includes('pacific'))
    && (offset === -8 || offset === -7)) {
  return 'PT';
}
```

**Safety Features:**
- ✅ Idempotent (safe to re-run)
- ✅ Non-destructive (only adds `timezoneId` field)
- ✅ Graceful failure handling (logs unmapped roles)
- ✅ Prevents duplicates on hierarchy failures

**Implementation:** `roleManager.js:576-782`
- `detectTimezoneId()` - Pattern matching with dual validation
- `convertExistingTimezones()` - Role renaming and metadata addition

### 2. Enhanced Timezone Descriptions

String select menus show friendly names instead of UTC offsets.

**Before:**
```
Dropdown option: "MST / MDT - UTC-6"
```

**After:**
```
Dropdown option: "MST / MDT - Mountain Time"
```

**Implementation:** `playerManagement.js:922-982`
- Checks for `timezoneId` field
- Loads `dstState.json` at selector build time
- Uses `displayName` from dstState if available
- Falls back to UTC offset for legacy roles

### 3. DST-Aware Time Calculations

Time display code reads from global state for converted roles.

**Time Calculation Flow:**
```javascript
// Check if role uses new system
if (tzData.timezoneId) {
  // New system: read from dstState.json
  const dstState = await loadDSTState();
  offset = dstState[tzData.timezoneId].currentOffset;
} else {
  // Legacy fallback: use stored offset
  offset = tzData.offset;
}

// Calculate time (same as before)
const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
const targetTime = new Date(utcTime + (offset * 3600000));
```

**Affected Locations:**
- Player menu time display (`playerManagement.js:59-88`)
- Castlist time display (`castlistV2.js:392-411, 606-623`)

### 4. 16 Global Timezones Supported

**North America:**
- PT (Pacific Time): PST / PDT
- MT (Mountain Time): MST / MDT
- CT (Central Time): CST / CDT
- ET (Eastern Time): EST / EDT
- AT (Atlantic Time): AST / ADT
- NT (Newfoundland Time): NST / NDT

**Europe:**
- GMT (UK & Ireland): GMT / BST
- CET (Central Europe): CET / CEST
- EET (Eastern Europe): EET / EEST

**Asia-Pacific & Others:**
- IST (India Time): UTC+5.5 (no DST)
- ICT (Indochina Time): UTC+7 (no DST)
- GMT8 (Western Australia/SE Asia): UTC+8 (no DST)
- JST (Japan Time): UTC+9 (no DST)
- SAST (South Africa): UTC+2 (no DST)
- AEST (Australian Eastern): AEST / AEDT
- NZST (New Zealand): NZST / NZDT

---

## Timezone Conversion System

### Detection Algorithm

**Dual Validation Approach:**
Pattern matching uses TWO criteria for safe identification:
1. Name patterns (fuzzy matching with common variations)
2. Offset validation (ensures offset is in expected range)

**Why Both?**
- Prevents false positives (e.g., "MST" with offset -8 won't match Mountain Time)
- Handles typos and variations (e.g., "Pacific", "pacific time", "PST")
- Supports both seasonal variants (PST offset -8 OR PDT offset -7 both → PT)

**Example Patterns:**
```javascript
// Central Time detection
if ((name.includes('cst') || name.includes('cdt') || name.includes('central'))
    && (offset === -6 || offset === -5)) {
  return 'CT';
}
```

### Conversion Results

**Example Output:**
```
🔄 Timezone Conversion Results for 'Survivor Org':

✅ Renamed 5 roles to new standard:
  - "PST (UTC-8)" → "PST / PDT" (timezoneId: PT, 12 players)
  - "PDT (UTC-7)" → "PST / PDT" (timezoneId: PT, 8 players)
  - "CST (UTC-6)" → "CST / CDT" (timezoneId: CT, 15 players)
  - "CDT (UTC-5)" → "CST / CDT" (timezoneId: CT, 5 players)
  - "GMT (UTC+0)" → "GMT / BST" (timezoneId: GMT, 3 players)

⚠️ 0 roles could not be mapped
❌ 0 rename operations failed

📊 Summary:
  - Total roles converted: 5
  - Total players affected: 43
  - Duplicate names after conversion: 2 pairs (admin can manually delete)
```

### Edge Cases Handled

**Case 1: Duplicate Names After Conversion**
- Scenario: Server has both "PST" and "PDT" roles
- Both rename to "PST / PDT" (Discord allows duplicate names)
- Both linked to `timezoneId: "PT"`
- DST toggle updates both simultaneously
- Admin can manually delete duplicates later

**Case 2: Role Name Already Correct**
- Scenario: Server has "PST / PDT" (already using new format)
- Conversion skips rename, just adds `timezoneId`
- Logged to `results.unchanged`

**Case 3: Unrecognized Pattern**
- Scenario: Role "Aussie Time" with offset 10
- Pattern detection fails → `timezoneId` not added
- Logged to `results.unmapped` for manual review
- Role continues working with legacy offset

**Case 4: Hierarchy Failures**
- Scenario: CastBot role below existing timezone roles (Missing Permissions)
- Conversion fails gracefully, doesn't crash
- No duplicate roles created
- Added to hierarchy warnings (like pronouns)
- Clear instructions to fix hierarchy and re-run

---

## DST Toggle Interface

### Manual DST Control

**Location:** `/menu` → Reece's Tools → DST Manager
**Access:** Restricted to admin user (ID: `391415444084490240`)
**Effect:** Global - updates all servers using that timezone

### Interface Flow

```
Admin clicks "DST Manager"
  ↓
Dropdown shows all DST-aware timezones
  ↓
Admin selects timezone (e.g., "PT - Pacific Time")
  ↓
Select state: ☀️ Daylight or ❄️ Standard
  ↓
Confirm → Updates dstState.json globally
  ↓
All servers instantly show correct offset
```

### Implementation

**Button Handler:** `app.js:9185-9278`
```javascript
} else if (custom_id === 'admin_dst_toggle') {
  // Load DST state and playerData
  const dstState = await loadDSTState();
  const playerData = await loadPlayerData();

  // Get unique timezoneIds from all servers
  const seenTimezoneIds = new Set();
  const dstTimezones = [];
  for (const [roleId, tzData] of Object.entries(timezones)) {
    if (tzData.timezoneId && !seenTimezoneIds.has(tzData.timezoneId)) {
      seenTimezoneIds.add(tzData.timezoneId);
      dstTimezones.push({
        timezoneId: tzData.timezoneId,
        currentState: tzInfo.isDST ? 'Daylight' : 'Standard'
      });
    }
  }

  // Build Components V2 dropdown
  return { components: [container], ephemeral: true };
}
```

**Select Handler:** `app.js:19655-19708`
```javascript
} else if (custom_id === 'dst_timezone_select') {
  const selectedTimezoneId = context.values[0];
  const dstState = await loadDSTState();
  const timezone = dstState[selectedTimezoneId];

  // Toggle DST state
  timezone.isDST = !timezone.isDST;
  timezone.currentOffset = timezone.isDST
    ? timezone.dstOffset
    : timezone.standardOffset;

  // Save updated state
  await saveDSTState(dstState);

  return { content: successMessage };
}
```

### Toggle Response

**Success Message:**
```
✅ DST State Updated

Timezone: Pacific Time
Changed from: PST (UTC-8) ❄️
Changed to: PDT (UTC-7) ☀️

This change affects all servers using the "PST / PDT" role with the new DST system.
```

---

## Role Consolidation

### Duplicate Role Merging

**Purpose:** Consolidate multiple roles with same `timezoneId` to reduce role count.

**Location:** `/menu` → Reece's Tools → Merge Duplicate Timezones
**Access:** Restricted to admin user (ID: `391415444084490240`)
**Effect:** Server-specific (only affects current server)

### Consolidation Process

```
1. Group roles by timezoneId
   ↓
2. Sort by member count (most members wins)
   ↓
3. Migrate all members to winner role
   ↓
4. Verify loser roles have 0 members
   ↓
5. Delete empty loser roles
   ↓
6. Update playerData.json (remove deleted role IDs)
```

### Example Consolidation

**Before:**
```
Discord Roles:
  - Role ID 1234: "PST / PDT" → 45 members
  - Role ID 5678: "PST / PDT" → 3 members

playerData.json:
  "1234": { "timezoneId": "PT" }
  "5678": { "timezoneId": "PT" }
```

**After:**
```
Discord Roles:
  - Role ID 1234: "PST / PDT" → 48 members
  - Role ID 5678: DELETED

playerData.json:
  "1234": { "timezoneId": "PT" }
```

### Implementation

**Function:** `roleManager.js:791-965` - `consolidateTimezoneRoles()`

**Safety Features:**
- ✅ Winner = role with most members
- ✅ Verifies 0 members before deletion
- ✅ Rate limiting: 50ms between role changes, 200ms between deletions
- ✅ Error isolation: one failure doesn't stop consolidation
- ✅ Detailed reporting: shows what was merged/deleted

**Button Handler:** `app.js:9279-9357`
```javascript
} else if (custom_id === 'merge_timezone_roles') {
  // Load playerData
  const playerData = await loadPlayerData();
  const timezones = guildData.timezones || {};

  // Run consolidation
  const results = await consolidateTimezoneRoles(context.guild, timezones);

  // Clean up playerData - remove deleted roles
  for (const deleted of results.deleted) {
    delete playerData[context.guildId].timezones[deleted.roleId];
  }
  await savePlayerData(playerData);

  // Build detailed response
  return { content: consolidationReport };
}
```

---

## Technical Implementation

### File Structure

```
/castbot
├── dstState.json              # Global timezone definitions (195 lines)
├── roleManager.js             # Conversion & consolidation logic
│   ├── detectTimezoneId()               (lines 584-685)
│   ├── convertExistingTimezones()       (lines 696-782)
│   ├── consolidateTimezoneRoles()       (lines 791-965)
│   └── executeSetup()                   (lines 974-1240)
├── storage.js                 # DST state management
│   ├── loadDSTState()                   (lines 406-418)
│   ├── saveDSTState()                   (lines 420-424)
│   └── getDSTOffset()                   (lines 426-429)
├── app.js                     # Button handlers
│   ├── admin_dst_toggle                 (lines 9185-9278)
│   ├── dst_timezone_select              (lines 19655-19708)
│   └── merge_timezone_roles             (lines 9279-9357)
├── playerManagement.js        # UI & time display
│   └── buildTimezoneSelector()          (lines 922-982)
└── castlistV2.js             # Castlist time calculations
    └── formatPlayerTime()               (lines 392-411, 606-623)
```

### Data Flow: Time Calculation

```
Player views castlist
  ↓
getTimezoneRole(playerId)
  ↓
Check: tzData.timezoneId exists?
  ├─ YES → loadDSTState() → getDSTOffset(timezoneId) → currentOffset
  └─ NO  → use tzData.offset (legacy)
  ↓
calculateTime(currentOffset)
  ↓
Display formatted time
```

### Data Flow: DST Toggle

```
Admin clicks DST Manager
  ↓
Load dstState.json + playerData.json
  ↓
Build dropdown with unique timezoneIds
  ↓
Admin selects timezone + new state
  ↓
Update dstState[timezoneId].currentOffset
Update dstState[timezoneId].isDST
  ↓
Save dstState.json (atomic write)
  ↓
All servers instantly use new offset
  ↓
Players see correct time (no action needed)
```

---

## Data Structures

### dstState.json Schema

```json
{
  "timezoneId": {
    "displayName": "string",        // Full name (e.g., "Pacific Time")
    "roleFormat": "string",         // Discord role name (e.g., "PST / PDT")
    "standardOffset": "number",     // Winter offset (e.g., -8)
    "dstOffset": "number",          // Summer offset (e.g., -7)
    "currentOffset": "number",      // Active offset (updated by toggle)
    "isDST": "boolean",             // Currently in DST?
    "standardAbbrev": "string",     // Winter abbreviation (e.g., "PST")
    "dstAbbrev": "string",          // Summer abbreviation (e.g., "PDT")
    "dstObserved": "boolean",       // Does this timezone use DST?
    "standardName": "string",       // Legacy format (e.g., "PST (UTC-8)")
    "standardNameDST": "string"     // Legacy DST format (e.g., "PDT (UTC-7)")
  }
}
```

### playerData.json Schema Extensions

```json
{
  "guildId": {
    "timezones": {
      "roleId": {
        "offset": "number",           // BACKWARDS COMPAT: Static offset
        "timezoneId": "string",       // NEW: Links to dstState.json
        "dstObserved": "boolean",     // NEW: Metadata from dstState
        "standardName": "string"      // NEW: Original role name
      }
    }
  }
}
```

### STANDARD_TIMEZONE_ROLES Schema

**Location:** `roleManager.js:136-290`

```javascript
{
  id: "string",              // timezoneId (e.g., "PT")
  name: "string",            // Discord role name (e.g., "PST / PDT")
  description: "string",     // Friendly name (e.g., "Pacific Time")
  offset: "number",          // Standard offset (e.g., -8)
  offsetDST: "number",       // DST offset (e.g., -7) [optional]
  dstObserved: "boolean",    // Does this timezone use DST?
  standardName: "string",    // Legacy format (e.g., "PST (UTC-8)")
  standardNameDST: "string"  // Legacy DST format (e.g., "PDT (UTC-7)") [optional]
}
```

---

## Deployment Guide

### Pre-Deployment Checklist

- [x] Code committed to main branch
- [x] All 5 critical bugs fixed
- [x] Testing completed on dev/regression servers
- [x] Backwards compatibility verified
- [x] Error handling tested (hierarchy failures)
- [x] Rollback plan documented
- [ ] **CRITICAL: Copy `dstState.json` to production server** (file is gitignored!)
- [ ] Test on 1-2 production servers
- [ ] Monitor logs for 24 hours
- [ ] Update documentation with deployment date

### Deployment Steps

#### 1. Backup Production Data
```bash
# SSH to Lightsail
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170

# Backup playerData.json
cp /home/bitnami/castbot/playerData.json \
   /home/bitnami/castbot/playerData.json.pre-dst-deploy
```

#### 2. Copy dstState.json to Production
**IMPORTANT:** `dstState.json` is in `.gitignore`, must be copied manually!

```bash
# From WSL (local machine)
scp -i ~/.ssh/castbot-key.pem \
    /home/reece/castbot/dstState.json \
    bitnami@13.238.148.170:/home/bitnami/castbot/
```

#### 3. Deploy Code
```bash
# From WSL (local machine)
npm run deploy-remote-wsl
```

#### 4. Verify Deployment
```bash
# SSH to Lightsail
pm2 logs castbot-pm --lines 50

# Look for:
# ✅ Loaded playerData.json
# 🌍 Loaded DST state: 16 timezones
```

### Post-Deployment Testing

1. Pick test server (e.g., CastBot Regression Green)
2. Run `/menu` → Production Menu → Initial Setup
3. Verify timezone conversion works
4. Check conversion report shows renamed roles
5. Test DST toggle: `/menu` → Reece's Tools → DST Manager
6. Verify dropdown shows ALL timezones (not just PT)
7. Toggle timezone, verify success message
8. Check castlist shows correct times
9. Test timezone selector: `/menu` → Set Timezone
10. Verify descriptions show displayName (e.g., "Pacific Time")

### Rollback Plan

```bash
# On Lightsail production server
git log --oneline -10  # Find commit before a752e3b6
git checkout <previous-commit>
pm2 restart castbot-pm

# Restore backup if needed
cp /home/bitnami/castbot/playerData.json.pre-dst-deploy \
   /home/bitnami/castbot/playerData.json
pm2 restart castbot-pm
```

---

## Future Enhancements

### Not Yet Implemented

#### 1. Automatic DST Switching
**Complexity:** MODERATE
**Risk:** MEDIUM (external dependency)

**Implementation:**
- Cloud API polling (WorldTimeAPI.org)
- Scheduled CRON job (runs twice/year)
- Automatic toggle when DST changes detected
- Fallback to manual if API fails

#### 2. Automatic Legacy Role Cleanup
**Complexity:** MODERATE
**Risk:** MEDIUM (role deletion is destructive)

**Implementation:**
- Delete old dual roles after conversion
- Migrate users from old roles to new roles
- User confirmation before deletion
- Audit trail for deleted roles

#### 3. Timezone Selector Improvements
**Complexity:** LOW
**Risk:** LOW

**Potential Features:**
- Group timezones by region (dropdown sections)
- Show current time for each timezone
- Popular timezones at top
- Recently used timezones

#### 4. DST Schedule Display
**Complexity:** LOW
**Risk:** LOW

**Potential Features:**
- Show next DST change date
- Countdown to next toggle
- Historical DST change log
- Timezone-specific DST rules

---

## Known Limitations

### Minor Limitations

1. **Verbose Error Logging**
   - Discord API errors (hierarchy failures) log full stack traces
   - **Impact:** Development logs are verbose
   - **Mitigation:** Errors caught and handled gracefully
   - **Future:** Could add log level control

2. **Legacy Role Cleanup**
   - Old roles not automatically deleted after conversion
   - **Impact:** Servers may have duplicate names (Discord allows this)
   - **Mitigation:** Admins manually delete old roles OR use consolidation feature
   - **Future:** Automatic cleanup option with confirmation

3. **dstState.json in .gitignore**
   - File must be manually copied to production
   - **Impact:** Not tracked in git, manual deployment step
   - **Recommendation:** Remove from `.gitignore` (it's configuration, not data)
   - **Workaround:** Documented deployment step

---

## Git Commit History

**Major Milestones:**
- `a752e3b6` - Timezone conversion system implementation
- `314ed3a2` - Fix missing loadDSTState import
- `ba67d9fd` - Track already-converted roles
- `06b2ff05` - **CRITICAL:** Save converted metadata to playerData
- `a21fa0c3` - Prevent duplicate role creation on hierarchy failures
- `43cc50e3` - Enhanced timezone string select descriptions
- `766a4be6` - Add DST Toggle Manager to Admin Tools
- `8e7524ab` - Fix DST-aware time calculation in castlistV2 and playerManagement
- `f1d319c9` - Document many-to-many timezone mapping design

---

`★ Insight ─────────────────────────────────────`

**The Genius of This Design:**

The timezone/DST system solves a 20-role problem with a 3-layer architecture:
1. **Global State** - Single source of truth for all timezones
2. **Server Links** - Many-to-many mapping (old roles → new system)
3. **Discord Roles** - Physical roles users keep (no migration!)

Key innovation: Players can have "wrong" role (PST in summer) but see correct time because system reads from global state, not role name. This makes conversion non-destructive and backwards-compatible.

`─────────────────────────────────────────────────`

---

**Document Version:** 1.0
**Last Updated:** 2025-10-27
**Deployment Status:** ✅ Ready for production deployment
**Author:** Claude Code (Generated from RaP 0990 & 0989)
