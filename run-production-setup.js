#!/usr/bin/env node

// Script to run production setup commands remotely
import { execSync } from 'child_process';

const remote = {
  user: 'bitnami',
  host: '13.238.148.170',
  path: '/opt/bitnami/projects/castbot'
};

const commands = [
  'echo "📊 Checking current live logging status..."',
  'node toggle-live-logging.js',
  'echo ""',
  'echo "🟢 Enabling live Discord logging..."',
  'node toggle-live-logging.js enable',
  'echo ""',
  'echo "🚫 Adding user to exclusion list for production..."',
  'node toggle-live-logging.js exclude 391415444084490240',
  'echo ""',
  'echo "📊 Final configuration:"',
  'node toggle-live-logging.js',
  'echo ""',
  'echo "✅ Production logging configured!"'
];

const fullCommand = commands.join(' && ');

try {
  console.log('🔧 Setting up Live Discord Logging in Production...\n');
  
  const result = execSync(
    `ssh -o StrictHostKeyChecking=no ${remote.user}@${remote.host} "cd ${remote.path} && ${fullCommand}"`,
    { 
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30000
    }
  );
  
  console.log(result);
  console.log('\n✅ Production setup completed successfully!');
  console.log('📍 Logs will flow to: https://discord.com/channels/1331657596087566398/1385059476243218552');
  
} catch (error) {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
}