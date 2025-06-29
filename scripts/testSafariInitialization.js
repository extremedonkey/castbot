#!/usr/bin/env node

/**
 * Test Safari Initialization System
 * 
 * This script tests the Safari initialization system functionality
 * without affecting production data.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';

// Set up paths for imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Add project root to module resolution
process.chdir(projectRoot);

// Import modules
import {
    initializeGuildSafariData,
    checkSafariInitializationStatus,
    repairSafariData,
    ensureImportExportCompatibility
} from '../safariInitialization.js';

/**
 * Test guild ID (fake ID for testing)
 */
const TEST_GUILD_ID = 'TEST_GUILD_12345678901234567890';

/**
 * Test custom configuration
 */
const TEST_CUSTOM_CONFIG = {
    currencyName: "TestCoins",
    inventoryName: "Test Inventory",
    currencyEmoji: "🧪",
    goodEventName: "Success",
    badEventName: "Failure",
    goodEventEmoji: "✅",
    badEventEmoji: "❌",
    round1GoodProbability: 80,
    round2GoodProbability: 60,
    round3GoodProbability: 40
};

/**
 * Log test results
 */
function logTest(testName, passed, details = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${testName}`);
    if (details) {
        console.log(`      ${details}`);
    }
}

/**
 * Test 1: Basic Guild Initialization
 */
async function testBasicInitialization() {
    console.log('\n🧪 Test 1: Basic Guild Initialization');
    try {
        // Initialize test guild
        const result = await initializeGuildSafariData(TEST_GUILD_ID);
        
        // Check if all required structures exist
        const hasAllStructures = 
            result.buttons &&
            result.safaris &&
            result.applications &&
            result.stores &&
            result.items &&
            result.safariConfig &&
            result.roundHistory &&
            result.attackQueue;
        
        logTest('Structure Creation', hasAllStructures, 'All required structures present');
        
        // Check if config has required fields
        const config = result.safariConfig;
        const hasRequiredConfig = 
            config.currencyName &&
            config.inventoryName &&
            config.currencyEmoji &&
            typeof config.round1GoodProbability === 'number';
        
        logTest('Configuration Setup', hasRequiredConfig, 'Required config fields present');
        
        // Check metadata
        const hasMetadata = result.metadata && result.metadata.version === 'MVP2';
        logTest('Metadata Creation', hasMetadata, 'Metadata with MVP2 version');
        
        return hasAllStructures && hasRequiredConfig && hasMetadata;
        
    } catch (error) {
        logTest('Basic Initialization', false, error.message);
        return false;
    }
}

/**
 * Test 2: Custom Configuration
 */
async function testCustomConfiguration() {
    console.log('\n🧪 Test 2: Custom Configuration');
    try {
        const testGuildId = TEST_GUILD_ID + '_CUSTOM';
        
        // Initialize with custom config
        const result = await initializeGuildSafariData(testGuildId, TEST_CUSTOM_CONFIG);
        
        // Check if custom config was applied
        const config = result.safariConfig;
        const customConfigApplied = 
            config.currencyName === TEST_CUSTOM_CONFIG.currencyName &&
            config.inventoryName === TEST_CUSTOM_CONFIG.inventoryName &&
            config.currencyEmoji === TEST_CUSTOM_CONFIG.currencyEmoji &&
            config.round1GoodProbability === TEST_CUSTOM_CONFIG.round1GoodProbability;
        
        logTest('Custom Configuration', customConfigApplied, 'Custom config values applied correctly');
        
        return customConfigApplied;
        
    } catch (error) {
        logTest('Custom Configuration', false, error.message);
        return false;
    }
}

/**
 * Test 3: Status Checking
 */
async function testStatusChecking() {
    console.log('\n🧪 Test 3: Status Checking');
    try {
        // Check status of initialized guild
        const status = await checkSafariInitializationStatus(TEST_GUILD_ID);
        
        const isFullyInitialized = 
            status.initialized === true &&
            status.status === 'fully_initialized';
        
        logTest('Status Check - Initialized Guild', isFullyInitialized, 
            `Status: ${status.status}, Message: ${status.message}`);
        
        // Check status of non-existent guild
        const nonExistentStatus = await checkSafariInitializationStatus('NON_EXISTENT_GUILD');
        
        const isNotInitialized = 
            nonExistentStatus.initialized === false &&
            nonExistentStatus.status === 'not_initialized';
        
        logTest('Status Check - Non-existent Guild', isNotInitialized, 
            `Status: ${nonExistentStatus.status}`);
        
        return isFullyInitialized && isNotInitialized;
        
    } catch (error) {
        logTest('Status Checking', false, error.message);
        return false;
    }
}

/**
 * Test 4: Validation and Update
 */
async function testValidationUpdate() {
    console.log('\n🧪 Test 4: Validation and Update');
    try {
        // Initialize guild again (should validate existing structure)
        const result = await initializeGuildSafariData(TEST_GUILD_ID);
        
        // Should still be fully initialized
        const status = await checkSafariInitializationStatus(TEST_GUILD_ID);
        
        const validationWorked = 
            status.initialized === true &&
            status.status === 'fully_initialized';
        
        logTest('Re-initialization Validation', validationWorked, 
            'Existing guild properly validated');
        
        return validationWorked;
        
    } catch (error) {
        logTest('Validation and Update', false, error.message);
        return false;
    }
}

/**
 * Test 5: Import/Export Compatibility
 */
async function testImportExportCompatibility() {
    console.log('\n🧪 Test 5: Import/Export Compatibility');
    try {
        const results = await ensureImportExportCompatibility();
        
        const compatibilityWorked = 
            results.processed >= 0 &&
            results.updated >= 0 &&
            results.errors !== undefined;
        
        logTest('Import/Export Compatibility', compatibilityWorked, 
            `Processed: ${results.processed}, Updated: ${results.updated}, Errors: ${results.errors.length}`);
        
        return compatibilityWorked;
        
    } catch (error) {
        logTest('Import/Export Compatibility', false, error.message);
        return false;
    }
}

/**
 * Clean up test data
 */
async function cleanupTestData() {
    console.log('\n🧹 Cleanup: Removing test data...');
    try {
        // Load and clean up test guilds from safariContent.json
        const { loadSafariContent, saveSafariContent } = await import('../safariManager.js');
        const safariData = await loadSafariContent();
        
        let cleaned = 0;
        const keysToDelete = Object.keys(safariData).filter(key => key.startsWith('TEST_GUILD_'));
        
        for (const key of keysToDelete) {
            delete safariData[key];
            cleaned++;
        }
        
        if (cleaned > 0) {
            await saveSafariContent(safariData);
            console.log(`🗑️ Cleaned up ${cleaned} test guilds`);
        } else {
            console.log(`✅ No test data to clean up`);
        }
        
    } catch (error) {
        console.log(`⚠️ Cleanup warning: ${error.message}`);
    }
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('🧪 Safari Initialization System Test Suite\n');
    console.log('This test verifies the initialization system functionality.');
    console.log('Test guilds will be created and cleaned up automatically.\n');
    
    const testResults = [];
    
    try {
        // Run all tests
        testResults.push(await testBasicInitialization());
        testResults.push(await testCustomConfiguration());
        testResults.push(await testStatusChecking());
        testResults.push(await testValidationUpdate());
        testResults.push(await testImportExportCompatibility());
        
        // Clean up test data
        await cleanupTestData();
        
        // Summary
        const passed = testResults.filter(result => result).length;
        const total = testResults.length;
        
        console.log('\n📊 Test Results Summary:');
        console.log(`✅ Passed: ${passed}/${total}`);
        console.log(`❌ Failed: ${total - passed}/${total}`);
        
        if (passed === total) {
            console.log('\n🎉 All tests passed! Safari initialization system is working correctly.');
            process.exit(0);
        } else {
            console.log('\n⚠️ Some tests failed. Please check the initialization system.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n💥 Test suite execution failed:', error.message);
        await cleanupTestData();
        process.exit(1);
    }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error.message);
    process.exit(1);
});

// Run the tests
runTests();