# Backup Strategy — Unified Data Protection

**Status:** Strategy defined, implementation planned
**Priority:** High — safariContent has no write mutex, rolling backup proven stale on prod
**Supersedes:** `docs/02-implementation-wip/not-started/00-BackupOptions.md` (Oct 2025, partially outdated)

## The Problem

We have 6+ JSON files, 4 different backup mechanisms, 2 different save implementations, and inconsistent naming (`.backup` vs `.bak`). The safariContent rolling backup on prod is stale (only 12 of 31 guilds) because git-tracked dev copies were overwriting it on every deploy. That's now fixed (gitignored as of 2026-03-15) but the deeper issue remains: **no unified strategy**.

### Current State (as of 2026-03-15)

| File | Size (prod) | Rolling backup | Write mutex | Size validation | Discord backup | Gitignored |
|---|---|---|---|---|---|---|
| `playerData.json` | 2.1 MB | `.backup` (7-step) | Yes | 50KB min + guild count | Yes (new) | Yes |
| `safariContent.json` | 2.0 MB | `.bak` (3-step) | **No** | 1KB min only | Yes (new) | Yes |
| `scheduledJobs.json` | 2 B | No | No | No | Yes (new) | Yes |
| `dstState.json` | ~5 KB | No | No | No | No | Yes (newly) |
| `restartHistory.json` | ~1 KB | No | No | No | No | Yes (newly) |
| `messageHistory.json` | ~3 KB | No | No | No | No | Yes (newly) |

### Gaps

1. **safariContent has no write mutex** — two rapid saves can corrupt the `.tmp` file
2. **Two completely different save implementations** — `storage.js` (7-step, battle-tested) vs `safariManager.js` (3-step, weaker)
3. **Inconsistent naming** — `.backup` vs `.bak`
4. **Rolling backup = 1 copy** — one bad double-save and the backup is also toast
5. **No backup verification** — rolling backups are never checked for valid JSON
6. **No documented recovery procedures** — multiple backup sources, no decision tree

## Protection Tiers

### Tier 1: Critical (data loss = users affected)

**Files:** `playerData.json`, `safariContent.json`

**Protection required:**
- Atomic writes (temp file + rename)
- Write mutex (prevent concurrent `.tmp` corruption)
- Size validation (refuse suspiciously small saves)
- Structure validation (guild count check)
- Rolling backup (last known-good before each write)
- Rotating backups (5 versions in `backups/` dir)
- Discord channel backup (daily snapshot with downloadable files)
- Deployment backup (full codebase rsync on prod deploy)

### Tier 2: Important (loss = inconvenient, recoverable)

**Files:** `scheduledJobs.json`

**Protection required:**
- Discord channel backup (daily)
- Regenerable from scheduler on restart (starts empty gracefully)

### Tier 3: Ephemeral (loss = no impact)

**Files:** `dstState.json`, `restartHistory.json`, `messageHistory.json`

**Protection required:** None. All regenerated on startup or next use. Just keep them gitignored so deploys don't clobber prod state.

## Active Backup Layers

### Layer 1: Rolling Backup (per save)

Copies current file to `{file}.backup` before every write. Provides last-known-good recovery. Currently implemented separately in `storage.js` and `safariManager.js` — to be unified via `atomicSave`.

**Recovery:** `cp playerData.json.backup playerData.json && dev-restart.sh "Restore from backup"`

### Layer 2: Rotating Backups (per save, 5 versions) — PLANNED

Timestamped copies in `backups/` directory with automatic cleanup. Provides time-machine recovery ("go back 3 saves"). Spec in `00-BackupOptions.md` Option 2.

**Recovery:** `cp backups/playerData-{timestamp}.json playerData.json`

### Layer 3: Discord Channel Backup (interval)

Posts `playerData.json`, `safariContent.json`, and `scheduledJobs.json` as downloadable file attachments to Discord channel `1480242675725897789`. Components V2 UI with stats and next-backup timestamp.

- **Dev:** Every 5 minutes
- **Prod:** Every 24 hours (target: 6PM AWST / 10:00 UTC — before US users wake up)
- **Implementation:** `src/monitoring/backupService.js`
- **Storage projections (prod):** 4.1 MB/day, ~1.5 GB/year (Discord CDN, no local cost)

**Recovery:** Download files from Discord channel, copy to project root.

### Layer 4: Deployment Backup (per deploy)

Full codebase rsync (excluding node_modules/.git) to sibling directory on prod before each deploy. Provides full-state rollback.

- **Implementation:** `deploy-remote-wsl.js` line ~182
- **Location:** `/opt/bitnami/projects/castbot-backup-{timestamp}/`
- **Frequency:** 2-5 per week
- **No automatic cleanup** (deploys infrequent enough)

**Recovery:** `cp -r ../castbot-backup-{timestamp}/* /opt/bitnami/projects/castbot/`

## Recovery Decision Tree

```
What went wrong?
│
├─ Last save was bad (concurrent write, bad data)
│  └─ Layer 1: Rolling backup (.backup file)
│     cp playerData.json.backup playerData.json
│
├─ Need to go back several saves (last 30 min)
│  └─ Layer 2: Rotating backups (backups/ dir) [PLANNED]
│     ls -lt backups/playerData-*.json | head -5
│     cp backups/playerData-{pick one}.json playerData.json
│
├─ Need today's data from before a session
│  └─ Layer 3: Discord channel backup
│     Download from #bot-backups channel in Discord
│
├─ Deploy broke everything (code + data)
│  └─ Layer 4: Deployment backup
│     cp -r ../castbot-backup-{timestamp}/* .
│
└─ Server died / disk failure
   └─ Layer 3 (Discord) + Layer 4 (last deploy backup)
      Download from Discord, or restore from backup dir
```

## Implementation TODO

### Phase 1: `atomicSave` utility (the gold standard)

Extract from `storage.js`'s proven 7-step pattern into a shared utility. Both save functions call it. One mutex, one convention, one log format.

```
atomicSave(filepath, data, {
  minSize,           // byte threshold for wipe detection
  structureCheck,    // optional validation fn(parsedData) → true/false
  backupExtension,   // '.backup' (standardised, kills '.bak')
})
```

**Steps inside `atomicSave`:**
1. Serialize to JSON
2. Size validation (refuse below `minSize`)
3. Structure validation (optional callback)
4. Copy current → `.backup` (rolling backup)
5. Write to `.tmp`
6. Verify `.tmp` size
7. Atomic rename `.tmp` → target
8. Clear relevant cache

**Risk:** Low — extracting existing proven code, no behavior change.

### Phase 2: Wire `savePlayerData` → `atomicSave`

Drop-in replacement. The code is literally being extracted from this function. Verify identical behavior.

**Risk:** Low — same code, just moved.

### Phase 3: Wire `saveSafariContent` → `atomicSave`

The real win. Gets:
- Write mutex (closes concurrent write race)
- Guild count validation (currently missing)
- Consistent `.backup` extension
- Consistent logging

**Risk:** Medium — adding mutex changes timing behavior. Test rapid safari saves.

### Phase 4: Add rotating backups (5 versions)

Add `maxRotating` option to `atomicSave`. When set, also copies to `backups/{basename}-{timestamp}.json` and cleans up oldest beyond limit.

Full spec already in `docs/02-implementation-wip/not-started/00-BackupOptions.md` Option 2.

**Risk:** Low — additive, doesn't change existing backup behavior.

### Phase 5: Clean up prod

- Remove stale `.bak` file from prod (worthless, only 12/31 guilds)
- Verify `.backup` files are fresh post-deploy
- Verify Discord backup service posting correctly

### Phase 6: Backup strategy doc (this file → features doc)

Move this RaP to `docs/03-features/` once implementation complete. Reference in CLAUDE.md.

## Prod File Sizes (2026-03-15)

```
playerData.json:           2.1 MB
playerData.json.backup:    2.1 MB
safariContent.json:        2.0 MB
safariContent.json.bak:    1.3 MB  ← STALE (12/31 guilds, deploy-clobbered)
scheduledJobs.json:        2 B
```

**Growth since Oct 2025 doc:**
- playerData: 770 KB → 2.1 MB (2.7x in 5 months)
- safariContent: 457 KB → 2.0 MB (4.4x in 5 months)
- Growth rate is faster than projected — confirms need for proper backup strategy

**Storage projections for rotating backups (5 versions, prod):**
- playerData: 5 × 2.1 MB = 10.5 MB
- safariContent: 5 × 2.0 MB = 10.0 MB
- Total: ~20.5 MB (negligible)
