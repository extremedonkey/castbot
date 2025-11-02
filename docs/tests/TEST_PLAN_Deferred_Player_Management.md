# Test Plan: Deferred Player Management Handlers

**Feature**: Converted integrated player management handlers to ButtonHandlerFactory with deferred responses
**Date**: 2025-11-01
**Commit**: `401746c0`
**Risk Level**: Medium (Refactored critical user-facing functionality)

---

## 🎯 What Changed

**Before**: Synchronous handlers that could timeout with large playerData files (923KB+)
**After**: Deferred response pattern - Discord sees response immediately, then work happens

**Handlers Converted (7 total)**:
- ✨ `admin_integrated_vanity` - Manage player vanity roles
- 🏷️ `admin_integrated_pronouns` - Manage player pronouns
- 🌍 `admin_integrated_timezone` - Manage player timezone
- 🎂 `admin_integrated_age` - Manage player age
- 🏷️ `player_integrated_pronouns` - Set my pronouns
- 🌍 `player_integrated_timezone` - Set my timezone
- 🎂 `player_integrated_age` - Set my age

---

## ✅ Test Checklist

### **Test 1: Admin - Vanity Roles** (PRIMARY TEST)

**Steps:**
1. Run `/menu` command in Discord
2. Click **"Production Menu"** button
3. Navigate to **"Player Management"** section
4. Click **"Manage Player"** button
5. From the **User Select** dropdown, choose **any player** (e.g., Sparrow)
6. Click **"Manage Vanity Roles"** button
7. **Role Select** dropdown appears - select one or more vanity roles:
   - Example: `@S10 - Drive In`, `@👑 Winner`
8. Click outside the dropdown to confirm selection

**Expected Results:**
- ✅ Discord shows "Thinking..." or spinner IMMEDIATELY (<100ms)
- ✅ After 1-3 seconds, interface updates with selected roles shown
- ✅ Player's vanity roles are saved to playerData.json
- ✅ Discord roles are added to the player
- ✅ Interface refreshes showing the new vanity roles
- ✅ **NO "This interaction failed" error**

**Logs to Check** (dev):
```
[✨ FACTORY] or [🔘 BHF] - Shows ButtonHandlerFactory in use
📝 Sending DEFERRED_UPDATE_MESSAGE - Confirms deferred response sent first
✅ Backup created: playerData.json.backup
✅ Saved playerData.json
✅ Loaded playerData.json
🔄 Sending followup response via webhook
```

**Logs to Verify** (production):
```bash
npm run logs-prod -- --lines 50
```

---

### **Test 2: Admin - Pronouns**

**Steps:**
1. `/menu` → Production Menu → Player Management
2. Select a player from User Select
3. Click **"Manage Pronouns"** button
4. From the **Role Select** dropdown, choose pronoun roles:
   - Example: `He/Him`, `They/Them`
5. Click outside dropdown to confirm

**Expected Results:**
- ✅ Deferred response sent immediately
- ✅ Old pronoun roles removed
- ✅ New pronoun roles added
- ✅ Interface refreshes with updated pronouns
- ✅ **NO timeout errors**

---

### **Test 3: Admin - Timezone**

**Steps:**
1. `/menu` → Production Menu → Player Management
2. Select a player
3. Click **"Manage Timezone"** button
4. From dropdown, select **one timezone role**:
   - Example: `EST / EDT`
5. Click outside to confirm

**Expected Results:**
- ✅ Deferred response immediate
- ✅ Old timezone role removed
- ✅ New timezone role added
- ✅ Interface updates with new timezone shown

---

### **Test 4: Admin - Age**

**Steps:**
1. `/menu` → Production Menu → Player Management
2. Select a player
3. Click **"Manage Age"** button
4. From dropdown, select an age:
   - Quick ages: `18-24`, `25-34`, `35-44`, `45+`
   - OR select **"Custom Age"** (opens modal)
5. If custom: Enter age in modal (e.g., `27`) and submit

**Expected Results:**
- ✅ Deferred response sent
- ✅ Player age saved to playerData
- ✅ Interface updates showing new age

---

### **Test 5: Player Mode - My Pronouns**

**Steps:**
1. Run `/menu` command
2. Click **"Player Menu"** button (as a regular player, not admin)
3. Click **"Set Pronouns"** button
4. Select pronoun roles from dropdown
5. Click outside to confirm

**Expected Results:**
- ✅ Deferred response immediate
- ✅ YOUR pronouns updated
- ✅ Interface refreshes
- ✅ Works from application channel context (if testing during applications)

---

### **Test 6: Player Mode - My Timezone**

**Steps:**
1. `/menu` → Player Menu
2. Click **"Set Timezone"** button
3. Select timezone from dropdown
4. Confirm

**Expected Results:**
- ✅ Deferred response
- ✅ Your timezone updated
- ✅ Interface shows new timezone + local time

---

### **Test 7: Player Mode - My Age**

**Steps:**
1. `/menu` → Player Menu
2. Click **"Set Age"** button
3. Select age or choose "Custom Age"
4. Confirm

**Expected Results:**
- ✅ Deferred response
- ✅ Your age saved
- ✅ Interface updates

---

## 🐛 Edge Cases to Test

### **Edge Case 1: Large PlayerData File**

**Scenario**: Testing with production's 923KB playerData (99 guilds)

**Steps**:
1. Test on **PRODUCTION** server (not dev)
2. Perform Test 1 (Vanity Roles)
3. Monitor response time

**Expected**:
- ✅ Should still respond <3 seconds (deferred buys us time)
- ✅ **NO timeout even with slow disk I/O**

---

### **Edge Case 2: Permission Error (Pronouns)**

**Scenario**: CastBot role is BELOW pronoun roles in hierarchy

**Steps**:
1. Temporarily move CastBot role below pronoun roles
2. Try to assign pronoun via admin panel
3. Check error message

**Expected**:
- ✅ Error message shown:
  > ⚠️ **Permission Error**: Unable to assign pronoun roles. Please advise the production team to move the CastBot role to the top of the Discord hierarchy, above pronoun roles.
- ✅ Error is **non-ephemeral** (visible to all)
- ✅ No crash

---

### **Edge Case 3: Role Deleted Mid-Selection**

**Scenario**: Timezone role deleted between dropdown open and selection

**Steps**:
1. Open timezone dropdown
2. Have another admin delete the timezone role
3. Try to select the now-deleted role

**Expected**:
- ✅ Error message shown:
  > ❌ Failed to update timezone. The selected role may no longer exist.
- ✅ **Ephemeral** error message
- ✅ No crash

---

### **Edge Case 4: Modal Flow (Custom Age)**

**Scenario**: Age selection opens modal, which is different response type

**Steps**:
1. Select "Custom Age" from age dropdown
2. Modal opens
3. Enter age and submit

**Expected**:
- ✅ Modal opens immediately (different from UPDATE_MESSAGE)
- ✅ Modal submission works
- ✅ Age saved correctly

---

### **Edge Case 5: Application Channel Context (Player Mode)**

**Scenario**: Player menu accessed during season application process

**Steps**:
1. Create a season application (if not exist)
2. Go to application channel
3. `/menu` → Player Menu
4. Set pronouns/timezone/age

**Expected**:
- ✅ Custom title shown: "Set your age, pronouns and timezone."
- ✅ Bottom navigation buttons hidden
- ✅ Updates work correctly
- ✅ Context detected from `isApplicationChannel` logic

---

## 📊 Success Criteria

**Functional:**
- ✅ All 7 handlers respond immediately (<100ms perceived)
- ✅ Data saved correctly to playerData.json
- ✅ Discord roles applied/removed correctly
- ✅ Interface refreshes with updated data
- ✅ **ZERO "This interaction failed" errors**

**Performance:**
- ✅ Deferred response sent <100ms
- ✅ Full operation completes <5 seconds (even with 923KB playerData)
- ✅ No timeouts on production server

**Logging:**
- ✅ Logs show `[✨ FACTORY]` or `[🔘 BHF]` tag (not `[🪨 LEGACY]`)
- ✅ Logs show `DEFERRED_UPDATE_MESSAGE` confirmation
- ✅ No errors in logs

---

## 🔍 Verification Commands

**Check Logs (Dev):**
```bash
tail -f /tmp/castbot-dev.log | grep -E "FACTORY|DEFERRED|admin_integrated"
```

**Check Logs (Production):**
```bash
npm run logs-prod -- --lines 100 | grep -E "FACTORY|DEFERRED|admin_integrated"
```

**Check Button Registry:**
```bash
grep -A 5 "admin_integrated_vanity" buttonHandlerFactory.js
```

**Expected Output:**
```javascript
'admin_integrated_vanity': {
  label: 'Vanity Roles',
  description: 'Manage player vanity roles with auto-refresh (deferred response)',
  emoji: '✨',
  style: 'Primary',
  category: 'player_management',
  usesDeferred: true  // ← CONFIRMS deferred pattern
}
```

---

## 🚨 Rollback Plan

**If tests fail**, revert with:

```bash
git revert 401746c0
./scripts/dev/dev-restart.sh "Rollback deferred player management - issue found in testing"
```

**Then investigate**:
1. Check logs for specific error
2. Verify ButtonHandlerFactory context provides all needed data
3. Check if modal flow broke (age custom)
4. Verify playerData save/load sequence

---

## 📝 Test Results Template

**Tester**: _________
**Date**: _________
**Environment**: Dev / Prod

| Test | Status | Notes |
|------|--------|-------|
| Test 1: Admin Vanity | ☐ Pass ☐ Fail | |
| Test 2: Admin Pronouns | ☐ Pass ☐ Fail | |
| Test 3: Admin Timezone | ☐ Pass ☐ Fail | |
| Test 4: Admin Age | ☐ Pass ☐ Fail | |
| Test 5: Player Pronouns | ☐ Pass ☐ Fail | |
| Test 6: Player Timezone | ☐ Pass ☐ Fail | |
| Test 7: Player Age | ☐ Pass ☐ Fail | |
| Edge: Large PlayerData | ☐ Pass ☐ Fail | |
| Edge: Permission Error | ☐ Pass ☐ Fail | |
| Edge: Deleted Role | ☐ Pass ☐ Fail | |
| Edge: Custom Age Modal | ☐ Pass ☐ Fail | |
| Edge: App Channel Context | ☐ Pass ☐ Fail | |

**Overall Result**: ☐ APPROVED ☐ NEEDS WORK

**Blocker Issues** (if any):
- _____________

---

## 🎯 Quick Click Path Summary

**For Vanity Roles (Most Common Test):**

```
/menu
  ↓
Click "Production Menu"
  ↓
Scroll to "Player Management" section
  ↓
Click "Manage Player" button
  ↓
Select player from "User Select" dropdown (e.g., Sparrow)
  ↓
Click "Manage Vanity Roles" button
  ↓
Role Select appears - choose vanity roles
  ↓
Click outside dropdown
  ↓
✨ Watch for immediate "Thinking..." response
  ↓
✅ Interface updates with new roles (1-3 seconds)
```

**Expected Log Sequence:**
```
Processing MESSAGE_COMPONENT with custom_id: admin_integrated_vanity_705936744595587112
🔍 BUTTON DEBUG: Checking handlers for admin_integrated_vanity... [✨ FACTORY]
📝 Sending DEFERRED_UPDATE_MESSAGE (acknowledge immediately)
✅ Backup created: playerData.json.backup
✅ Saved playerData.json
✅ Loaded playerData.json
🔄 Sending followup response via webhook
✅ Player management interface updated
```

---

**Questions?** Check logs for `[✨ FACTORY]` tag to confirm new pattern is active!
