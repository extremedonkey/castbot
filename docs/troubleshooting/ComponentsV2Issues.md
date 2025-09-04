# Components V2 Issues & Solutions

## 📍 When to Use This Document

**Use this document when:**
- You're getting "This interaction failed" errors
- Components aren't displaying correctly  
- You need working code examples
- You're debugging UPDATE_MESSAGE issues
- You want to understand Container structure
- Discord responses are being rejected

**For high-level rules and mandates**: → See [CLAUDE.md](../../CLAUDE.md)

**Context**: This document captures critical technical lessons learned from implementing Safari Map Drops system, specifically related to Discord Components V2 compatibility issues.

## 🚨 Critical User Feedback

**Direct Quote**: "Stop. There is no reason you need to use regular discord components, these are a legacy / poor architecture"

**Key Requirement**: ALL Discord UI must use Components V2 patterns

## Common Issues & Solutions

### 1. String Select Menus Showing as Role Selects

**Symptom**: When implementing string select menus, they appear as role selection dropdowns instead

**Root Cause**: Using legacy Discord component type `6` instead of Components V2 type `3`

**Fix**:
```javascript
// ❌ WRONG - Legacy format
{
  type: 6, // String Select (legacy)
  custom_id: 'select_id',
  options: [...]
}

// ✅ CORRECT - Components V2 format
{
  type: 3, // String Select (Components V2)
  custom_id: 'select_id',
  options: [...]
}
```

**Files Fixed**: Multiple handlers in `app.js` including:
- `map_currency_style_` handler
- `map_currency_type_` handler
- `map_item_drop_select_` handler

### 2. Modal Responses Showing "Something went wrong"

**Symptom**: Modal submissions process successfully (logs show success) but Discord shows "Something went wrong" error

**Root Cause**: Using incorrect component types in modal response

**Fix**:
```javascript
// ❌ WRONG - Incorrect separator type
{ type: 13 } // Invalid separator type

// ✅ CORRECT - Components V2 separator
{ type: 14 } // Separator (Components V2)
```

**Critical Pattern**:
```javascript
return res.send({
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: {
    components: [{
      type: 17, // Container (always required for Components V2)
      components: [
        {
          type: 10, // Text Display (instead of content field)
          content: "Your message content"
        },
        { type: 14 }, // Separator (Components V2)
        {
          type: 1, // Action Row
          components: [/* buttons or selects */]
        }
      ]
    }],
    flags: (1 << 15), // IS_COMPONENTS_V2 (mandatory)
    ephemeral: true
  }
});
```

### 3. Container Duplication in UI

**Symptom**: When using select menus, each selection creates a new container instead of updating existing one

**Root Cause**: ButtonHandlerFactory not configured to update existing message

**Fix**: Add `updateMessage: true` to ButtonHandlerFactory configuration

```javascript
// ❌ WRONG - Creates new message
return ButtonHandlerFactory.create({
  id: 'handler_id',
  handler: async (context) => {
    return { components: [...] }; // Creates new message
  }
})(req, res, client);

// ✅ CORRECT - Updates existing message
return ButtonHandlerFactory.create({
  id: 'handler_id',
  updateMessage: true, // CRITICAL: Updates instead of creating new
  handler: async (context) => {
    return { components: [...] }; // Updates existing message
  }
})(req, res, client);
```

**Pattern Applied To**:
- `map_currency_style_` handler
- `map_currency_type_` handler  
- `map_drop_style_` handler
- `map_drop_type_` handler

### 4. Undefined `next` Reference Error

**Symptom**: `ReferenceError: next is not defined` in handler logs

**Root Cause**: Trying to use Express.js middleware patterns in Discord interaction handlers

**Fix**: Return interface directly instead of redirecting to another handler

```javascript
// ❌ WRONG - Express.js pattern doesn't work
req.body.data.custom_id = `map_add_currency_drop_${coord}`;
return req.app._router.handle(req, res, next); // next is undefined

// ✅ CORRECT - Return interface directly
return {
  components: [{
    type: 17, // Container
    components: [/* configuration interface */]
  }],
  flags: (1 << 15), // IS_COMPONENTS_V2
  ephemeral: true
};
```

### 5. Function Import Path Issues

**Symptom**: `updateMapCellAnchorMessage is not a function` errors

**Root Cause**: Incorrect function name in import statement

**Fix**: Use correct function names from modules

```javascript
// ❌ WRONG - Function name doesn't exist
const { updateMapCellAnchorMessage } = await import('./mapCellUpdater.js');

// ✅ CORRECT - Actual exported function name
const { updateAnchorMessage } = await import('./mapCellUpdater.js');
```

## Components V2 Requirements Checklist

### Mandatory Elements
- [ ] Use `type: 17` Container as wrapper
- [ ] Use `type: 10` Text Display instead of `content` field
- [ ] Use `type: 3` for String Select menus (not `type: 6`)
- [ ] Use `type: 14` for Separators (not `type: 13`)
- [ ] Include `flags: (1 << 15)` for IS_COMPONENTS_V2
- [ ] Never use `content` field with Components V2 flag

### ButtonHandlerFactory Patterns
- [ ] Add `updateMessage: true` for select menu handlers
- [ ] Use try-catch blocks with proper error logging
- [ ] Log start and success with consistent patterns:
  ```javascript
  console.log(`🔍 START: handler_name - user ${context.userId}`);
  // ... handler logic ...
  console.log(`✅ SUCCESS: handler_name - completed`);
  ```

### Error Handling
- [ ] Return user-friendly error messages
- [ ] Maintain `ephemeral: true` for admin interfaces
- [ ] Log detailed errors for debugging:
  ```javascript
  catch (error) {
    console.error(`❌ ERROR: handler_name - ${error.message}`);
    return {
      content: '❌ Error message for user.',
      ephemeral: true
    };
  }
  ```

## Working Examples

### Complete Working Select Menu Handler
```javascript
} else if (custom_id.startsWith('map_currency_style_')) {
  return ButtonHandlerFactory.create({
    id: 'map_currency_style',
    requiresPermission: PermissionFlagsBits.ManageRoles,
    permissionName: 'Manage Roles',
    updateMessage: true, // Prevents container duplication
    handler: async (context) => {
      try {
        console.log(`🔍 START: map_currency_style - user ${context.userId}`);
        
        const coord = context.customId.replace('map_currency_style_', '');
        const selectedStyle = parseInt(context.values[0]);
        
        // Update backend data
        const { loadSafariContent, saveSafariContent } = await import('./safariManager.js');
        const safariData = await loadSafariContent();
        const activeMapId = safariData[context.guildId]?.maps?.active;
        const coordData = safariData[context.guildId]?.maps?.[activeMapId]?.coordinates?.[coord];
        
        if (coordData?.currencyDrops?.[0]) {
          coordData.currencyDrops[0].buttonStyle = selectedStyle;
          await saveSafariContent(safariData);
          
          // Update anchor message
          const { updateAnchorMessage } = await import('./mapCellUpdater.js');
          await updateAnchorMessage(context.guildId, coord, client);
        }
        
        // Return updated interface (Components V2)
        const drop = coordData.currencyDrops[0];
        return {
          components: [{
            type: 17, // Container
            components: [
              {
                type: 10, // Text Display
                content: `# Configure Currency Drop\n\n**Location:** ${coord}\n**Amount:** ${drop.amount}`
              },
              { type: 14 }, // Separator
              {
                type: 1, // Action Row
                components: [{
                  type: 3, // String Select (Components V2)
                  custom_id: `map_currency_style_${coord}`,
                  placeholder: 'Select button style...',
                  options: [
                    { label: 'Primary (Blue)', value: '1', default: drop.buttonStyle === 1 },
                    { label: 'Secondary (Grey)', value: '2', default: drop.buttonStyle === 2 },
                    { label: 'Success (Green)', value: '3', default: drop.buttonStyle === 3 },
                    { label: 'Danger (Red)', value: '4', default: drop.buttonStyle === 4 }
                  ]
                }]
              }
            ]
          }],
          flags: (1 << 15), // IS_COMPONENTS_V2
          ephemeral: true
        };
        
        console.log(`✅ SUCCESS: map_currency_style - completed`);
      } catch (error) {
        console.error(`❌ ERROR: map_currency_style - ${error.message}`);
        return {
          content: '❌ Error updating currency style. Please try again.',
          ephemeral: true
        };
      }
    }
  })(req, res, client);
}
```

### Complete Working Modal Handler
```javascript
} else if (custom_id.startsWith('map_currency_drop_modal_')) {
  try {
    const guildId = req.body.guild_id;
    const coord = custom_id.replace('map_currency_drop_modal_', '');
    const components = req.body.data.components;
    
    console.log(`🪙 Processing currency drop modal for ${coord}`);
    
    // Extract modal values
    const amount = parseInt(components[0].components[0].value);
    const buttonText = components[1].components[0].value;
    const buttonEmoji = components[2].components[0].value || '🪙';
    
    // Validate and update data...
    
    // Update anchor message
    const { updateAnchorMessage } = await import('./mapCellUpdater.js');
    await updateAnchorMessage(guildId, coord, client);
    
    // Return Components V2 response
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        components: [{
          type: 17, // Container
          components: [
            {
              type: 10, // Text Display
              content: `# Configure Currency Drop\n\n**Location:** ${coord}`
            },
            { type: 14 }, // Separator (Components V2)
            // ... rest of interface
          ]
        }],
        flags: (1 << 15), // IS_COMPONENTS_V2
        ephemeral: true
      }
    });
  } catch (error) {
    console.error(`❌ ERROR: map_currency_drop_modal - ${error.message}`);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ Error configuring currency drop.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
}
```

### 6. Container Structure in Received Messages

**Symptom**: Handler receives message with 1 component but can't find expected buttons/components

**Root Cause**: Discord sends Components V2 messages WITH the Container wrapper (type 17) in message.components[0]

**Fix**: Check for Container wrapper and access components inside it

```javascript
// ❌ WRONG - Assumes direct action rows
const actionRow = messageComponents.find(row => row.type === 1);

// ✅ CORRECT - Handles Container wrapper
let actionRow;
if (messageComponents[0]?.type === 17) {
  // Components V2 Container - look inside for action rows
  const containerComponents = messageComponents[0].components || [];
  actionRow = containerComponents.find(row => row.type === 1);
} else {
  // Legacy format - direct action rows
  actionRow = messageComponents.find(row => row.type === 1);
}
```

**Critical Discovery**: 
- Discord SENDS Components V2 messages WITH Container wrapper
- For UPDATE_MESSAGE, you must RETURN the full Container structure
- ButtonHandlerFactory needs full message object in context

### 7. UPDATE_MESSAGE Response Structure

**Symptom**: Button updates work in logs but Discord shows "This interaction failed"

**Root Cause**: Not returning the complete Container structure for UPDATE_MESSAGE

**Fix**: Return the entire Container with updated components

```javascript
// ❌ WRONG - Only returns action rows
return {
  components: [updatedActionRow]
};

// ❌ WRONG - Using content with empty components for UPDATE_MESSAGE
return {
  content: 'Success message',
  components: []
};

// ✅ CORRECT - Returns full Container structure
if (messageComponents[0]?.type === 17) {
  // Update components in place
  actionRow.components = updatedButtons;
  return {
    components: messageComponents // Full Container with updates
  };
}

// ✅ CORRECT - For text-only UPDATE_MESSAGE responses
return {
  components: [{
    type: 17, // Container
    components: [
      {
        type: 10, // Text Display
        content: 'Your success or error message here'
      }
    ]
  }]
};
```

**Critical Rule for UPDATE_MESSAGE**:
- ALWAYS return Components V2 Container structure
- NEVER use plain `content` field with `components: []`
- For text-only responses, wrap content in Container > Text Display

**Pattern Applied To**:
- `restart_status_passed` handler
- `restart_status_failed` handler
- `nuke_player_data_confirm` handler
- `nuke_player_data_cancel` handler
- Any button that toggles states using UPDATE_MESSAGE

## Quick Reference

**Always Remember**:
1. **Components V2 is mandatory** - User explicitly stated this
2. **updateMessage: true** for select handlers to prevent duplication  
3. **Type 3 for selects**, Type 14 for separators, Type 17 for containers
4. **Never use content field** with Components V2 flag
5. **Comprehensive error logging** with consistent patterns
6. **Check working examples** like `safari_store_items_select` for reference
7. **Discord sends Container wrapper** - Check messageComponents[0].type === 17
8. **Return full Container for UPDATE_MESSAGE** - Not just action rows

**When in doubt**: Reference existing working Components V2 implementations in the codebase rather than creating new patterns.