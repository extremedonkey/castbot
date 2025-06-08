# CastBot - Dynamic Castlist for Online Reality Games

CastBot is a Discord bot designed to manage the casting process in Online Reality Games (ORGs) with a focus on providing dynamic, up-to-date information about players and tribes. This README provides an in-depth overview of the setup, architecture, and available commands.

## Table of Contents
- [Purpose and Overview](#purpose-and-overview)
- [Setup](#setup)
- [Environments](#environments)
* [[#Security, Access and Data Management]]
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

1. **Dynamic Castlists**: Displays real-time information about which players are on each tribe
2. **Player Information**: Shows each player's age, pronouns, timezone, and current local time
3. **Custom Emojis**: Automatically creates custom emojis for each player using their Discord avatar
4. **Multiple Castlists**: Supports multiple castlists for different phases of the game (e.g., pre-merge, post-merge)
5. **Role Management**: Uses Discord's role system to track player information and tribe membership

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

To register the global and guild-specific slash commands, run the following PowerShell script:
```powershell
.\registerslashcommands.ps1
```

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
The bot interacts with Discord using roles to track player information. Discord roles serve dual purposes: permissions/access control and data storage for player metadata like timezones and pronouns. This approach leverages Discord's native interface for role assignment.

## Command Deployment and Management

### Development Mode (`PRODUCTION=FALSE`)
1. Clean existing commands if needed:
```bash
node fix_commands.js
```

2. Deploy commands to test server:
```bash
npm run registerguild
```

### Production Mode (`PRODUCTION=TRUE`)
1. Clean existing commands:
```bash
node fix_commands.js
```

2. Deploy global commands:
```bash
npm run deploy
```

Note: Global commands can take up to an hour to propagate across Discord.

### Troubleshooting Commands

If you see duplicate commands or commands with incorrect permissions:

1. Set your environment properly in `.env`:
```env
PRODUCTION=TRUE  # or FALSE for development
```

2. Run the cleanup script:
```bash
node fix_commands.js
```

3. Redeploy your commands:
```bash
npm run deploy  # for production
# or
npm run registerguild  # for development
```

## Usage

### Available Commands

- /set_tribe: Add or update a tribe in the castlist
- /castlist: Display the dynamic castlist
- /castlist2: Display the dynamic castlist using Discord Components V2 with player cards and modern UI
- /clear_tribe: Clear a specific tribe
- /cleartribeall: Clear all tribes
- /set_players_age: Set ages for multiple players at once
- /pronouns_add: Add pronoun roles
- /pronouns_remove: Remove pronoun roles

### How It Works

- Automatically creates and updates tribal sections in the castlist
- Retrieves pronouns/timezones/ages from roles or slash commands
- Dynamically fetches data from Discord each time /castlist is used

### Example Usage

To set the age for a user, use the `/setage` command:
```bash
/setage userid:123456789012345678 age:25
```

To display the dynamic castlist, use the `/castlist` command:
```bash
/castlist
```

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Further Info to be synthesized - Production Deployment
RUNSHEET - AWS LIGHTSAIL DEPLOYMENT
1. FileZilla - Ensure last backup has been put into its own folder
2. Backup files to /bu
3. Check .env between Prod and Dev - ensure key is correct, PRODUCTION=TRUE and check the DEV_GUILD_ID (should generally be where most active dev is taking place)
4. Copy new files across BE CAREFUL NOT TO DO .ENV OR PLAYERDATA

pm2 stop castbot-pm

Run migration WINDOWS ONLY OOPS - 
./migrate_to_multi_castlist_prod.ps1 playerDataProd.json

https://jsonformatter.org/

Update slash commands
node fix_commands.js
npm run deploy

Restart bot
pm2 restart castbot


Check .env

Prod Deployment

npm install
npm list --depth=0


npm run deploy

pm2 restart castbot-pm



pm2 start app.js --name castbot-pm
pm2 restart castbot-pm
pm2 stop castbot-pm
pm2 logs castbot-pm
pm2 list
sudo ls /opt/bitnami/apache/conf/bitnami/certs/
sudo /opt/bitnami/bncert-tool
sudo /opt/bitnami/ctlscript.sh restart apache
nslookup castbotaws.reecewagner.com
sudo /opt/bitnami/ctlscript.sh restart apache
