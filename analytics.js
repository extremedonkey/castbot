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

function formatShortDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function formatNumber(num) {
  return num.toLocaleString();
}

async function analyzePlayerData() {
  try {
    // Check if file exists
    if (!fs.existsSync(PLAYER_DATA_FILE)) {
      log(`❌ PlayerData file not found: ${PLAYER_DATA_FILE}`, 'red');
      log('Make sure you run this command from the CastBot directory.', 'yellow');
      throw new Error('PlayerData file not found');
    }

    // Load and parse data asynchronously
    const rawData = await fs.promises.readFile(PLAYER_DATA_FILE, 'utf8');
    const playerData = JSON.parse(rawData);

    // Filter out non-server entries and exclude Reece's servers (391415444084490240)
    const allServers = Object.entries(playerData)
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
      .filter(server => !['391415444084490240', '696456309762949141', '245470919600898048'].includes(server.ownerId)); // Exclude specific owner servers

    // Custom sorting logic
    const servers = allServers.sort((a, b) => {
      const aHasInstalled = !!a.firstInstalled;
      const bHasInstalled = !!b.firstInstalled;
      const aHasRoles = (a.timezoneCount + a.pronounCount) > 0;
      const bHasRoles = (b.timezoneCount + b.pronounCount) > 0;
      
      // 1. Servers with 'First Installed' date first (newest to oldest)
      if (aHasInstalled && !bHasInstalled) return -1;
      if (!aHasInstalled && bHasInstalled) return 1;
      if (aHasInstalled && bHasInstalled) {
        return (b.firstInstalled || 0) - (a.firstInstalled || 0); // Newest first
      }
      
      // 2. For servers without 'First Installed', separate by pronoun/timezone roles
      if (!aHasInstalled && !bHasInstalled) {
        // Servers with roles come before servers without roles
        if (aHasRoles && !bHasRoles) return -1;
        if (!aHasRoles && bHasRoles) return 1;
        
        // Within same role category, order by server created date (newest first)
        return (b.createdTimestamp || 0) - (a.createdTimestamp || 0);
      }
      
      return 0;
    });

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

    // Display servers with section headers
    log('🏰 SERVERS', 'bright');
    log('-' .repeat(80), 'cyan');

    let currentSection = '';
    servers.forEach((server, index) => {
      // Determine section for this server
      const hasInstalled = !!server.firstInstalled;
      const hasRoles = (server.timezoneCount + server.pronounCount) > 0;
      
      let newSection;
      if (hasInstalled) {
        newSection = "Section 1: Servers with 'First Installed' date (newest to oldest)";
      } else if (hasRoles) {
        newSection = "Section 2: Servers without 'First Installed' BUT with Pronouns/Timezones (newest to oldest)";
      } else {
        newSection = "Section 3: Servers with 0 Pronouns/Timezones (newest to oldest)";
      }
      
      // Add section header if we're entering a new section
      if (newSection !== currentSection) {
        if (currentSection !== '') log('', 'white'); // Add spacing between sections
        log(`\n📍 ${newSection}`, 'yellow');
        log('-' .repeat(60), 'yellow');
        currentSection = newSection;
      }
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
        let oldestTribeTimestamp = null;
        let newestTribeTimestamp = null;
        
        Object.entries(server.tribes).forEach(([roleId, tribe]) => {
          const castlistName = tribe.castlist || 'default';
          if (!castlists[castlistName]) castlists[castlistName] = 0;
          castlists[castlistName]++;
          
          // Collect tribe names for analytics display with emoji format
          if (tribe.analyticsName) {
            tribeNames.push(tribe.analyticsName);
          }
          
          // Track tribe timestamps for date range display
          if (tribe.analyticsAdded) {
            if (!oldestTribeTimestamp || tribe.analyticsAdded < oldestTribeTimestamp) {
              oldestTribeTimestamp = tribe.analyticsAdded;
            }
            if (!newestTribeTimestamp || tribe.analyticsAdded > newestTribeTimestamp) {
              newestTribeTimestamp = tribe.analyticsAdded;
            }
          }
        });
        
        const castlistSummary = Object.entries(castlists)
          .map(([name, count]) => `${name}(${count})`)
          .join(', ');
        log(`    Castlists: ${castlistSummary}`, 'blue');
        
        // Show tribe names in comma-separated format with emojis
        if (tribeNames.length > 0) {
          const tribeDisplay = tribeNames.length > 5 
            ? `${tribeNames.slice(0, 5).join(', ')} ... (+${tribeNames.length - 5} more)`
            : tribeNames.join(', ');
          log(`    Tribes: ${tribeDisplay}`, 'cyan');
        }
        
        // Show tribe date range if timestamps are available
        if (oldestTribeTimestamp || newestTribeTimestamp) {
          let dateRangeDisplay = '';
          if (oldestTribeTimestamp === newestTribeTimestamp) {
            // All tribes added on same day
            dateRangeDisplay = `(${formatShortDate(oldestTribeTimestamp)})`;
          } else if (oldestTribeTimestamp && newestTribeTimestamp) {
            // Range of dates
            dateRangeDisplay = `(${formatShortDate(oldestTribeTimestamp)} - ${formatShortDate(newestTribeTimestamp)})`;
          } else {
            // Only one timestamp available
            const timestamp = oldestTribeTimestamp || newestTribeTimestamp;
            dateRangeDisplay = `(${formatShortDate(timestamp)})`;
          }
          if (dateRangeDisplay) {
            log(`    Tribes Added: ${dateRangeDisplay}`, 'magenta');
          }
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
    throw error; // Re-throw instead of process.exit for Discord bot context
  }
}

// Run analytics if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('analytics.js')) {
  analyzePlayerData().catch(console.error);
}

export { analyzePlayerData };