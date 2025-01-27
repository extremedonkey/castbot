import 'dotenv/config';
import { capitalize, InstallGlobalCommands } from './utils.js';
import { PermissionFlagsBits } from 'discord-api-types/v10';

// Define the required permissions using bitwise OR
const ADMIN_PERMISSIONS = (
  PermissionFlagsBits.ManageChannels | 
  PermissionFlagsBits.ManageGuild | 
  PermissionFlagsBits.ManageRoles
).toString();


const args = process.argv.slice(2);
const isGuild = args.includes('guild');
const guildId = isGuild ? process.env.DEV_GUILD_ID : undefined;
const isProduction = process.env.PRODUCTION === 'TRUE';

// Helper to optionally prepend dev_
function maybePrependDev(baseName) {
  // In production mode, never prepend dev_
  if (isProduction) return baseName;
  // Otherwise use existing guild-based logic !
  return isGuild ? `dev_${baseName}` : baseName;
}

// Command containing options

const SET_TRIBE2_COMMAND = {
  name: maybePrependDev('set_tribe2'),
  description: 'Add or update the 2nd tribe that displays in your dynamic castlist',
  type: 1,
  options: [
    {
      name: 'role',
      description: 'Select the second tribe to be displayed on the castlist',
      type: 8, // ROLE
      required: true
    },
    {
      name: 'emoji',
      description: 'Set an optional emoji to be displayed in the tribe\'s castlist header',
      type: 3, // STRING
      required: false
    }
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_TRIBE1_COMMAND = {
  name: maybePrependDev('set_tribe1'),
  description: 'Add or update the 1st tribe that displays in your dynamic castlist',
  type: 1,
  options: [
    {
      name: 'role',
      description: 'Select the first tribe to be displayed on the castlist',
      type: 8, // ROLE
      required: true
    },
    {
      name: 'emoji',
      description: 'Set an optional emoji to be displayed in the tribe\'s castlist header',
      type: 3, // STRING
      required: false
    }
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_TRIBE3_COMMAND = {
  name: maybePrependDev('set_tribe3'),
  description: 'Add or update the 3rd tribe that displays in your dynamic castlist',
  type: 1,
  options: [
    {
      name: 'role',
      description: 'Select the third tribe to be displayed on the castlist',
      type: 8, // ROLE
      required: true
    },
    {
      name: 'emoji',
      description: 'Set an optional emoji to be displayed in the tribe\'s castlist header',
      type: 3, // STRING
      required: false
    }
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_TRIBE4_COMMAND = {
  name: maybePrependDev('set_tribe4'),
  description: 'Add or update the 4th tribe that displays in your dynamic castlist',
  type: 1,
  options: [
    {
      name: 'role',
      description: 'Select the fourth tribe to be displayed on the castlist',
      type: 8, // ROLE
      required: true
    },
    {
      name: 'emoji',
      description: 'Set an optional emoji to be displayed in the tribe\'s castlist header',
      type: 3, // STRING
      required: false
    }
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_TRIBE_COMMAND = {
  name: maybePrependDev('set_tribe'),
  description: 'Add or update a tribe in your dynamic castlist',
  type: 1,
  options: [
    {
      name: 'role',
      description: 'Select the tribe role to be displayed on the castlist',
      type: 8, // ROLE
      required: true
    },
    {
      name: 'emoji',
      description: 'Set an optional emoji to be displayed in the tribe\'s castlist header',
      type: 3, // STRING
      required: false
    },
    {
      name: 'castlist',
      description: 'Set which castlist this tribe is added to (if left blank, will be set to the default castlist)',
      type: 3, // STRING
      required: false
    }
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const CASTLIST_COMMAND = {
  name: maybePrependDev('castlist'),
  description: 'Display the dynamic castlist',
  type: 1,
};

const CLEAR_TRIBE1_COMMAND = {
  name: maybePrependDev('clear_tribe1'),  // Changed from cleartribe1 to clear_tribe1
  description: 'Clear tribe1, remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_TRIBE2_COMMAND = {
  name: maybePrependDev('clear_tribe2'),  // Changed from cleartribe2 to clear_tribe2
  description: 'Clear tribe2, remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_TRIBE3_COMMAND = {
  name: maybePrependDev('clear_tribe3'),  // Changed from cleartribe3 to clear_tribe3
  description: 'Clear tribe3, remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_TRIBE4_COMMAND = {
  name: maybePrependDev('clear_tribe4'),  // Changed from cleartribe4 to clear_tribe4
  description: 'Clear tribe4, remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_TRIBEALL_COMMAND = {
  name: maybePrependDev('cleartribeall'),
  description: 'Clear all tribes and remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_PLAYERS_AGE_COMMAND = {
  name: maybePrependDev('set_players_age'),
  description: 'Set ages for up to 12 players at a time',
  options: [
    {
      type: 6, // USER type
      name: 'player1',
      description: 'Discord user for player 1',
      required: true,
    },
    {
      type: 3, // STRING type
      name: 'player1_age',
      description: 'Age for player 1',
      required: true,
    },
    // Repeat for up to 12 players
    ...Array.from({ length: 11 }, (_, i) => [
      {
        type: 6,
        name: `player${i + 2}`,
        description: `Discord user for player ${i + 2}`,
        required: false,
      },
      {
        type: 3,
        name: `player${i + 2}_age`,
        description: `Age for player ${i + 2}`,
        required: false,
      },
    ]).flat(),
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const PRONOUNS_ADD_COMMAND = {
  name: maybePrependDev('pronouns_add'),
  description: 'Select an existing Pronoun Role from your server to add it to Castbot',
  options: [
    {
      type: 8, // ROLE type
      name: 'role1',
      description: 'First pronoun role to add',
      required: true,
    },
    // Generate optional pronoun role parameters for roles 2-12
    ...Array.from({ length: 11 }, (_, i) => ({
      type: 8,
      name: `role${i + 2}`,
      description: `Pronoun role ${i + 2} to add`,
      required: false,
    }))
  ],
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const PRONOUNS_REMOVE_COMMAND = {
  name: maybePrependDev('pronouns_remove'),
  description: 'Select a Pronoun Role already added to castbot to remove it from Castbot',
  options: [
    {
      type: 8, // ROLE type
      name: 'role1',
      description: 'First pronoun role to remove',
      required: true,
    },
    // Generate optional pronoun role parameters for roles 2-12
    ...Array.from({ length: 11 }, (_, i) => ({
      type: 8,
      name: `role${i + 2}`,
      description: `Pronoun role ${i + 2} to remove`,
      required: false,
    }))
  ],
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const TIMEZONES_ADD_COMMAND = {
  name: maybePrependDev('timezones_add'),
  description: 'Add or update timezone roles with their UTC offsets',
  type: 1,
  options: [
    {
      type: 8, // ROLE type
      name: 'timezone1',
      description: 'Existing role in the server representing a timezone.',
      required: true,
    },
    {
      type: 3, // STRING type
      name: 'timezone1_offset',
      description: 'Enter the UTC timezone offset (e.g. -8 for UTC-8, 8 for UTC+8).',
      required: true,
    },
    // Generate optional timezone parameters
    ...Array.from({ length: 11 }, (_, i) => [
      {
        type: 8,
        name: `timezone${i + 2}`,
        description: 'Existing role in the server representing a timezone.',
        required: false,
      },
      {
        type: 3,
        name: `timezone${i + 2}_offset`,
        description: 'Enter the UTC timezone offset (e.g. -8 for UTC-8, 8 for UTC+8).',
        required: false,
      },
    ]).flat(),
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const TIMEZONES_REMOVE_COMMAND = {
  name: maybePrependDev('timezones_remove'),
  description: 'Remove timezone roles from the timezone list',
  type: 1,
  options: [
    {
      type: 8, // ROLE type
      name: 'timezone1',
      description: 'First timezone role to remove',
      required: true,
    },
    // Generate optional timezone parameters
    ...Array.from({ length: 11 }, (_, i) => ({
      type: 8,
      name: `timezone${i + 2}`,
      description: `Timezone role ${i + 2} to remove`,
      required: false,
    })),
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const GETTING_STARTED_COMMAND = {
  name: maybePrependDev('getting_started'),
  description: 'Learn how to set up the dynamic castlist',
  type: 1,
};

const ALL_COMMANDS = [
  SET_TRIBE_COMMAND,   // Add new command
  SET_TRIBE1_COMMAND,  // Keep existing commands
  SET_TRIBE2_COMMAND,
  SET_TRIBE3_COMMAND,
  SET_TRIBE4_COMMAND,
  CASTLIST_COMMAND,
  GETTING_STARTED_COMMAND,
  CLEAR_TRIBE1_COMMAND,
  CLEAR_TRIBE2_COMMAND,
  CLEAR_TRIBE3_COMMAND,
  CLEAR_TRIBE4_COMMAND,
  SET_PLAYERS_AGE_COMMAND,     // Updated name
  PRONOUNS_ADD_COMMAND,        // Updated name
  PRONOUNS_REMOVE_COMMAND,     // Updated name
  TIMEZONES_ADD_COMMAND,       // Updated name
  TIMEZONES_REMOVE_COMMAND,    // Updated name
];

console.log('Registering commands with:');
console.log('APP_ID:', process.env.APP_ID);
console.log('guildId:', guildId);
console.log('Production mode:', isProduction);
console.log('Registering commands:', ALL_COMMANDS.map(c => c.name).join(', '));

// Only register commands for guild in dev mode, globally in production
if (isProduction && isGuild) {
  console.log('Skipping guild registration in production mode');
  process.exit(0);
}

// Just export the commands
export { ALL_COMMANDS };
