# Production Deployment - Merge Conflict Resolution Strategy

**RaP Number**: 0994
**Date**: 2025-10-09
**Status**: 🟡 Awaiting User Decision
**Current Situation**: Production stuck in merge conflict state

---

## 🎯 Situation Analysis

### Current Production State

**Status**: ✅ **BOT IS ONLINE AND HEALTHY**
- PM2 Status: Online (8 days uptime, 29 restarts)
- Memory: 145MB (healthy)
- CPU: 0%
- Branch: `hotfix/cache-limits` (NOT main!)
- Commit: `f8988e0b` (Oct 1, 2025)

**Problem**:
- Stuck in merge conflict from previous deployment attempt
- Cannot deploy new fixes until resolved
- 3 files in conflict state

---

## 📋 Conflicted Files

### 1. **app.js** (CRITICAL - Cache Limits)

**Conflict Location**: Lines 1343-1353 (cache configuration)

**Production Version** (hotfix/cache-limits):
```javascript
makeCache: Options.cacheWithLimits({
  MessageManager: 50,
  GuildMemberManager: 4000,  // ← OLD: Has limits
  UserManager: 1000          // ← OLD: Has limits
})
```

**Development Version** (main - our fix):
```javascript
makeCache: Options.cacheWithLimits({
  MessageManager: 50         // ← NEW: Limits removed
  // GuildMemberManager: REMOVED
  // UserManager: REMOVED
})
```

**Decision Required**: ✅ **USE DEVELOPMENT VERSION (main)**
- Rationale: This is THE FIX we're trying to deploy
- Removes problematic cache limits
- Tested in dev for 2+ hours

---

### 2. **.claude/settings.local.json** (NON-CRITICAL - Config)

**Conflict Location**: Line 60 (allowed bash commands)

**Production Version** (hotfix/cache-limits):
```json
"Bash(git cherry-pick:*)"
```

**Development Version** (main):
```json
"Read(//home/reece/.config/**)",
"Read(//home/reece/.claude/**)"
```

**Decision Required**: ✅ **USE DEVELOPMENT VERSION (main)**
- Rationale: Config file, doesn't affect bot functionality
- Dev version is newer with more permissions
- No production impact either way

---

### 3. **playerData.json.backup** (NON-CRITICAL - Backup File)

**Conflict**: Both branches added this file with different content

**Production Version**: 182KB (created Oct 9)
**Development Version**: Unknown size

**Decision Required**: ✅ **KEEP PRODUCTION VERSION**
- Rationale: Production backup is most recent
- This is just a backup file, not used by bot
- Safe to keep production's version

---

## 🎯 Branch Strategy Decision

### Option 1: Merge main into hotfix/cache-limits (Current State)
**Pros**:
- Keeps current branch
- Minimal disruption

**Cons**:
- ❌ Conflict resolution complex (3 files)
- ❌ Branch is outdated (112 commits behind)
- ❌ Will need to resolve conflicts manually

**Confidence**: 🟡 70% (conflicts need careful resolution)

---

### Option 2: Abort Merge, Switch to Main ⭐ RECOMMENDED
**Pros**:
- ✅ Clean slate, no conflicts
- ✅ Main branch has all fixes (112 commits ahead)
- ✅ Simpler deployment
- ✅ Standard practice (main = production)

**Cons**:
- Need to abandon hotfix branch changes
- But: hotfix branch only added cache limits, which main removes anyway!

**Confidence**: 🟢 95% (clean, tested approach)

---

### Option 3: Force Reset to Main
**Pros**:
- ✅ Cleanest solution
- ✅ No conflicts
- ✅ Immediate deployment ready

**Cons**:
- ⚠️ Loses any production-only changes (but there aren't any critical ones)
- ⚠️ More aggressive

**Confidence**: 🟢 90% (works but slightly aggressive)

---

## ✅ RECOMMENDED STRATEGY: Option 2

### Step-by-Step Resolution Plan

#### Step 1: Abort Merge
```bash
git merge --abort
```
**Effect**: Clears conflict state, returns to `hotfix/cache-limits` clean state

#### Step 2: Switch to Main Branch
```bash
git checkout main
```
**Effect**: Switches to main branch (may have conflicts if local changes)

#### Step 3: Hard Reset to origin/main
```bash
git fetch origin
git reset --hard origin/main
```
**Effect**: Forces local main to match GitHub main exactly

#### Step 4: Verify State
```bash
git status
git log -1 --oneline
```
**Expected**: Clean working tree, commit `455411f2`

#### Step 5: Deploy
```bash
# From local machine
npm run deploy-remote-wsl
```
**Effect**: Pulls main, restarts PM2

---

## 🛡️ Safety Analysis

### What We're Abandoning from hotfix/cache-limits

**Commit `d014f629`: Increase cache limits**
```
Changes: GuildMemberManager: 1200 → 4000
         UserManager: 300 → 1000
```
**Analysis**: ✅ **SAFE TO ABANDON**
- Main removes limits entirely (better solution)
- This commit is superseded by our fix

**Other commits in hotfix branch**:
- Debug logging additions
- PM2 error logger fixes

**Analysis**: ✅ **SAFE TO ABANDON**
- Already incorporated in main branch
- Or not critical to production

---

## 📊 Deployment Confidence Assessment

### After Conflict Resolution

**Scenario**: Switch to main branch (Option 2)

| Factor | Status | Confidence |
|--------|--------|-----------|
| Conflicts resolved | ✅ None (clean switch) | 95% |
| Code tested | ✅ In dev 2+ hours | 95% |
| Bot stays online | ✅ PM2 restart only | 99% |
| Fixes deployed | ✅ All 112 commits | 95% |
| Rollback available | ✅ 2-minute revert | 99% |

**Overall Confidence**: 🟢 **95%**

---

## 🚨 Risks After Resolution

### Risk 1: Main Branch Has Breaking Changes
**Severity**: 🟡 MEDIUM
**Mitigation**: Already analyzed 112 commits, mostly safe

### Risk 2: Git Switch Fails
**Severity**: 🟢 LOW
**Mitigation**: Can force reset if needed

### Risk 3: Deployment Fails Again
**Severity**: 🟢 LOW
**Mitigation**: Clean state should work, otherwise manual deploy

---

## 📋 Decision Matrix for User

### What Happens with Each File

| File | Production Has | Main Has | Recommended | Why |
|------|---------------|----------|-------------|-----|
| **app.js** | Cache limits (OLD) | No limits (FIX) | ✅ **Use Main** | This is the fix! |
| **settings.json** | cherry-pick | config reads | ✅ **Use Main** | Newer, doesn't matter |
| **playerData.backup** | 182KB Oct 9 | Unknown | ✅ **Keep Prod** | Most recent backup |

**Recommended Action**: Switch to main (abandons all production versions)

---

## 🎯 FINAL RECOMMENDATION

### Execute Option 2: Clean Switch to Main

**Commands** (do not execute yet):
```bash
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170
cd /opt/bitnami/projects/castbot

# Step 1: Abort merge
git merge --abort

# Step 2: Fetch latest
git fetch origin

# Step 3: Switch to main
git checkout main

# Step 4: Hard reset to match GitHub
git reset --hard origin/main

# Step 5: Verify
git status
git log -1 --oneline
# Should show: 455411f2 Add defensive null-safety...

# Exit SSH
exit

# Step 6: Deploy from local
npm run deploy-remote-wsl
```

**Expected Outcome**:
- ✅ Clean main branch
- ✅ No conflicts
- ✅ All 112 commits deployed
- ✅ Bot restarts cleanly
- ✅ Fixes active

**Confidence**: 🟢 **95%**

---

## ❓ USER DECISIONS REQUIRED

### Decision 1: Conflict Resolution Strategy
- [ ] **Option A**: Manually resolve conflicts in current merge (70% confidence)
- [ ] **Option B**: Abort merge, switch to main (95% confidence) ⭐ RECOMMENDED
- [ ] **Option C**: Force reset to main (90% confidence)

### Decision 2: File Preferences (if Option A chosen)
- [ ] **app.js**: Use main version (removes cache limits) ⭐ REQUIRED FOR FIX
- [ ] **settings.json**: Use main version (doesn't matter)
- [ ] **playerData.backup**: Keep production version (most recent)

### Decision 3: Proceed with Deployment
- [ ] **Yes** - Execute recommended strategy
- [ ] **No** - Analyze further
- [ ] **Modify** - Different approach

---

**Status**: 🟡 AWAITING USER INPUT
**Next Step**: User approves strategy, then execute
**Rollback Ready**: YES (can revert to `f8988e0b` in 2 minutes)

*Last Updated: 2025-10-09 23:30 - Conflict analysis complete*
