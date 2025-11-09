import 'dotenv/config';
import fetch from 'node-fetch';

export async function DiscordRequest(endpoint, options) {
  const url = `https://discord.com/api/v10/${endpoint}`;
  if (options.body) {
    options.body = typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    ...options,
  });

  // For DELETE requests, return early since they don't return content
  if (options.method === 'DELETE') {
    return { success: res.ok };
  }

  // Handle non-ok responses
  if (!res.ok) {
    const error = await res.text();
    
    // Graceful handling for webhook errors (Discord interaction token expiry/invalid)
    if (error.includes('Unknown Webhook') || 
        error.includes('Invalid Webhook Token') ||
        error.includes('"code": 10015') || 
        error.includes('"code": 50027')) {
      console.log(`⏰ DEBUG: Webhook interaction failed (${endpoint}) - likely expired or invalid token`);
      return null; // Return null instead of throwing error
    }
    
    throw new Error(error);
  }
  
  // Handle empty responses
  const text = await res.text();
  if (!text) {
    return null;
  }

  // Parse JSON response
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Failed to parse response:', text);
    throw new Error('Invalid JSON response from Discord API');
  }
}

export async function InstallGlobalCommands(appId, commands, guildId) {
  // API endpoint to overwrite global commands
  const endpoint = guildId 
    ? `applications/${appId}/guilds/${guildId}/commands` 
    : `applications/${appId}/commands`;

  try {
    // If in production mode, first fetch existing commands to remove any dev_ commands
    if (process.env.PRODUCTION === 'TRUE') {
      const existingCommands = await DiscordRequest(endpoint, { method: 'GET' });
      if (!existingCommands) return; // No commands to process
      
      // Find any dev_ commands that need to be deleted
      const devCommands = existingCommands.filter(cmd => cmd.name.startsWith('dev_'));
      
      // Delete each dev command
      for (const cmd of devCommands) {
        console.log(`Removing dev command in production mode: ${cmd.name}`);
        await DiscordRequest(`${endpoint}/${cmd.id}`, { method: 'DELETE' });
      }
    }

    // Install the new command set
    const response = await DiscordRequest(endpoint, {
      method: 'PUT',
      body: commands,
    });

    console.log('Successfully installed commands:', response);
    return response;
  } catch (err) {
    console.error('Error installing commands: ', err);
    throw err; // Re-throw to ensure error propagates
  }
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Recursively count all Discord Components V2 components in a component tree
 *
 * CRITICAL: Discord counts ALL components including nested ones (buttons inside ActionRows,
 * accessories in Sections, etc.) towards the 40-component limit. This function accurately
 * counts every component to prevent "interaction failed" errors.
 *
 * Supported component types (from ComponentsV2.md):
 * - Layout: Container (17), Action Row (1), Section (9), Separator (14)
 * - Content: Text Display (10), Thumbnail (11), Media Gallery (12), File (13)
 * - Interactive: Button (2), String Select (3), Text Input (4), User Select (5),
 *               Role Select (6), Mentionable Select (7), Channel Select (8)
 * - Modal: Label (18)
 *
 * @param {Array} components - Array of component objects (e.g., [containerObject])
 * @param {Object} options - Configuration options
 * @param {boolean} options.enableLogging - If true, logs component info (default: true)
 * @param {string} options.verbosity - Logging verbosity: "full" (detailed breakdown), "summary" (just total) (default: "full")
 * @param {string} options.label - Custom label for log output (default: "COMPONENT BREAKDOWN")
 * @returns {number} Total component count (including all nested components and accessories)
 *
 * @example
 * // Full detailed breakdown (debugging)
 * const count = countComponents([containerObject], { enableLogging: true, verbosity: "full" });
 *
 * @example
 * // Summary only (production logging)
 * countComponents([containerObject], { enableLogging: true, verbosity: "summary", label: "MyMenu" });
 * // Logs: "✅ MyMenu: 35/40 components"
 *
 * @example
 * // Silent validation (error handling)
 * const count = countComponents([containerObject], { enableLogging: false });
 * if (count > 40) throw new Error('Too many components!');
 */
export function countComponents(components, options = {}) {
    const { enableLogging = true, label = "COMPONENT BREAKDOWN", verbosity = "full" } = options;

    let count = 0;

    // Complete type mapping from ComponentsV2.md
    const typeNames = {
        1: 'ActionRow',
        2: 'Button',
        3: 'StringSelect',
        4: 'TextInput',
        5: 'UserSelect',
        6: 'RoleSelect',
        7: 'MentionableSelect',
        8: 'ChannelSelect',
        9: 'Section',
        10: 'TextDisplay',
        11: 'Thumbnail',
        12: 'MediaGallery',
        13: 'File',
        14: 'Separator',
        17: 'Container',
        18: 'Label'
    };

    function countRecursive(items, depth = 0) {
        if (!Array.isArray(items)) return;

        for (const item of items) {
            count++; // Count the item itself

            if (enableLogging && verbosity === "full") {
                const indent = '  '.repeat(depth);
                const typeName = typeNames[item.type] || `Unknown(${item.type})`;
                const hasAccessory = item.accessory ? ' [HAS ACCESSORY]' : '';
                console.log(`${indent}${count}. ${typeName}${hasAccessory}`);
            }

            // Count and recurse into accessories (CRITICAL FIX: was logged but not counted!)
            if (item.accessory) {
                count++; // Accessories count as separate components!

                if (enableLogging && verbosity === "full") {
                    const indent = '  '.repeat(depth);
                    const accessoryType = typeNames[item.accessory.type] || `Unknown(${item.accessory.type})`;
                    console.log(`${indent}   └─ Accessory: ${accessoryType}`);
                }

                // Recursively count components inside accessories
                if (item.accessory.components) {
                    countRecursive(item.accessory.components, depth + 1);
                }
            }

            // Recursively count nested components (buttons in ActionRows, etc.)
            if (item.components) {
                countRecursive(item.components, depth + 1);
            }

            // Count Label's child component (type 18 in modals)
            if (item.component) {
                count++;

                if (enableLogging && verbosity === "full") {
                    const indent = '  '.repeat(depth);
                    const childType = typeNames[item.component.type] || `Unknown(${item.component.type})`;
                    console.log(`${indent}   └─ Child: ${childType}`);
                }

                // Recurse into Label's child if it has nested components
                if (item.component.components) {
                    countRecursive(item.component.components, depth + 1);
                }
            }
        }
    }

    if (enableLogging && verbosity === "full") {
        console.log(`📋 ${label}:`);
    }

    countRecursive(components);

    if (enableLogging) {
        const status = count <= 40 ? '✅' : '❌';
        if (verbosity === "summary") {
            console.log(`${status} ${label}: ${count}/40 components`);
        } else {
            console.log(`${status} Total components: ${count}/40`);
        }
    }

    return count;
}

/**
 * Validate that a component tree doesn't exceed Discord's 40-component limit
 * Throws an error if limit is exceeded, otherwise returns silently
 *
 * @param {Array} components - Array of component objects to validate
 * @param {string} contextLabel - Label for error message (e.g., "Production Menu")
 * @throws {Error} If component count exceeds 40
 *
 * @example
 * // Validate before sending response
 * validateComponentLimit([containerObject], "Season Ranking Menu");
 * return { components: [containerObject] };
 */
export function validateComponentLimit(components, contextLabel = "UI") {
    const count = countComponents(components, { enableLogging: false });
    if (count > 40) {
        throw new Error(`${contextLabel} exceeds Discord component limit: ${count}/40 components`);
    }
}

/**
 * Sanitize error messages for display in Discord
 * - Truncates to maxLength (default 500 chars)
 * - Removes HTML tags (e.g., Cloudflare error pages)
 * - Provides fallback message if result is empty
 *
 * @param {Error|string} error - Error object or error message string
 * @param {number} maxLength - Maximum length before truncation (default 500)
 * @returns {string} Sanitized error message safe for Discord display
 *
 * @example
 * // Handle Cloudflare HTML error pages
 * catch (error) {
 *   const safeMessage = sanitizeErrorMessage(error);
 *   return { content: `Error: ${safeMessage}` };
 * }
 */
export function sanitizeErrorMessage(error, maxLength = 500) {
    let message = typeof error === 'string' ? error : (error?.message || 'Unknown error');

    // Truncate long messages (e.g., HTML error pages >10KB)
    if (message.length > maxLength) {
        message = message.substring(0, maxLength - 3) + '...';
    }

    // Remove HTML tags (e.g., Cloudflare error pages)
    message = message.replace(/<[^>]*>/g, '').trim();

    // Fallback if message is empty after sanitization
    if (!message || message.length === 0) {
        message = 'Server error (Discord infrastructure issue)';
    }

    return message;
}
