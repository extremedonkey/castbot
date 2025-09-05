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

// Production mode check (for logging only)
const isProduction = process.env.PRODUCTION === 'TRUE';

// Active commands - Only CASTLIST and MENU

const CASTLIST_COMMAND = {
	name: 'castlist',
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
	name: 'menu',
	description: 'View Castbot menu to access all features.',
	type: 1
};


const ALL_COMMANDS = [
	CASTLIST_COMMAND,
	MENU_COMMAND
];

console.log('Registering commands with:');
console.log('APP_ID:', process.env.APP_ID);
console.log('Production mode:', isProduction);
console.log('Commands available:', ALL_COMMANDS.map(c => c.name).join(', '));

// Just export the commands
export { ALL_COMMANDS };