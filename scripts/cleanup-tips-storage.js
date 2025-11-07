#!/usr/bin/env node

/**
 * Cleanup Script: Delete all tips-storage channels across all guilds
 *
 * Emergency cleanup after tips gallery created storage channels in all guilds
 * Run with: node scripts/cleanup-tips-storage.js
 */

import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';

async function cleanupTipsStorageChannels() {
  console.log('🧹 Starting cleanup of tips-storage channels...\n');

  // Create Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages
    ]
  });

  // Login to Discord
  await client.login(process.env.DISCORD_TOKEN);
  console.log('✅ Logged in to Discord\n');

  // Wait for client to be ready
  await new Promise((resolve) => {
    if (client.isReady()) {
      resolve();
    } else {
      client.once('ready', resolve);
    }
  });

  // Fetch all guilds
  const guilds = await client.guilds.fetch();
  console.log(`📊 Found ${guilds.size} guilds to check\n`);

  let deleted = 0;
  let notFound = 0;
  let errors = 0;

  // Process each guild
  for (const [guildId, partialGuild] of guilds) {
    try {
      // Fetch full guild data
      const guild = await client.guilds.fetch(guildId);

      // Fetch channels to populate cache
      await guild.channels.fetch();

      // Find tips-storage channel
      const tipsChannel = guild.channels.cache.find(
        ch => ch.name === 'tips-storage' && ch.type === 0
      );

      if (tipsChannel) {
        try {
          await tipsChannel.delete('Cleanup: Tips gallery created channels in all guilds by mistake');
          console.log(`✅ DELETED tips-storage in ${guild.name} (${guild.id})`);
          deleted++;
        } catch (deleteError) {
          console.error(`❌ ERROR deleting channel in ${guild.name}: ${deleteError.message}`);
          errors++;
        }
      } else {
        console.log(`⚪ No tips-storage channel in ${guild.name}`);
        notFound++;
      }

      // Rate limiting - pause every 5 guilds
      if ((deleted + notFound + errors) % 5 === 0) {
        console.log('⏳ Pausing for rate limiting...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (guildError) {
      console.error(`❌ ERROR accessing guild ${guildId}: ${guildError.message}`);
      errors++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Cleanup Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Deleted:   ${deleted} channels`);
  console.log(`⚪ Not found: ${notFound} guilds`);
  console.log(`❌ Errors:    ${errors} guilds`);
  console.log(`📊 Total:     ${guilds.size} guilds checked`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Cleanup
  await client.destroy();
  process.exit(0);
}

// Run cleanup
cleanupTipsStorageChannels().catch((error) => {
  console.error('❌ FATAL ERROR:', error);
  process.exit(1);
});
