import 'dotenv/config';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Remote Deployment Helper for AWS Lightsail
 * 
 * Automates deployment to production server via SSH.
 * Handles git pull, dependency installation, command deployment, and service restart.
 * 
 * Usage:
 *   npm run deploy-remote        - Full production deployment
 *   node deploy-remote.js        - Same as above
 *   node deploy-remote.js --dry-run    - Show what would be executed
 *   node deploy-remote.js --commands-only    - Only deploy commands (no code update)
 */

// Configuration from environment or defaults
const REMOTE_HOST = process.env.LIGHTSAIL_HOST || 'your-lightsail-ip';
const REMOTE_USER = process.env.LIGHTSAIL_USER || 'ubuntu';
const REMOTE_PATH = process.env.LIGHTSAIL_PATH || '/opt/bitnami/castbot';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || `${process.env.HOME}/.ssh/id_rsa`;

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const COMMANDS_ONLY = args.includes('--commands-only');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

function log(message, level = 'info') {
    const prefix = {
        'info': '📋',
        'success': '✅',
        'error': '❌',
        'warning': '⚠️',
        'debug': '🔍',
        'exec': '🚀'
    }[level] || '📋';
    
    console.log(`${prefix} ${message}`);
}

function execCommand(command, description = '') {
    return new Promise((resolve, reject) => {
        if (description) {
            log(`${description}`, 'exec');
        }
        
        if (DRY_RUN) {
            log(`[DRY RUN] Would execute: ${command}`, 'debug');
            resolve({ stdout: '[DRY RUN]', stderr: '', code: 0 });
            return;
        }
        
        if (VERBOSE) {
            log(`Executing: ${command}`, 'debug');
        }
        
        const child = spawn('bash', ['-c', command], {
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
                reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
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
        const result = await execCommand(
            `ssh -i "${SSH_KEY_PATH}" -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} "echo 'SSH connection successful'"`,
            'Testing SSH connection'
        );
        
        if (result.stdout.includes('SSH connection successful')) {
            log('SSH connection verified', 'success');
            return true;
        } else {
            throw new Error('SSH connection test failed');
        }
    } catch (error) {
        log(`SSH connection failed: ${error.message}`, 'error');
        log('', 'info');
        log('SSH Connection Setup Instructions:', 'info');
        log('1. Ensure you have your Lightsail SSH key saved locally', 'info');
        log('2. Set SSH_KEY_PATH environment variable or place key at ~/.ssh/id_rsa', 'info');
        log(`3. Set LIGHTSAIL_HOST environment variable to your server IP`, 'info');
        log('4. Test manual connection: ssh -i "path/to/key.pem" ubuntu@your-ip', 'info');
        return false;
    }
}

async function deployToProduction() {
    log('🚀 Starting production deployment...', 'info');
    log(`Remote: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}`, 'debug');
    log('', 'info');
    
    try {
        // Step 1: Check SSH connection
        const sshConnected = await checkSSHConnection();
        if (!sshConnected) {
            throw new Error('Cannot establish SSH connection');
        }
        
        if (!COMMANDS_ONLY) {
            // Step 2: Stop the bot
            log('Stopping CastBot service...', 'info');
            await execCommand(
                `ssh -i "${SSH_KEY_PATH}" ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_PATH} && pm2 stop castbot-pm"`,
                'Stopping pm2 process'
            );
            
            // Step 3: Backup current version
            log('Creating backup...', 'info');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            await execCommand(
                `ssh -i "${SSH_KEY_PATH}" ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_PATH} && cp -r . ../castbot-backup-${timestamp}"`,
                'Backing up current version'
            );
            
            // Step 4: Pull latest code
            log('Pulling latest code from git...', 'info');
            await execCommand(
                `ssh -i "${SSH_KEY_PATH}" ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_PATH} && git pull"`,
                'Git pull'
            );
            
            // Step 5: Install dependencies
            log('Installing dependencies...', 'info');
            await execCommand(
                `ssh -i "${SSH_KEY_PATH}" ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_PATH} && npm install"`,
                'npm install'
            );
        }
        
        // Step 6: Deploy commands
        log('Deploying Discord commands...', 'info');
        await execCommand(
            `ssh -i "${SSH_KEY_PATH}" ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_PATH} && npm run deploy-commands"`,
            'Deploying commands'
        );
        
        if (!COMMANDS_ONLY) {
            // Step 7: Restart the bot
            log('Restarting CastBot service...', 'info');
            await execCommand(
                `ssh -i "${SSH_KEY_PATH}" ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_PATH} && pm2 restart castbot-pm"`,
                'Restarting pm2 process'
            );
            
            // Step 8: Verify service is running
            log('Verifying service status...', 'info');
            const status = await execCommand(
                `ssh -i "${SSH_KEY_PATH}" ${REMOTE_USER}@${REMOTE_HOST} "pm2 list | grep castbot-pm"`,
                'Checking pm2 status'
            );
            
            if (status.stdout.includes('online')) {
                log('CastBot is running successfully', 'success');
            } else {
                log('Warning: CastBot may not be running properly', 'warning');
                log('Check logs with: npm run logs-remote', 'info');
            }
        }
        
        log('', 'info');
        log('🎉 Deployment completed successfully!', 'success');
        
        if (!COMMANDS_ONLY) {
            log('📝 Discord commands may take up to 1 hour to propagate globally', 'info');
            log('💡 Monitor logs: npm run logs-remote', 'info');
        }
        
    } catch (error) {
        log(`Deployment failed: ${error.message}`, 'error');
        log('', 'info');
        log('Troubleshooting steps:', 'info');
        log('1. Check SSH connection: ssh -i "key.pem" ubuntu@your-ip', 'info');
        log('2. Verify server has disk space: df -h', 'info');
        log('3. Check bot logs: pm2 logs castbot-pm', 'info');
        log('4. Restart if needed: pm2 restart castbot-pm', 'info');
        
        throw error;
    }
}

async function showLogs() {
    log('Fetching remote logs...', 'info');
    
    try {
        await execCommand(
            `ssh -i "${SSH_KEY_PATH}" ${REMOTE_USER}@${REMOTE_HOST} "pm2 logs castbot-pm --lines 50"`,
            'Getting pm2 logs'
        );
    } catch (error) {
        log(`Failed to fetch logs: ${error.message}`, 'error');
    }
}

async function showStatus() {
    log('Checking remote status...', 'info');
    
    try {
        const result = await execCommand(
            `ssh -i "${SSH_KEY_PATH}" ${REMOTE_USER}@${REMOTE_HOST} "pm2 list && echo '---' && uptime && echo '---' && df -h ${REMOTE_PATH}"`,
            'Getting server status'
        );
        
        console.log(result.stdout);
    } catch (error) {
        log(`Failed to get status: ${error.message}`, 'error');
    }
}

async function main() {
    try {
        log('=== CastBot Remote Deployment ===', 'info');
        
        // Validate configuration
        if (REMOTE_HOST === 'your-lightsail-ip') {
            log('Please set LIGHTSAIL_HOST environment variable to your server IP', 'error');
            process.exit(1);
        }
        
        if (!fs.existsSync(SSH_KEY_PATH)) {
            log(`SSH key not found at: ${SSH_KEY_PATH}`, 'error');
            log('Please set SSH_KEY_PATH environment variable or place key at ~/.ssh/id_rsa', 'error');
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
            log('DRY RUN MODE - No commands will be executed', 'warning');
            log('', 'info');
        }
        
        if (COMMANDS_ONLY) {
            log('COMMANDS ONLY MODE - Only deploying Discord commands', 'info');
            log('', 'info');
        }
        
        await deployToProduction();
        
    } catch (error) {
        log(`Remote deployment failed: ${error.message}`, 'error');
        process.exit(1);
    }
}

// Handle script termination gracefully
process.on('SIGINT', () => {
    log('Deployment interrupted by user', 'warning');
    process.exit(1);
});

// Export functions for potential use by other scripts
export { deployToProduction, checkSSHConnection, showLogs, showStatus };

// Run the main function
main();