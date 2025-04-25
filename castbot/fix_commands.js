import 'dotenv/config';
import { DiscordRequest } from './utils.js';

async function getAllCommands(appId, guildId = null) {
  try {
    const endpoint = guildId 
      ? `applications/${appId}/guilds/${guildId}/commands`
      : `applications/${appId}/commands`;
    
    const res = await DiscordRequest(endpoint, { method: 'GET' });
    return res;
  } catch (error) {
    console.error('Error fetching commands:', error);
    return [];
  }
}

async function deleteCommand(appId, commandId, guildId = null) {
  try {
    const endpoint = guildId
      ? `applications/${appId}/guilds/${guildId}/commands/${commandId}`
      : `applications/${appId}/commands/${commandId}`;
    
    await DiscordRequest(endpoint, { method: 'DELETE' });
    return true;
  } catch (error) {
    console.error(`Error deleting command ${commandId}:`, error);
    return false;
  }
}

async function fixCommands() {
  const appId = process.env.APP_ID;
  const devGuildId = process.env.DEV_GUILD_ID;
  const isProduction = process.env.PRODUCTION === 'TRUE';
  
  console.log('Fetching all commands...');
  console.log('Production mode:', isProduction);
  console.log('Dev Guild ID:', devGuildId);
  
  // Get both global and guild commands
  const globalCommands = await getAllCommands(appId);
  const guildCommands = await getAllCommands(appId, devGuildId);
  
  console.log('\nGlobal commands found:', globalCommands.map(c => c.name));
  console.log('Guild commands found:', guildCommands.map(c => c.name));
  
  // In production mode, delete all dev_ prefixed commands from both global and guild
  if (isProduction) {
    console.log('\nProduction mode: Removing all dev_ commands...');
    
    // Remove dev_ commands from global commands
    for (const cmd of globalCommands) {
      if (cmd.name.startsWith('dev_')) {
        console.log(`Deleting global dev command: ${cmd.name} (${cmd.id})`);
        await deleteCommand(appId, cmd.id);
      }
    }
    
    // Remove all guild commands in production mode
    if (devGuildId) {
      console.log('\nProduction mode: Clearing all guild commands...');
      for (const cmd of guildCommands) {
        console.log(`Deleting guild command: ${cmd.name} (${cmd.id})`);
        await deleteCommand(appId, cmd.id, devGuildId);
      }
    }
  } else {
    // Development mode: Just handle duplicates
    // Find duplicates in global commands
    const globalNameCount = {};
    const globalDuplicates = [];
    
    globalCommands.forEach(cmd => {
      globalNameCount[cmd.name] = (globalNameCount[cmd.name] || 0) + 1;
      if (globalNameCount[cmd.name] > 1) {
        globalDuplicates.push(cmd);
      }
    });
    
    // Find duplicates in guild commands
    const guildNameCount = {};
    const guildDuplicates = [];
    
    guildCommands.forEach(cmd => {
      guildNameCount[cmd.name] = (guildNameCount[cmd.name] || 0) + 1;
      if (guildNameCount[cmd.name] > 1) {
        guildDuplicates.push(cmd);
      }
    });
    
    // Delete duplicate commands
    console.log('\nDeleting duplicate global commands...');
    for (const cmd of globalDuplicates) {
      console.log(`Deleting duplicate global command: ${cmd.name} (${cmd.id})`);
      await deleteCommand(appId, cmd.id);
    }
    
    console.log('\nDeleting duplicate guild commands...');
    for (const cmd of guildDuplicates) {
      console.log(`Deleting duplicate guild command: ${cmd.name} (${cmd.id})`);
      await deleteCommand(appId, cmd.id, devGuildId);
    }
  }
  
  console.log('\nCleanup complete! Run npm run deploy to reinstall commands.');
}

fixCommands();
