# Menu System Architecture

> **Open this file when** you're building a new menu from scratch and need the MENU_REGISTRY/MenuBuilder patterns. Note: only `setup_menu` has been migrated so far — most menus are still inline in app.js.

## Overview

The Menu System Architecture provides a centralized, standardized approach to menu creation and management in CastBot. This system works alongside [ButtonHandlerFactory.md](ButtonHandlerFactory.md) and follows visual standards from [LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md).

**📋 Current Menu Structure**: See [MenuHierarchy.md](../ui/MenuHierarchy.md) for the complete visual menu tree and navigation flow. This document describes the **architectural patterns** and migration strategy, while MenuHierarchy.md shows the **actual current structure**.

### Document Scope

**This document covers:**
- MENU_REGISTRY structure and implementation
- MenuBuilder class and patterns
- Migration strategy from legacy inline menus
- Technical pitfalls (async/await, ephemeral flags)

**For visual/UX standards, see [LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md):**
- Menu header formatting (icons, titles)
- Section organization patterns
- Button styling hierarchy
- Space optimization techniques
- Component structure templates

## Problem Solved

- **Code Duplication**: Eliminate inline menu building scattered throughout app.js
- **Menu Discovery**: Central registry for all menus with natural language search
- **Consistency**: Enforce UI/UX standards across all menus
- **Maintenance**: Easy menu modifications without searching through 21,000+ lines
- **Migration Tracking**: Visibility into legacy menus requiring migration

## Architecture Components

### 1. Menu Registry
Central repository of all menu configurations:
```javascript
MENU_REGISTRY = {
  'menu_id': {
    title: '🎯 Menu Title | Key Features',  // LEAN format: icon + title + subtitle (see LeanUserInterfaceDesign.md)
    accent: 0x3498DB,      // Accent color (see LEAN doc for color guidelines)
    ephemeral: true,       // REQUIRED: true for admin menus (default), false only for player-visible content
    builder: 'customBuilder', // Optional custom builder
    sections: []           // Menu sections (see Step 1 below for structure)
  }
}
```

**Title Format** (from [LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md)):
- Pattern: `icon + Title + | + Key Features`
- Example: `🦁 Safari | Idol Hunts, Challenges & More`
- Renders as: `## 🦁 Safari | Idol Hunts, Challenges & More`

### 2. MenuBuilder Class
Handles menu creation and legacy tracking:
```javascript
MenuBuilder.create('menu_id', context)      // Create menu from registry
MenuBuilder.trackLegacyMenu(location, desc) // Track legacy menu usage
MenuBuilder.registerMenu(id, config)        // Register new menu
```

### 3. Legacy Tracking System
Provides visibility into migration progress:
```
MENU DEBUG: Building main_menu [🛸 MENUSYSTEM]        // Using new system
MENU DEBUG: Legacy menu at reeces_stuff [⚱️ MENULEGACY]  // Needs migration
MENU DEBUG: Unknown menu invalid_id [⚠️ UNREGISTERED] // Not in registry
```

## Implementation Guide

### Step 1: Register Menu
Add menu configuration to MENU_REGISTRY:
```javascript
// In menuBuilder.js
MENU_REGISTRY['castlist_menu'] = {
  title: '📋 Castlist Management | View & Edit',  // LEAN format with icon
  accent: 0x9b59b6, // Purple for castlists
  ephemeral: true, // REQUIRED: Admin menu (always true unless explicitly player-visible)
  sections: [
    {
      // Section structure follows LEAN standards
      // See LeanUserInterfaceDesign.md for component patterns
      components: [] // Will be populated by builder or custom components
    }
  ]
};
```

**Note**: Section structure and component layout should follow patterns from [LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md).

### Step 2: Create Handler
Use ButtonHandlerFactory with MenuBuilder:
```javascript
} else if (custom_id === 'show_castlist_menu') {
  return ButtonHandlerFactory.create({
    id: 'show_castlist_menu',
    ephemeral: true, // Config hint (optional)
    handler: async (context) => {
      // 🚨 CRITICAL: MenuBuilder.create() is async - MUST use await!
      const menu = await MenuBuilder.create('castlist_menu', context);
      return {
        // 🚨 CRITICAL: Must explicitly add EPHEMERAL flag for admin menus!
        // ButtonHandlerFactory ephemeral config is NOT sufficient
        flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // IS_COMPONENTS_V2 + EPHEMERAL
        components: [menu]
      };
    }
  })(req, res, client);
}
```

### Step 3: Track Legacy Menus
Add tracking to existing inline menus:
```javascript
// At start of legacy menu handler
MenuBuilder.trackLegacyMenu('menu_location', 'Menu description');
```

## Menu Standards

**For visual/UX standards** (headers, sections, buttons, styling), see **[LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md)**.

### Technical Standards (MenuSystem-Specific)
- **Response Format**: Components V2 (type 17 container) - see [ComponentsV2.md](../standards/ComponentsV2.md)
- **Flags**: Always include `(1 << 15)` for IS_COMPONENTS_V2
- **Ephemeral (CRITICAL)**: Admin menus MUST be ephemeral (`(1 << 15) | InteractionResponseFlags.EPHEMERAL`)
  - **Rule**: All menus are ephemeral by default
  - **Exception**: Only make non-ephemeral when explicitly needed for player-visible content
  - **Reason**: Players must not see admin game mechanics/configuration
- **Permissions**: Check before showing admin menus (via ButtonHandlerFactory `requiresPermission`)
- **Error Handling**: Use ButtonHandlerFactory patterns
- **Async/Await**: ALWAYS `await` MenuBuilder.create() - see Common Pitfalls below
- **Component Count Logging**: Always add verbose `countComponents` logging to menu handlers for dev visibility. This is not critical for production but invaluable during development to catch limit issues early:
  ```javascript
  const { countComponents } = await import('./utils.js');
  countComponents([container], { verbosity: "full", label: "Menu Name" });
  ```
  Output shows the full recursive tree with numbered components and a pass/fail total (e.g. `✅ Menu Name: 39/40`). See `reeces_stuff` and `reeces_season_planner` handlers for examples.

## Migration Strategy

### Phase 1: Foundation (Complete ✅)
- [x] Create menuBuilder.js
- [x] Add tracking to legacy menus
- [x] Document architecture

### Phase 2: Pilot Implementation ✅
- [x] Implement first menu using new system (setup_menu)
- [ ] Test and refine patterns
- [ ] Document lessons learned

### Phase 3: Gradual Migration
Priority order based on complexity and usage:
1. Simple submenus (setup, tribes, reaction roles)
2. Complex menus (safari, seasons)
3. Dynamic menus (main menu, castlists)

### Phase 4: Completion
- [ ] All menus migrated to registry
- [ ] Remove legacy patterns
- [ ] Update all documentation

## Legacy Menu Inventory

Current menus requiring migration (tracked via MenuBuilder.trackLegacyMenu):

| Menu | Location | Status | Priority |
|------|----------|--------|----------|
| Main Production Menu | `createProductionMenuInterface` | ⚱️ Legacy | High |
| ~~Tribes Management~~ | ~~`prod_manage_tribes`~~ | ~~⚱️ Legacy~~ | ~~High~~ | *Replaced by `reeces_stuff` (Reece's Stuff in Tools). See [CastlistV3.md](../features/CastlistV3.md)* |
| Reaction Roles | `prod_manage_pronouns_timezones` | ⚱️ Legacy | Medium |
| Availability | `prod_availability` | ⚱️ Legacy | Low |
| Season Management | `season_management_menu` | ⚱️ Legacy | Medium |
| Safari Menu | `prod_safari_menu` | ⚱️ Legacy | High |
| Analytics Menu | `analytics_admin` (was `reece_stuff_menu`) | ⚱️ Legacy | Low |
| Player Management | `admin_manage_player` | ⚱️ Legacy | Medium |
| Safari Rounds Config | `safari_configure_rounds` | ⚱️ Legacy | Low |
| Safari Store Items | `safari_store_manage_items` | ⚱️ Legacy | Low |
| Castlist Menu | `prod_castlist_menu` | ⚱️ Legacy | High |

## Natural Language Interface

Similar to ButtonHandlerFactory, MenuBuilder will support natural language discovery:
```javascript
// Future implementation
MenuRegistry.findByTitle('castlist')      // Returns 'castlist_menu'
MenuRegistry.findBySection('analytics')   // Returns menus with analytics sections
MenuRegistry.search('safari')             // Returns all safari-related menus
```

## Best Practices

### DO ✅
- **Register menus** in MENU_REGISTRY with proper LEAN title format (`🎯 Title | Subtitle`)
- **Follow [LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md)** for all visual standards
- **Use `await`** when calling MenuBuilder.create() (it's async!)
- **Include EPHEMERAL flag** for admin menus: `(1 << 15) | InteractionResponseFlags.EPHEMERAL`
- **Add tracking** to legacy menus immediately for visibility
- **Test menu limits** (5 buttons/row, 40 components/container)
- **Set `ephemeral: true`** in MENU_REGISTRY (default assumption)

### DON'T ❌
- ❌ Build menus inline in handlers (defeats centralization)
- ❌ Exceed Discord component limits
- ❌ Forget IS_COMPONENTS_V2 flag
- ❌ Skip permission checks
- ❌ Mix legacy and MenuSystem patterns in same menu
- ❌ **Forget `await` when calling MenuBuilder.create()** - causes "interaction failed" with no error logs!
- ❌ **Omit icon from menu title** - violates LEAN standards

## Migration Success Stories

### Setup Menu (setup_menu) - First Migration ✅

**Date**: January 2025
**Handler**: `prod_setup`
**Complexity**: Low (single screen, static buttons)

**Before**:
- 80+ lines of inline component construction in handler
- No central menu definition
- Menu structure scattered in handler logic
- Missing LEAN title icon formatting

**After**:
- Handler reduced to 15 lines (80% reduction)
- Menu structure centralized in MENU_REGISTRY with LEAN-compliant title: `🪛 CastBot | Tools`
- All buttons registered in BUTTON_REGISTRY
- Proper ephemeral flag for admin privacy

**Benefits Realized**:
1. ✅ Menu structure is now reusable and testable
2. ✅ Handler is clean and focused on routing
3. ✅ Changes to menu structure don't require touching handler code
4. ✅ Menu appears in registry with proper tracking
5. ✅ Follows LEAN visual standards (icon in title)

**Code Comparison**:
```javascript
// Before (80+ lines)
const setupContainer = {
  type: 17,
  accent_color: 0x3498DB,
  components: [
    { type: 10, content: `## CastBot | Tools` },  // ❌ Missing icon!
    { type: 14 },
    // ... 70+ more lines of component definitions
  ]
};

// After (3 lines) - 🚨 CRITICAL: Must use await!
const setupContainer = await MenuBuilder.create('setup_menu', context);
// MENU_REGISTRY['setup_menu'].title = '🪛 CastBot | Tools'  // ✅ LEAN compliant
```

**Lessons Learned**:
- Simple menus migrate easily to MenuSystemArchitecture
- ButtonHandlerFactory integration is seamless
- Menu structure in MENU_REGISTRY is more maintainable
- Handler code becomes self-documenting (MenuBuilder.create makes intent clear)
- **🚨 CRITICAL**: Always `await` MenuBuilder.create() - forgetting causes "interaction failed" with no error logs!
- **🚨 CRITICAL**: Include icon in title field to follow LEAN standards

## Common Pitfalls

### 1. Missing `await` on MenuBuilder.create() 🚨

**Symptom**: Discord shows "This interaction failed" but logs show successful handler execution with no errors.

**Root Cause**: `MenuBuilder.create()` is async, but called without `await`. This returns a Promise instead of the menu container, which Discord rejects.

**Example of Bug**:
```javascript
// ❌ WRONG - Missing await
handler: async (context) => {
  const setupContainer = MenuBuilder.create('setup_menu', context); // Returns Promise!
  return {
    flags: (1 << 15),
    components: [setupContainer] // Discord receives: [Promise { <pending> }]
  };
}
```

**Correct Pattern**:
```javascript
// ✅ CORRECT - With await
handler: async (context) => {
  const setupContainer = await MenuBuilder.create('setup_menu', context); // Returns Container!
  return {
    flags: (1 << 15),
    components: [setupContainer] // Discord receives: [{ type: 17, ... }]
  };
}
```

**Why It's Hard to Debug**:
- Handler logs show "✅ SUCCESS" because no exception is thrown
- The Promise is created successfully, just not resolved
- Discord silently rejects the malformed response
- Similar to the `await loadPlayerData()` bug pattern in CLAUDE.md

**Prevention**:
- Always check if a function is `async` before calling it
- If function signature shows `async`, you MUST `await` it
- Add console logs to verify data structure: `console.log('Container type:', typeof setupContainer)`

### 2. Menu Not Registered

**Symptom**: Error: "Menu X not found in MENU_REGISTRY"

**Fix**: Add menu configuration to MENU_REGISTRY before using MenuBuilder.create()

### 3. Invalid Component Structure

**Symptom**: Discord rejects response even with correct async/await

**Fix**: Ensure menu components follow Components V2 standards (type 17 Container, type 10 Text Display, etc.)

### 4. Missing EPHEMERAL Flag 🚨

**Symptom**: Admin menu appears public (visible to all users) instead of private

**Root Cause**: ButtonHandlerFactory `ephemeral: true` config is NOT sufficient - must explicitly add `InteractionResponseFlags.EPHEMERAL` to response flags

**Example of Bug**:
```javascript
// ❌ WRONG - Config alone doesn't make it ephemeral
return ButtonHandlerFactory.create({
  id: 'admin_menu',
  ephemeral: true, // This is just a hint!
  handler: async (context) => {
    const menu = await MenuBuilder.create('admin_menu', context);
    return {
      flags: (1 << 15), // Missing EPHEMERAL flag
      components: [menu] // Will be PUBLIC!
    };
  }
})(req, res, client);
```

**Correct Pattern**:
```javascript
// ✅ CORRECT - Explicit EPHEMERAL flag
return ButtonHandlerFactory.create({
  id: 'admin_menu',
  ephemeral: true, // Config hint (optional)
  handler: async (context) => {
    const menu = await MenuBuilder.create('admin_menu', context);
    return {
      flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL, // Both flags!
      components: [menu] // Now ephemeral
    };
  }
})(req, res, client);
```

**Why It Matters**:
- Admin menus contain game mechanics and configuration
- Players must not see admin interfaces
- Public menus leak strategy and spoil game experience
- **Default assumption**: All menus are ephemeral unless explicitly non-ephemeral

**Reference**: See ComponentsV2Issues.md #11 for detailed explanation

## Integration with ButtonHandlerFactory

Menus and buttons work together:
1. **Buttons** trigger menu display via handlers
2. **Menus** contain buttons defined in BUTTON_REGISTRY
3. **Both** use factory patterns for consistency
4. **Both** provide natural language interfaces

Example flow:
```javascript
// Button in BUTTON_REGISTRY
'show_castlist_menu': {
  label: 'Castlists',
  description: 'Open castlist management menu',
  category: 'menu_triggers'
}

// Menu in MENU_REGISTRY
'castlist_menu': {
  title: 'Castlist Management',
  // Menu configuration
}

// Handler connects them
ButtonHandlerFactory.create({
  id: 'show_castlist_menu',
  ephemeral: true,
  handler: async (context) => {
    const menu = await MenuBuilder.create('castlist_menu', context);
    return {
      flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,
      components: [menu]
    };
  }
})
```

## Monitoring & Debugging

### View Legacy Menu Usage
```bash
npm run logs-prod | grep "MENULEGACY"
```

### View New Menu Creation
```bash
npm run logs-prod | grep "MENUSYSTEM"
```

### Check Migration Progress
```javascript
MenuBuilder.getMigrationStats()
// Returns: { registered: 5, status: "5 menus migrated to MenuSystem" }
```

## Future Enhancements

### Planned Features
1. **Menu Templates**: Predefined layouts for common patterns
2. **Dynamic Builders**: Automatic menu generation from data
3. **A/B Testing**: Compare menu layouts for effectiveness
4. **Analytics Integration**: Track menu usage patterns
5. **Hot Reload**: Update menus without restart

### Long-term Vision
- Complete extraction of menus from app.js
- Separate menu configuration files
- Visual menu builder tool
- Automated Discord limit validation

## Related Documentation

### Primary Dependencies
- **[LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md)** - 🎨 **Visual/UX standards** - ALL menus must follow LEAN patterns
  - Title formatting (icon + Title | Subtitle)
  - Section organization and headers
  - Button styling hierarchy
  - Space optimization techniques
- **[ButtonHandlerFactory.md](ButtonHandlerFactory.md)** - 🔘 **Handler patterns** - Integrates with MenuBuilder
- **[MenuHierarchy.md](../ui/MenuHierarchy.md)** - 📋 **Current structure** - Visual menu tree

### Supporting Documentation
- [ComponentsV2.md](../standards/ComponentsV2.md) - Discord Components V2 technical details
- [DefinitionOfDone.md](../workflow/DefinitionOfDone.md) - Development standards

### Document Relationship

```
LeanUserInterfaceDesign.md     MenuSystemArchitecture.md
        (WHAT)                          (HOW)
           |                               |
           v                               v
   Visual Standards  ──────────→   Implementation Patterns
   - Title format                  - MENU_REGISTRY
   - Sections                      - MenuBuilder.create()
   - Buttons                       - Migration strategy
   - Layout                        - Common pitfalls
           |                               |
           └───────────────┬───────────────┘
                           v
                  Implemented Menu
                (follows LEAN visually,
                 built via MenuSystem)
```

## Conclusion

The Menu System Architecture provides a scalable, maintainable solution for menu management in CastBot. By centralizing menu definitions and providing clear migration paths, we can eliminate code duplication while maintaining consistency across the application.

The legacy tracking system provides immediate visibility into technical debt, allowing for systematic improvement without disrupting existing functionality.