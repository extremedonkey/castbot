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

// Active commands - Only CASTLIST and MENU

const CASTLIST_COMMAND = {
	name: maybePrependDev('castlist'),
	description: 'Display your CastBot castlist(s).',
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

// Legacy commands - REMOVED
// All admin functionality now accessible through /menu → Production Menu
// Player functionality now accessible through /menu → Player Profile


// Only CASTLIST and MENU ar active at the moment

// Unified menu command that shows player menu for regular users, admin menu for admins
const MENU_COMMAND = {
	name: maybePrependDev('menu'),
	description: 'View Castbot menu to access all features.',
	type: 1
};


const ALL_COMMANDS = [
	CASTLIST_COMMAND,
	MENU_COMMAND
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