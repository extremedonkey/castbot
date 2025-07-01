import 'dotenv/config';
import fetch from 'node-fetch';

export async function DiscordRequest(endpoint, options) {
  const url = `https://discord.com/api/v10/${endpoint}`;
  if (options.body) {
    options.body = typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    ...options,
  });

  // For DELETE requests, return early since they don't return content
  if (options.method === 'DELETE') {
    return { success: res.ok };
  }

  // Handle non-ok responses
  if (!res.ok) {
    const error = await res.text();
    
    // Graceful handling for webhook errors (Discord interaction token expiry/invalid)
    if (error.includes('Unknown Webhook') || 
        error.includes('Invalid Webhook Token') ||
        error.includes('"code": 10015') || 
        error.includes('"code": 50027')) {
      console.log(`⏰ DEBUG: Webhook interaction failed (${endpoint}) - likely expired or invalid token`);
      return null; // Return null instead of throwing error
    }
    
    throw new Error(error);
  }
  
  // Handle empty responses
  const text = await res.text();
  if (!text) {
    return null;
  }

  // Parse JSON response
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Failed to parse response:', text);
    throw new Error('Invalid JSON response from Discord API');
  }
}

export async function InstallGlobalCommands(appId, commands, guildId) {
  // API endpoint to overwrite global commands
  const endpoint = guildId 
    ? `applications/${appId}/guilds/${guildId}/commands` 
    : `applications/${appId}/commands`;

  try {
    // If in production mode, first fetch existing commands to remove any dev_ commands
    if (process.env.PRODUCTION === 'TRUE') {
      const existingCommands = await DiscordRequest(endpoint, { method: 'GET' });
      if (!existingCommands) return; // No commands to process
      
      // Find any dev_ commands that need to be deleted
      const devCommands = existingCommands.filter(cmd => cmd.name.startsWith('dev_'));
      
      // Delete each dev command
      for (const cmd of devCommands) {
        console.log(`Removing dev command in production mode: ${cmd.name}`);
        await DiscordRequest(`${endpoint}/${cmd.id}`, { method: 'DELETE' });
      }
    }

    // Install the new command set
    const response = await DiscordRequest(endpoint, {
      method: 'PUT',
      body: commands,
    });

    console.log('Successfully installed commands:', response);
    return response;
  } catch (err) {
    console.error('Error installing commands: ', err);
    throw err; // Re-throw to ensure error propagates
  }
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
