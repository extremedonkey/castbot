#!/bin/bash

echo "========================================="
echo "   FIX PRODUCTION ANALYTICS QUEUE"
echo "========================================="
echo ""
echo "This script will fix the stuck analytics queue in production."
echo "It will:"
echo "  1. Clear the stuck queue from playerData.json"
echo "  2. Deploy the fix that prevents this from happening again"
echo ""
echo "⚠️  WARNING: This will modify production data!"
echo ""
read -p "Do you want to continue? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Step 1: Backing up production playerData.json..."
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170 "cd /opt/bitnami/projects/castbot && cp playerData.json playerData_backup_$(date +%Y%m%d_%H%M%S).json"

echo ""
echo "Step 2: Clearing stuck queue in production..."
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170 "cd /opt/bitnami/projects/castbot && node -e \"
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('playerData.json', 'utf8'));

if (data.environmentConfig && data.environmentConfig.liveDiscordLogging) {
  const queue = data.environmentConfig.liveDiscordLogging.rateLimitQueue;
  if (queue && queue.length > 0) {
    console.log('Found', queue.length, 'stuck messages in queue');
    console.log('First message:', queue[0].message.substring(0, 100) + '...');
    data.environmentConfig.liveDiscordLogging.rateLimitQueue = [];
    fs.writeFileSync('playerData.json', JSON.stringify(data, null, 2));
    console.log('✅ Queue cleared!');
  } else {
    console.log('Queue is already empty');
  }
} else {
  console.log('No environment config found');
}
\""

echo ""
echo "Step 3: Getting latest code with the fix..."
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170 "cd /opt/bitnami/projects/castbot && git pull"

echo ""
echo "Step 4: Restarting application..."
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170 "pm2 restart castbot-pm"

echo ""
echo "Step 5: Checking status..."
sleep 3
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170 "pm2 status | grep castbot"

echo ""
echo "✅ Production fix complete!"
echo ""
echo "The stuck queue has been cleared and the fix deployed."
echo "The analytics system will no longer persist queues to disk."
echo ""
echo "Monitor logs with: npm run logs-prod-follow"