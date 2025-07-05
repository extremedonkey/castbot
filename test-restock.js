#!/usr/bin/env node

// Quick script to manually restock players for testing
import { restockPlayers } from './safariManager.js';

const GUILD_ID = '1331657596087566398';

// Create a mock client object that has the basic structure we need
const mockClient = {
  guilds: {
    cache: {
      get: (guildId) => {
        if (guildId === GUILD_ID) {
          return {
            id: GUILD_ID,
            name: 'CastBot',
            members: {
              fetch: async () => {
                console.log('Mock: Fetching members...');
                return new Map(); // Empty for mock
              }
            }
          };
        }
        return null;
      }
    }
  }
};

async function manualRestock() {
  try {
    console.log(`🪣 Starting manual restock for guild ${GUILD_ID}...`);
    
    const result = await restockPlayers(GUILD_ID, mockClient);
    
    console.log('✅ Restock completed!');
    console.log('Result:', result);
    
  } catch (error) {
    console.error('❌ Restock failed:', error);
  }
}

manualRestock();