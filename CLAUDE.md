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
type: 3   // String Select (NOT type 6!)

// ❌ INVALID/WRONG Types (DO NOT USE):
type: 11  // NOT VALID - No "Section" type
type: 5   // NOT VALID - No "Paragraph" type  
type: 6   // WRONG - Legacy string select
type: 13  // WRONG - Invalid separator
```

**UPDATE_MESSAGE Rules:**
- NEVER include `ephemeral: true` in UPDATE_MESSAGE responses
- NEVER include `flags` field in UPDATE_MESSAGE responses
- Always return the full Container structure

## 🚀 Quick Start

### Development Workflow
```bash
./scripts/dev/dev-start.sh                  # Start development session
./scripts/dev/dev-restart.sh "commit msg"   # Restart with meaningful commit message
./scripts/dev/dev-status.sh                 # Check status
./scripts/dev/dev-stop.sh                   # Clean shutdown
```

**🚨 MANDATORY:** Run `./scripts/dev/dev-restart.sh` with descriptive message after ANY code changes
- **ALWAYS provide commit message**: `./scripts/dev/dev-restart.sh "Fix safari button logic"`
- **Include Discord notification for big changes**: `./scripts/dev/dev-restart.sh "Fix safari" "Safari navigation working!"`
- **This replaces manual saves** - commit message helps track what changed

### Production Deployment

**🚨 CRITICAL: NEVER deploy without explicit user permission!**

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
npm run deploy-remote-wsl      # Full deployment - uses pm2 restart internally
npm run deploy-commands-wsl    # Commands only (lower risk)
npm run deploy-remote-wsl-dry  # Preview changes (SAFE - no permission needed)
```

### Production Monitoring
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

**Architecture & Standards:**
- **🎨 COMPONENTS V2** (MANDATORY) → [docs/architecture/ComponentsV2.md](docs/architecture/ComponentsV2.md)
- **🔘 BUTTON HANDLER FACTORY** (MANDATORY) → [docs/architecture/ButtonHandlerFactory.md](docs/architecture/ButtonHandlerFactory.md)
- **📐 LEAN MENU DESIGN** → [docs/ui/LeanMenuDesign.md](docs/ui/LeanMenuDesign.md)
- **🔧 ENTITY/EDIT FRAMEWORK** → [docs/architecture/EntityEditFramework.md](docs/architecture/EntityEditFramework.md)
- **📊 ANALYTICS** → [docs/architecture/Analytics.md](docs/architecture/Analytics.md)
- **📝 LOGGING STANDARDS** → [docs/architecture/LoggingStandards.md](docs/architecture/LoggingStandards.md)

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

**Components V2** - ALL UI MUST use `IS_COMPONENTS_V2` flag (1 << 15)

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

### Tools Without Permission Required
**Claude can execute these without asking:**
- `grep` commands and all Grep tool usage
- `./scripts/dev/dev-restart.sh` 
- `npm run deploy-remote-wsl-dry` (preview only)

## 📐 app.js Organization

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
- Button not working → Check BUTTON_REGISTRY registration
- Missing variables → Ensure context extraction
- Permission errors → Use BigInt for permission checks
- Menu crashes → Check 5-button limit per ActionRow
- String Select limits → Maximum 25 options

## 🎯 Available Commands

**Player Commands:**
- `/menu` - Main player interface
- `/castlist` - Display dynamic castlist

**Admin Commands:**
- Most functionality via `/menu` → Production Menu

## 📋 Feature Backlog

See [BACKLOG.md](BACKLOG.md) for prioritized features and user stories.

---

For detailed information on any topic, follow the documentation references above.