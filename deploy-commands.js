import 'dotenv/config';
import { DiscordRequest } from './utils.js';
import { ALL_COMMANDS } from './commands.js';

// Add sleep helper function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Add rate limit aware request function
async function rateLimitAwareRequest(endpoint, options, retries = 3) {
  try {
    const response = await DiscordRequest(endpoint, options);
    return response;
  } catch (error) {
    if (error?.message?.includes('rate limited') && retries > 0) {
      const retryAfter = error.message.includes('retry_after') 
        ? JSON.parse(error.message).retry_after * 1000 
        : 30000; // Default to 30 seconds if no retry_after
      
      console.log(`Rate limited. Waiting ${retryAfter/1000} seconds before retry...`);
      await sleep(retryAfter);
      return rateLimitAwareRequest(endpoint, options, retries - 1);
    }
    throw error;
  }
}

async function getExistingCommands(appId, guildId = null) {
  try {
    const endpoint = guildId 
      ? `applications/${appId}/guilds/${guildId}/commands`
      : `applications/${appId}/commands`;
    
    const res = await DiscordRequest(endpoint, { method: 'GET' });
    
    // Check if res is already parsed JSON
    if (typeof res === 'object') {
      return res;
    }
    
    // If it's a Response object, parse it
    if (res instanceof Response) {
      return await res.json();
    }

    // Fallback to empty array if we can't parse the response
    console.warn('Unexpected response format:', res);
    return [];
    
  } catch (error) {
    console.error('Error fetching existing commands:', error);
    return [];
  }
}

async function deployCommands() {
  const appId = process.env.APP_ID;
  const isDev = process.env.PRODUCTION !== 'TRUE';
  const devGuildId = process.env.DEV_GUILD_ID;
  
  try {
    console.log(`Deploying commands in ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
    console.log('Dev Guild ID:', devGuildId);
    
    if (devGuildId) {
      // Always clear guild commands first, regardless of mode
      console.log(`${isDev ? 'Development' : 'Production'} mode: Clearing guild commands...`);
      await rateLimitAwareRequest(`applications/${appId}/guilds/${devGuildId}/commands`, {
        method: 'PUT',
        body: [],
      });
      console.log('Guild commands cleared');

      if (isDev) {
        // Only register dev commands to guild in dev mode
        await sleep(2000);
        console.log('Registering dev commands to guild...');
        const devCommands = ALL_COMMANDS.map(cmd => ({
          ...cmd,
          name: `dev_${cmd.name}`
          // Preserve original permissions for dev commands too
        }));

        await rateLimitAwareRequest(`applications/${appId}/guilds/${devGuildId}/commands`, {
          method: 'PUT',
          body: devCommands,
        });
        console.log('Dev commands registered successfully');
      }
      await sleep(2000);
    }

    // Register global commands
    console.log('Registering global commands...');
    await rateLimitAwareRequest(`applications/${appId}/commands`, {
      method: 'PUT',
      body: ALL_COMMANDS.map(cmd => ({
        ...cmd,
        // Only set dm_permission to false, preserve original permissions
        dm_permission: false
      })),
    });
    console.log('Global commands registered successfully');
    
  } catch (error) {
    console.error('Error deploying commands:', error);
    process.exit(1);
  }
}

deployCommands();
