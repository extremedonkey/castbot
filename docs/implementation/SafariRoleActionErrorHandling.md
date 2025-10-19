# Safari Role Action Error Handling - Design Options

**Status:** 🎨 DESIGN PHASE
**Created:** 2025-10-19
**Feature:** Safari Custom Actions with Role Management
**Problem:** Deleted roles break Custom Actions with poor user experience

---

## Problem Statement

When Discord roles are deleted from a server, Custom Actions using `give_role` or `remove_role` actions experience different failure modes depending on when and how the user encounters them:

### Current Behavior

1. **During Execution** ✅ Already Graceful
   - User clicks Custom Action button
   - Role validation at `safariManager.js:1236` checks if role exists
   - Returns: `"❌ The configured role no longer exists."`
   - **Status:** Working correctly

2. **During Editing** ❌ Poor Experience
   - Admin tries to edit Custom Action that was deleted
   - Returns generic: `"❌ Button not found."`
   - No context about why or how to fix
   - **Status:** Needs improvement

3. **Orphaned Anchor Buttons** ❌ Silent Failure
   - Custom Action deleted but anchor message not refreshed
   - Buttons in D6 channel still reference deleted action
   - Clicking edit buttons causes "button not found" errors
   - **Status:** Needs detection and cleanup

### Root Causes

**Issue 1: Deleted Custom Actions**
- Admin deletes Custom Action via UI
- Anchor messages not immediately refreshed
- Stale buttons remain in channel
- Edit buttons reference non-existent actions

**Issue 2: Deleted Roles**
- Discord role deleted (via Discord UI, not CastBot)
- Custom Actions still reference deleted role ID
- No proactive validation or warning system
- Admin discovers issue only when users report problems

**Issue 3: Role Permission Changes**
- Role moved above bot's highest role
- Bot can no longer assign/remove role
- Same poor error handling as deleted roles

---

## Current Error Handling

### Execution Time (Already Good)

**Location:** `safariManager.js:1201-1289` (`executeGiveRole`, `executeRemoveRole`)

```javascript
// Existing graceful handling
const role = await guild.roles.fetch(config.roleId);

if (!role) {
    return {
        content: '❌ The configured role no longer exists.',
        flags: InteractionResponseFlags.EPHEMERAL
    };
}

// Bot permission check
if (role.position >= botHighestRole.position) {
    return {
        content: `❌ I cannot assign the **${role.name}** role...`,
        flags: InteractionResponseFlags.EPHEMERAL
    };
}
```

**Verdict:** ✅ This works well for player experience

### Edit Time (Needs Improvement)

**Location:** `app.js:15954-15960`

```javascript
// Current generic error
if (!button) {
    console.log(`❌ FAILURE: safari_edit_action - button ${actionId} not found`);
    return {
        content: '❌ Button not found.',
        ephemeral: true
    };
}
```

**Verdict:** ❌ No context, no remediation options

---

## Design Options

### Option 1: Inform + Manual Delete (Simplest)

**Approach:** Enhanced error message with instructions

**Implementation:**
```javascript
if (!button) {
    return {
        content: '⚠️ **Custom Action Not Found**\n\n' +
                'This Custom Action may have been deleted.\n\n' +
                '**To fix:**\n' +
                '1. Go to Map Explorer → Refresh Anchors\n' +
                '2. Type the coordinate (e.g., "D6") or "All"\n' +
                '3. Anchor messages will regenerate without this button',
        ephemeral: true
    };
}
```

**Pros:**
- ✅ Simple implementation (~5 lines of code)
- ✅ No new UI components needed
- ✅ Educates admins on anchor refresh workflow
- ✅ No automated deletion (safe)

**Cons:**
- ❌ Manual remediation required
- ❌ Doesn't prevent the issue
- ❌ Multi-step fix process

**Effort:** 10 minutes

---

### Option 2: Auto-Detect + Notification (Proactive)

**Approach:** Scan Custom Actions for invalid roles on anchor refresh

**Implementation:**
```javascript
// New function in safariManager.js
async function validateRoleActions(guildId, client) {
    const safariContent = await loadSafariContent();
    const guildData = safariContent[guildId] || {};
    const guild = await client.guilds.fetch(guildId);

    const issues = [];

    for (const [buttonId, button] of Object.entries(guildData.buttons || {})) {
        for (const [index, action] of (button.actions || []).entries()) {
            if (action.type === 'give_role' || action.type === 'remove_role') {
                const roleId = action.config?.roleId;
                const role = await guild.roles.fetch(roleId).catch(() => null);

                if (!role) {
                    issues.push({
                        buttonId,
                        buttonName: button.name,
                        actionIndex: index,
                        actionType: action.type,
                        roleId,
                        reason: 'role_deleted'
                    });
                }
            }
        }
    }

    return issues;
}
```

**Integration Points:**
1. Run on Refresh Anchors (before regenerating)
2. Show summary of issues found
3. Offer remediation options (see Option 3-5)

**Pros:**
- ✅ Proactive detection
- ✅ Admin sees issues before users do
- ✅ Can batch-fix multiple issues
- ✅ Educational (shows which actions are broken)

**Cons:**
- ❌ Adds latency to Refresh Anchors operation
- ❌ Requires decision on what to do with issues

**Effort:** 1-2 hours

---

### Option 3: Placeholder Role (Preserve Actions)

**Approach:** Replace deleted role with "Deleted Role" placeholder

**Implementation:**
```javascript
async function fixRoleAction(action, guildId, guild) {
    const role = await guild.roles.fetch(action.config.roleId).catch(() => null);

    if (!role) {
        // Find or create placeholder role
        let placeholderRole = guild.roles.cache.find(r => r.name === '⚠️ Deleted Role');

        if (!placeholderRole) {
            placeholderRole = await guild.roles.create({
                name: '⚠️ Deleted Role',
                color: 0x95A5A6, // Gray
                reason: 'Placeholder for Custom Actions with deleted roles'
            });
        }

        action.config.roleId = placeholderRole.id;
        action.config._originalRoleId = action.config.roleId; // Preserve for reference
        action.config._roleDeleted = true;
    }
}
```

**UI Changes:**
- Display text action shows warning: `"⚠️ This action uses a deleted role. Edit to fix."`
- Action editor highlights problematic actions in red
- "Fix All" button replaces all placeholder references

**Pros:**
- ✅ Preserves Custom Action structure
- ✅ Admin can edit and fix later
- ✅ Non-destructive
- ✅ Visual feedback that something is wrong

**Cons:**
- ❌ Creates extra Discord role
- ❌ More complex logic
- ❌ Could clutter role list if many issues
- ❌ Placeholder role might get assigned accidentally

**Effort:** 2-3 hours

---

### Option 4: Orphan Action (Remove Role Config Only)

**Approach:** Keep action but remove role configuration

**Implementation:**
```javascript
async function orphanRoleAction(action) {
    // Preserve original config for potential recovery
    action.config._orphanedFrom = {
        type: action.type,
        roleId: action.config.roleId,
        orphanedAt: Date.now()
    };

    // Convert to display_text action
    action.type = 'display_text';
    action.config = {
        content: `⚠️ **Action Requires Attention**\n\n` +
                 `This action tried to assign a deleted role.\n\n` +
                 `Original action type: ${action._orphanedFrom.type}\n` +
                 `Deleted role ID: ${action._orphanedFrom.roleId}`,
        accentColor: 0xE67E22 // Orange
    };
}
```

**Pros:**
- ✅ No extra Discord roles created
- ✅ Action continues to work (as display_text)
- ✅ Clear feedback to users/admins
- ✅ Can restore if role recreated

**Cons:**
- ❌ Changes action behavior
- ❌ May confuse admins ("I didn't create this display_text")
- ❌ Recovery is manual

**Effort:** 2 hours

---

### Option 5: Smart Delete with Confirmation (Safest)

**Approach:** Detect issues, show summary, ask for confirmation

**UI Flow:**
```
Admin clicks: Refresh Anchors → Type "D6"

[BEFORE REFRESH]
⚠️ **Role Validation Issues Detected**

Found 2 Custom Actions with deleted roles in D6:

1. **"Get VIP Role"** (vip_role_123456)
   • Action 0: give_role (Role: 789456123 - Not Found)

2. **"Remove Newbie"** (remove_newbie_654321)
   • Action 1: remove_role (Role: 456789123 - Not Found)

**What would you like to do?**
[Keep Actions] [Delete Actions] [Cancel]

If "Delete Actions":
✅ Deleted 2 Custom Actions with invalid roles
📋 Refreshing anchor for D6...
```

**Implementation:**
```javascript
// In Refresh Anchors handler (before refresh)
const issues = await validateRoleActions(guildId, client);
const coordinateIssues = issues.filter(i =>
    guildData.buttons[i.buttonId].coordinates?.includes(coordinate)
);

if (coordinateIssues.length > 0) {
    // Show confirmation modal/message
    return {
        content: formatValidationIssues(coordinateIssues),
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`safari_keep_invalid_actions_${coordinate}`)
                    .setLabel('Keep Actions')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`safari_delete_invalid_actions_${coordinate}`)
                    .setLabel('Delete Actions')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`safari_cancel_refresh_${coordinate}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Primary)
            )
        ],
        ephemeral: true
    };
}
```

**Pros:**
- ✅ Admin has full control
- ✅ Clear visibility into what's broken
- ✅ Safe - nothing happens without confirmation
- ✅ Educates admin about issues

**Cons:**
- ❌ Adds friction to Refresh Anchors workflow
- ❌ More complex UI logic
- ❌ Might be annoying for frequent refreshes

**Effort:** 3-4 hours

---

### Option 6: Hybrid - Inform + Quick Fix Button

**Approach:** Enhanced error message with one-click fix

**UI Flow:**
```
[Admin clicks edit button on deleted Custom Action]

⚠️ **Custom Action Not Found**

This Custom Action no longer exists in the database but is still
shown in this channel's anchor message.

**Quick Fix:**
[Refresh This Anchor] button → Immediately refreshes D6 anchor

**Manual Fix:**
Go to Map Explorer → Refresh Anchors → Type "D6"
```

**Implementation:**
```javascript
if (!button) {
    // Parse coordinate from message context
    const coordinate = interaction.channel?.topic?.match(/Map location ([A-Z]\d+)/)?.[1];

    let components = [];
    if (coordinate) {
        components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`safari_quick_refresh_anchor_${coordinate}`)
                    .setLabel(`Refresh ${coordinate} Anchor`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            )
        ];
    }

    return {
        content: '⚠️ **Custom Action Not Found**\n\n' +
                'This Custom Action no longer exists...',
        components,
        ephemeral: true
    };
}
```

**Pros:**
- ✅ Simple fix for users (one click)
- ✅ Educates about manual process
- ✅ Low implementation complexity
- ✅ Non-destructive

**Cons:**
- ❌ Only fixes symptom (stale anchor), not cause (deleted role)
- ❌ Requires parsing coordinate from channel topic

**Effort:** 1 hour

---

## Comparison Matrix

| Option | Effort | UX | Prevention | Remediation | Safety |
|--------|--------|----|-----------:|------------:|-------:|
| 1. Inform + Manual | ⭐ | ⭐⭐ | ❌ | Manual | ✅✅✅ |
| 2. Auto-Detect + Notify | ⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ | See 3-5 | ✅✅ |
| 3. Placeholder Role | ⭐⭐⭐⭐ | ⭐⭐⭐ | ❌ | Auto | ✅ |
| 4. Orphan Action | ⭐⭐⭐ | ⭐⭐⭐ | ❌ | Auto | ✅✅ |
| 5. Smart Delete | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | Guided | ✅✅✅ |
| 6. Hybrid Quick Fix | ⭐⭐ | ⭐⭐⭐⭐ | ❌ | One-click | ✅✅✅ |

---

## Recommended Approach

**Phase 1 (Immediate - 1 hour):**
- Implement **Option 6: Hybrid Quick Fix**
- Better error messages + one-click refresh
- Minimal code changes, maximum UX improvement

**Phase 2 (Future - 3-4 hours):**
- Implement **Option 2: Auto-Detect + Notify**
- Add validation scan to Refresh Anchors workflow
- Show summary of broken role actions
- Offer delete or keep options (simplified Option 5)

**Phase 3 (Nice-to-Have - TBD):**
- Gateway event listener for `roleDelete`
- Real-time notification to admins: "Role X was deleted, affects 3 Custom Actions"
- Proactive instead of reactive

---

## Implementation Details (Option 6 - Recommended Phase 1)

### File: `app.js` (Edit handler)

**Current (Lines 15954-15960):**
```javascript
if (!button) {
    console.log(`❌ FAILURE: safari_edit_action - button ${actionId} not found`);
    return {
        content: '❌ Button not found.',
        ephemeral: true
    };
}
```

**Proposed:**
```javascript
if (!button) {
    console.log(`❌ FAILURE: safari_edit_action - button ${actionId} not found`);

    // Try to extract coordinate from channel topic
    const coordinate = context.interaction?.channel?.topic?.match(/Map location ([A-Z]\d+)/)?.[1];

    let message = '⚠️ **Custom Action Not Found**\n\n';
    message += 'This Custom Action no longer exists in the database but may still appear in this channel\'s anchor message.\n\n';

    const components = [];
    if (coordinate) {
        message += `**Quick Fix:** Click the button below to refresh the ${coordinate} anchor message.\n\n`;
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`safari_quick_refresh_anchor_${coordinate}`)
                    .setLabel(`Refresh ${coordinate} Anchor`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            )
        );
    }

    message += '**Manual Fix:**\n';
    message += '1. Go to Map Explorer\n';
    message += '2. Click "Refresh Anchors"\n';
    message += coordinate ? `3. Type "${coordinate}"\n` : '3. Type the coordinate or "All"\n';
    message += '4. Anchor will regenerate without deleted actions';

    return {
        content: message,
        components: components.length > 0 ? components : undefined,
        ephemeral: true
    };
}
```

### File: `app.js` (New quick refresh handler)

**Add after safari_edit_action handler:**
```javascript
} else if (custom_id.startsWith('safari_quick_refresh_anchor_')) {
  return ButtonHandlerFactory.create({
    id: 'safari_quick_refresh_anchor',
    requiresPermission: PermissionFlagsBits.ManageRoles,
    permissionName: 'Manage Roles',
    deferred: true, // Anchor refresh can take time
    handler: async (context) => {
      const coordinate = context.customId.replace('safari_quick_refresh_anchor_', '');
      console.log(`🔄 Quick refreshing anchor for ${coordinate}`);

      try {
        // Import refresh function
        const { refreshMapAnchors } = await import('./safariMapExplorer.js');

        // Refresh the specific coordinate
        await refreshMapAnchors(context.guildId, context.client, [coordinate]);

        return {
          content: `✅ Successfully refreshed anchor for ${coordinate}!`,
          components: [], // Remove the button
          ephemeral: true
        };
      } catch (error) {
        console.error(`❌ Error quick refreshing ${coordinate}:`, error);
        return {
          content: `❌ Failed to refresh anchor: ${error.message}\n\nPlease use Map Explorer → Refresh Anchors manually.`,
          ephemeral: true
        };
      }
    }
  })(req, res, client);
}
```

### File: `buttonHandlerFactory.js` (Registry)

**Add to BUTTON_REGISTRY:**
```javascript
'safari_quick_refresh_anchor_*': {
    label: 'Quick Refresh Anchor',
    description: 'One-click anchor refresh for deleted Custom Actions',
    emoji: '🔄',
    style: 'Primary',
    category: 'safari_map_admin'
},
```

---

## Testing Checklist

**Test Scenario 1: Deleted Custom Action**
- [ ] Create Custom Action with role action
- [ ] Add to coordinate D6
- [ ] Delete the Custom Action via Safari UI
- [ ] Try to edit action from D6 channel
- [ ] Verify enhanced error message shows
- [ ] Verify "Refresh D6 Anchor" button appears
- [ ] Click quick refresh button
- [ ] Verify anchor regenerates without deleted action

**Test Scenario 2: Deleted Role (Future)**
- [ ] Create Custom Action with role action
- [ ] Delete the role from Discord (not CastBot)
- [ ] Try to execute Custom Action as player
- [ ] Verify existing graceful error: "The configured role no longer exists"
- [ ] Try to edit action as admin
- [ ] Verify action editor loads correctly
- [ ] (Phase 2) Verify validation scan detects issue on anchor refresh

**Test Scenario 3: No Coordinate Context**
- [ ] Delete Custom Action
- [ ] Try to edit from non-map channel (if possible)
- [ ] Verify error message shows without Quick Fix button
- [ ] Verify manual instructions are clear

---

## User Experience Examples

### Before (Current)
```
Admin clicks edit button on deleted Custom Action:
❌ Button not found.

[No context, no solution, admin confused]
```

### After (Option 6)
```
Admin clicks edit button on deleted Custom Action:

⚠️ Custom Action Not Found

This Custom Action no longer exists in the database but may
still appear in this channel's anchor message.

Quick Fix: Click the button below to refresh the D6 anchor message.

[Refresh D6 Anchor] 🔄

Manual Fix:
1. Go to Map Explorer
2. Click "Refresh Anchors"
3. Type "D6"
4. Anchor will regenerate without deleted actions

[Clear problem, two solution paths, admin empowered]
```

---

## Future Enhancements (Out of Scope)

1. **Role Position Validation**
   - Detect when roles move above bot's highest role
   - Show warning in Custom Action editor: "⚠️ Bot cannot assign this role (position too high)"

2. **Bulk Role Audit**
   - New admin command: "Audit All Custom Actions"
   - Scans entire guild for invalid roles
   - Generates report with remediation plan

3. **Role Rename Tracking**
   - Detect role renames (ID stays same)
   - Update Custom Action display names automatically

4. **Gateway Event Integration**
   - Listen for `roleDelete` events
   - Immediately notify admins via DM or channel
   - "Role X deleted - affects Custom Actions Y, Z"

---

## Decision Log

**2025-10-19:** Document created with 6 design options
**Next:** User selects preferred approach for implementation

