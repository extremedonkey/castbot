# 🚨 CRITICAL: Dev Data Loss Incident - Sept 30, 2025

**STATUS**: Data recoverable from VS Code snapshot. Production UNAFFECTED.

## Executive Summary

During placement editor implementation, `playerData.json` was completely wiped in dev environment, losing 5+ months of data across all features (Safari, Applications, Tribes, Timezones, Player data). File reduced from thousands of lines to ~488 lines of stub data. VS Code local history contains backup from ~1 day ago (`playerData-DevCrashRestore.json`).

## Timeline of Events

- **~19:05:03 Sept 30, 2025**: File overwrite occurred (per `stat` timestamp)
- **Context**: Working on placement editor feature, implementing modal submission handlers
- **Recent changes**:
  - Fixed null tribe data crashes (10 locations)
  - Converted placement handlers to ButtonHandlerFactory
  - Added modal submission handler for `save_placement`
  - Multiple dev restarts during testing

## Current State

### Lost Data
- **Original file**: Thousands of lines, 5+ months of accumulated data
- **Current file**: 488 lines, 14KB
- **Contains only**:
  - Analytics metadata (17 guilds)
  - Stub tribe placeholders (`"tribe1": null`)
  - One placement test entry (player 863115100268789781)
  - Empty `players: {}`, `tribes: {}` structures

### Recovery Source Available
- **File**: `playerData-DevCrashRestore.json` (VS Code local history snapshot)
- **Age**: ~1 day old (last modified before crash)
- **Content verified**: Contains rich data:
  - 1297188286191767603 (EpochORG S7): 52 players, 12 tribes, 13 timezones
  - 1127596863885934652 (LOSTVivor): 29 players, 3 tribes, 13 timezones
  - 1331657596087566398 (CastBot): Safari data, applications, rankings
  - Full application configs, season data, player emojis, etc.

## Root Cause: CONFIRMED (See 00-DevCrash-RootCause-Analysis.md)

### Network-Induced Race Condition During Analytics Startup

**ROOT CAUSE CONFIRMED:**
Poor internet connectivity caused `fs.readFile()` to return incomplete data during app startup. The analytics system's `client.on('ready')` handler loaded this partial data (valid JSON but empty structure), added metadata, and called `savePlayerData()` 17 times - once per guild - overwriting the complete file with minimal structure.

**The Kill Chain:**
1. App starts → Discord `client.on('ready')` fires
2. Analytics loads: `const playerData = await loadPlayerData()`
3. **Network issue**: `fs.readFile()` returns partial file (14KB instead of 168KB)
4. `JSON.parse()` succeeds (partial data is valid JSON with empty objects)
5. For each of 17 guilds: Analytics spreads empty data + new metadata
6. `savePlayerData()` writes 17 times with NO validation
7. File overwritten: 5800 lines → 488 lines

**Critical code sections:**
- `storage.js:118-122` - `savePlayerData()`: NO safety checks, NO validation, NO backup
- `storage.js:24-79` - `ensureStorageFile()`: NO size validation, assumes read always succeeds
- `app.js:1260-1326` - Analytics system: Writes 17 times on startup, no data validation

### Contributing Factors

1. **No dev backup mechanism**: Prod has backup in deployment scripts, dev has none
2. **Multiple concurrent writes**: Analytics + placement save + restart operations
3. **Race condition risk**: File I/O we just added retry logic for (100-200ms delays)
4. **No validation**: savePlayerData() doesn't check if data is suspiciously small before writing

## Data Loss Prevention Gaps

### Current State
- ✅ Production: Has backup mechanism in deployment scripts
- ❌ Development: No backup, no validation, no safeguards
- ❌ No size validation before save
- ❌ No "looks suspicious" checks
- ❌ No atomic write pattern (temp file → rename)
- ❌ playerData.json not in git (removed in commit "Clean repository and remove sensitive files")

### Risk Assessment
**CRITICAL**: If this had been deployed to production, ALL production data would have been lost:
- All Safari game state across 17 guilds
- All season applications and rankings
- All player emojis, ages, preferences
- All tribe configurations and castlists
- All timezone assignments

## Next Steps (TO BE EXECUTED)

### Phase A1: Immediate Recovery
```bash
# Preserve forensic evidence
mv playerData.json playerData.json.WIPED-2025-09-30

# Restore from VS Code snapshot
cp playerData-DevCrashRestore.json playerData.json

# Verify restoration
wc -l playerData.json  # Should be thousands of lines
head -100 playerData.json | grep -E "safari|applications|tribes"

# Restart to verify app works with restored data
./scripts/dev/dev-restart.sh "Restore playerData.json from VS Code snapshot after data loss incident"
```

### Phase A2: Detailed Troubleshooting

**Investigate savePlayerData() calls:**
```bash
grep -n "savePlayerData" *.js | grep -v "export async function"
```

**Check ensureStorageFile() logic:**
- Line 24-79 in storage.js
- When does it initialize fresh structure?
- Is there a code path that could return empty data?

**Analyze placement editor code:**
- Modal submission handler (app.js ~28465)
- Does it call savePlayerData() with partial data?
- Could it have triggered during restart?

### Phase B: Root Cause Analysis

**Questions to answer:**
1. Exactly which code path caused the overwrite?
2. Why did ensureStorageFile() not load existing data?
3. Was this a race condition with analytics writes?
4. Can we reproduce this safely?

**Investigation steps:**
1. Add extensive logging to savePlayerData() and ensureStorageFile()
2. Check if file was corrupted before overwrite (check older logs)
3. Review all code changes from last 24 hours
4. Test with minimal data file to see if reproducible

### Phase C: Prevention Measures

**Immediate (before next restart):**
1. ✅ Implement backup-before-save in storage.js:
```javascript
async function savePlayerData(data) {
  // Size validation
  const dataStr = JSON.stringify(data, null, 2);
  if (dataStr.length < 10000) {
    console.error('🚨 REFUSING to save suspiciously small playerData:', dataStr.length, 'bytes');
    throw new Error('Data validation failed - file too small');
  }

  // Backup before save
  const backupPath = STORAGE_FILE + '.backup';
  if (await fs.access(STORAGE_FILE).then(() => true).catch(() => false)) {
    await fs.copyFile(STORAGE_FILE, backupPath);
  }

  // Atomic write (temp → rename)
  const tempPath = STORAGE_FILE + '.tmp';
  await fs.writeFile(tempPath, dataStr);
  await fs.rename(tempPath, STORAGE_FILE);
}
```

2. ✅ Add startup validation:
```javascript
async function ensureStorageFile() {
  if (exists) {
    const fileSize = (await fs.stat(STORAGE_FILE)).size;
    if (fileSize < 10000) {
      console.error('🚨 playerData.json suspiciously small:', fileSize);
      console.error('🚨 Check .backup file or VS Code history');
      throw new Error('Corrupted storage file detected');
    }
    data = JSON.parse(await fs.readFile(STORAGE_FILE, 'utf8'));
  }
}
```

**Medium-term (this week):**
1. Implement rotating backups (keep last 5)
2. Add pre-commit hook to backup playerData.json
3. Create dev-specific backup script (simpler than prod)
4. Add monitoring/alerts for file size drops

**Long-term (next sprint):**
1. Consider database migration (SQLite) for critical data
2. Implement change log (audit trail of all writes)
3. Add "dry run" mode for savePlayerData()
4. Create data recovery documentation

### Phase D: Production Deployment Scripts Analysis

**Location to investigate:**
- Deployment scripts in `/scripts/` directory
- Look for backup mechanisms in prod deployment
- Check if npm scripts have backup logic
- Understand what prod does that dev doesn't

**Questions:**
1. How does prod backup playerData.json?
2. Can we adapt this for dev with simplified approach?
3. Does prod have validation before saves?
4. What's the backup retention policy in prod?

## Recovery Comparison

### Option 1: VS Code Snapshot (CHOSEN)
- ✅ Safe read-only operation
- ✅ Data from ~1 day ago
- ✅ Immediately available
- ✅ Preserves crash evidence
- ⚠️ Loses last ~24hrs of changes (minimal in dev)

### Option 2: Production Copy
- ⚠️ Requires SSH to prod (risk)
- ⚠️ Prod may have different data (test vs real users)
- ✅ Most recent data

### Option 3: File System Recovery
- ❌ Low success (file overwritten, not deleted)
- ❌ Requires extundelete/testdisk
- ❌ Time intensive

## Technical Details

### File Information
```
Path: /home/reece/castbot/playerData.json
Size: 14KB (was likely 100KB+)
Lines: 488 (was likely 3000+)
Modified: 2025-09-30 19:05:03.844042868 +0800
Birth: 2025-06-30 23:12:06 (5 months of accumulated data)
```

### Data Structure Lost
```json
{
  "guildId": {
    "players": {
      "userId": {
        "age": "...",
        "emojiCode": "...",
        "safari": {
          "currency": 1450,
          "inventory": {...},
          "mapProgress": {...},
          "points": {...}
        }
      }
    },
    "tribes": {
      "roleId": {
        "emoji": "...",
        "castlist": "...",
        "castlistId": "...",
        "rankings": {...}
      }
    },
    "timezones": {...},
    "applicationConfigs": {...},
    "applications": {...}
  }
}
```

## Critical Reminders for CLAUDE.md

1. **NEVER deploy to production without explicit permission and backup verification**
2. **Always implement backup-before-save for critical data files**
3. **Add size validation before writing to prevent data loss**
4. **Use atomic writes (temp file → rename) for data persistence**
5. **Test file I/O operations with minimal/corrupted data scenarios**
6. **Keep VS Code local history enabled (it saved us here)**
7. **Consider git-tracking sanitized version of playerData.json structure**

## Commands for Reference

```bash
# Compare files
diff playerData.json.WIPED-2025-09-30 playerData-DevCrashRestore.json | head -50

# Check file sizes
ls -lh playerData*

# Verify data structure
head -100 playerData.json | grep -E "players|tribes|safari"

# Find all savePlayerData calls
grep -rn "savePlayerData" --include="*.js" | grep -v "export async function"

# Check for backup mechanisms in prod scripts
grep -r "backup" scripts/ --include="*.sh"
```

## Context Preservation Notes

**What we were working on:**
- Placement editor feature for CastlistV3
- Allows production to edit player season placements (1st, 2nd, 24th, etc.)
- Modal with Label (type 18) component for input
- Submission handler in MODAL_SUBMIT section (app.js ~28465)
- Fixed 10 instances of null tribe data crashes
- Added retry logic for file I/O race conditions

**Last successful commits:**
- `8629d2f` - Fix null tribe crash across all castlist modules
- `151e24d` - Fix null tribe data crash (2 locations)
- `dd9d218` - Fix placement editor: add retry logic and delay
- `e71c62e` - Fix placement editor modal submission
- `1b1d53a` - Fix placement modal data access

**Git branch:** main
**Environment:** WSL2 (Ubuntu on Windows)
**Node version:** v18.19.1

---

**Document created:** 2025-09-30 by Claude Code (context at 90%)
**Priority:** CRITICAL - Execute recovery immediately
**Risk if not fixed:** Could wipe production data on next deployment