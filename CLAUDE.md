# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## PROJECT STATUS: 100% OPTIMIZATION COMPLETE ✅

CastBot has undergone a major optimization initiative that has been fully completed. All core functionality has been refactored from inconsistent error handling patterns to a centralized, maintainable architecture.

## LATEST DEVELOPMENT: LIVE DISCORD ANALYTICS LOGGING ✅ COMPLETE

**Major Feature Addition: Real-time Discord Analytics Logging System**
- **Real-time Discord Posting**: Analytics events automatically posted to Discord channel (#logs, ID: 1385059476243218552) with Markdown formatting
- **Node.js Command Interface**: `toggle-live-logging.js` script for system management without cluttering Discord UI
- **User Exclusion Management**: Toggle Discord users in/out of exclusion list to filter admin interactions
- **Environment Configuration**: Stored in `playerData.json` under `environmentConfig.liveDiscordLogging` structure
- **Rate Limiting & Error Handling**: 1.2-second message queuing with non-blocking error handling to protect main bot
- **Production Deployment**: Successfully deployed and operational in production environment

**Technical Implementation:**
- **Discord Client Integration**: `analyticsLogger.js` enhanced with `setDiscordClient()` and async Discord posting
- **Configuration Management**: New storage functions in `storage.js` for environment config persistence
- **Command-line Interface**: Three-mode script (on/off/exclude) with Discord ID validation and status reporting
- **Async Integration**: All `logInteraction()` calls made async throughout `app.js` for real-time posting

## PREVIOUS DEVELOPMENT: PLAYER MANAGEMENT SYSTEM ✅ COMPLETE

**Major Feature Addition: Enhanced Player Management Interface with Modular Architecture**
- **Unified Interface**: `/menu` → Player Management provides comprehensive admin controls
- **Real-time Player Display**: Shows castlist-style player cards with live data updates
- **Persistent Interface**: Player information remains visible throughout all interactions
- **Modular Architecture**: Reuses `createPlayerCard()` from castlistV2.js for consistency

**Player Management Features Fully Implemented ✅:**
- **Player Selection**: User select dropdown with preserved selections during interactions ✅
- **Player Display Section**: Castlist-style cards with avatars and formatted information ✅
- **Management Buttons**: Pronouns, Timezone, Age, and Vanity Roles controls ✅
- **Filtered Role Selects**: Shows only configured pronouns/timezones (not all server roles) ✅
- **Persistent Display**: Player information stays visible during all button interactions ✅
- **Real-time Updates**: Player data refreshes immediately after changes with proper formatting ✅

**Technical Implementation:**
- **Modular Design**: Uses `createPlayerCard()` from castlistV2.js - single source of truth for player formatting
- **Components V2**: Modern Discord interface with Section components and thumbnails
- **Player Display Format**: Matches `/castlist` exactly - pronouns • age • timezone on line 1, time on line 2
- **Time Calculation**: Uses exact castlistV2 algorithm for accurate timezone display and time formatting
- **Persistent State**: Player display section included in all button handler responses to prevent disappearing

**Architecture Improvements:**
- **Code Reuse**: Eliminated 89 lines of duplicate player formatting logic
- **Maintainability**: Changes to castlist formatting automatically apply to player management
- **Consistency**: Identical display format between `/castlist` and player management interfaces
- **Future-Proof**: Scalable foundation for additional player management features

**Previous Development: Cast Ranking System ✅ (Gallery Component Issue Resolved)**
- Cast ranking system fully functional with Text Display components
- Gallery component investigation concluded - Text Display provides better UX and reliability
- Production-ready application ranking and management system

## PREVIOUS DEVELOPMENT: PRODUCTION MENU V2 IMPLEMENTATION ✅

**Major Feature Addition: Complete Production Menu Redesign**
- **New Multi-Level Interface**: `/prod_menu` now features comprehensive admin management with always-visible castlist and setup buttons
- **Manage Pronouns/Timezones Submenu**: View/edit/react functionality with live role selection and Discord.js builder components
- **Manage Tribes Submenu**: View/add/clear functionality with 3-step Add Tribe flow (role → castlist → emoji modal)
- **Smart Component Handling**: All role selects now use proper Discord.js builders instead of raw components for better validation
- **Single-Select Clear Tribe**: Intuitive tribe removal showing castlist context and proper selection logic
- **Conditional Player Management**: Shows only when pronouns/timezones are configured
- **Fixed Help Button**: Now links to correct Discord server (https://discord.gg/H7MpJEjkwT)

**Implementation Highlights:**
- **Role Select Menus**: Converted from raw Discord components to `RoleSelectMenuBuilder` with proper default values
- **String Select Menus**: Used `StringSelectMenuBuilder` for castlist selection and tribe clearing
- **Modal Submissions**: 3-step tribe addition flow with custom castlist name support
- **Error Prevention**: Fixed duplicate variable declarations and component validation issues
- **User Experience**: Clear tribe now shows role names with castlist context in selection menu
- **Expanded Reaction Support**: Extended from 9 to 30 reactions (1️⃣-🔟, 🇦-🇹) for pronouns/timezones

**Production Ready Features:**
- **Always-Visible Menu**: Production menu shows all management options even with no tribes configured
- **Intuitive Tribe Management**: Single-select clear tribe with castlist context display
- **Robust Error Handling**: All component interactions use proper Discord.js builders for validation
- **Scalable Reaction System**: Supports up to 30 pronoun/timezone roles with reaction-based selection

## PREVIOUS DEVELOPMENT: CASTLIST V2 IMPLEMENTATION ✅

**Major Feature Addition: Discord Components V2 Castlist System**
- **New Command**: `/castlist2` - Modern castlist with inline thumbnails, player cards, and tribe-level pagination
- **Dynamic Component Calculation**: Automatically handles Discord's 40-component limit through intelligent scenario detection
- **Three Display Scenarios**: Ideal (with separators), No-separators (for consistency), Multi-page (for large tribes)
- **Performance Optimized**: 70-80% faster navigation through smart caching and reduced API calls
- **User-First Ordering**: Shows tribes containing the user first in default castlists
- **Mobile-Friendly UI**: Optimized button layout and page indicators for mobile viewing

## Development Commands

### WSL Development Environment (Phase 1 - Active) ✅

**Note: This is a SOLO DEVELOPMENT PROJECT - always work on main branch unless explicitly instructed otherwise.**

**Primary Development Workflow:**
```bash
# Once per development session (or when ngrok URL changes)
./dev-start.sh [optional-commit-message]
# → Starts persistent ngrok daemon (stable URL across restarts)
# → Handles git operations (safety net like start-and-push.ps1)
# → Starts CastBot with pm2 for process management
# → Shows Discord webhook URL for copy/paste

# Your new "Ctrl+C" - restart app anytime during development
./dev-restart.sh [optional-commit-message]  
# → Git add, commit, push (preserves safety net)
# → Restarts ONLY the app (ngrok URL unchanged)
# → Use as much as you want - same muscle memory, better results

# Check status and get URLs anytime
./dev-status.sh
# → Shows ngrok URL + Discord developer console link
# → Shows pm2 app status
# → Shows git status and recent commits

# Clean shutdown when done
./dev-stop.sh
# → Stops pm2 app cleanly
# → Leaves ngrok running (preserves URL for next session)
```

**Claude Code Integration:**
```bash
# Commands for Claude to use during development:
./dev-restart.sh           # Deploy changes after Claude modifications (ALWAYS USE THIS)
tail -f /tmp/castbot-dev.log # Monitor application logs  
./dev-status.sh            # Check complete environment status
```

**🚨 IMPORTANT: Claude Development Protocol:**
- **ALWAYS restart the development service after making ANY code changes**
- **Use `./dev-restart.sh` to deploy changes immediately**  
- **Inform the user that dev has been restarted and they can test changes**
- **This ensures the user can immediately test changes without manual intervention**

**Benefits of WSL Setup:**
- ✅ **Stable ngrok URL** - No more Discord console updates every restart
- ✅ **Production tooling** - pm2 process management matches production
- ✅ **Git safety net** - Automatic commit/push like start-and-push.ps1
- ✅ **Claude integration** - I can restart your app after making changes
- ✅ **Familiar workflow** - ./dev-restart.sh is your new Ctrl+C

### Development vs Production Deployment Comparison

| **Aspect** | **`./dev-start.sh` (Development)** | **`npm run deploy-remote-wsl` (Production)** |
|------------|-------------------------------------|-----------------------------------------------|
| **Purpose** | Start local development environment | Deploy to remote production server |
| **Environment** | WSL (local machine) | AWS Lightsail (remote server) |
| **Execution** | Your local WSL environment | SSH commands to remote server |
| **Target** | Development bot (local testing) | Production bot (live Discord servers) |
| **Process Manager** | Direct `node app.js` (PID tracking) | `pm2` (castbot-pm process) |
| **Networking** | Local port 3000 via ngrok tunnel | Direct HTTPS on port 3000 |
| **Domain** | Static ngrok: `adapted-deeply-stag.ngrok-free.app` | Production domain on AWS |
| **Git Flow** | Local → GitHub (push) | GitHub → Remote (pull) |
| **Safety** | 🟢 Low risk (only affects testing) | 🔴 High risk (affects all Discord servers) |
| **Restart Speed** | ⚡ ~3 seconds | ⚡ ~5-10 seconds |
| **Backup** | ❌ None needed | ✅ Timestamped backup before deployment |
| **Usage Pattern** | Multiple times daily during development | Infrequent major deployments |

**Key Principle**: Development optimized for fast iteration, Production optimized for stability and safety.

## Deployment Scripts Analysis & Evolution

### **🟢 ACTIVE DEPLOYMENT TOOLING**

**Primary WSL Development Workflow:**
- `./dev-start.sh` - Complete development environment startup with static ngrok domain
- `./dev-restart.sh` - Quick restart with auto-commit and GitHub push ("new Ctrl+C")
- `./dev-status.sh` - Environment status monitoring (ngrok, app, git status)
- `./dev-stop.sh` - Clean shutdown with optional ngrok preservation

**WSL Production Deployment:**
- `npm run deploy-remote-wsl` - Full production deployment with risk indicators
- `npm run deploy-commands-wsl` - Commands-only deployment (faster, lower risk)
- `npm run deploy-remote-wsl-dry` - Safe preview of deployment changes
- `npm run logs-remote-wsl` - Remote log monitoring
- `npm run status-remote-wsl` - Production server status check
- `npm run ssh-test` - SSH connectivity verification

### **📦 DEPRECATED TOOLING (Cleaned Up June 2025)**

**Removed PowerShell Scripts:**
- ~~`start-and-push.ps1`~~ - Replaced by `dev-restart.sh`
- ~~`start-dev.ps1`~~ - Replaced by `dev-start.sh` 
- ~~`launch-terminals.ps1`~~ - Obsolete with WSL workflow
- ~~`deploy-remote.js`~~ - Replaced by `deploy-remote-wsl.js`

**Removed NPM Scripts:**
- ~~`npm run deploy-remote`~~ - Windows-based deployment (replaced by WSL variants)
- ~~`npm run logs-remote`~~ - Windows-based log viewing (replaced by WSL variant)
- ~~`npm run status-remote`~~ - Windows-based status (replaced by WSL variant)

### **🔄 Evolution Timeline**

| **Phase** | **Period** | **Platform** | **Key Features** | **Status** |
|-----------|------------|--------------|------------------|------------|
| **Phase 1** | Pre-June 10 | PowerShell/Windows | Manual ngrok URLs, complex shell patterns | ❌ Deprecated |
| **Phase 2** | June 10-14 | WSL Migration | Static ngrok domain, simplified processes | ✅ Active |
| **Phase 3** | June 14+ | WSL Native | Risk indicators, SSH automation, auto-git-push | ✅ Current |

**Current Philosophy:** Development optimized for fast iteration, Production optimized for stability and safety.

### Legacy PowerShell Development (Deprecated)
- `npm start` - Start the bot with app.js
- `npm run dev` - Start with nodemon for auto-restart during development
- `npm install` - Install dependencies

### Command Registration
- `npm run deploy-commands` - **Primary deployment script** - Auto-detects dev/prod environment and deploys appropriately
- `npm run clean-commands` - Clean up duplicate/broken commands only
- `npm run verify-commands` - Verify current command registration status
- `npm run register` - Legacy: Register global slash commands (use deploy-commands instead)
- `npm run registerguild` - Legacy: Register commands to dev guild only (use deploy-commands instead)
- `npm run deploy` - Legacy: Deploy commands (use deploy-commands instead)

### Environment-Specific Scripts
- `.\registerslashcommands.ps1` - PowerShell script for command registration
- `.\start-and-push.ps1` - Legacy PowerShell script for dev environment startup
- `.\start-dev.ps1` - **NEW** Complete automated dev startup script

### Development Environment Startup Workflow
**ONE-COMMAND startup for CastBot dev environment:**

```powershell
.\start-dev.ps1
```

**This script automatically:**
1. ✅ Checks if ngrok is running, starts it if needed (`ngrok http 3000`)
2. ✅ Pushes any git changes to current branch
3. ✅ Displays the Discord webhook URL ready for copy/paste
4. ✅ Provides the Discord developer console link
5. ✅ Starts the CastBot application

**Output format:**
```
🎯 DISCORD WEBHOOK URL (copy this):
https://[random-id].ngrok-free.app/interactions

📝 Update Discord webhook at:
https://discord.com/developers/applications/1328366050848411658/information
```

**Note**: ngrok URL changes each restart, but the script handles detection and provides easy copy/paste format.

## Architecture Overview

### Core Components

**app.js** - Main application entry point using Express.js for Discord interactions webhook and Discord.js client for API operations. Handles slash command processing, dynamic castlist generation, emoji management, and comprehensive button interaction routing for both legacy and castlist2 systems. ✅ FULLY OPTIMIZED with centralized error handling and performance improvements.

**castlistV2.js** - ✅ **NEW** Discord Components V2 castlist implementation module. Provides modern, interactive castlist display with player cards, inline thumbnails, and intelligent pagination. Features dynamic component calculation, three-scenario system for 40-component limit handling, context-aware navigation, and user-first tribe ordering. Fully modular and expandable architecture.

**storage.js** - JSON-based data persistence layer managing player data, tribes, timezones, and pronouns per Discord guild. Uses `playerData.json` for storage with automatic migration support.

**commands.js** - Slash command definitions with environment-aware naming (dev_ prefix in development). Includes permission validation using Discord's permission bitfields. ✅ UPDATED with `/castlist2` command definition.

**utils.js** - Discord API wrapper functions for making authenticated requests and installing global/guild commands.

### Optimization Infrastructure (✅ ALL COMPLETE)

**errorHandler.js** - Centralized error handling and response management system. All 13 command handlers now use `executeWithErrorHandling` pattern.

**commandRegistry.js** - Command validation and utility functions for consistent command processing.

**config.js** - Centralized configuration management with environment detection.

**performanceMonitor.js** - Performance tracking utilities (ready for activation).

**applicationManager.js** - Complete application management system for prospective player recruitment. Handles application button creation, private channel generation, and configuration management. ✅ FULLY IMPLEMENTED with modular architecture for future expansion.

### Data Architecture

The bot stores guild-specific data in a nested JSON structure:
```
{
  "guildId": {
    "players": { "userId": { age, pronouns, timezone, ... }},
    "tribes": { "tribeName": { members, emoji, ... }},
    "timezones": { mapping of timezone roles },
    "pronounRoleIDs": [ array of pronoun role IDs ]
  }
}
```

### Key Features

**Dynamic Castlists (Legacy & Modern)** - Two castlist systems available:
- **Legacy `/castlist`**: Traditional Discord embeds with 25-field limit management and field-based player display
- **Modern `/castlist2`**: ✅ **NEW** Discord Components V2 with inline thumbnails, player cards, unlimited tribe support, and intelligent pagination

**Components V2 Castlist Features** ✅:
- **Player Cards**: Individual Section components with inline avatar thumbnails and comprehensive player info
- **Dynamic Component Calculation**: Automatic handling of Discord's 40-component limit through three scenarios
- **Intelligent Pagination**: Tribe-level pagination with even distribution and context-aware navigation
- **User-First Ordering**: Shows user's tribes first in default castlists for improved UX
- **Performance Optimized**: 70-80% faster navigation through smart caching and reduced API calls
- **Mobile-Friendly**: Optimized button layout and concise page indicators

**Role-Based Data Storage** - Uses Discord roles to track player metadata (pronouns, timezones) rather than separate databases, allowing hosts to manage data through Discord's native interface.

**Custom Emoji Management** - Automatically creates custom emojis from Discord avatars for each player in the castlist with cleanup on tribe removal.

**Reaction-Based Role Assignment** - User-friendly role selection through Discord reactions for pronouns and timezones.

**Multi-Environment Support** - Development mode uses ngrok for local testing with separate Discord application, production runs on AWS Lightsail with Let's Encrypt SSL.

**Specialized Game Modes** - Includes Tycoons game mode support with specialized role structures.

## Environment Configuration

### Required .env Variables
```
DISCORD_TOKEN=your_bot_token
PUBLIC_KEY=your_discord_public_key
APP_ID=your_discord_application_id
DEV_GUILD_ID=development_server_id
PORT=3000
PRODUCTION=FALSE  # Set to TRUE for production
USE_COMPONENTS_V2=false  # Set to true to test Discord Components v2 for /apply_button
```

### Development vs Production
- **Development**: Uses `dev_` command prefixes, ngrok tunneling, separate Discord app ID
- **Production**: Global commands, AWS Lightsail hosting, pm2 process management

### Production Deployment Process

**SSH Access and Remote Deployment:**
```bash
ssh castbot-lightsail               # Direct SSH connection to production server
npm run deploy-remote-dry-run       # Preview what deployment would do (SAFE)
npm run deploy-remote               # Full deployment (code + commands) [USE WITH CAUTION]
npm run deploy-commands-remote      # Commands only (faster) [USE WITH CAUTION]
npm run logs-remote                 # Monitor remote logs [USE WITH CAUTION]
npm run status-remote               # Check remote status [USE WITH CAUTION]
```

**SSH Configuration:**
- SSH alias `castbot-lightsail` configured for easy access
- Remote path: `/opt/bitnami/projects/castbot`
- User: `bitnami`
- **Windows users**: Use PowerShell commands for SSH setup
- Always test with `npm run deploy-remote-dry-run` first

**Manual Deployment Process:**
~~1. Stop bot: `pm2 stop castbot-pm`~~ Removed: approach below allows us to carefully restart as required. As soon as the restart happens, the bot will load up the newly deployed code, minimising outages for users (especially in case of issues)
2. Deploy commands: `npm run deploy-commands`
3. Restart: `pm2 restart castbot-pm`
4. Monitor: `pm2 logs castbot-pm`

## Data Migration

The bot includes migration support for multi-castlist functionality. When updating production, run migration scripts as needed before restarting the service.

## Available Commands

### Admin Commands (Require Manage Roles/Channels/Server)
NOTE: all of the below has been replaced with /menu.
- `add_tribe` - Add tribes to castlists with conditional emoji creation (controlled by `show_player_emojis` parameter)
- `clear_tribe` - Remove tribes from castlists with emoji cleanup  
- `setup_castbot` - Automated role generation for pronouns and timezones
- `setup_tycoons` - Specialized role creation for Tycoons game mode
- `pronouns_add` - Add custom pronoun roles to server
- `remove_pronouns` - Remove pronoun roles from server
- `timezones_add` - Add timezone roles with UTC offsets
- `timezones_remove` - Remove timezone roles from server
- `react_timezones` - Create reaction-based timezone selection
- `react_pronouns` - Create reaction-based pronoun selection
- `set_players_age` - Bulk age assignment for multiple players
- `apply_button` - Create application buttons for prospective player recruitment~~

### Player Commands (No special permissions)
- `castlist` - Display dynamic castlist with Components V2 (modern layout with player cards)
- `player_set_age` - Individual player age assignment
- /menu: Allows players to set age / pronouns / timezone and possible future features.

## Error Handling Architecture

All command handlers use the centralized `executeWithErrorHandling` pattern from `errorHandler.js`:
- Eliminates manual try-catch blocks
- Standardized error responses
- Consistent user experience
- Single point of error management

## VS Code Tasks Available
- "Start Ngrok" - Launch ngrok tunnel for Discord webhooks
- "Run Start Script" - Execute complete development startup  
- "Open General Terminal" - Launch PowerShell terminal

## Testing Workflow

When developing new features:
1. Set `PRODUCTION=FALSE` in .env
2. Use `npm run registerguild` for faster command deployment to test server
3. Test with ngrok tunnel before deploying to production
4. Use `node fix_commands.js` to clean up any command registration issues

## Application Management System ✅ COMPLETE

**New Feature: Application Button System**
- **Command**: `/apply_button` - Admin-only command for creating application buttons
- **Flow**: Modal configuration → Channel/Category/Style selection → Button deployment
- **User Experience**: Click button → Private application channel creation with proper permissions
- **Architecture**: Modular `applicationManager.js` with expandable design for future enhancements
- **Data Storage**: Configurations stored in existing `playerData.json` structure
- **Scale**: Designed for 1000+ servers with 20-40 applicants each

**Development Stats for Application System:**
- **Total Cost**: $4.46
- **Development Time**: 1h 52m (API: 1h 6m)
- **Code Changes**: 1028 lines added, 64 lines removed
- **Token Usage**: 450k input, 121k output tokens across claude-3-5-haiku and claude-sonnet models

**Future Expansion Ready:**
- Auto-generated application questions
- Admin application summary/tabulation
- Applicant ranking and casting management tools

## Components V2 Castlist System ✅ COMPLETE

**New Feature: Modern Castlist Display with Components V2**
- **Command**: `/castlist2` - Modern alternative to traditional castlist display
- **Features**: 
  - Player cards with inline Discord avatar thumbnails
  - Dynamic component calculation to handle Discord's 40-component limit
  - Three-scenario system: ideal (≤40 with separators), no-separators, multi-page pagination
  - Context-aware navigation with tribe-level pagination
  - Mobile-optimized UI with concise button indicators
- **Architecture**: 
  - `castlistV2.js` module with complete dynamic component system
  - Automatic scenario detection based on tribe sizes
  - Even distribution multi-page pagination for large tribes
  - Hex color support with automatic role color detection
- **Implementation Details**:
  - Section components (type 9) with thumbnail accessories (type 11)
  - Container components (type 17) with accent colors
  - Text Display components (type 10) with combined player info
  - Custom ID format: `castlist2_nav_${action}_${tribeIndex}_${tribePage}_${castlistName}`
  - Components V2 flag (1 << 15 = 32768) for modern Discord UI

**Technical Achievements:**
- Successfully handles Discord's 40-component limit through intelligent calculation
- Dynamic scenario switching based on tribe member counts
- Context-aware "Last Tribe/Page" vs "Next Tribe/Page" navigation
- Mobile-friendly design with page info in headers rather than buttons
- Infrastructure ready for future tribe ordering features (user-first display)

**Recent Fix: Menu Button Handler Routing ✅ COMPLETE**
- **Issue**: Menu buttons were generating `show_castlist2_*` custom IDs but being intercepted by legacy `show_castlist` handler
- **Root Cause**: Button handler order in `app.js` - legacy handler condition `startsWith('show_castlist')` caught all `show_castlist2` buttons first
- **Solution**: Reordered handler conditions to check `show_castlist2` before `show_castlist`
- **Result**: Menu systems now properly route to modern castlist2 implementation
- **Impact**: Users get improved UX with Components V2 features when clicking menu buttons

## Emoji Management Enhancements ✅ COMPLETE

**Enhanced `/add_tribe` Command**
- **Conditional Emoji Generation**: New `show_player_emojis` parameter (default: true)
- **Behavior**: When set to `false`, skips emoji creation while still adding tribe to castlist
- **Use Case**: Allows testing `/castlist2` without hitting Discord emoji limits
- **Backwards Compatibility**: Maintains existing behavior when parameter is omitted or set to `true`

## Production Readiness Status: ✅ READY
- All error handling patterns standardized and tested
- Zero syntax errors across all files
- Comprehensive error recovery mechanisms
- Environment-specific configuration handling
- Rate limiting and API best practices implemented
- Application system fully tested and production-ready
- ✅ **NEW**: Castlist2 system fully implemented and tested
- ✅ **NEW**: Button interaction routing fixed for both legacy and modern castlists
- ✅ **NEW**: Menu systems updated to use castlist2 for improved user experience
- ✅ **NEW**: Performance optimizations implemented (70-80% faster navigation)
- ✅ **NEW**: User-first tribe ordering for enhanced UX in default castlists

## Feature Backlog

**BACKLOG.md** contains the product backlog with user stories and feature requests organized by priority. This serves as the roadmap for future development and includes:

- **Immediate Priority**: Critical fixes and development environment improvements
- **High Priority**: Core feature enhancements and cleanup tasks  
- **Medium Priority**: Advanced features like enhanced emoji management, analytics, and application system expansions
- **Low Priority**: Infrastructure improvements and advanced integrations
- **Future Tech Debt**: Code cleanup and modernization tasks

The backlog is continuously updated based on user feedback and development priorities.

## Test Deployment - 2025-06-14
Testing automated git push in dev-restart.sh workflow.