// CastBot Configuration
// Environment and feature flag management

// Development vs Production detection
export const isDevelopment = process.env.PRODUCTION !== 'TRUE';

// Discord API configuration
export const discordConfig = {
    token: process.env.DISCORD_TOKEN,
    publicKey: process.env.PUBLIC_KEY,
    appId: process.env.APP_ID,
    devGuildId: process.env.DEV_GUILD_ID
};

export default {
    isDevelopment,
    discordConfig
};