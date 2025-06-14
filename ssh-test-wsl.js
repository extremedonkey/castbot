#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Simple SSH Connectivity Test for WSL
 * 
 * Basic test to verify SSH connection works before running deployment scripts.
 */

const SSH_KEY_PATH = path.join(os.homedir(), '.ssh', 'castbot-key.pem');
const SSH_TARGET = 'bitnami@13.238.148.170';

function log(message, level = 'info') {
    const prefix = {
        'info': '  ',
        'success': '✅',
        'error': '❌',
        'warning': '⚠️ ',
        'debug': '  → '
    }[level] || '  ';
    
    console.log(`${prefix} ${message}`);
}

function execSSH(remoteCommand, description = '') {
    return new Promise((resolve, reject) => {
        if (description) {
            log(description, 'info');
        }
        
        const child = spawn('ssh', [
            '-i', SSH_KEY_PATH,
            '-o', 'ConnectTimeout=10',
            SSH_TARGET,
            remoteCommand
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr, code });
            } else {
                reject(new Error(`SSH failed (code ${code}): ${stderr || stdout}`));
            }
        });
        
        child.on('error', (error) => {
            reject(error);
        });
    });
}

async function runTests() {
    log('=== SSH Connectivity Test for WSL ===', 'info');
    log('', 'info');
    
    // Check SSH key exists
    log('Checking SSH key...', 'info');
    if (!fs.existsSync(SSH_KEY_PATH)) {
        log(`❌ SSH key not found: ${SSH_KEY_PATH}`, 'error');
        log('Copy key: cp castbot-key.pem ~/.ssh/ && chmod 600 ~/.ssh/castbot-key.pem', 'info');
        process.exit(1);
    }
    
    // Check key permissions
    const stats = fs.statSync(SSH_KEY_PATH);
    const mode = (stats.mode & parseInt('777', 8)).toString(8);
    if (mode !== '600') {
        log(`⚠️  SSH key permissions: ${mode} (should be 600)`, 'warning');
        log('Fix with: chmod 600 ~/.ssh/castbot-key.pem', 'info');
    } else {
        log('✅ SSH key permissions OK (600)', 'success');
    }
    
    // Test basic connection
    try {
        log('Testing SSH connection...', 'info');
        const result = await execSSH('echo "Connection test successful"');
        
        if (result.stdout.includes('Connection test successful')) {
            log('✅ SSH connection working', 'success');
        } else {
            log('⚠️  Unexpected SSH response', 'warning');
            console.log('Response:', result.stdout);
        }
    } catch (error) {
        log(`❌ SSH connection failed: ${error.message}`, 'error');
        log('', 'info');
        log('Troubleshooting:', 'info');
        log('1. Verify key location: ls -la ~/.ssh/castbot-key.pem', 'info');
        log('2. Test manually: ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170 "echo test"', 'info');
        log('3. Check server is accessible: ping 13.238.148.170', 'info');
        process.exit(1);
    }
    
    // Test server info
    try {
        log('Getting server info...', 'info');
        const result = await execSSH('hostname && whoami && pwd');
        log('✅ Server details:', 'success');
        console.log(result.stdout.trim());
    } catch (error) {
        log(`⚠️  Could not get server info: ${error.message}`, 'warning');
    }
    
    // Test CastBot directory
    try {
        log('Checking CastBot directory...', 'info');
        const result = await execSSH('ls -la /opt/bitnami/projects/castbot/app.js');
        log('✅ CastBot directory accessible', 'success');
    } catch (error) {
        log(`❌ CastBot directory issue: ${error.message}`, 'error');
        process.exit(1);
    }
    
    // Test pm2 status
    try {
        log('Checking pm2 status...', 'info');
        const result = await execSSH('pm2 list | grep castbot-pm || echo "castbot-pm not found"');
        if (result.stdout.includes('castbot-pm')) {
            log('✅ CastBot pm2 process found', 'success');
            console.log(result.stdout.trim());
        } else {
            log('⚠️  CastBot pm2 process not found', 'warning');
        }
    } catch (error) {
        log(`⚠️  Could not check pm2: ${error.message}`, 'warning');
    }
    
    log('', 'info');
    log('=== SSH Test Complete ===', 'success');
    log('✅ Ready for deployment scripts!', 'success');
}

runTests().catch(error => {
    log(`Test failed: ${error.message}`, 'error');
    process.exit(1);
});