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
  --filter-out [buttons]  Comma-separated list of button patterns to filter out
  --recent [days]     Show only recent entries (default: all historical data)
  --live              Follow live updates (like tail -f)

Examples:
  npm run live-analytics                    # Show all historical data
  npm run live-analytics --live             # Follow live updates
  npm run live-analytics --recent 3         # Show last 3 days only
  npm run live-analytics --filter-out "disabled_,test_"  # Filter out specific buttons

Default filtered buttons: ${DEFAULT_FILTERED_BUTTONS.join(', ')}
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    help: false,
    live: false,
    recent: null,
    filterOut: [...DEFAULT_FILTERED_BUTTONS]
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--live') {
      options.live = true;
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
  
  const timestampMatch = logLine.match(/\[ANALYTICS\] (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
  if (!timestampMatch) return true;
  
  const logDate = new Date(timestampMatch[1]);
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
    console.log('📅 Showing all historical data');
  }
  
  console.log('═'.repeat(60));
  console.log('');

  if (options.live) {
    // Live mode - use tail -f
    console.log('🔴 LIVE MODE - Press Ctrl+C to stop');
    console.log('');
    
    const tail = spawn('tail', ['-f', ANALYTICS_LOG_FILE]);
    
    tail.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        if (line.includes('[ANALYTICS]')) {
          if (!shouldFilterOut(line, options.filterOut) && isWithinRecentDays(line, options.recent)) {
            // Clean up the timestamp for display
            const cleanLine = line.replace(/\[ANALYTICS\] \d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\.\d{3}Z/, '[$1]');
            console.log(cleanLine);
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
        if (line.includes('[ANALYTICS]')) {
          if (!shouldFilterOut(line, options.filterOut) && isWithinRecentDays(line, options.recent)) {
            // Clean up the timestamp for display
            const cleanLine = line.replace(/\[ANALYTICS\] \d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\.\d{3}Z/, '[$1]');
            console.log(cleanLine);
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