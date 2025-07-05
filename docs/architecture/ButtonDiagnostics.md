# Button Handler Diagnostics Guide

## Overview

This guide helps diagnose and fix the dreaded "This interaction failed" error in Discord button handlers. Follow the diagnostic flowchart to quickly identify and resolve issues.

## 🚨 Common "This interaction failed" Causes

### 1. Handler Not Being Called
**Symptom**: No `🔍 START` log in console
**Common Causes**:
- Custom ID mismatch between button creation and handler
- Handler not registered in the if/else chain
- Pattern matching issue (e.g., checking for wrong prefix)
- Button registered with wrong custom_id in BUTTON_REGISTRY

**Fix Checklist**:
- [ ] Verify exact custom_id match
- [ ] Check handler is in app.js if/else chain
- [ ] Confirm no typos in pattern matching
- [ ] For factory handlers, check BUTTON_REGISTRY entry

### 2. Handler Crashes Before Response
**Symptom**: `🔍 START` present but no `✅ SUCCESS`
**Common Causes**:
- Undefined variable access (e.g., `context.userId` when userId not extracted)
- Async error not caught by try/catch
- Missing required imports
- Null/undefined checks failing

**Fix Checklist**:
- [ ] Check all variables are defined before use
- [ ] Ensure async functions are awaited
- [ ] Verify all imports are present
- [ ] Add null checks for optional data

### 3. Response Timeout (3-Second Rule)
**Symptom**: Handler runs but takes >3 seconds
**Common Causes**:
- Long-running operations without deferred response
- Multiple API calls in sequence
- Large data processing
- Waiting for external services

**Fix**: Add `deferred: true` to factory config:
```javascript
return ButtonHandlerFactory.create({
  id: 'slow_button',
  deferred: true,  // MANDATORY for operations >3s
  ephemeral: true,
  handler: async (context) => {
    // Long operation here
  }
})(req, res, client);
```

### 4. Invalid Response Format
**Symptom**: Handler completes but Discord rejects response
**Common Causes**:
- Wrong response type for the interaction
- Malformed component structure
- Exceeding Discord limits (2000 chars, 5 buttons per row)
- Missing required fields

**Fix Checklist**:
- [ ] Verify response matches interaction type
- [ ] Check component structure is valid
- [ ] Ensure content length <2000 characters
- [ ] Validate embeds/components format

## 📊 Diagnostic Flowchart

```
User clicks button → "This interaction failed"
                    ↓
         Check logs for button's custom_id
                    ↓
    ┌─────────────────────────────────────┐
    │ Is there a 🔍 START log?            │
    └─────────────┬───────────────────────┘
                  │
        NO ←──────┴──────→ YES
        ↓                   ↓
   Handler not         Check for
   being called        ✅ SUCCESS log
        ↓                   ↓
   Check:              NO ←─┴─→ YES
   - Custom ID             ↓      ↓
   - If/else chain    Handler    Check
   - Pattern match    crashed    response
                         ↓         ↓
                    Check:    Still fails?
                    - Errors       ↓
                    - Variables   Check:
                    - Imports     - Deferred?
                                 - Format
                                 - Timing
```

## 🛠️ Testing Strategies

### 1. Pre-Deployment Validation
```bash
# Quick validation script
BUTTON_ID="your_button_id"
echo "Checking button: $BUTTON_ID"
grep -n "custom_id === '$BUTTON_ID'" app.js || echo "❌ Handler not found"
grep -n "'$BUTTON_ID':" buttonHandlerFactory.js || echo "❌ Not in registry"
```

### 2. Logging Pattern (MANDATORY)
Every handler MUST include:
```javascript
handler: async (context) => {
  const startTime = Date.now();
  console.log(`🔍 START: ${context.customId} - user ${context.userId}`);
  
  try {
    // Your logic here
    
    console.log(`✅ SUCCESS: ${context.customId} - completed in ${Date.now() - startTime}ms`);
    return { content: 'Success!', ephemeral: true };
    
  } catch (error) {
    console.error(`❌ FAILURE: ${context.customId}`, error);
    throw error; // Let factory handle the error response
  }
}
```

### 3. Common Gotchas Checklist

**Context Extraction**:
- [ ] `guildId` extracted from `req.body.guild_id`
- [ ] `userId` extracted with fallback: `req.body.member?.user?.id || req.body.user?.id`
- [ ] `member` available for permission checks
- [ ] `client` destructured from context when needed

**Response Requirements**:
- [ ] Response sent within 3 seconds (or deferred)
- [ ] Correct InteractionResponseType used
- [ ] Ephemeral flag for private responses
- [ ] Component structure validated

**Error Handling**:
- [ ] Try-catch wraps async operations
- [ ] Errors logged with context
- [ ] User sees friendly error message
- [ ] No sensitive data in error responses

## 🔍 Debug Commands

### Check Recent Button Interactions
```bash
# See all button interactions in last 100 lines
npm run logs-prod | grep "BUTTON_FACTORY\|🔍 START\|✅ SUCCESS\|❌ FAILURE"

# Check specific button
npm run logs-prod | grep "your_button_id"

# See only failures
npm run logs-prod-errors | grep "BUTTON"
```

### Live Debugging
```bash
# Follow logs in real-time while testing
npm run logs-prod-follow | grep --line-buffered "🔍\|✅\|❌"
```

## 💡 Best Practices

### 1. Always Log Start and Success
This is non-negotiable. It's the only way to diagnose issues quickly.

### 2. Use Deferred Responses Appropriately
If your handler might take >3 seconds, always use `deferred: true`:
- Database operations
- External API calls
- Complex calculations
- Multi-message responses

### 3. Test Every Path
- Happy path (normal operation)
- Error path (what if API fails?)
- Edge cases (missing data, permissions)
- Mobile Discord (different UI constraints)

### 4. Monitor Production Logs
After deployment:
```bash
# Watch for your button
npm run logs-prod-follow | grep "your_button_id"
```

## 🚀 Quick Fixes

### "This interaction failed" immediately
**Likely**: Handler not found
**Fix**: Check custom_id matches exactly

### "This interaction failed" after 3 seconds
**Likely**: Missing deferred response
**Fix**: Add `deferred: true` to factory config

### Works sometimes, fails sometimes
**Likely**: Race condition or external service issue
**Fix**: Add better error handling and logging

### Works for some users, not others
**Likely**: Permission or user-specific data issue
**Fix**: Add permission checks and null handling

## 📚 Related Documentation

- [ButtonHandlerFactory.md](ButtonHandlerFactory.md) - Factory pattern details
- [BUTTON_HANDLER_REGISTRY.md](BUTTON_HANDLER_REGISTRY.md) - All registered buttons
- [LoggingStandards.md](LoggingStandards.md) - Logging best practices
- [ComponentsV2.md](../features/ComponentsV2.md) - Discord component limits