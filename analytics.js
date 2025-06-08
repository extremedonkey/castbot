#!/usr/bin/env node

/**
 * CastBot Analytics Tool
 * Analyzes playerData.json to provide insights on bot usage and server statistics
 */

import fs from 'fs';
import path from 'path';

const PLAYER_DATA_FILE = './playerData.json';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  }) + ' UTC';
}

function formatNumber(num) {
  return num.toLocaleString();
}

function analyzePlayerData() {
  try {
    // Check if file exists
    if (!fs.existsSync(PLAYER_DATA_FILE)) {
      log(`❌ PlayerData file not found: ${PLAYER_DATA_FILE}`, 'red');
      log('Make sure you run this command from the CastBot directory.', 'yellow');
      process.exit(1);
    }

    // Load and parse data
    const rawData = fs.readFileSync(PLAYER_DATA_FILE, 'utf8');
    const playerData = JSON.parse(rawData);

    // Filter out non-server entries and sort by lastUpdated (most recent first)
    const servers = Object.entries(playerData)
      .filter(([key]) => !key.startsWith('/*') && key !== 'undefined') // Filter out comments and invalid entries
      .map(([guildId, data]) => ({
        guildId,
        ...data,
        playerCount: data.players ? Object.keys(data.players).length : 0,
        tribeCount: data.tribes ? Object.keys(data.tribes).length : 0,
        timezoneCount: data.timezones ? Object.keys(data.timezones).length : 0,
        pronounCount: data.pronounRoleIDs ? data.pronounRoleIDs.length : 0,
        applicationCount: data.applicationConfigs ? Object.keys(data.applicationConfigs).length : 0
      }))
      .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

    // Display header
    log('', 'white');
    log('🤖 CASTBOT ANALYTICS DASHBOARD', 'bright');
    log('=' .repeat(50), 'cyan');
    log('', 'white');

    // Overall statistics
    const totalServers = servers.length;
    const totalPlayers = servers.reduce((sum, server) => sum + server.playerCount, 0);
    const totalTribes = servers.reduce((sum, server) => sum + server.tribeCount, 0);
    const totalApplications = servers.reduce((sum, server) => sum + server.applicationCount, 0);
    const activeServers = servers.filter(s => s.lastUpdated && s.lastUpdated > Date.now() - (30 * 24 * 60 * 60 * 1000)); // Active in last 30 days

    log('📊 OVERALL STATISTICS', 'bright');
    log(`Total Servers: ${formatNumber(totalServers)}`, 'green');
    log(`Active Servers (30 days): ${formatNumber(activeServers.length)}`, 'green');
    log(`Total Players Tracked: ${formatNumber(totalPlayers)}`, 'blue');
    log(`Total Tribes Configured: ${formatNumber(totalTribes)}`, 'magenta');
    log(`Total Application Configs: ${formatNumber(totalApplications)}`, 'yellow');
    log('', 'white');

    // Display servers
    log('🏰 SERVERS (Most Recent Activity First)', 'bright');
    log('-' .repeat(80), 'cyan');

    servers.forEach((server, index) => {
      const rank = (index + 1).toString().padStart(2, ' ');
      const serverName = server.serverName || 'Unknown Server';
      const memberCount = server.memberCount || 0;
      const lastActivity = formatDate(server.lastUpdated);
      
      log('', 'white');
      log(`${rank}. ${serverName}`, 'bright');
      log(`    Guild ID: ${server.guildId}`, 'white');
      
      // Enhanced owner information
      if (server.ownerInfo) {
        const ownerDisplay = server.ownerInfo.globalName !== server.ownerInfo.username 
          ? `${server.ownerInfo.globalName} (@${server.ownerInfo.username})`
          : `@${server.ownerInfo.username}`;
        log(`    Owner: ${ownerDisplay} (${server.ownerId})`, 'green');
      } else {
        log(`    Owner ID: ${server.ownerId || 'Unknown'}`, 'white');
      }
      
      log(`    Members: ${formatNumber(memberCount)} | Players: ${server.playerCount} | Tribes: ${server.tribeCount}`, 'cyan');
      log(`    Timezones: ${server.timezoneCount} | Pronouns: ${server.pronounCount} | Applications: ${server.applicationCount}`, 'yellow');
      log(`    Last Activity: ${lastActivity}`, server.lastUpdated ? 'green' : 'red');
      
      // Show installation date if available
      if (server.firstInstalled) {
        log(`    First Installed: ${formatDate(server.firstInstalled)}`, 'blue');
      }
      
      // Show creation date if available
      if (server.createdTimestamp) {
        log(`    Server Created: ${formatDate(server.createdTimestamp)}`, 'magenta');
      }

      // Show server features if available
      const features = [];
      if (server.partnered) features.push('Partnered');
      if (server.verified) features.push('Verified');
      if (server.vanityURLCode) features.push(`Vanity: ${server.vanityURLCode}`);
      if (features.length > 0) {
        log(`    Features: ${features.join(', ')}`, 'yellow');
      }

      // Show tribe details if any exist
      if (server.tribes && Object.keys(server.tribes).length > 0) {
        const castlists = {};
        const tribeNames = [];
        
        Object.entries(server.tribes).forEach(([roleId, tribe]) => {
          const castlistName = tribe.castlist || 'default';
          if (!castlists[castlistName]) castlists[castlistName] = 0;
          castlists[castlistName]++;
          
          // Collect tribe names for analytics display
          if (tribe.analyticsName) {
            tribeNames.push(tribe.analyticsName);
          }
        });
        
        const castlistSummary = Object.entries(castlists)
          .map(([name, count]) => `${name}(${count})`)
          .join(', ');
        log(`    Castlists: ${castlistSummary}`, 'blue');
        
        // Show tribe names if available (analytics only)
        if (tribeNames.length > 0) {
          const tribeDisplay = tribeNames.length > 5 
            ? `${tribeNames.slice(0, 5).join(', ')} ... (+${tribeNames.length - 5} more)`
            : tribeNames.join(', ');
          log(`    Tribes: ${tribeDisplay}`, 'cyan');
        }
      }

      // Show application activity if any
      if (server.applicationConfigs && Object.keys(server.applicationConfigs).length > 0) {
        const appCount = Object.keys(server.applicationConfigs).length;
        const activeApps = Object.values(server.applicationConfigs).filter(app => app.stage === 'active').length;
        log(`    Applications: ${activeApps}/${appCount} active`, 'green');
      }
    });

    log('', 'white');
    log('=' .repeat(50), 'cyan');
    log('✅ Analytics complete!', 'green');
    log('', 'white');

  } catch (error) {
    log(`❌ Error analyzing player data: ${error.message}`, 'red');
    if (error.name === 'SyntaxError') {
      log('The playerData.json file appears to be corrupted or invalid JSON.', 'yellow');
    }
    process.exit(1);
  }
}

// Run analytics if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  analyzePlayerData();
}

export { analyzePlayerData };