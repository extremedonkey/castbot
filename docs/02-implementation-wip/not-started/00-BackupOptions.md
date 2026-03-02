# Backup Strategy Options Analysis

**Date:** October 1, 2025
**Status:** Decision made - Awaiting implementation
**Context:** Following data loss incident and Priority 1-3 protections implementation

---

## Executive Summary

**Current State:**
- ✅ `playerData.json`: Single `.backup` protection (caught missing `await` bug - proven effective)
- ❌ `safariContent.json`: NO protection (same vulnerability)

**Production Scale:**
- `playerData.json`: 770KB (25,476 lines) - 4.5x larger than dev
- `safariContent.json`: 457KB (13,675 lines)
- Combined: 1.2MB of critical data

**Decision:**
1. **Immediate:** Add `.backup` protection to `safariContent.json` (10 minutes)
2. **This week:** Upgrade both files to rotating backups (5 versions, 2-3 hours)
3. **Test rigorously:** Verify cleanup logic, concurrent writes, recovery procedures

**Future consideration:** Deployment backups (Option 3) and hybrid approach (Option 6)

---

## Critical Insight: Concurrent Write Risk

### Does `.backup` prevent race conditions?
**❌ NO** - Two users editing simultaneously will still cause one to overwrite the other.

### Does `.backup` reduce risk from race conditions?
**✅ YES** - Provides recovery points to restore lost changes.

**Current I/O Patterns:**
- **Reads:** ~25 per interaction (validated, safe with request-level caching)
- **Writes:** ~1-5 per user action (placement edits, player updates)
- **Concurrent writes:** LOW RISK currently (different guilds write to same file, infrequent overlap)

**Conclusion:** `.backup` doesn't prevent concurrent overwrites, but makes them **recoverable**. Rotating backups increase recovery window from **1 version to 5 versions**.

**Example Concurrent Write Scenario:**
```
T+0.0s: File state = V0 (770KB)
T+0.5s: User A saves → backups/playerData-2025-10-01T00-30-00.json (V0 preserved)
        Current file = V1 (A's changes)
T+1.0s: User B saves → backups/playerData-2025-10-01T00-30-01.json (V1 preserved)
        Current file = V2 (B overwrites A!)

Recovery: Check backups/ folder, find playerData-2025-10-01T00-30-01.json
          This contains A's changes → Merge or restore as needed
```

With rotating backups: **5 chances to recover** (vs. 1 with single `.backup`)

---

## Production File Size Analysis

### Dev vs. Production Comparison
```
                          Dev         Production    Growth Factor
playerData.json:          169KB       770KB         4.5x
safariContent.json:       487KB       457KB         0.94x (similar)
---
TOTAL:                    656KB       1.2MB         1.83x
```

**Key Observations:**
1. **playerData.json grows significantly** with production usage (4.5x larger)
   - More guilds, more players, more placement history
   - Expected growth: Linear with guild count and player activity

2. **safariContent.json is relatively stable**
   - Similar size in dev and prod (admin-created content)
   - Growth: Slow, admin-driven (new experiences, stores, items)

3. **Combined size (1.2MB) is manageable** for all backup strategies

### Growth Projections (12 months)
**Conservative estimates:**
- `playerData.json`: 770KB → 1.5MB (100% growth, more guilds/players)
- `safariContent.json`: 457KB → 600KB (30% growth, new content)
- **Total:** 1.2MB → 2.1MB

**Impact on backup strategies:**
- Single `.backup`: 2.4MB → 4.2MB (negligible)
- Rotating (5 versions): 6.1MB → 10.5MB (negligible)
- Deployment (10 backups): 63MB → 80MB (manageable)

**Conclusion:** All backup strategies remain viable at projected growth.

---

## Option 1: Single .backup (Current Baseline)

### Summary
Keeps one previous version before each write. Already caught the missing `await` bug and saved your data - proven protection with zero overhead.

### Storage Calculation (Production Scale)
```
playerData.json:              770KB (current)
playerData.json.backup:       770KB (previous)
safariContent.json:           457KB (current)
safariContent.json.backup:    457KB (previous)
---
TOTAL:                        2.45MB
```

### Technical Implementation
```javascript
// In storage.js savePlayerData() - lines 172-183 (ALREADY IMPLEMENTED)
const backupPath = STORAGE_FILE + '.backup';
try {
  const fileExists = await fs.access(STORAGE_FILE).then(() => true).catch(() => false);
  if (fileExists) {
    await fs.copyFile(STORAGE_FILE, backupPath);
    console.log('✅ Backup created:', backupPath);
  }
} catch (error) {
  console.error('⚠️ Backup failed:', error.message);
  // Continue anyway - better to save than lose in-memory changes
}
```

### Recovery Procedure
```bash
# One-command recovery
cp playerData.json.backup playerData.json
./scripts/dev/dev-restart.sh "Restore from backup"
```

### Scores
| Criteria | Rating | Notes |
|----------|--------|-------|
| Risk to Implement | ✅ ZERO | Already done for playerData |
| Effort to Implement | ✅ 10 min | Just copy to safariContent |
| Storage Efficiency | ⭐⭐⭐⭐⭐ (5/5) | Only 2.45MB |
| Recovery Granularity | ⭐⭐ (2/5) | 1 recovery point |
| Concurrent Write Protection | ⭐⭐ (2/5) | Recoverable, but only 1 version |
| Operational Overhead | ⭐⭐⭐⭐⭐ (5/5) | Zero maintenance |
| Future-Proofing | ⭐⭐⭐ (3/5) | Limited but functional |

### Pros/Cons
✅ **Already working** (caught missing `await` bug - PROVEN)
✅ **Zero maintenance** (automatic on every save)
✅ **Minimal disk space** (2.45MB total)
✅ **Simple recovery** (one command)
✅ **Fast** (no cleanup logic, instant backup)
⚠️ **Only 1 recovery point** (if `.backup` also corrupted, no fallback)
⚠️ **Concurrent writes:** Can recover, but only most recent overwrite
⚠️ **No time-travel** ("what did this look like 10 minutes ago?" = impossible)

### Battle-Tested Evidence
**September 30, 2025 - Missing `await` bug caught:**
```bash
$ ls -lh playerData.json*
-rw-r--r-- 1 reece reece 169K Sep 30 23:56 playerData.json         # Preserved!
-rw-r--r-- 1 reece reece 249  Sep 30 23:37 playerData.json.REJECTED # Blocked!
-rw-r--r-- 1 reece reece 169K Sep 30 23:56 playerData.json.backup  # Safe!
```

**Validation logic prevented catastrophic data loss:**
- Detected 249 bytes < 50KB threshold
- Refused to save, dumped to `.REJECTED` for forensics
- Original file + `.backup` both intact

**Conclusion:** This simple pattern already saved us once. It works.

---

## Option 2: Rotating Backups (5 Versions) - RECOMMENDED UPGRADE

### Summary
Keeps last 5 timestamped versions in `backups/` folder with automatic cleanup. Time-machine recovery for "go back 3 saves" scenarios, much better for concurrent write recovery.

### Storage Calculation (Production Scale)
```
Rotating backups structure:
backups/
  playerData-2025-10-01T00-56-12-847Z.json   (770KB)
  playerData-2025-10-01T00-45-33-123Z.json   (770KB)
  playerData-2025-10-01T00-30-15-456Z.json   (770KB)
  playerData-2025-10-01T00-15-08-789Z.json   (770KB)
  playerData-2025-10-01T00-00-44-012Z.json   (770KB)
  safariContent-2025-10-01T00-56-12-847Z.json (457KB)
  safariContent-2025-10-01T00-45-33-123Z.json (457KB)
  ... (5 versions each)

Per file, 5 versions:
  playerData backups:     3.85MB (770KB × 5)
  safariContent backups:  2.28MB (457KB × 5)
---
TOTAL backups folder:     6.13MB

With current files:       7.4MB total disk usage
```

### Technical Implementation

**Step 1: Create folder structure**
```bash
mkdir -p backups
echo "Backup directory for critical data files" > backups/.gitkeep
git add backups/.gitkeep
git commit -m "Add backups folder for rotating data backups"
```

**Step 2: Modify savePlayerData() in storage.js**
```javascript
export async function savePlayerData(data) {
  const MAX_BACKUPS = 5;  // Keep last 5 versions

  // [... existing validation steps 1-2: size + structure validation ...]

  // 3. ROTATING BACKUP - Keep last N versions in backups/ folder
  const backupsDir = path.join(path.dirname(STORAGE_FILE), 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `playerData-${timestamp}.json`;
  const backupPath = path.join(backupsDir, backupFilename);

  try {
    // Ensure backups directory exists
    await fs.mkdir(backupsDir, { recursive: true });

    // Copy current file to timestamped backup
    const fileExists = await fs.access(STORAGE_FILE).then(() => true).catch(() => false);
    if (fileExists) {
      await fs.copyFile(STORAGE_FILE, backupPath);
      console.log('✅ Rotating backup created:', backupFilename);

      // Cleanup old backups (keep last MAX_BACKUPS)
      const backupFiles = (await fs.readdir(backupsDir))
        .filter(f => f.startsWith('playerData-') && f.endsWith('.json'))
        .filter(f => !f.includes('REJECTED'))  // Never delete forensic files
        .sort()
        .reverse();  // Newest first

      if (backupFiles.length > MAX_BACKUPS) {
        const toDelete = backupFiles.slice(MAX_BACKUPS);
        for (const oldBackup of toDelete) {
          await fs.unlink(path.join(backupsDir, oldBackup));
          console.log('🗑️  Cleaned old backup:', oldBackup);
        }
      }
    }
  } catch (error) {
    console.error('⚠️ Rotating backup failed:', error.message);
    // Continue anyway - better to save than lose in-memory changes
  }

  // [... existing steps 4-7: atomic write, verification, rename, clear cache ...]
}
```

**Step 3: Apply same pattern to safariContent.json**
```javascript
// In safariManager.js - add same rotating backup logic before fs.writeFile
// Copy the pattern from storage.js, adjust for SAFARI_CONTENT_FILE
```

**Step 4: Add utility functions for recovery**
```javascript
// In storage.js
export async function listBackups(filename = 'playerData') {
  const backupsDir = path.join(path.dirname(STORAGE_FILE), 'backups');
  const files = await fs.readdir(backupsDir);
  return files
    .filter(f => f.startsWith(filename + '-') && f.endsWith('.json'))
    .sort()
    .reverse()
    .map(f => ({
      filename: f,
      path: path.join(backupsDir, f),
      timestamp: f.match(/-([\d-T]+Z)\.json$/)?.[1]
    }));
}

export async function restoreFromBackup(backupFilename) {
  const backupPath = path.join(path.dirname(STORAGE_FILE), 'backups', backupFilename);
  await fs.copyFile(backupPath, STORAGE_FILE);
  requestCache.clear();
  console.log('✅ Restored from backup:', backupFilename);
}
```

### Recovery Procedure
```bash
# List available backups (newest first)
ls -lth backups/playerData-*.json | head -5

# Restore specific version
cp backups/playerData-2025-10-01T00-45-33-123Z.json playerData.json
./scripts/dev/dev-restart.sh "Restore from 00:45 backup"

# Restore most recent backup (one-liner)
cp $(ls -t backups/playerData-*.json | head -1) playerData.json
```

### Testing Checklist
**Critical tests before deployment:**

1. **Rapid Save Test** (verify cleanup works)
   ```bash
   # Make 10 rapid changes (trigger 10 saves)
   # Verify only 5 backups remain in backups/ folder
   ls backups/playerData-*.json | wc -l  # Should be 5
   ```

2. **Timestamp Collision Test** (verify millisecond precision)
   ```bash
   # Trigger 2 saves within 1 second
   # Verify 2 distinct backup files created (no overwrite)
   ```

3. **Cleanup Safety Test** (verify never deletes current file)
   ```bash
   # Verify backupFiles.filter excludes current playerData.json
   # Verify only files matching pattern playerData-TIMESTAMP.json deleted
   ```

4. **Recovery Test** (verify restore procedure)
   ```bash
   # Make a change, note timestamp
   # Restore from backup
   # Verify change was reverted
   ```

5. **Concurrent Write Test** (verify multiple versions preserved)
   ```bash
   # Simulate: User A saves, User B saves (overwrites A)
   # Verify both versions exist in backups/
   # Verify User A's changes recoverable
   ```

6. **Folder Creation Test** (verify fresh install)
   ```bash
   # Delete backups/ folder
   # Trigger save
   # Verify backups/ folder created automatically
   ```

7. **Disk Space Test** (verify reasonable growth)
   ```bash
   # Check initial disk usage: du -sh backups/
   # Make 20 saves
   # Verify disk usage stabilizes at ~6-7MB (not growing unbounded)
   ```

### Scores
| Criteria | Rating | Notes |
|----------|--------|-------|
| Risk to Implement | ⚠️ MEDIUM | Cleanup logic needs testing |
| Effort to Implement | 2-3 hours | Both files + rigorous testing |
| Storage Efficiency | ⭐⭐⭐⭐ (4/5) | 6.13MB total |
| Recovery Granularity | ⭐⭐⭐⭐⭐ (5/5) | 5 recovery points |
| Concurrent Write Protection | ⭐⭐⭐⭐ (4/5) | 5 versions = 5 chances |
| Operational Overhead | ⭐⭐⭐⭐ (4/5) | Automatic cleanup |
| Future-Proofing | ⭐⭐⭐⭐⭐ (5/5) | Scales to any files |

### Pros/Cons
✅ **Multiple recovery points** (time-machine: "go back 3 saves")
✅ **Better concurrent write protection** (5 versions vs 1)
✅ **Reasonable disk space** (6.13MB total)
✅ **Automatic cleanup** (no unbounded growth)
✅ **Scales to any number of data files** (just add pattern)
✅ **Timestamped** (know exactly when each backup was created)
⚠️ **More complex** (folder management, cleanup logic)
⚠️ **Testing required** (ensure cleanup doesn't delete wrong files)
⚠️ **Implementation time** (2-3 hours for both files)

### Risk Mitigation
**Key risks and mitigations:**

1. **Risk:** Cleanup deletes wrong files (e.g., current file)
   - **Mitigation:** Filter explicitly for `playerData-TIMESTAMP.json` pattern
   - **Mitigation:** Never delete files without `-` in name
   - **Mitigation:** Test cleanup logic extensively before deployment

2. **Risk:** Timestamp collisions (rapid saves overwrite backups)
   - **Mitigation:** Use millisecond precision in timestamp
   - **Mitigation:** ISO format with milliseconds: `2025-10-01T00-45-33-847Z`

3. **Risk:** Folder doesn't exist on fresh install
   - **Mitigation:** `fs.mkdir(backupsDir, { recursive: true })` creates if needed
   - **Mitigation:** backups/.gitkeep tracked in repo

4. **Risk:** Disk space exhaustion
   - **Mitigation:** MAX_BACKUPS constant limits growth to known size
   - **Mitigation:** 6.13MB is negligible on modern hardware

5. **Risk:** Backup fails, save continues (data saved without backup)
   - **Mitigation:** This is INTENTIONAL - better to save than lose in-memory changes
   - **Mitigation:** Log warning, continue with atomic write

---

## Option 3: Deployment Backups (Future Consideration)

### Summary
Backs up entire application state (code + data) before each deployment using rsync. Good for "entire dev session went bad" recovery, complements per-save backups with different granularity.

### Storage Calculation (Production Scale)
```
Per deployment backup:
  Source code:          ~5MB
  playerData.json:      770KB
  safariContent.json:   457KB
  Other config:         ~100KB
---
Per backup:             ~6.3MB

With 10 deployments:    63MB
```

### Technical Implementation (dev-restart.sh integration)
```bash
#!/bin/bash
# Add at line 22, BEFORE git operations

# Configuration
BACKUP_ROOT="/home/reece/castbot-backups"
MAX_BACKUPS=10

echo "💾 Creating deployment backup..."
TIMESTAMP=$(date -Iseconds | sed 's/[:]/-/g')
BACKUP_DIR="$BACKUP_ROOT/backup-$TIMESTAMP"

# Create backup
mkdir -p "$BACKUP_DIR"
rsync -a --quiet \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='backups/' \
  --exclude='/tmp/' \
  /home/reece/castbot/ "$BACKUP_DIR/"

if [ $? -eq 0 ]; then
  echo "✅ Backup created: backup-$TIMESTAMP"

  # Cleanup old backups (keep last MAX_BACKUPS)
  BACKUP_COUNT=$(ls -1d "$BACKUP_ROOT"/backup-* 2>/dev/null | wc -l)
  if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    OLD_BACKUPS=$(ls -1dt "$BACKUP_ROOT"/backup-* | tail -n +$((MAX_BACKUPS + 1)))
    echo "🗑️  Cleaning $(echo "$OLD_BACKUPS" | wc -l) old backup(s)..."
    echo "$OLD_BACKUPS" | xargs rm -rf
  fi
else
  echo "⚠️  Backup failed (continuing anyway)"
fi

# [... rest of dev-restart.sh continues ...]
```

### Recovery Procedure
```bash
# List available backups
ls -lth /home/reece/castbot-backups/

# Restore entire application state
cp -r castbot-backups/backup-2025-10-01T00-45-00/* /home/reece/castbot/
./scripts/dev/dev-restart.sh "Restored from backup"

# Restore data files only
cp castbot-backups/backup-2025-10-01T00-45-00/playerData.json /home/reece/castbot/
cp castbot-backups/backup-2025-10-01T00-45-00/safariContent.json /home/reece/castbot/
```

### Scores
| Criteria | Rating | Notes |
|----------|--------|-------|
| Risk to Implement | ✅ LOW | rsync is safe, proven in prod |
| Effort to Implement | 1.5 hours | Add to dev-restart.sh + test |
| Storage Efficiency | ⭐⭐⭐ (3/5) | 63MB for 10 backups |
| Recovery Granularity | ⭐⭐ (2/5) | Per-deployment only |
| Concurrent Write Protection | ⭐⭐ (2/5) | Snapshot at deployment time |
| Operational Overhead | ⭐⭐⭐ (3/5) | Automatic with dev-restart |
| Future-Proofing | ⭐⭐⭐⭐ (4/5) | Full-state recovery |

### Pros/Cons
✅ **Full application state backup** (code + data together)
✅ **Already proven in production** (deploy-remote-wsl.js uses this)
✅ **Can restore entire working state** (not just data)
✅ **Good for "rollback entire dev session"**
✅ **Automatic with dev-restart.sh** (zero extra commands)
⚠️ **Larger disk space** (63MB for 10 backups)
⚠️ **Deployment-frequency only** (not per-save)
⚠️ **Overkill for data-only recovery** (backs up code on every data change)

### When to Use
- "I broke something in this dev session, rollback everything"
- "Code changes AND data changes went wrong together"
- "I need the exact state from this morning's deployment"

### When NOT to Use
- "Oops, that last save was wrong" → Use Option 2 (rotating backups)
- "Concurrent write overwrote changes" → Use Option 2 (rotating backups)
- "I need the version from 10 minutes ago" → Use Option 2 (rotating backups)

---

## Option 6: Hybrid (Rotating + Deployment) - FUTURE PRODUCTION-GRADE

### Summary
Best of both worlds - rotating backups for per-save recovery (concurrent writes, "oops" moments) + deployment backups for full-state rollback (entire dev session went wrong). Defense in depth.

### Storage Calculation (Production Scale)
```
Rotating backups (5):       6.13MB (per-save granularity)
Deployment backups (10):    63MB   (per-deployment granularity)
Current files:              1.2MB
---
TOTAL:                      70.3MB
```

### Architecture
```
Data Protection Layers:

Layer 1 (Per-save):
  backups/playerData-2025-10-01T00-56-12.json  (last 5 saves)
  backups/playerData-2025-10-01T00-45-33.json
  backups/playerData-2025-10-01T00-30-15.json
  ...

Layer 2 (Per-deployment):
  castbot-backups/backup-2025-10-01T00-00-00/  (last 10 deployments)
  castbot-backups/backup-2025-09-30T23-00-00/
  castbot-backups/backup-2025-09-30T22-00-00/
  ...

Layer 3 (Production):
  SSH to production, download backup
  (last resort, manual recovery)
```

### Recovery Decision Tree
```
┌─ Need last 5 saves? (0-30 min ago)
│  └─> backups/ folder (Option 2: Rotating backups)
│      Example: "Oops, that last save was wrong"
│
├─ Need from earlier today? (1-8 hours ago)
│  └─> castbot-backups/ folder (Option 3: Deployment)
│      Example: "Dev session went bad after morning deployment"
│
└─ Need from last week? (7+ days ago)
   └─> Production backup (manual SSH download)
       Example: "Need to recover old data for analysis"
```

### Scores
| Criteria | Rating | Notes |
|----------|--------|-------|
| Risk to Implement | ⚠️ MEDIUM | Two systems to maintain |
| Effort to Implement | 3.5-4.5h | Both options combined |
| Storage Efficiency | ⭐⭐⭐ (3/5) | 70.3MB total |
| Recovery Granularity | ⭐⭐⭐⭐⭐ (5/5) | Multiple levels |
| Concurrent Write Protection | ⭐⭐⭐⭐⭐ (5/5) | Best option |
| Operational Overhead | ⭐⭐⭐ (3/5) | Two systems to monitor |
| Future-Proofing | ⭐⭐⭐⭐⭐ (5/5) | Production-grade |

### Pros/Cons
✅ **Multiple recovery granularities** (per-save + per-deployment)
✅ **Best concurrent write protection** (5 versions in rotating backups)
✅ **Defense in depth** (if one fails, other available)
✅ **Clear decision tree** for recovery (no confusion)
✅ **Production-grade** (suitable for critical systems)
⚠️ **Most disk space** (70.3MB total)
⚠️ **Two systems to maintain** (rotating + deployment)
⚠️ **Highest implementation effort** (4+ hours)

### When to Implement
Wait until one of these conditions is true:
- Production has >100 active users
- Multiple servers using the bot (data loss affects many)
- Business continuity matters (making money from bot)
- Deployment frequency increases (>20/day = need session rollback)

**Current assessment:** Not yet needed, but good to have roadmap ready.

---

## Options NOT Recommended

### Option 4: Git-Based Backups ❌

**Why excluded:** Anti-pattern for data files

**Problems:**
- Repo bloat: 3GB/year (172KB × 50 saves/day × 365 days)
- Performance degradation: git status, git log slow down
- Clone time explosion: New developers wait for huge repo download
- Merge conflicts: If multiple branches modify data
- GitHub limits: Repos >1GB get warnings, >100GB rejected

**Industry consensus:** Don't track generated/data files in git

**Only exception:** If you're already committed to git for data (you're not) AND have expertise for repo maintenance (high burden).

### Option 5: External Backups (S3/Remote Server) ❌

**Why excluded:** Too much effort and expensive for current scale

**Would require:**
- AWS account setup + S3 bucket creation
- Authentication management (API keys, rotation)
- Network dependency (upload reliability)
- Cost management (~$0.01/month, but billing setup overhead)
- Monitoring & alerts (backup success/failure)
- 4-6 hours implementation + testing

**When to reconsider:**
- Production becomes mission-critical (>100 active users)
- Need disaster recovery (server failure, disk failure)
- Have budget for external services
- Have DevOps expertise for maintenance

**Current assessment:** Overkill for current usage, revisit in 6-12 months.

---

## Comparison Summary

### Quick Reference Table

| Option | Disk Space | Effort | Concurrent Write Protection | Best For |
|--------|-----------|--------|----------------------------|----------|
| **Option 1** (current) | 2.45MB | ✅ Done | ⭐⭐ (1 recovery point) | Baseline protection |
| **Option 2** (rotating) | 6.13MB | 2-3h | ⭐⭐⭐⭐ (5 recovery points) | **Recommended upgrade** |
| **Option 3** (deployment) | 63MB | 1.5h | ⭐⭐ (deployment-time only) | Session rollback |
| **Option 6** (hybrid) | 70.3MB | 4h | ⭐⭐⭐⭐⭐ (best protection) | Production-grade |

### Protection Level Comparison

**Option 1 (Current):**
- Protects against: Single file corruption, validation failures
- Doesn't protect against: Concurrent overwrites (only 1 recovery point)
- **Recovery window:** Last save only

**Option 2 (Rotating - RECOMMENDED):**
- Protects against: Single file corruption, validation failures, concurrent overwrites (5 versions)
- Doesn't protect against: Entire dev session going bad
- **Recovery window:** Last 5 saves (~30 minutes typical)

**Option 3 (Deployment):**
- Protects against: Entire dev session going bad, code + data together
- Doesn't protect against: Changes within dev session (per-save granularity)
- **Recovery window:** Last 10 deployments (~1-2 days typical)

**Option 6 (Hybrid):**
- Protects against: Everything (single corruption, concurrent writes, session rollback)
- Production-grade defense in depth
- **Recovery window:** Last 5 saves + last 10 deployments

---

## Decision & Implementation Roadmap

### Decision (October 1, 2025)

**Immediate Implementation:**
1. ✅ Add `.backup` protection to `safariContent.json` (10 minutes)
2. ✅ Upgrade both files to **Option 2: Rotating Backups** (2-3 hours)
3. ✅ Test rigorously (see testing checklist in Option 2 section)

**Future Consideration:**
- **Option 3 (Deployment backups):** Revisit in 1-2 months if needed
- **Option 6 (Hybrid):** Revisit when production becomes critical (>100 users)

**Rationale:**
- Option 2 provides excellent protection/effort ratio
- 6.13MB disk space is negligible
- 5 recovery points significantly better than 1 (concurrent write protection)
- Time-machine capability valuable for development
- Low operational overhead (automatic cleanup)
- Future-proof (scales to any data files)

### Phase 1: safariContent.json .backup (10 minutes)

**Goal:** Extend current single `.backup` pattern to safariContent.json

**Implementation:**
```javascript
// In safariManager.js, add to saveSafariContent() before fs.writeFile:
const backupPath = SAFARI_CONTENT_FILE + '.backup';
try {
  const fileExists = await fs.access(SAFARI_CONTENT_FILE).then(() => true).catch(() => false);
  if (fileExists) {
    await fs.copyFile(SAFARI_CONTENT_FILE, backupPath);
    console.log('✅ Safari backup created:', backupPath);
  }
} catch (error) {
  console.error('⚠️ Safari backup failed:', error.message);
}
```

**Testing:**
```bash
# Make a safari change (add custom action via admin menu)
# Verify safariContent.json.backup was created
ls -lh safariContent.json.backup
# Should show 457KB file with recent timestamp
```

**Success Criteria:**
- ✅ safariContent.json.backup file created
- ✅ Log message "✅ Safari backup created:" appears
- ✅ File size matches current safariContent.json size
- ✅ Recovery works: `cp safariContent.json.backup safariContent.json`

### Phase 2: Rotating Backups Upgrade (2-3 hours)

**Goal:** Upgrade both playerData.json and safariContent.json to rotating backups (5 versions)

**Step 1: Create folder structure (5 minutes)**
```bash
cd /home/reece/castbot
mkdir -p backups
echo "# Backup Directory

This folder contains rotating backups of critical data files.

## Files
- playerData-TIMESTAMP.json (last 5 versions)
- safariContent-TIMESTAMP.json (last 5 versions)

## Retention
- MAX_BACKUPS = 5 (configurable in storage.js)
- Automatic cleanup on each save

## Recovery
See 00-BackupOptions.md for recovery procedures.
" > backups/README.md

git add backups/README.md
git commit -m "Add backups folder for rotating data backups"
```

**Step 2: Update storage.js (30 minutes)**
- Copy rotating backup implementation from Option 2 section
- Add to savePlayerData() function
- Add listBackups() and restoreFromBackup() utility functions

**Step 3: Update safariManager.js (30 minutes)**
- Apply same pattern to saveSafariContent()
- Adjust for SAFARI_CONTENT_FILE constant
- Match timestamp format with storage.js

**Step 4: Rigorous Testing (60-90 minutes)**
- Run all 7 tests from Option 2 testing checklist
- Verify cleanup works correctly
- Test recovery procedures
- Verify concurrent write protection
- Check disk space usage

**Success Criteria:**
- ✅ All 7 tests pass
- ✅ backups/ folder contains max 5 versions per file
- ✅ Cleanup removes oldest files correctly
- ✅ Recovery procedures work
- ✅ Disk space stable at ~6-7MB
- ✅ Logs show "✅ Rotating backup created: playerData-TIMESTAMP.json"
- ✅ Logs show "🗑️ Cleaned old backup: ..." when >5 versions exist

**Rollback Plan (if tests fail):**
```bash
# Revert code changes
git checkout storage.js safariManager.js

# Keep backups/ folder (no harm, just unused)
# Single .backup pattern still works as fallback

./scripts/dev/dev-restart.sh "Rollback rotating backups"
```

### Phase 3: Documentation Update (30 minutes)

**Update CLAUDE.md with:**
- Backup strategy in use (Option 2: Rotating backups)
- Recovery procedures (basic commands)
- Reference to 00-BackupOptions.md for details

**Example CLAUDE.md addition:**
```markdown
## 💾 Data Backup Strategy

**Current Protection:** Rotating Backups (5 versions per file)
- `playerData.json`: Protected (rotating backups in `backups/` folder)
- `safariContent.json`: Protected (rotating backups in `backups/` folder)

**Quick Recovery:**
```bash
# List available backups
ls -lth backups/playerData-*.json

# Restore most recent backup
cp $(ls -t backups/playerData-*.json | head -1) playerData.json
./scripts/dev/dev-restart.sh "Restore from backup"
```

**Full details:** See [00-BackupOptions.md](00-BackupOptions.md)
```

### Timeline

**Today (October 1):**
- ✅ Documentation complete (00-BackupOptions.md)
- ⏸️ Sleep, review tomorrow

**Tomorrow (October 2):**
- Phase 1: safariContent.json .backup (10 min)
- Phase 2: Rotating backups upgrade (2-3 hours)
- Phase 3: Documentation update (30 min)

**Total estimated time:** 3-4 hours

---

## Monitoring & Maintenance

### What to Monitor

**Daily (automated, check logs):**
- ✅ Backup creation messages in logs
- ✅ Cleanup messages (verify happening correctly)
- ❌ Backup failure warnings (rare, investigate if seen)

**Weekly (manual check):**
```bash
# Verify disk space stable
du -sh backups/

# Should be ~6-7MB, not growing unbounded
# If >20MB, investigate (cleanup may have failed)
```

**Monthly (verification):**
```bash
# Count backups per file
ls backups/playerData-*.json | wc -l    # Should be 5
ls backups/safariContent-*.json | wc -l # Should be 5

# Test recovery procedure (on dev, not prod!)
cp $(ls -t backups/playerData-*.json | head -1) /tmp/test-restore.json
diff playerData.json /tmp/test-restore.json
# Should show recent changes (expected)
```

### Maintenance Tasks

**None required** - Automatic cleanup handles everything.

**Optional (if needed):**
- Adjust MAX_BACKUPS constant (increase retention)
- Manual cleanup if disk space becomes concern (unlikely)
- Add monitoring alerts (if production becomes critical)

### Troubleshooting

**Problem:** backups/ folder keeps growing (>20MB)
**Cause:** Cleanup logic not running or failed
**Solution:**
```bash
# Check backup count
ls backups/playerData-*.json | wc -l
# If >5, cleanup failed

# Manual cleanup (keep last 5)
ls -t backups/playerData-*.json | tail -n +6 | xargs rm
ls -t backups/safariContent-*.json | tail -n +6 | xargs rm

# Investigate logs for cleanup errors
grep "Cleaned old backup" /tmp/castbot-dev.log
```

**Problem:** Backup creation failing
**Cause:** Disk space full, permissions issue, or folder missing
**Solution:**
```bash
# Check disk space
df -h /home/reece/castbot

# Check folder permissions
ls -ld backups/

# Recreate folder if needed
mkdir -p backups
chmod 755 backups

# Check logs for specific error
grep "Rotating backup failed" /tmp/castbot-dev.log
```

**Problem:** Recovery not working
**Cause:** Backup file corrupted or wrong file restored
**Solution:**
```bash
# Verify backup file size (should be ~770KB for playerData)
ls -lh backups/playerData-*.json

# Try older backup (if most recent corrupted)
cp $(ls -t backups/playerData-*.json | head -2 | tail -1) playerData.json

# Last resort: restore from production
scp -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170:/home/bitnami/castbot/playerData.json .
```

---

## Related Documentation

- **[00-DataLoss-PostMortem.md](00-DataLoss-PostMortem.md)** - Original incident analysis and Priority 1-3 protections
- **[00-SUMMARY-DataLoss-Resolution.md](00-SUMMARY-DataLoss-Resolution.md)** - Quick reference summary
- **[storage.js](storage.js)** - Implementation of savePlayerData() with validation + backup
- **[safariManager.js](safariManager.js)** - Implementation of saveSafariContent() (to be updated)

---

## Appendix: Production Deployment Backup (Reference)

**For comparison:** Production deployment already has backup mechanism

**Production backup (deploy-remote-wsl.js:182-189):**
```javascript
// Step 2: Create Backup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
await execSSH(
  `cd ${REMOTE_PATH} && rsync -av --exclude='node_modules' --exclude='.git' . ../castbot-backup-${timestamp}/`,
  'Backing up current version (excluding node_modules)',
  'risk-low'
);
```

**Creates:**
```
/home/bitnami/
  castbot/                              (current production)
  castbot-backup-2025-10-01T00-30-00/   (deployment backup)
  castbot-backup-2025-09-30T15-20-00/
  ...
```

**Key differences from dev:**
- **Frequency:** Per-deployment (2-5 per week) vs. per-save (50-200 per day)
- **Scope:** Full codebase vs. data files only
- **Size:** ~6MB per backup vs. 1.2MB data files
- **Purpose:** Deployment rollback vs. data recovery
- **Granularity:** Deployment-level vs. save-level

**Why dev needs different approach:**
- Dev deploys more frequently (~10-20/day during active development)
- Data changes more frequently than code (need per-save granularity)
- Full codebase backups are overkill for data-only recovery
- Rotating data backups complement deployment backups (different granularities)

**Future:** Option 6 (Hybrid) combines both approaches for production-grade protection.

---

**Document Status:** Complete and ready for implementation
**Next Action:** Phase 1 - Add safariContent.json .backup protection (10 minutes)
**Review Date:** After Phase 2 completion (verify rotating backups working as expected)