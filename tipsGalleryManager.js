/**
 * Tips Gallery Manager - Reusable Image Gallery System
 *
 * Manages image galleries with persistent Discord CDN URLs
 * Environment-aware (dev/prod), auto-upload on missing URLs, file-based updates
 *
 * Pattern: Upload to Discord CDN on manual refresh, persist URLs in JSON
 * Future: Generalize to imageGalleryManager.js for multiple galleries
 *
 * @module tipsGalleryManager
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { AttachmentBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TIPS_JSON_PATH = path.join(__dirname, 'img/tips/tips.json');
const TIPS_IMAGE_DIR = path.join(__dirname, 'img/tips');

/**
 * Load tips configuration from tips.json
 * @returns {Promise<Object>} Tips configuration object
 */
export async function loadTipsConfig() {
  try {
    const data = await fs.readFile(TIPS_JSON_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Failed to load tips.json:', error.message);
    throw new Error(`Cannot load tips configuration: ${error.message}`);
  }
}

/**
 * Save tips configuration to tips.json
 * @param {Object} config - Tips configuration object
 * @returns {Promise<void>}
 */
export async function saveTipsConfig(config) {
  try {
    config.lastUpdated = new Date().toISOString();
    const data = JSON.stringify(config, null, 2);
    await fs.writeFile(TIPS_JSON_PATH, data, 'utf8');
    console.log('✅ Saved tips.json');
  } catch (error) {
    console.error('❌ Failed to save tips.json:', error.message);
    throw new Error(`Cannot save tips configuration: ${error.message}`);
  }
}

/**
 * Get current environment (dev or prod)
 * @returns {string} 'dev' or 'prod'
 */
export function getCurrentEnvironment() {
  const isProd = process.env.PRODUCTION === 'TRUE';
  return isProd ? 'prod' : 'dev';
}

/**
 * Get tip URLs for current environment
 * @param {Object} config - Tips configuration
 * @param {string} env - Environment ('dev' or 'prod')
 * @returns {string[]} Array of Discord CDN URLs (null if not uploaded)
 */
export function getTipUrls(config, env) {
  return config.tips.map(tip => tip.urls[env]);
}

/**
 * Get tip metadata (title, description, showcase)
 * @param {Object} config - Tips configuration
 * @param {number} index - Tip index (0-9)
 * @returns {Object} { id, title, description, showcase }
 */
export function getTipMetadata(config, index) {
  const tip = config.tips[index];
  if (!tip) {
    throw new Error(`Invalid tip index: ${index}`);
  }

  return {
    id: tip.id,
    title: tip.title,
    description: tip.description,
    showcase: tip.showcase
  };
}

/**
 * Refresh all tips - upload to Discord CDN and update JSON
 * @param {Client} client - Discord.js client
 * @param {string} env - Environment ('dev' or 'prod')
 * @returns {Promise<number>} Number of tips uploaded
 */
export async function refreshTips(client, env) {
  console.log(`🔄 Refreshing tips for ${env} environment...`);

  try {
    // Load configuration
    const config = await loadTipsConfig();
    const channelId = config.channel;

    // Get tips channel
    let tipsChannel;
    try {
      // Try to fetch channel directly first (faster)
      tipsChannel = await client.channels.fetch(channelId);
    } catch (error) {
      console.error(`❌ Failed to fetch tips channel ${channelId}:`, error.message);
      throw new Error(`Tips channel ${channelId} not found. Please verify channel ID in tips.json`);
    }

    console.log(`📁 Using tips channel: ${tipsChannel.name} (${channelId})`);

    // Upload all tips
    let uploadCount = 0;
    for (const tip of config.tips) {
      const imagePath = path.join(TIPS_IMAGE_DIR, tip.filename);

      // Check if image file exists
      try {
        await fs.access(imagePath);
      } catch (error) {
        console.error(`❌ Image file not found: ${tip.filename}`);
        continue;
      }

      console.log(`📤 Uploading ${tip.filename} (${tip.title})...`);

      // Upload to Discord
      const attachment = new AttachmentBuilder(imagePath, { name: `tip_${tip.id}.png` });
      const message = await tipsChannel.send({
        content: `Tip ${tip.id}/10 - ${tip.title} [${env.toUpperCase()}]`,
        files: [attachment]
      });

      // Get CDN URL
      const cdnUrl = message.attachments.first().url;
      tip.urls[env] = cdnUrl;
      uploadCount++;

      console.log(`   ✅ ${tip.filename} → ${cdnUrl.substring(0, 80)}...`);
    }

    // Save updated configuration
    await saveTipsConfig(config);

    console.log(`🎉 Refreshed ${uploadCount}/${config.tips.length} tips for ${env}`);
    return uploadCount;

  } catch (error) {
    console.error('❌ Failed to refresh tips:', error.message);
    throw error;
  }
}

/**
 * Ensure tips are uploaded for current environment
 * Auto-uploads silently if any URLs are missing
 * @param {Client} client - Discord.js client
 * @param {string} env - Environment ('dev' or 'prod')
 * @returns {Promise<boolean>} true if upload was needed, false if already uploaded
 */
export async function ensureTipsUploaded(client, env) {
  const config = await loadTipsConfig();
  const urls = getTipUrls(config, env);

  // Check if any URLs are missing
  const hasMissingUrls = urls.some(url => !url);

  if (hasMissingUrls) {
    console.log(`⚠️ Missing tip URLs for ${env}, auto-uploading...`);
    await refreshTips(client, env);
    return true;
  }

  console.log(`✅ All tip URLs present for ${env}`);
  return false;
}

/**
 * Get total number of tips
 * @param {Object} config - Tips configuration
 * @returns {number} Total tip count
 */
export function getTipCount(config) {
  return config.tips.length;
}

/**
 * Validate tips configuration
 * @param {Object} config - Tips configuration
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateTipsConfig(config) {
  const errors = [];

  if (!config.version) {
    errors.push('Missing version field');
  }

  if (!config.channel) {
    errors.push('Missing channel ID');
  }

  if (!config.tips || !Array.isArray(config.tips)) {
    errors.push('Missing or invalid tips array');
    return { valid: false, errors };
  }

  config.tips.forEach((tip, index) => {
    if (!tip.id) errors.push(`Tip ${index}: missing id`);
    if (!tip.filename) errors.push(`Tip ${index}: missing filename`);
    if (!tip.title) errors.push(`Tip ${index}: missing title`);
    if (!tip.urls || typeof tip.urls !== 'object') {
      errors.push(`Tip ${index}: missing or invalid urls object`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
