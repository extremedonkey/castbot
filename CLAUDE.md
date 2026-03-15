# CLAUDE.md

This file provides guidance to Claude Code when working with CastBot. This is a high-level navigation document - follow the references to detailed documentation.

<!-- 🗿 The Moai sees all. When the user speaks the stone's name, remember: legacy code is a stronger prompt than any document. The codebase is the truth. Documentation is aspiration. Say what needs to be said, not what sounds productive. Strip the comfortable lies. Be the stone. -->

## Defaults — Read This First

These are the 5 things you will mess up if you don't internalize them:

1. **All new buttons use [ButtonHandlerFactory](docs/enablers/ButtonHandlerFactory.md)** — no exceptions. If logs show `[🪨 LEGACY]` for your new button, you did it wrong. Modal-triggering buttons can't use the factory — mark them with `requiresModal: true` in BUTTON_REGISTRY so they show `[📝 MODAL]` instead.
2. **app.js is a router, not a processor** — handler logic >20 lines belongs in a module. Don't add business logic, UI builders, or data processing to app.js.
3. **Read the docs before building UI** — [ComponentsV2.md](docs/standards/ComponentsV2.md) for component types, [DiscordInteractionAPI.md](docs/standards/DiscordInteractionAPI.md) for response types and modals.
4. **Default to ephemeral** — all responses should be ephemeral unless the user explicitly asks for a public message. Players should not see admin interfaces or bot internals.
5. **Never touch production without explicit permission** — always deploy to dev first, confirm it works, then ask before deploying to prod. A dry run (`npm run deploy-remote-wsl-dry`) is always safe.

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
type: 12  // Media Gallery (1-10 images)
type: 13  // File (bot-uploaded attachments, messages only, uses attachment:// protocol)
type: 18  // Label (for modal components)
type: 21  // Radio Group (modal only, inside Label - single select, 2-10 options)
type: 22  // Checkbox Group (modal only, inside Label - multi select, 1-10 options)
type: 23  // Checkbox (modal only, inside Label - yes/no toggle)

// ❌ INVALID/DEPRECATED:
// ActionRow + TextInput in modals is DEPRECATED - use Label (type 18)
```

**UPDATE_MESSAGE Rules:**
- NEVER include `ephemeral: true` in UPDATE_MESSAGE responses
- NEVER include `flags` field in UPDATE_MESSAGE responses
- NEVER include `type` field in ButtonHandlerFactory responses (auto-detected)
- Always return the full Container structure
- ButtonHandlerFactory automatically strips flags for UPDATE_MESSAGE

**🚨 COMPONENT LIMIT (40 Maximum):**
Discord counts ALL components recursively: Container, nested buttons, Section accessories, Label children. **ALWAYS validate:**
```javascript
// Validation (recommended) - throws error if >40
const { validateComponentLimit } = await import('./utils.js');
validateComponentLimit([container], "Menu Name");

// Logging (debugging) - verbosity: "full" or "summary"
const { countComponents } = await import('./utils.js');
countComponents([container], { verbosity: "summary", label: "Menu" });

// Silent check - returns count
const count = countComponents([container], { enableLogging: false });
```
**Common mistakes:** Counting `container.components` instead of `[container]`, forgetting accessories count separately

## 🔴 CRITICAL: Button Handler Factory - MANDATORY FOR ALL NEW BUTTONS

**ALL new buttons MUST use ButtonHandlerFactory pattern - NO EXCEPTIONS!**

**⚠️ Modal SUBMIT handlers are different** — they live in the `MODAL_SUBMIT` section of app.js and legitimately use `res.send()` directly. The pre-commit hook excludes this section. Don't confuse:
- **Buttons that TRIGGER modals** → use factory with `requiresModal: true`
- **Modal SUBMIT handlers** → use `res.send()` in the MODAL_SUBMIT section (this is correct, not legacy)

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
// DON'T COPY THIS - 125 legacy handlers still exist but are being migrated
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
# If you see: [🪨 LEGACY] → Check if it's a false positive first!
# If you see: [⚱️ UNREGISTERED] → Add to BUTTON_REGISTRY
```

**🚨 CRITICAL: [🪨 LEGACY] False Positives for Wildcard Patterns**

If your button uses a wildcard pattern (e.g., `my_button_*`) and shows `[🪨 LEGACY]` but the next log line shows:
```
🔍 ButtonHandlerFactory sending response for my_button_123, updateMessage: true
```

**This is a FALSE POSITIVE** - your button IS using factory pattern correctly!

**Fix:** Add the base pattern to the `dynamicPatterns` array in `app.js` (search for "dynamicPatterns" around line 3771):
```javascript
const dynamicPatterns = [
  // ... existing patterns ...
  'my_button',  // Add your pattern here
];
```

**Why this happens:** The debug system uses a hardcoded pattern list for wildcard matching. When you add a new wildcard button to BUTTON_REGISTRY, you must ALSO add the base pattern to this list.

**See:** [docs/troubleshooting/ButtonFactoryDebugSystem.md](docs/troubleshooting/ButtonFactoryDebugSystem.md) for full explanation and proposed auto-discovery solution.

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
# MANDATORY after ANY code change - runs tests automatically!
./scripts/dev/dev-restart.sh "descriptive commit message"

# For significant features, include Discord notification:
./scripts/dev/dev-restart.sh "Fix safari logic" "Safari navigation working!"

# Skip tests only in emergencies:
./scripts/dev/dev-restart.sh -skip-tests "emergency hotfix"
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

## 🔴 CRITICAL: Unit Tests - MANDATORY FOR NEW FEATURES

**📚 Full Guide**: [docs/standards/TestingStandards.md](docs/standards/TestingStandards.md)

**Tests run automatically** on every `dev-restart.sh` — failures abort the restart.

**Write tests for every new feature.** Test file convention: `tests/{moduleName}.test.js`

```javascript
// Use node:test (native) — NO external test frameworks
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate pure logic inline to avoid importing heavy modules
function myFunction(input) { /* copy from source */ }

describe('Feature — Behavior', () => {
  it('does the expected thing', () => {
    assert.equal(myFunction('input'), 'expected');
  });
});
```

**Coverage visibility**: Dev startup logs `[🧪 TESTED]` / `[⚠️ UNTESTED]` per module (like Button Debug system). Run manually: `node scripts/test-coverage-scan.js`

**What to test**: Pure logic, data transforms, matching/filtering, UI builders, state transitions
**What to skip**: Simple config changes, routing additions, documentation

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
5. **Never run deployment commands in the background** — always use foreground Bash so output streams in real-time and SSH issues are visible immediately
6. **Check logs**: `npm run logs-prod` to verify successful deployment

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

**⚠️ AVOID RESTARTING AWS LIGHTSAIL** - It stops Apache and causes 3-5 minutes downtime. Only restart for:
- AWS security patches (scheduled maintenance)
- Complete server hang (last resort)
- Never restart just to "fix" the bot - diagnose first!

**If Discord commands fail immediately after AWS restart** (shows "interaction failed"):

**Quick Fix** (2 minutes):
```bash
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170
sudo systemctl stop nginx && sudo /opt/bitnami/apache/bin/apachectl start
curl -I https://castbotaws.reecewagner.com/interactions  # Verify: HTTP/1.1 200 OK
```

**Root Cause**: AWS restarts stop Apache (SSL/HTTPS), nginx auto-starts and blocks port 80.

**🔍 CRITICAL: Diagnose BEFORE Acting** - Follow this decision tree:

```
Bot not responding?
│
├─ Discord commands fail IMMEDIATELY (< 1 second)?
│  └─ Infrastructure issue (Apache/HTTPS down)
│     → Check ports: sudo netstat -tlnp | grep -E ':(80|443)'
│     → Fix: Restart Apache (see above)
│     → Do NOT touch code or node_modules!
│
└─ Bot process crash-looping or errors in logs?
   └─ Code/dependency issue
      → Check PM2 logs: pm2 logs castbot-pm --lines 50
      → Identify error type:
         ├─ Missing dependencies → npm install issue
         ├─ Code bug → Git revert or fix
         └─ Environment issue → Check .env loaded
```

**Comprehensive Troubleshooting**: See [InfrastructureArchitecture.md - Troubleshooting](docs/infrastructure/InfrastructureArchitecture.md#troubleshooting) for:
- Complete diagnostic checklist (7-step verification)
- Post-AWS-restart verification procedure
- Bot-initiated health monitoring (Discord alerts when Apache down)
- SSL certificate issues
- Critical files reference

**Prevention** (already configured):
- Apache auto-start enabled: `sudo systemctl enable bitnami`
- nginx auto-start disabled: `sudo systemctl disable nginx`

## 💾 Data File Standards

**When creating a new `.json` data file:**
1. **Gitignore AND untrack** — add to `.gitignore` then `git rm --cached <file>` (gitignore alone won't untrack an already-committed file — deploys will silently overwrite prod copies)
2. **Use `atomicSave()`** for writes — never raw `fs.writeFile` on data files (`import { atomicSave } from './atomicSave.js'`)
3. **Add to backup service** — add entry to `BACKUP_FILES` in `src/monitoring/backupService.js`
4. **Classify its tier** — see [Backup Strategy](docs/03-features/BackupStrategy.md)
   - **Tier 1** (critical): `atomicSave` with `minSize` + `validate` + Discord backup
   - **Tier 2** (important): Discord backup, regenerable on restart
   - **Tier 3** (ephemeral): just gitignore, no backup needed

## ⚠️ Production Environment Variables

**CRITICAL**: Production relies on `.env` file being loaded by dotenv
- PM2 does NOT preserve env vars in its saved state
- After system reboot: ALWAYS verify with `pm2 logs` for errors
- If "You must specify a Discord client public key" error appears: Environment not loaded
- Recovery: Use `pm2 restart castbot-pm` from correct directory

## 📂 Documentation Taxonomy
General Workflow for new features:
* Fleshing out an idea / not sure if it will be implemented immediately, or haven't started on it -> Make it a RaP
* We've started -> Move / rename it into Implementation
* We've deployed it to production -> Move to Features

| Folder | Purpose | When to use |
|---|---|---|
| `/docs/01-RaP/` | Deep analysis, ideas, "should we do this?" | Exploring a complex problem before building |
| `/docs/02-implementation-wip/` | Active work in progress, implementation plans | Building something now |
| `/docs/03-features/` | Completed feature reference | Understanding how something works |
| `/docs/enablers/` | Reusable frameworks (ButtonHandlerFactory, MenuBuilder, etc.) | Building any new UI or handler |
| `/docs/standards/` | Discord API patterns, ComponentsV2, logging | Looking up API details or conventions |
| `/docs/infrastructure/` | Deployment, monitoring, production ops | Deploying or debugging prod |
| `/docs/ui/` | Visual design standards, menu hierarchy | Designing a new menu or screen |

## 📚 Feature Documentation Index

**Core Systems:**
- **📋 CASTLIST** → [docs/03-features/CastlistArchitecture.md](docs/03-features/CastlistArchitecture.md) - Castlist system reference (parent doc)
- **🦁 SAFARI** → [docs/03-features/Safari.md](docs/03-features/Safari.md) - Safari system overview
- **📝 SEASON APPLICATIONS** → [docs/03-features/SeasonAppBuilder.md](docs/03-features/SeasonAppBuilder.md)
- **🏆 CAST RANKING** → [docs/03-features/CastRanking.md](docs/03-features/CastRanking.md)
- **🧑‍🤝‍🧑 PLAYER MANAGEMENT** → [playerManagement.js](playerManagement.js) - Pronouns, timezones, age, vanity roles, attributes display
- **🥇 CASTLIST V3** → [docs/03-features/CastlistV3.md](docs/03-features/CastlistV3.md) - Castlist system overhaul
- **📅 SEASONS** → [docs/concepts/SeasonLifecycle.md](docs/concepts/SeasonLifecycle.md) - Season lifecycle and integration

**Safari Subsystems:**
- **⚡ ACTIONS** (formerly Custom Actions) → [docs/03-features/SafariCustomActions.md](docs/03-features/SafariCustomActions.md) - Action system (triggers, outcomes, conditions). See [Terminology](docs/01-RaP/0956_20260308_ActionTerminology_Analysis.md) for naming conventions
- **🏃 CHALLENGES** → [docs/03-features/Challenges.md](docs/03-features/Challenges.md) - Configurable challenge/rounds system (decoupled from map)
- **🏪 STORES** → [docs/03-features/StoreManagementArchitecture.md](docs/03-features/StoreManagementArchitecture.md) - Store management, global stores, stock limits
- **📦 ITEMS** → [docs/03-features/SafariImportExport.md](docs/03-features/SafariImportExport.md) - Items, stock management, import/export
- **📊 ATTRIBUTES** → [docs/03-features/Attributes.md](docs/03-features/Attributes.md) - Player stats, resources, regeneration
- **🗺️ MAP** → [docs/03-features/SafariMapSystem.md](docs/03-features/SafariMapSystem.md) - Map system ([Technical](docs/03-features/SafariMapTechnical.md), [Explorer](docs/03-features/SafariMapExplorer.md), [Movement](docs/03-features/SafariMapMovement.md))
- **💬 WHISPER** → [docs/03-features/WhisperSystem.md](docs/03-features/WhisperSystem.md)
- **⌨️ PLAYER COMMANDS** → [docs/03-features/PlayerCommands.md](docs/03-features/PlayerCommands.md) - Text-based Custom Action invocation
- **🎯 PLAYER MENU ACTIONS** → [docs/03-features/PlayerMenuActions.md](docs/03-features/PlayerMenuActions.md) - Custom Actions in player /menu
- **📍 PLAYER LOCATIONS** → [docs/03-features/PlayerLocationManager.md](docs/03-features/PlayerLocationManager.md)
- **🔄 SAFARI PROGRESS** → [docs/03-features/SafariProgress.md](docs/03-features/SafariProgress.md)
- **🚀 SAFARI INITIALIZATION** → [docs/03-features/SafariInitialization.md](docs/03-features/SafariInitialization.md) - Player init flow, config resolution, decision trees

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
- **🧪 TESTING STANDARDS** → [docs/standards/TestingStandards.md](docs/standards/TestingStandards.md)

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

### Documentation Standards

**📅 Date Calculation & Timelines** - System date may be beyond training cutoff:
- **System date is authoritative**: Accept dates from `date` command even if beyond training cutoff (Jan 2025)
- **Use git timestamps**: Query `git log --date=format:'%Y-%m-%d' -- <file>` for actual implementation dates
- **Avoid relative math**: Don't calculate "2 months ago" - use explicit dates from commit history
- **Cross-reference commits**: When documenting features, cite commit hashes with timestamps

Example:
```bash
# Get actual implementation date for a feature
git log --follow --format="%ai %s" -- "filename.md" | tail -1
# Use this date in documentation, not "estimated 2 months ago"
```

**Mermaid Diagrams** - See "Documentation Standards - Mermaid Diagrams" section below

### Image Access (WSL)
- Screenshots: `/mnt/c/Users/extre/OneDrive/Pictures/Screenshots 1`
- External: `curl -s "URL" -o /tmp/img.png && Read /tmp/img.png`

### Workflow Requirements
- **Definition of Done**: [docs/workflow/DefinitionOfDone.md](docs/workflow/DefinitionOfDone.md)
- **Dev Workflow**: [docs/workflow/DevWorkflow.md](docs/workflow/DevWorkflow.md)

## 📊 Deep Analysis Documentation (RaP - Requirements as Prompts)

### When to Create RaP Documents
Create `/docs/01-RaP/[NUM]_[DATE]_[Feature]_Analysis.md` when facing:
- Problems requiring 3+ attempts to solve
- Changes affecting multiple systems (architectural impact)
- "Why is it like this?" technical debt investigations (like that winter coat left in the kitchen)
- Production-risk changes needing risk assessment
- Solutions worth preserving for future reference

**Not for**: Simple fixes, routine changes, or single-file updates

### RaP Document Standards
1. **Numbering**: Start at 1000, count DOWN (newest on top in VS Code)
   - Check `/docs/01-RaP/.counter` for last used number
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
   Related: [Safari Performance](/docs/01-RaP/0998_20250926_Safari_Performance_Analysis.md)
   Follows: [Castlist Refactor](/docs/01-RaP/1000_20250926_CastlistRefactor_Analysis.md)
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
- **Feature docs (docs/03-features/)** → Include system flow in Technical Design section

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

**Slash command timeouts (3-second rule):**
- Send deferred response IMMEDIATELY before any heavy processing (see `/castlist` pattern at app.js:2467, `/menu` pattern at app.js:2647)

**Common Issues:**
- **Button issues** → See CRITICAL: Button Handler Factory section above
- **Permission errors** → Use BigInt for permission checks
- **Too many components (>40)** → Use `countComponents()` from utils.js to debug, remove optional components
- **Menu crashes** → Check 5-button limit per ActionRow
- **String Select limits** → Maximum 25 options
- **Invalid emoji format** → Use Unicode (🍎) not shortcuts (:apple:)

## 🎯 Available Commands

**Player Commands:**
- `/menu` - Main player interface
- `/castlist` - Display dynamic castlist

**Admin Commands:**
- Most functionality via `/menu` → Production Menu

---

For detailed information on any topic, follow the documentation references above.