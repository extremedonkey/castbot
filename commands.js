import 'dotenv/config';
import { capitalize, InstallGlobalCommands } from './utils.js';
import { PermissionFlagsBits } from 'discord-api-types/v10';

// Replace legacy ADMIN_PERMISSIONS with a new bitfield that requires ANY admin permission
const ADMIN_ANY = (
	PermissionFlagsBits.ManageChannels | 
	PermissionFlagsBits.ManageGuild | 
	PermissionFlagsBits.ManageRoles | 
	PermissionFlagsBits.Administrator
).toString();

const args = process.argv.slice(2);
const isGuild = args.includes('guild');
const guildId = isGuild ? process.env.DEV_GUILD_ID : undefined;
const isProduction = process.env.PRODUCTION === 'TRUE';

// Helper to optionally prepend dev_
function maybePrependDev(baseName) {
	// In production mode, never prepend dev_
	if (isProduction) return baseName;
	// Otherwise use existing guild-based logic!
	return isGuild ? `dev_${baseName}` : baseName;
}

// For open commands, do not assign default_member_permissions!
const CASTLIST_COMMAND = {
	name: maybePrependDev('castlist'),
	description: 'Display the dynamic castlist',
	type: 1,
	options: [
		{
			name: 'castlist',
			description: 'Select which castlist to display (if left blank, will display default castlist)',
			type: 3, // STRING type
			required: false
		}
	]
};

// Admin-only commands: assign ADMIN_ANY as the default permission
const SET_TRIBE_COMMAND = {
	name: maybePrependDev('add_tribe'),  // Changed from set_tribe
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
	default_member_permissions: ADMIN_ANY
};

const CLEAR_TRIBEALL_COMMAND = {
	name: maybePrependDev('cleartribeall'),
	description: 'Clear all tribes and remove associated players and emojis',
	type: 1,
	default_member_permissions: ADMIN_ANY
};

const CLEAR_TRIBE_COMMAND = {
	name: maybePrependDev('clear_tribe'),
	description: 'Clear a specific tribe from the castlist',
	type: 1,
	options: [
		{
			name: 'role',
			description: 'Select the tribe to clear from the castlist',
			type: 8, // ROLE
			required: true
		}
	],
	default_member_permissions: ADMIN_ANY
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
	default_member_permissions: ADMIN_ANY
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
	default_member_permissions: ADMIN_ANY
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
	default_member_permissions: ADMIN_ANY
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
	default_member_permissions: ADMIN_ANY
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
	default_member_permissions: ADMIN_ANY
};

const GETTING_STARTED_COMMAND = {
	name: maybePrependDev('getting_started'),
	description: 'Learn how to set up the dynamic castlist',
	type: 1,
	default_member_permissions: ADMIN_ANY
};

const ROLE_GENERATOR_COMMAND = {
	name: maybePrependDev('setup_castbot'),  // Changed from role_generator
	description: 'Create standard timezone and pronoun roles for your server',
	type: 1,
	default_member_permissions: ADMIN_ANY
};

// Open commands: remove any default_member_permissions property
const REACT_PRONOUNS_COMMAND = {
	name: maybePrependDev('player_set_pronouns'),  // Changed from react_pronouns
	description: 'Create a reaction role message for pronoun roles',
	type: 1,
	dm_permission: false
};

const REACT_TIMEZONES_COMMAND = {
	name: maybePrependDev('player_set_timezone'),  // Changed from react_timezones
	description: 'Create a message for users to select their timezone roles via reactions',
	type: 1,
	dm_permission: false
};

const SET_AGE_COMMAND = {
	name: maybePrependDev('player_set_age'),  // Changed from set_age
	description: 'Set your own age in the castlist',
	type: 1,
	options: [
		{
			type: 3, // STRING type
			name: 'age',
			description: 'Enter your age.',
			required: true,
		}
	]
};

const STATS_COMMAND = {
  name: maybePrependDev('stats'),
  description: 'Display message statistics for all channels',
  type: 1,
  default_member_permissions: ADMIN_ANY
};

const ALL_COMMANDS = [
	SET_AGE_COMMAND,
	REACT_PRONOUNS_COMMAND,
	ROLE_GENERATOR_COMMAND,
	CLEAR_TRIBE_COMMAND,     
	SET_TRIBE_COMMAND,   
	CASTLIST_COMMAND,
	GETTING_STARTED_COMMAND,
	SET_PLAYERS_AGE_COMMAND,
	PRONOUNS_ADD_COMMAND,
	PRONOUNS_REMOVE_COMMAND,
	TIMEZONES_ADD_COMMAND,
	TIMEZONES_REMOVE_COMMAND,
	REACT_TIMEZONES_COMMAND,
	STATS_COMMAND,          // Add the stats command here
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