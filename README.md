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

- /set_tribe: Add or update a tribe in the castlist
- /castlist: Display the dynamic castlist
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