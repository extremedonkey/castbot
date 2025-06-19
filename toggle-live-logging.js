#!/usr/bin/env node
import 'dotenv/config';
import { loadEnvironmentConfig, updateLiveLoggingStatus } from './storage.js';

/**
 * Toggle Live Discord Logging System
 * 
 * Usage:
 *   node toggle-live-logging.js                 # Show current status
 *   node toggle-live-logging.js enable          # Enable live logging
 *   node toggle-live-logging.js disable         # Disable live logging
 */

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

async function main() {
  try {
    console.log('🔄 Loading environment configuration...');
    const config = await loadEnvironmentConfig();
    const loggingConfig = config.liveDiscordLogging;
    
    if (!command) {
      // Show current status
      console.log('\n📊 LIVE DISCORD LOGGING STATUS');
      console.log('═'.repeat(50));
      console.log(`Status: ${loggingConfig.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
      console.log(`Target Guild: ${loggingConfig.targetGuildId}`);
      console.log(`Target Channel: ${loggingConfig.targetChannelId}`);
      console.log(`Excluded Users: ${loggingConfig.excludedUserIds.length} user(s)`);
      console.log(`Rate Limit Queue: ${loggingConfig.rateLimitQueue.length} messages`);
      console.log('\nUsage:');
      console.log('  node toggle-live-logging.js enable   # Enable live logging');
      console.log('  node toggle-live-logging.js disable  # Disable live logging');
      return;
    }
    
    if (command === 'enable') {
      console.log('🟢 Enabling live Discord logging...');
      const updatedConfig = await updateLiveLoggingStatus(true);
      console.log('✅ Live Discord logging ENABLED');
      console.log(`📤 Logs will now flow to channel ${updatedConfig.targetChannelId}`);
      console.log(`🚫 Excluded users: ${updatedConfig.excludedUserIds.length}`);
    } else if (command === 'disable') {
      console.log('🔴 Disabling live Discord logging...');
      const updatedConfig = await updateLiveLoggingStatus(false);
      console.log('✅ Live Discord logging DISABLED');
      console.log('📄 Only file logging will continue');
    } else {
      console.error('❌ Invalid command. Use "enable", "disable", or no arguments for status');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();