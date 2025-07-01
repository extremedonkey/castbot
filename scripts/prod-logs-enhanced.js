#!/usr/bin/env node

/**
 * Enhanced production log reader for Claude
 * Provides filtered, real-time log access with intelligent parsing
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SSH Configuration (reuse from deploy script)
const SSH_KEY_PATH = path.join(__dirname, '..', 'lightsail-key.pem');
const SSH_TARGET = 'bitnami@44.219.175.110';
const REMOTE_PATH = '/opt/bitnami/projects/castbot';

// ANSI color codes for output formatting
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
        'info': `${colors.blue}ℹ️`,
        'success': `${colors.green}✅`,
        'warning': `${colors.yellow}⚠️`,
        'error': `${colors.red}❌`,
        'debug': `${colors.gray}🔍`
    }[type] || colors.blue + 'ℹ️';
    
    console.log(`${prefix} ${message}${colors.reset}`);
}

async function execSSH(command, description, riskLevel = 'risk-low') {
    const fullCommand = `ssh -i "${SSH_KEY_PATH}" -o StrictHostKeyChecking=no ${SSH_TARGET} "${command}"`;
    
    try {
        const result = execSync(fullCommand, { 
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 60000
        });
        return { stdout: result, stderr: '', success: true };
    } catch (error) {
        return { 
            stdout: error.stdout || '', 
            stderr: error.stderr || error.message, 
            success: false 
        };
    }
}

async function showLogs(options = {}) {
    const {
        lines = 100,
        follow = false,
        filter = null,
        feature = null,
        level = null
    } = options;
    
    log(`📊 Fetching production logs (${lines} lines)...`, 'info');
    
    let command = `cd ${REMOTE_PATH} && pm2 logs castbot-pm --lines ${lines}`;
    
    if (follow) {
        command += ' --follow';
        log('🔄 Following logs in real-time (Ctrl+C to stop)', 'info');
    } else {
        command += ' --nostream';
    }
    
    try {
        const result = await execSSH(command, 'Getting pm2 logs', 'risk-low');
        
        if (result.stdout) {
            let logs = result.stdout;
            
            // Apply filters
            if (filter || feature || level) {
                const lines = logs.split('\n');
                const filteredLines = lines.filter(line => {
                    if (filter && !line.toLowerCase().includes(filter.toLowerCase())) return false;
                    if (feature && !line.includes(`[${feature.toUpperCase()}]`)) return false;
                    if (level) {
                        const levelPatterns = {
                            'error': /❌|ERROR/,
                            'warn': /⚠️|WARN/,
                            'info': /ℹ️|INFO/,
                            'debug': /🔍|DEBUG/,
                            'perf': /⏱️|PERF/
                        };
                        if (levelPatterns[level] && !levelPatterns[level].test(line)) return false;
                    }
                    return true;
                });
                logs = filteredLines.join('\n');
                
                if (filteredLines.length === 0) {
                    log(`No logs found matching criteria`, 'warning');
                    return;
                }
                
                log(`Showing ${filteredLines.length} filtered lines`, 'info');
            }
            
            console.log('\n📋 Production Logs:');
            console.log('═'.repeat(80));
            console.log(logs);
            console.log('═'.repeat(80));
        } else {
            log('No logs found', 'warning');
        }
    } catch (error) {
        log(`Failed to fetch logs: ${error.message}`, 'error');
        log('', 'info');
        log('🔧 Manual alternatives:', 'info');
        log(`ssh -i "${SSH_KEY_PATH}" ${SSH_TARGET} "pm2 logs castbot-pm"`, 'info');
        log(`ssh -i "${SSH_KEY_PATH}" ${SSH_TARGET} "pm2 logs castbot-pm --follow"`, 'info');
    }
}

async function showLogStats() {
    log('📊 Analyzing log patterns...', 'info');
    
    try {
        const result = await execSSH(
            `cd ${REMOTE_PATH} && pm2 logs castbot-pm --lines 500 --nostream | tail -500`,
            'Getting logs for analysis',
            'risk-low'
        );
        
        if (result.stdout) {
            const lines = result.stdout.split('\n');
            const stats = {
                total: lines.length,
                errors: lines.filter(l => l.includes('❌') || l.includes('ERROR')).length,
                warnings: lines.filter(l => l.includes('⚠️') || l.includes('WARN')).length,
                debug: lines.filter(l => l.includes('🔍') || l.includes('DEBUG')).length,
                safari: lines.filter(l => l.includes('[SAFARI]')).length,
                menu: lines.filter(l => l.includes('[MENU]')).length,
                button: lines.filter(l => l.includes('[BUTTON]')).length
            };
            
            console.log('\n📊 Log Statistics (last 500 lines):');
            console.log('═'.repeat(50));
            console.log(`Total lines: ${stats.total}`);
            console.log(`❌ Errors: ${stats.errors}`);
            console.log(`⚠️ Warnings: ${stats.warnings}`);
            console.log(`🔍 Debug: ${stats.debug}`);
            console.log('');
            console.log('Feature breakdown:');
            console.log(`🦁 Safari: ${stats.safari}`);
            console.log(`📋 Menu: ${stats.menu}`);
            console.log(`🔘 Button: ${stats.button}`);
            console.log('═'.repeat(50));
        }
    } catch (error) {
        log(`Failed to analyze logs: ${error.message}`, 'error');
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
        case '--lines':
            options.lines = parseInt(args[++i]) || 100;
            break;
        case '--follow':
        case '-f':
            options.follow = true;
            break;
        case '--filter':
            options.filter = args[++i];
            break;
        case '--feature':
            options.feature = args[++i];
            break;
        case '--level':
            options.level = args[++i];
            break;
        case '--stats':
            await showLogStats();
            process.exit(0);
        case '--help':
        case '-h':
            console.log(`
Enhanced Production Log Reader for CastBot

Usage: node scripts/prod-logs-enhanced.js [options]

Options:
  --lines <n>        Number of lines to show (default: 100)
  --follow, -f       Follow logs in real-time
  --filter <text>    Filter logs containing text
  --feature <name>   Filter by feature (SAFARI, MENU, BUTTON, etc.)
  --level <level>    Filter by log level (error, warn, info, debug, perf)
  --stats           Show log statistics
  --help, -h        Show this help

Examples:
  node scripts/prod-logs-enhanced.js --lines 200
  node scripts/prod-logs-enhanced.js --feature SAFARI --level error
  node scripts/prod-logs-enhanced.js --filter "user 391415444084490240"
  node scripts/prod-logs-enhanced.js --follow
  node scripts/prod-logs-enhanced.js --stats
            `);
            process.exit(0);
        default:
            log(`Unknown option: ${arg}`, 'warning');
            break;
    }
}

// Default action
await showLogs(options);