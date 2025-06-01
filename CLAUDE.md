# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## PROJECT STATUS: 100% OPTIMIZATION COMPLETE ✅

CastBot has undergone a major optimization initiative that has been fully completed. All core functionality has been refactored from inconsistent error handling patterns to a centralized, maintainable architecture.

## Development Commands

### Local Development
- `npm start` - Start the bot with app.js
- `npm run dev` - Start with nodemon for auto-restart during development
- `npm install` - Install dependencies

### Command Registration
- `npm run register` - Register global slash commands
- `npm run registerguild` - Register commands to dev guild only (faster for testing)
- `npm run deploy` - Deploy commands (alias for register)
- `node fix_commands.js` - Clean up duplicate/broken commands before redeployment

### Environment-Specific Scripts
- `.\registerslashcommands.ps1` - PowerShell script for command registration
- `.\start-and-push.ps1` - PowerShell script for dev environment startup

## Architecture Overview

### Core Components

**app.js** - Main application entry point using Express.js for Discord interactions webhook and Discord.js client for API operations. Handles slash command processing, dynamic castlist generation, and emoji management. ✅ FULLY OPTIMIZED with centralized error handling.

**storage.js** - JSON-based data persistence layer managing player data, tribes, timezones, and pronouns per Discord guild. Uses `playerData.json` for storage with automatic migration support.

**commands.js** - Slash command definitions with environment-aware naming (dev_ prefix in development). Includes permission validation using Discord's permission bitfields.

**utils.js** - Discord API wrapper functions for making authenticated requests and installing global/guild commands.

### Optimization Infrastructure (✅ ALL COMPLETE)

**errorHandler.js** - Centralized error handling and response management system. All 13 command handlers now use `executeWithErrorHandling` pattern.

**commandRegistry.js** - Command validation and utility functions for consistent command processing.

**config.js** - Centralized configuration management with environment detection.

**performanceMonitor.js** - Performance tracking utilities (ready for activation).

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

**Dynamic Castlists** - Real-time castlist generation that fetches current Discord roles and member data to display tribe assignments, ages, pronouns, and local times. Supports multiple named castlists (e.g., 'jury', 'merge') with automatic field calculation respecting Discord's 25-field limit.

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
```

### Development vs Production
- **Development**: Uses `dev_` command prefixes, ngrok tunneling, separate Discord app ID
- **Production**: Global commands, AWS Lightsail hosting, pm2 process management

### Production Deployment Process
1. Stop bot: `pm2 stop castbot-pm`
2. Clean commands: `node fix_commands.js`
3. Deploy commands: `npm run deploy`
4. Restart: `pm2 restart castbot-pm`
5. Monitor: `pm2 logs castbot-pm`

## Data Migration

The bot includes migration support for multi-castlist functionality. When updating production, run migration scripts as needed before restarting the service.

## Available Commands

### Admin Commands (Require Manage Roles/Channels/Server)
- `add_tribe` - Add tribes to castlists with automatic emoji creation
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

### Player Commands (No special permissions)
- `castlist` - Display dynamic castlist (supports named castlists)
- `player_set_age` - Individual player age assignment
- `player_set_pronouns` - Individual player pronoun assignment
- `player_set_timezone` - Individual player timezone assignment
- `getting_started` - Information command

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

## Production Readiness Status: ✅ READY
- All error handling patterns standardized and tested
- Zero syntax errors across all files
- Comprehensive error recovery mechanisms
- Environment-specific configuration handling
- Rate limiting and API best practices implemented