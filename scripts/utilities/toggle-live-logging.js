#!/usr/bin/env node
import 'dotenv/config';
import { loadEnvironmentConfig, updateLiveLoggingStatus, saveEnvironmentConfig, getLoggingChannelId, getLoggingTimezoneOffset } from '../../storage.js';

/**
 * Toggle Live Discord Logging System
 * 
 * Usage:
 *   node toggle-live-logging.js                 # Show current status
 *   node toggle-live-logging.js enable          # Enable live logging
 *   node toggle-live-logging.js disable         # Disable live logging
 *   node toggle-live-logging.js exclude <userID> # Add/remove user from exclusion list
 */

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();
const userIdArg = args[1]; // For exclude command

async function main() {
  try {
    console.log('🔄 Loading environment configuration...');
    const config = await loadEnvironmentConfig();
    const loggingConfig = config.liveDiscordLogging;
    
    if (!command) {
      // Show current status
      const currentChannelId = await getLoggingChannelId();
      const currentTimezoneOffset = await getLoggingTimezoneOffset();
      const isProduction = process.env.PRODUCTION === 'TRUE';
      
      console.log('\n📊 LIVE DISCORD LOGGING STATUS');
      console.log('═'.repeat(50));
      console.log(`Status: ${loggingConfig.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}`);
      console.log(`Environment: ${isProduction ? '🚀 PRODUCTION' : '🛠️ DEVELOPMENT'}`);
      console.log(`Target Guild: ${loggingConfig.targetGuildId}`);
      console.log(`Active Channel: ${currentChannelId}`);
      console.log(`  → Production: ${loggingConfig.productionChannelId || 'Not configured'} (#🪵logs, UTC+${loggingConfig.productionTimezoneOffset || 8})`);
      console.log(`  → Development: ${loggingConfig.developmentChannelId || 'Not configured'} (#🪵logs-dev, UTC+${loggingConfig.developmentTimezoneOffset || 0})`);
      console.log(`Active Timezone Offset: UTC+${currentTimezoneOffset} (${currentTimezoneOffset === 0 ? 'local time' : currentTimezoneOffset + ' hours ahead of UTC'})`);
      console.log(`Excluded Users: ${loggingConfig.excludedUserIds.length} user(s)`);
      if (loggingConfig.excludedUserIds.length > 0) {
        console.log(`  → ${loggingConfig.excludedUserIds.join(', ')}`);
      }
      console.log(`Rate Limit Queue: ${loggingConfig.rateLimitQueue.length} messages`);
      console.log('\nUsage:');
      console.log('  node toggle-live-logging.js enable   # Enable live logging');
      console.log('  node toggle-live-logging.js disable  # Disable live logging');
      console.log('  node toggle-live-logging.js exclude <userID>  # Toggle user exclusion');
      return;
    }
    
    if (command === 'enable') {
      console.log('🟢 Enabling live Discord logging...');
      const updatedConfig = await updateLiveLoggingStatus(true);
      const currentChannelId = await getLoggingChannelId();
      const isProduction = process.env.PRODUCTION === 'TRUE';
      
      console.log('✅ Live Discord logging ENABLED');
      console.log(`📤 Logs will now flow to channel ${currentChannelId}`);
      console.log(`🌍 Environment: ${isProduction ? 'PRODUCTION (#🪵logs)' : 'DEVELOPMENT (#🪵logs-dev)'}`);
      console.log(`🚫 Excluded users: ${updatedConfig.excludedUserIds.length}`);
    } else if (command === 'disable') {
      console.log('🔴 Disabling live Discord logging...');
      const updatedConfig = await updateLiveLoggingStatus(false);
      console.log('✅ Live Discord logging DISABLED');
      console.log('📄 Only file logging will continue');
    } else if (command === 'exclude') {
      if (!userIdArg) {
        console.error('❌ Please provide a Discord user ID');
        console.log('Usage: node toggle-live-logging.js exclude <userID>');
        process.exit(1);
      }
      
      // Validate user ID format (Discord IDs are 17-19 digit numbers)
      if (!/^\d{17,19}$/.test(userIdArg)) {
        console.error('❌ Invalid Discord user ID format. Should be a 17-19 digit number.');
        process.exit(1);
      }
      
      console.log(`🔄 Toggling exclusion for user ID: ${userIdArg}...`);
      
      const config = await loadEnvironmentConfig();
      const excludedUsers = config.liveDiscordLogging.excludedUserIds;
      
      if (excludedUsers.includes(userIdArg)) {
        // Remove from exclusion list
        config.liveDiscordLogging.excludedUserIds = excludedUsers.filter(id => id !== userIdArg);
        await saveEnvironmentConfig(config);
        console.log(`✅ User ${userIdArg} REMOVED from exclusion list`);
        console.log('📤 This user\'s interactions will now appear in Discord logs');
      } else {
        // Add to exclusion list
        config.liveDiscordLogging.excludedUserIds.push(userIdArg);
        await saveEnvironmentConfig(config);
        console.log(`✅ User ${userIdArg} ADDED to exclusion list`);
        console.log('🚫 This user\'s interactions will be filtered out of Discord logs');
      }
      
      console.log(`📊 Current exclusion list: ${config.liveDiscordLogging.excludedUserIds.length} user(s)`);
      if (config.liveDiscordLogging.excludedUserIds.length > 0) {
        console.log(`  → ${config.liveDiscordLogging.excludedUserIds.join(', ')}`);
      }
    } else {
      console.error('❌ Invalid command. Use "enable", "disable", "exclude <userID>", or no arguments for status');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();