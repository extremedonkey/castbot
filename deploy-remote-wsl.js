import 'dotenv/config';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * WSL-Native Remote Deployment Helper for AWS Lightsail
 * 
 * Optimized for WSL environment with proper path handling and SSH key management.
 * Automates deployment to production server via SSH.
 * 
 * Usage:
 *   npm run deploy-remote-wsl        - Full production deployment
 *   npm run deploy-remote-wsl-dry    - Show what would be executed (SAFE)
 *   npm run deploy-commands-wsl      - Only deploy commands (no code update)
 *   npm run status-remote-wsl        - Check server status
 *   npm run logs-remote-wsl          - View recent logs
 */

// WSL-optimized configuration
const REMOTE_HOST = process.env.LIGHTSAIL_HOST || '13.238.148.170';
const REMOTE_USER = process.env.LIGHTSAIL_USER || 'bitnami';
const REMOTE_PATH = process.env.LIGHTSAIL_PATH || '/opt/bitnami/projects/castbot';
const SSH_KEY_PATH = path.join(os.homedir(), '.ssh', 'castbot-key.pem');
const SSH_TARGET = `${REMOTE_USER}@${REMOTE_HOST}`;

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const COMMANDS_ONLY = args.includes('--commands-only');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

function log(message, level = 'info') {
    const prefix = {
        'info': '  ',
        'success': '✅',
        'error': '❌',
        'warning': '⚠️ ',
        'debug': '  → ',
        'exec': '🔧',
        'header': '🚀',
        'risk-low': '🟢',
        'risk-medium': '🟡',
        'risk-high': '🔴'
    }[level] || '  ';
    
    console.log(`${prefix} ${message}`);
}

function logSection(title, riskLevel = 'info') {
    console.log('');
    console.log(`${'='.repeat(60)}`);
    log(title, riskLevel === 'info' ? 'header' : riskLevel);
    console.log(`${'='.repeat(60)}`);
}

function execSSH(remoteCommand, description = '', riskLevel = 'info') {
    return new Promise((resolve, reject) => {
        if (description) {
            log(`${description}`, riskLevel === 'info' ? 'exec' : riskLevel);
        }
        
        if (DRY_RUN) {
            log(`[DRY RUN] Would execute SSH: ssh -i ${SSH_KEY_PATH} ${SSH_TARGET} "${remoteCommand}"`, 'debug');
            resolve({ stdout: '[DRY RUN]', stderr: '', code: 0 });
            return;
        }
        
        if (VERBOSE) {
            log(`Executing SSH: ssh -i ${SSH_KEY_PATH} ${SSH_TARGET} "${remoteCommand}"`, 'debug');
        }
        
        const child = spawn('ssh', [
            '-i', SSH_KEY_PATH,
            '-o', 'ConnectTimeout=30',
            '-o', 'ServerAliveInterval=60',
            SSH_TARGET,
            remoteCommand
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
            if (VERBOSE) {
                process.stdout.write(data);
            }
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
            if (VERBOSE) {
                process.stderr.write(data);
            }
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr, code });
            } else {
                reject(new Error(`SSH command failed with code ${code}: ${stderr || stdout}`));
            }
        });
        
        child.on('error', (error) => {
            reject(error);
        });
    });
}

async function checkSSHConnection() {
    log('Checking SSH connection to Lightsail...', 'info');
    
    try {
        const result = await execSSH(
            'echo "SSH connection successful"',
            'Testing SSH connection',
            'risk-low'
        );
        
        if (DRY_RUN || result.stdout.includes('SSH connection successful')) {
            log('SSH connection verified', 'success');
            return true;
        } else {
            throw new Error('SSH connection test failed');
        }
    } catch (error) {
        log(`SSH connection failed: ${error.message}`, 'error');
        log('', 'info');
        log('SSH Connection Setup Instructions:', 'info');
        log(`1. Ensure SSH key exists: ${SSH_KEY_PATH}`, 'info');
        log(`2. Test manual connection: ssh -i "${SSH_KEY_PATH}" ${SSH_TARGET} "echo test"`, 'info');
        log('3. Check key permissions: ls -la ~/.ssh/castbot-key.pem (should be 600)', 'info');
        return false;
    }
}

async function deployToProduction() {
    logSection('🚀 Starting Production Deployment', 'header');
    log(`Target: ${SSH_TARGET}:${REMOTE_PATH}`, 'debug');
    
    try {
        // Step 1: Check SSH connection
        logSection('Step 1: Connection Test', 'risk-low');
        log('RISK: Low - Just testing connection, no changes made', 'risk-low');
        const sshConnected = await checkSSHConnection();
        if (!sshConnected) {
            throw new Error('Cannot establish SSH connection');
        }
        
        if (!COMMANDS_ONLY) {
            // Step 2: Create Backup
            logSection('Step 2: Create Backup', 'risk-low');
            log('RISK: Low - Safety measure, creates backup of current code', 'risk-low');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            await execSSH(
                `cd ${REMOTE_PATH} && rsync -av --exclude='node_modules' --exclude='.git' . ../castbot-backup-${timestamp}/`,
                'Backing up current version (excluding node_modules)',
                'risk-low'
            );
            
            // Step 3: Pull latest code from main branch
            logSection('Step 3: Update Code', 'risk-high');
            log('RISK: High - Code changes affect bot behavior', 'risk-high');
            log('IMPACT: New bugs could break bot functionality', 'warning');
            log('MITIGATION: Backup created in previous step for rollback', 'info');
            
            // First fetch all remote branches
            await execSSH(
                `cd ${REMOTE_PATH} && git fetch origin`,
                'Fetching remote branches',
                'risk-low'
            );
            
            // Show what we're about to merge (safety check)
            log('Checking merge preview...', 'info');
            const mergePreview = await execSSH(
                `cd ${REMOTE_PATH} && git log --oneline origin/main -5 && echo "---" && git diff HEAD..origin/main --stat`,
                'Preview merge from main',
                'risk-low'
            );
            
            if (!DRY_RUN) {
                console.log('📋 Merge Preview:');
                console.log(mergePreview.stdout);
                
                // Check for major changes
                if (mergePreview.stdout.includes('app.js') && mergePreview.stdout.includes('--')) {
                    const appJsChanges = mergePreview.stdout.split('\n').find(line => line.includes('app.js'));
                    if (appJsChanges && appJsChanges.includes('--')) {
                        log('⚠️  WARNING: app.js showing major deletions - verify this is expected!', 'warning');
                        log('Review the diff above carefully before proceeding', 'warning');
                    }
                }
            }
            
            // Pull from main branch with conflict resolution
            try {
                await execSSH(
                    `cd ${REMOTE_PATH} && git pull origin main`,
                    'Git pull from main (latest code)',
                    'risk-high'
                );
            } catch (pullError) {
                if (pullError.message.includes('would be overwritten by merge')) {
                    log('Git conflict detected, stashing local changes and retrying...', 'warning');
                    await execSSH(
                        `cd ${REMOTE_PATH} && git stash && git pull origin main`,
                        'Stashing changes and pulling from main',
                        'risk-high'
                    );
                } else {
                    throw pullError;
                }
            }
            
            // Step 4: Install dependencies
            logSection('Step 4: Install Dependencies', 'risk-medium');
            log('RISK: Medium - Dependency issues could prevent startup', 'risk-medium');
            log('IMPACT: Bot may fail to start if dependency conflicts exist', 'warning');
            await execSSH(
                `cd ${REMOTE_PATH} && npm install`,
                'npm install',
                'risk-medium'
            );
        }
        
        // Step 5: Deploy commands
        logSection('Step 5: Deploy Discord Commands', 'risk-medium');
        log('RISK: Medium - Command changes affect user experience', 'risk-medium');
        log('IMPACT: Slash commands may change/disappear temporarily', 'warning');
        log('NOTE: Command propagation takes up to 1 hour globally', 'info');
        await execSSH(
            `cd ${REMOTE_PATH} && npm run deploy-commands`,
            'Deploying commands',
            'risk-medium'
        );
        
        if (!COMMANDS_ONLY) {
            // Step 6: Restart the bot (atomic stop/start)
            logSection('Step 6: Restart Service', 'risk-high');
            log('RISK: High - Atomic restart, bot must start successfully', 'risk-high');
            log('IMPACT: Brief downtime during restart, bot offline if startup fails', 'warning');
            await execSSH(
                `cd ${REMOTE_PATH} && pm2 restart castbot-pm`,
                'Restarting pm2 process',
                'risk-high'
            );
            
            // Step 7: Verify service is running
            logSection('Step 7: Verify Status', 'risk-low');
            log('RISK: Low - Just checking if restart was successful', 'risk-low');
            const status = await execSSH(
                'pm2 list | grep castbot-pm',
                'Checking pm2 status',
                'risk-low'
            );
            
            if (status.stdout.includes('online')) {
                log('✅ CastBot is running successfully', 'success');
                log('🎯 Bot is now live and serving Discord servers', 'success');
            } else {
                log('⚠️  Warning: CastBot may not be running properly', 'warning');
                log('🔧 Check logs immediately: npm run logs-remote-wsl', 'warning');
                log('🔧 Manual restart: ssh to server and run "pm2 restart castbot-pm"', 'info');
            }
        }
        
        logSection('✅ Deployment Complete', 'success');
        log('Deployment completed successfully!', 'success');
        
        if (!COMMANDS_ONLY) {
            log('⏰ Discord commands may take up to 1 hour to propagate globally', 'info');
            log('📊 Monitor logs: npm run logs-remote-wsl', 'info');
            log('📈 Check status: npm run status-remote-wsl', 'info');
        }
        
    } catch (error) {
        logSection('❌ Deployment Failed', 'error');
        log(`Deployment failed: ${error.message}`, 'error');
        log('', 'info');
        log('🔧 Immediate Recovery Steps:', 'warning');
        log('1. Check if bot is still running: npm run status-remote-wsl', 'info');
        log('2. View error logs: npm run logs-remote-wsl', 'info');
        log('3. If bot is down, restart: ssh to server, then "pm2 restart castbot-pm"', 'info');
        log('4. If restart fails, check for syntax errors in logs', 'info');
        log('5. Emergency rollback: restore from backup created in Step 3', 'info');
        
        throw error;
    }
}

async function showLogs() {
    log('📊 Fetching remote logs...', 'info');
    
    try {
        const result = await execSSH(
            `cd ${REMOTE_PATH} && pm2 logs castbot-pm --lines 50 --nostream`,
            'Getting pm2 logs (last 50 lines)',
            'risk-low'
        );
        
        if (result.stdout) {
            console.log('\n📋 Recent Logs:');
            console.log('═'.repeat(80));
            console.log(result.stdout);
            console.log('═'.repeat(80));
        }
    } catch (error) {
        log(`Failed to fetch logs: ${error.message}`, 'error');
        log('', 'info');
        log('🔧 Manual alternative:', 'info');
        log(`ssh -i "${SSH_KEY_PATH}" ${SSH_TARGET} "pm2 logs castbot-pm"`, 'info');
    }
}

async function showStatus() {
    log('📈 Checking remote status...', 'info');
    
    try {
        const result = await execSSH(
            'pm2 list && echo "---" && uptime && echo "---" && df -h /opt/bitnami/projects/castbot',
            'Getting server status',
            'risk-low'
        );
        
        console.log('\n📊 Server Status:');
        console.log('═'.repeat(80));
        console.log(result.stdout);
        console.log('═'.repeat(80));
    } catch (error) {
        log(`Failed to get status: ${error.message}`, 'error');
        log('', 'info');
        log('🔧 Manual alternative:', 'info');
        log(`ssh -i "${SSH_KEY_PATH}" ${SSH_TARGET} "pm2 list"`, 'info');
    }
}

async function showHelp() {
    log('=== CastBot WSL-Native Remote Deployment Help ===', 'info');
    log('', 'info');
    log('🟢 SAFE Commands (No risk to production):', 'success');
    log('  npm run deploy-remote-wsl-dry     # Preview changes (SAFE)', 'success');
    log('  npm run status-remote-wsl         # Check server status', 'success');
    log('  npm run logs-remote-wsl           # View recent logs', 'success');
    log('', 'info');
    log('🟡 MEDIUM Risk Commands:', 'warning');
    log('  npm run deploy-commands-wsl       # Deploy commands only', 'warning');
    log('', 'info');
    log('🔴 HIGH Risk Commands (Full deployment):', 'error');
    log('  npm run deploy-remote-wsl         # Full deployment', 'error');
    log('', 'info');
    log('📋 Configuration:', 'info');
    log(`  Host: ${REMOTE_HOST}`, 'debug');
    log(`  User: ${REMOTE_USER}`, 'debug');
    log(`  Path: ${REMOTE_PATH}`, 'debug');
    log(`  SSH Key: ${SSH_KEY_PATH}`, 'debug');
    log(`  Environment: WSL (${process.env.WSL_DISTRO_NAME || 'Unknown'})`, 'debug');
}

async function main() {
    try {
        log('=== CastBot WSL-Native Remote Deployment ===', 'info');
        
        // Check for help flag
        if (args.includes('--help') || args.includes('-h')) {
            await showHelp();
            return;
        }
        
        // Validate SSH key exists
        if (!fs.existsSync(SSH_KEY_PATH)) {
            log(`❌ SSH key not found at: ${SSH_KEY_PATH}`, 'error');
            log('🔧 Copy key from project: cp castbot-key.pem ~/.ssh/ && chmod 600 ~/.ssh/castbot-key.pem', 'info');
            process.exit(1);
        }
        
        // Check for special commands
        if (args.includes('--logs')) {
            await showLogs();
            return;
        }
        
        if (args.includes('--status')) {
            await showStatus();
            return;
        }
        
        if (DRY_RUN) {
            log('🔍 DRY RUN MODE - No commands will be executed', 'warning');
            log('', 'info');
        }
        
        if (COMMANDS_ONLY) {
            log('⚡ COMMANDS ONLY MODE - Only deploying Discord commands', 'info');
            log('', 'info');
        }
        
        await deployToProduction();
        
    } catch (error) {
        log(`❌ Remote deployment failed: ${error.message}`, 'error');
        process.exit(1);
    }
}

// Handle script termination gracefully
process.on('SIGINT', () => {
    log('⚠️  Deployment interrupted by user', 'warning');
    process.exit(1);
});

// Run the main function
main();