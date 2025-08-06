import fs from 'fs';

console.log('🚨 EMERGENCY: Clearing stuck analytics queue...');

// Load the environment config
const configPath = './environmentConfig.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Clear the stuck queue
if (config.liveDiscordLogging && config.liveDiscordLogging.rateLimitQueue) {
  const queueLength = config.liveDiscordLogging.rateLimitQueue.length;
  console.log(`Found ${queueLength} stuck messages in queue`);
  
  // Show what's stuck
  if (queueLength > 0) {
    console.log('First stuck message:', config.liveDiscordLogging.rateLimitQueue[0]);
  }
  
  // Clear it
  config.liveDiscordLogging.rateLimitQueue = [];
  
  // Save the cleaned config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('✅ Queue cleared successfully!');
} else {
  console.log('No queue found in config');
}

console.log('\n📝 Next: Restart the app to apply the fix');