# Centralized Back Button Factory

**Status**: 🔴 **Not Implemented** - Design Complete, Implementation Pending
**Priority**: High - Prevents navigation bugs during menu restructures
**Created**: 2025-10-19
**Author**: Claude Code (Sonnet 4.5)

---

## Problem Statement

### Current State (Broken)

Back button creation is **duplicated across 5+ files** with **inconsistent patterns**:

```javascript
// app.js (170+ occurrences)
const backButton = new ButtonBuilder()
  .setCustomId('prod_safari_menu')
  .setLabel('← Safari')
  .setEmoji('🦁');

// storeSelector.js (1 occurrence, parameterized)
const backButton = new ButtonBuilder()
  .setCustomId(backButtonId)
  .setLabel(backButtonLabel)
  .setStyle(ButtonStyle.Secondary);
if (backButtonEmoji) {
  backButton.setEmoji(backButtonEmoji);
}

// safariMapAdmin.js (1 occurrence, hardcoded)
{
  type: 2,
  custom_id: 'prod_menu_back',
  label: '← Menu',
  style: 2
}

// entityManagementUI.js (1 occurrence, hardcoded)
{
  type: 2,
  style: 2,
  label: '← Menu',
  custom_id: 'prod_menu_back'
}
```

### The Pain

**Recent Example (2025-10-19)**: Menu restructure moved Safari features to Production Menu
- ✅ Updated 2 back buttons in app.js manually
- ❌ **Missed** entityManagementUI.js back button → broke Items navigation
- ❌ Created null emoji bug in storeSelector.js
- 🕐 **30 minutes debugging** what should have been a **1-line change**

**Root Cause**: No single source of truth for back button configuration

---

## Solution: Centralized Factory Pattern

### Design Principles

1. **Single Source of Truth**: All back button configuration in one place
2. **Type Safety**: Returns properly typed ButtonBuilder instances
3. **Fail Fast**: Throws error for unknown menu targets (catch typos early)
4. **Zero Breaking Changes**: Works alongside existing code during migration
5. **Self-Documenting**: Menu hierarchy visible in the configuration map

### Implementation

**File**: `/src/ui/backButtonFactory.js` (new file)

```javascript
/**
 * Centralized Back Button Factory
 * Single source of truth for all back button navigation configuration
 *
 * USAGE:
 *   import { createBackButton } from './src/ui/backButtonFactory.js';
 *   const backButton = createBackButton('prod_menu_back');
 *
 * MIGRATION STATUS:
 *   - [ ] app.js menu builders (170+ instances)
 *   - [ ] storeSelector.js (1 instance)
 *   - [ ] safariMapAdmin.js (1 instance)
 *   - [ ] entityManagementUI.js (1 instance)
 *   - [ ] mapExplorer.js (check for instances)
 *   - [ ] safariConfigUI.js (check for instances)
 */

import { ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Back Button Configuration Registry
 * Maps button custom_id to display properties
 *
 * HIERARCHY:
 *   Production Menu (root)
 *   ├─ Submenus → use 'prod_menu_back'
 *   │  ├─ Currency Menu
 *   │  ├─ Rounds Menu
 *   │  ├─ Stores Menu
 *   │  ├─ Items Menu
 *   │  ├─ Player Admin Menu
 *   │  └─ Tools Menu
 *   │
 *   └─ Safari Menu → use 'prod_safari_menu' (feature-level)
 *      └─ Safari submenus → use 'prod_safari_menu'
 */
const BACK_BUTTON_CONFIG = {
  // Main Menu Navigation (most common)
  'prod_menu_back': {
    label: '← Menu',
    emoji: null,  // NO emoji for main menu (LEAN standard)
    description: 'Return to Production Menu'
  },

  // Feature Menu Navigation (secondary level)
  'prod_safari_menu': {
    label: '← Safari',
    emoji: '🦁',
    description: 'Return to Safari advanced configuration menu'
  },

  'reece_stuff_menu': {
    label: '← Analytics',
    emoji: '🧮',
    description: 'Return to Analytics menu (Reece only)'
  },

  'prod_setup': {
    label: '← Tools',
    emoji: '🪛',
    description: 'Return to Tools menu'
  },

  // Player-facing navigation
  'prod_player_menu': {
    label: '← Player Menu',
    emoji: '🪪',
    description: 'Return to Player Menu'
  },

  // Legacy/Deprecated (mark for cleanup)
  'safari_menu': {
    label: '← Safari',
    emoji: '🦁',
    deprecated: true,
    useInstead: 'prod_safari_menu',
    description: 'DEPRECATED: Use prod_safari_menu instead'
  }
};

/**
 * Create a standardized back button
 *
 * @param {string} targetId - Custom ID of the target menu button
 * @returns {ButtonBuilder} Configured back button
 * @throws {Error} If targetId is not in BACK_BUTTON_CONFIG
 *
 * @example
 * // Simple usage
 * const backButton = createBackButton('prod_menu_back');
 *
 * // In ActionRow
 * const backRow = new ActionRowBuilder()
 *   .addComponents(createBackButton('prod_menu_back'));
 *
 * // Components V2 (raw JSON)
 * const backButton = createBackButton('prod_menu_back').toJSON();
 */
export function createBackButton(targetId) {
  // Validate target exists
  const config = BACK_BUTTON_CONFIG[targetId];

  if (!config) {
    throw new Error(
      `Unknown back button target: "${targetId}"\n` +
      `Valid targets: ${Object.keys(BACK_BUTTON_CONFIG).join(', ')}\n` +
      `Did you mean to use 'prod_menu_back'?`
    );
  }

  // Warn about deprecated targets
  if (config.deprecated) {
    console.warn(
      `⚠️ DEPRECATED: Back button target "${targetId}" is deprecated.\n` +
      `   Use "${config.useInstead}" instead.`
    );
  }

  // Build button
  const button = new ButtonBuilder()
    .setCustomId(targetId)
    .setLabel(config.label)
    .setStyle(ButtonStyle.Secondary);

  // Only set emoji if provided (ButtonBuilder.setEmoji() doesn't accept null)
  if (config.emoji) {
    button.setEmoji(config.emoji);
  }

  return button;
}

/**
 * Create back button for Components V2 raw JSON format
 * Used in files that build raw component structures
 *
 * @param {string} targetId - Custom ID of the target menu button
 * @returns {Object} Raw button component (type: 2)
 * @throws {Error} If targetId is not in BACK_BUTTON_CONFIG
 *
 * @example
 * const backButton = createBackButtonV2('prod_menu_back');
 * // Returns: { type: 2, custom_id: 'prod_menu_back', label: '← Menu', style: 2 }
 */
export function createBackButtonV2(targetId) {
  const config = BACK_BUTTON_CONFIG[targetId];

  if (!config) {
    throw new Error(
      `Unknown back button target: "${targetId}"\n` +
      `Valid targets: ${Object.keys(BACK_BUTTON_CONFIG).join(', ')}`
    );
  }

  if (config.deprecated) {
    console.warn(
      `⚠️ DEPRECATED: Back button target "${targetId}" is deprecated.\n` +
      `   Use "${config.useInstead}" instead.`
    );
  }

  const button = {
    type: 2, // Button
    custom_id: targetId,
    label: config.label,
    style: 2 // Secondary (grey)
  };

  // Only add emoji if provided
  if (config.emoji) {
    button.emoji = { name: config.emoji };
  }

  return button;
}

/**
 * Get all registered back button targets
 * Useful for documentation and validation
 *
 * @returns {Array<string>} List of valid target IDs
 */
export function getValidBackButtonTargets() {
  return Object.keys(BACK_BUTTON_CONFIG)
    .filter(key => !BACK_BUTTON_CONFIG[key].deprecated);
}

/**
 * Validate a back button target without creating the button
 *
 * @param {string} targetId - Custom ID to validate
 * @returns {boolean} True if valid target
 */
export function isValidBackButtonTarget(targetId) {
  return BACK_BUTTON_CONFIG.hasOwnProperty(targetId);
}

/**
 * Get menu hierarchy for documentation
 * Shows which menus navigate where
 *
 * @returns {Object} Hierarchy structure
 */
export function getMenuHierarchy() {
  return {
    root: 'Production Menu',
    targets: Object.entries(BACK_BUTTON_CONFIG)
      .filter(([_, config]) => !config.deprecated)
      .map(([id, config]) => ({
        id,
        label: config.label,
        emoji: config.emoji,
        description: config.description
      }))
  };
}
```

---

## Migration Strategy

### Phase 1: Deploy Factory (Week 1) ✅
**Goal**: Make factory available without breaking existing code

1. ✅ Create `/src/ui/backButtonFactory.js`
2. ✅ Add unit tests (optional but recommended)
3. ✅ Deploy to production (no breaking changes)

### Phase 2: Migrate High-Traffic Paths (Week 2)
**Goal**: Fix most common navigation bugs

**Priority Order** (by frequency of changes):
1. **app.js menu builders** (~170 instances)
   - Production Menu back buttons
   - Safari Menu back buttons
   - Submenu back buttons (Currency, Rounds, Stores, etc.)

2. **External UI builders** (~4 instances)
   - entityManagementUI.js (Items, Entities)
   - safariMapAdmin.js (Player Admin)
   - storeSelector.js (Stores)
   - mapExplorer.js (Map navigation)

**Migration Pattern**:
```javascript
// BEFORE
const backButton = new ButtonBuilder()
  .setCustomId('prod_menu_back')
  .setLabel('← Menu')
  .setStyle(ButtonStyle.Secondary);

// AFTER
import { createBackButton } from './src/ui/backButtonFactory.js';
const backButton = createBackButton('prod_menu_back');
```

**Components V2 Pattern**:
```javascript
// BEFORE
{
  type: 2,
  custom_id: 'prod_menu_back',
  label: '← Menu',
  style: 2
}

// AFTER
import { createBackButtonV2 } from './src/ui/backButtonFactory.js';
const backButton = createBackButtonV2('prod_menu_back');
```

### Phase 3: Cleanup & Validation (Week 3)
**Goal**: Ensure 100% migration

1. **Search for stragglers**:
   ```bash
   # Find unmigrated back buttons
   grep -rn "setLabel.*←" --include="*.js" . | grep -v "backButtonFactory"
   grep -rn "label.*←.*Menu" --include="*.js" . | grep -v "backButtonFactory"
   ```

2. **Add to dev-restart.sh validation** (optional):
   ```bash
   # Warn about direct back button construction
   if grep -q "setLabel.*'← Menu'" app.js 2>/dev/null; then
     echo "⚠️  WARNING: Found direct back button construction"
     echo "   Consider using createBackButton() from backButtonFactory.js"
   fi
   ```

3. **Update MenuHierarchy.md** - mark factory as implemented

---

## Benefits Analysis

### Before Factory
```javascript
// To change "← Menu" to "⬅️ Main Menu" across all menus:
// 1. Grep for all occurrences (170+ files)
// 2. Manually update each one
// 3. Hope you didn't miss any
// 4. Test every menu
// Time: 2-3 hours + bug fixes
```

### After Factory
```javascript
// To change "← Menu" to "⬅️ Main Menu" across all menus:
// 1. Update BACK_BUTTON_CONFIG['prod_menu_back'].label
// Time: 30 seconds
```

### Real-World Impact

**2025-10-19 Menu Restructure** (actual incident):
- ❌ Without factory: 30 minutes debugging + 1 broken menu
- ✅ With factory: 0 bugs (config auto-updates all instances)

**Future Scenarios**:
- Adding new submenu → 1 line in config, all back buttons work
- Changing LEAN standards → Update config once, applies everywhere
- Renaming menu → Update config, no grep needed

---

## Testing Strategy

### Unit Tests (Optional)
```javascript
// tests/backButtonFactory.test.js
import { createBackButton, createBackButtonV2 } from '../src/ui/backButtonFactory.js';

describe('Back Button Factory', () => {
  test('creates prod_menu_back button correctly', () => {
    const button = createBackButton('prod_menu_back');
    expect(button.data.custom_id).toBe('prod_menu_back');
    expect(button.data.label).toBe('← Menu');
    expect(button.data.style).toBe(2); // Secondary
    expect(button.data.emoji).toBeUndefined(); // No emoji
  });

  test('creates Safari back button with emoji', () => {
    const button = createBackButton('prod_safari_menu');
    expect(button.data.custom_id).toBe('prod_safari_menu');
    expect(button.data.label).toBe('← Safari');
    expect(button.data.emoji.name).toBe('🦁');
  });

  test('throws error for invalid target', () => {
    expect(() => createBackButton('invalid_menu'))
      .toThrow('Unknown back button target');
  });

  test('warns about deprecated targets', () => {
    const consoleSpy = jest.spyOn(console, 'warn');
    createBackButton('safari_menu');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('DEPRECATED')
    );
  });
});
```

### Manual Testing Checklist
After migration, test navigation from:
- [ ] Production Menu → Currency → Back
- [ ] Production Menu → Rounds → Back
- [ ] Production Menu → Stores → Back
- [ ] Production Menu → Items → (select item) → Back
- [ ] Production Menu → Player Admin → Back
- [ ] Production Menu → Safari → Back
- [ ] Production Menu → Tools → Back

---

## Design Decisions

### Why Not Use MENU_FACTORY?
**MENU_FACTORY** (in MenuSystemArchitecture.md) is for **building entire menus**.
**Back Button Factory** is for **building individual navigation buttons**.

They solve different problems:
- **MENU_FACTORY**: "Generate this entire menu structure"
- **Back Button Factory**: "Create this specific back button"

Future: Back Button Factory could be **used by** MENU_FACTORY for consistency.

### Why Not Extend ButtonHandlerFactory?
**ButtonHandlerFactory** handles **execution logic** (what happens when clicked).
**Back Button Factory** handles **creation logic** (what the button looks like).

Separation of concerns:
- ButtonHandlerFactory: "When clicked, do X"
- Back Button Factory: "Look like Y"

### Why Two Functions (createBackButton + createBackButtonV2)?
- **createBackButton()**: Returns ButtonBuilder instance (for app.js ActionRows)
- **createBackButtonV2()**: Returns raw JSON (for external UI builders using Components V2)

Some files use Discord.js builders, others use raw component structures.
Supporting both prevents forcing a single pattern during migration.

### Why Throw on Invalid Target?
**Fail fast** catches typos at development time instead of silently breaking navigation.

```javascript
// Catches this typo immediately:
createBackButton('prod_manu_back'); // Throws: Unknown target "prod_manu_back"

// Instead of silently breaking:
.setCustomId('prod_manu_back')  // User clicks, nothing happens
```

---

## Future Enhancements

### 1. Back Button Breadcrumbs (v2)
```javascript
// Show navigation path in label
createBackButton('prod_menu_back', { showBreadcrumb: true });
// "← Menu / Safari / Items" instead of just "← Menu"
```

### 2. Smart Back Detection (v3)
```javascript
// Automatically detect where user came from
createBackButton('auto'); // Determines target from navigation history
```

### 3. Integration with MENU_FACTORY (v4)
```javascript
// Menu Factory automatically includes correct back button
MenuFactory.create('currency_menu'); // Back button to prod_menu_back auto-added
```

---

## Related Documentation

- **[MenuHierarchy.md](../ui/MenuHierarchy.md)** - Shows which menus navigate where
- **[LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md)** - Back button visual standards
- **[MenuSystemArchitecture.md](../enablers/MenuSystemArchitecture.md)** - Broader menu patterns
- **[ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md)** - Button execution logic

---

## Questions & Answers

**Q: Do I need to migrate everything at once?**
A: No. The factory works alongside existing code. Migrate incrementally.

**Q: What if I add a new menu?**
A: Add one entry to `BACK_BUTTON_CONFIG`, then use `createBackButton()` everywhere.

**Q: Will this break existing menus?**
A: No. It's purely additive until you actively migrate specific back buttons.

**Q: How do I know what target ID to use?**
A: Call `getValidBackButtonTargets()` or check the config map. Most use `'prod_menu_back'`.

**Q: Can I customize the label for specific cases?**
A: Not recommended - defeats the purpose. If needed, create a new config entry instead.

---

## Implementation Checklist

### Phase 1: Setup
- [ ] Create `/src/ui/backButtonFactory.js` with code above
- [ ] Test: `import { createBackButton } from './src/ui/backButtonFactory.js'`
- [ ] Verify no errors in dev environment
- [ ] Commit: "Add Centralized Back Button Factory (design implementation)"

### Phase 2: Migrate app.js
- [ ] Search: `grep -n "setLabel.*← Menu" app.js`
- [ ] Replace instances one menu at a time (start with Currency menu)
- [ ] Test menu navigation after each migration
- [ ] Commit after each menu: "Migrate [Menu Name] to Back Button Factory"

### Phase 3: Migrate External UIs
- [ ] entityManagementUI.js → `createBackButtonV2('prod_menu_back')`
- [ ] safariMapAdmin.js → `createBackButtonV2('prod_menu_back')`
- [ ] storeSelector.js → Replace parameters with `createBackButton(backButtonId)`
- [ ] mapExplorer.js → Check if migration needed

### Phase 4: Validation
- [ ] Run grep to find stragglers
- [ ] Test all major navigation flows
- [ ] Update MenuHierarchy.md status to "✅ Implemented"
- [ ] Update CLAUDE.md to reference factory in standards section

---

**Status Summary**:
📋 Design: Complete
🚧 Implementation: Not Started
🎯 Next Step: Create `/src/ui/backButtonFactory.js` file

---

*Generated with Claude Code (Sonnet 4.5) - 2025-10-19*
