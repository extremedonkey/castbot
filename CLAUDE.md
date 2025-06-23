# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**🦁 SAFARI SYSTEM REFERENCE:** When prompts mention Safari, Idol Hunt, Questions, custom buttons, currency systems, dynamic content, or application builders, refer to [Safari.md](Safari.md) for complete documentation and implementation guidelines.

## PROJECT STATUS: 100% OPTIMIZATION COMPLETE ✅

CastBot has undergone a major optimization initiative that has been fully completed. All core functionality has been refactored from inconsistent error handling patterns to a centralized, maintainable architecture.

## LATEST DEVELOPMENT: SAFARI DYNAMIC CONTENT SYSTEM ✅ MVP1 COMPLETE

**Major Feature Addition: Safari Dynamic Content Management System MVP1**
- **🦁 Safari Submenu**: Complete dynamic content management interface in Production Menu
- **📝 Create Custom Button**: Modal-driven button creation with action configuration (display_text, update_currency, follow_up_button)
- **📤 Post Custom Button**: Channel selection workflow for posting interactive buttons to any text channel
- **💰 Manage Currency**: Complete currency management with view all balances, set player currency, and reset all functionality
- **📊 View All Buttons**: Comprehensive listing of created buttons with usage statistics and metadata
- **🚀 Dynamic Execution**: Real-time button interaction handling with action chaining and currency updates

**Technical Implementation:**
- **New Module**: `safariManager.js` with complete button lifecycle management and action execution engine
- **Data Storage**: `safariContent.json` for button definitions separate from critical `playerData.json`
- **Button Handler System**: Dynamic button execution with `safari_{guildId}_{buttonId}_{timestamp}` custom ID pattern
- **Action Types**: Three core action types - display_text (Components V2 formatting), update_currency (with balance tracking), follow_up_button (action chaining)
- **Permission Model**: Admin-only creation (ManageRoles permission) with public interaction capability
- **Currency System**: Full CRUD operations on player currency with audit trails and usage tracking

**MVP1 Features Completed:**
- ✅ **Button Creation Flow**: Modal → Action Selection → Action Configuration → Data Persistence
- ✅ **Post to Channel**: Button Selection → Channel Selection → Discord Posting with proper custom IDs
- ✅ **Currency Management**: Overview Dashboard → View All → Set Individual → Reset All with confirmation
- ✅ **View All Interface**: Sortable list with creation dates, action counts, and usage statistics
- ✅ **Dynamic Execution**: Click → Action Processing → Response Generation with usage count tracking
- ✅ **Components V2 Integration**: Modern Discord UI with Container components and IS_COMPONENTS_V2 flag
- ✅ **Error Handling**: Comprehensive error handling with user-friendly messages and debug logging
- ✅ **Data Validation**: Input validation for currency amounts, button labels, and emoji codes

**Safari System Integration:**
- **Production Menu**: Safari submenu accessible via 🦁 Safari button in Production Menu
- **Admin Permissions**: All Safari functions require ManageRoles permission for security
- **Player Interactions**: Posted buttons are clickable by all server members for dynamic experiences
- **Analytics Integration**: Button usage tracked and logged via existing analytics system
- **Scalable Architecture**: Ready for MVP2 expansion with conditional logic, shop systems, and advanced features

**MVP1 Technical Achievements:**
- **Button Lifecycle**: Complete CRUD operations for custom buttons with metadata tracking
- **Action Engine**: Modular action system supporting multiple action types per button with ordering
- **Currency Backend**: Player currency system with persistence, validation, and audit trails
- **Channel Integration**: Seamless posting to any text/announcement channel with permission checking
- **UI Excellence**: Modern Discord Components V2 interface with proper container components and styling

**MVP1 Status:** ✅ PRODUCTION READY
- All core functionality implemented and tested
- Complete admin interface with intuitive workflows
- Player interaction system fully functional
- Currency management system operational
- Ready for community deployment and feedback

**Next Phase:** MVP2 - Conditional Logic, Shop System, Random Outcomes, and Advanced Action Types

## PREVIOUS DEVELOPMENT: SERVER USAGE ANALYTICS VISUALIZATION ✅ PHASE 1 COMPLETE

**Major Feature Addition: Phase 1 - Basic Text Analytics for Server Usage Tracking**
- **📈 Server Usage Stats Button**: Added to Reece Stuff submenu (restricted access) for server usage analysis
- **Log Parsing System**: Comprehensive parsing of `/logs/user-analytics.log` supporting both old and new formats
- **Server Ranking Analytics**: 7-day activity analysis with server-by-server interaction tracking
- **Rich Discord Display**: Professional embeds showing rankings, user engagement, and usage insights
- **Debug Logging**: Comprehensive logging for troubleshooting timestamp parsing and data processing

**Technical Implementation (Phase 1):**
- **New Module**: `serverUsageAnalytics.js` with complete log parsing and analytics engine
- **Timestamp Parsing**: Handles multiple log formats including `[8:45AM] Fri 20 Jun 25` and ISO timestamps
- **Button Integration**: Added `prod_server_usage_stats` handler with security restrictions
- **Discord Formatting**: Rich embeds with medal rankings, user counts, and server insights
- **Performance Tracking**: Command vs button interaction analysis and user engagement metrics

**Analytics Output Features:**
- **Top 10 Server Rankings**: Medal emojis for top 3, detailed interaction breakdowns
- **User Engagement Metrics**: Unique user counts, command/button ratios, activity patterns
- **Smart Insights**: Identifies command-heavy vs button-heavy servers, high engagement patterns
- **7-Day Period Analysis**: Configurable time periods with automatic date filtering

**Phase 1 Implementation Status:** ✅ COMPLETE
- ✅ Button added to Reece Stuff submenu with proper security
- ✅ Complete log parsing system with timestamp handling
- ✅ Server ranking and statistics calculation engine
- ✅ Discord embed formatting with rich insights
- ✅ Debug logging for troubleshooting and monitoring
- ✅ BUTTON_HANDLER_REGISTRY.md updated with new handler

**Next Phase:** Phase 2 - Visual Charts and Enhanced Analytics Dashboard

## PREVIOUS DEVELOPMENT: LIVE DISCORD ANALYTICS LOGGING ✅ COMPLETE

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

## 🔧 DEVELOPMENT STANDARDS & DEFINITION OF DONE

### **Definition of Done (DoD) for All New Features** 🎯

Every new feature implementation MUST include the following before being considered complete:

#### **1. Comprehensive Logging Requirements** 📋
- **Debug Logging**: Add detailed debug logs at key execution points using consistent format:
  ```javascript
  console.log('🔍 DEBUG: [Feature] Starting [action] for user:', userId);
  console.log('✅ DEBUG: [Feature] [step] completed successfully');
  console.log('❌ DEBUG: [Feature] [error] occurred:', error.message);
  ```
- **Error Logging**: All try-catch blocks must log errors with context
- **Performance Logging**: Add timing logs for operations > 100ms
- **User Action Logging**: All user interactions logged via `logInteraction()` 
- **State Change Logging**: Log before/after states for data modifications

#### **2. Error Handling Standards** ⚠️
- **Try-catch blocks** around all async operations
- **Graceful fallbacks** for non-critical failures
- **User-friendly error messages** with ephemeral responses
- **Error recovery mechanisms** where possible

#### **3. Documentation Requirements** 📚
- **Function JSDoc comments** with parameters and return types
- **BUTTON_HANDLER_REGISTRY.md updates** for all new buttons
- **CLAUDE.md updates** documenting the feature implementation
- **Inline code comments** for complex logic

#### **4. Testing Verification** ✅
- **Manual testing** in development environment
- **Edge case testing** (missing data, invalid inputs, etc.)
- **Error scenario testing** (network failures, permission issues)
- **Cross-browser/mobile compatibility** for Discord interfaces

#### **5. Code Quality Standards** 🏗️
- **Consistent naming conventions** following existing patterns
- **Single Responsibility Principle** for functions
- **Avoid code duplication** - reuse existing utilities
- **Performance considerations** for Discord's 3-second interaction limit

#### **6. Integration Requirements** 🔗
- **Security checks** appropriate for the feature (admin permissions, user ID restrictions)
- **Button handler registration** in proper location in app.js
- **BUTTON_HANDLER_REGISTRY.md updates** - ALWAYS update this file when adding new buttons
- **Proper component cleanup** (remove unused imports, variables)
- **Environment configuration** stored in appropriate location

### **Logging Standards by Feature Type** 📊

| Feature Type | Required Logs | Examples |
|--------------|---------------|----------|
| **Button Handlers** | Start, authorization, action, completion | `🔍 DEBUG: Button [id] clicked by user [id]` |
| **Menu Systems** | Navigation, component creation, user flow | `✅ DEBUG: Menu [name] created with [x] components` |
| **Data Processing** | Input validation, processing steps, output | `📊 DEBUG: Processing [x] records, found [y] matches` |
| **API Calls** | Request start, parameters, response, errors | `🌐 DEBUG: Discord API call [endpoint] completed in [time]ms` |
| **File Operations** | File access, read/write operations, errors | `📁 DEBUG: File [path] read successfully, [size] bytes` |

### **Pre-Deployment Checklist** ✅

Before running `./dev-restart.sh`, verify:
- [ ] All debug logs added and tested
- [ ] Error handling covers all failure scenarios  
- [ ] BUTTON_HANDLER_REGISTRY.md updated
- [ ] Manual testing completed successfully
- [ ] No console errors in browser/Discord
- [ ] Performance is acceptable (< 3 seconds)
- [ ] Security checks implemented appropriately

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

## 🚨 CRITICAL: Discord Button/Component Implementation Standards

### **MANDATORY CHECKLIST FOR ALL BUTTON HANDLERS** ✅

**⚠️ FAILURE TO FOLLOW THESE INSTRUCTIONS WILL RESULT IN BROKEN IMPLEMENTATIONS**

When implementing ANY Discord button, select menu, modal, or component handler, you MUST follow this exact pattern EVERY TIME:

#### **1. Context Extraction (ALWAYS FIRST)** 🎯
```javascript
// MANDATORY - Extract ALL these variables at the START of EVERY handler
const guildId = req.body.guild_id;
const userId = req.body.member?.user?.id || req.body.user?.id;
const member = req.body.member;
const channelId = req.body.channel_id;
const messageId = req.body.message?.id;
const token = req.body.token;
const applicationId = req.body.application_id || process.env.APP_ID;

// ONLY if you need Discord.js client
const guild = client?.guilds?.cache?.get(guildId);
const channel = client?.channels?.cache?.get(channelId);
```

#### **2. Security/Permission Checks (IF REQUIRED)** 🔒
```javascript
// Admin permission check - ALWAYS use BigInt conversion
if (!member?.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: '❌ You need Manage Roles permission to use this feature.',
            flags: InteractionResponseFlags.EPHEMERAL
        }
    });
}

// User-specific restriction
if (userId !== '391415444084490240') {
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: '❌ This feature is restricted.',
            flags: InteractionResponseFlags.EPHEMERAL
        }
    });
}
```

#### **3. Try-Catch Block (MANDATORY)** ⚠️
```javascript
try {
    // ALL handler logic goes here
} catch (error) {
    console.error(`Error in ${custom_id} handler:`, error);
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: '❌ An error occurred. Please try again.',
            flags: InteractionResponseFlags.EPHEMERAL
        }
    });
}
```

#### **4. Response Type Selection** 📤
```javascript
// For updating existing messages (e.g., menu navigation)
const responseType = InteractionResponseType.UPDATE_MESSAGE;

// For new messages
const responseType = InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;

// For modals
const responseType = InteractionResponseType.MODAL;

// For deferred responses (long operations)
await res.send({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
});
// Then use webhook endpoint for follow-up
```

### **COMPLETE BUTTON HANDLER TEMPLATE** 📋

```javascript
} else if (custom_id === 'your_button_id' || custom_id.startsWith('your_pattern_')) {
    try {
        // 1. MANDATORY CONTEXT EXTRACTION
        const guildId = req.body.guild_id;
        const userId = req.body.member?.user?.id || req.body.user?.id;
        const member = req.body.member;
        const channelId = req.body.channel_id;
        const messageId = req.body.message?.id;
        
        // 2. SECURITY CHECK (if needed)
        if (!member?.permissions || !(BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ You need Manage Roles permission.',
                    flags: InteractionResponseFlags.EPHEMERAL
                }
            });
        }
        
        // 3. PARSE CUSTOM_ID (if it contains data)
        // Example: "safari_add_action_buttonId_actionType"
        const parts = custom_id.split('_');
        const buttonId = parts[3];
        const actionType = parts[4];
        
        // 4. YOUR HANDLER LOGIC
        console.log(`🔍 DEBUG: Processing ${custom_id} for user ${userId}`);
        
        // 5. IMPORT MODULES (if needed)
        const { someFunction } = await import('./someModule.js');
        
        // 6. PERFORM OPERATIONS
        const result = await someFunction(guildId, userId);
        
        // 7. SEND RESPONSE
        return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                content: 'Success!',
                components: [...],
                flags: (1 << 15) // IS_COMPONENTS_V2 if using Components V2
            }
        });
        
    } catch (error) {
        console.error(`Error in ${custom_id} handler:`, error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ An error occurred. Please try again.',
                flags: InteractionResponseFlags.EPHEMERAL
            }
        });
    }
}
```

### **COMMON MISTAKES TO AVOID** ❌

1. **Missing variable definitions**
   ```javascript
   // ❌ WRONG - guildId not defined
   const buttons = await listButtons(guildId);
   
   // ✅ CORRECT - Extract from req.body first
   const guildId = req.body.guild_id;
   const buttons = await listButtons(guildId);
   ```

2. **Inconsistent permission checks**
   ```javascript
   // ❌ WRONG - Direct comparison without BigInt
   if (member.permissions & PermissionFlagsBits.ManageRoles)
   
   // ✅ CORRECT - Use BigInt conversion
   if (BigInt(member.permissions) & PermissionFlagsBits.ManageRoles)
   ```

3. **Using client without checking**
   ```javascript
   // ❌ WRONG - client might be undefined
   const guild = client.guilds.cache.get(guildId);
   
   // ✅ CORRECT - Use optional chaining
   const guild = client?.guilds?.cache?.get(guildId);
   ```

4. **Missing error handling**
   ```javascript
   // ❌ WRONG - No try-catch
   const data = await loadData();
   
   // ✅ CORRECT - Always wrap in try-catch
   try {
       const data = await loadData();
   } catch (error) {
       console.error('Error:', error);
       // Handle error appropriately
   }
   ```

### **BUTTON HANDLER REGISTRY UPDATE** 📝

**ALWAYS update BUTTON_HANDLER_REGISTRY.md when adding new handlers:**

```markdown
| Custom ID | Label | Location | Handler Function | Status |
|-----------|-------|----------|------------------|--------|
| `your_button_id` | Button Label | app.js:~5000 | Direct handler | ✅ Active |
```

### **VALIDATION CHECKLIST** ✔️

Before committing ANY button handler:
- [ ] All variables extracted from `req.body` at handler start
- [ ] `guildId`, `userId`, `member`, `channelId` defined before use
- [ ] Permission checks use BigInt conversion if needed
- [ ] Entire handler wrapped in try-catch block
- [ ] Error messages are user-friendly with ephemeral flag
- [ ] Debug logging added for troubleshooting
- [ ] BUTTON_HANDLER_REGISTRY.md updated
- [ ] Response type appropriate for the interaction
- [ ] No undefined variables or missing imports

### **TESTING REQUIREMENTS** 🧪

1. Test with missing permissions
2. Test with invalid input data
3. Test error scenarios (network failures, missing data)
4. Verify all variables are defined before use
5. Check console for any undefined errors

**⚠️ IF YOU DO NOT FOLLOW THIS TEMPLATE, YOUR IMPLEMENTATION WILL FAIL ⚠️**

### **BUTTON HANDLER UTILITIES MODULE** 🛠️

**NEW: Use `buttonHandlerUtils.js` for consistent implementations:**

```javascript
import { 
    extractButtonContext, 
    hasPermission, 
    sendErrorResponse,
    sendPermissionDenied,
    createButtonHandler 
} from './buttonHandlerUtils.js';
import { PermissionFlagsBits } from 'discord.js';

// Example using the utility module
} else if (custom_id === 'my_new_button') {
    const handler = createButtonHandler('my_new_button', async (context, req, res, client) => {
        const { guildId, userId, member } = context;
        
        // Permission check
        if (!hasPermission(member, PermissionFlagsBits.ManageRoles)) {
            return sendPermissionDenied(res, 'manage roles');
        }
        
        // Your logic here
        const result = await doSomething(guildId, userId);
        
        return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: {
                content: 'Success!',
                components: []
            }
        });
    });
    
    return handler(req, res, client);
}
```

**Benefits of using buttonHandlerUtils.js:**
- ✅ Automatic context extraction - no missing variables
- ✅ Standardized error handling
- ✅ Consistent permission checks
- ✅ Reduced boilerplate code
- ✅ Prevention of common mistakes

### **🚨 CRITICAL: DYNAMIC HANDLER PATTERN EXCLUSIONS** ⚠️

**When implementing dynamic pattern handlers (like Safari buttons), you MUST maintain proper exclusion patterns to prevent interference with specific button handlers.**

#### **Dynamic Handler Example:**
```javascript
// Dynamic Safari button handler - handles user-generated buttons
if (custom_id.startsWith('safari_') && custom_id.split('_').length >= 4 && 
    !custom_id.startsWith('safari_add_action_') && 
    !custom_id.startsWith('safari_finish_button_') &&
    !custom_id.startsWith('safari_currency_') &&
    !custom_id.startsWith('safari_button_') &&          // ✅ CRITICAL EXCLUSION
    custom_id !== 'safari_post_select_button') {
    // Dynamic button execution logic
}
```

#### **MANDATORY STEPS when adding new button patterns:**

1. **Identify Dynamic Handlers**: Find any existing dynamic handlers that use `startsWith()` patterns
2. **Add Exclusion Pattern**: Add `!custom_id.startsWith('your_new_pattern_')` to prevent interference
3. **Update BUTTON_HANDLER_REGISTRY.md**: Document the new pattern and its exclusion requirements
4. **Test Thoroughly**: Verify both dynamic and specific handlers work correctly

#### **Common Dynamic Handler Interference Issues:**

**❌ WRONG - Missing Exclusion:**
```javascript
// This will intercept safari_button_manage_existing before it reaches its specific handler
if (custom_id.startsWith('safari_') && custom_id.split('_').length >= 4) {
    // Dynamic handler logic - WILL BREAK specific safari_button_ handlers
}
```

**✅ CORRECT - Proper Exclusion:**
```javascript
// This properly excludes safari_button_ patterns from dynamic handling
if (custom_id.startsWith('safari_') && custom_id.split('_').length >= 4 && 
    !custom_id.startsWith('safari_button_')) {
    // Dynamic handler logic - specific safari_button_ handlers work correctly
}
```

#### **Pattern Maintenance Checklist:**

When adding ANY new button pattern that shares a prefix with existing dynamic handlers:
- [ ] Identify all dynamic handlers that might interfere
- [ ] Add exclusion patterns to prevent interference  
- [ ] Test that both dynamic and specific handlers work
- [ ] Update BUTTON_HANDLER_REGISTRY.md with exclusion notes
- [ ] Document the pattern relationship in comments

#### **Safari System Specific Patterns:**

**Dynamic Safari Buttons**: `safari_{guildId}_{buttonId}_{timestamp}`
- **Purpose**: User-generated interactive buttons posted to channels
- **Exclusions Required**: All other `safari_` prefixed management functions

**Management Button Patterns**: `safari_button_*`, `safari_add_action_*`, etc.
- **Purpose**: Admin interface for button management
- **Requirements**: Must be excluded from dynamic handler to function

#### **Pattern Debugging:**

If a button shows "❌ Button not found" instead of expected functionality:
1. Check if a dynamic handler is intercepting the custom_id
2. Verify exclusion patterns in the dynamic handler
3. Add the missing exclusion pattern
4. Test both dynamic and specific functionality

**⚠️ FAILURE TO MAINTAIN EXCLUSION PATTERNS WILL RESULT IN BROKEN BUTTON HANDLERS**