# Phase 2: Risk Assessment - Simplify manage-commands.js

## 🎯 Objective
Remove all guild-specific deployment logic, dev_ prefix handling, and simplify to global-only command deployment.

## 🔴 HIGH RISK Areas

### 1. **Production Deployment Scripts**
- **Risk**: Production relies on `npm run deploy-commands` 
- **Impact**: Breaking this could prevent command updates in production
- **Files Affected**:
  - `deploy-remote-wsl.js` (line 263: calls `npm run deploy-commands`)
  - `package.json` (line 14: script definition)
- **Mitigation**: Test deployment script thoroughly after changes

### 2. **Environment Variable Dependencies**
- **Risk**: `DEV_GUILD_ID` is referenced in multiple places
- **Impact**: Script failures if variable is expected but missing
- **Files Affected**:
  - `config.js` (line 12: exports devGuildId)
  - `.env` files (need to keep for backward compatibility)
- **Mitigation**: Keep variable defined but unused, add deprecation comment

## 🟡 MEDIUM RISK Areas

### 3. **Error Messages & Logging**
- **Risk**: Error handlers expect guild-specific context
- **Impact**: Confusing error messages or missing debug info
- **Specific Lines**:
  - Line 532: "Check your APP_ID and DEV_GUILD_ID"
  - Line 461-463: Development mode validation
- **Mitigation**: Update error messages to remove guild references

### 4. **Conditional Logic Dependencies**
- **Risk**: IS_PRODUCTION flag drives major branching
- **Impact**: Wrong commands deployed to wrong environment
- **Key Branches**:
  - Lines 120-184: Cleanup logic
  - Lines 289-351: Deployment logic
  - Lines 362-418: Verification logic
- **Mitigation**: Simplify to single path, remove IS_PRODUCTION checks

## 🟢 LOW RISK Areas

### 5. **Utility Functions**
- **Functions**: `getExistingCommands`, `deleteCommand`, `rateLimitAwareRequest`
- **Impact**: Can be simplified but won't break if left with guild parameters
- **Mitigation**: Remove guild parameters in Phase 5

### 6. **Command Analysis**
- **Risk**: Analysis expects both global and guild commands
- **Impact**: Misleading analysis output
- **Lines**: 196-282
- **Mitigation**: Remove guild analysis sections

## 📋 Implementation Checklist

### Pre-Implementation
- [ ] Backup current manage-commands.js
- [ ] Document current deployment process
- [ ] Test current deployment in development
- [ ] Verify production deployment works

### Core Changes
- [ ] Remove DEV_GUILD_ID constant (line 22)
- [ ] Remove IS_PRODUCTION branching in cleanExistingCommands (lines 120-184)
- [ ] Remove guild command cleanup loops (lines 135-143)
- [ ] Remove dev_ prefix handling (lines 126-132)
- [ ] Simplify deployCommands to global-only (lines 284-354)
- [ ] Remove guild deployment block (lines 313-333)
- [ ] Remove dev_ prefix transformation (line 319)
- [ ] Update verifyCommands for global-only (lines 356-446)
- [ ] Remove guild verification logic (lines 390-404, 424-426)

### Error Handling Updates
- [ ] Update error message at line 532 (remove DEV_GUILD_ID)
- [ ] Remove development mode validation (lines 461-463)
- [ ] Update validation messages

### Analysis Function Updates
- [ ] Remove guild analysis from analyzeCommandChanges (lines 237-254)
- [ ] Simplify change detection logic
- [ ] Update output formatting

### Documentation Updates
- [ ] Update function comments (lines 5-18)
- [ ] Update README.md deployment instructions
- [ ] Add deprecation notice for DEV_GUILD_ID

### Testing Checklist
- [ ] Run with --dry-run flag
- [ ] Test --analyze-only mode
- [ ] Test --clean-only mode
- [ ] Test --verify-only mode
- [ ] Test full deployment in development
- [ ] Verify no dev_ commands created
- [ ] Verify only global commands deployed

### Post-Implementation
- [ ] Update package.json scripts if needed
- [ ] Test deploy-remote-wsl.js integration
- [ ] Document simplified deployment process
- [ ] Update CLAUDE.md with new process

## 🔍 Dependencies to Check

### External Scripts
1. **deploy-remote-wsl.js**
   - Line 263: Calls `npm run deploy-commands`
   - Should continue to work unchanged

2. **Package.json scripts**
   - All command-related scripts should work unchanged
   - May simplify in Phase 6

3. **GitHub Actions/CI**
   - Check for any automation using these scripts

### Internal Dependencies
- No other files directly import manage-commands.js
- Only called via npm scripts

## 📊 Success Metrics
- [ ] Script runs without errors
- [ ] Only 2 global commands deployed (menu, castlist)
- [ ] No dev_ prefixed commands exist
- [ ] No guild-specific commands deployed
- [ ] Deploy time reduced by ~50%
- [ ] Code reduced from 555 to ~200 lines

## ⚠️ Rollback Plan
1. Keep backup of original manage-commands.js
2. Can restore via git if issues arise
3. Test thoroughly in development before production

## 📝 Notes
- This is a self-contained script with no imports from other project files
- Main risk is breaking the deployment pipeline
- Focus on preserving the npm script interface
- Keep --dry-run functionality for safe testing