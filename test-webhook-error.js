#!/usr/bin/env node

/**
 * Test script to verify Unknown Webhook error handling
 * This simulates what happens when old interaction tokens are used
 */

import { DiscordRequest } from './utils.js';

async function testWebhookErrorHandling() {
    console.log('🧪 Testing webhook error handling...');
    
    try {
        // Use an obviously invalid webhook token to trigger Unknown Webhook error
        const fakeToken = 'fake_invalid_token_12345';
        const result = await DiscordRequest(`webhooks/${process.env.APP_ID}/${fakeToken}`, {
            method: 'POST',
            body: {
                content: 'Test message'
            }
        });
        
        console.log('📊 Result:', result);
        
        if (result === null) {
            console.log('✅ SUCCESS: DiscordRequest returned null for invalid webhook (graceful handling working)');
        } else {
            console.log('❌ UNEXPECTED: DiscordRequest did not return null');
        }
        
    } catch (error) {
        console.log('❌ ERROR: Exception was thrown instead of graceful handling');
        console.log('Error:', error.message);
    }
}

// Run the test
testWebhookErrorHandling();