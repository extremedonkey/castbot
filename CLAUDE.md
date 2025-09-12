# CLAUDE.md

**🌿 Current Branch: `castlistV3`** - Working on Castlist V3 redesign
**📝 Git Note**: User needs assistance with git operations and production deployment

This file provides guidance to Claude Code when working with CastBot.

## 🔴 Critical Rules & Patterns

### 1. Discord Components V2 is MANDATORY
- **Knowledge cutoff warning**: Discord Components V2 is the current best practice in discord UI design and was introduced AFTER Claude's training
- **ALWAYS consult** → [docs/architecture/ComponentsV2.md](docs/architecture/ComponentsV2.md) before ANY Discord UI
- **NEVER use legacy components** - User explicitly stated these are "poor architecture"
- See full Discord limitations and UI standards below

### 2. Button Handler Factory Pattern is REQUIRED  
- **ALL buttons MUST** use ButtonHandlerFactory pattern
- **ALL buttons MUST** be registered in BUTTON_REGISTRY
- **NEVER create inline handlers** - Use the factory pattern
- Details → [docs/architecture/ButtonHandlerFactory.md](docs/architecture/ButtonHandlerFactory.md)

### 3. app.js is a ROUTER, not a PROCESSOR
- **Route requests only** - Don't implement logic in app.js
- **Max 30 lines per function** in app.js
- **Move business logic** to appropriate modules
- **Import and delegate** to specialized handlers
- Target: <5,000 lines (currently 21,000+)

### 4. Data Structure Patterns
- **Primary stores**: `playerData.json` and `safariContent.json`
- **ALWAYS use storage.js** for data operations - never direct file access
- **Never expose secrets** in data or logs

### 5. Production Safety
- **NEVER deploy without explicit permission**
- **NEVER use `pm2 delete` followed by `pm2 start`**
- **ALWAYS use approved deployment scripts**

## 🚀 Production & Deployment

### Safe Commands (No Permission Needed)
```bash
# Development
./scripts/dev/dev-restart.sh "commit msg"   # After EVERY code change
./scripts/dev/dev-status.sh                 # Check status
pm2 logs castbot-dev-pm                     # View logs

# Read-only Production
npm run logs-prod                           # View production logs
npm run deploy-remote-wsl-dry               # Preview changes (SAFE)
pm2 status/list/info                        # Monitoring only
```

### Deployment (REQUIRES PERMISSION)
```bash
npm run deploy-remote-wsl      # Full deployment from GitHub
npm run deploy-commands-wsl    # Commands only (lower risk)
```

**📝 DEPLOYMENT PROCESS:**
1. **Dry run first**: `npm run deploy-remote-wsl-dry` (preview)
2. **Get permission** from user
3. **Deploy**: `npm run deploy-remote-wsl`
4. **Check logs**: `npm run logs-prod`

### Forbidden Commands
- `pm2 delete` + `pm2 start` - Loses environment context
- Direct `git push` to production
- Creating new PM2 processes with `pm2 start app.js --args`
- `pm2 scale` - Untested, may lose state
- `pm2 resurrect` after delete - Incomplete restoration

### Environment Recovery
If "Discord client public key" error appears:
```bash
pm2 restart castbot-pm  # From correct directory with .env
```

## ⚠️ Discord Limitations & Component Counting

### Hard Limits
- **40 components per message** - Discord rejects if exceeded
- **25 options per select menu** - Maximum selection choices
- **4000 characters total** - Across ALL components in message
- **5 buttons per Action Row** - Layout constraint
- **5 components per modal** - Now includes select menus (Sept 2025)

### Component Counting Rules
```javascript
// Each counts as 1 component:
- Container (type 17)
- Section (type 9)  
- Text Display (type 10)
- Separator (type 14)
- Action Row (type 1)
- Each Button (type 2)
- Select Menu (type 3-8)
- Thumbnail (type 11) - Even as accessory!
- Label (type 18) - Modal wrapper (Sept 2025)

// CastBot's counting function:
function calculateComponentsForTribe(playerCount, includeSeparators) {
  const playerComponents = playerCount * 3; // Section + TextDisplay + Thumbnail
  const separatorCount = includeSeparators ? playerCount - 1 : 0;
  const overhead = 10-12; // Container, headers, navigation
  return playerComponents + separatorCount + overhead;
}

// Safe limits:
- 8 players per page = ~34-36 components (safe under 40)
- 10-12 store items with buttons
- 5-6 questions with management buttons
- 3-4 select menus in modals (with Labels)
```

### Component Counting Tools
- `countComponents()` in castlistV2.js - Recursive counter
- `calculateComponentsForTribe()` - Castlist-specific
- Console warnings at 35+ components
- Automatic truncation for stores/items

## 💾 Data Architecture

### Core Data Stores
- **playerData.json** - Player profiles, settings, game state, castlists
- **safariContent.json** - Safari configuration, items, stores, maps

### Data Access Pattern
```javascript
// ✅ ALWAYS use storage.js
import { loadPlayerData, savePlayerData } from './storage.js';
const playerData = await loadPlayerData();
// Make changes
await savePlayerData(playerData);

// ❌ NEVER direct file access
const data = JSON.parse(fs.readFileSync('playerData.json'));
```

### Storage.js Interface
- `loadPlayerData()` / `savePlayerData()` - Player data operations
- `loadSafariContent()` / `saveSafariContent()` - Safari data operations
- Built-in backup and error recovery
- Atomic writes to prevent corruption
- Automatic file locking

## 🎨 User Interface Standards

### Discord Components V2 (MANDATORY)
**⚠️ CRITICAL**: Discord Components V2 was introduced AFTER Claude's knowledge cutoff.

**Required Reading**:
1. → [docs/architecture/ComponentsV2.md](docs/architecture/ComponentsV2.md) - Complete reference
2. → [docs/troubleshooting/ComponentsV2Issues.md](docs/troubleshooting/ComponentsV2Issues.md) - Common fixes

**Quick Reference**:
```javascript
// ❌ WRONG Types - DO NOT USE
type: 6   // Role Select (often confused with String Select - use type 3!)
type: 13  // Invalid separator (use type 14!)
type: 5   // No "Paragraph" type exists

// ⚠️ If you're using 'embed' or 'content' fields:
// STOP! You're using legacy Components V1
// The content and embeds fields will no longer work
// Use Text Display (type 10) and Container (type 17) as replacements
```

**UPDATE_MESSAGE Rules:**
- NEVER include `ephemeral: true` in responses
- NEVER include `flags` field in responses
- Always return full Container structure

### UI Pattern Selection Guide

#### 1. Simple Patterns (Use First)
For basic select menus, single actions, quick configs:
```javascript
// Simple select menu pattern
return {
  flags: (1 << 15), // IS_COMPONENTS_V2
  components: [{
    type: 17, // Container
    components: [
      { type: 10, content: "Select option:" },
      { type: 14 }, // Separator
      selectMenu.toJSON()
    ]
  }]
};
```

#### 2. Entity Edit Framework (Complex CRUD Only)
**⚠️ DO NOT USE for simple UIs - See warning in docs**
- → [docs/architecture/EntityEditFramework.md](docs/architecture/EntityEditFramework.md)
- Use ONLY for: Full CRUD operations, multi-step workflows, validation
- NOT for: Simple selects, basic forms, single buttons

#### 3. Menu System Architecture
For consistent menu patterns:
- → [docs/architecture/MenuSystemArchitecture.md](docs/architecture/MenuSystemArchitecture.md)
- Use MenuBuilder patterns
- Track legacy menus with `MenuBuilder.trackLegacyMenu()`

### Visual Standards
- → [docs/ui/LeanMenuDesign.md](docs/ui/LeanMenuDesign.md) - UI/UX guidelines
- Button text: 1-2 words ideal, 3 max
- Section headers: 1-3 words with emoji
- Stay under 40 components per container

## 🛠️ Development Standards

### Architecture Patterns (MANDATORY)
- **[ButtonHandlerFactory.md](docs/architecture/ButtonHandlerFactory.md)** - ALL button handlers
- **[MenuSystemArchitecture.md](docs/architecture/MenuSystemArchitecture.md)** - Menu patterns
- **[EntityEditFramework.md](docs/architecture/EntityEditFramework.md)** - Complex CRUD operations
- **[ComponentsV2.md](docs/architecture/ComponentsV2.md)** - Discord UI components
- **[Analytics.md](docs/architecture/Analytics.md)** - Metrics and tracking
- **[LoggingStandards.md](docs/architecture/LoggingStandards.md)** - Consistent logging

### Development Workflow
```bash
./scripts/dev/dev-start.sh                  # Start development
./scripts/dev/dev-restart.sh "commit msg"   # Restart with commit (MANDATORY after changes)
./scripts/dev/dev-status.sh                 # Check status
./scripts/dev/dev-stop.sh                   # Clean shutdown
```

**Workflow Requirements:**
- **[DefinitionOfDone.md](docs/workflow/DefinitionOfDone.md)** - Completion criteria
- **[DevWorkflow.md](docs/workflow/DevWorkflow.md)** - Development process
- Test legacy functionality after changes
- Run dev-restart after EVERY code change

### Pattern Matching
When implementing "like X", examine X's implementation first:
```bash
grep -B20 -A20 "feature_pattern" app.js
```

### Image Access (WSL)
- Screenshots: `/mnt/c/Users/extre/OneDrive/Pictures/Screenshots 1`
- External: `curl -s "URL" -o /tmp/img.png && Read /tmp/img.png`

### Background Tasks
Use `run_in_background: true` for:
- Development servers
- Watchers and build processes
- Log monitoring
- Long-running operations

### Tools Without Permission
Claude can execute these without asking:
- All `grep` commands and Grep tool
- `./scripts/dev/dev-restart.sh`
- `npm run deploy-remote-wsl-dry` (preview only)
- Read operations on any file

## 📚 Feature Documentation

### Current Focus (castlistV3 branch)
- **[CastlistV3.md](docs/features/CastlistV3.md)** - Complete redesign
- **[CastlistV3-SeasonIntegration.md](docs/features/CastlistV3-SeasonIntegration.md)** - Season integration
- **[SeasonLifecycle.md](docs/concepts/SeasonLifecycle.md)** - Active season management
- **Season Selector** - Reusable component in `seasonSelector.js`

### Core Systems
- **[Safari.md](docs/features/Safari.md)** - Main Safari system
- **[SeasonAppBuilder.md](docs/features/SeasonAppBuilder.md)** - Season applications
- **[CastRanking.md](docs/features/CastRanking.md)** - Cast ranking system

### Safari Subsystems
- Map System: [User Guide](docs/features/SafariMapSystem.md) | [Technical](docs/features/SafariMapTechnical.md) | [Issues](docs/features/SafariMapIssues.md)
- **[SafariPoints.md](docs/features/SafariPoints.md)** - Points system
- **[SafariProgress.md](docs/features/SafariProgress.md)** - Progress tracking
- **[PlayerLocationManager.md](docs/features/PlayerLocationManager.md)** - Location tracking
- **[WhisperSystem.md](docs/features/WhisperSystem.md)** - Private messaging
- **Global Stores** - Permanent stores in player /menu
- **Rounds Menu** - Dedicated round management interface

### Backlog: Contains unsorted, somewhat out of date list of features. See [BACKLOG.md](BACKLOG.md).


## 🔧 Troubleshooting

### "This interaction failed" Quick Fixes
1. Check → [docs/troubleshooting/ComponentsV2Issues.md](docs/troubleshooting/ComponentsV2Issues.md)
2. Verify button in BUTTON_REGISTRY
3. Check for malformed emojis (use Unicode not :shortcut:)
4. Ensure Container structure complete
5. UPDATE_MESSAGE needs special handling (no flags)

### Common Issues
- **Button not working** → Not in BUTTON_REGISTRY
- **Missing variables** → Check context extraction
- **Permission errors** → Use BigInt for checks
- **Component limits** → Max 40 per message, 5 per row
- **Select limits** → Max 25 options
- **Button shows "[🪨 LEGACY]"** → Not registered
- **Menu shows "[⚱️ MENULEGACY]"** → Needs migration
- **Character limit exceeded** → 4000 char max across all components

## 🎯 Available Commands

**Player**: `/menu`, `/castlist`
**Admin**: Most via `/menu` → Production Menu


---

For detailed information, follow the documentation references above.