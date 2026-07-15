/**
 * CastBot Logs config modal (reeces_stuff → CastBot Logs).
 * Environment-level Discord analytics logging config: enable/disable, log channel,
 * ignored users, log format (Classic/Enhanced), optional guild cache refresh.
 * Persists to environmentConfig.liveDiscordLogging (playerData.json) — see storage.js.
 *
 * COMPONENT CHOICES (learned the hard way, see docs/standards/ComponentsV2.md):
 * - String Select option `default: true` is NOT honored inside modals — single-choice
 *   fields use Radio Group (type 21), whose option `default` DOES pre-select in modals.
 * - Channel/User select `default_values` in modals is unreliable → each Label's
 *   `description` states the CURRENT value, and the channel select allows empty
 *   (empty = keep current channel; the submit handler only writes when a value is given).
 */

/**
 * Build the CastBot Logs modal (Label type 18 wrappers — modal max 5 components).
 * @param {Object} envConfig - result of loadEnvironmentConfig()
 * @param {boolean} isProduction - process.env.PRODUCTION === 'TRUE' (TEST instance → development branch)
 * @returns {Object} modal data for { type: 9, data: ... }
 */
export function buildCastBotLogsModal(envConfig, isProduction) {
  const lg = envConfig?.liveDiscordLogging || {};
  const envKey = isProduction ? 'production' : 'development';
  const channelId = isProduction ? lg.productionChannelId : lg.developmentChannelId;
  const excluded = (Array.isArray(lg.excludedUserIds)
    ? lg.excludedUserIds
    : lg.excludedUserIds?.[envKey]) || [];

  return {
    custom_id: 'castbot_logs_modal',
    title: 'CastBot Logs',
    components: [
      {
        type: 18, // Label
        label: 'Live Discord Logging',
        description: `Currently ${lg.enabled ? 'ENABLED' : 'DISABLED'} (${envKey})`,
        component: {
          type: 21, // Radio Group — option `default` pre-selects in modals (String Select's doesn't)
          custom_id: 'logs_enabled',
          required: true,
          options: [
            { label: 'Enabled', value: 'enabled', description: 'Post activity to the log channel', default: !!lg.enabled },
            { label: 'Disabled', value: 'disabled', description: 'File logging only', default: !lg.enabled }
          ]
        }
      },
      {
        type: 18, // Label
        label: 'Log Channel',
        description: `Current: ${channelId || 'not set'} — leave empty to keep it`,
        component: {
          type: 8, // Channel Select
          custom_id: 'logs_channel',
          channel_types: [0],
          required: false,
          min_values: 0,
          max_values: 1,
          default_values: channelId ? [{ id: channelId, type: 'channel' }] : []
        }
      },
      {
        type: 18, // Label
        label: 'Ignored Users',
        description: `Not logged. Current: ${excluded.length ? excluded.map(id => `@${id}`).join(', ') : 'none'} — selection REPLACES the list; empty clears it`,
        component: {
          type: 5, // User Select
          custom_id: 'logs_ignore',
          required: false,
          min_values: 0,
          max_values: 25,
          default_values: excluded.map(id => ({ id, type: 'user' }))
        }
      },
      {
        type: 18, // Label
        label: 'Log Format',
        description: `Currently ${lg.format === 'enhanced' ? 'Enhanced' : 'Classic'}`,
        component: {
          type: 21, // Radio Group (pre-selects correctly in modals)
          custom_id: 'logs_format',
          required: true,
          options: [
            { label: 'Log Format: Classic', value: 'classic', description: 'Most detail but difficult to read', default: lg.format !== 'enhanced' },
            { label: 'Log Format: Enhanced', value: 'enhanced', description: 'Formats logs nicer, less detail', default: lg.format === 'enhanced' }
          ]
        }
      },
      {
        type: 18, // Label
        label: 'Cache Refresh',
        description: 'Optional — refetch this guild\'s members & roles',
        component: {
          type: 3, // String Select (no pre-selection needed — always starts empty)
          custom_id: 'logs_cache_refresh',
          required: false,
          min_values: 0,
          max_values: 1,
          options: [
            { label: 'Refresh Cache', value: 'refresh', emoji: { name: '♻️' }, description: 'Force-refetch guild, all roles and all members' }
          ]
        }
      }
    ]
  };
}
