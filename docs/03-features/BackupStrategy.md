# Backup Strategy — Unified Data Protection

**Status:** Active — core implementation complete, enhancements ongoing
**Originated:** RaP 0948, 2026-03-15
**Supersedes:** `docs/02-implementation-wip/not-started/00-BackupOptions.md` (Oct 2025)

## Protection Tiers

| Tier | Files | Protection | Status |
|---|---|---|---|
| **1 — Critical** | `playerData.json`, `safariContent.json` | atomicSave + rolling backup + Discord backup + deploy backup | **Done** |
| **2 — Important** | `scheduledJobs.json`, `dstState.json` | Discord backup, regenerable on restart | **Done** |
| **3 — Ephemeral** | `restartHistory.json`, `messageHistory.json` | Gitignored only | **Done** |

## Active Backup Layers

### Layer 1: Rolling Backup (per save) — DONE

Both critical files use `atomicSave()` (`atomicSave.js`) with unified protection:
- Write mutex (prevents concurrent `.tmp` corruption)
- Size validation (`playerData` 50KB min, `safariContent` 1KB min)
- Structure validation (guild count checks)
- Atomic writes (temp file + rename)
- Rolling `.backup` copy before each write

**Implementation:** `atomicSave.js` — called by `storage.js:savePlayerData()` and `safariManager.js:saveSafariContent()`

**Recovery:**
```bash
cp playerData.json.backup playerData.json
./scripts/dev/dev-restart.sh "Restore from backup"
```

### Layer 2: Discord Channel Backup (daily) — DONE

Posts `playerData.json`, `safariContent.json`, `scheduledJobs.json`, and `dstState.json` as downloadable file attachments to Discord channel `1480242675725897789`. Components V2 UI with File components (type 13), stats, and relative timestamp for next backup.

- **Dev:** Every 5 minutes (simple interval)
- **Prod:** Daily at 6PM AWST / 10:00 UTC (anchored to clock, not restart time)
- **Startup:** Always fires 30s after bot ready (regardless of interval)
- **Implementation:** `src/monitoring/backupService.js`, wired in `app.js` ready handler

**Recovery:** Download files from Discord channel, copy to project root.

### Layer 3: Deployment Backup (per deploy) — DONE

Full codebase rsync (excluding node_modules/.git) to sibling directory on prod before each deploy.

- **Implementation:** `deploy-remote-wsl.js` Step 2
- **Location:** `/opt/bitnami/projects/castbot-backup-{timestamp}/`
- **Cleanup:** Keep last 5, delete older (manual — auto-cleanup TODO)
- **Runtime file restore:** Step 3b restores files deleted by `git pull` after `git rm --cached`

**Recovery:**
```bash
cp -r ../castbot-backup-{timestamp}/* /opt/bitnami/projects/castbot/
pm2 restart castbot-pm
```

### Layer 4: Rotating Backups (per save, 5 versions) — DEPRIORITISED

Timestamped copies in `backups/` directory with automatic cleanup. Spec in `00-BackupOptions.md` Option 2. Deprioritised because Discord channel backup (Layer 2) provides timestamped history with downloadable files, covering the same need.

## Recovery Decision Tree

```
What went wrong?
│
├─ Last save was bad (concurrent write, bad data)
│  └─ Layer 1: Rolling backup (.backup file)
│     cp playerData.json.backup playerData.json
│
├─ Need data from earlier today
│  └─ Layer 2: Discord channel backup
│     Download from #bot-backups channel
│
├─ Deploy broke everything (code + data)
│  └─ Layer 3: Deployment backup
│     cp -r ../castbot-backup-{timestamp}/* .
│
└─ Server died / disk failure
   └─ Layer 2 (Discord) + Layer 3 (last deploy backup)
```

## Gitignore Standard

**Adding to `.gitignore` does NOT untrack already-committed files.** Deploys will silently overwrite prod copies with stale dev copies.

**Always two steps:**
```bash
echo "myfile.json" >> .gitignore
git rm --cached myfile.json
```

**Verify:**
```bash
git check-ignore myfile.json  # Should print filename
git ls-files -- myfile.json   # Should print nothing
```

**Wildcards in `.gitignore`** cover backup extensions automatically: `*.json.backup`, `*.json.REJECTED`, `*.json.bak`

## New JSON File Checklist

Documented in CLAUDE.md under "Data File Standards":

1. **Gitignore AND untrack** — add to `.gitignore` then `git rm --cached`
2. **Use `atomicSave()`** for writes — never raw `fs.writeFile` on data files
3. **Add to backup service** — entry in `BACKUP_FILES` in `src/monitoring/backupService.js`
4. **Classify tier** — Tier 1 (atomicSave + Discord), Tier 2 (Discord only), Tier 3 (gitignore only)

## Implementation Status

| Phase | Description | Status |
|---|---|---|
| 1 | `atomicSave` utility | **Done** — `atomicSave.js`, 11 tests |
| 2 | Wire `savePlayerData` → `atomicSave` | **Done** — drop-in replacement |
| 3 | Wire `saveSafariContent` → `atomicSave` | **Done** — gained write mutex + validation |
| 4 | Rotating backups (5 versions) | **Deprioritised** — Discord backup covers this |
| 5 | Clean up prod | **Partial** — stale `.bak` removed by gitignore, deploy backup cleanup done (134 dirs, 10.5 GB freed), auto-cleanup TODO |
| 6 | CLAUDE.md checklist | **Done** — "Data File Standards" section |
| 7 | Graduate to features doc | **Done** — this file |

## TODO

- [ ] Add auto-cleanup to `deploy-remote-wsl.js` — keep last 5 deployment backups, delete older (prevents disk fill, was at 11.2 GB / 139 dirs before manual cleanup)
- [ ] Monitor disk usage on prod — 20GB disk, deployment backups are ~135MB each

## Key Files

| File | Purpose |
|---|---|
| `atomicSave.js` | Unified safe-write utility (mutex, validation, atomic rename) |
| `src/monitoring/backupService.js` | Discord channel backup service |
| `deploy-remote-wsl.js` | Deployment backup (Step 2) + runtime file restore (Step 3b) |
| `storage.js` | `savePlayerData()` → calls `atomicSave` |
| `safariManager.js` | `saveSafariContent()` → calls `atomicSave` |
| `tests/atomicSave.test.js` | 11 tests for atomicSave |
| `.gitignore` | Wildcard rules for `*.json.backup`, `*.json.REJECTED`, `*.json.bak` |

## Incidents That Drove This

- **Sep 2025** — Missing `await` on `savePlayerData()` nearly wiped 170KB of player data. Size validation caught it. Led to 7-step safety in `storage.js`.
- **Nov 2025** — DST crash. `dstState.json` not in git, prod didn't have it. Sonnet's rollback created Frankenstein state. Led to resilient file loading.
- **Mar 2026** — `safariContent.json.bak` was stale for months. Git-tracked dev copy overwriting prod on every deploy. Led to gitignore standard + untrack procedure.
- **Mar 2026** — `safariContent.json` corrupted mid-write during restart. No write mutex. Led to `atomicSave` unification.
- **Mar 2026** — 139 deployment backup dirs consumed 11.2 GB (56% of 20GB disk). No cleanup configured. Led to manual purge + auto-cleanup TODO.
