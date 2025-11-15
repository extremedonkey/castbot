/**
 * Tips Gallery Image Uploader
 *
 * Uploads all tip images to Discord CDN storage channel ONCE at bot startup,
 * then caches the URLs for reuse across all guilds and users.
 *
 * Pattern: Follows Safari Map Explorer's proven working approach
 * - Upload images to Discord storage channel via AttachmentBuilder
 * - Get Discord CDN URLs back
 * - Cache URLs in memory for instant access
 * - Never create storage channels in user guilds (only dev guild)
 */

import { AttachmentBuilder } from 'discord.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Screenshot metadata (order matches filenames 1-10)
export const TIP_SCREENSHOTS = [
  { title: '🦁 Safari System', description: 'Create adventure challenges with maps, items, and player progression' },
  { title: '📋 Dynamic Castlists', description: 'Organize cast members with placements, alumni, and custom formatting' },
  { title: '📊 Production Menu', description: 'Comprehensive admin interface for managing all CastBot features' },
  { title: '🏆 Cast Rankings', description: 'Let players anonymously vote on applicants with visual ranking interface' },
  { title: '🎬 Season Management', description: 'Configure applications, questions, and production workflows' },
  { title: '📱 Mobile View', description: 'CastBot works seamlessly on mobile devices with responsive design' },
  { title: '🎮 Player Menu', description: 'Access your profile, seasons, and interactive features from one place' },
  { title: '🗺️ Safari Map Explorer', description: 'Interactive map system with fog of war and location tracking' },
  { title: '📝 Application Builder', description: 'Create custom season applications with multiple question types' },
  { title: '⚙️ Settings & Configuration', description: 'Fine-tune CastBot behavior for your server needs' }
];

// In-memory cache for Discord CDN URLs (indexed 0-9 for images 1.png-10.png)
let cachedTipUrls = null;

/**
 * Upload tip images to Discord storage channel ONLY if changed (hybrid approach)
 * Compares file timestamps vs existing Discord messages to avoid unnecessary uploads
 * @param {Client} client - Discord.js client
 * @param {string} devGuildId - Your development guild ID
 * @param {string} tipsChannelId - Tips storage channel ID (1439277270400503870)
 * @returns {Promise<string[]>} Array of Discord CDN URLs (indexed 0-9)
 */
export async function uploadTipsIfChanged(client, devGuildId, tipsChannelId) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    console.log('🔄 Checking if tip images need uploading...');

    // Get dev guild and tips channel
    const guild = await client.guilds.fetch(devGuildId);
    const tipsChannel = await guild.channels.fetch(tipsChannelId);

    // Fetch existing messages (last 15 to be safe)
    const messages = await tipsChannel.messages.fetch({ limit: 15 });
    console.log(`📋 Found ${messages.size} existing messages in Tips channel`);

    // Check each of 10 tip images
    const basePath = path.join(__dirname, 'img/tips');
    const cdnUrls = [];

    for (let i = 1; i <= 10; i++) {
      const filePath = path.join(basePath, `${i}.png`);
      const fileStats = await fs.stat(filePath);
      const fileTimestamp = fileStats.mtimeMs;

      // Find existing message for this image (look for "Tip i/10" in content)
      const existingMsg = messages.find(m => m.content.includes(`Tip ${i}/10`));

      if (!existingMsg || existingMsg.createdTimestamp < fileTimestamp) {
        console.log(`📤 Uploading ${i}.png (file modified or missing)...`);

        // Upload new image using proven Safari pattern
        const { AttachmentBuilder } = await import('discord.js');
        const attachment = new AttachmentBuilder(filePath, { name: `tip_${i}.png` });

        const uploadMsg = await tipsChannel.send({
          content: `Tip ${i}/10 - ${TIP_SCREENSHOTS[i-1].title}`,
          files: [attachment]
        });

        const cdnUrl = uploadMsg.attachments.first().url;
        cdnUrls.push(cdnUrl);

        console.log(`   ✅ Uploaded: ${cdnUrl.substring(0, 80)}...`);

        // Delete old message if exists
        if (existingMsg) {
          await existingMsg.delete();
          console.log(`   🗑️ Deleted old message`);
        }
      } else {
        // Use cached CDN URL from existing message
        const cachedUrl = existingMsg.attachments.first().url;
        cdnUrls.push(cachedUrl);
        console.log(`✅ Using cached ${i}.png from Discord CDN`);
      }
    }

    console.log(`🎉 All ${cdnUrls.length} tip images ready (Discord CDN URLs)`);
    return cdnUrls;

  } catch (error) {
    console.error('❌ Failed to upload/check tip images:', error);
    throw error;
  }
}

/**
 * LEGACY: Upload all tip images to Discord storage channel and cache URLs
 * @param {Client} client - Discord.js client
 * @param {string} devGuildId - Your development guild ID (where storage channel will be created)
 * @returns {Promise<string[]>} Array of Discord CDN URLs (indexed 0-9)
 */
export async function uploadTipImages(client, devGuildId) {
  try {
    console.log('📤 Starting tip images upload to Discord CDN...');

    // Get dev guild
    const guild = await client.guilds.fetch(devGuildId);
    if (!guild) {
      throw new Error(`Could not fetch dev guild ${devGuildId}`);
    }

    // Find or create storage channel (hidden from users)
    let storageChannel = guild.channels.cache.find(ch => ch.name === 'tips-storage' && ch.type === 0);

    if (!storageChannel) {
      console.log('📁 Creating tips-storage channel...');
      storageChannel = await guild.channels.create({
        name: 'tips-storage',
        type: 0, // Text channel
        topic: 'Storage for tips gallery images - do not delete',
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: ['ViewChannel', 'SendMessages']
          }
        ]
      });
      console.log(`✅ Created storage channel: ${storageChannel.name} (${storageChannel.id})`);
    } else {
      console.log(`✅ Using existing storage channel: ${storageChannel.name} (${storageChannel.id})`);
    }

    // Upload all 10 images
    const cdnUrls = [];
    const basePath = path.join(__dirname, 'img/tips');

    for (let i = 1; i <= 10; i++) {
      const filePath = path.join(basePath, `${i}.png`);
      const filename = `tip_${i}.png`;

      console.log(`📤 Uploading ${i}.png...`);

      // Create attachment and send to storage channel
      const attachment = new AttachmentBuilder(filePath, { name: filename });
      const message = await storageChannel.send({
        content: `Tip image ${i}/10 - ${TIP_SCREENSHOTS[i-1].title}`,
        files: [attachment]
      });

      // Get Discord CDN URL
      const cdnUrl = message.attachments.first().url;
      cdnUrls.push(cdnUrl);

      console.log(`   ✅ ${i}.png → ${cdnUrl.substring(0, 80)}...`);
    }

    // Cache URLs in memory
    cachedTipUrls = cdnUrls;

    console.log(`🎉 Successfully uploaded ${cdnUrls.length} tip images to Discord CDN!`);
    console.log('💾 URLs cached in memory for instant access');

    return cdnUrls;

  } catch (error) {
    console.error('❌ Failed to upload tip images:', error);
    throw error;
  }
}

/**
 * Get cached tip image URLs (uploads if not cached)
 * @param {Client} client - Discord.js client
 * @param {string} devGuildId - Your development guild ID
 * @returns {Promise<string[]>} Array of Discord CDN URLs (indexed 0-9)
 */
export async function getTipImageUrls(client, devGuildId) {
  if (cachedTipUrls && cachedTipUrls.length === 10) {
    console.log('✅ Using cached tip image URLs (instant)');
    return cachedTipUrls;
  }

  console.log('⚠️ Tip image URLs not cached, uploading now...');
  return await uploadTipImages(client, devGuildId);
}

/**
 * Check if tip images are already cached
 * @returns {boolean}
 */
export function areTipImagesCached() {
  return cachedTipUrls !== null && cachedTipUrls.length === 10;
}

/**
 * Clear cache (for debugging/testing)
 */
export function clearTipImageCache() {
  console.log('🗑️ Clearing tip image URL cache');
  cachedTipUrls = null;
}
