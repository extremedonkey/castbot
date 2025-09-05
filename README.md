# CastBot - Dynamic Castlist for Online Reality Games

CastBot is a Discord bot designed to manage the casting process in Online Reality Games (ORGs) with a focus on providing dynamic, up-to-date information about players and tribes. This README provides an in-depth overview of the setup, architecture, and available commands.

## Table of Contents
- [Purpose and Overview](#purpose-and-overview)
- [Setup](#setup)
- [Development Workflow](#development-workflow)
- [Deployment Reference](#deployment-reference)
- [Environments](#environments)
- [Security, Access and Data Management](#security-access-and-data-management)
- [Data Structures](#data-structures)
- [Commands](#commands)
- [Interacting with Discord](#interacting-with-discord)
- [Development Guidelines](#development-guidelines)
- [Troubleshooting](#troubleshooting)

## Purpose and Overview

CastBot is a Discord bot for Online Reality Games (ORGs) that are typically based on reality TV shows like Survivor or Big Brother. ORGs involve real players who participate in these games through Discord servers, competing in challenges and voting each other out.

As these games involve casting real-world players who are interested in playing these games themselves, the purpose of the bot is to provide an array of features to aid the hosts (typically also the server or 'guild' admins) and players in managing and viewing information about these players.

Players are typically divided into tribes, and can only communicate with their own tribe using channels in Discord. They will compete against other tribes in online challenges / minigames, and the winning tribe is typically safe from the vote. The losing tribe will typically then go into a process called tribal council, where players of the game will have a day to converse and choose who they want to vote out. The initial / primary feature is the ability to show a castlist of which players are on each tribe, and the individual details of those players.


### Core Functionality

The bot provides several essential features for ORG hosts and players:

1. **Dynamic Castlists**: Modern Components V2 interface with player cards, inline thumbnails, and real-time information
2. **Player Information**: Shows each player's age, pronouns, timezone, and current local time
3. **Custom Emojis**: Automatically creates custom emojis for each player using their Discord avatar
4. **Multiple Castlists**: Supports multiple castlists for different phases of the game (e.g., pre-merge, post-merge)
5. **Role Management**: Uses Discord's role system to track player information and tribe membership
6. **Live Analytics**: Real-time Discord logging of user interactions with formatted analytics data
7. **User Management**: Enhanced player management interface with persistent display and modular architecture
8. **Analytics Logging**: Comprehensive interaction tracking with file-based logging and optional Discord posting

### Use Cases

- **For Hosts**: Simplifies player management, tribe assignment, and information tracking
- **For Players**: Provides easy access to information about other players, including time zones
- **For Production Teams**: Assists in challenge preparation and player communication

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- A Discord bot token
- Appropriate Discord permissions for the bot

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/castbot.git
   cd castbot/castbot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   PUBLIC_KEY=your_discord_public_key
   APP_ID=your_discord_app_id
   DEV_GUILD_ID=your_development_server_id
   PORT=3000
   PRODUCTION=FALSE  # Set to TRUE for production deployment
   ```

4. Start the bot:
   ```bash
   npm start
   ```

### Command Registration

CastBot uses Discord's slash command system. To register commands:

To register slash commands with Discord:
```bash
npm run deploy-commands
```

## Development Workflow

### Git Strategy (Clean & Simple)

**Single Branch Approach:**
- `main` branch = single source of truth
- Work directly on `main` for most changes  
- Production deploys from `main` branch only

**Development → Production Flow:**
1. **Local Development**: Make changes on `main` branch
2. **Push to GitHub**: `.\start-and-push.ps1` (pushes to GitHub main)
3. **Deploy to Production**: `npm run deploy-remote` (pulls from GitHub main)

### Daily Development Commands

**Local Development:**
```bash
npm start                    # Start bot locally
npm run dev                  # Start with auto-restart
.\start-dev.ps1             # Complete dev environment startup
```

**Command Updates:**
```bash
npm run deploy-commands      # Deploy commands (auto-detects dev/prod)
npm run verify-commands      # Check current command status
```

**Git Workflow:**
```powershell
.\start-and-push.ps1         # Add, commit, and push to GitHub
.\start-and-push.ps1 "Custom commit message"  # With custom message
```

## Deployment Reference

### 🔒 Safe Commands (Ready to Use)

**Local Development:**
```bash
npm run deploy-commands        # Deploy commands (auto-detects dev/prod)
npm run analyze-commands       # Preview command changes (SAFE)
npm run verify-commands        # Check current command status
npm run clean-commands         # Clean up command issues
```

**Remote Access:**
```bash
ssh castbot-lightsail          # Connect to production server
npm run deploy-remote-dry-run  # Preview what deployment would do (SAFE)
```

### ⚠️ Production Commands (Use with Caution)

**Remote Deployment:**
```bash
npm run deploy-remote              # Full deployment (code + commands)
npm run deploy-commands-remote     # Commands only (faster)
npm run logs-remote                # View production logs
npm run status-remote              # Check production status
```

### 🎯 Recommended Deployment Workflow

**For Command Changes:**
1. `npm run analyze-commands` - Preview changes
2. `npm run deploy-commands` - Test in development
3. `npm run deploy-remote-dry-run` - Preview production changes
4. `npm run deploy-commands-remote` - Deploy to production

**For Code Changes:**
1. Commit and push changes: `.\start-and-push.ps1`
2. `npm run deploy-remote-dry-run` - Preview full deployment
3. `npm run deploy-remote` - Deploy to production

**For Troubleshooting:**
1. `ssh castbot-lightsail` - Direct server access
2. `npm run status-remote` - Check server status
3. `npm run logs-remote` - View recent logs

### 📍 Server Information
- **Host**: 13.238.148.170
- **User**: bitnami
- **Path**: /opt/bitnami/projects/castbot
- **SSH Alias**: castbot-lightsail

### 🚨 Deployment Safety Features
- **Automatic backups** created before each deployment
- **Merge preview** shows exactly what changes will be applied
- **File size validation** warns if core files shrink dramatically
- **Dry-run mode** lets you preview all changes safely
- **SSH connection testing** ensures connectivity before deployment

### 📚 Key Deployment Lessons
- **Always run dry-run first** - `npm run deploy-remote-dry-run` shows exactly what will change
- **Watch file sizes** - If core files (like app.js) get dramatically smaller, STOP and investigate
- **Verify commit dates** - Ensure you're deploying recent code, not old code
- **Use safety backups** - Production backup branches save the day when things go wrong
- **GitHub = Single Source of Truth** - All deployments pull from GitHub main branch

## 🚀 Development Infrastructure Status

### ✅ WSL Development Environment (Current) 

**Stable Development Setup:**
- ✅ WSL (Windows Subsystem for Linux) with Claude Code integration
- ✅ Static ngrok domain - no more webhook URL updates required
- ✅ Automated git safety net with commit/push functionality
- ✅ PM2 process management matching production architecture
- ✅ Three-command workflow: `./scripts/dev/dev-start.sh`, `./scripts/dev/dev-restart.sh`, `./scripts/dev/dev-stop.sh`

**WSL Development Benefits:**
- **Stable URLs**: Static ngrok domain preserves webhook configuration
- **Production Parity**: PM2 process management identical to production  
- **Git Safety**: Automatic commit/push prevents losing work
- **Claude Integration**: Direct app restart capability for immediate testing
- **Resource Efficient**: No additional cloud costs or server management

### Previous: AWS Infrastructure Migration Plan

**Target Development Setup:**
- ❌ AWS Lightsail development server (deferred for cost efficiency)
- ❌ Additional cloud infrastructure overhead
- ❌ More complex deployment pipeline

#### Phase 1: AWS Infrastructure Setup
1. **Create Development Lightsail Instance**
   - Size: Same as production (or smaller for cost savings)
   - Region: Same as production for consistency
   - SSH key: Generate new dev-specific key or reuse existing

2. **Domain/DNS Setup**
   - Option A: Subdomain of existing domain (`dev.castbot.yoursite.com`)
   - Option B: Separate domain for dev (`castbot-dev.com`)
   - Configure SSL certificate (Let's Encrypt)

3. **Discord Application Setup**
   - Update CastBot-Dev webhook URL to permanent dev server URL
   - No more ngrok URL updates required

#### Phase 2: Development Server Configuration
1. **Server Setup** (Similar to production)
   ```bash
   # Install Node.js, npm, pm2, git
   # Clone repository to /opt/bitnami/projects/castbot-dev
   # Set up environment variables for development
   ```

2. **Development-Specific Scripts**
   - Modify `deploy-remote.js` for dev server deployment
   - Create `npm run deploy-dev` command
   - Set up separate SSH alias: `castbot-dev-lightsail`

3. **Environment Variables**
   ```
   DISCORD_TOKEN=your_bot_token
   APP_ID=1328366050848411658  # CastBot-Dev
   PRODUCTION=FALSE
   PORT=3000
   # DEV_GUILD_ID no longer needed - removed dev_ prefix system
   ```

#### Phase 3: Workflow Transition
1. **New Development Workflow**
   ```bash
   # Local changes
   git add . && git commit -m "feature changes"
   git push origin main
   
   # Deploy to dev server
   npm run deploy-dev-dry-run  # Preview changes
   npm run deploy-dev          # Deploy to dev
   
   # Test in dev Discord, then deploy to prod
   npm run deploy-remote-dry-run
   npm run deploy-remote
   ```

2. **Scripts to Create**
   - `npm run deploy-dev` - Deploy to development Lightsail
   - `npm run logs-dev` - View dev server logs
   - `npm run status-dev` - Check dev server status
   - `npm run ssh-dev` - Connect to dev server

#### Phase 4: Migration Benefits
1. **Consistency**
   - Same deployment pipeline for dev and prod
   - Identical server environments
   - No more local environment differences

2. **Reliability**
   - Persistent dev URLs (no more ngrok restarts)
   - Always-available development environment
   - Proper SSL certificates

3. **Team Development** (Future)
   - Multiple developers can access same dev environment
   - Shared development state
   - Consistent testing environment

#### Phase 5: Cost Optimization
1. **Development Server Sizing**
   - Start with smallest Lightsail instance
   - Scale up if needed for performance testing
   - Auto-shutdown during non-development hours (optional)

2. **Shared Resources**
   - Consider if dev and prod can share database/storage
   - Separate Discord guilds for testing
   - Isolated player data for development

### Implementation Timeline
- **Week 1**: AWS setup, domain configuration, server provisioning
- **Week 2**: Server configuration, script adaptation, testing
- **Week 3**: Workflow transition, documentation updates
- **Week 4**: Optimization, monitoring setup, ngrok decommission

### Rollback Plan
- Keep ngrok setup functional until dev Lightsail is fully proven
- Maintain `start-and-push.ps1` as backup during transition
- Document quick revert process if needed

### Success Criteria
- ✅ Development commands work consistently on dev server
- ✅ Deployment pipeline matches production
- ✅ No more ngrok URL management required
- ✅ Development environment always accessible
- ✅ Same infrastructure patterns as production

## Environments

CastBot operates in two distinct environments: Development and Production. Each environment has its own configuration, setup, hosting and application deployment.

The `.env` file controls environment-specific settings. In development, a `.env-prod.ini` file is maintained and renamed to `.env` when deploying to production.
### Dev

DEV is registered as a separate Discord Application (CastBot-Dev) with application ID `1328366050848411658`. Dev is hosted using a free online service called ngrok which is a service that is ran locally from a VS Code PowerShell Terminal, and forwards online traffic from Discord's Interactions API endpoint to the service running on the local machine (localhost / 127.0.0.1 via port 3000). 

```https://1fd1-2403-580f-5cc9-0-440e-d63b-6cbd-c45f.ngrok-free.app -> http://localhost:3000```

The app service is also launched in dev using ./start-and-push.ps1 and ngrok running allows me to test commands I'm developing directly from a server where discord is installed. The Interaction Endpoint for Dev has to be updated regularly, as I only run ngrok when I have my computer switched on and are actively developing, and it receives a new address each time.

![[Pasted image 20250301131604.png]]


### Production
PRODUCTION is hosted on an AWS Lightsail instance using a bitnami image. This runs 24/7 and is in use by players live. The production endpoint is always [https://castbotaws.reecewagner.com/interactions](vscode-file://vscode-app/c:/Users/extre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-sandbox/workbench/workbench.html).

An equivalent of ngrok is not required in Prod, as Let's Encrypt provides a reverse proxy plus certificate to ensure the required HTTP / TLS connection required by the discord interactions API. DigitalOcean provides the DNS hosting for the domain name reecewagner.com, with the subdomain castbot.reecewagner.com pointing to the AWS Lightsail instance static IP of `13.238.148.170`. The instance is running on a machine with 512 MB RAM, 2 vCPUs, 20 GB SSD in AWS zone ap-southeast-2a.

The production architecture is summarised below.
![[Pasted image 20250301125028.png]]

## Data Structures

### PlayerData.json Structure

The bot stores all guild-specific data in a nested JSON structure:

1. **Server Level (Guild ID)**
   - Each Discord server has its own top-level node
   - Example: `"1297188286191767603"`

2. **Server Components**
   - **Players**: Keyed by Discord User ID
     - `age`: string
     - `emojiCode`: string (custom emoji for castlist)
   - **Tribes**: Keyed by tribe name or Discord Role ID
     - `emoji`: (optional) Emoji displayed in castlist
     - `castlist`: (optional) Name of the castlist this tribe belongs to
   - **Timezones**: Keyed by timezone name
     - `roleId`: Discord Role ID
     - `offset`: number (UTC offset)

### Real-time Data
The following data is calculated in real-time and not stored:
- Player tribe membership (from Discord roles)
- Player timezone (from Discord roles)  
- Player pronouns (from Discord roles)
- Current time in player's timezone

### Example Structure
```json
{
  "1297188286191767603": {
    "players": {
      "208197633846542336": {
        "age": "21",
        "emojiCode": "<:208197633846542336:1322728046964375572>"
      }
    },
    "tribes": {
      "tribe1": "1324815211009671170",
      "tribe1emoji": "🦞"
    },
    "timezones": {
      "EST": {
        "roleId": "1320094346288300124",
        "offset": -5
      }
    }
  }
}
```

## Security, Access and Data Management

### Permission System

CastBot implements a comprehensive two-tier permission system that provides different interfaces based on user privileges:

**🔐 Admin Users (Manage Roles Permission)**
- Access to Production Menu with full admin controls
- Tribe management (add/remove tribes, manage members)
- Player management (set ages, pronouns, timezones for any player)
- Store creation and item management (Safari system)
- Currency management and analytics access
- Server configuration and role management

**👤 Regular Users (No Special Permissions)**
- Access to Player Menu for self-service features
- Can set their own age, pronouns, and timezone
- View castlists and player inventories
- Interact with custom buttons and store systems
- Participate in Safari games and activities

### Data Management Approach

The bot uses a hybrid approach for data storage and management:

**Discord Roles as Data Storage:**
- Pronouns and timezone information stored as Discord roles
- Tribe membership tracked through Discord role assignment
- Vanity roles for additional player display customization
- Leverages Discord's native interface for role management

**JSON-Based Storage (`playerData.json`):**
- Player ages and metadata not suitable for roles
- Safari system data (currency, inventory, buttons)
- Store and item configurations
- Analytics configuration and environment settings

**Security Features:**
- Permission validation on all admin operations using Discord's permission bitfields
- User ID restrictions for sensitive analytics features
- Environment-specific configurations (development vs production)
- Rate limiting and error handling to prevent abuse

This approach provides a secure, scalable foundation that leverages Discord's built-in permission system while extending functionality through custom data management.

## Command Deployment and Management

### Unified Deployment Script

CastBot now uses a single, intelligent deployment script that automatically detects your environment and deploys commands appropriately.

**Primary Commands:**
```bash
npm run deploy-commands    # Auto-detects dev/prod, deploys all commands
npm run clean-commands     # Clean up duplicate/broken commands
npm run verify-commands    # Verify current command registration status
```

**Behavior by Environment:**

**Command Deployment:**
- Commands are deployed globally to all servers
- May take up to 1 hour to propagate
- Only two commands: `/menu` and `/castlist`
- All features accessible through the `/menu` interface

### Remote Production Deployment

**SSH Access:**
```bash
ssh castbot-lightsail              # Direct connection to production server
```

**Safe Preview:**
```bash
npm run deploy-remote-dry-run      # Preview deployment actions (SAFE - no changes made)
```

**Deployment Commands (USE WITH CAUTION):**
```bash
npm run deploy-remote              # Full deployment (code + commands)
npm run deploy-commands-remote     # Commands only (faster)
npm run logs-remote                # Monitor remote logs
npm run status-remote              # Check remote status
```

**Important Notes:**
- Always run `npm run deploy-remote-dry-run` first to preview changes
- SSH alias `castbot-lightsail` is configured for easy access
- Remote server path: `/opt/bitnami/projects/castbot`
- Manual SSH access is always available as backup

### Troubleshooting Commands

If you encounter command registration issues:

1. Verify your environment in `.env`:
```env
PRODUCTION=FALSE  # for development
PRODUCTION=TRUE   # for production
```

2. Clean and redeploy:
```bash
npm run clean-commands    # Remove duplicates/conflicts
npm run deploy-commands   # Deploy fresh commands
```

3. Verify registration:
```bash
npm run verify-commands   # Check current status
```

**Note:** Global commands may take up to 1 hour to propagate across Discord servers.

## Usage

### ✅ Recent Major Updates: Unified Menu System & Player Management

**Menu System Consolidation (2025-01-15):**
- **Unified `/menu` Command**: Automatically shows Player Menu for regular users, Production Menu for admins
- **Deprecated Functions Removed**: Old `createCastBotMenu` function completely removed (~80 lines of legacy code)
- **Enhanced Player Menu**: Modern Components V2 interface with "📋 Castlist" button that opens default castlist
- **Admin Player Management**: Retains "⬅️ Menu" button for navigation back to Production Menu
- **Code Reuse**: Single shared implementation for player functionality across different access points

**Button Navigation Updates:**
- **Player Menu Button**: Changed from "📋 Menu" to "📋 Castlist" with `show_castlist2_default` custom_id
- **Production Menu Button**: Remains "⬅️ Menu" with `prod_menu_back` custom_id for admin users
- **Consistent UX**: Clear separation between user and admin functionality while maintaining intuitive navigation

### Available Commands

- `/menu`: Display interactive menu - shows Player Menu for regular users, Production Menu for admins
- `/castlist`: Display the dynamic castlist using modern Components V2 with player cards and thumbnails
- ~~`/set_players_age`: Set ages for multiple players at once (admin only)~~ **REMOVED** - Use `/menu` → Manage Players instead

### Live Analytics System

**Real-time Discord Logging**
CastBot includes a comprehensive live analytics system that posts formatted interaction logs to a Discord channel in real-time:

- **Formatted Logs**: Uses same styling as Live Analytics button with Markdown bullets and bold formatting
- **User Exclusion**: Configure excluded users to filter out admin/test interactions
- **Rate Limiting**: Built-in message queuing to respect Discord API limits (1.2 second intervals)
- **Non-blocking**: Error handling ensures main bot functionality is never interrupted
- **Environment Aware**: Separate configuration for development and production environments

**Management Commands**
```bash
# Toggle live logging on/off
node toggle-live-logging.js on|off

# Manage user exclusions (toggle users in/out of exclusion list)
node toggle-live-logging.js exclude <userID>

# Check current configuration
node toggle-live-logging.js status
```

**Configuration**
Live logging settings are stored in `playerData.json` under `environmentConfig.liveDiscordLogging`:
- `enabled`: Boolean to enable/disable live logging
- `targetGuildId`: Discord server ID where logs are posted
- `targetChannelId`: Discord channel ID for log messages (e.g., #logs)
- `excludedUserIds`: Array of Discord user IDs to filter out
- `rateLimitQueue`: Internal queue for managing message posting
- `lastMessageTime`: Timestamp tracking for rate limiting

**Log Format Example**
```
* [9:06AM] Thu 19 Jun 25 | **ReeceBot (extremedonkey)** in **CastBot** (1331657596087566398) | **BUTTON_CLICK** | 🧑‍🤝‍🧑 Manage Players (admin_manage_player)
```

### Modern Menu Interface Features

**Player Menu (All Users):**
- Interactive player card display with Discord avatar thumbnails
- Personal profile management (pronouns, timezone, age)
- Hot-swappable select menus for real-time role configuration
- "📋 Castlist" button for easy access to default server castlist

**Production Menu (Admin Only):**
- Complete server management interface
- Tribe management (add/clear tribes)
- Pronoun and timezone role management  
- Application button creation for player recruitment
- Player management with vanity role support
- "⬅️ Menu" navigation for admin workflow

**Technical Improvements:**
- Discord Components V2 architecture for modern UI (see [ComponentsV2.md](docs/features/ComponentsV2.md) for complete API reference)
- Centralized error handling across all command systems
- Performance optimizations with 70-80% faster navigation
- Mobile-friendly interface design

### How It Works

- Automatically creates and updates tribal sections in the castlist
- Retrieves pronouns/timezones/ages from roles or slash commands
- Dynamically fetches data from Discord each time /castlist is used

To display the dynamic castlist, use the `/castlist` command:
```bash
/castlist
```

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Further Info
1. FileZilla - User has SFTP access to amazon lightsail if needed