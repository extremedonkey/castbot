# Role Hierarchy Deep Dive - Backlog Item

## 🎯 Problem Statement

**Issue**: Role assignment fails due to role hierarchy problems, but users don't know this until they try to use the features.

**Current Behavior**: 
- Users set up pronoun/timezone roles
- Bot tries to assign roles later
- Gets "Missing Permissions" error
- User has to manually fix role hierarchy

**Better Approach**: 
- Detect role hierarchy issues during setup
- Warn users proactively  
- Provide clear instructions for fixing
- Maybe even auto-fix if possible

## 📋 Scope of Work

### **Phase 1: Detection and Warning**
1. **Setup Commands Analysis**
   - `/setup_castbot` - Check CastBot role position after creating roles
   - `/pronouns_add` - Validate hierarchy when adding pronoun roles
   - `/timezones_add` - Validate hierarchy when adding timezone roles
   - `/add_tribe` - Check if bot can manage tribe roles

2. **Hierarchy Validation Function**
   ```javascript
   async function validateBotRoleHierarchy(guild, targetRoleIds) {
     // Check if bot has Manage Roles permission
     // Check if bot's highest role is above all target roles
     // Return detailed analysis with specific fixes needed
   }
   ```

3. **Proactive Warnings**
   - Show warnings during setup if hierarchy is wrong
   - Provide step-by-step fix instructions
   - Maybe include screenshots/diagrams in responses

### **Phase 2: Auto-Detection in Existing Servers**
1. **Health Check Command**
   - New admin command: `/health_check` or add to existing commands
   - Scans all configured roles for hierarchy issues
   - Reports what needs to be fixed

2. **Startup Validation**
   - Check role hierarchy when bot starts up
   - Log warnings for admins
   - Maybe send DM to server owner with issues

### **Phase 3: Enhanced UX**
1. **Better Error Messages**
   - Instead of "Missing Permissions", show specific role hierarchy issue
   - Include direct link to server settings
   - Show before/after hierarchy examples

2. **Auto-Fix Attempts**
   - Try to move CastBot role up (if bot has Manage Roles permission)
   - Ask user for permission before making changes
   - Fallback to manual instructions if auto-fix fails

### **Phase 4: Prevention**
1. **Setup Wizard Enhancement**
   - Guide users through proper role setup order
   - Create CastBot role at top during setup
   - Validate hierarchy at each step

2. **Documentation**
   - Add role hierarchy section to README
   - Create troubleshooting guide
   - Include in CLAUDE.md for future development

## 🔧 Technical Implementation

### **New Functions Needed**
```javascript
// Core hierarchy checking
async function checkBotRoleHierarchy(guild, roleIds)
async function getBotHighestRole(guild)
async function getProblematicRoles(guild, roleIds)

// Auto-fix functionality  
async function attemptRoleHierarchyFix(guild, roleIds)
async function moveBotRoleToTop(guild)

// User-friendly reporting
async function generateHierarchyReport(guild)
async function createHierarchyFixInstructions(guild, issues)
```

### **Integration Points**
- Modify existing setup commands
- Add to error handling in role assignment
- Integrate with command registration/verification
- Add to health monitoring

## 🎯 Success Criteria

1. **Proactive Detection**: Users get warned during setup, not during use
2. **Clear Instructions**: Error messages include specific steps to fix
3. **Reduced Support**: Fewer "Missing Permissions" support requests
4. **Better UX**: Role assignment "just works" after proper setup

## 📊 Priority Assessment

**Impact**: High (affects core functionality)
**Effort**: Medium (requires careful testing with role permissions)
**Risk**: Low (mostly additive, doesn't change existing functionality)

**Recommendation**: Implement Phase 1 (Detection and Warning) first, as it provides immediate value with minimal risk.

## 📝 Notes

- Role hierarchy is Discord-server-specific, so solution needs to work across different server configurations
- Some servers have complex role structures, so need to be careful not to break existing setups
- Discord.js provides good APIs for role management, should leverage those
- Consider rate limiting when checking multiple roles
- Test with servers that have many roles (some servers have 50+ roles)

## 🔗 Related Issues

- Current "Missing Permissions" error in pronoun/timezone assignment
- General user confusion about Discord role hierarchy
- Support burden for role-related issues
- Potential issues with tribe role management in castlists