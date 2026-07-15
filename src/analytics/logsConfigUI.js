/**
 * CastBot Logs config modal (reeces_stuff → CastBot Logs).
 * Environment-level Discord analytics logging config: enable/disable, log channel,
 * ignored users, log format (Classic/Enhanced), optional guild cache refresh.
 * Persists to environmentConfig.liveDiscordLogging (playerData.json) — see storage.js.
 */

/**
 * Build the CastBot Logs modal (Components V2: Label type 18 wrappers — modal max 5).
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
        description: `Post CastBot activity to the log channel (${envKey})`,
        component: {
          type: 3, // String Select
          custom_id: 'logs_enabled',
          required: true,
          min_values: 1,
          max_values: 1,
          options: [
            { label: 'Enabled', value: 'enabled', emoji: { name: '🟢' }, default: !!lg.enabled },
            { label: 'Disabled', value: 'disabled', emoji: { name: '🔴' }, default: !lg.enabled }
          ]
        }
      },
      {
        type: 18, // Label
        label: 'Log Channel',
        description: channelId ? `Current: #${channelId} (${envKey})` : `No channel set (${envKey})`,
        component: {
          type: 8, // Channel Select
          custom_id: 'logs_channel',
          channel_types: [0],
          required: true,
          min_values: 1,
          max_values: 1,
          default_values: channelId ? [{ id: channelId, type: 'channel' }] : []
        }
      },
      {
        type: 18, // Label
        label: 'Ignored Users',
        description: 'Interactions from these users are not logged',
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
        component: {
          type: 3, // String Select
          custom_id: 'logs_format',
          required: true,
          min_values: 1,
          max_values: 1,
          options: [
            { label: 'Classic', value: 'classic', emoji: { name: '📜' }, description: 'Most detail but difficult to read', default: lg.format !== 'enhanced' },
            { label: 'Enhanced', value: 'enhanced', emoji: { name: '✨' }, description: 'Formats logs nicer, less detail', default: lg.format === 'enhanced' }
          ]
        }
      },
      {
        type: 18, // Label
        label: 'Cache Refresh',
        description: 'Optional — refetch this guild\'s members & roles',
        component: {
          type: 3, // String Select
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
