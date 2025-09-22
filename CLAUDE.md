# CLAUDE.md

This file provides guidance to Claude Code when working with CastBot. This is a high-level navigation document - follow the references to detailed documentation.

## 🔴 Production Safety - NEVER Do These

1. **Use unapproved PM2 commands** (see approved list below)
2. **Modify production without explicit permission**
3. **Use `pm2 delete` followed by `pm2 start`** - This loses environment context
4. **Create new PM2 processes** with `pm2 start app.js --args` 
5. **Ignore "Discord client public key" errors** - Environment not loaded

## 🔴 CRITICAL: Components V2 Types - ALWAYS USE THESE

**YOU MUST USE THESE EXACT TYPES - NO EXCEPTIONS:**
```javascript
// ✅ VALID Components V2 Types:
type: 17  // Container (wrapper for all components)
type: 10  // Text Display (for content/text)
type: 14  // Separator (visual divider)
type: 1   // Action Row (contains buttons/selects)
type: 2   // Button (inside Action Row)
type: 3   // String Select
type: 4   // Text Input (in modals)
type: 5   // User Select
type: 6   // Role Select  
type: 7   // Mentionable Select
type: 8   // Channel Select
type: 9   // Section (with ONE child component only!)
type: 11  // Thumbnail (as Section accessory)
type: 18  // Label (NEW - for modal components)

// ❌ INVALID/DEPRECATED:
type: 13  // WRONG - Invalid separator (use type 14)
// ActionRow + TextInput in modals is DEPRECATED - use Label (type 18)
```

**UPDATE_MESSAGE Rules:**
- NEVER include `ephemeral: true` in UPDATE_MESSAGE responses
- NEVER include `flags` field in UPDATE_MESSAGE responses
- Always return the full Container structure

## 🚨 MANDATORY AFTER ANY CODE CHANGES - RESTART DEV

**🔴 CRITICAL: ALWAYS restart development after making code changes!**

```bash
# MANDATORY after ANY code change - no exceptions!
./scripts/dev/dev-restart.sh "descriptive commit message"

# For significant features, include Discord notification:
./scripts/dev/dev-restart.sh "Fix safari logic" "Safari navigation working!"
```

**⚠️ This is NOT optional - restart after EVERY code change:**
- ✅ Button handlers, modal handlers, UI changes
- ✅ Configuration changes, data structure updates
- ✅ New features, bug fixes, refactoring
- ✅ ANY modification to .js files

**📝 Always provide descriptive commit messages:**
- ❌ Bad: `./scripts/dev/dev-restart.sh "fix"`
- ✅ Good: `./scripts/dev/dev-restart.sh "Add global command button to player menu"`

**🎯 This replaces manual saves - the script commits your changes automatically**

## 🚀 Quick Start

### Development Workflow
```bash
./scripts/dev/dev-start.sh                  # Start development session (uses node directly)
./scripts/dev/dev-restart.sh "commit msg"   # ⬆️ SEE MANDATORY SECTION ABOVE ⬆️
./scripts/dev/dev-status.sh                 # Check status
./scripts/dev/dev-stop.sh                   # Clean shutdown
tail -f /tmp/castbot-dev.log               # View logs (NOT PM2 in dev!)
```

**⚠️ ENVIRONMENT DIFFERENCES**: Dev uses node directly, Prod uses PM2. See [InfrastructureArchitecture.md](docs/infrastructure/InfrastructureArchitecture.md)

**🔴 Remember: RESTART after ANY code changes (see mandatory section above)**

### Production Deployment

**🚨 CRITICAL: NEVER deploy without explicit user permission!**

**📝 CORRECT DEPLOYMENT PROCESS:**
1. **ALWAYS use WSL deployment scripts** - NOT git commands directly
2. **Dry run first**: `npm run deploy-remote-wsl-dry` (SAFE - no permission needed)
3. **Get permission** from user before actual deployment
4. **Deploy**: `npm run deploy-remote-wsl` (pulls from GitHub, restarts PM2)
5. **Check logs**: `npm run logs-prod` to verify successful deployment

**✅ APPROVED PM2 COMMANDS:**
- `pm2 restart castbot-pm` - Safe, preserves environment
- `pm2 reload castbot-pm` - Zero-downtime restart  
- `pm2 logs` - Read-only, always safe
- `pm2 status/list/info` - Read-only monitoring

**🔴 FORBIDDEN PM2 COMMANDS:**
- `pm2 delete` then `pm2 start` - Loses environment context
- `pm2 start app.js` with arguments - Creates duplicate processes
- `pm2 scale` - Untested, may lose state
- `pm2 resurrect` after delete - Incomplete state restoration

**Deployment Commands (REQUIRE PERMISSION):**
```bash
npm run deploy-remote-wsl      # Full deployment - pulls from GitHub, restarts PM2
npm run deploy-commands-wsl    # Commands only (lower risk)
npm run deploy-remote-wsl-dry  # Preview changes (SAFE - no permission needed)
```

**🔴 NEVER use `git push` directly for production** - The deployment script handles GitHub pulls

### Production Monitoring

**🎯 Ultrathink Health Monitoring** (see [ProductionMonitoring.md](docs/infrastructure/ProductionMonitoring.md)):
```bash
npm run monitor-prod           # Full health dashboard with scoring
npm run monitor-prod-quick     # Essential metrics (fastest)
npm run monitor-prod-memory    # Memory optimization tracking
npm run monitor-prod-alerts    # Alert conditions & recommendations
npm run monitor-prod-cache     # Cache performance analysis
```

**📋 Log Analysis**:
```bash
npm run logs-prod              # Last 100 lines
npm run logs-prod-follow       # Real-time streaming
npm run logs-prod-errors       # Error logs only
npm run logs-prod -- --filter "user ID"  # Filtered logs
```

## ⚠️ Production Environment Variables

**CRITICAL**: Production relies on `.env` file being loaded by dotenv
- PM2 does NOT preserve env vars in its saved state
- After system reboot: ALWAYS verify with `pm2 logs` for errors
- If "You must specify a Discord client public key" error appears: Environment not loaded
- Recovery: Use `pm2 restart castbot-pm` from correct directory

## 📚 Feature Documentation Index

**🚧 Current Work in Progress:**
- **SAFARI CUSTOM EXPERIENCES** → [docs/features/SafariCustomExperiences.md](docs/features/SafariCustomExperiences.md) - Configurable challenge system via Custom Actions
- **ACTIVE SEASON SYSTEM** → [docs/concepts/SeasonLifecycle.md](docs/concepts/SeasonLifecycle.md)
- **CASTLIST V3 INTEGRATION** → [docs/features/CastlistV3-SeasonIntegration.md](docs/features/CastlistV3-SeasonIntegration.md)
- **SEASON SELECTOR** → Reusable component in `seasonSelector.js`
- **CHANGE SEASON BUTTON** → Production Menu header accessory

**Core Systems:**
- **🦁 SAFARI SYSTEM** → [docs/features/Safari.md](docs/features/Safari.md)
- **📋 SEASON APPLICATIONS** → [docs/features/SeasonAppBuilder.md](docs/features/SeasonAppBuilder.md)
- **🏆 CAST RANKING** → [docs/features/CastRanking.md](docs/features/CastRanking.md)
- **🥇 CASTLIST V3** → [docs/features/CastlistV3-AlumniPlacements.md](docs/features/CastlistV3-AlumniPlacements.md)

**Safari Subsystems:**
- **MAP EXPLORER** → [docs/features/SafariMapExplorer.md](docs/features/SafariMapExplorer.md)
- **POINTS SYSTEM** → [docs/features/SafariPoints.md](docs/features/SafariPoints.md)
- **MAP MOVEMENT** → [docs/features/SafariMapMovement.md](docs/features/SafariMapMovement.md)
- **SAFARI PROGRESS** → [docs/features/SafariProgress.md](docs/features/SafariProgress.md)
- **PLAYER LOCATIONS** → [docs/features/PlayerLocationManager.md](docs/features/PlayerLocationManager.md)
- **WHISPER SYSTEM** → [docs/features/WhisperSystem.md](docs/features/WhisperSystem.md)
- **STORE MANAGEMENT** → [docs/features/StoreManagementArchitecture.md](docs/features/StoreManagementArchitecture.md)
- **GLOBAL STORES** (NEW) → Permanent stores in player /menu
- **ROUNDS MENU** (NEW) → Dedicated round management interface
- **STOCK MANAGEMENT** (NEW) → Store inventory limits with per-item stock tracking

**Infrastructure & Deployment:**
- **🌍 INFRASTRUCTURE ARCHITECTURE** → [docs/infrastructure/InfrastructureArchitecture.md](docs/infrastructure/InfrastructureArchitecture.md)
- **📊 ANALYTICS** → [docs/infrastructure/Analytics.md](docs/infrastructure/Analytics.md)

**Enablers & Frameworks:**
- **🔘 BUTTON HANDLER FACTORY** (MANDATORY) → [docs/enablers/ButtonHandlerFactory.md](docs/enablers/ButtonHandlerFactory.md)
- **📋 BUTTON HANDLER REGISTRY** → [docs/enablers/ButtonHandlerRegistry.md](docs/enablers/ButtonHandlerRegistry.md)
- **🎯 MENU SYSTEM ARCHITECTURE** → [docs/enablers/MenuSystemArchitecture.md](docs/enablers/MenuSystemArchitecture.md)
- **🔧 ENTITY/EDIT FRAMEWORK** → [docs/enablers/EntityEditFramework.md](docs/enablers/EntityEditFramework.md)
- **📨 DISCORD MESSENGER** → [docs/enablers/DiscordMessenger.md](docs/enablers/DiscordMessenger.md)
- **🔄 REQUEST SCOPED CACHING** → [docs/enablers/RequestScopedCaching.md](docs/enablers/RequestScopedCaching.md)

**Standards & Patterns:**
- **🎨 COMPONENTS V2** (MANDATORY) → [docs/standards/ComponentsV2.md](docs/standards/ComponentsV2.md)
- **📝 LOGGING STANDARDS** → [docs/standards/LoggingStandards.md](docs/standards/LoggingStandards.md)
- **🔌 DISCORD INTERACTION PATTERNS** → [docs/standards/DiscordInteractionPatterns.md](docs/standards/DiscordInteractionPatterns.md)
- **📊 BUTTON INTERACTION LOGGING** → [docs/standards/ButtonInteractionLogging.md](docs/standards/ButtonInteractionLogging.md)

**UI/UX Design:**
- **📐 LEAN USER INTERFACE DESIGN** → [docs/ui/LeanUserInterfaceDesign.md](docs/ui/LeanUserInterfaceDesign.md)

## 🛠️ Development Standards

### Mandatory Patterns

**Button Handler Factory** - ALL buttons MUST use this pattern:
```javascript
} else if (custom_id === 'my_button') {
  return ButtonHandlerFactory.create({
    id: 'my_button',
    handler: async (context) => { /* your code */ }
  })(req, res, client);
}
```

**🚨 CRITICAL: Button Registration** - ALL buttons MUST be in BUTTON_REGISTRY:
```javascript
// In buttonHandlerFactory.js BUTTON_REGISTRY:
'my_button': {
  label: 'My Button',
  description: 'What this button does',
  emoji: '🔘',
  style: 'Primary',
  category: 'feature_name'
}
```
Missing registration causes "This interaction failed" errors!

**Menu System Architecture** - Track and migrate menus systematically:
```javascript
// Track legacy menus for migration visibility
MenuBuilder.trackLegacyMenu('menu_location', 'Menu description');

// Future: Create menus from registry
const menu = await MenuBuilder.create('menu_id', context);
```

**🚨 CRITICAL: Menu Standards** - Follow these patterns:
- **NEVER build menus inline** - Use MenuBuilder patterns
- **ALWAYS track legacy menus** - Add tracking calls for visibility
- **FOLLOW LeanUserInterfaceDesign.md** - Visual/UX standards
- **CHECK logs for menu usage** - `grep "MENULEGACY"` shows what needs migration

**Components V2** - ALL UI MUST use `IS_COMPONENTS_V2` flag (1 << 15)

**Shared Utilities** - Eliminate code duplication with shared functions:
```javascript
// Example: Store modals use shared utility (eliminates ~120 lines of duplication)
const { createStoreModal } = await import('./safariManager.js');
const modal = createStoreModal(customId, title);
```
- **ALWAYS check for existing utilities** before duplicating modal/UI creation code
- **CREATE shared utilities** when you see repeated patterns (3+ instances)
- **UPDATE shared utilities** to modify all consumers at once

**Pattern Matching** - When implementing "like X", examine X's implementation first:
```bash
grep -B20 -A20 "feature_pattern" app.js
```

### Image Access (WSL)
- Screenshots: `/mnt/c/Users/extre/OneDrive/Pictures/Screenshots 1`
- External: `curl -s "URL" -o /tmp/img.png && Read /tmp/img.png`

### Workflow Requirements
- **Definition of Done**: [docs/workflow/DefinitionOfDone.md](docs/workflow/DefinitionOfDone.md)
- **Dev Workflow**: [docs/workflow/DevWorkflow.md](docs/workflow/DevWorkflow.md)

### Documentation Standards - Mermaid Diagrams

**ALWAYS create Mermaid diagrams when documenting:**
- **New architecture files** → Include class/flowchart diagrams
- **API/interaction flows** → Use sequence diagrams
- **State machines** → Use stateDiagram-v2
- **Data structures** → Use ER diagrams or class diagrams
- **User flows** → Use journey or flowchart diagrams
- **Complex button/menu flows** → Use flowchart with decision points
- **New entity types** → Add to Entity Framework class diagram + ER diagram
- **Feature docs (docs/features/)** → Include system flow in Technical Design section

**Diagram samples**: [docs/mermaid-samples/](docs/mermaid-samples/)

**When NOT to use diagrams:**
- Simple linear processes (just use numbered lists)
- Configuration files (use code blocks)
- Single-function documentation (inline comments suffice)
- README files (unless architecture overview)
- Change logs or release notes

### Tools Without Permission Required
**Claude can execute these without asking:**
- `grep` commands and all Grep tool usage
- `./scripts/dev/dev-restart.sh` 
- `npm run deploy-remote-wsl-dry` (preview only)
- Creating/editing markdown documentation files (*.md)
- Creating Mermaid diagrams in documentation

## 📐 app.js Organization

### Key Imports
```javascript
import { MenuBuilder } from './menuBuilder.js';  // Menu system architecture
import { ButtonHandlerFactory } from './buttonHandlerFactory.js';  // Button management
```

### Golden Rule: app.js is a ROUTER, not a PROCESSOR

**✅ BELONGS in app.js:**
- Express/Discord initialization
- Route handlers (`/interactions`)
- Button routing (`if custom_id === ...`)
- Top-level error handling
- Basic permission checks

**❌ MOVE to modules:**
- Feature implementations
- Data processing
- UI component builders
- Business logic
- Helper functions >20 lines

**Size Targets:**
- Functions: Max 30 lines
- Handler blocks: Max 10 lines
- Total file: <5,000 lines (currently 21,000+)

## ⚠️ Troubleshooting

**"This interaction failed" errors:**
- Quick causes: UPDATE_MESSAGE flags, malformed emojis, Container structure
- Full guide: [docs/troubleshooting/ComponentsV2Issues.md](docs/troubleshooting/ComponentsV2Issues.md)

**Common Issues:**
- Button not working → Check BUTTON_REGISTRY registration (CRITICAL!)
- Missing variables → Ensure context extraction
- Permission errors → Use BigInt for permission checks  
- Menu crashes → Check 5-button limit per ActionRow
- String Select limits → Maximum 25 options
- Invalid emoji format → Use Unicode (🍎) not shortcuts (:apple:)
- Round results ephemeral → Set `ephemeral: false` in ButtonHandlerFactory
- Double handler execution → Missing BUTTON_REGISTRY entry
- Button shows "[🪨 LEGACY]" in logs → Not registered in BUTTON_REGISTRY
- Menu shows "[⚱️ MENULEGACY]" in logs → Needs migration to MenuBuilder
- Menu not tracking → Add `MenuBuilder.trackLegacyMenu()` call

## 🎯 Available Commands

**Player Commands:**
- `/menu` - Main player interface
- `/castlist` - Display dynamic castlist

**Admin Commands:**
- Most functionality via `/menu` → Production Menu

## 📋 Feature Backlog

See [BACKLOG.md](BACKLOG.md) for prioritized features and user stories.

## 🚧 Safari Custom Experiences Implementation Progress

**Project**: Safari Custom Experiences - Configurable challenge system via Custom Actions framework
**Documentation**: [docs/features/SafariCustomExperiences.md](docs/features/SafariCustomExperiences.md)
**Started**: December 2024 - Analysis and design phase completed

### Implementation Phases

#### MANDATORY CORE: Calculate Results Action (1-2 hours) ✅ COMPLETED
- [x] **Extract calculation logic**: Create `calculateSimpleResults()` function from `processRoundResults()`
- [x] **Add action type**: Register "calculate_results" in Custom Action editor
- [x] **Add execution handler**: Handle action execution in `executeButtonActions()`
- [x] **Button registration**: Not needed - Custom Actions use dynamic button handling

#### OPTIONAL FUTURE: Enhanced Action Types (3-4 weeks)
- [ ] **Week 1**: "Determine Event" action + testing
- [ ] **Week 2**: Enhanced "Calculate Results" with event source configuration
- [ ] **Week 3**: "Calculate Attack" action + attack queue integration
- [ ] **Week 4**: "Display Results" action + Discord API integration

#### Phase 2: Trigger System (2 weeks)
- [ ] **Week 1**: "Round Changed" trigger implementation
- [ ] **Week 2**: Context preservation + button integration

#### Phase 3: Integration & Testing (2 weeks)
- [ ] **Week 1**: End-to-end Custom Experience creation
- [ ] **Week 2**: Backwards compatibility testing + documentation

#### Phase 4: Polish & Advanced Features (1-2 weeks)
- [ ] Round conditions implementation
- [ ] Location system improvements
- [ ] Experience template foundations

### Current Status
- ✅ **Analysis Complete**: Safari system architecture fully documented
- ✅ **Design Complete**: All new action types and trigger system designed
- ✅ **Documentation Complete**: Comprehensive design document created
- ✅ **Core Implementation Complete**: Calculate Results action fully implemented and functional
- ⏳ **Next**: Optional advanced features (Determine Event, Calculate Attack, etc.)

### Key Technical Insights Discovered
- Safari harvest calculations are NOT stored permanently (exist only during round processing)
- Round resolution order: Harvest → Attacks → Data Persistence → Display
- Probability system uses linear interpolation with only 3 config points for unlimited rounds
- Custom Actions framework already supports most needed functionality
- Experience Templates can be achieved with locationless Custom Actions

---

For detailed information on any topic, follow the documentation references above.