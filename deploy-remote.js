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

// Handle SSH key path for different environments (PowerShell vs WSL/Bash)
let SSH_KEY_PATH = process.env.SSH_KEY_PATH;
if (!SSH_KEY_PATH) {
    // Default fallback
    SSH_KEY_PATH = `${process.env.HOME}/.ssh/id_rsa`;
} else if (SSH_KEY_PATH.startsWith('./')) {
    // Convert relative path to absolute, handling Windows vs Unix paths
    SSH_KEY_PATH = path.resolve(SSH_KEY_PATH);
    
    // On Windows, ensure we use backslashes for SSH commands
    if (process.platform === 'win32' && !process.env.WSL_DISTRO_NAME) {
        SSH_KEY_PATH = SSH_KEY_PATH.replace(/\//g, '\\');
    }
}

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
        'header': '🚀'
    }[level] || '  ';
    
    console.log(`${prefix} ${message}`);
}

function logSection(title) {
    console.log('');
    console.log(`${'='.repeat(50)}`);
    log(title, 'header');
    console.log(`${'='.repeat(50)}`);
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
        
        // Use PowerShell on Windows, bash on Linux/Mac
        // This avoids path translation issues between Windows and WSL
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'powershell.exe' : 'bash';
        const shellFlag = isWindows ? '-Command' : '-c';
        
        const child = spawn(shell, [shellFlag, command], {
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

// New function for direct SSH execution without shell interpretation
function execSSH(keyPath, host, remoteCommand, description = '') {
    return new Promise((resolve, reject) => {
        if (description) {
            log(`${description}`, 'exec');
        }
        
        if (DRY_RUN) {
            log(`[DRY RUN] Would execute SSH: ssh -i ${keyPath} ${host} "${remoteCommand}"`, 'debug');
            resolve({ stdout: '[DRY RUN]', stderr: '', code: 0 });
            return;
        }
        
        if (VERBOSE) {
            log(`Executing SSH: ssh -i ${keyPath} ${host} "${remoteCommand}"`, 'debug');
        }
        
        // Use direct spawn - no shell interpretation, no path mangling
        const child = spawn('ssh', [
            '-i', keyPath,
            host,
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
            'C:/Users/extre/.ssh/castbot-key.pem',
            'bitnami@13.238.148.170',
            'echo "SSH connection successful"',
            'Testing SSH connection'
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
        log('1. Ensure SSH key exists: C:/Users/extre/.ssh/castbot-key.pem', 'info');
        log('2. Test manual connection: ssh -i "C:/Users/extre/.ssh/castbot-key.pem" bitnami@13.238.148.170 "echo test"', 'info');
        return false;
    }
}

async function deployToProduction() {
    logSection('Starting Production Deployment');
    log(`Target: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}`, 'debug');
    
    try {
        // Step 1: Check SSH connection
        logSection('Step 1: Connection Test');
        const sshConnected = await checkSSHConnection();
        if (!sshConnected) {
            throw new Error('Cannot establish SSH connection');
        }
        
        if (!COMMANDS_ONLY) {
            // Step 2: Stop the bot
            logSection('Step 2: Stop Service');
            await execSSH(
                'C:/Users/extre/.ssh/castbot-key.pem',
                'bitnami@13.238.148.170',
                'cd /opt/bitnami/projects/castbot && pm2 stop castbot-pm',
                'Stopping pm2 process'
            );
            
            // Step 3: Backup current version
            logSection('Step 3: Create Backup');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            await execSSH(
                'C:/Users/extre/.ssh/castbot-key.pem',
                'bitnami@13.238.148.170',
                `cd /opt/bitnami/projects/castbot && rsync -av --exclude='node_modules' --exclude='.git' . ../castbot-backup-${timestamp}/`,
                'Backing up current version (excluding node_modules)'
            );
            
            // Step 4: Pull latest code
            logSection('Step 4: Update Code');
            await execSSH(
                'C:/Users/extre/.ssh/castbot-key.pem',
                'bitnami@13.238.148.170',
                'cd /opt/bitnami/projects/castbot && git pull',
                'Git pull'
            );
            
            // Step 5: Install dependencies
            logSection('Step 5: Install Dependencies');
            await execSSH(
                'C:/Users/extre/.ssh/castbot-key.pem',
                'bitnami@13.238.148.170',
                'cd /opt/bitnami/projects/castbot && npm install',
                'npm install'
            );
        }
        
        // Step 6: Deploy commands
        logSection('Step 6: Deploy Discord Commands');
        await execSSH(
            'C:/Users/extre/.ssh/castbot-key.pem',
            'bitnami@13.238.148.170',
            'cd /opt/bitnami/projects/castbot && npm run deploy-commands',
            'Deploying commands'
        );
        
        if (!COMMANDS_ONLY) {
            // Step 7: Restart the bot
            logSection('Step 7: Restart Service');
            await execSSH(
                'C:/Users/extre/.ssh/castbot-key.pem',
                'bitnami@13.238.148.170',
                'cd /opt/bitnami/projects/castbot && pm2 restart castbot-pm',
                'Restarting pm2 process'
            );
            
            // Step 8: Verify service is running
            logSection('Step 8: Verify Status');
            const status = await execSSH(
                'C:/Users/extre/.ssh/castbot-key.pem',
                'bitnami@13.238.148.170',
                'pm2 list | grep castbot-pm',
                'Checking pm2 status'
            );
            
            if (status.stdout.includes('online')) {
                log('CastBot is running successfully', 'success');
            } else {
                log('Warning: CastBot may not be running properly', 'warning');
                log('Check logs with: npm run logs-remote', 'info');
            }
        }
        
        logSection('Deployment Complete');
        log('Deployment completed successfully!', 'success');
        
        if (!COMMANDS_ONLY) {
            log('Discord commands may take up to 1 hour to propagate globally', 'info');
            log('Monitor logs: npm run logs-remote', 'info');
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
        // Use direct SSH spawn - no shell interpretation, no path mangling
        // Forward slashes work perfectly with direct SSH calls on Windows
        const result = await execSSH(
            'C:/Users/extre/.ssh/castbot-key.pem',
            'bitnami@13.238.148.170',
            'cd /opt/bitnami/projects/castbot && pm2 logs castbot-pm --lines 50 --nostream',
            'Getting pm2 logs (last 50 lines)'
        );
        
        // Display the output
        if (result.stdout) {
            console.log(result.stdout);
        }
    } catch (error) {
        log(`Failed to fetch logs: ${error.message}`, 'error');
        log('', 'info');
        log('Manual alternative:', 'yellow');
        log('ssh -i "C:/Users/extre/.ssh/castbot-key.pem" bitnami@13.238.148.170 "pm2 logs castbot-pm"', 'info');
    }
}

async function showStatus() {
    log('Checking remote status...', 'info');
    
    try {
        const result = await execSSH(
            'C:/Users/extre/.ssh/castbot-key.pem',
            'bitnami@13.238.148.170',
            'pm2 list && echo "---" && uptime && echo "---" && df -h /opt/bitnami/projects/castbot',
            'Getting server status'
        );
        
        console.log(result.stdout);
    } catch (error) {
        log(`Failed to get status: ${error.message}`, 'error');
        log('', 'info');
        log('Manual alternative:', 'yellow');
        log('ssh -i "C:/Users/extre/.ssh/castbot-key.pem" bitnami@13.238.148.170 "pm2 list"', 'info');
    }
}

async function showHelp() {
    log('=== CastBot Remote Deployment Help ===', 'info');
    log('', 'info');
    log('Available commands:', 'info');
    log('  npm run deploy-remote-dry-run       # Preview changes (SAFE)', 'success');
    log('  npm run status-remote               # Check server status', 'info');
    log('  npm run logs-remote                 # View recent logs', 'info');
    log('  npm run deploy-commands-remote      # Deploy commands only', 'warning');
    log('  npm run deploy-remote               # Full deployment', 'error');
    log('', 'info');
    log('Direct usage:', 'info');
    log('  node deploy-remote.js --dry-run     # Preview changes', 'success');
    log('  node deploy-remote.js --status      # Check status', 'info');
    log('  node deploy-remote.js --logs        # View logs', 'info');
    log('  node deploy-remote.js --commands-only  # Commands only', 'warning');
    log('  node deploy-remote.js               # Full deployment', 'error');
    log('', 'info');
    log('Configuration:', 'info');
    log(`  Host: ${REMOTE_HOST}`, 'debug');
    log(`  User: ${REMOTE_USER}`, 'debug');
    log(`  Path: ${REMOTE_PATH}`, 'debug');
    log(`  SSH Key: ${SSH_KEY_PATH}`, 'debug');
    log(`  Platform: ${process.platform}${process.env.WSL_DISTRO_NAME ? ' (WSL)' : ''}`, 'debug');
}

async function main() {
    try {
        log('=== CastBot Remote Deployment ===', 'info');
        
        // Check for help flag
        if (args.includes('--help') || args.includes('-h')) {
            await showHelp();
            return;
        }
        
        // For logs and status commands, skip configuration validation
        // since they only use SSH alias
        if (!args.includes('--logs') && !args.includes('--status')) {
            // Validate configuration for deployment operations
            if (REMOTE_HOST === 'your-lightsail-ip') {
                log('Please set LIGHTSAIL_HOST environment variable to your server IP', 'error');
                log('Run with --help for more information', 'info');
                process.exit(1);
            }
            
            if (!fs.existsSync(SSH_KEY_PATH)) {
                log(`SSH key not found at: ${SSH_KEY_PATH}`, 'error');
                log('Please set SSH_KEY_PATH environment variable or place key at ~/.ssh/id_rsa', 'error');
                log('Run with --help for more information', 'info');
                process.exit(1);
            }
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