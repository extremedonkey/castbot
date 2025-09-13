# CastBot Development Backlog

This is a living requirements backlog for CastBot features and improvements, ordered by priority.

## COMPLETED (Recently Finished)

### ✅ Request-Scoped Caching Optimization
**Completed:** 2025-07-04
**Description:** Implemented request-scoped caching for playerData.json and safariContent.json file I/O operations
**Impact:** 
- 5-10x performance improvement for complex interactions
- 95% reduction in file I/O time (from ~15ms to ~3ms for multi-step operations)
- Zero risk implementation - cache cleared between requests
- Built-in cache hit/miss metrics for monitoring
**Documentation:** See `/docs/architecture/RequestScopedCaching.md`

## IMMEDIATE Priority


## HIGH Priority

### Safari Menu Cleanup - Handler Review
**Description:** Review and potentially remove obsolete Safari button handlers after menu reorganization
**Tasks:**
- Check if `safari_manage_safari_buttons` handler is still needed (superseded by Custom Actions)
- Review `safari_navigate` handlers and map movement dependencies for cleanup
- Verify if Manage Safari Buttons UI components are still in use elsewhere
- Check Navigate button dependencies in map system
**Context:** Safari menu was reorganized to remove obsolete buttons and improve UI consistency

### Enhanced Pronoun Role Origin Tracking System
**Description:** Add metadata tracking to distinguish between CastBot-created and pre-existing pronoun roles for smarter management and safer operations
**Current Structure:** `pronounRoleIDs` is a simple array of role ID strings
**Proposed Structure:** Array of objects with origin tracking:
```json
"pronounRoleIDs": [
  {
    "id": "1389543002346885282",
    "createdBy": "castbot",
    "standardName": "He/Him"
  },
  {
    "id": "1389543002346885283", 
    "createdBy": "existing",
    "standardName": "She/Her",
    "originalName": "she/her"
  }
]
```
**Benefits:**
- Smarter nuke command: Could delete only CastBot-created roles, preserve existing ones
- Better setup feedback: "Found 3 existing roles, created 2 new ones"
- Safer operations: Avoid accidentally deleting user's original roles
- Enhanced debugging: Know exactly what CastBot created vs found
**Implementation Requirements:**
- Add backward compatibility migration logic
- Update all functions that use `pronounRoleIDs` array
- Modify `executeSetup()` to mark roles during creation/detection
- Update `createPronounReactionMessage()` to handle new format
**Priority:** High - Enhances safety and provides better user experience
**Risk Level:** Medium - Requires careful migration and testing

### Remove Deprecated Safari Customize Terms Modal Handler
**Description:** Remove commented-out legacy safari_customize_terms_modal handler after confirming new Components V2 field group interface works properly
**Location:** app.js lines ~12867-13013 (legacy modal handler is commented out)
**Context:** The legacy single-modal approach has been replaced by a Components V2 interface with grouped field editing (safari_config_modal_*)
**Acceptance Criteria:**
- Verify new field group modals work for Currency & Inventory, Events, and Rounds customization
- Test reset to defaults functionality works properly
- Confirm all existing Safari functionality continues working with new custom terms system
- Remove commented code block and update ButtonHandlerRegistry.md
**Priority:** High - cleanup after successful Components V2 interface upgrade

### Remove Commented Safari Interface Code
**Description:** Remove commented out redundant Safari interface code that has been replaced by streamlined entity management system
**Location:** app.js lines ~5985-6064 (safari_item_create handler) and lines ~6153-6255 (safari_item_list handler)
**Context:** These handlers were commented out when safari_manage_items was streamlined to go directly to the entity management UI
**Acceptance Criteria:**
- Remove all commented out code blocks marked with "COMMENTED OUT - REDUNDANT INTERFACE"
- Verify entity management system (safari_item_manage_existing) continues working properly  
- Test that safari_manage_items button goes directly to entity management without issues
- Ensure no references to commented handlers remain in the codebase
**Priority:** High - cleanup after successful interface streamlining implementation

### App.js Massive Code Reduction Initiative - Phase 1 (Quick Wins)
**Description:** Extract helper functions, consolidate permission checks, and move analytics handlers to reduce app.js by ~2,000 lines with minimal risk
**Current Size:** 14,000 lines - Target: Reduce by 70-85% through systematic refactoring
**Priority:** High (Low-hanging fruit with immediate benefits)

**🍃 Phase 1A: Helper Function Extraction (800 lines saved, ZERO risk)**
**Risk Level:** None - These are self-contained utility functions with clear boundaries
**Implementation Time:** 1-2 days
**Files to Create:**
- `utils/castlistUtils.js` - Castlist calculation and field generation utilities
- `utils/emojiUtils.js` - Emoji creation, parsing, and cleanup utilities
- `utils/generalUtils.js` - Miscellaneous utility functions

**Specific Functions to Extract (app.js lines ~13,500-14,000):**
```javascript
// Castlist utilities (move to castlistUtils.js):
function calculateCastlistFields(guildTribes, defaultCastlist) // ~50 lines
function createMemberFields(members, tribeData, guildId) // ~80 lines  
function determineCastlistToShow(interaction, guildTribes) // ~40 lines
function createCastlistRows(tribeMembers, tribeData) // ~60 lines

// Emoji utilities (move to emojiUtils.js):
async function createEmojiForUser(client, guildId, member) // ~120 lines
function parseEmojiCode(emojiString) // ~30 lines
async function clearRoleEmojis(client, guildId, roleId) // ~80 lines

// General utilities (move to generalUtils.js):
function extractUsernameFromMention(userMention) // ~20 lines
function formatTimeDisplay(timezoneName, offset) // ~40 lines
function validateGuildPermissions(member, requiredPermission) // ~30 lines
```

**Post-Extraction app.js Updates:**
- Add imports: `import { createEmojiForUser, parseEmojiCode } from './utils/emojiUtils.js';`
- Update function calls throughout app.js to use imported functions
- Remove original function definitions from bottom of app.js
- **No logic changes** - pure code relocation with imports

**🔐 Phase 1B: Permission Check Consolidation (500-700 lines saved, ZERO risk)**
**Risk Level:** None - Replacing identical code blocks with function calls
**Implementation Time:** 1 day

**Current Duplication Pattern (appears 50+ times):**
```javascript
// This EXACT pattern appears throughout app.js:
if (!member?.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: '❌ You need Manage Roles permission to use this feature.',
            flags: InteractionResponseFlags.EPHEMERAL
        }
    });
}
```

**Consolidated Implementation:**
```javascript
// Create in buttonHandlerUtils.js:
function requirePermission(req, res, permission, customMessage) {
    const member = req.body.member;
    if (!member?.permissions || !(BigInt(member.permissions) & permission)) {
        res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: customMessage || '❌ You need additional permissions to use this feature.',
                flags: InteractionResponseFlags.EPHEMERAL
            }
        });
        return false;
    }
    return true;
}

// Replace all permission checks with:
if (!requirePermission(req, res, PermissionFlagsBits.ManageRoles)) return;
```

**📊 Phase 1C: Analytics Handler Extraction (400-500 lines saved, LOW risk)**
**Risk Level:** Low - Self-contained handlers with clear boundaries
**Implementation Time:** 1 day
**Target Location:** app.js lines ~4,900-5,300

**Handlers to Extract to `analyticsHandlers.js`:**
```javascript
// Move these complete handlers:
} else if (custom_id === 'prod_server_usage_stats') {
    // ~150 lines - Complete handler for server usage analytics
} else if (custom_id === 'prod_analytics_dump') {
    // ~200 lines - Complete handler for analytics dump
} else if (custom_id === 'toggle_live_logging') {
    // ~100 lines - Complete handler for live logging toggle
}
```

**Integration Pattern:**
```javascript
// In app.js, replace handlers with:
import { handleServerUsageStats, handleAnalyticsDump, handleLiveLogging } from './analyticsHandlers.js';

} else if (custom_id === 'prod_server_usage_stats') {
    return handleServerUsageStats(req, res, client);
} else if (custom_id === 'prod_analytics_dump') {
    return handleAnalyticsDump(req, res, client);
} else if (custom_id === 'toggle_live_logging') {
    return handleLiveLogging(req, res, client);
}
```

**Phase 1 Total Impact:**
- **Lines Reduced:** ~2,000 lines (14% reduction)
- **Risk Level:** Minimal (mostly code relocation)
- **Implementation Time:** 3-4 days
- **Files Created:** 4 new utility/handler modules
- **Maintainability:** Significantly improved through modularization

**Acceptance Criteria:**
- All extracted functions work identically to original implementations
- All imports properly configured and tested
- No functionality changes or regressions
- App.js reduced from 14,000 to ~12,000 lines
- Helper functions properly organized in logical modules
- Permission checks consolidated to single reusable function
- Analytics handlers cleanly separated into dedicated module

### App.js Massive Code Reduction Initiative - Phase 2 (Button Handler Reform)
**Description:** Consolidate massive button handler duplication using factory patterns and response builders
**Target:** Reduce app.js by additional 3,000-4,000 lines through handler abstraction
**Risk Level:** Medium (requires careful testing of handler behavior)
**Implementation Time:** 1 week after Phase 1 completion

**🔄 Review BUTTON_HANDLER_*.md Documentation**
Before implementing button handler reform, review the documentation files in `docs/` for current implementation guidelines:
- `docs/BUTTON_HANDLER_ANALYSIS.md` - Complete menu hierarchy and implementation standards
- `docs/ButtonHandlerRegistry.md` - Current button handler registry
- `docs/BUTTON_INTERACTION_ANALYSIS.md` - Interaction analysis and patterns
Consider updating any outdated prompts or implementation guidelines based on current architecture.

**🔄 Phase 2A: Button Handler Factory System (2,500-3,000 lines saved)**
**Current Issue:** Button handlers (lines ~2,800-11,000) contain massive duplication
**Solution:** Expand `buttonHandlerUtils.js` into comprehensive handler factory

**Common Handler Pattern (repeated 100+ times):**
```javascript
} else if (custom_id === 'example_button') {
    try {
        // Context extraction (identical in all handlers)
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        const member = req.body.member;
        const channelId = req.body.channel_id;
        
        // Permission check (duplicate pattern)
        if (!member?.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
            return res.send({...}); // Identical error response
        }
        
        // Handler-specific logic (varies)
        const result = await someSpecificOperation(guildId, userId);
        
        // Response building (similar patterns)
        return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                components: [...], // Similar component patterns
                flags: (1 << 15) // IS_COMPONENTS_V2
            }
        });
    } catch (error) {
        // Identical error handling
        console.error(`Error in ${custom_id} handler:`, error);
        return res.send({...}); // Identical error response
    }
}
```

**Factory Pattern Implementation:**
```javascript
// Enhanced buttonHandlerUtils.js:
export class ButtonHandlerFactory {
    static createHandler(config) {
        return async (req, res, client) => {
            try {
                // Automatic context extraction
                const context = this.extractContext(req);
                
                // Automatic permission checking
                if (config.requiresPermission && !this.checkPermission(context, config.requiredPermission)) {
                    return this.sendPermissionError(res, config.permissionMessage);
                }
                
                // Execute handler-specific logic
                const result = await config.handler(context, client);
                
                // Automatic response building
                return this.buildResponse(res, result, config.responseType);
            } catch (error) {
                return this.handleError(res, error, config.customId);
            }
        };
    }
}

// Usage in app.js:
const safariButtonHandler = ButtonHandlerFactory.createHandler({
    customId: 'safari_button_manage',
    requiresPermission: true,
    requiredPermission: PermissionFlagsBits.ManageRoles,
    responseType: 'UPDATE_MESSAGE',
    handler: async (context, client) => {
        // Only the unique logic for this specific handler
        return await safariManager.createManageInterface(context.guildId);
    }
});
```

**🏗️ Phase 2B: Response Builder Consolidation (500-800 lines saved)**
**Current Issue:** Discord response building is verbose and repetitive
**Solution:** Create standardized response builders

**Common Response Patterns:**
```javascript
// Components V2 Container Response (repeated 30+ times)
return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
        flags: (1 << 15), // IS_COMPONENTS_V2
        components: [{
            type: 17, // Container
            accent_color: 0xf39c12,
            components: [
                { type: 10, content: "Header text..." },
                { type: 1, components: [...buttons] }
            ]
        }]
    }
});

// Error Response (repeated 50+ times)
return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
        content: '❌ An error occurred. Please try again.',
        flags: InteractionResponseFlags.EPHEMERAL
    }
});
```

**Consolidated Response Builders:**
```javascript
// In responseBuilders.js:
export const ResponseBuilder = {
    componentsV2Container(content, buttons, accentColor = 0xf39c12) {
        return {
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                flags: (1 << 15),
                components: [{
                    type: 17,
                    accent_color: accentColor,
                    components: [
                        { type: 10, content },
                        { type: 1, components: buttons }
                    ]
                }]
            }
        };
    },
    
    error(message = '❌ An error occurred. Please try again.') {
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: message,
                flags: InteractionResponseFlags.EPHEMERAL
            }
        };
    }
};

// Usage: res.send(ResponseBuilder.componentsV2Container(content, buttons));
```

**Phase 2 Total Impact:**
- **Lines Reduced:** 3,000-4,000 lines (additional 21-28% reduction)
- **App.js Size:** ~9,000-8,000 lines (from original 14,000)
- **Code Quality:** Dramatically improved maintainability and consistency
- **Testing:** Requires comprehensive handler testing

### App.js Massive Code Reduction Initiative - Phase 3 (Major Extractions)
**Description:** Extract Safari system, modularize menu systems, and create modal utilities
**Target:** Final reduction of 3,500-4,500 lines to achieve target 2,000-3,000 line app.js
**Risk Level:** Medium-High (requires careful module boundaries and integration testing)
**Implementation Time:** 1 week after Phase 2 completion

**🦁 Phase 3A: Safari System Complete Extraction (2,500 lines saved)**
**Current State:** Safari handlers scattered throughout app.js (lines ~5,200-8,500)
**Target:** Move 95% of Safari functionality to enhanced `safariManager.js`

**Safari Handlers to Extract:**
```javascript
// Button management handlers (~800 lines)
safari_button_create, safari_button_edit_select, safari_button_manage_existing
safari_add_action_, safari_finish_button_, safari_edit_properties_

// Currency management handlers (~600 lines)  
safari_currency_set, safari_currency_reset, safari_currency_view_all

// Store management handlers (~700 lines)
safari_store_create, safari_store_edit, safari_item_add, safari_item_manage

// Dynamic execution handlers (~400 lines)
safari_{guildId}_{buttonId}_{timestamp} // Dynamic button clicks
```

**Enhanced safariManager.js Architecture:**
```javascript
// Comprehensive Safari system module:
export class SafariSystem {
    static async handleButtonManagement(context, action) { /* ... */ }
    static async handleCurrencyOperations(context, operation, data) { /* ... */ }
    static async handleStoreManagement(context, action, storeData) { /* ... */ }
    static async executeDynamicButton(context, buttonId, actionData) { /* ... */ }
}

// Clean app.js integration:
} else if (custom_id.startsWith('safari_')) {
    return await SafariSystem.routeHandler(req, res, client);
}
```

**📱 Phase 3B: Menu System Modularization (400-600 lines saved)**
**Current Issue:** Menu building functions are verbose with repeated component patterns
**Target:** Create reusable menu building system

**🗂️ Phase 3C: Modal Utilities System (800-1,200 lines saved)**
**Current Issue:** Modal creation extremely verbose and repetitive
**Solution:** Universal modal factory system

**Common Modal Pattern (repeated 20+ times):**
```javascript
const modal = new ModalBuilder()
    .setCustomId(`some_modal_${id}`)
    .setTitle('Modal Title');

const input1 = new TextInputBuilder()
    .setCustomId('field1')
    .setLabel('Field 1')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

const input2 = new TextInputBuilder()
    .setCustomId('field2')
    .setLabel('Field 2')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

modal.addComponents(
    new ActionRowBuilder().addComponents(input1),
    new ActionRowBuilder().addComponents(input2)
);
```

**Modal Factory System:**
```javascript
// In modalFactory.js:
export const ModalFactory = {
    create(config) {
        const modal = new ModalBuilder()
            .setCustomId(config.customId)
            .setTitle(config.title);
            
        const components = config.fields.map(field => 
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(field.id)
                    .setLabel(field.label)
                    .setStyle(field.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short)
                    .setRequired(field.required || false)
                    .setPlaceholder(field.placeholder || '')
                    .setValue(field.value || '')
            )
        );
        
        return modal.addComponents(components.slice(0, 5)); // Discord limit
    }
};

// Usage:
const modal = ModalFactory.create({
    customId: 'safari_button_props',
    title: 'Edit Button Properties',
    fields: [
        { id: 'label', label: 'Button Label', required: true },
        { id: 'description', label: 'Description', multiline: true }
    ]
});
```

**Phase 3 Final Impact:**
- **Lines Reduced:** 3,500-4,500 lines (final 25-32% reduction)
- **Final app.js Size:** 2,000-3,000 lines (80-85% total reduction)
- **Architecture:** Fully modular, maintainable codebase
- **Performance:** Improved through reduced file size and better organization

**Complete Initiative Summary:**
```
Original app.js:     14,000 lines
Phase 1 (Quick):     -2,000 lines → 12,000 lines  
Phase 2 (Handlers):  -3,500 lines → 8,500 lines
Phase 3 (Major):     -4,000 lines → 4,500 lines
Target Final:        2,000-3,000 lines (78-85% reduction)
```

**Implementation Order:**
1. **Phase 1:** Helper extraction + permission consolidation (3-4 days, minimal risk)
2. **Phase 2:** Button handler factory system (1 week, medium risk)  
3. **Phase 3:** Major system extractions (1 week, higher risk)

**Total Implementation Time:** 2-3 weeks for complete transformation
**Risk Mitigation:** Each phase independently testable with rollback capability

### CastBot Role Management System - Multi-Phase Implementation
**Description:** Comprehensive role management architecture for all role types that CastBot manages (pronouns, timezones, tribes, vanity roles)

**Current Problem:** Role management logic is scattered across multiple handlers with duplicated code, inconsistent patterns, and manual role hierarchy issues that prevent role assignment.

**Architecture Vision:** Unified `roleManager.js` module that provides centralized management for all CastBot role types with consistent storage patterns, validation, hierarchy checking, and assignment workflows.

**🔧 PHASE 1: Setup System Refactor** - ✅ COMPLETE
**Scope:** Refactor setup button functionality with role hierarchy checking and improved user feedback
**Implementation:**
- Create `roleManager.js` module with setup functionality only
- Add role hierarchy validation (check if roles are above bot role in Discord hierarchy)
- Remove "subsequent run" detection (always show setup interface)
- Improve user feedback for different scenarios:
  - Role exists in Discord but not in CastBot → Add to CastBot + hierarchy warning
  - Role already exists in CastBot → Show as already configured  
  - Role doesn't exist → Create new role
- Add new timezone roles: NDT (UTC-2:30, offset -2.5) and ADT (UTC-3, offset -3)
- Use Discord role tag syntax `<@&roleId>` for role mentions in setup feedback
- Design timezone data structure to support future daylight savings functionality

**⚠️ Critical Fix:** Address role hierarchy issue where existing pronoun/timezone roles above bot role cannot be assigned to users

**🔧 PHASE 2: Pronoun & Timezone Management (FUTURE)**
**Scope:** Migrate all pronoun and timezone management to roleManager.js
- Extract STANDARD_PRONOUN_ROLES and STANDARD_TIMEZONE_ROLES constants
- Unified pronoun/timezone creation, addition, removal functions
- Consistent metadata storage and retrieval patterns
- Role validation and cleanup utilities

**🔧 PHASE 3: Tribe Role Integration (FUTURE)**  
**Scope:** Integrate tribe role management into unified system
- Centralized tribe metadata management (colors, emojis, castlist assignment)
- Consistent tribe creation, modification, deletion workflows
- Enhanced tribe ordering and display options

**🔧 PHASE 4: Vanity Role System (FUTURE)**
**Scope:** Complete vanity role management integration
- Streamlined vanity role assignment workflows
- Bulk vanity role operations
- Role conflict detection and resolution

**🔧 PHASE 5: Advanced Role Features (FUTURE)**
**Scope:** Enhanced role management capabilities
- Automatic daylight savings time adjustment for timezone roles
- Role template system for quick server setup
- Role analytics and usage tracking
- Cross-server role configuration import/export

**✅ Acceptance Criteria (Phase 1) - ALL COMPLETE:**
- ✅ `roleManager.js` module created with setup functionality
- ✅ Role hierarchy checking prevents assignment failures  
- ✅ Setup button provides clear feedback for all role scenarios
- ✅ New timezone roles added: NDT (UTC-2:30) and ADT (UTC-3)
- ✅ Discord role tag syntax used for role mentions (`<@&roleId>`)
- ✅ Timezone data structure supports future DST functionality
- ✅ Setup can be clicked repeatedly without creating duplicates
- ✅ "Subsequent run" detection removed (always show setup interface)

**📋 Implementation Summary (Phase 1):**
- **Created:** `roleManager.js` module (629 lines) with comprehensive setup functionality
- **Eliminated:** ~320 lines of duplicated setup code from app.js (moved to centralized module)
- **Enhanced:** Setup user feedback with role hierarchy warnings and Discord tag syntax
- **Added:** NDT (UTC-2:30, offset -2.5) and ADT (UTC-3, offset -3) timezone roles
- **Implemented:** Role hierarchy checking with `checkRoleHierarchy()` function
- **Structured:** Timezone data for future DST support (dstObserved, standardName fields)
- **Simplified:** Setup UX - removed confusing "subsequent run" logic, always shows setup button

**🚨 CRITICAL FIX: Discord Reaction Limits (Phase 1B):**
- **Discovered:** Discord has 20-reaction limit per message (50 for boosted servers)
- **Analyzed:** Current servers had 18+ timezone roles → would break with user's +15 expansion
- **Optimized:** Curated 20 most essential timezone roles covering major global regions
- **Migrated:** Reaction functionality to `roleManager.js` with `REACTION_EMOJIS` constant
- **Fixed:** All 27 references to old `REACTION_NUMBERS` across app.js handlers
- **Enhanced:** Error messages now mention "Discord limits" for user clarity
- **Architecture:** Foundation ready for future boosted server detection (50-reaction support)

**Benefits:**
- **Immediate:** Fixes critical role hierarchy bug preventing role assignment
- **Short-term:** Eliminates code duplication in setup functionality
- **Long-term:** Provides scalable foundation for advanced role management features
- **User Experience:** Clear feedback and reliable role assignment workflows

### Consider PM2 WSL Networking Investigation
**Description:** Investigate why pm2 has networking binding issues in WSL while direct node works fine
**Acceptance Criteria:**
- Research pm2 WSL networking limitations
- Determine if pm2 can be configured to work properly in WSL
- If fixable, update development scripts to use pm2 for consistency with production
- If not fixable, document the limitation and keep current node-based approach


### Refactor Duplicate "No Tribes" Messages
**Description:** Consolidate duplicated "no tribes" messages that appear in multiple places in the codebase
**Current Issue:** The "no tribes have been added" message appears in at least 4 different locations with different text
**Locations:**
- app.js line ~1008 (castlist2 command - components v2)
- app.js line ~1110 (castlist2 button handler - components v2)
- app.js line ~2759 (castlist command - legacy embed)
- app.js line ~3340 (castlist button handler - legacy embed)
**Acceptance Criteria:**
- Create a centralized constant or function for the "no tribes" message
- Update all locations to use the same message text
- Ensure message format works for both components v2 and legacy embeds
- Message should guide users to: `/prod_menu` > 🔥 Tribes Button > 🛠️ Add Tribe

### Safari Map Explorer System (MVP4)
**Description:** Grid-based map exploration system allowing players to upload images and explore them through Discord channels
**Documentation:** See [docs/features/SafariMapExplorer.md](docs/features/SafariMapExplorer.md) for complete technical specification
**Current Status:** Planning Phase - Technical architecture documented

**Core Features:**
- Image upload and automatic grid overlay generation
- Coordinate system (A1, B2, C3, etc.) with Discord channel creation
- Player movement between grid locations
- Visual progress tracking and fog of war
- Item/NPC placement at coordinates

**Technical Approach:**
- Node.js with Canvas API for image processing
- Lazy channel creation to manage Discord limits
- Grid coordinate data stored in safariContent.json
- Player progress tracked in playerData.json

**Implementation Phases:**
1. Core image processing and grid overlay
2. Channel management and movement system
3. Exploration features (fog of war, items)
4. Advanced features (multi-floor, NPCs, quests)

**Priority:** Medium-High (Major feature expansion for Safari system)

### Safari Dynamic Content System - Phase 2 (MVP2)
**Description:** Advanced Safari dynamic content management with conditional logic, shop systems, and enhanced action types
**Current Status:** Phase 1 (MVP1) Complete ✅ - Basic button creation, currency management, and action execution operational

**🔧 PHASE 2: Advanced Action Types & Conditional Logic**
**Scope:** Expand Safari beyond basic actions to intelligent, conditional content management
**Implementation:**
- **Conditional Logic Actions**: If/then logic for button behavior based on user state, currency, roles, or previous interactions
- **Advanced Action Types**: 
  - `conditional_display`: Show different text based on conditions
  - `currency_check`: Verify currency before allowing actions
  - `role_requirement`: Require specific roles for button access
  - `random_outcome`: Random results with weighted probabilities
  - `multi_step_sequence`: Chain multiple actions with branching logic
- **Enhanced Currency System**:
  - Currency spending/earning actions
  - Currency-gated content access
  - Multi-currency support (points, tokens, coins, etc.)
- **Shop System Foundation**:
  - Purchase actions that deduct currency
  - Inventory management for purchased items
  - Shop button templates for common purchase flows
- **Action Chaining & Sequences**:
  - Complex multi-button workflows
  - State persistence across button interactions
  - Progress tracking for multi-step processes

**Technical Architecture:**
- **Action Engine Expansion**: Extend `safariManager.js` with conditional logic processing
- **State Management**: Enhanced player state tracking for complex interactions
- **Action Validator**: Pre-execution validation for conditions and requirements
- **Result Generator**: Dynamic response generation based on action outcomes

**Acceptance Criteria:**
- Conditional actions execute based on user state (currency, roles, history)
- Shop system allows currency-based purchases with inventory tracking
- Random outcome actions provide weighted probability results
- Multi-step sequences maintain state across interactions
- Action chaining supports complex workflow creation
- Currency system supports multiple currency types per server
- All actions maintain backwards compatibility with MVP1 buttons

**Benefits:**
- **Server Hosts**: Create sophisticated interactive experiences and games
- **Players**: Engaging, dynamic content that responds to their actions and progress
- **Scalability**: Foundation for complex ORG mini-games and interactive storylines
- **Community**: Rich content creation possibilities for server customization

### Tech Debt - Legacy Code Cleanup
**castlist2 References Cleanup:**
- Remove all `castlist2_` custom IDs, function names, and comments since /castlist2 became /castlist
- Update navigation handlers to use `castlist_` prefixes for consistency

**Post React Button Code Duplication:**
- Refactor prod_timezone_react and prod_pronoun_react handlers in app.js 
- Replace duplicated legacy player_set_timezone/player_set_pronouns code with calls to modern playerManagement.js system

### Remove Legacy /castlist2 Command  
**Description:** Clean up retired commands like /castlist2 now that Components V2 is the default castlist system
**Acceptance Criteria:**
- Remove /castlist2 command definition from commands.js
- Remove any references to castlist2 in help text
- Ensure all castlist functionality uses the modern Components V2 system
- Update any documentation references

### Timezone React Webhook Token Fix Validation
**Description:** Verify the timezone react webhook token expiration fix is working correctly in production
**Acceptance Criteria:**
- Users can successfully use timezone react buttons without "Unknown Webhook" errors
- No "headers already sent" errors in production logs
- Timezone role assignment works reliably

## MEDIUM Priority

### BUG: Cannot Remove Castlist with Deleted Discord Role
**Description:** When a Discord role is deleted from the server, any castlist containing that role becomes impossible to remove through the UI
**Current Issue:** The "Clear Tribe" functionality likely fails when trying to reference a non-existent role, leaving the castlist in a broken state
**User Impact:** Admins cannot clean up broken castlists after role deletion, requiring manual data manipulation
**Acceptance Criteria:**
- Add error handling to detect deleted/missing roles in castlists
- Allow removal of castlists containing non-existent roles
- Show clear error messages indicating the role no longer exists
- Provide option to "Force Remove" broken castlists
- Consider adding validation on startup to flag orphaned role references
**Workaround:** Currently requires manual editing of playerData.json to remove the castlist entry

### Emoji Handling Separation (DONE)
**Description:** Remove emoji generation from /add_tribe command and create dedicated emoji management system
**Acceptance Criteria:**
- Remove automatic emoji creation from /add_tribe workflow
- Tribes can be created without emojis initially
- Existing emoji functionality preserved for backward compatibility
- Update documentation to reflect new emoji workflow

### Emoji Generation Button
**Description:** Add dedicated button to /prod_menu that generates emojis for a given Role (tribe)
**Acceptance Criteria:**
- New "Generate Emojis" button in /prod_menu tribe management section
- Reuse existing emoji handling code from /add_tribe
- Support role/tribe selection for emoji generation
- Provide feedback on emoji creation success/failure
- Handle Discord emoji limits gracefully

### Emoji Deletion Management
**Description:** Automated emoji cleanup when tribes are removed
**Acceptance Criteria:**
- Automatic emoji deletion when using "Remove Tribe" button
- Manual emoji deletion option in tribe management
- Confirmation dialog before emoji deletion
- Cleanup of orphaned emojis (emojis without corresponding tribes)
- Preserve custom emojis not created by CastBot

### Player Profile Preview Component
**Description:** Reusable code component that shows players a preview of their castlist profile
**Acceptance Criteria:**
- Standalone player profile preview function
- Shows how player appears in castlists (name, pronouns, timezone, age, vanity roles)
- Reusable across application screens and profile editing
- Real-time preview updates when player makes changes
- Consistent formatting with actual castlist display

### Redesigned Menus Using Components V2
**Description:** Replace traditional Discord embeds with modern Components V2 alternatives
**Acceptance Criteria:**
- Convert all embed-based menus to Components V2
- Improved mobile experience and modern UI
- Consistent design language across all bot interactions
- Better accessibility and interaction patterns
- Maintain existing functionality while improving UX

### ✅ Enhanced Server Usage Analytics Integration with Feature Detection - COMPLETED
**Completed:** August 10, 2025
**Description:** Comprehensive server analytics dashboard with intelligent feature detection and traffic light activity system
**Implementation:** Extended serverUsageAnalytics.js with advanced feature detection, server install tracking, and modern Components V2 UI
**Documentation:** Complete system documented in [docs/architecture/Analytics.md](docs/architecture/Analytics.md)

**✅ Implemented Features:**
- **🚦 Traffic Light Activity System:** 🟢 Recent (24h), 🟠 Moderate (4d), 🔴 Inactive visual indicators
- **🔍 Intelligent Feature Detection:** Automatically detects usage of Castlist, Season Apps, Safari, Cast Ranking, R4R, Player Emojis, Vanity Roles
- **📅 Server Install Tracking:** Latest 3-5 server installations with timestamps and owner information
- **📊 42-Day Activity Analysis:** Extended from 6-week to configurable 42-day window
- **🎨 Components V2 UI:** Professional Discord interface with block quote headings, code tick formatting, and refresh functionality
- **📋 Restructured Layout:** Server Installs → Server Rankings → Usage Analytics with markdown separators

**Current Output Format:**
```
> ## 🆕 Most Recent Server Installs (Latest 3)
📅 **EpochORG S4: Ancient Egypt** ([12:17 PM] Sun Aug 10, Mike (@mpschettig))

> ## 🏆 Server Rankings
`🥇 EmeraldORG: Fire Emblem T...: 8,042 interactions 🟢`
   └ 38 users • 🖼️ castlist (x70) • 📝 szn apps (x22) • 🦁 safari (x3379) • 🏆 ranking (x3) • ✨ vanity roles (x2)
   └ Last Activity: [12:38PM] Sun 10 Aug 25 | Smiles

> ## 📈 Server Usage Analytics
📊 **Total Interactions**: 1,477
👥 **Unique Users**: 9
🏰 **Active Servers**: 9
⏱️ **Period**: Last 42 days
📈 **Showing**: Top 9 of 9 servers
```

**Technical Implementation:**
- **Multi-format log parsing:** Supports both legacy 4-part and current 5-part log formats
- **Safari action normalization:** Intelligent handling of Safari-specific action types
- **Feature detection algorithms:** Pattern matching for button IDs and slash commands
- **Character limit optimization:** Dynamic content truncation with safety buffers
- **Performance optimizations:** Streaming log parsing and efficient timestamp handling

**Benefits Achieved:**
- **Real-time server activity monitoring** with visual traffic light indicators
- **Feature adoption tracking** shows exactly which CastBot features each server uses
- **Server health assessment** through activity level calculations
- **Installation tracking** for monitoring bot growth and new server onboarding
- **Professional UI** using Discord's latest Components V2 architecture
- **Enhanced troubleshooting** with detailed activity timestamps and user information

### Enhanced Application Tracking System
**Description:** Proper season-to-application tracking with support for multiple applications across multiple seasons
**Acceptance Criteria:**
- Track multiple players with multiple applications per server
- Support applications across different seasons/castlists
- Historical application data preservation
- Application status tracking (pending, accepted, rejected, withdrawn)
- Cross-season applicant analytics and insights

### Application Management System
**Description:** Comprehensive application management tools including deletion capabilities
**Acceptance Criteria:**
- Delete application configuration buttons in /prod_menu
- Bulk application data cleanup tools
- Archive vs. delete options for historical data
- Confirmation workflows for destructive actions
- Audit logging for application management actions

### User Interaction Analytics System
**Description:** Simple, low-risk analytics system to track user interactions with CastBot's button-based interface
**Current CastBot Interface:** 2 slash commands (/castlist, /menu) + 25+ button categories (production menu, player management, castlist navigation, applications, ranking)

**Core Tracking Requirements:**
- Track which user (username) clicked which button in which server
- Monitor /castlist and /menu slash command usage
- Simple log format: `[ANALYTICS] timestamp | username in servername | action | details`

**Implementation Plan:**
1. **Phase 1: Simple File Logging (Low Risk)**
   - Create `analyticsLogger.js` module for user interaction tracking
   - Add logging to slash command handlers (/castlist, /menu)
   - Add logging to button interaction handlers in app.js
   - Log format: `[ANALYTICS] 2024-01-15T10:30:00Z | player1 in MyServer | BUTTON_CLICK | show_castlist2_default`

2. **Phase 2: Live Monitoring Script**
   - Create `npm run live-analytics` script using `tail -f analytics.log | grep '\[ANALYTICS\]'`
   - Real-time viewing of user interactions for development monitoring

3. **Phase 3: Optional Data Collection Enhancement**
   - Consider adding analytics section to existing playerData.json structure
   - Track usage frequency and user engagement patterns per server
   - Maintain low-risk, file-based approach

**Key Button Categories to Track:**
- Production menu system (prod_season_applications, prod_manage_*, admin_manage_player)
- Player management (player_set_*, admin_set_*)  
- Castlist navigation (show_castlist2*, castlist2_nav_*)
- Application & ranking system (application_button_*, rank_*)

**Benefits:**
- Understand actual user behavior patterns
- Identify most/least used features
- Monitor server activity and engagement
- Simple implementation with minimal production risk

### Season Application Builder Features
**Description:** A comprehensive application system for prospective players
**Documentation:** See [docs/features/SeasonAppBuilder.md](docs/features/SeasonAppBuilder.md) for complete feature documentation, technical design, and implementation details
**Status:** In design phase - refer to docs/features/SeasonAppBuilder.md for current progress and sprint planning

### Environment-Aware Logging Migration
**Description:** Migrate from direct console.log to structured, environment-aware logging
**Documentation:** See [docs/architecture/LoggingStandards.md](docs/architecture/LoggingStandards.md) for implementation guide
**Status:** Phase 1 complete ✅ - Logger utility created and tested
**Priority:** High - Improves production performance and debugging

#### Phase 2: Feature-by-Feature Migration
- **Scope:** Add new logger calls alongside existing console.log statements
- **Features to migrate:** Safari (30 handlers), Menu (40 handlers), Button core (20 handlers)
- **Approach:** One feature at a time, test thoroughly, keep old logs during transition
- **Risk:** Low - purely additive, no existing code changes

#### Phase 3: Legacy Log Cleanup  
- **Scope:** Remove old console.log statements after new logging validated
- **Prerequisites:** Phase 2 complete, extensive testing in production
- **Timeline:** 2-3 weeks after Phase 2 deployment
- **Risk:** Medium - requires careful removal of deprecated logs

**Benefits:**
- **Production Performance:** Debug logs only in development
- **Better Troubleshooting:** Structured logs with timestamps and feature categories
- **Emergency Debug Mode:** FORCE_DEBUG=true for production issues
- **Log Filtering:** Feature-specific log analysis

### Enhanced Button Interaction Logging
**Description:** Improve button interaction logging with human-readable labels
**Documentation:** See [docs/architecture/ButtonInteractionLogging.md](docs/architecture/ButtonInteractionLogging.md) for complete technical analysis
**Acceptance Criteria:**
- Extract and log button labels/emojis from Discord interaction payloads
- Replace cryptic custom_ids with human-readable descriptions in logs
- Maintain backward compatibility with existing logging
- Minimal performance impact
**Benefits:**
- Better debugging with readable button names
- Improved analytics for button usage
- Easier correlation between user reports and logs

### Enhanced Tribe Ordering Features
**Description:** Implement advanced tribe ordering options beyond user-first display
**Acceptance Criteria:**
- Alphabetical tribe ordering option
- Size-based tribe ordering (largest/smallest first)
- Custom tribe ordering (admin-defined sequence)
- Per-castlist ordering preferences

### Components V2 Advanced Features
**Description:** Leverage more Discord Components V2 capabilities for enhanced UX
**Acceptance Criteria:**
- Implement advanced component types (forms, advanced sections)
- Enhanced mobile optimization
- Better accessibility features
- Advanced theming options

## LOW Priority

### Local Development Infrastructure Migration
**Description:** Create plan for moving local development environment to Lightsail infrastructure for consistency
**Acceptance Criteria:**
- Development environment mirrors production setup
- Automated development environment provisioning
- Consistent testing environment across team
- Documentation for new development workflow

### Multi-Guild Analytics Dashboard
**Description:** Enhanced analytics with cross-guild insights and trends
**Acceptance Criteria:**
- Growth metrics across all guilds
- Usage pattern analysis
- Feature adoption tracking
- Performance benchmarking

### Advanced Permission System
**Description:** More granular permission controls beyond current role-based system
**Acceptance Criteria:**
- Custom permission roles (not just admin/manage roles)
- Per-feature permission controls
- Audit logging for admin actions
- Permission inheritance and delegation

### Backup and Recovery System
**Description:** Automated backup system for player data and configuration
**Acceptance Criteria:**
- Scheduled automatic backups
- Point-in-time recovery capability
- Cross-region backup storage
- Automated backup testing and validation

### Voice Channel Integration
**Description:** Integrate with Discord voice channels for ORG/Survivor game coordination
**Acceptance Criteria:**
- Tribe-based voice channel creation
- Automated voice channel permissions based on tribes
- Voice activity tracking and analytics
- Integration with existing castlist system

## Future Tech Debt Cleanup

### Remove Old Component Calculation Logic
**Description:** Clean up old component limit checking and separator-stripping logic that's been replaced by 8-player pagination
**Acceptance Criteria:**
- Remove commented-out calculation code in castlistV2.js
- Simplify component counting functions
- Update documentation to reflect new pagination-only approach
- Performance testing to ensure no regression

### Clean Up Disabled Slash Commands - DETAILED ANALYSIS COMPLETE
**Description:** Remove underlying code for slash commands that have been moved to /prod_menu interface

**⚠️ IMPLEMENTATION CAUTION:** This cleanup requires careful verification that all functionality is preserved in the menu system before deletion. Test each removed command's functionality through the menu interface after removal.

**✅ ACTIVE COMMANDS (3 total - These should stay):**
| Command | Lines | Status | Description |
|---------|-------|--------|-------------|
| `castlist` | ~100 | ✅ **KEEP** | Active slash command that displays dynamic castlist using Components V2 |
| `menu` | ~100 | ✅ **KEEP** | Active unified menu - shows player menu for users, admin menu for admins |
| ~~`set_players_age`~~ | ~80 | ❌ **REMOVED** | Bulk age setting moved to `/menu` → Manage Players |

**❌ REMOVABLE COMMAND HANDLERS (16 total - ~1,285 lines of code):**

**📖 Static Documentation (1 command):**
- `getting_started` (~70 lines) - Static FAQ embed with setup instructions - moved to menu system

**🔧 Admin Commands Moved to Menu System (9 commands):**
- `clear_tribe` (~135 lines) - Clears specific tribe from castlist
- `pronouns_add` (~65 lines) - Adds pronoun roles to server
- `remove_pronouns` (~60 lines) - Removes pronoun roles (misnamed handler)
- `timezones_add` (~95 lines) - Adds timezone roles with UTC offsets
- `timezones_remove` (~75 lines) - Removes timezone roles
- `add_tribe` (~65 lines) - Adds tribe role to castlist
- `pronouns_remove` (~65 lines) - Removes pronoun roles (correctly named handler)
- `setup_castbot` (~145 lines) - Auto-creates standard pronoun/timezone roles
- `setup_tycoons` (~50 lines) - Special setup for Tycoons game mode
- `apply_button` (~45 lines) - Creates application buttons for recruitment

**👤 Player Commands (3 commands - Not registered, legacy):**
- `player_set_pronouns` (~95 lines) - Players self-assign pronouns via reactions
- `player_set_timezone` (~95 lines) - Players self-assign timezone via reactions  
- `player_set_age` (~45 lines) - Players set their own age

**🗂️ Legacy/Orphaned Commands (3 commands):**
- `react_timezones` (~90 lines) - Creates timezone reaction interface (not in commands.js)
- `castlist2` (~100 lines) - Identical to `castlist` command (duplicate functionality)

**🔍 ORPHANED DEFINITIONS (1 total):**
- `CLEAR_TRIBEALL_COMMAND` - Defined in commands.js but no handler in app.js

**Acceptance Criteria:**
1. **Pre-Cleanup Verification:**
   - Test each command's functionality through /menu interface before removing handlers
   - Verify all admin functions accessible via Production Menu
   - Confirm player functions work through Player Management interface
   - Document any functionality gaps discovered

2. **Handler Removal:**
   - Remove all 16 command handlers from app.js (~1,285 lines total)
   - Remove `CLEAR_TRIBEALL_COMMAND` definition from commands.js
   - Keep the 2 active command handlers: `castlist`, `menu`

3. **Safety Measures:**
   - Create backup branch before cleanup
   - Remove handlers in small batches with testing between each batch
   - Test full menu functionality after each removal batch
   - Monitor production for any regression issues

4. **Post-Cleanup Tasks:**
   - Update help text and documentation to reflect button-based workflow
   - Remove any dead imports or utility functions only used by removed commands
   - Run full regression testing suite
   - Update command count in documentation

**Claude Implementation Instructions:**
1. **Phase 1:** Remove static/documentation commands first (`getting_started`)
2. **Phase 2:** Remove legacy player commands (`player_set_*`, `react_*`)
3. **Phase 3:** Remove orphaned/duplicate commands (`castlist2`, `react_timezones`)
4. **Phase 4:** Remove admin commands moved to menus (test menu functionality between each removal)
5. **Phase 5:** Final cleanup of imports and utility functions

---

### ⚠️ CRITICAL BUTTON HANDLER DEPENDENCIES ANALYSIS - COMPLETED JANUARY 2025

**Analysis Request:** "Some of my buttons appear to call old /slash commands they were derived from. Can you do some deep thinking and analysis of the button event handlers, and if / how / what code they call, and whether any of it is any of the above code you flagged for removal."

**🚨 IMMEDIATE ISSUE FIXED:**
- **Location:** Safari `safari_add_action_` handler (app.js:5622)
- **Issue:** `guildId is not defined` error when calling `listCustomButtons(guildId)`
- **Fix Applied:** Added `const guildId = req.body.guild_id;` to handler scope
- **Status:** ✅ **RESOLVED**

**🔴 CRITICAL DEPENDENCIES DISCOVERED:**

**Button Handlers That Duplicate Slash Command Logic:**

1. **`prod_timezone_react` Handler (app.js:5803-5904)**
   - **Code Duplication:** 101 lines of IDENTICAL logic from `player_set_timezone` slash command
   - **Shared Functions:** `getGuildTimezones()`, reaction message creation, emoji mapping
   - **Status:** ⚠️ **CANNOT REMOVE `player_set_timezone` SLASH COMMAND** until this is refactored
   - **Refactoring Required:** Extract shared logic into utility function

2. **`prod_pronoun_react` Handler (app.js:5905-6002)**
   - **Code Duplication:** 97 lines of IDENTICAL logic from `player_set_pronouns` slash command  
   - **Shared Functions:** `getGuildPronouns()`, reaction message creation, emoji mapping
   - **Status:** ⚠️ **CANNOT REMOVE `player_set_pronouns` SLASH COMMAND** until this is refactored
   - **Refactoring Required:** Extract shared logic into utility function

**🟢 SAFE BUTTON HANDLERS (No Dependencies):**
- **Safari System:** 15+ handlers (all independent, including dynamic safari buttons)
- **Production Menu:** 25+ handlers (admin_manage_*, prod_setup, etc.)
- **Castlist Navigation:** All Components V2 navigation handlers
- **Application System:** All application and ranking handlers
- **Player Management:** All modern playerManagement.js-based handlers

**📊 IMPACT SUMMARY:**

**Slash Commands That CANNOT Be Safely Removed:**
- `player_set_timezone` (~95 lines) - **BLOCKED by prod_timezone_react dependency**
- `player_set_pronouns` (~95 lines) - **BLOCKED by prod_pronoun_react dependency**

**Slash Commands Safe to Remove:** 14 of 16 flagged commands (~1,095 lines)
**Blocked by Dependencies:** 2 of 16 flagged commands (~190 lines)

**🛠️ REQUIRED REFACTORING PLAN:**

**Step 1: Extract Shared Logic**
```javascript
// Create new utility functions in storage.js or separate module:
async function createTimezoneReactionMessage(guildId, channelId, token)
async function createPronounReactionMessage(guildId, channelId, token)
```

**Step 2: Update Button Handlers**
- Replace duplicated code in `prod_timezone_react` with utility call
- Replace duplicated code in `prod_pronoun_react` with utility call
- Test both button handlers work identically to current behavior

**Step 3: Update Slash Commands**  
- Replace duplicated code in `player_set_timezone` with same utility call
- Replace duplicated code in `player_set_pronouns` with same utility call
- Verify identical functionality between slash commands and button handlers

**Step 4: Safe Removal**
- After refactoring, both slash command handlers can be safely removed
- Button handlers will continue working independently
- Total code removal: ~1,285 lines as originally planned

**🎯 CONCLUSION:**
The button handler dependency analysis reveals that 40+ button handlers are completely independent, but 2 critical button handlers (`prod_timezone_react` and `prod_pronoun_react`) contain identical duplicated code from their corresponding slash commands. These dependencies MUST be refactored before any slash command removal to prevent breaking functionality. The refactoring will actually improve code quality by eliminating the ~200 lines of duplicated logic while preserving all functionality.

---

## Claude Recommendations Section

### Performance & Scalability
1. **Database Migration**: Consider migrating from JSON file storage to a proper database (PostgreSQL/MongoDB) for better performance with 1000+ servers
2. **Caching Layer**: Implement Redis caching for frequently accessed data (guild info, member lists)
3. **API Rate Limiting**: Add intelligent rate limiting to prevent Discord API exhaustion during bulk operations
4. **Horizontal Scaling**: Design architecture to support multiple bot instances for high availability

### User Experience Enhancements
5. **Onboarding Flow**: Create guided setup wizard for new servers to configure pronouns, timezones, and first tribe
6. **Help System**: Interactive help system with contextual guidance and video tutorials
7. **Template System**: Pre-built server templates for common ORG formats (Survivor, Big Brother, etc.)
8. **Mobile App**: Companion mobile app for players to manage their profiles and view castlists

#### **Nice to Have (Challenge Dependent)**

9. **Reusable Create/Update Interface Framework**: Universal MVC-pattern interface system
   - **Scope**: Create reusable framework for all CRUD operations (stores, items, safari settings, future features)
   - **Architecture**: MVC pattern or dedicated management class
   - **UI Pattern**: Container → Nested Buttons and Listviews → Smart Modal System
   - **Modal Intelligence**: 
     - Text Input modals for free-form data entry
     - String Select menus for <25 selectable options (auto-detection)
     - Real-time Container updates after modal submission
   - **Target Implementations**:
     - Store Create/Edit interface
     - Item Create/Edit interface  
     - Enhanced Safari Customize interface (replace comma-separated fields)
     - Future features requiring complex data entry
   - **Benefits**: Consistent UX across all admin interfaces, maintainable code, scalable for future features
   - **Priority**: Nice to have - would significantly improve admin UX and code maintainability

10. **Legacy Safari Customize Enhancement**: Replace single modal with Container-based UI
   - **Current Issue**: 5-field modal limit forces comma-separated values (e.g., "75,50,25" for probabilities)
   - **Implementation**: Use the Reusable Create/Update Interface Framework (item #9 above)
   - **Priority**: Superseded by framework approach above

### Advanced Features
10. **Game Integration**: Direct integration with popular ORG platforms (Tengaged, etc.) for automatic data sync
11. **Live Game Features**: Real-time voting systems, challenge tracking, and elimination ceremonies
12. **Statistics & Analytics**: Player performance tracking across multiple seasons/games
13. **Social Features**: Player networking, season alumni connections, host networking

### Technical Improvements
14. **TypeScript Migration**: Convert codebase to TypeScript for better type safety and developer experience
15. **Testing Suite**: Comprehensive unit and integration tests with CI/CD pipeline
16. **Monitoring & Alerting**: Production monitoring with automated alerting for issues
17. **Docker Containerization**: Containerize application for easier deployment and scaling

### Business & Growth
18. **Premium Features**: Subscription tier with advanced features (custom themes, priority support, advanced analytics)
19. **Partner Program**: Integration partnerships with ORG hosting platforms and communities
20. **API Ecosystem**: Public API for third-party integrations and community-built tools
21. **Multi-Language Support**: Internationalization for global ORG community expansion

---

*Last Updated: June 11, 2025*
*This backlog is continuously updated based on user feedback and development priorities*