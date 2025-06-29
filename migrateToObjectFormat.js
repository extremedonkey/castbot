#!/usr/bin/env node

/**
 * Migration Script: Convert all inventory items to object format
 * Usage: node migrateToObjectFormat.js [guildId]
 */

import { migrateInventoryToObjectFormat } from './safariManager.js';

async function runMigration() {
    const guildId = process.argv[2] || null; // Optional guild ID from command line
    
    console.log('🚀 Starting Object Format Migration...');
    if (guildId) {
        console.log(`🎯 Target Guild: ${guildId}`);
    } else {
        console.log('🌍 Target: All guilds');
    }
    
    try {
        const result = await migrateInventoryToObjectFormat(guildId);
        
        if (result.success) {
            console.log('\n✅ MIGRATION SUCCESSFUL!');
            console.log(`📊 Summary:`);
            console.log(`   • Items migrated: ${result.migratedItems}`);
            console.log(`   • Players affected: ${result.migratedPlayers}`);
            console.log(`   • Guilds processed: ${result.guildsProcessed}`);
            console.log(`   • Backup file: ${result.backupFile}`);
            console.log('\n🎉 All inventory items now use object format!');
            process.exit(0);
        } else {
            console.error('\n❌ MIGRATION FAILED!');
            console.error(`Error: ${result.error}`);
            process.exit(1);
        }
    } catch (error) {
        console.error('\n💥 MIGRATION CRASHED!');
        console.error(`Error: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        process.exit(1);
    }
}

runMigration();