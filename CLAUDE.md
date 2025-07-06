# CLAUDE.md

This file provides guidance to Claude Code when working with CastBot. This is a high-level navigation document - follow the references to detailed documentation.

## 🚀 Development Workflow

**MANDATORY:** Follow our standard agile-devops workflow documented in [docs/workflow/DevWorkflow.md](docs/workflow/DevWorkflow.md)

**Definition of Done:** Every feature must complete the checklist in [docs/workflow/DefinitionOfDone.md](docs/workflow/DefinitionOfDone.md)

## 📚 Feature Documentation

When working on specific features, refer to these dedicated documentation files:

**🦁 SAFARI SYSTEM:** Dynamic content, buttons, currency, stores → [docs/features/Safari.md](docs/features/Safari.md) | [Index](docs/features/safari/README.md)

**🗺️ SAFARI MAP EXPLORER:** Map building, grid systems, exploration → [docs/features/SafariMapExplorer.md](docs/features/SafariMapExplorer.md)

**⚡ SAFARI POINTS SYSTEM:** Resource management, stamina, regeneration → [docs/features/SafariPoints.md](docs/features/SafariPoints.md)

**🚶 SAFARI MAP MOVEMENT:** Player movement, permissions, exploration → [docs/features/SafariMapMovement.md](docs/features/SafariMapMovement.md)

**📋 SEASON APPLICATION BUILDER:** Application systems, applicant management → [docs/features/SeasonAppBuilder.md](docs/features/SeasonAppBuilder.md)

**🎨 COMPONENTS V2:** Discord UI architecture (MANDATORY) → [docs/architecture/ComponentsV2.md](docs/architecture/ComponentsV2.md)

**🔧 ENTITY/EDIT FRAMEWORK:** Universal UI system for content management → [docs/architecture/EntityEditFramework.md](docs/architecture/EntityEditFramework.md)

**📊 ANALYTICS:** Logging and analytics system → [docs/architecture/Analytics.md](docs/architecture/Analytics.md)

**📝 LOGGING:** Logging standards and utilities → [docs/architecture/LoggingStandards.md](docs/architecture/LoggingStandards.md)

## 🛠️ Critical Development Information

### Primary Development Workflow

**Environment:** Solo development on main branch, VS Code with WSL terminal

```bash
# Start development session
./scripts/dev/dev-start.sh [optional-commit-message]

# Your new "save" command - use frequently!
./scripts/dev/dev-restart.sh [optional-commit-message]

# Check status
./scripts/dev/dev-status.sh

# Clean shutdown
./scripts/dev/dev-stop.sh
```

**🚨 CRITICAL Protocol - RESTART AFTER EVERY CODE CHANGE:**
- **MANDATORY:** Run `./scripts/dev/dev-restart.sh` after ANY code changes
- **INFORM** the user that dev has been restarted so they can test
- **This ensures** immediate testing without manual intervention
- **DO NOT** use `npm run dev` - use the restart script only

**⚠️ IMPORTANT:** The restart script handles git commits, Discord notifications, and proper app restart

### Production Deployment

```bash
npm run deploy-remote-wsl      # Full deployment (HIGH RISK)
npm run deploy-commands-wsl    # Commands only (lower risk)
npm run deploy-remote-wsl-dry  # Preview changes (SAFE)
```

### Production Log Reading

```bash
npm run logs-prod              # Last 100 lines
npm run logs-prod-follow       # Real-time log streaming
npm run logs-prod-errors       # Only error logs
npm run logs-prod-safari       # Only Safari feature logs
npm run logs-prod-stats        # Log statistics and analysis

# Advanced filtering
npm run logs-prod -- --filter "user 391415444084490240"
npm run logs-prod -- --feature BUTTON --level debug
```

## 🔧 Architecture Overview

### Core Components
- **app.js** - Main entry point, handles Discord interactions
- **storage.js** - JSON-based data persistence
- **commands.js** - Slash command definitions
- **safariManager.js** - Safari system core functionality

### Data Storage
- **playerData.json** - Player information and Safari data
- **safariContent.json** - Safari buttons, items, shops, attack queues

### Key Patterns
- Work on main branch (solo development)
- Use existing patterns in codebase
- **MANDATORY: Discord Components V2** - ALL UI must use Components V2 pattern (see architecture docs)
- Centralized error handling via errorHandler.js

## 🎨 Discord Components V2 (MANDATORY)

**🚨 CRITICAL: ALL Discord UI must use Components V2 pattern**

### ✅ Components V2 Requirements
```javascript
// MANDATORY: Set Components V2 flag for ALL messages
const flags = 1 << 15; // IS_COMPONENTS_V2

// ❌ FORBIDDEN: Cannot use 'content' field with Components V2
const response = {
  content: "Text here", // THIS WILL FAIL
  flags: flags
};

// ✅ REQUIRED: Use Container + Text Display pattern
const response = {
  components: [{
    type: 17, // Container
    components: [
      {
        type: 10, // Text Display
        text: "Your message content here"
      },
      {
        type: 1, // Action Row
        components: [/* buttons here */]
      }
    ]
  }],
  flags: flags
};
```

**Key Rules:**
- NEVER use `content` field with `IS_COMPONENTS_V2` flag
- ALWAYS use Container (type 17) for visual grouping
- Use Text Display (type 10) instead of content field
- Reference: [docs/architecture/ComponentsV2.md](docs/architecture/ComponentsV2.md)

## 🚀 Discord Button Implementation

**🚨 MANDATORY: Use Button Handler Factory System** 

**STEP 1:** Read [docs/architecture/ButtonHandlerFactory.md](docs/architecture/ButtonHandlerFactory.md) for complete documentation

**STEP 2:** Always use the factory pattern for ALL new buttons:

### ✅ New Button Handler Template (MANDATORY)
```javascript
// 1. ADD TO BUTTON_REGISTRY (buttonHandlerFactory.js)
'your_button_id': {
  label: 'Button Text',
  description: 'What this button does',
  emoji: '🔥',
  style: 'Primary',
  category: 'feature_name'
}

// 2. CREATE HANDLER (app.js)
} else if (custom_id === 'your_button_id') {
  return ButtonHandlerFactory.create({
    id: 'your_button_id',
    requiresPermission: PermissionFlagsBits.ManageRoles, // Optional
    permissionName: 'Manage Roles',
    handler: async (context) => {
      // 🚨 MANDATORY LOGGING PATTERN - prevents "This interaction failed" confusion
      console.log(`🔍 START: your_button_id - user ${context.userId}`);
      
      // Your logic here - context has guildId, userId, member, etc.
      
      console.log(`✅ SUCCESS: your_button_id - completed`);
      return {
        content: 'Success!',
        ephemeral: true
      };
    }
  })(req, res, client);
}
```

### ✅ Natural Language Benefits
- You can now say "analytics button" instead of hunting for IDs
- `ButtonRegistry.search('emergency')` finds emergency-related buttons
- `ButtonRegistry.findByLabel('Server Stats')` returns exact button

**🚨 CRITICAL: 5-Button Limit** - Action Rows can contain maximum 5 buttons (ComponentsV2.md line 61)

**Always update:** [docs/architecture/BUTTON_HANDLER_REGISTRY.md](docs/architecture/BUTTON_HANDLER_REGISTRY.md)

### 🚨 Button Testing Protocol
If a button shows "This interaction failed":
1. Check logs for `🔍 START: button_id` - if missing, handler isn't being called
2. Check logs for `✅ SUCCESS: button_id` - if missing, handler crashed
3. For operations >3s, ensure `deferred: true` in factory config
4. See troubleshooting section in [docs/architecture/ButtonHandlerFactory.md](docs/architecture/ButtonHandlerFactory.md)

## 📋 Feature Backlog

See [BACKLOG.md](BACKLOG.md) for prioritized feature requests and user stories.

**High Priority:**
- 🔄 Phase 2A: Button Handler Factory System → [docs/architecture/ButtonHandlerFactory.md](docs/architecture/ButtonHandlerFactory.md)
- Enhanced tribe ordering features
- Safari Phase 2 features

## 🎯 Available Commands

### Player Commands
- `/menu` - Main player interface for age, pronouns, timezone
- `/castlist` - Display dynamic castlist with player information

### Admin Commands
Most admin functionality accessed via `/menu` → Production Menu

## 🔍 Quick Reference

### When to Create New Documentation
- **Simple feature** → Document in BACKLOG.md
- **Complex feature** → Create dedicated .md file in docs/features/
- **Always** → Update references in this file

### Common Issues
- **Button not working** → Check dynamic handler exclusions
- **Missing variables** → Ensure context extraction at handler start
- **Permission errors** → Use BigInt for permission checks
- **Menu crashes** → Check 5-button limit per Action Row (see ComponentsV2.md line 61)

### Development Best Practices
1. Follow existing code patterns
2. Add comprehensive logging (see DoD)
3. Test on mobile Discord
4. Handle errors gracefully
5. Update documentation immediately

---

For detailed information on any topic, follow the documentation references above. This file serves as your navigation guide to the comprehensive CastBot documentation.

## Memories

- What are we memorizing