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
      // Handle both old array format and new environment-specific format
      let excludedCount = 0;
      let excludedDisplay = '';
      if (Array.isArray(loggingConfig.excludedUserIds)) {
        // Legacy format
        excludedCount = loggingConfig.excludedUserIds.length;
        excludedDisplay = loggingConfig.excludedUserIds.join(', ');
      } else if (loggingConfig.excludedUserIds && typeof loggingConfig.excludedUserIds === 'object') {
        // New format
        const prodCount = loggingConfig.excludedUserIds.production?.length || 0;
        const devCount = loggingConfig.excludedUserIds.development?.length || 0;
        excludedCount = `${prodCount} prod, ${devCount} dev`;
        excludedDisplay = `Production: ${loggingConfig.excludedUserIds.production?.join(', ') || 'None'}, Development: ${loggingConfig.excludedUserIds.development?.join(', ') || 'None'}`;
      }
      console.log(`Excluded Users: ${excludedCount} user(s)`);
      if (excludedDisplay) {
        console.log(`  → ${excludedDisplay}`);
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
      // Handle both old array format and new environment-specific format
      let excludedCount = 0;
      if (Array.isArray(updatedConfig.excludedUserIds)) {
        excludedCount = updatedConfig.excludedUserIds.length;
      } else if (updatedConfig.excludedUserIds && typeof updatedConfig.excludedUserIds === 'object') {
        const prodCount = updatedConfig.excludedUserIds.production?.length || 0;
        const devCount = updatedConfig.excludedUserIds.development?.length || 0;
        excludedCount = `${prodCount} prod, ${devCount} dev`;
      }
      console.log(`🚫 Excluded users: ${excludedCount}`);
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
      const isProduction = process.env.PRODUCTION === 'TRUE';
      const environment = isProduction ? 'production' : 'development';

      // Ensure new format exists
      if (Array.isArray(config.liveDiscordLogging.excludedUserIds)) {
        // Migrate legacy format
        const legacyUsers = config.liveDiscordLogging.excludedUserIds;
        config.liveDiscordLogging.excludedUserIds = {
          production: legacyUsers,
          development: []
        };
        console.log('📊 Auto-migrated to environment-specific exclusion format');
      }

      const excludedUsers = config.liveDiscordLogging.excludedUserIds[environment] || [];

      if (excludedUsers.includes(userIdArg)) {
        // Remove from exclusion list
        config.liveDiscordLogging.excludedUserIds[environment] = excludedUsers.filter(id => id !== userIdArg);
        await saveEnvironmentConfig(config);
        console.log(`✅ User ${userIdArg} REMOVED from ${environment} exclusion list`);
        console.log(`📤 This user's interactions will now appear in ${environment} Discord logs`);
      } else {
        // Add to exclusion list
        config.liveDiscordLogging.excludedUserIds[environment].push(userIdArg);
        await saveEnvironmentConfig(config);
        console.log(`✅ User ${userIdArg} ADDED to ${environment} exclusion list`);
        console.log(`🚫 This user's interactions will be filtered out of ${environment} Discord logs`);
      }

      // Display current status
      const prodCount = config.liveDiscordLogging.excludedUserIds.production?.length || 0;
      const devCount = config.liveDiscordLogging.excludedUserIds.development?.length || 0;
      console.log(`📊 Current exclusion lists: ${prodCount} production, ${devCount} development`);
      if (prodCount > 0) {
        console.log(`  → Production: ${config.liveDiscordLogging.excludedUserIds.production.join(', ')}`);
      }
      if (devCount > 0) {
        console.log(`  → Development: ${config.liveDiscordLogging.excludedUserIds.development.join(', ')}`);
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