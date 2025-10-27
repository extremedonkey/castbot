# Timezone Role Consolidation - Testing Plan

**Date:** 2025-10-27
**Feature:** Role consolidation to reduce duplicate timezone roles
**Implementation Status:** ✅ Complete - Ready for testing
**Related:** [RaP 0985](0985_20251027_Timezone_Role_Consolidation_Technical_Design.md)

---

## 🎯 Testing Objectives

1. **Verify consolidation reduces role count** (20 → ~14-16 roles)
2. **Confirm zero data loss** (all members keep timezone roles)
3. **Validate winner selection logic** (most members + tie-breaker)
4. **Check metadata updates** (timezoneId added to winners)
5. **Test error handling** (permission errors, edge cases)
6. **Verify playerData.json cleanup** (deleted roles removed)

---

## 🛠️ Test Environment Setup

### Create Test Server

**Option A: Use Existing Regression Server**
- Server: "CastBot Regression Green" or "CastBot Regression Blue"
- Benefit: Already has timezone roles set up
- Risk: May already be converted

**Option B: Create Fresh Test Server**
1. Create new Discord server
2. Invite CastBot
3. Run `/menu` → Production Menu → Initial Setup (creates 16 timezone roles)
4. Manually create duplicate roles for testing

### Recommended Approach: Manual Duplicate Creation

**Steps:**
```
1. Run initial setup → creates 16 standard timezone roles
2. Manually duplicate key roles:
   - Duplicate "PST / PDT" role (rename one to "PST (UTC-8)")
   - Duplicate "CST / CDT" role (rename one to "CST (UTC-6)")
   - Duplicate "EST / EDT" role (rename one to "EST (UTC-5)")

3. Assign test members:
   - Your account: Add to first "PST / PDT" role
   - Alt account 1: Add to duplicate "PST / PDT" role
   - Alt account 2: Add to first "PST / PDT" role (for higher count)

Result: 3 duplicate groups to test consolidation
```

---

## ✅ Test Scenarios

### Test 1: Happy Path (Standard Consolidation)

**Setup:**
```
Discord Roles:
  - PST / PDT (ID: 111...): 2 members
  - PST / PDT (ID: 222...): 1 member

playerData.json:
  "111...": { "timezoneId": "PT", "offset": -8 }
  "222...": { "timezoneId": "PT", "offset": -7 }
```

**Actions:**
1. Navigate to `/menu` → Reece's Tools → "Merge Duplicate Timezones"
2. Click button
3. Wait for deferred response (~3-5 seconds)

**Expected Results:**
```
Response shows:
  ✅ Merged: 1 timezone group
  ✅ Deleted: 1 duplicate role
  ✅ Errors: 0

  PT:
    ✅ Kept: PST / PDT (3 members)
    🗑️ Removed: PST / PDT (1 member migrated)
```

**Verification Steps:**
- [ ] Discord shows only 1 "PST / PDT" role
- [ ] All 3 members have the same role
- [ ] Check playerData.json: Only 1 entry for PT (ID: 111...)
- [ ] Check playerData.json: Role 222... is deleted
- [ ] View castlist: All members show correct time

---

### Test 2: Equal Member Counts (Tie-Breaking)

**Setup:**
```
Discord Roles:
  - PST / PDT (ID: 111...): 2 members (created first - older snowflake)
  - PST / PDT (ID: 999...): 2 members (created later - newer snowflake)
```

**Actions:**
1. Click "Merge Duplicate Timezones"
2. Check logs: `tail -f /tmp/castbot-dev.log | grep "Winner"`

**Expected Results:**
```
Response:
  ✅ Kept: PST / PDT (4 members)
  🗑️ Removed: PST / PDT (2 members migrated)

Logs show:
  🏆 Winner: PST / PDT (2 members, ID: 111...)
  ⤷ Loser: PST / PDT (2 members, ID: 999...)
```

**Verification:**
- [ ] Winner is role 111... (older snowflake)
- [ ] All 4 members migrated successfully
- [ ] Logs show tie-breaker logic used

---

### Test 3: Already Consolidated (No Work Needed)

**Setup:**
```
Discord Roles:
  - PST / PDT: 3 members (only 1 role, no duplicates)
  - CST / CDT: 2 members (only 1 role, no duplicates)
```

**Actions:**
1. Click "Merge Duplicate Timezones"

**Expected Results:**
```
Response:
  ✅ No duplicate roles found!
  All timezone roles are already consolidated.
```

**Verification:**
- [ ] No Discord API calls made (fast response)
- [ ] No roles deleted
- [ ] playerData.json unchanged

---

### Test 4: Winner Needs Renaming

**Setup:**
```
Discord Roles:
  - PST (UTC-8) (ID: 111...): 5 members
  - PST / PDT (ID: 222...): 1 member

playerData.json:
  "111...": { "timezoneId": "PT", "offset": -8 }
  "222...": { "timezoneId": "PT", "offset": -7 }

Note: Winner (111...) has old name format
```

**Actions:**
1. Click "Merge Duplicate Timezones"
2. Check Discord role name after consolidation

**Expected Results:**
```
Response:
  PT:
    ✅ Kept: PST / PDT (6 members)
      🔄 Renamed to standard format
    🗑️ Removed: PST / PDT (1 member migrated)

Discord shows:
  - Role 111... renamed from "PST (UTC-8)" → "PST / PDT"
```

**Verification:**
- [ ] Winner role renamed successfully
- [ ] All members still have role after rename
- [ ] wasRenamed flag in results = true

---

### Test 5: Winner Needs Metadata

**Setup:**
```
Discord Roles:
  - PST / PDT (ID: 111...): 5 members
  - PST / PDT (ID: 222...): 1 member

playerData.json:
  "111...": { "offset": -8 }  ← Missing timezoneId!
  "222...": { "timezoneId": "PT", "offset": -7 }

Note: Winner missing metadata
```

**Actions:**
1. Click "Merge Duplicate Timezones"
2. Check playerData.json after consolidation

**Expected Results:**
```
Response:
  PT:
    ✅ Kept: PST / PDT (6 members)
      📝 Added DST-aware metadata
    🗑️ Removed: PST / PDT (1 member migrated)

playerData.json:
  "111...": {
    "offset": -8,
    "timezoneId": "PT",
    "dstObserved": true,
    "standardName": "PST (UTC-8)"
  }
```

**Verification:**
- [ ] Winner has timezoneId field added
- [ ] DST toggle now shows this timezone
- [ ] metadataAdded flag in results = true

---

### Test 6: Permission Error (Role Above CastBot)

**Setup:**
```
1. Move CastBot role below timezone roles in Discord settings
2. Create duplicate "PST / PDT" roles
```

**Actions:**
1. Click "Merge Duplicate Timezones"

**Expected Results:**
```
Response:
  ⚠️ Errors: 1

  Errors:
    - PST / PDT: Rename failed: Missing Permissions

  PT:
    ✅ Kept: PST / PDT (6 members)
    🗑️ Removed: PST / PDT (1 member migrated)

Note: Members still migrated, only rename failed
```

**Verification:**
- [ ] Members migrated successfully
- [ ] Loser role deleted
- [ ] Winner role NOT renamed (still has old name)
- [ ] Error severity = "warning" (non-critical)
- [ ] Consolidation still marked as success

---

### Test 7: Multiple Timezone Groups

**Setup:**
```
Discord Roles:
  - PST / PDT: 5 members + PST / PDT: 2 members
  - CST / CDT: 8 members + CST / CDT: 3 members
  - EST / EDT: 10 members + EST / EDT: 1 member
```

**Actions:**
1. Click "Merge Duplicate Timezones"
2. Check response shows all 3 groups

**Expected Results:**
```
Response:
  ✅ Merged: 3 timezone groups
  ✅ Deleted: 3 duplicate roles

  PT: Consolidated (7 members total)
  CT: Consolidated (11 members total)
  ET: Consolidated (11 members total)
```

**Verification:**
- [ ] All 3 groups processed independently
- [ ] Total role count reduced by 3
- [ ] All members migrated successfully
- [ ] playerData.json has 3 fewer entries

---

### Test 8: Member Migration Failure

**Setup:**
```
Create scenario where member migration fails:
- Add bot account to loser role (bots can't have roles modified by other bots)
```

**Actions:**
1. Add a bot to loser "PST / PDT" role
2. Click "Merge Duplicate Timezones"

**Expected Results:**
```
Response:
  ⚠️ Errors: 1

  Errors:
    - Member 123...: Failed to migrate member: Missing Permissions

  PT:
    ✅ Kept: PST / PDT (5 members)
    🗑️ Removed: PST / PDT (STILL EXISTS - has 1 remaining member)

Note: Loser NOT deleted (still has bot member)
```

**Verification:**
- [ ] Most members migrated successfully
- [ ] Bot member NOT migrated
- [ ] Loser role NOT deleted (verification prevented deletion)
- [ ] Error tracked in results

---

### Test 9: Custom Timezone (No timezoneId)

**Setup:**
```
Discord Roles:
  - PST / PDT (ID: 111...): 5 members (has timezoneId: "PT")
  - My Custom Timezone (ID: 222...): 3 members (NO timezoneId)

playerData.json:
  "111...": { "timezoneId": "PT", "offset": -8 }
  "222...": { "offset": -5 }  ← No timezoneId, skipped
```

**Actions:**
1. Click "Merge Duplicate Timezones"

**Expected Results:**
```
Response:
  ✅ Merged: 0 timezone groups
  ✅ No duplicate roles found!

Logs show:
  ⚠️ Role 222... missing timezoneId, skipping
```

**Verification:**
- [ ] Custom timezone role NOT touched
- [ ] No errors reported
- [ ] Function completes successfully

---

## 📊 Post-Testing Verification

After running all tests, verify:

### Discord Verification
- [ ] Role count reduced significantly
- [ ] All roles have unique members (no duplicates in member lists)
- [ ] Role names match dstState.json format ("PST / PDT" etc.)
- [ ] No orphaned empty roles

### playerData.json Verification
```javascript
// Check structure
const timezones = playerData[guildId].timezones;

// All timezone roles should have timezoneId
Object.entries(timezones).forEach(([roleId, tzData]) => {
  if (!tzData.timezoneId) {
    console.warn(`❌ Role ${roleId} missing timezoneId`);
  }
});

// No deleted role IDs should exist
results.deleted.forEach(deleted => {
  if (timezones[deleted.roleId]) {
    console.error(`❌ Deleted role ${deleted.roleId} still in playerData`);
  }
});
```

### Functional Verification
- [ ] Timezone selector shows correct number of options (<25)
- [ ] DST toggle shows all consolidated timezones
- [ ] Castlist displays correct times
- [ ] Player menu timezone selection works
- [ ] No [🪨 LEGACY] warnings for timezone selector

### Performance Verification
- [ ] Consolidation completes in <10 seconds (small server)
- [ ] No Discord rate limit errors
- [ ] No memory leaks or crashes
- [ ] Deferred response completes successfully

---

## 🐛 Known Issues to Watch For

### Issue 1: Discord Cache Staleness
**Symptom:** Role shows 0 members but deletion fails
**Solution:** Function refreshes cache before verification (line 899)
**Verify:** Check logs for "still has X members" errors

### Issue 2: Race Condition with Members
**Symptom:** Member added during consolidation not migrated
**Solution:** Member cache fetched at start (line 837)
**Verify:** All members present at start are migrated

### Issue 3: Role Name Doesn't Match dstState
**Symptom:** Can't find roleFormat for timezoneId
**Solution:** Rename step checks for null (line 954)
**Verify:** Logs show rename attempt or skip

---

## 📝 Test Results Template

```
Test Date: ___________
Tester: ___________
Environment: [ Dev | Regression | Production ]

Test 1: Happy Path
  Status: [ ✅ Pass | ❌ Fail ]
  Notes: ___________

Test 2: Tie-Breaking
  Status: [ ✅ Pass | ❌ Fail ]
  Notes: ___________

Test 3: Already Consolidated
  Status: [ ✅ Pass | ❌ Fail ]
  Notes: ___________

Test 4: Winner Renaming
  Status: [ ✅ Pass | ❌ Fail ]
  Notes: ___________

Test 5: Metadata Addition
  Status: [ ✅ Pass | ❌ Fail ]
  Notes: ___________

Test 6: Permission Errors
  Status: [ ✅ Pass | ❌ Fail ]
  Notes: ___________

Test 7: Multiple Groups
  Status: [ ✅ Pass | ❌ Fail ]
  Notes: ___________

Test 8: Migration Failure
  Status: [ ✅ Pass | ❌ Fail ]
  Notes: ___________

Test 9: Custom Timezone
  Status: [ ✅ Pass | ❌ Fail ]
  Notes: ___________

Overall Assessment: [ ✅ Ready for Production | ⚠️ Issues Found | ❌ Major Problems ]

Next Steps: ___________
```

---

## 🚀 Production Deployment Checklist

Once all tests pass:

- [ ] All 9 test scenarios completed successfully
- [ ] No critical errors found
- [ ] playerData.json integrity verified
- [ ] Performance acceptable (<10 seconds for small servers)
- [ ] Commit code changes with detailed message
- [ ] Deploy to production: `npm run deploy-remote-wsl`
- [ ] Monitor logs for 24 hours
- [ ] Test on 1-2 friendly production servers
- [ ] Update RaP 0985 with test results
- [ ] Update RaP 0986 (deployment review) if needed
- [ ] Plan Phase 2: Integration with executeSetup()

---

**Testing Priority:** HIGH (blocks DST deployment)
**Estimated Testing Time:** 2-3 hours
**Blocker Resolution:** All tests must pass before production deployment
