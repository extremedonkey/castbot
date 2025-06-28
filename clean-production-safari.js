#!/usr/bin/env node

// Script to clean up safariContent.json on production server
// Removes development guild data and keeps only production data

import fs from 'fs';
import path from 'path';

const SAFARI_CONTENT_PATH = '/opt/bitnami/projects/castbot/safariContent.json';
const DEV_GUILD_IDS = [
    '1331657596087566398', // CastBot development server
    '1385042963310055515', // Guild with dev-created buttons (Remire Village, Steal Belle's Money)
    // Add other dev guild IDs here if needed
];

async function cleanProductionSafariData() {
    console.log('🧹 Cleaning production safariContent.json...');
    
    try {
        // Check if file exists
        if (!fs.existsSync(SAFARI_CONTENT_PATH)) {
            console.log('✅ No safariContent.json found in production - nothing to clean');
            return;
        }
        
        // Read current data
        const currentData = JSON.parse(fs.readFileSync(SAFARI_CONTENT_PATH, 'utf8'));
        console.log('📊 Current data keys:', Object.keys(currentData));
        
        // Create cleaned data structure
        const cleanedData = {
            "/* Guild ID */": {
                "buttons": {},
                "safaris": {},
                "applications": {},
                "stores": {},
                "items": {},
                "safariConfig": {}
            }
        };
        
        // Keep only production guild data (remove dev guild IDs)
        let removedGuilds = [];
        let keptGuilds = [];
        
        for (const [guildId, guildData] of Object.entries(currentData)) {
            if (guildId === "/* Guild ID */") {
                // Keep the template
                continue;
            }
            
            if (DEV_GUILD_IDS.includes(guildId)) {
                removedGuilds.push(guildId);
                console.log(`🗑️  Removing dev guild data: ${guildId}`);
            } else {
                cleanedData[guildId] = guildData;
                keptGuilds.push(guildId);
                console.log(`✅ Keeping production guild data: ${guildId}`);
            }
        }
        
        // Create backup
        const backupPath = `${SAFARI_CONTENT_PATH}.backup.${Date.now()}`;
        fs.writeFileSync(backupPath, JSON.stringify(currentData, null, 2));
        console.log(`💾 Backup created: ${backupPath}`);
        
        // Write cleaned data
        fs.writeFileSync(SAFARI_CONTENT_PATH, JSON.stringify(cleanedData, null, 2));
        
        console.log('✅ Production safariContent.json cleaned successfully!');
        console.log(`📊 Summary:`);
        console.log(`   - Removed dev guilds: ${removedGuilds.length} (${removedGuilds.join(', ')})`);
        console.log(`   - Kept production guilds: ${keptGuilds.length} (${keptGuilds.join(', ')})`);
        
    } catch (error) {
        console.error('❌ Error cleaning safari data:', error);
        throw error;
    }
}

// Run if called directly
cleanProductionSafariData()
    .then(() => {
        console.log('🎉 Cleanup completed successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Cleanup failed:', error);
        process.exit(1);
    });

export { cleanProductionSafariData };