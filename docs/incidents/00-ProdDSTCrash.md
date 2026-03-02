# 🔴 CRITICAL: Production DST Crash & Recovery Guide

**Date:** 2025-11-02
**Severity:** CRITICAL - Bot non-functional
**Status:** UNSTABLE - Requires immediate intervention
**Author:** Claude Code (Opus instance handling recovery)

---

## 📋 EXECUTIVE SUMMARY

Production CastBot is in a **broken Frankenstein state** after a failed deployment and botched rollback. The bot crashes immediately when users run `/menu` or `/castlist` commands with missing dependency errors. This document provides complete context and step-by-step recovery instructions.

**Current Issues:**
1. **Mismatched code/git state**: Git shows latest fixes but actual files are from old backup
2. **Corrupted node_modules**: Hybrid mix of partial copies and incomplete npm installs
3. **Missing dependencies**: Core packages like `dotenv` and `express` not properly installed
4. **Continuous crash loop**: PM2 keeps restarting the broken bot

---

## 🕐 COMPLETE INCIDENT TIMELINE

### Initial Deployment & Crash (08:36-08:46 UTC)

**08:36 UTC** - Automatic backup created: `castbot-backup-2025-11-02T08-36-36-717Z`

**08:41 UTC** - Production deployment via `npm run deploy-remote-wsl`
- Deployed commits:
  - `75ac149e` Fix castlist dropdown persistence
  - `425755cc` Fix reece_stuff_menu intermittent failures (note: reece_stuff_menu renamed to `analytics_admin` in 2026-03)
  - `d4e40bb3` Fix castlist select dropdown persistence
  - `42bb081a` Change 'Season Emoji' to 'Castlist Emoji'
  - `6991a3e6` Always show Delete/Swap/Merge buttons

**08:41-08:46 UTC** - Catastrophic failure
- Bot entered infinite crash loop (55 restarts in 4 minutes)
- Root cause: `TypeError: Cannot read properties of undefined (reading 'roleFormat')` at `roleManager.js:763`
- Missing `dstState.json` file + no null checks = instant crash

### Sonnet's Rollback Attempt (08:48-09:00 UTC)

**What Sonnet Did (This Created The Current Mess):**

1. **Moved broken deployment** (not copied):
   ```bash
   mv castbot castbot-BROKEN-20251102-164801
   ```
   - This preserved the broken code with its node_modules (302MB)

2. **Restored from backup**:
   ```bash
   cp -r castbot-backup-2025-11-02T08-36-36-717Z castbot
   ```
   - Problem: Backup had NO node_modules (excluded to save space)
   - This gave us OLD code from 08:36

3. **Tried to copy node_modules from BROKEN**:
   ```bash
   cp -r castbot-BROKEN-20251102-164801/node_modules castbot/
   ```
   - This was taking forever (thousands of small files)

4. **ALSO ran npm install in parallel**:
   ```bash
   npm install --production
   ```
   - This created a hybrid mix of dependencies

**Result:** Production now has:
- Git commits showing LATEST code (including fixes)
- Actual files from OLD backup (pre-deployment)
- Corrupted hybrid node_modules (404MB of mixed dependencies)

### Opus's Fix Attempts (09:00-09:42 UTC)

**What I (Opus) Did:**

1. **Added defensive code fixes** (in dev):
   - Fixed null check bug in `roleManager.js:763`
   - Added resilient multi-path loading to `loadDSTState()`
   - Removed `dstState.json` from `.gitignore`
   - Committed as `631fcbbd` and `3a1a7a68`

2. **Attempted git pull** on production:
   - This appeared to work but files were already corrupted from rollback
   - Git showed clean state but files didn't match

3. **Multiple npm install attempts**:
   - Deleted and reinstalled node_modules multiple times
   - npm install kept hanging during audit phase
   - Tried installing just critical packages (`express`, `dotenv`, `data-uri-to-buffer`)
   - Each attempt created more dependency confusion

4. **Current production state**:
   - Bot appears "online" in PM2 but crashes on user interactions
   - Multiple background npm processes still running/stuck
   - node_modules is 404MB of mixed/incomplete dependencies

---

## 🔍 ROOT CAUSE ANALYSIS

### Why The Original Deployment Failed

1. **`dstState.json` was in `.gitignore`**
   - File existed in dev but not tracked in git
   - Production deployment didn't have this file
   - Code at `roleManager.js:763` tried to access `dstState[timezoneId].roleFormat`
   - No null check = instant crash when `dstState[timezoneId]` was undefined

2. **The deployment itself was fine** - it just exposed a latent bug

### Why The Current State Is Broken

**THE CRITICAL ISSUE: Triple Mismatch**

```
Git State:      Shows latest fixes (commits 3a1a7a68, 631fcbbd)
File Contents:  OLD backup from 08:36 (doesn't have fixes!)
node_modules:   Corrupted hybrid (partial copy + partial npm install)
```

When you run `git status`, it looks clean because git doesn't know the files were replaced with old versions. The actual file contents don't match what git thinks they should be!

---

## ✅ RECOMMENDED FIX PROCEDURE

### Prerequisites
- SSH access to production: `bitnami@13.238.148.170`
- PM2 installed and running
- Git configured on production

### Step-by-Step Recovery

**Step 1: Stop Everything**
```bash
# SSH to production
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170

# Stop the broken bot
pm2 stop castbot-pm

# Kill any hanging npm processes
pkill -f npm
```

**Step 2: Reset to Git State**
```bash
cd /opt/bitnami/projects/castbot

# This will restore files to match git commits
# WARNING: This will overwrite local changes to tracked files
git reset --hard HEAD

# Verify the fixes are in the code
grep -n "if (!dstState\[timezoneId\])" roleManager.js
# Should show line ~763 with the null check
```

**Step 3: Clean Dependencies**
```bash
# Complete removal of corrupted node_modules
rm -rf node_modules
rm -f package-lock.json

# Fresh install from package.json
npm install --production
```

**Step 4: Verify Critical Files**
```bash
# Check dstState.json exists (should be tracked in git now)
ls -la dstState.json
# Should show ~4.8KB file

# Verify it's valid JSON
node -e "console.log(JSON.parse(require('fs').readFileSync('dstState.json', 'utf8')))" | head -5
# Should show timezone data
```

**Step 5: Restart & Monitor**
```bash
# Start the bot
pm2 restart castbot-pm

# Monitor for 30 seconds
pm2 logs castbot-pm --lines 50

# Look for these success indicators:
# ✅ "Listening on port 3000"
# ✅ "Discord client is ready!"
# ✅ "DST state loaded from ./dstState.json: 16 timezones"
# ✅ NO "Cannot find package" errors
```

**Step 6: Test Functionality**
```bash
# Check PM2 status
pm2 list

# Verify restart count isn't increasing
# Watch for 1 minute - if ↺ stays the same, bot is stable
```

Then test in Discord:
1. Run `/menu` command - should show player menu
2. Run `/castlist` command - should show castlist
3. Click a button - should respond without "interaction failed"

---

## 🚨 IF THE ABOVE DOESN'T WORK

### Alternative: Full Clean Deployment

If git reset doesn't work, do a completely fresh deployment:

```bash
# Stop bot
pm2 stop castbot-pm

# Backup current broken state (just in case)
mv castbot castbot-BROKEN-$(date +%Y%m%d-%H%M%S)

# Fresh clone from GitHub
git clone https://github.com/extremedonkey/castbot.git castbot-new
cd castbot-new

# Copy production data files
cp ../castbot-BROKEN-*/playerData.json .
cp ../castbot-BROKEN-*/.env .
cp ../castbot-BROKEN-*/dstState.json . 2>/dev/null || echo "No dstState.json found"

# Install dependencies
npm install --production

# Move into place
cd ..
mv castbot-new castbot

# Start bot
pm2 start castbot-pm
```

---

## 📊 VERIFICATION CHECKLIST

After applying the fix, verify ALL of these:

- [ ] PM2 shows status: "online"
- [ ] Restart count (↺) not increasing
- [ ] Memory usage ~60-90MB (normal range)
- [ ] No "Cannot find package" errors in logs
- [ ] No "Cannot read properties of undefined" errors
- [ ] `/menu` command works
- [ ] `/castlist` command works
- [ ] Button interactions work
- [ ] DST state loads successfully (check logs)

---

## 🔑 KEY LESSONS

1. **Never mix node_modules** from different sources
2. **Rollbacks must be atomic** - either filesystem OR git, not partial
3. **Critical config files** (`dstState.json`) should be in version control
4. **Always add null checks** when accessing nested properties
5. **Test deployment procedures** include rollback testing

---

## 📁 IMPORTANT FILES & LOCATIONS

**Production Server:**
- Host: `bitnami@13.238.148.170`
- App Location: `/opt/bitnami/projects/castbot`
- Broken Backup: `/opt/bitnami/projects/castbot-BROKEN-20251102-164801`
- PM2 Process: `castbot-pm`
- Logs: `~/.pm2/logs/castbot-pm-*.log`

**Critical Files to Check:**
- `roleManager.js:763` - Should have null check for `dstState[timezoneId]`
- `storage.js:406-441` - Should have multi-path loading for dstState.json
- `dstState.json` - Should exist and contain 16 timezones
- `.gitignore` - Should NOT contain dstState.json anymore

**Git Commits with Fixes:**
- `3a1a7a68` - Track dstState.json to prevent deployment failures
- `631fcbbd` - Fix DST crash - add null checks and resilient file loading

---

## ⚡ QUICK COMMAND REFERENCE

```bash
# SSH to production
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170

# Check current state
pm2 list && echo "---" && cd /opt/bitnami/projects/castbot && git log --oneline -3

# Nuclear option - full reset
pm2 stop castbot-pm && cd /opt/bitnami/projects/castbot && git reset --hard HEAD && rm -rf node_modules && npm install --production && pm2 restart castbot-pm

# Monitor recovery
pm2 logs castbot-pm --lines 100 | grep -E "(ready|ERROR|Cannot find|started|Listening)"
```

---

## 🎯 SUCCESS CRITERIA

The bot is fully recovered when you see in the logs:

```
🔍 [timestamp] [LOGGER] Logging initialized: development mode, debug=true
🤖 Bot Emoji System initialized - Mode: PRODUCTION
Listening on port 3000
✅ DST state loaded from ./dstState.json: 16 timezones
Discord client is ready!
```

And users can successfully use `/menu` and `/castlist` commands without "This interaction failed" errors.

---

**Document Version:** 1.0
**Last Updated:** 2025-11-02 09:50 UTC
**Next Steps:** Run the recommended fix procedure or share this document with a fresh Claude instance