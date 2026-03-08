# 0953 — Convert Outcome List to String Select Pattern

**Date**: 2026-03-08
**Status**: Ready to implement
**Related**: [0956 Action Terminology](0956_20260308_ActionTerminology_Analysis.md), [SafariCustomActions.md](../03-features/SafariCustomActions.md)

## Original Context

The Action Editor UI shows outcomes (the steps an Action executes) as individual rows with TextDisplay + ActionRow(buttons). Each outcome costs **4 components** but only provides 2 handlers. The Season Planner proved a String Select pattern that costs **2 components** per row with up to 25 handlers. Converting outcomes to this pattern doubles the max outcome count from 5 to 10.

## ELI5: What Changes and Why

### The Current Pattern (4 components per outcome)

Right now, each outcome in the editor looks like this in Discord:

```
┌──────────────────────────────────────────────────┐
│ 1. Calculate Results All Players                  │  ← TextDisplay (component #1)
│ [⬆️] [📝 Edit]                                    │  ← ActionRow (#2) + 2 Buttons (#3, #4)
├──────────────────────────────────────────────────┤
│ 2. Give Item Nurturer x1 (once per player)       │  ← TextDisplay (#5)
│ [⬆️] [📝 Edit]                                    │  ← ActionRow (#6) + 2 Buttons (#7, #8)
└──────────────────────────────────────────────────┘
= 8 components for 2 outcomes (4 each)
```

The code that builds this is `getActionListComponents()` in `customActionUI.js` (line ~766). It loops through outcomes and pushes a TextDisplay + ActionRow per outcome.

### The New Pattern (2 components per outcome)

Each outcome becomes a String Select. The select **looks like** a read-only summary line (because option 1 has `default: true`), but clicking it opens a dropdown with actions:

```
┌──────────────────────────────────────────────────┐
│ ▫️  1. Calculate Results All Players        [▼]   │  ← ActionRow (#1) + StringSelect (#2)
├──────────────────────────────────────────────────┤
│ When you click it, a dropdown opens:             │
│  ✏️  Edit Outcome                                │
│  ⬆️  Move Up                                     │
│  ⬇️  Move Down                                   │
│  ───────────────────                             │
│  🔴  Move to Fail Outcomes                       │
│  🗑️  Delete Outcome                              │
└──────────────────────────────────────────────────┘
= 2 components for 1 outcome
```

### Where Does the Summary Text Come From?

The function `getActionSummary()` (customActionUI.js line ~843) already generates summary text like:
- `**\`1. Calculate Results\`** All Players`
- `**\`2. Give Item\`** Nurturer x1 (once per player)`

This text currently goes into a TextDisplay. In the new pattern, it goes into the String Select's **default option label** instead — stripped of markdown formatting (select labels don't support markdown). The same function, just a different destination.

**Worked example:**

```javascript
// CURRENT: getActionListComponents() builds this per outcome
components.push({
  type: 10, // TextDisplay
  content: getActionSummary(action, index + 1, guildItems, guildButtons)
  // → "**`1. Calculate Results`** All Players"
});
components.push({
  type: 1, // ActionRow
  components: [
    { type: 2, custom_id: `custom_action_up_${actionId}_${actualIndex}`, emoji: { name: '⬆️' }, ... },
    { type: 2, custom_id: `safari_edit_action_${actionId}_${actualIndex}`, label: 'Edit', ... }
  ]
});
// = 4 components, 2 handlers

// NEW: getActionListComponents() builds this instead
components.push({
  type: 1, // ActionRow
  components: [{
    type: 3, // StringSelect
    custom_id: `outcome_select_${actionId}_${actualIndex}`,
    options: [
      // Option 1: summary (default-selected = what user SEES as the "row")
      { label: '1. Calculate Results All Players', value: 'summary', default: true, emoji: { name: '▫️' } },
      // Option 2-3: primary actions
      { label: 'Edit Outcome', value: 'edit', emoji: { name: '✏️' }, description: 'Configure settings' },
      { label: 'Move Up', value: 'move_up', emoji: { name: '⬆️' }, description: 'Change execution order' },
      { label: 'Move Down', value: 'move_down', emoji: { name: '⬇️' }, description: 'Change execution order' },
      // Option 4: divider
      { label: '───────────────────', value: 'divider', description: ' ' },
      // Option 5-6: structural actions
      { label: 'Move to Fail Outcomes', value: 'toggle_section', emoji: { name: '🔴' }, description: 'Runs on fail instead' },
      { label: 'Delete Outcome', value: 'delete', emoji: { name: '🗑️' }, description: 'Remove from action' }
    ]
  }]
});
// = 2 components, 5 handlers (edit, move_up, move_down, toggle_section, delete)
```

### Summary Text for Select Labels

`getActionSummary()` returns markdown-formatted strings. For select labels, we need a **plain text** version. Create a new function `getActionSummaryPlain()` or add a `plain: true` parameter:

```javascript
// Current (markdown):  **`1. Calculate Results`** All Players
// Needed (plain):      1. Calculate Results All Players
```

**Max label length: 100 characters (Discord limit).** Some outcome types include user-defined content (Display Text titles, item names, action names) which can be any length. **`getActionSummaryPlain()` MUST always truncate the final string to 100 chars.** Apply a guard at the end, after all case logic:

```javascript
const MAX_SELECT_LABEL = 100;
function getActionSummaryPlain(action, number, guildItems, guildButtons) {
  let summary;
  switch (action.type) {
    // ... build summary string per type ...
  }
  // ALWAYS truncate — user-defined content can be any length
  if (summary.length > MAX_SELECT_LABEL) {
    summary = summary.substring(0, MAX_SELECT_LABEL - 1) + '…';
  }
  return summary;
}
```

Typical lengths are 35-62 chars, but the truncation guard is mandatory to prevent Discord API errors.

---

## Component Budget Analysis

### Fixed Overhead (Action Editor)

| Component | Type | Count |
|-----------|------|-------|
| Container | 17 | 1 |
| Header TextDisplay | 10 | 1 |
| Action Info ActionRow + Button | 1+2 | 2 |
| Triggers Section + accessory | 9+2 | 2 |
| Locations Section + accessory | 9+2 | 2 |
| Conditions Section + accessory | 9+2 | 2 |
| Pass divider | 14 | 1 |
| Pass header TextDisplay | 10 | 1 |
| Pass "Add Outcome" select (ActionRow + StringSelect) | 1+3 | 2 |
| Fail divider | 14 | 1 |
| Fail header TextDisplay | 10 | 1 |
| Fail "Add Outcome" select (ActionRow + StringSelect) | 1+3 | 2 |
| Delete ActionRow + Button | 1+2 | 2 |
| **Total fixed (not at max)** | | **20** |
| **Total fixed (at max, no add selects)** | | **16** |

### Capacity

| Scenario | Fixed | Per Outcome | Max Outcomes | Current Max |
|----------|-------|------------|-------------|------------|
| Not at max (both add selects visible) | 20 | 2 | **(40-20)/2 = 10** | 5 |
| At max (add selects hidden) | 16 | 2 | **(40-16)/2 = 12** | 5 |

**Recommendation**: Set `MAX_ACTIONS_PER_BUTTON` to **10** (from 5). This gives room for both add selects (20 + 20 = 40). At max capacity with no add selects, we'd be at 16 + 20 = 36/40.

Update in `config/safariLimits.js`:
```javascript
MAX_ACTIONS_PER_BUTTON: 10,  // Was 5 — doubled by String Select pattern
```

---

## Implementation Plan

### Step 1: Create `getActionSummaryPlain()` (customActionUI.js)

Add a plain-text version of the summary for select labels. Can be a wrapper:

```javascript
function getActionSummaryPlain(action, number, guildItems = {}, guildButtons = {}) {
  // Reuse existing logic but return plain text (no markdown ** or `)
  // Keep it under 100 chars for Discord select label limit
  switch (action.type) {
    case 'display_text':
      const text = action.config?.title || action.config?.content || action.text || 'No text configured';
      const truncated = text.substring(0, 50) + (text.length > 50 ? '...' : '');
      return `${number}. Display Text ${truncated}`;
    case 'give_item':
      const itemName = guildItems[action.config?.itemId]?.name || 'Unknown Item';
      const qty = action.config?.quantity || 1;
      const op = action.config?.operation === 'remove' ? 'Remove Item' : 'Give Item';
      const limit = action.config?.limit?.type ? ` (${action.config.limit.type.replace(/_/g, ' ')})` : '';
      return `${number}. ${op} ${itemName} x${qty}${limit}`;
    // ... same patterns for all types, just no markdown
  }
}
```

### Step 2: Rewrite `getActionListComponents()` (customActionUI.js, line ~766)

Replace the current TextDisplay + ActionRow pattern with String Select pattern:

```javascript
function getActionListComponents(actions, actionId, guildItems = {}, guildButtons = {}, executeOn = 'true', allActions = null) {
  if (!actions || actions.length === 0) return [];

  return actions.map((action, index) => {
    const actualIndex = allActions ? allActions.findIndex(a => a === action) : index;
    const isFirst = actualIndex === 0;
    const isLast = actualIndex === (allActions ? allActions.length - 1 : actions.length - 1);
    const summaryText = getActionSummaryPlain(action, index + 1, guildItems, guildButtons);

    // Toggle section label depends on current executeOn
    const currentExecuteOn = action.executeOn || 'true';
    const toggleLabel = currentExecuteOn === 'true' ? 'Move to Fail Outcomes' : 'Move to Pass Outcomes';
    const toggleEmoji = currentExecuteOn === 'true' ? '🔴' : '🟢';
    const toggleDesc = currentExecuteOn === 'true' ? 'Runs on fail instead' : 'Runs on pass instead';

    return {
      type: 1, // ActionRow
      components: [{
        type: 3, // StringSelect
        custom_id: `outcome_select_${actionId}_${actualIndex}`,
        options: [
          { label: summaryText, value: 'summary', default: true, emoji: { name: '▫️' } },
          { label: 'Edit Outcome', value: 'edit', emoji: { name: '✏️' }, description: 'Configure settings' },
          { label: 'Move Up', value: 'move_up', emoji: { name: '⬆️' }, description: 'Change execution order', ...( isFirst && { description: 'Already at top' }) },
          { label: 'Move Down', value: 'move_down', emoji: { name: '⬇️' }, description: 'Change execution order', ...(isLast && { description: 'Already at bottom' }) },
          { label: '───────────────────', value: 'divider', description: ' ' },
          { label: toggleLabel, value: 'toggle_section', emoji: { name: toggleEmoji }, description: toggleDesc },
          { label: 'Delete Outcome', value: 'delete', emoji: { name: '🗑️' }, description: 'Remove from action' }
        ]
      }]
    };
  });
}
```

### Step 3: Create unified handler in app.js

Single handler for all outcome select actions:

```javascript
} else if (custom_id.startsWith('outcome_select_')) {
  return ButtonHandlerFactory.create({
    id: 'outcome_select',
    updateMessage: true,
    handler: async (context) => {
      const selectedValue = req.body.data.values[0];
      // Parse actionId and actionIndex from custom_id
      // Format: outcome_select_{actionId}_{actionIndex}
      const withoutPrefix = context.customId.replace('outcome_select_', '');
      const lastUnderscore = withoutPrefix.lastIndexOf('_');
      const actionId = withoutPrefix.substring(0, lastUnderscore);
      const actionIndex = parseInt(withoutPrefix.substring(lastUnderscore + 1));

      // Ignore no-op selections
      if (selectedValue === 'summary' || selectedValue === 'divider') {
        // Return the same editor UI (re-render)
        const { createCustomActionEditorUI } = await import('./customActionUI.js');
        return await createCustomActionEditorUI({ guildId: context.guildId, actionId });
      }

      const { loadSafariContent, saveSafariContent } = await import('./safariManager.js');
      const safariData = await loadSafariContent();
      const button = safariData[context.guildId]?.buttons?.[actionId];

      if (!button || !button.actions[actionIndex]) {
        return { content: '❌ Outcome not found.' };
      }

      switch (selectedValue) {
        case 'edit':
          // Delegate to existing safari_edit_action logic
          // ... (reuse existing edit handler code)
          break;

        case 'move_up':
          if (actionIndex > 0) {
            [button.actions[actionIndex], button.actions[actionIndex - 1]] =
              [button.actions[actionIndex - 1], button.actions[actionIndex]];
            await saveSafariContent(safariData);
          }
          break;

        case 'move_down':
          if (actionIndex < button.actions.length - 1) {
            [button.actions[actionIndex], button.actions[actionIndex + 1]] =
              [button.actions[actionIndex + 1], button.actions[actionIndex]];
            await saveSafariContent(safariData);
          }
          break;

        case 'toggle_section':
          const current = button.actions[actionIndex].executeOn || 'true';
          button.actions[actionIndex].executeOn = current === 'true' ? 'false' : 'true';
          await saveSafariContent(safariData);
          break;

        case 'delete':
          button.actions.splice(actionIndex, 1);
          await saveSafariContent(safariData);
          break;
      }

      // Re-render the action editor
      const { createCustomActionEditorUI } = await import('./customActionUI.js');
      return await createCustomActionEditorUI({ guildId: context.guildId, actionId });
    }
  })(req, res, client);
}
```

### Step 4: Register in BUTTON_REGISTRY (buttonHandlerFactory.js)

```javascript
'outcome_select_*': {
  label: 'Outcome Actions',
  description: 'String select per outcome — edit, reorder, toggle pass/fail, delete',
  emoji: '▫️',
  style: 'Secondary',
  category: 'safari_management',
  type: 'select_menu'
},
```

### Step 5: Update MAX_ACTIONS_PER_BUTTON (config/safariLimits.js)

```javascript
MAX_ACTIONS_PER_BUTTON: 10,  // Was 5 — doubled by String Select pattern
```

### Step 6: Clean up old handlers

The following button handlers become unused after migration:
- `custom_action_up_*` — Move Up (now in select)
- `safari_edit_action_*` — Edit (now in select, but keep the handler since `edit` value delegates to it)
- `safari_remove_action_*` — Delete (now in select)

**Don't delete these handlers yet** — they may still be referenced from other entry points (e.g., the individual outcome config screens have Back buttons). Mark them as legacy candidates.

### Step 7: Update component budget comments (customActionUI.js)

Update `calculateMaxCustomActionEditorComponents()` to reflect the new 2-per-outcome pattern.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `getActionSummaryPlain()` exceeds 100 chars | Very Low | All current summaries max ~62 chars. Add truncation guard. |
| `summary` or `divider` value selected | Expected | Handler ignores these and re-renders the editor |
| Old button handlers called from other UIs | Medium | Keep old handlers alive, just unused from the editor list |
| Move Up/Down at boundaries | Low | Already handled — first item can't move up, last can't move down |
| Component count regression | Low | Validate with `countComponents()` after building |

## Files to Modify

| File | Changes |
|------|---------|
| `customActionUI.js` | Add `getActionSummaryPlain()`, rewrite `getActionListComponents()`, update component budget comments |
| `app.js` | Add `outcome_select_*` handler, keep old handlers as fallbacks |
| `buttonHandlerFactory.js` | Add `outcome_select_*` to BUTTON_REGISTRY |
| `config/safariLimits.js` | Update `MAX_ACTIONS_PER_BUTTON: 10` |

## Testing Checklist

- [ ] Action editor renders with String Select per outcome
- [ ] Clicking summary/divider re-renders (no-op)
- [ ] Edit opens the correct outcome config
- [ ] Move Up works (first item disabled/no-op)
- [ ] Move Down works (last item disabled/no-op)
- [ ] Toggle section flips executeOn and moves outcome between Pass/Fail
- [ ] Delete removes outcome
- [ ] Add Pass Outcome select creates with `executeOn: 'true'`
- [ ] Add Fail Outcome select creates with `executeOn: 'false'`
- [ ] Component count stays within 40 at 10 outcomes
- [ ] Old handlers still work from other entry points (outcome config Back buttons)
