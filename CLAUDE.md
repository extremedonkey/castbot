# CLAUDE.md

This file provides guidance to Claude Code when working with CastBot. This is a high-level navigation document - follow the references to detailed documentation.

## 🔴 Production Safety - NEVER Do These

1. **Use unapproved PM2 commands** (see approved list below)
2. **Modify production without explicit permission** Even if the user reports a bug, always deploy to test first and confirm before deploying to production
3. **Use `pm2 delete` followed by `pm2 start`** - This loses environment context
4. **Create new PM2 processes** with `pm2 start app.js --args`
5. **Ignore "Discord client public key" errors** - Environment not loaded
6. **Forget `await` with async storage functions** - Missing `await` = DATA LOSS (see below)

## 🔴 CRITICAL: Async/Await - File I/O

**Missing `await` with storage functions causes data loss!**

```javascript
// ❌ DATA LOSS - Returns Promise, not data
const playerData = loadPlayerData();
// playerData is Promise { <pending> }, modifications create ~200 bytes = wipes 171KB

// ✅ CORRECT - Always await
const playerData = await loadPlayerData();
```

**Critical functions requiring `await`:**
- `loadPlayerData()`, `savePlayerData()`, `loadSafariData()`, `saveSafariData()`

**Before committing storage code:**
```javascript
console.log('Data size:', JSON.stringify(playerData).length);  // Should be ~170KB
```

## 🔴 CRITICAL: Components V2 - ALL Discord UI Must Use This

**📚 MANDATORY DOCUMENTATION:**
- **[ComponentsV2.md](docs/standards/ComponentsV2.md)** - Complete component reference (READ THIS FIRST)
- **[DiscordInteractionAPI.md](docs/standards/DiscordInteractionAPI.md)** - Interaction fundamentals
- **[ComponentsV2Issues.md](docs/troubleshooting/ComponentsV2Issues.md)** - "This interaction failed" fixes

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
- NEVER include `type` field in ButtonHandlerFactory responses (auto-detected)
- Always return the full Container structure
- ButtonHandlerFactory automatically strips flags for UPDATE_MESSAGE

## 🔴 CRITICAL: Button Handler Factory - MANDATORY FOR ALL NEW BUTTONS

**ALL new buttons MUST use ButtonHandlerFactory pattern - NO EXCEPTIONS!**

**🚨 QUICK CHECK BEFORE CREATING ANY BUTTON:**
1. **Search ButtonHandlerRegistry.md** - Check if button already exists
2. **Search for similar buttons**: `grep -A20 "similar_feature" app.js`
3. **Use ButtonHandlerFactory pattern** (see below)
4. **Register in BUTTON_REGISTRY** - Add button metadata to buttonHandlerFactory.js
5. **Test and verify logs** - Should show `[✨ FACTORY]`, NOT `[🪨 LEGACY]`

**✅ CORRECT Factory Pattern:**
```javascript
} else if (custom_id === 'my_button') {
  return ButtonHandlerFactory.create({
    id: 'my_button',
    updateMessage: true,  // MANDATORY for button clicks (updates existing message)
    deferred: true,       // Required if operation takes >3 seconds
    handler: async (context) => {
      const { guildId, userId, member, client } = context;
      // Your logic here (10-20 lines max)
      return { content: 'Success!' };
    }
  })(req, res, client);
}
```

**CRITICAL: updateMessage vs ephemeral**:
- **Button clicks** → ALWAYS `updateMessage: true` (updates message with button, inherits ephemeral)
- **Select menus** → ALWAYS `updateMessage: true` (updates message with select)
- **Slash commands** → Use `ephemeral: true` (creates new private message)
- **New messages** → Use `ephemeral: true` if private needed

**Why updateMessage is Required**:
- Without it: Creates NEW public message (slow, "interaction failed")
- With it: Updates existing message (fast, inherits ephemeral from parent)
- ButtonHandlerFactory does NOT auto-detect button clicks!

**❌ WRONG - Legacy Pattern (DO NOT COPY):**
```javascript
// DON'T COPY THIS - 164 legacy handlers still exist but are being migrated
} else if (custom_id === 'bad_example') {
  try {
    const guildId = req.body.guild_id;
    // ... 50+ lines of boilerplate ...
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '...' }
    });
  } catch (error) { }
}
```

**Button Registration (MANDATORY):**
Add to `buttonHandlerFactory.js` BUTTON_REGISTRY:
```javascript
'my_button': {
  label: 'My Button',
  description: 'What this button does',
  emoji: '🔘',
  style: 'Primary',
  category: 'feature_name',
  parent: 'parent_menu_id'  // Optional
}
```

**Self-Check After Implementation:**
```bash
# Test your button in Discord, then check logs:
tail -f /tmp/castbot-dev.log | grep "my_button"

# Expected: [✨ FACTORY] my_button
# If you see: [🪨 LEGACY] → You created legacy code, fix immediately!
# If you see: [⚱️ UNREGISTERED] → Add to BUTTON_REGISTRY
```

**Why Factory is Mandatory:**
- **80% code reduction** (50 lines → 10 lines per handler)
- **Automatic error handling** - Factory catches all errors
- **Consistent context** - No more missing `guildId` or `client` variables
- **Built-in logging** - Automatic debug output with status indicators
- **Permission checking** - Centralized permission validation
- **Natural language search** - Find buttons by description/label

**Documentation:**
- **Full Guide**: [docs/enablers/ButtonHandlerFactory.md](docs/enablers/ButtonHandlerFactory.md)
- **Button Catalog**: [docs/enablers/ButtonHandlerRegistry.md](docs/enablers/ButtonHandlerRegistry.md)

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

**🎯 Ultrathink Health Monitoring** - Two complementary interfaces (see [ProductionMonitoring.md](docs/infrastructure/ProductionMonitoring.md)):

**📱 Discord Interface:**
- **Manual**: `/menu` → Analytics → Ultramonitor button
- **Schedule**: Click "Schedule" → Set interval (1min to 24hr)
- **Alerts**: Only pings for CRITICAL health (<50/100)
- **Architecture**: Uses Safari webhook pattern + Components V2

**🖥️ CLI Interface:**
```bash
npm run monitor-prod           # Full health dashboard with scoring
npm run monitor-prod-quick     # Essential metrics (fastest)
npm run monitor-prod-memory    # Memory optimization tracking
npm run monitor-prod-alerts    # Alert conditions & recommendations
npm run monitor-prod-cache     # Cache performance analysis
```

**📋 PM2 Error Logger** - Automated error monitoring to Discord:
- **Auto-posts** PM2 errors to Discord #error channel every 60s
- **Bulletproof**: Never crashes the bot, all errors isolated
- **Dual-mode**: Local file reading in dev/prod, SSH remote monitoring
- **Smart filtering**: ERROR, FATAL, CRITICAL, failed, TypeError patterns
- **Implementation**: `/src/monitoring/pm2ErrorLogger.js` (singleton pattern)

**📋 Log Analysis**:
```bash
npm run logs-prod              # Last 100 lines
npm run logs-prod-follow       # Real-time streaming
npm run logs-prod-errors       # Error logs only
npm run logs-prod -- --filter "user ID"  # Filtered logs
```

### 🚨 Production Infrastructure Troubleshooting

**If Discord commands fail immediately after AWS restart** (shows "interaction failed"):

**Quick Fix** (2 minutes):
```bash
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170
sudo systemctl stop nginx && sudo /opt/bitnami/apache/bin/apachectl start
curl -I https://castbotaws.reecewagner.com/interactions  # Verify: HTTP/1.1 200 OK
```

**Root Cause**: AWS restarts stop Apache (SSL/HTTPS), nginx auto-starts and blocks port 80.

**Comprehensive Troubleshooting**: See [InfrastructureArchitecture.md - Troubleshooting](docs/infrastructure/InfrastructureArchitecture.md#troubleshooting) for:
- Complete diagnostic checklist (7-step verification)
- Post-AWS-restart verification procedure
- Bot-initiated health monitoring (Discord alerts when Apache down)
- SSL certificate issues
- Critical files reference

**Prevention** (already configured):
- Apache auto-start enabled: `sudo systemctl enable bitnami`
- nginx auto-start disabled: `sudo systemctl disable nginx`

## ⚠️ Production Environment Variables

**CRITICAL**: Production relies on `.env` file being loaded by dotenv
- PM2 does NOT preserve env vars in its saved state
- After system reboot: ALWAYS verify with `pm2 logs` for errors
- If "You must specify a Discord client public key" error appears: Environment not loaded
- Recovery: Use `pm2 restart castbot-pm` from correct directory

## 📚 Feature Documentation Index

**🚧 Current Work in Progress:**
- **SAFARI CUSTOM EXPERIENCES** → [docs/features/SafariCustomExperiences.md](docs/features/SafariCustomExperiences.md) - Configurable challenge system via Custom Actions
- **🎯 CASTLIST V3 REDESIGN** → [docs/features/CastlistV3.md](docs/features/CastlistV3.md) - Complete castlist system overhaul
- **ACTIVE SEASON SYSTEM** → [docs/concepts/SeasonLifecycle.md](docs/concepts/SeasonLifecycle.md)
- **SEASON INTEGRATION** → [docs/features/CastlistV3-SeasonIntegration.md](docs/features/CastlistV3-SeasonIntegration.md)
- **SEASON SELECTOR** → Reusable component in `seasonSelector.js`
- **CHANGE SEASON BUTTON** → Production Menu header accessory

**Core Systems:**
- **🦁 SAFARI SYSTEM** → [docs/features/Safari.md](docs/features/Safari.md)
- **📋 SEASON APPLICATIONS** → [docs/features/SeasonAppBuilder.md](docs/features/SeasonAppBuilder.md)
- **🏆 CAST RANKING** → [docs/features/CastRanking.md](docs/features/CastRanking.md)
- **🥇 CASTLIST V3** → [docs/features/CastlistV3-AlumniPlacements.md](docs/features/CastlistV3-AlumniPlacements.md)
- **🧭 CASTLIST NAVIGATION** → [docs/features/CastlistNavigationParsing.md](docs/features/CastlistNavigationParsing.md) - Button parsing & identifier resolution

**Safari Subsystems:**
- **MAP EXPLORER** → [docs/features/SafariMapExplorer.md](docs/features/SafariMapExplorer.md)
- **MAP SYSTEM** → [docs/features/SafariMapSystem.md](docs/features/SafariMapSystem.md) - User/admin guide
- **MAP TECHNICAL** → [docs/features/SafariMapTechnical.md](docs/features/SafariMapTechnical.md) - Developer reference
- **MAP ISSUES** → [docs/features/SafariMapIssues.md](docs/features/SafariMapIssues.md) - Known issues & roadmap
- **MAP MOVEMENT** → [docs/features/SafariMapMovement.md](docs/features/SafariMapMovement.md)
- **IMPORT/EXPORT** → [docs/features/SafariImportExport.md](docs/features/SafariImportExport.md) - Full Safari template portability
- **POINTS SYSTEM** → [docs/features/SafariPoints.md](docs/features/SafariPoints.md)
- **SAFARI PROGRESS** → [docs/features/SafariProgress.md](docs/features/SafariProgress.md)
- **PLAYER LOCATIONS** → [docs/features/PlayerLocationManager.md](docs/features/PlayerLocationManager.md)
- **WHISPER SYSTEM** → [docs/features/WhisperSystem.md](docs/features/WhisperSystem.md)
- **STORE MANAGEMENT** → [docs/features/StoreManagementArchitecture.md](docs/features/StoreManagementArchitecture.md)
- **GLOBAL STORES** (NEW) → Permanent stores in player /menu
- **ROUNDS MENU** (NEW) → Dedicated round management interface
- **STOCK MANAGEMENT** (NEW) → Store inventory limits with per-item stock tracking

**Infrastructure & Deployment:**
- **🌍 INFRASTRUCTURE ARCHITECTURE** → [docs/infrastructure/InfrastructureArchitecture.md](docs/infrastructure/InfrastructureArchitecture.md)
- **🎯 PRODUCTION MONITORING** → [docs/infrastructure/ProductionMonitoring.md](docs/infrastructure/ProductionMonitoring.md)
- **📊 ANALYTICS** → [docs/infrastructure/Analytics.md](docs/infrastructure/Analytics.md)

**Enablers & Frameworks:**
- **🔘 BUTTON HANDLER FACTORY** (MANDATORY) → [docs/enablers/ButtonHandlerFactory.md](docs/enablers/ButtonHandlerFactory.md)
- **📋 BUTTON HANDLER REGISTRY** → [docs/enablers/ButtonHandlerRegistry.md](docs/enablers/ButtonHandlerRegistry.md)
- **🎯 MENU SYSTEM ARCHITECTURE** → [docs/enablers/MenuSystemArchitecture.md](docs/enablers/MenuSystemArchitecture.md)
- **🔧 ENTITY/EDIT FRAMEWORK** → [docs/enablers/EntityEditFramework.md](docs/enablers/EntityEditFramework.md)
- **📨 DISCORD MESSENGER** → [docs/enablers/DiscordMessenger.md](docs/enablers/DiscordMessenger.md) - Direct Messages (DMs), Components V2 via REST API
- **🔄 REQUEST SCOPED CACHING** → [docs/enablers/RequestScopedCaching.md](docs/enablers/RequestScopedCaching.md)

**Standards & Patterns:**
- **🎨 COMPONENTS V2** (MANDATORY) → [docs/standards/ComponentsV2.md](docs/standards/ComponentsV2.md)
- **🔗 DISCORD INTERACTION API** → [docs/standards/DiscordInteractionAPI.md](docs/standards/DiscordInteractionAPI.md)
- **🔌 DISCORD INTERACTION PATTERNS** → [docs/standards/DiscordInteractionPatterns.md](docs/standards/DiscordInteractionPatterns.md)
- **📝 LOGGING STANDARDS** → [docs/standards/LoggingStandards.md](docs/standards/LoggingStandards.md)
- **📊 BUTTON INTERACTION LOGGING** → [docs/standards/ButtonInteractionLogging.md](docs/standards/ButtonInteractionLogging.md)

**Discord API References:**
- **🔐 PERMISSIONS** (100+ usage points) → [docs/standards/DiscordPermissions.md](docs/standards/DiscordPermissions.md) - BigInt permission handling, MANAGE_ROLES patterns
- **⚡ RATE LIMITS** (production critical) → [docs/standards/DiscordRateLimits.md](docs/standards/DiscordRateLimits.md) - Exponential backoff, batching, webhook limits
- **🏰 GUILD RESOURCE** (roles/channels) → [docs/standards/DiscordGuildResource.md](docs/standards/DiscordGuildResource.md) - Role creation, member fetching, server management
- **💬 CHANNEL RESOURCE** (messaging) → [docs/standards/DiscordChannelResource.md](docs/standards/DiscordChannelResource.md) - Message posting, file uploads, permission management
- **📨 MESSAGE RESOURCE** (content/embeds) → [docs/standards/DiscordMessageResource.md](docs/standards/DiscordMessageResource.md) - Message editing, embeds, attachments, analysis
- **🔗 WEBHOOK RESOURCE** (follow-ups) → [docs/standards/DiscordWebhookResource.md](docs/standards/DiscordWebhookResource.md) - Interaction tokens, follow-up messages, external webhooks
- **🧵 THREADS** (future features) → [docs/standards/DiscordThreads.md](docs/standards/DiscordThreads.md) - Application discussions, Safari events, voting threads
- **👤 USER RESOURCE** (player management) → [docs/standards/DiscordUserResource.md](docs/standards/DiscordUserResource.md) - Member fetching, player data, user validation
- **😀 EMOJI RESOURCE** (custom emojis) → [docs/standards/DiscordEmojiResource.md](docs/standards/DiscordEmojiResource.md) - Emoji processing, validation, guild emoji management

**UI/UX Design:**
- **📐 LEAN USER INTERFACE DESIGN** → [docs/ui/LeanUserInterfaceDesign.md](docs/ui/LeanUserInterfaceDesign.md)
- **📋 MENU HIERARCHY** → [docs/ui/MenuHierarchy.md](docs/ui/MenuHierarchy.md) - Visual menu tree and navigation flow

## 🛠️ Development Standards

### Mandatory Patterns

**Button Handler Factory** - See CRITICAL section above for full details. Quick reference:
- **ALL new buttons** must use ButtonHandlerFactory.create()
- **Register in BUTTON_REGISTRY** (buttonHandlerFactory.js)
- **Check logs** for [✨ FACTORY] (good) vs [🪨 LEGACY] (bad)

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

## 📊 Deep Analysis Documentation (RaP - Requirements as Prompts)

### When to Create RaP Documents
Create `/RaP/[NUM]_[DATE]_[Feature]_Analysis.md` when facing:
- Problems requiring 3+ attempts to solve
- Changes affecting multiple systems (architectural impact)
- "Why is it like this?" technical debt investigations (like that winter coat left in the kitchen)
- Production-risk changes needing risk assessment
- Solutions worth preserving for future reference

**Not for**: Simple fixes, routine changes, or single-file updates

### RaP Document Standards
1. **Numbering**: Start at 1000, count DOWN (newest on top in VS Code)
   - Check `/RaP/.counter` for last used number
   - Format: `0999_20250926_FeatureName_Analysis.md`

2. **Context Preservation**: When a RaP is triggered by a user prompt:
   - **ALWAYS save the user's full, unmodified original prompt** in the RaP document
   - Include it in a dedicated "Original Context" or "Trigger Prompt" section
   - This preserves the exact problem statement and context for future reference
   - Helps future-you understand what specifically prompted the deep analysis

3. **Essential Elements**:
   - 🤔 Plain English problem explanation (what's actually broken)
   - 🏛️ Historical context (the "organic growth story")
   - 📊 Mermaid diagrams (RED=bad, YELLOW=maybe, GREEN=good)
   - 💡 Clear solution with rationale
   - ⚠️ Risk assessment when applicable

4. **Cross-Reference**: Link related RaP documents
   ```markdown
   Related: [Safari Performance](/RaP/0998_20250926_Safari_Performance_Analysis.md)
   Follows: [Castlist Refactor](/RaP/1000_20250926_CastlistRefactor_Analysis.md)
   ```

5. **Writing Style**:
   - Use metaphors to explain complex concepts
   - Tell the story of technical debt (it always has one)
   - Make architecture decisions memorable
   - Balance technical accuracy with engaging narrative

**⚠️ MERMAID DIAGRAM LIMITATION:**
- **Claude Code CANNOT view Mermaid diagrams in chat messages**
- Only create Mermaid diagrams when saving to markdown files
- If user needs to see a diagram, always save it to a file first

Remember: These documents are for future-you trying to understand past decisions.
When in doubt, create the document - disk space is cheap, context is expensive.

🎭 *The theater masks represent both analysis and storytelling - good documentation needs both*

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
- **`./scripts/dev/dev-restart.sh`** - **MANDATORY after ANY code changes**
- `npm run deploy-remote-wsl-dry` (preview only)
- Creating/editing markdown documentation files (*.md)
- Creating Mermaid diagrams in documentation
- **Read-only SSH commands to Lightsail production server:**
  - `ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170` with read-only operations:
    - `cat`, `grep`, `tail`, `head`, `less`, `more` (file reading)
    - `ls`, `find`, `wc`, `stat` (file listing/info)
    - `sed -n`, `awk` (read-only text processing)
    - `node -e` with `console.log` / `fs.readFileSync` (read-only Node.js scripts)
    - `git log`, `git show`, `git diff`, `git status` (read-only git operations)
    - `pm2 list`, `pm2 status`, `pm2 info`, `pm2 logs` (read-only PM2 monitoring)

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
- **Button issues** → See CRITICAL: Button Handler Factory section above
- **Permission errors** → Use BigInt for permission checks
- **Menu crashes** → Check 5-button limit per ActionRow
- **String Select limits** → Maximum 25 options
- **Invalid emoji format** → Use Unicode (🍎) not shortcuts (:apple:)

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