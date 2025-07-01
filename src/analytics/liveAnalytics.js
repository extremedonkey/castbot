#!/usr/bin/env node

import fs from 'fs';
import { spawn } from 'child_process';
import { getLogFilePath } from './analyticsLogger.js';

const ANALYTICS_LOG_FILE = getLogFilePath();

// Default buttons to filter out (can be customized)
const DEFAULT_FILTERED_BUTTONS = [
  'disabled_',           // Disabled navigation buttons
  'castlist2_nav_disabled', // Disabled castlist navigation
];

function showHelp() {
  console.log(`
🤖 CastBot Live Analytics Monitor

Usage:
  npm run live-analytics [options]

Options:
  --help, -h          Show this help message
  --historical        Show historical data instead of live mode
  --filter-out [buttons]  Comma-separated list of button patterns to filter out
  --recent [days]     Show only recent entries (default: all data)

Examples:
  npm run live-analytics                    # Follow live updates (DEFAULT)
  npm run live-analytics --historical       # Show all historical data
  npm run live-analytics --recent 3         # Show last 3 days live
  npm run live-analytics --historical --recent 3  # Show last 3 days historical
  npm run live-analytics --filter-out "disabled_,test_"  # Filter out specific buttons

Default filtered buttons: ${DEFAULT_FILTERED_BUTTONS.join(', ')}

Live Mode Commands:
  Ctrl+C              Stop monitoring
  
Note: Live mode is now the default behavior!
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    help: false,
    live: true,  // DEFAULT is now live mode
    recent: null,
    filterOut: [...DEFAULT_FILTERED_BUTTONS]
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--historical') {
      options.live = false;  // Switch to historical mode
    } else if (arg === '--recent') {
      const days = parseInt(args[i + 1]);
      if (!isNaN(days)) {
        options.recent = days;
        i++; // Skip next argument
      }
    } else if (arg === '--filter-out') {
      const filters = args[i + 1];
      if (filters) {
        options.filterOut = filters.split(',').map(f => f.trim());
        i++; // Skip next argument
      }
    }
  }

  return options;
}

function shouldFilterOut(logLine, filterPatterns) {
  if (!filterPatterns || filterPatterns.length === 0) return false;
  
  return filterPatterns.some(pattern => {
    return logLine.includes(pattern);
  });
}

function isWithinRecentDays(logLine, days) {
  if (!days) return true;
  
  // Match new format: [8:18AM] Thu 19 Jun 25
  const timestampMatch = logLine.match(/^\[(\d{1,2}:\d{2}[AP]M)\] (\w{3}) (\d{1,2}) (\w{3}) (\d{2})/);
  if (!timestampMatch) return true;
  
  const [, time, dayName, day, month, year] = timestampMatch;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = months.indexOf(month);
  
  if (monthIndex === -1) return true;
  
  const logDate = new Date(2000 + parseInt(year), monthIndex, parseInt(day));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  return logDate >= cutoffDate;
}

function displayAnalytics(options) {
  if (!fs.existsSync(ANALYTICS_LOG_FILE)) {
    console.log('📊 No analytics data found yet. Use CastBot to generate some interactions!');
    console.log(`📁 Log file will be created at: ${ANALYTICS_LOG_FILE}`);
    return;
  }

  console.log('🤖 CASTBOT LIVE ANALYTICS');
  console.log('═'.repeat(60));
  
  if (options.filterOut.length > 0) {
    console.log(`🚫 Filtering out: ${options.filterOut.join(', ')}`);
  }
  
  if (options.recent) {
    console.log(`📅 Showing last ${options.recent} days`);
  } else {
    console.log('📅 Showing all data');
  }
  
  console.log('═'.repeat(60));
  console.log('');

  if (options.live) {
    // Live mode - use tail -f
    console.log('🔴 LIVE MODE - Press Ctrl+C to stop');
    console.log('');
    console.log('💡 Quick Commands:');
    console.log('   node liveAnalytics.js --historical     # View historical data');
    console.log('   node liveAnalytics.js --recent 3       # Last 3 days live');
    console.log('   node liveAnalytics.js --filter-out "disabled_"  # Filter buttons');
    console.log('');
    console.log('═'.repeat(60));
    console.log('');
    
    const tail = spawn('tail', ['-f', ANALYTICS_LOG_FILE]);
    
    tail.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        // Check if line matches our new format: [8:18AM] Thu 19 Jun 25 | ...
        if (line.match(/^\[\d{1,2}:\d{2}[AP]M\]/)) {
          if (!shouldFilterOut(line, options.filterOut) && isWithinRecentDays(line, options.recent)) {
            console.log(line);
          }
        }
      });
    });
    
    tail.on('error', (error) => {
      console.error('Error reading log file:', error.message);
    });
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n\n📊 Analytics monitoring stopped.');
      tail.kill();
      process.exit(0);
    });
    
  } else {
    // Historical mode - read entire file
    try {
      const logContent = fs.readFileSync(ANALYTICS_LOG_FILE, 'utf8');
      const lines = logContent.split('\n').filter(line => line.trim());
      let displayedCount = 0;
      
      lines.forEach(line => {
        // Check if line matches our new format: [8:18AM] Thu 19 Jun 25 | ...
        if (line.match(/^\[\d{1,2}:\d{2}[AP]M\]/)) {
          if (!shouldFilterOut(line, options.filterOut) && isWithinRecentDays(line, options.recent)) {
            console.log(line);
            displayedCount++;
          }
        }
      });
      
      console.log('');
      console.log('═'.repeat(60));
      console.log(`📊 Displayed ${displayedCount} interactions`);
      
      if (displayedCount === 0) {
        console.log('💡 No interactions found. Try running CastBot commands to generate data!');
      }
      
    } catch (error) {
      console.error('Error reading analytics log:', error.message);
    }
  }
}

// Main execution
const options = parseArgs();

if (options.help) {
  showHelp();
} else {
  displayAnalytics(options);
}