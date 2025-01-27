# Castbot

Castbot is a Discord bot designed to manage the Casting process in Online Reality Games (ORGs). This README provides an overview of the setup, usage, and available commands.

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- Git

### Installation

Terminal commands: Uses powershell.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/castbot.git
   cd castbot/castbot
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and add your environment variables:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   PUBLIC_KEY=your_discord_public_key
   APP_ID=your_discord_app_id
   GUILD_ID=your_discord_guild_id
   PORT=3000
   ```

### Running the Bot

To start the bot, run the following command:
```bash
npm start
```

Alternatively, you can use the provided PowerShell script to start the bot and commit any changes to Git:
```powershell
.\start-and-push.ps1
```

### Registering Slash Commands

To register the global and guild-specific slash commands, run the following PowerShell script:
```powershell
.\registerslashcommands.ps1
```

## Usage

### Available Commands

The following commands are available in Castbot:

- **/castlist**: Display the dynamic castlist.
- **/setage**: Set the age for a specific user.
- **/settribe1**: Set up the 1st tribe in your dynamic castlist.
- **/settribe2**: Set up the 2nd tribe in your dynamic castlist.
- **/settribe3**: Set up the 3rd tribe in your dynamic castlist.
- **/settribe4**: Set up the 4th tribe in your dynamic castlist.
- **/cleartribe1**: Clear tribe1, remove associated players and emojis.
- **/cleartribe2**: Clear tribe2, remove associated players and emojis.
- **/cleartribe3**: Clear tribe3, remove associated players and emojis.
- **/cleartribe4**: Clear tribe4, remove associated players and emojis.
- **/cleartribeall**: Clear all tribes and remove associated players and emojis.
- **/clearemoji**: Clear saved emojis and delete them from the guild.
- **/checkdata**: Check stored player data.
- **/playericons**: Create player icons from avatars.
- **/util_deleteserveremoji**: Delete an emoji from the server by its ID.
- **/util_deleteplayeremoji**: Delete a player's emoji and their entry from playerData.json.
- **/zzgetallguildroles**: Get all role IDs in the guild.
- **/zzgetroles**: Reece seeing if he can do stuff.
- **/zzchallenge**: Challenge to a match of rock paper scissors.

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