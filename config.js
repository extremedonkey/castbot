// CastBot Configuration
// Environment and feature flag management

// Development vs Production detection
export const isDevelopment = process.env.PRODUCTION !== 'TRUE';

// Components v2 testing flag - disabled due to mixed component type limitations
// Discord doesn't support native category/style selects, causing mixed component failures
export const useComponentsV2 = false; // process.env.USE_COMPONENTS_V2 === 'true';

// Discord API configuration
export const discordConfig = {
    token: process.env.DISCORD_TOKEN,
    publicKey: process.env.PUBLIC_KEY,
    appId: process.env.APP_ID,
    devGuildId: process.env.DEV_GUILD_ID
};

export default {
    isDevelopment,
    useComponentsV2,
    discordConfig
};