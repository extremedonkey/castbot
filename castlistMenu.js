import { 
  createSeasonSelector,
  getSeasonStageEmoji, 
  getSeasonStageName 
} from './seasonSelector.js';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { savePlayerData } from './storage.js';

/**
 * Creates the season selection menu UI
 * This appears when users click "Change Szn" in the Production Menu header
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
        title: 'Select Season',
        components: [
          {
            type: 10, // Text Display
            content: '## :castbot_logo: CastBot | Select Season'
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

  // Save the active season to playerData
  if (!playerData[guildId]) {
    playerData[guildId] = {};
  }
  playerData[guildId].activeSeason = {
    id: selectedValue,
    name: season.seasonName,
    stage: season.currentStage || 'planning'
  };
  
  await savePlayerData(playerData);

  // Provide feedback about the selection
  const stageEmoji = getSeasonStageEmoji(season.currentStage || 'planning');
  const stageName = getSeasonStageName(season.currentStage || 'planning');
  
  return {
    content: `✅ Active season set to:\n**${season.seasonName}**\n${stageEmoji} Stage: ${stageName}\n\n*This season will now be used as the default for all season-related features.*`,
    flags: InteractionResponseFlags.EPHEMERAL
  };
}