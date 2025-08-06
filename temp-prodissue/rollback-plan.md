# 🔄 PRODUCTION DEPLOYMENT & ROLLBACK PLAN

**Date:** August 6, 2025  
**Deploying from:** `e7d25b1` (Fix castlist navigation crash)  
**Current Production:** `6de0b72` (Fix whisper 'This interaction failed' errors)

## 📋 PRE-DEPLOYMENT CHECKLIST

1. ✅ Record current production commit: `6de0b72`
2. ✅ Backup production data (already done)
3. ✅ Note current PM2 status (337 restarts, currently stable)
4. ✅ Verify rollback commands ready

## 🚀 DEPLOYMENT STEPS

### Step 1: Deploy to Production
```bash
npm run deploy-remote-wsl
```

### Step 2: Monitor After Deployment
```bash
# Watch logs for 5 minutes
npm run logs-prod-follow

# Check PM2 status
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170 "pm2 status"

# Check for errors
npm run logs-prod-errors
```

## 🔴 ROLLBACK PLAN (If Issues Occur)

### QUICK ROLLBACK (30 seconds):
```bash
# SSH into production
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170

# Navigate to project
cd /opt/bitnami/projects/castbot

# Rollback to previous stable commit
git reset --hard 6de0b72

# Restart application
pm2 restart castbot-pm

# Exit SSH
exit
```

### DETAILED ROLLBACK STEPS:

#### 1. If app crashes immediately after deployment:
```bash
# Connect to production
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170

# Stop the crashing app
pm2 stop castbot-pm

# Rollback code
cd /opt/bitnami/projects/castbot
git reset --hard 6de0b72

# Clear any bad cached data
pm2 flush

# Start fresh
pm2 start castbot-pm
pm2 save
```

#### 2. If specific features are broken:
```bash
# You can rollback individual files instead of everything
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170
cd /opt/bitnami/projects/castbot

# Example: Just rollback app.js
git checkout 6de0b72 -- app.js

# Restart
pm2 restart castbot-pm
```

#### 3. If data corruption occurs:
```bash
# Restore from your backups
ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170
cd /opt/bitnami/projects/castbot

# Backup current (possibly corrupted) data
cp playerData.json playerData_corrupted_$(date +%Y%m%d_%H%M%S).json
cp safariContent.json safariContent_corrupted_$(date +%Y%m%d_%H%M%S).json

# Restore from known good backup (adjust timestamp)
cp backups/playerData_20250806_1400.json playerData.json
cp backups/safariContent_20250806_1400.json safariContent.json

# Restart
pm2 restart castbot-pm
```

## 📊 SUCCESS INDICATORS

After deployment, these indicate success:
- ✅ PM2 shows 0-1 restarts (not climbing)
- ✅ No "Invalid tribe index" errors in logs
- ✅ Analytics toggle works without showing "undefined"
- ✅ Users can navigate castlist without crashes
- ✅ Memory usage stable (under 200MB)

## 🚨 FAILURE INDICATORS

Rollback immediately if you see:
- ❌ PM2 restart count climbing rapidly
- ❌ "This interaction failed" errors in Discord
- ❌ Memory usage over 400MB
- ❌ Error logs filling rapidly
- ❌ Users reporting issues

## 📞 EMERGENCY CONTACTS

If rollback doesn't work:
1. Reboot the server: `sudo reboot` (last resort)
2. Check AWS instance health
3. Verify Discord API status: https://discordstatus.com

## 🎯 DEPLOYMENT COMMAND

Ready to deploy? Run:
```bash
npm run deploy-remote-wsl
```

Monitor for 5 minutes after deployment. If all indicators are green, deployment is successful!