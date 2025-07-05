# Definition of Done (DoD)

This checklist MUST be completed for every feature, fix, or enhancement before it can be considered "done". Use this as your final quality gate.

## 🎯 Core Requirements

### 1. Functionality
- [ ] Feature works as specified in requirements
- [ ] All acceptance criteria met
- [ ] No regression in existing features

### 2. Code Quality
- [ ] Code follows existing patterns and conventions
- [ ] No code duplication (DRY principle)
- [ ] Functions have single responsibility
- [ ] Complex logic has inline comments
- [ ] No hardcoded values (use constants/config)

### 3. Error Handling
- [ ] All async operations wrapped in try-catch
- [ ] User-friendly error messages (not stack traces)
- [ ] Errors logged with context
- [ ] Graceful fallbacks for non-critical failures
- [ ] Network failures handled appropriately

### 4. Logging Requirements
Every feature MUST include comprehensive logging following our logging standards:

**📋 MANDATORY:** Follow [docs/architecture/LoggingStandards.md](docs/architecture/LoggingStandards.md) for all logging

#### Required Logging Points
- [ ] Use logger utility (not direct console.log):
  ```javascript
  import { logger } from './logger.js';
  logger.debug('FEATURE', 'Starting action', { userId, context });
  ```
- [ ] Debug logging for development troubleshooting
- [ ] Info logging for important user actions
- [ ] Error logging with proper context and error objects
- [ ] Performance logging for operations > 100ms:
  ```javascript
  const start = Date.now();
  // ... operation ...
  logger.perf('FEATURE', 'operation name', Date.now() - start);
  ```

#### Analytics Logging
- [ ] User interactions logged via `logInteraction()`:
  ```javascript
  await logInteraction(guildId, userId, interactionType, customId);
  ```

#### Environment Awareness
- [ ] Debug logs only run in development (unless FORCE_DEBUG=true)
- [ ] Info/warn/error logs always run
- [ ] Use consistent feature categories (SAFARI, MENU, BUTTON, etc.)

### 5. Discord Integration
- [ ] Respects Discord API limits:
  - 40 components per message
  - 5 fields per modal
  - 25 options per select menu
  - 100 character custom_id limit
  - 3 second interaction response time
- [ ] Uses appropriate interaction response types
- [ ] Ephemeral messages for errors/private info
- [ ] Mobile Discord UI tested

### 6. Security
- [ ] Permission checks implemented where needed
- [ ] No exposed secrets or tokens in code/logs
- [ ] User input validated and sanitized
- [ ] Admin features properly restricted
- [ ] No SQL injection or XSS vulnerabilities

### 7. Documentation
- [ ] JSDoc comments for new functions:
  ```javascript
  /**
   * Brief description of function
   * @param {string} paramName - Description
   * @returns {Object} Description of return
   */
  ```
- [ ] Complex algorithms documented
- [ ] Integration points explained
- [ ] README/help text updated if needed

### 8. Testing
- [ ] Happy path tested manually
- [ ] Error scenarios tested
- [ ] Edge cases tested:
  - Empty data
  - Invalid input
  - Missing permissions
  - Network failures
- [ ] Cross-browser tested (if web UI)
- [ ] Mobile Discord tested

### 9. Performance
- [ ] Response time < 3 seconds
- [ ] No blocking operations on main thread
- [ ] Efficient data structures used
- [ ] Database queries optimized (if applicable)
- [ ] Memory leaks checked

### 10. Button/Component Handlers
**🚨 MANDATORY: Use Button Handler Factory System** - See [docs/architecture/ButtonHandlerFactory.md](docs/architecture/ButtonHandlerFactory.md)

If feature includes Discord buttons/components:
- [ ] **Button defined in BUTTON_REGISTRY** (buttonHandlerFactory.js):
  ```javascript
  'button_id': {
    label: 'Button Text',
    description: 'What this button does',
    emoji: '🔥',
    style: 'Primary',
    category: 'feature_name'
  }
  ```
- [ ] **Handler uses ButtonHandlerFactory.create()**:
  ```javascript
  } else if (custom_id === 'button_id') {
    return ButtonHandlerFactory.create({
      id: 'button_id',
      deferred: true,  // REQUIRED for: >3s ops, multi-messages, webhooks
      ephemeral: true, // REQUIRED for private responses
      handler: async (context) => {
        // Your logic here
        return { content: 'Success!' };
      }
    })(req, res, client);
  }
  ```
- [ ] **Menu creation uses MenuFactory** (if applicable):
  ```javascript
  const components = MenuFactory.createComponents('menu_id');
  ```
- [ ] BUTTON_HANDLER_REGISTRY.md updated
- [ ] Natural language search works (test with ButtonRegistry.search())
- [ ] **Mandatory logging pattern implemented**:
  ```javascript
  console.log(`🔍 START: ${custom_id} - user ${context.userId}`);
  // ... handler logic ...
  console.log(`✅ SUCCESS: ${custom_id} - completed`);
  ```
- [ ] **For operations >3 seconds**: `deferred: true` in factory config
- [ ] **For multi-message responses**: `deferred: true` required
- [ ] **Error cases log failure**: `console.log(`❌ FAILURE: ${custom_id}`, error);`

**⚠️ DEPRECATED PATTERNS - DO NOT USE:**
- ❌ Manual try-catch wrappers (factory handles this)
- ❌ Manual context extraction (factory handles this)  
- ❌ Direct Discord component creation (use MenuFactory)
- ❌ Manual error handling (factory standardizes this)

### 11. Data Management
- [ ] Data structure documented
- [ ] Migration path for existing data
- [ ] Backup considerations addressed
- [ ] Data validation implemented
- [ ] Storage limits considered

### 12. Deployment
- [ ] Code committed with descriptive message
- [ ] No console.log for sensitive data
- [ ] Environment variables documented
- [ ] Deployment instructions updated
- [ ] Rollback plan considered

## 📋 Quick Checklist for Common Tasks

### Bug Fix
- [ ] Root cause identified
- [ ] Fix implemented and tested
- [ ] Regression test performed
- [ ] Error logging added
- [ ] Documentation updated

### New Button/Menu
- [ ] Handler implemented with try-catch
- [ ] Context variables extracted
- [ ] BUTTON_HANDLER_REGISTRY.md updated
- [ ] Error responses are ephemeral
- [ ] Mobile UI tested

### New Command
- [ ] Command registered properly
- [ ] Permission checks implemented
- [ ] Help text clear and accurate
- [ ] Error handling comprehensive
- [ ] Analytics logging added

### API Integration
- [ ] Rate limits respected
- [ ] Timeout handling implemented
- [ ] Error responses handled
- [ ] Retry logic if appropriate
- [ ] API keys secure

## 🚀 Final Deployment Checklist

Before running `npm run deploy-remote-wsl`:
- [ ] All above items checked
- [ ] `./scripts/dev/dev-restart.sh` run successfully
- [ ] No errors in development log
- [ ] Feature tested in dev environment
- [ ] Git committed and pushed
- [ ] Team notified of deployment (if applicable)

## 📝 Exceptions

Some items may not apply to every change. Document any exceptions:
- Emergency hotfixes may skip some documentation
- Tiny fixes (< 5 lines) may have reduced requirements
- Experimental features may have relaxed standards

Always use judgment, but default to completing all items.

## 🔄 Living Document

This DoD should evolve with the project. If you find items that should be added or removed, update this document and notify the team.