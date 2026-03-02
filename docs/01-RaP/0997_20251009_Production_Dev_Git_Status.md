# Production vs Development Git Status

**Date**: 2025-10-09
**Purpose**: Document differences between production and development code

---

## 📊 Git HEAD Comparison

| Environment | Commit | Date | Description |
|------------|--------|------|-------------|
| **Production** | `f8988e0b` | 2025-10-01 02:52:01 | Dev checkpoint - 02:52:01 |
| **Development** | `8ff00191` | 2025-10-09 (today) | Remove GuildMemberManager and UserManager cache limits |

**Commits Behind**: Production is **110 commits** behind development

---

## 🔍 Critical Code Differences

### 1. Null Safety Validation (applicationManager.js)

**Added in Commit**: `20d40036` (2025-09-30)
**Production Status**: ❌ **NOT DEPLOYED** (20 commits behind this fix)

#### Production Code (Lines 289-310)
```javascript
// Create the channel with proper permissions
const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
        {
            id: guild.roles.everyone.id,  // ❌ No null safety
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: user.id,  // ❌ No validation
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.AddReactions,
                PermissionFlagsBits.UseExternalEmojis
            ]
        }
    ]
});
```

#### Development Code (Lines 289-335)
```javascript
// Create the channel with proper permissions
// Debug logging for permission overwrites validation
const everyoneRoleId = guild.roles.everyone?.id;  // ✅ Null-safe
const userId = user.id;

console.log('🔍 [APPLICATION] Creating channel with permissions', {
    guildId: guild.id,
    guildName: guild.name,
    userId: userId,
    username: user.username || user.user?.username,
    displayName: user.displayName,
    everyoneRoleId: everyoneRoleId,
    everyoneRoleExists: !!guild.roles.everyone,
    configId: configId,
    productionRole: config.productionRole || 'none',
    channelName: channelName
});

// Validate IDs exist before creating channel
if (!everyoneRoleId) {  // ✅ Validation
    throw new Error(`@everyone role not found in guild ${guild.id} (${guild.name})`);
}
if (!userId) {  // ✅ Validation
    throw new Error(`User ID is undefined for user: ${JSON.stringify(user)}`);
}

const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
        {
            id: everyoneRoleId,  // ✅ Validated ID
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: userId,  // ✅ Validated ID
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.AddReactions,
                PermissionFlagsBits.UseExternalEmojis
            ]
        }
    ]
});
```

**Impact**:
- ❌ Production: Direct access can fail with "Supplied parameter is not a User nor a Role"
- ✅ Development: Validates before use, provides clear error messages

---

### 2. Cache Limits (app.js)

**Changed in Commit**: `8ff00191` (2025-10-09 - today)
**Production Status**: ❌ **NOT DEPLOYED** (110 commits behind)

#### Production Code (Lines 1349-1353)
```javascript
makeCache: Options.cacheWithLimits({
  MessageManager: 50,
  GuildMemberManager: 4000,  // ❌ Causes mid-operation evictions
  UserManager: 1000          // ❌ Redundant, wastes memory
})
```

#### Development Code (Lines 1349-1353)
```javascript
makeCache: Options.cacheWithLimits({
  MessageManager: 50        // ✅ Only messages limited
  // GuildMemberManager: REMOVED - prevents mid-operation evictions
  // UserManager: REMOVED - saves memory (6.69MB -> 0.97MB)
})
```

**Impact**:
- ❌ Production: 4000 member limit across 75 servers causes constant evictions
- ✅ Development: Natural limit (server membership), no evictions, lower memory

---

### 3. Error Context Logging (applicationManager.js)

**Added in Commit**: `20d40036` (2025-09-30)
**Production Status**: ❌ **NOT DEPLOYED**

#### Production Code
```javascript
} catch (error) {
    console.error('Error creating application channel:', error);
    return { success: false, error: error.message };
}
```

#### Development Code (Lines 425-445)
```javascript
} catch (error) {
    console.error('❌ [APPLICATION] Error creating application channel:', error);
    console.error('❌ [APPLICATION] Error context:', {
        errorMessage: error.message,
        errorCode: error.code,
        errorStack: error.stack,
        guildId: guild?.id,
        guildName: guild?.name,
        userId: user?.id,
        username: user?.username || user?.user?.username,
        displayName: user?.displayName,
        everyoneRoleId: guild?.roles?.everyone?.id,
        everyoneRoleExists: !!guild?.roles?.everyone,
        configId: configId,
        productionRole: config?.productionRole,
        categoryId: config?.categoryId,
        userObjectKeys: user ? Object.keys(user) : 'user is undefined',
        guildRolesCount: guild?.roles?.cache?.size || 0
    });
    return { success: false, error: error.message };
}
```

**Impact**:
- ❌ Production: Minimal error info, hard to diagnose
- ✅ Development: Comprehensive context for debugging

---

## 📝 Recent Development Commits (Last 10)

1. `8ff00191` - **Remove GuildMemberManager and UserManager cache limits** ⭐ *Just committed*
2. `7bd00785` - Fix castlist_delete false legacy detection
3. `e93da53e` - Clean up deprecated castlist_create_new_button code
4. `b7fb8944` - Streamline Castlist Creation
5. `9a643cfc` - Fix Create New Castlist - save to castlistConfigs
6. `4f055155` - Fix Create New Castlist error response
7. `1493eb76` - Fix Create New Castlist - replace missing generateId
8. `283b75c6` - Fix Create New Castlist modal validation
9. `31781eb9` - Fix Create New Castlist modal submission handler
10. `77ec4838` - Fix Create New Castlist modal

**Most Critical Commits Missing from Production**:
- `20d40036` - **Add comprehensive debug logging** (null safety validation) - *20 commits behind*
- `8ff00191` - **Remove cache limits** - *110 commits behind*

---

## 🎯 Deployment Priority

### High Priority (Fixes Active Errors)
1. **Null Safety Validation** (`20d40036`) - Prevents "Supplied parameter is not a User nor a Role"
2. **Cache Limit Removal** (`8ff00191`) - Prevents mid-operation evictions

### Medium Priority (Improvements)
3. Error Context Logging - Better diagnostics
4. Castlist V3 fixes - Feature improvements

### Low Priority (Non-Breaking)
5. Code cleanup commits
6. Documentation updates

---

## 🚨 Risk Assessment

### Deploying Null Safety Only
- **Risk**: Low
- **Benefit**: Better error messages, early validation
- **Impact**: No breaking changes, adds safety checks

### Deploying Cache Limit Removal Only
- **Risk**: Medium (memory increase concern)
- **Benefit**: Eliminates mid-operation evictions
- **Impact**: Memory usage may change (+/- 5 MB estimated)

### Deploying Both Together (Recommended)
- **Risk**: Medium (combined changes)
- **Benefit**: Fixes root cause + adds safety net
- **Impact**: Resolves "Supplied parameter" errors completely

### Deploying All 110 Commits
- **Risk**: High (large change set)
- **Benefit**: Gets production up to date
- **Impact**: Includes Castlist V3 changes, many bug fixes
- **Testing**: Requires comprehensive testing

---

## 📋 Recommended Deployment Strategy

### Option 1: Targeted Fix (Safest)
```bash
# Cherry-pick specific commits
git cherry-pick 20d40036  # Null safety
git cherry-pick 8ff00191  # Cache limits
# Test and deploy
```

### Option 2: Full Update (Risky but Complete)
```bash
# Deploy all 110 commits
git pull origin main
# Extensive testing required
```

### Option 3: Phased Deployment
```bash
# Phase 1: Null safety (Week 1)
git cherry-pick 20d40036

# Phase 2: Cache limits (Week 2)
git cherry-pick 8ff00191

# Phase 3: Remaining commits (Week 3-4)
git pull origin main
```

---

## 🔍 Production Server Analysis

### Untracked Files in Production
```
?? debug-filters.js
?? debug-live-analytics.js
?? ecosystem.config.js
?? img/1311967534161072150/
?? img/1385042963310055515/
?? img/1401977457468248168/
?? img/1402808630201286716/
?? img/1412422613774368851/
?? img/1418593741773738075/
?? playerData.json.backup-20250803-185400
?? playerData_backup_20250807_003521.json
?? safariContent.json.backup-20250803-185406
?? test-analytics.js
```

**Notes**:
- Debug files suggest manual testing in production
- Multiple backup files indicate data recovery operations
- `ecosystem.config.js` - PM2 configuration (should be tracked)

---

## 📊 Cache Configuration Comparison

| Aspect | Production | Development |
|--------|-----------|-------------|
| **MessageManager** | 50 | 50 |
| **GuildMemberManager** | 4000 | Unlimited |
| **UserManager** | 1000 | Unlimited |
| **RoleManager** | Unlimited | Unlimited |
| **ChannelManager** | Unlimited | Unlimited |
| **Total Cache Memory** | ~6.69 MB | ~0.97 MB |
| **Member Evictions** | Frequent | Never |
| **Memory Usage** | Higher | Lower |

---

## ✅ Action Items

### Before Deployment
- [ ] Review all 110 commits for breaking changes
- [ ] Test null safety validation in dev
- [ ] Monitor dev memory usage with cache limits removed
- [ ] Create rollback plan

### During Deployment
- [ ] Back up production database
- [ ] Deploy during low-traffic period
- [ ] Monitor logs in real-time
- [ ] Have SSH access ready

### After Deployment
- [ ] Verify "Supplied parameter" errors disappear
- [ ] Monitor memory usage (target: <200 MB)
- [ ] Check user reports
- [ ] Validate application creation success rate

---

**Document Status**: ✅ Complete
**Requires Update**: After production deployment

*Last Updated: 2025-10-09 - Initial comparison*
