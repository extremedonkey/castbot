import { 
  createSeasonSelector,
  getSeasonStageEmoji, 
  getSeasonStageName 
} from './seasonSelector.js';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';

/**
 * Creates the main Castlist menu UI following LEAN Menu Design
 * This will eventually integrate with castlistV2.js for display
 * and support CastlistV3 season integration features
 */
export async function createCastlistMenu(guildId) {
  // Import season selector with Castlist-specific options
  const seasonSelector = await createSeasonSelector(guildId, {
    customId: 'castlist_season_select',
    placeholder: 'Select your season...',
    includeCreateNew: false, // Will add this in Phase 2
    showArchived: false
  });

  return {
    flags: 1 << 15, // IS_COMPONENTS_V2
    components: [
      {
        type: 17, // Container
        custom_id: 'castlist_main_menu',
        title: '📋 Castlists',
        components: [
          {
            type: 10, // Text Display
            content: '# 📋 Castlists | Easily create Castlists!'
          },
          {
            type: 14 // Separator
          },
          {
            type: 1, // Action Row
            components: [seasonSelector.toJSON()]
          }
        ]
      }
    ]
  };
}

/**
 * Handles season selection in the Castlist menu
 * This is Phase 1 - just print what was selected
 * Phase 2 will show castlist creation options
 * Phase 3 will integrate with castlistV2.js display
 */
export async function handleCastlistSeasonSelect(context, playerData) {
  const { guildId, userId, values } = context;
  const selectedValue = values[0];

  if (selectedValue === 'create_new') {
    // Phase 2: Will show season creation modal
    return {
      content: '🚧 Season creation coming soon! For now, use /menu → Production Menu → Season Applications to create seasons.',
      flags: InteractionResponseFlags.EPHEMERAL
    };
  }

  // Get the selected season details
  const season = playerData[guildId]?.applicationConfigs?.[selectedValue];
  
  if (!season) {
    return {
      content: '❌ Season not found. Please try again.',
      flags: InteractionResponseFlags.EPHEMERAL
    };
  }

  // Phase 1: Just print what was selected
  const stageEmoji = getSeasonStageEmoji(season.currentStage || 'planning');
  const stageName = getSeasonStageName(season.currentStage || 'planning');
  
  return {
    content: `✅ Selected season:\n**${season.seasonName}**\n${stageEmoji} Stage: ${stageName}\n\n*Phase 2 will show castlist creation options here...*`,
    flags: InteractionResponseFlags.EPHEMERAL
  };
}