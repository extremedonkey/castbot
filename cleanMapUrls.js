#!/usr/bin/env node

/**
 * One-time script to clean trailing ampersands from Discord CDN URLs in safariContent.json
 * This fixes the issue where Node.js fetch() fails on URLs with trailing &
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function cleanMapUrls() {
  try {
    console.log('🧹 Starting URL cleanup in safariContent.json...\n');

    // Load safariContent.json
    const filePath = path.join(__dirname, 'safariContent.json');
    const data = await fs.readFile(filePath, 'utf8');
    const safariContent = JSON.parse(data);

    let totalCleaned = 0;
    let guildsProcessed = 0;

    // Process each guild
    for (const [guildId, guildData] of Object.entries(safariContent)) {
      if (!guildData.maps) continue;

      guildsProcessed++;
      let guildCleaned = 0;

      console.log(`📦 Processing guild ${guildId}...`);

      // Process each map in the guild
      for (const [mapId, mapData] of Object.entries(guildData.maps)) {
        if (mapId === 'active') continue; // Skip the 'active' property

        // Clean discordImageUrl if present
        if (mapData.discordImageUrl && mapData.discordImageUrl.endsWith('&')) {
          const oldUrl = mapData.discordImageUrl;
          mapData.discordImageUrl = oldUrl.trim().replace(/&+$/, '');
          console.log(`  ✅ Cleaned main map URL for ${mapId}`);
          console.log(`     Before: ...${oldUrl.slice(-20)}`);
          console.log(`     After:  ...${mapData.discordImageUrl.slice(-20)}`);
          guildCleaned++;
          totalCleaned++;
        }

        // Clean fog map URLs in coordinates
        if (mapData.coordinates) {
          for (const [coord, coordData] of Object.entries(mapData.coordinates)) {
            if (coordData.fogMapUrl && coordData.fogMapUrl.endsWith('&')) {
              const oldUrl = coordData.fogMapUrl;
              coordData.fogMapUrl = oldUrl.trim().replace(/&+$/, '');
              console.log(`  ✅ Cleaned fog map URL for ${coord}`);
              guildCleaned++;
              totalCleaned++;
            }
          }
        }
      }

      if (guildCleaned > 0) {
        console.log(`  📊 Cleaned ${guildCleaned} URLs in guild ${guildId}\n`);
      } else {
        console.log(`  ⏭️ No URLs needed cleaning in guild ${guildId}\n`);
      }
    }

    // Save the cleaned data back
    await fs.writeFile(filePath, JSON.stringify(safariContent, null, 2));

    console.log('========================================');
    console.log(`✅ URL Cleanup Complete!`);
    console.log(`📊 Total URLs cleaned: ${totalCleaned}`);
    console.log(`📦 Guilds processed: ${guildsProcessed}`);
    console.log('========================================');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanMapUrls().catch(console.error);