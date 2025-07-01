#!/usr/bin/env node

/**
 * Test the new logger utility
 */

import { logger, measurePerf, loggingConfig } from './logger.js';

console.log('🧪 Testing CastBot Logger Utility');
console.log('Environment config:', loggingConfig);
console.log('---');

// Test all log levels
logger.debug('TEST', 'This is a debug message', { userId: '123', action: 'test' });
logger.info('TEST', 'This is an info message', { status: 'success' });
logger.warn('TEST', 'This is a warning message');
logger.error('TEST', 'This is an error message', new Error('Test error'));

// Test performance logging
const testOperation = async () => {
    await new Promise(resolve => setTimeout(resolve, 150)); // Simulate work
    return 'operation complete';
};

const result = await measurePerf(testOperation, 'TEST', 'simulated database operation');
console.log('Result:', result);

// Test manual performance logging
const start = Date.now();
await new Promise(resolve => setTimeout(resolve, 50));
logger.perf('TEST', 'manual timing test', Date.now() - start);

console.log('---');
console.log('✅ Logger test complete');
console.log('💡 Set NODE_ENV=production to test production logging behavior');
console.log('💡 Set FORCE_DEBUG=true in production for emergency debugging');