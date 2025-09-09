# Anchor Message Update Integration

## Summary
I've created a scalable anchor message update system with:

1. **anchorMessageManager.js** - Centralized queue-based update system
   - Batches updates to avoid Discord rate limits
   - Automatic retry for failed updates
   - Multiple update methods for different scenarios

2. **anchorMessageIntegration.js** - Shows integration points

## Integration Needed in app.js

### 1. In the `remove_coord` handler (around line 14090):
```javascript
// After this line:
await saveSafariContent(allSafariContent);
console.log(`🔍 DEBUG: remove_coord - safari content saved`);

// Add these lines:
// Queue anchor message update for the removed coordinate
const { afterRemoveCoordinate } = await import('./anchorMessageIntegration.js');
await afterRemoveCoordinate(context.guildId, actionId, coordinate);
console.log(`🔍 DEBUG: remove_coord - queued anchor update for ${coordinate}`);
```

### 2. In the `custom_action_delete_confirm` handler:
```javascript
// After deleting the action and saving:
await saveSafariContent(allSafariContent);

// Add:
const { afterDeleteCustomAction } = await import('./anchorMessageIntegration.js');
await afterDeleteCustomAction(context.guildId, actionId);
```

### 3. In any handler that modifies action content:
```javascript
// After saving changes:
const { afterModifyActionContent } = await import('./anchorMessageIntegration.js');
await afterModifyActionContent(context.guildId, actionId);
```

### 4. In the `add_coord_modal` submit handler:
```javascript
// After adding coordinate and saving:
const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
await afterAddCoordinate(context.guildId, actionId, newCoordinate);
```

## Benefits

1. **Centralized Updates** - All anchor updates go through one system
2. **Batching** - Multiple updates are grouped to avoid rate limits
3. **Automatic Retry** - Failed updates are retried automatically
4. **Debugging** - Comprehensive logging of all update operations
5. **Scalable** - Can handle large numbers of updates efficiently

## Usage

The system will automatically batch updates every 5 seconds unless `immediate: true` is specified. This prevents Discord rate limiting while ensuring timely updates.

You can monitor the queue status:
```javascript
import { getQueueStatus } from './anchorMessageManager.js';
const status = getQueueStatus();
console.log(`Queue status:`, status);
```