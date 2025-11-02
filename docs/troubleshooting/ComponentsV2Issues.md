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
- `safari_round_results` handler (non-ephemeral results)
- `safari_global_stores` handler (store selection)
- Any button that toggles states using UPDATE_MESSAGE

### 8. Button Not Registered in BUTTON_REGISTRY

**Symptom**: "This interaction failed" error immediately when clicking button, logs show handler executing twice

**Root Cause**: Button not registered in BUTTON_REGISTRY causing ButtonHandlerFactory to not handle it properly

**Fix**: Add button to BUTTON_REGISTRY in buttonHandlerFactory.js

```javascript
// ❌ WRONG - Button not in registry
} else if (custom_id === 'safari_global_stores') {
  return ButtonHandlerFactory.create({
    // Handler executes twice, Discord rejects response
  });
}

// ✅ CORRECT - Add to BUTTON_REGISTRY first
// In buttonHandlerFactory.js:
'safari_global_stores': {
  label: 'Add Global Store',
  description: 'Select stores to appear in all player menus',
  emoji: '🏪',
  style: 'Secondary',
  category: 'safari'
}
```

**Critical Discovery**:
- ButtonHandlerFactory requires ALL buttons to be in BUTTON_REGISTRY
- Missing registration causes double execution and Discord errors
- Dynamic pattern buttons (with *) still need base pattern registered

### 9. Invalid Emoji Format in Data

**Symptom**: "This interaction failed" or Discord silently rejects responses with no error

**Root Cause**: Using text-based emoji shortcuts (:apple:) instead of proper Unicode or emoji objects

**Fix**: Convert all emojis to proper Unicode format

```javascript
// ❌ WRONG - Invalid emoji formats
{
  "emoji": ":apple:",  // Text shortcut format
  "emoji": ":worm:",   // Not valid for Discord
  "emoji": ":leaves:"  // Will cause silent failures
}

// ✅ CORRECT - Unicode emoji format
{
  "emoji": "🍎",  // Proper Unicode
  "emoji": "🪱",  // Direct emoji
  "emoji": "🍃"   // Will work correctly
}

// ✅ ALSO CORRECT - Discord emoji object
{
  "emoji": {
    "id": "1234567890",
    "name": "custom_emoji",
    "animated": false
  }
}
```

**Where to Check**:
- safariContent.json for store/item emojis
- Button definitions in handlers
- Any user-configurable emoji fields
- Imported data from external sources

### 10. Section Components Limited to Single Child

**Symptom**: "This interaction failed" when trying to use multiple Text Display components in a Section

**Root Cause**: Despite documentation claiming Sections support "1-3 child components", Discord only accepts ONE child component

**Fix**: Always use exactly ONE Text Display component in Section's components array

```javascript
// ❌ WRONG - Multiple Text Display components (docs say valid but Discord rejects)
{
  type: 9, // Section
  components: [
    { type: 10, content: "Text 1" },  // Discord rejects
    { type: 10, content: "Text 2" },  // multiple children
    { type: 10, content: "Text 3" }   // even though docs say 1-3 allowed
  ]
}

// ✅ CORRECT - Single Text Display component (all working examples use this)
{
  type: 9, // Section
  components: [
    { type: 10, content: "Combined text content here" }  // Exactly ONE child
  ],
  accessory: { /* optional button or thumbnail */ }
}
```

**Critical Discovery**:
- Documentation claims "One to three child components" but this appears incorrect
- ALL working Section examples in codebase use exactly ONE Text Display child
- Multiple children cause Discord to reject the response with "interaction failed"
- Confirmed via experimental testing in `castlist_test` button

### 11. Ephemeral Flag Not Working with Components V2

**Symptom**: Messages appear public (visible to everyone) even though handler has `ephemeral: true` in ButtonHandlerFactory config

**Root Cause**: Multiple issues causing ephemeral to fail:
1. ButtonHandlerFactory `ephemeral: true` config doesn't automatically add flag to response
2. Plain `{ content }` responses don't properly support ephemeral flag
3. Missing `InteractionResponseFlags.EPHEMERAL` in response flags

**Fix**: Always use full Components V2 Container format with explicit ephemeral flag

```javascript
// ❌ WRONG - Ephemeral config without flag in response
return ButtonHandlerFactory.create({
  id: 'my_button',
  ephemeral: true,  // This alone doesn't make it ephemeral!
  handler: async (context) => {
    return {
      flags: (1 << 15),  // Missing EPHEMERAL flag
      components: [container]
    };
  }
})(req, res, client);

// ❌ WRONG - Plain content without Components V2 Container
return {
  content: 'This message should be private'  // Won't be ephemeral
};

// ✅ CORRECT - Full Components V2 Container + Explicit Ephemeral Flag
return {
  flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,  // Both flags required
  components: [{
    type: 17, // Container
    accent_color: 0x5865f2,
    components: [
      {
        type: 10, // Text Display
        content: 'This message is now properly ephemeral'
      }
    ]
  }]
};
```

**Critical Discovery**:
- **ButtonHandlerFactory `ephemeral: true` is NOT sufficient** - it's a configuration hint, not automatic
- **Must explicitly add `InteractionResponseFlags.EPHEMERAL` to response flags**
- **Plain `{ content }` format doesn't properly support ephemeral** - must use full Container structure
- **Both flags required**: `(1 << 15) | InteractionResponseFlags.EPHEMERAL`
- Affected handlers: `safari_manage_currency`, `safari_currency_view_all`, `safari_currency_reset_all`

**Pattern Applied To**:
- Currency management interfaces
- Admin-only views that should be private
- Any response that should only be visible to the command user

### 12. Button Custom ID Pattern Conflicts

**Symptom**: Wrong handler executes, showing completely unrelated interface (e.g., "Configure Drops" instead of "Reset Currency")

**Root Cause**: Broad pattern matching with `startsWith()` accidentally captures more specific button IDs

**Critical Example**:
```javascript
// ❌ WRONG - Pattern conflict
} else if (custom_id.startsWith('safari_currency_reset_')) {
  // This handler was meant for: safari_currency_reset_buttonId_actionIndex
  // But it ALSO matches: safari_currency_reset_confirm
  // Result: Wrong handler executes!
}

// ✅ CORRECT - Exclude specific patterns
} else if (custom_id.startsWith('safari_currency_reset_') && custom_id !== 'safari_currency_reset_confirm') {
  // Now only matches: safari_currency_reset_buttonId_actionIndex
  // Excludes: safari_currency_reset_confirm (handled elsewhere)
}
```

**Fix**: Always exclude specific button IDs when using broad patterns

**Prevention Strategy**:
1. **Check for conflicts** when adding new pattern-based handlers
2. **Use more specific patterns** when possible (e.g., check for required underscores)
3. **Order handlers carefully** - put specific handlers BEFORE broad patterns
4. **Add exclusion conditions** for known conflicts
5. **Test button IDs** that might match multiple patterns

**Real-World Bug**:
- `safari_currency_reset_confirm` was matching `safari_currency_reset_` pattern
- Users clicking "Reset All Currency" → "Confirm" button saw "Configure Drops" interface
- Bug was subtle because both patterns seemed unrelated
- Fix required explicit exclusion: `custom_id !== 'safari_currency_reset_confirm'`

**Pattern Conflict Checklist**:
- [ ] Does your pattern overlap with existing handlers?
- [ ] Are there specific button IDs that should be excluded?
- [ ] Is your pattern handler before or after specific handlers in the chain?
- [ ] Have you tested button IDs that start with your pattern?

### 13. ButtonHandlerFactory Context for Select Values

**Symptom**: `TypeError: Cannot read properties of undefined (reading 'values')` when handling String Select in ButtonHandlerFactory

**Root Cause**: Incorrect property path for accessing select values in ButtonHandlerFactory context

**Critical Difference**:
```javascript
// ❌ WRONG - Direct handlers use data.values
} else if (custom_id === 'my_select') {
  const selectedValue = data.values[0];  // Works in direct handlers
}

// ❌ WRONG - ButtonHandlerFactory doesn't use context.data.values
return ButtonHandlerFactory.create({
  id: 'my_select',
  handler: async (context) => {
    const selectedValue = context.data.values[0];  // ❌ context.data is undefined!
  }
});

// ✅ CORRECT - ButtonHandlerFactory uses context.values directly
return ButtonHandlerFactory.create({
  id: 'my_select',
  handler: async (context) => {
    const selectedValue = context.values[0];  // ✅ Values directly on context
  }
});
```

**ButtonHandlerFactory Context Properties**:
- `context.guildId` - Guild ID
- `context.userId` - User ID
- `context.member` - Member object
- `context.client` - Discord client
- `context.values` - **String Select values array** (NOT context.data.values!)
- `context.customId` - Full custom ID string
- `context.message` - Original message (if updateMessage: true)

**Real-World Example** (dst_timezone_select handler):
```javascript
// Fixed implementation
handler: async (context) => {
  const selectedTimezoneId = context.values[0];  // ✅ Correct path
  console.log(`Selected: ${selectedTimezoneId}`);
}
```

### 14. ButtonHandlerFactory ephemeral vs updateMessage Confusion

**Symptom**: Handler with `ephemeral: true` shows "This interaction failed" and creates public messages instead of private

**Root Cause**: **CRITICAL MISUNDERSTANDING** - ButtonHandlerFactory has TWO different flags with different purposes:

1. **`ephemeral: true`** - For NEW messages (slash commands, initial responses)
2. **`updateMessage: true`** - For BUTTON CLICKS (updating existing messages)

**The Problem**: When you click a button, you want UPDATE_MESSAGE (type 7), NOT CHANNEL_MESSAGE_WITH_SOURCE (type 4).

**Critical Discovery from Production Bug**:
```javascript
// ❌ WRONG - Using ephemeral for button clicks
return ButtonHandlerFactory.create({
  id: 'prod_view_pronouns',
  ephemeral: true,  // This creates NEW message, not update!
  handler: async (context) => {
    return { content: 'Data here' };
  }
})(req, res, client);

// Result:
// - Creates NEW message (CHANNEL_MESSAGE_WITH_SOURCE)
// - Message is PUBLIC (ephemeral doesn't work for updates)
// - Slow (creating new vs updating existing)
// - "This interaction failed" (Discord rejects new message format)
```

**✅ CORRECT - Use updateMessage for button clicks**:
```javascript
return ButtonHandlerFactory.create({
  id: 'prod_view_pronouns',
  updateMessage: true,  // Updates existing message with button
  handler: async (context) => {
    return { content: 'Data here' };
  }
})(req, res, client);

// Result:
// - Updates existing message (UPDATE_MESSAGE)
// - Inherits ephemeral state from parent message
// - Fast (instant update)
// - Works perfectly
```

**When to Use Each Flag**:

| Scenario | Use | Reason |
|----------|-----|--------|
| **Button click** | `updateMessage: true` | Updates message containing button |
| **Select menu** | `updateMessage: true` | Updates message containing select |
| **Slash command** | `ephemeral: true` | Creates new private message |
| **New ephemeral message** | `ephemeral: true` | Initial response needs privacy |
| **Modal submission** | Neither (returns modal) | Different response type |

**ButtonHandlerFactory Behavior**:
```javascript
// WITHOUT updateMessage flag:
shouldUpdateMessage = config.updateMessage && !isModal;  // false
// Uses: CHANNEL_MESSAGE_WITH_SOURCE (type 4)
// Creates: NEW message
// ephemeral flag: Ignored for new messages from buttons

// WITH updateMessage: true:
shouldUpdateMessage = config.updateMessage && !isModal;  // true
// Uses: UPDATE_MESSAGE (type 7)
// Updates: Existing message
// ephemeral: Inherited from parent
```

**Why This Causes "This interaction failed"**:
1. Button click expects UPDATE_MESSAGE response
2. `ephemeral: true` without `updateMessage` creates NEW message (CHANNEL_MESSAGE_WITH_SOURCE)
3. Discord rejects because button clicks should update, not create
4. User sees "This interaction failed"

**The Fix - Production Examples**:
```javascript
// Fixed: prod_view_pronouns (View button)
return ButtonHandlerFactory.create({
  id: 'prod_view_pronouns',
  updateMessage: true,  // ✅ Button click
  handler: async (context) => { ... }
});

// Fixed: prod_edit_timezones (Edit button)
return ButtonHandlerFactory.create({
  id: 'prod_edit_timezones',
  updateMessage: true,  // ✅ Button click
  handler: async (context) => { ... }
});

// Fixed: prod_manage_pronouns_timezones (Management menu)
return ButtonHandlerFactory.create({
  id: 'prod_manage_pronouns_timezones',
  updateMessage: true,  // ✅ Button click from production menu
  handler: async (context) => { ... }
});
```

**Root Cause Analysis**:

**Why This Mistake Happened**:
1. **Misleading CLAUDE.md guidance** - Said `ephemeral: true // Optional` without clarifying it's for NEW messages only
2. **No clear rule** - Documentation didn't state "Button clicks = updateMessage: true"
3. **Pattern confusion** - Thought `ephemeral` would make button response private
4. **Factory abstraction** - Didn't realize Factory needs explicit `updateMessage` flag for UPDATE_MESSAGE
5. **No auto-detection** - Assumed Factory would auto-detect button clicks (it doesn't!)

**How to Prevent This**:
1. **ALWAYS use `updateMessage: true` for button clicks**
2. **ONLY use `ephemeral: true` for slash commands or new messages**
3. **Check logs** - "This interaction failed" = wrong response type
4. **Test immediately** - Button clicks should be instant (UPDATE_MESSAGE)
5. **Update CLAUDE.md** - Add clear rule about button clicks

**Updated Quick Reference**:
```javascript
// Button click pattern (most common):
ButtonHandlerFactory.create({
  id: 'my_button',
  updateMessage: true,  // MANDATORY for button clicks
  handler: async (context) => { ... }
})

// Slash command pattern:
ButtonHandlerFactory.create({
  id: 'my_command',
  ephemeral: true,  // For new private messages
  handler: async (context) => { ... }
})
```

**Performance Impact**:
- **UPDATE_MESSAGE**: ~50-150ms (instant)
- **NEW MESSAGE**: ~200-500ms (slow, creates new)

**Affected Handlers Fixed** (2025-11-02):
- `prod_manage_pronouns_timezones`
- `prod_view_pronouns`
- `prod_edit_pronouns`
- `prod_edit_timezones`
- `prod_add_timezone`

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
9. **Register all buttons in BUTTON_REGISTRY** - Even dynamic pattern handlers
10. **Use proper emoji formats** - Unicode or Discord objects, never :shortcut: format
11. **Sections support only ONE child component** - Despite docs claiming 1-3
12. **Ephemeral requires explicit flag** - `(1 << 15) | InteractionResponseFlags.EPHEMERAL` in response
13. **ButtonHandlerFactory ephemeral config is NOT automatic** - Must add flag to response
14. **Plain content doesn't support ephemeral** - Must use full Container structure
15. **Check for pattern conflicts** - `startsWith()` can match unintended button IDs
16. **ButtonHandlerFactory select values** - Use `context.values[0]` not `context.data.values[0]`

**Ephemeral Quick Pattern**:
```javascript
// ALWAYS use this format for ephemeral responses:
return {
  flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,
  components: [{ type: 17, components: [...] }]
};
```

**Pattern Matching Quick Check**:
```javascript
// ALWAYS exclude specific IDs from broad patterns:
if (custom_id.startsWith('pattern_') && custom_id !== 'pattern_specific') {
  // Your handler
}
```

**When in doubt**: Reference existing working Components V2 implementations in the codebase rather than creating new patterns.