// Safari system limits and configuration
// Single source of truth for all Safari-related limits

export const SAFARI_LIMITS = {
  // Action limits (legacy names: "button" = Action entity, "actions" = Outcomes)
  MAX_ACTIONS_PER_BUTTON: 6,       // Max outcomes per action (alias: MAX_OUTCOMES_PER_ACTION) — 7 theoretical max (22 fixed + 14 + 4 selects = 40), set to 6 for headroom
  MAX_BUTTON_LABEL_LENGTH: 80,     // Max action label length
  MAX_BUTTONS_PER_GUILD: 100,      // Max actions per guild (alias: MAX_ACTIONS_PER_GUILD)
  
  // Action limits
  MAX_ACTION_CONTENT_LENGTH: 2000,
  MAX_ACTION_TITLE_LENGTH: 100,
  MAX_CURRENCY_CHANGE: 999999,
  MIN_CURRENCY_CHANGE: -999999,
  
  // Store limits
  MAX_STORES_PER_GUILD: 50,
  MAX_ITEMS_PER_STORE: 23,
  MAX_STORE_NAME_LENGTH: 100,
  MAX_STOREOWNER_TEXT_LENGTH: 500,
  
  // Item limits
  MAX_ITEMS_PER_GUILD: 200,
  MAX_ITEM_NAME_LENGTH: 80,
  MAX_ITEM_DESCRIPTION_LENGTH: 500,
  MAX_ITEM_EFFECTS: 3,
  
  // Enemy limits
  MAX_ENEMIES_PER_GUILD: 200,
  MAX_ENEMY_NAME_LENGTH: 80,
  MAX_ENEMY_DESCRIPTION_LENGTH: 500,

  // General limits
  MAX_TAG_LENGTH: 30,
  MAX_TAGS_PER_ITEM: 5,
  MAX_DISCORD_COMPONENTS: 40
};

// Semantic aliases — use these in new code
export const MAX_OUTCOMES_PER_ACTION = SAFARI_LIMITS.MAX_ACTIONS_PER_BUTTON;
export const MAX_ACTIONS_PER_GUILD = SAFARI_LIMITS.MAX_BUTTONS_PER_GUILD;

export const EDIT_TYPES = {
  BUTTON: 'button',
  STORE: 'store', 
  ITEM: 'item',
  SAFARI_CONFIG: 'safari_config',
  MAP_CELL: 'map_cell',
  ENEMY: 'enemy'
};

export const BUTTON_STYLES = [
  { label: 'Primary', value: 'Primary', style: 1 },
  { label: 'Secondary', value: 'Secondary', style: 2 },
  { label: 'Success', value: 'Success', style: 3 },
  { label: 'Danger', value: 'Danger', style: 4 }
];