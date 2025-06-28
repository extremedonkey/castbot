// Emoji utility functions extracted from app.js
// Handles emoji creation, parsing, and cleanup operations

import { loadPlayerData, savePlayerData, getPlayer } from '../storage.js';

/**
 * Parse emoji code string to extract emoji information
 * @param {string} emojiCode - Discord emoji code like <:name:id> or <a:name:id>
 * @returns {Object|null} Parsed emoji info or null if invalid
 */
export function parseEmojiCode(emojiCode) {
    // Match both static and animated emoji patterns
    const staticMatch = emojiCode.match(/<:(\w+):(\d+)>/);
    const animatedMatch = emojiCode.match(/<a:(\w+):(\d+)>/);
    const match = staticMatch || animatedMatch;
    
    if (match) {
        return {
            name: match[1],
            id: match[2],
            animated: !!animatedMatch
        };
    }
    return null;
}

/**
 * Sanitize username for emoji naming (Discord requirements: 2-32 chars, alphanumeric + underscores only)
 * @param {string} username - Username to sanitize
 * @returns {string} Sanitized emoji name
 */
export function sanitizeEmojiName(username) {
    return username
        .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace invalid chars with underscores
        .substring(0, 32)               // Discord's 32-character limit
        .padEnd(2, '_');                // Ensure minimum 2 characters
}

/**
 * Create custom emoji for a Discord member using their avatar
 * @param {Object} member - Discord member object
 * @param {Object} guild - Discord guild object
 * @returns {Object} Result object with success status and emoji info
 */
export async function createEmojiForUser(member, guild) {
    try {
        // Create sanitized emoji name from server display name (not username)
        const displayName = member.displayName || member.user.username;
        const emojiName = sanitizeEmojiName(displayName);
        console.log(`Using emoji name: ${emojiName} (from display name: ${displayName})`);
        
        // Check both user and member avatars for animation
        const userHasAnimatedAvatar = member.user.avatar?.startsWith('a_');
        const memberHasAnimatedAvatar = member.avatar?.startsWith('a_');
        const isAnimated = userHasAnimatedAvatar || memberHasAnimatedAvatar;

        // Force GIF format for animated avatars
        const avatarOptions = {
            format: isAnimated ? 'gif' : 'png',
            size: 128,
            dynamic: true,
            forceStatic: false
        };

        // Try member avatar first, fall back to user avatar
        const avatarURL = member.avatarURL(avatarOptions) || 
                         member.user.avatarURL(avatarOptions);

        if (!avatarURL) {
            console.log(`No avatar URL found for ${member.displayName}`);
            throw new Error('No avatar URL found');
        }

        console.log(`Processing ${isAnimated ? 'animated' : 'static'} avatar for ${member.displayName}`);
        console.log('Avatar URL:', avatarURL);

        try {
            // Count existing emojis and check server emoji limits
            const emojis = await guild.emojis.fetch();
            const staticCount = emojis.filter(e => !e.animated).size;
            const animatedCount = emojis.filter(e => e.animated).size;
            
            // Calculate emoji limits based on server boost level
            // Base limits: 50 static, 50 animated
            // Level 1: +50 (100 each)
            // Level 2: +100 (150 each)
            // Level 3: +150 (200 each)
            let staticLimit = 50;
            let animatedLimit = 50;
            
            if (guild.premiumTier === 1) {
                staticLimit = 100;
                animatedLimit = 100;
            } else if (guild.premiumTier === 2) {
                staticLimit = 150;
                animatedLimit = 150; 
            } else if (guild.premiumTier === 3) {
                staticLimit = 250;
                animatedLimit = 250;
            }
            
            console.log(`Server emoji info - Guild: ${guild.name} (${guild.id})`);
            console.log(`Premium tier: ${guild.premiumTier}, Static: ${staticCount}/${staticLimit}, Animated: ${animatedCount}/${animatedLimit}`);

            // Check if we can create the requested emoji type
            if (isAnimated && animatedCount >= animatedLimit) {
                throw { code: 30008, message: `Maximum animated emoji limit reached for server (${animatedCount}/${animatedLimit})` };
            }
            if (!isAnimated && staticCount >= staticLimit) {
                throw { code: 30008, message: `Maximum static emoji limit reached for server (${staticCount}/${staticLimit})` };
            }

            // Fetch and process the avatar image
            const response = await fetch(avatarURL);
            if (!response.ok) {
                throw new Error(`Failed to fetch avatar: ${response.status} ${response.statusText}`);
            }
            
            const buffer = await response.buffer();
            console.log(`Downloaded avatar: ${buffer.length} bytes, Content-Type: ${response.headers.get('content-type')}`);

            let processedBuffer = buffer;
            let finalIsAnimated = isAnimated;

            if (isAnimated) {
                // Handle animated images
                try {
                    // Try to create animated emoji directly first
                    const emoji = await guild.emojis.create({
                        attachment: buffer,
                        name: emojiName,
                        reason: `CastBot emoji for ${member.displayName}`
                    }).catch(err => {
                        if (err.code === 30008) {
                            throw { code: 30008, message: err.message || "Maximum emoji limit reached for server" };
                        }
                        console.error(`Error creating animated emoji for ${member.displayName}: ${err.message}`);
                        throw err;
                    });

                    const emojiCode = `<a:${emojiName}:${emoji.id}>`;
                    console.log(`Created animated emoji (${buffer.length} bytes): ${emojiCode}`);

                    return {
                        success: true,
                        emoji,
                        emojiCode,
                        isAnimated: true
                    };
                } catch (directUploadError) {
                    // Re-throw if it's a limit error
                    if (directUploadError.code === 30008) {
                        console.error(`Emoji limit error: ${directUploadError.message}`);
                        throw directUploadError;
                    }
                    
                    console.log('Direct upload failed, falling back to static version:', directUploadError.message);
                    
                    // Fall back to static if we still have room in static emoji limit
                    if (staticCount >= staticLimit) {
                        throw { code: 30008, message: `Maximum emoji limit reached for server (${staticCount}/${staticLimit} static)` };
                    }
                    
                    try {
                        const sharp = (await import('sharp')).default;
                        processedBuffer = await sharp(buffer, { 
                            animated: true,  // Recognize it's an animated image
                            pages: 1        // Only take first frame
                        })
                            .resize(96, 96, { 
                                fit: 'contain',
                                withoutEnlargement: true,
                                position: 'center'
                            })
                            .png({ 
                                quality: 80, 
                                colors: 128,
                                effort: 10
                            })
                            .toBuffer()
                            .catch(err => {
                                console.error(`Sharp processing error for ${member.displayName}: ${err.message}`);
                                throw err;
                            });
                        finalIsAnimated = false;
                    } catch (sharpError) {
                        console.error(`Sharp processing error for ${member.displayName}: ${sharpError.message}`);
                        throw new Error(`Failed to process animated avatar: ${sharpError.message}`);
                    }
                }
            } else {
                // Handle static images
                try {
                    const sharp = (await import('sharp')).default;
                    processedBuffer = await sharp(buffer)
                        .resize(96, 96, { 
                            fit: 'contain',
                            withoutEnlargement: true,
                            position: 'center'
                        })
                        .png({ 
                            quality: 80, 
                            colors: 128,
                            effort: 10
                        })
                        .toBuffer()
                        .catch(err => {
                            console.error(`Sharp processing error for ${member.displayName}: ${err.message}`);
                            throw err;
                        });
                } catch (sharpError) {
                    console.error(`Sharp processing error for ${member.displayName}: ${sharpError.message}`);
                    throw new Error(`Failed to process static avatar: ${sharpError.message}`);
                }
            }

            // Create emoji with processed buffer
            const emoji = await guild.emojis.create({
                attachment: processedBuffer,
                name: emojiName,
                reason: `CastBot emoji for ${member.displayName}`
            }).catch(err => {
                if (err.code === 30008) {
                    throw { code: 30008, message: err.message || "Maximum emoji limit reached for server" };
                }
                console.error(`Error creating emoji for ${member.displayName}: ${err.message}`);
                throw err;
            });

            const emojiCode = finalIsAnimated ? 
                `<a:${emojiName}:${emoji.id}>` : 
                `<:${emojiName}:${emoji.id}>`;

            console.log(`Created ${finalIsAnimated ? 'animated' : 'static'} emoji (${processedBuffer.length} bytes): ${emojiCode}`);

            return {
                success: true,
                emoji,
                emojiCode,
                isAnimated: finalIsAnimated
            };

        } catch (emojiError) {
            const error = {
                success: false,
                code: emojiError.code || 'UNKNOWN',
                message: emojiError.message || 'Unknown error creating emoji',
                rawError: emojiError,
                memberName: member.displayName,
                avatarUrl: avatarURL
            };
            console.error(`Emoji creation error details:`, error);
            throw error;
        }
    } catch (error) {
        console.error(`Complete emoji creation failure for ${member.displayName}:`, error);
        throw error;
    }
}

/**
 * Check if a role has existing emojis generated for its members
 * @param {Object} guild - Discord guild object
 * @param {Object} role - Discord role object
 * @returns {boolean} True if role has members with emojis
 */
export async function checkRoleHasEmojis(guild, role) {
  try {
    const guildId = guild.id;
    const roleId = role.id;
    
    // Load current player data
    const data = await loadPlayerData();
    if (!data[guildId] || !data[guildId].players) {
      return false;
    }
    
    // Fetch all members to ensure we have fresh data
    await guild.members.fetch();
    
    // Get members with this role
    const targetMembers = guild.members.cache.filter(member => 
      member.roles.cache.has(roleId) && !member.user.bot
    );
    
    // Check if any members with this role have emojis
    for (const [memberId, member] of targetMembers) {
      const playerData = data[guildId].players[memberId];
      if (playerData?.emojiCode) {
        console.log(`Found existing emoji for role ${role.name}: ${member.displayName} has ${playerData.emojiCode}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error checking role emojis:', error);
    return false;
  }
}

/**
 * Clear emojis for all members with a specific role
 * @param {Object} guild - Discord guild object
 * @param {Object} role - Discord role object
 * @returns {Object} Result with deleted and error lines
 */
export async function clearEmojisForRole(guild, role) {
  const deletedLines = [];
  const errorLines = [];
  
  try {
    const guildId = guild.id;
    const roleId = role.id;
    
    // Load current player data
    const data = await loadPlayerData();
    if (!data[guildId] || !data[guildId].players) {
      return {
        deletedLines: [],
        errorLines: ['No player data found for this server']
      };
    }
    
    // Fetch all members to ensure we have fresh data
    await guild.members.fetch();
    
    // Get members with this role
    const targetMembers = guild.members.cache.filter(member => 
      member.roles.cache.has(roleId) && !member.user.bot
    );
    
    console.log(`Clearing emojis for ${targetMembers.size} members with role ${role.name} (${roleId})`);
    
    if (targetMembers.size === 0) {
      return {
        deletedLines: [],
        errorLines: ['No members found with this role']
      };
    }
    
    // Process each member with the role
    for (const [memberId, member] of targetMembers) {
      try {
        const playerData = data[guildId].players[memberId];
        
        if (playerData?.emojiCode) {
          const emojiCode = playerData.emojiCode;
          const emoji = parseEmojiCode(emojiCode);
          
          if (emoji?.id) {
            try {
              const guildEmoji = await guild.emojis.fetch(emoji.id);
              if (guildEmoji) {
                await guildEmoji.delete();
                console.log(`Deleted ${emoji.animated ? 'animated' : 'static'} emoji for ${member.displayName}`);
                deletedLines.push(`${member.displayName}: Deleted ${emoji.animated ? 'animated' : 'static'} emoji ${emojiCode}`);
              } else {
                console.log(`Emoji ${emoji.id} not found in guild for ${member.displayName}`);
                deletedLines.push(`${member.displayName}: Emoji was already removed from server`);
              }
            } catch (err) {
              console.error(`Error deleting emoji for ${member.displayName}:`, {
                error: err,
                emojiCode: emojiCode,
                emojiData: emoji
              });
              errorLines.push(`${member.displayName}: Failed to delete emoji`);
            }
          } else {
            console.log(`Invalid emoji code for ${member.displayName}: ${emojiCode}`);
            errorLines.push(`${member.displayName}: Invalid emoji code format`);
          }
          
          // Clear emoji code from player data regardless of deletion success
          data[guildId].players[memberId].emojiCode = null;
        } else {
          console.log(`No emoji found for ${member.displayName}`);
          // Don't add to error lines, just skip silently
        }
      } catch (error) {
        console.error(`Error processing member ${member.displayName}:`, error);
        errorLines.push(`${member.displayName}: Error processing emoji removal`);
      }
    }
    
    // Save updated player data
    await savePlayerData(data);
    
    return {
      deletedLines,
      errorLines
    };
    
  } catch (error) {
    console.error('Error clearing role emojis:', error);
    return {
      deletedLines: [],
      errorLines: ['Error accessing player data']
    };
  }
}