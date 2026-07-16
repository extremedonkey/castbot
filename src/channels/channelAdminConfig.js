/**
 * Channel Administration — configuration constants.
 *
 * Single source of truth for the whitelist, Discord's guild ceilings, and the permission
 * matrix. The whitelist lives here (not in BUTTON_REGISTRY) because `restrictedUser` in
 * BUTTON_REGISTRY is dead metadata that no enforcement path reads (RaP 0900) — display
 * gating and handler enforcement must both import THIS constant so they cannot drift.
 *
 * Pure module — NO top-level console.log (tests import it directly; see feedback_node_test_stdout).
 */
import { PermissionFlagsBits } from 'discord.js';

/**
 * Users who can see and use the Channels tab. Display gating (seasonSelector.js) and the
 * inline handler guards both read this. The literal owner ID also satisfies the
 * security-declaration ratchet (tests/securityDeclarations.test.js:52).
 */
export const CHANNEL_ADMIN_USER_IDS = ['391415444084490240', '1086246253819613274'];

/** Discord guild ceilings. Categories count toward GUILD_CHANNEL_LIMIT. */
export const GUILD_CHANNEL_LIMIT = 500;
export const GUILD_CATEGORY_LIMIT = 50;
export const MAX_CHANNELS_PER_CATEGORY = 50;
export const GUILD_ROLE_LIMIT = 250;

/** Pacing — mirrors mapExplorer.js:1568 (5 creates / 5s) and mapExplorer.js:721 (5 deletes / 2s). */
export const PACE_CREATE = { n: 5, ms: 5000 };
export const PACE_DELETE = { n: 5, ms: 2000 };
/** Renames are limited to 2 per 10 min PER CHANNEL — see app.js:49440. Best-effort only. */
export const RENAME_DELAY_MS = 5500;

/** Interaction tokens live 15 min; refuse plans we can't finish inside 12. */
export const MAX_JOB_SECONDS = 12 * 60;
/** Progress PATCH throttle (channelArchiver.js streams at a similar cadence). */
export const PROGRESS_THROTTLE_MS = 2500;
/** Plans stashed for the confirm screen expire after this. */
export const PLAN_TTL_MS = 10 * 60 * 1000;

const P = PermissionFlagsBits;

/** The player in their own confessional/subs/1on1 channel. */
export const PLAYER_ACCESS = [
  P.ViewChannel,
  P.SendMessages,
  P.ReadMessageHistory,
  P.EmbedLinks,
  P.AttachFiles,
  P.AddReactions
];

/** Trusted Spectators on confessionals — read + react, deliberately NO SendMessages (Reece's call). */
export const SPECTATOR_ACCESS = [
  P.ViewChannel,
  P.ReadMessageHistory,
  P.AddReactions
];

/** Hosts (globalRoleAccess whitelist) on every channel this framework creates. */
export const HOST_ACCESS = [
  P.ViewChannel,
  P.SendMessages,
  P.ReadMessageHistory,
  P.ManageChannels
];

/** Bits the bot itself needs before we attempt any bulk run. */
export const REQUIRED_BOT_PERMISSIONS = [P.ManageChannels, P.ManageRoles];

/**
 * Channel naming. Discord's hard limit is 100 chars; each budget leaves room for its suffix
 * plus a `-1234` collision discriminator. See channelPlan.channelName().
 */
export const CHANNEL_KINDS = {
  confessional: { suffix: '-confessional', slugMax: 80 },
  subs: { suffix: '-subs', slugMax: 88 },
  oneonone: { suffix: '', slugMax: 44 } // two slugs joined by '-'
};

/** Category base names. Overflow buckets get " 2", " 3", … appended (planCategoryBuckets). */
export const CATEGORY_NAMES = {
  confessional: 'Confessionals',
  subs: 'Subs',
  oneonone: '1 on 1s'
};

/** Job action keys — also the jobLocks map keys and the registry lastRun keys. */
export const ACTIONS = {
  PLAYER_ROLES: 'player_roles',
  CONFESSIONALS: 'confessionals',
  SUBS: 'subs',
  ONE_ON_ONES: 'one_on_ones'
};
