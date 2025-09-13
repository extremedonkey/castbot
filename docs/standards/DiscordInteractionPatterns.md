# Discord Interaction Patterns

## Overview

This document provides patterns and best practices for Discord interactions, including common pitfalls and solutions discovered through real-world implementation.

## 🚨 Critical Lessons from Custom Actions Sprint

### The Problem
- **Request**: "Enhance coordinate-specific location editing... like the stores field group"
- **Mistake**: Built complex Entity Edit Framework UI instead of simple select menu
- **Result**: Persistent "This interaction failed" errors with no clear cause

### Root Causes
1. **Over-engineering**: Ignored "like stores" pattern reference
2. **Flag Incompatibility**: UPDATE_MESSAGE has undocumented flag restrictions
3. **Emoji Validation**: Malformed emojis (trailing joiners) cause client-side rejection

### The Solution
```javascript
// ❌ What we built (complex, failed)
return {
  components: [{
    type: 17, // Container with sections, buttons, etc.
    components: [/* Complex UI with 6+ components */]
  }]
};

// ✅ What was needed (simple, works)
return {
  components: [{
    type: 17, // Container
    components: [
      { type: 10, content: "Select an option" },
      { type: 14 }, // Separator
      selectRow.toJSON() // Just a select menu
    ]
  }]
};
```

## Decision Tree: Which Pattern to Use?

```
Start Here
    |
    v
Is user referencing an existing pattern?
    |
    ├─ YES → STOP! Examine that exact pattern first
    |         grep -B20 -A20 "pattern_name" app.js
    |
    └─ NO → Continue
            |
            v
        How many UI elements needed?
            |
            ├─ 1-3 → Use simple pattern
            ├─ 4-10 → Consider Entity Framework
            └─ 10+ → Split into multiple interactions
```

## Common Patterns

### 1. Simple Select Menu (like stores)
```javascript
// For field groups that need item selection
if (fieldGroup === 'stores') {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_${id}`)
    .setPlaceholder("Select items...")
    .addOptions(options);
    
  return {
    flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,
    components: [{
      type: 17, // Container
      components: [
        { type: 10, content: "## Title" },
        { type: 14 }, // Separator
        new ActionRowBuilder().addComponents(selectMenu).toJSON()
      ]
    }]
  };
}
```

### 2. Entity Edit Framework
Use ONLY when you need:
- Multiple field groups
- Complex validation
- State persistence
- Back/save navigation

```javascript
// Check if Entity Framework is appropriate
const useEntityFramework = 
  numberOfFields > 5 &&
  requiresValidation &&
  hasMultipleSteps &&
  !userSaidLikeSimplePattern;
```

### 3. UPDATE_MESSAGE Responses
```javascript
// ❌ NEVER include flags in UPDATE_MESSAGE
return res.send({
  type: InteractionResponseType.UPDATE_MESSAGE,
  data: {
    flags: flags, // THIS WILL FAIL
    components: [...]
  }
});

// ✅ ButtonHandlerFactory pattern (it strips flags)
return {
  flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,
  components: [...] 
}; // Factory handles the conversion
```

## Debugging "This interaction failed"

### Immediate Failures (no server logs)
1. **Check emojis**: Look for trailing `\u200D` in JSON
2. **Check UPDATE_MESSAGE**: Remove all flags
3. **Check component count**: Max 5 buttons per row
4. **Use Discord.js builders**: They validate structure

### Delayed Failures (3s timeout)
1. Handler didn't respond
2. Check for `deferred: true` in factory config
3. Look for unhandled promises

### Testing Protocol
```bash
# 1. Test with minimal UI first
echo "Start with 1 button, 1 text"

# 2. Add components incrementally
echo "Add one component at a time"

# 3. Check logs at each step
npm run logs-dev | grep "interaction failed" -B10

# 4. Use Discord.js builders for validation
echo "Builders catch structure errors early"
```

## Best Practices

### 1. Start Simple
```javascript
// Phase 1: Get it working
const simple = { components: [selectMenu] };

// Phase 2: Add features if needed
const enhanced = { components: [container] };

// Phase 3: Only use framework if truly complex
const complex = await createEntityManagementUI(...);
```

### 2. Pattern Matching
When user says "like X":
1. Find X implementation
2. Copy X exactly
3. Test that it works
4. Only then modify if needed

### 3. Emoji Safety
```javascript
// Always sanitize user-provided emojis
const safeEmoji = emoji
  .replace(/[\u200D\uFE0F]+$/g, '') // Remove trailing joiners
  .trim();
  
// Or skip emojis in select options entirely
if (problematicContext) {
  delete option.emoji;
}
```

## Common Pitfall Fixes

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Immediate "interaction failed" | UPDATE_MESSAGE + flags | Remove flags from response |
| Works in dev, fails in prod | Emoji encoding issues | Sanitize or remove emojis |
| Complex UI rejected | Too many components | Simplify to basic pattern |
| Select menu fails | Invalid options | Use Discord.js builders |

## References

- [ComponentsV2.md](ComponentsV2.md) - Component structure
- [ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md) - Response handling
- [EntityEditFramework.md](../enablers/EntityEditFramework.md) - When to use complex UI