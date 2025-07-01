# Button Handler Factory System

## Overview

The Button Handler Factory System is a proposed architectural improvement for CastBot that would reduce code duplication by approximately 2,500-3,000 lines while improving maintainability and reducing implementation errors.

## Problem Statement

Currently, CastBot has hundreds of button handlers in app.js, each implementing similar patterns:
- Context extraction (guildId, userId, etc.)
- Permission checking
- Error handling
- Response formatting
- Logging

This leads to:
- Massive code duplication
- Frequent implementation errors
- Difficult maintenance
- Inconsistent error handling
- Missing variable definitions

## Proposed Solution

### Factory Pattern Architecture

```javascript
// buttonHandlerFactory.js
class ButtonHandlerFactory {
    static create(config) {
        return async (req, res, client) => {
            try {
                // 1. Automatic context extraction
                const context = extractButtonContext(req);
                
                // 2. Permission checking
                if (config.requiresPermission) {
                    if (!hasPermission(context.member, config.requiresPermission)) {
                        return sendPermissionDenied(res, config.permissionName);
                    }
                }
                
                // 3. Execute handler logic
                const result = await config.handler(context, req, res, client);
                
                // 4. Send response
                return sendResponse(res, result);
                
            } catch (error) {
                // 5. Centralized error handling
                console.error(`Error in ${config.id} handler:`, error);
                return sendErrorResponse(res);
            }
        };
    }
}
```

### Implementation Example

```javascript
// Before: 50+ lines per handler
} else if (custom_id === 'safari_manage_currency') {
    try {
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        const member = req.body.member;
        // ... 20+ more lines of boilerplate
    } catch (error) {
        // ... error handling
    }
}

// After: 5-10 lines per handler
} else if (custom_id === 'safari_manage_currency') {
    return ButtonHandlerFactory.create({
        id: 'safari_manage_currency',
        requiresPermission: PermissionFlagsBits.ManageRoles,
        permissionName: 'Manage Roles',
        handler: async (context) => {
            const { createCurrencyManagementUI } = await import('./safariManager.js');
            return createCurrencyManagementUI(context.guildId);
        }
    })(req, res, client);
}
```

## Benefits

### 1. Code Reduction
- **Current**: ~50 lines per handler × 100+ handlers = 5,000+ lines
- **Factory**: ~10 lines per handler × 100+ handlers = 1,000 lines
- **Savings**: 4,000+ lines (80% reduction)

### 2. Error Prevention
- Automatic context extraction prevents missing variables
- Centralized permission checking
- Consistent error handling
- Type safety through factory validation

### 3. Maintainability
- Single source of truth for handler patterns
- Easy to add new features to all handlers
- Simplified testing
- Better debugging with centralized logging

## Implementation Plan

### Phase 1: Core Factory (Week 1)
- Create buttonHandlerFactory.js
- Implement context extraction
- Add permission checking
- Build response helpers

### Phase 2: Migration (Week 2-3)
- Migrate 10-20 handlers as proof of concept
- Test thoroughly
- Document patterns
- Create migration guide

### Phase 3: Full Migration (Week 4-6)
- Systematically migrate all handlers
- Group by feature (Safari, Menu, etc.)
- Maintain backward compatibility
- Update documentation

### Phase 4: Advanced Features (Future)
- Add middleware support
- Implement caching
- Add performance monitoring
- Create handler generator CLI

## Technical Design

### Core Components

```javascript
// Context extraction
function extractButtonContext(req) {
    return {
        guildId: req.body.guild_id,
        userId: req.body.member?.user?.id || req.body.user?.id,
        member: req.body.member,
        channelId: req.body.channel_id,
        messageId: req.body.message?.id,
        token: req.body.token,
        applicationId: req.body.application_id || process.env.APP_ID,
        customId: req.body.data?.custom_id,
        values: req.body.data?.values,
        components: req.body.message?.components
    };
}

// Permission checking
function hasPermission(member, permission) {
    return member?.permissions && (BigInt(member.permissions) & permission);
}

// Response builders
function sendResponse(res, data) {
    return res.send({
        type: data.updateMessage 
            ? InteractionResponseType.UPDATE_MESSAGE 
            : InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            ...data,
            flags: data.ephemeral ? InteractionResponseFlags.EPHEMERAL : 0
        }
    });
}
```

### Handler Configuration

```javascript
const handlerConfigs = {
    'safari_manage_currency': {
        requiresPermission: PermissionFlagsBits.ManageRoles,
        permissionName: 'Manage Roles',
        feature: 'safari',
        analyticsEvent: 'SAFARI_CURRENCY_MANAGE'
    },
    'menu_player_set_age': {
        requiresPermission: null,
        feature: 'player',
        validation: ['age'],
        analyticsEvent: 'PLAYER_SET_AGE'
    }
};
```

## Migration Strategy

### Step 1: Identify Handler Groups
- Safari handlers (~30)
- Menu handlers (~40)
- Production handlers (~20)
- Player handlers (~15)
- Misc handlers (~20)

### Step 2: Create Feature Modules
```javascript
// handlers/safariHandlers.js
export const safariHandlers = {
    'safari_manage_currency': {
        handler: async (context) => {
            // Handler logic
        }
    }
};
```

### Step 3: Progressive Migration
1. Start with lowest-risk handlers
2. Test each migration thoroughly
3. Monitor for issues
4. Roll back if needed

## Testing Approach

### Unit Tests
```javascript
describe('ButtonHandlerFactory', () => {
    it('should extract context correctly', () => {
        const req = mockRequest();
        const context = extractButtonContext(req);
        expect(context.guildId).toBe('123456');
    });
    
    it('should check permissions', () => {
        const member = { permissions: '8' };
        expect(hasPermission(member, 8n)).toBe(true);
    });
});
```

### Integration Tests
- Test actual button interactions
- Verify response formats
- Check error scenarios
- Validate permissions

## Risk Mitigation

### Gradual Rollout
- Implement factory alongside existing handlers
- Migrate incrementally
- Keep old handlers as fallback
- Monitor performance

### Rollback Plan
- Keep original handlers commented
- Quick revert capability
- Feature flags for new system
- A/B testing if needed

## Success Metrics

### Quantitative
- Lines of code reduced: Target 2,500-3,000
- Error rate reduction: Target 50%
- Development speed: Target 2x faster
- Test coverage: Target 90%

### Qualitative
- Developer satisfaction
- Reduced debugging time
- Easier onboarding
- Better maintainability

## Future Enhancements

### Middleware System
```javascript
ButtonHandlerFactory.use('safari_*', rateLimitMiddleware);
ButtonHandlerFactory.use('admin_*', adminOnlyMiddleware);
```

### Handler Generator
```bash
npm run generate:handler -- --name "my_new_handler" --feature "safari" --permission "ManageRoles"
```

### Performance Monitoring
- Handler execution time
- Error rates by handler
- Usage analytics
- Performance alerts

## Conclusion

The Button Handler Factory System represents a significant architectural improvement that will:
- Reduce code by 50-80%
- Prevent common errors
- Improve maintainability
- Speed up development
- Provide a foundation for future enhancements

This is a high-priority improvement that will pay dividends in reduced bugs, faster feature development, and improved code quality.