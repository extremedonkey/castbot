# Menu System Architecture

## Overview

The Menu System Architecture provides a centralized, standardized approach to menu creation and management in CastBot. This system works alongside [ButtonHandlerFactory.md](ButtonHandlerFactory.md) and follows visual standards from [LeanMenuDesign.md](../ui/LeanMenuDesign.md).

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
    title: 'Menu Title',
    accent: 0x3498DB,      // Accent color
    builder: 'customBuilder', // Optional custom builder
    sections: []           // Menu sections
  }
}
```

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
MENU DEBUG: Legacy menu at prod_manage_tribes [⚱️ MENULEGACY]  // Needs migration
MENU DEBUG: Unknown menu invalid_id [⚠️ UNREGISTERED] // Not in registry
```

## Implementation Guide

### Step 1: Register Menu
Add menu configuration to MENU_REGISTRY:
```javascript
// In menuBuilder.js
MENU_REGISTRY['castlist_menu'] = {
  title: 'CastBot | Castlist Management',
  accent: 0x9b59b6, // Purple for castlists
  sections: [
    {
      label: '📊 View Castlists',
      components: [] // Will be populated by builder
    },
    {
      label: '✏️ Manage',
      components: [] // Buttons added here
    }
  ]
};
```

### Step 2: Create Handler
Use ButtonHandlerFactory with MenuBuilder:
```javascript
} else if (custom_id === 'show_castlist_menu') {
  return ButtonHandlerFactory.create({
    id: 'show_castlist_menu',
    handler: async (context) => {
      const menu = await MenuBuilder.create('castlist_menu', context);
      return {
        flags: (1 << 15), // IS_COMPONENTS_V2
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

### Visual Standards (from LeanMenuDesign.md)
- **Header**: `## Menu Title`
- **Sections**: `> **\`📊 Section Name\`**`
- **Separators**: Between logical sections only
- **Buttons**: Maximum 5 per ActionRow
- **Components**: Maximum 25 per container

### Technical Standards
- **Response Format**: Components V2 (type 17 container)
- **Flags**: Always include `(1 << 15)` for IS_COMPONENTS_V2
- **Permissions**: Check before showing admin menus
- **Error Handling**: Use ButtonHandlerFactory patterns

## Migration Strategy

### Phase 1: Foundation (Complete ✅)
- [x] Create menuBuilder.js
- [x] Add tracking to legacy menus
- [x] Document architecture

### Phase 2: Pilot Implementation
- [ ] Implement first menu using new system
- [ ] Test and refine patterns
- [ ] Document lessons learned

### Phase 3: Gradual Migration
Priority order based on complexity and usage:
1. Simple submenus (setup, tribes, pronouns)
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
| Tribes Management | `prod_manage_tribes` | ⚱️ Legacy | High |
| Pronouns & Timezones | `prod_manage_pronouns_timezones` | ⚱️ Legacy | Medium |
| Availability | `prod_availability` | ⚱️ Legacy | Low |
| Season Management | `season_management_menu` | ⚱️ Legacy | Medium |
| Safari Menu | `prod_safari_menu` | ⚱️ Legacy | High |
| Analytics Menu | `reece_stuff_menu` | ⚱️ Legacy | Low |
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
- Register all new menus in MENU_REGISTRY
- Follow LeanMenuDesign.md visual standards
- Use MenuBuilder.create() for new menus
- Add tracking to legacy menus immediately
- Test menu limits (5 buttons/row, 25 components/container)

### DON'T ❌
- Build menus inline in handlers
- Exceed Discord component limits
- Forget IS_COMPONENTS_V2 flag
- Skip permission checks
- Mix legacy and new patterns in same menu

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
  handler: async (context) => {
    return MenuBuilder.create('castlist_menu', context);
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

- [ButtonHandlerFactory.md](ButtonHandlerFactory.md) - Button system architecture
- [LeanMenuDesign.md](../ui/LeanMenuDesign.md) - Visual design standards
- [ComponentsV2.md](ComponentsV2.md) - Discord Components V2 details
- [DefinitionOfDone.md](../workflow/DefinitionOfDone.md) - Development standards

## Conclusion

The Menu System Architecture provides a scalable, maintainable solution for menu management in CastBot. By centralizing menu definitions and providing clear migration paths, we can eliminate code duplication while maintaining consistency across the application.

The legacy tracking system provides immediate visibility into technical debt, allowing for systematic improvement without disrupting existing functionality.