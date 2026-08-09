/**
 * 👥 Add Cast — create application channels for people who never clicked Apply.
 *
 * Hosts recruit off-Discord, take late replacements, and swap in alts. Those people need a real
 * application channel or none of the Casting / Marooning machinery can see them — every one of those
 * screens is driven by `playerData[guildId].applications[channelId]`.
 *
 * The net effect is deliberately identical to the applicant having clicked the Apply button themselves:
 * same channel, same permissions, same welcome card, same record shape, no casting decision pre-set.
 * That's why this delegates to `createApplicationChannel` rather than forking it — the Google Sheets
 * path forked only because it has no real Discord user to grant access to (src/sheets/sheetsIngest.js).
 *
 * Related: docs/03-features/SeasonManager.md, docs/03-features/GoogleSheetsSync.md
 */

import { loadPlayerData } from '../../storage.js';
import { createApplicationChannel } from '../../applicationManager.js';
import { runPacedJob } from '../channels/channelJob.js';
import { PACE_CREATE } from '../channels/channelAdminConfig.js';

/** Modes offered by the mode select. The first is the default in every sense — UI and fallback. */
export const ADD_CAST_MODES = {
  create_and_add: {
    label: 'Automatically create application channels and add the user to the channel.',
    grantApplicantAccess: true
  },
  create_only: {
    label: 'Automatically create application channels but do not add user to channel',
    grantApplicantAccess: false
  }
};
export const DEFAULT_ADD_CAST_MODE = 'create_and_add';

/**
 * Modal shown by the 👥 Add Cast button.
 * User Select + mode String Select, both Label-wrapped (Components V2).
 * @param {string} configId
 * @param {string} seasonName
 */
export function buildAddCastModal(configId, seasonName) {
  return {
    custom_id: `marooning_add_cast_modal|${configId}`,
    title: 'Add Cast',
    components: [
      {
        type: 18, // Label
        label: 'Cast Members to Add',
        // Discord caps Label descriptions at 100 chars — the "why" lives here, tersely.
        description: 'For cast who didn\'t apply via a CastBot channel — late additions, off-Discord recruits.',
        component: {
          type: 5, // User Select
          custom_id: 'add_cast_users',
          placeholder: 'Select one or more members...',
          required: true,
          min_values: 1,
          max_values: 25
        }
      },
      {
        type: 18, // Label
        label: 'What should CastBot do?',
        // `default: true` on a modal String Select option is unreliable in Discord (same caveat
        // documented in src/channels/channelsView.js), so the default is ALSO stated here and the
        // submit handler falls back to it when no value comes back. Never trust the pre-selection alone.
        description: 'Defaults to creating channels and adding each user to their own channel.',
        component: {
          type: 3, // String Select
          custom_id: 'add_cast_mode',
          required: false,
          min_values: 1,
          max_values: 1,
          options: Object.entries(ADD_CAST_MODES).map(([value, m], i) => ({
            label: m.label.slice(0, 100),
            value,
            default: i === 0
          }))
        }
      }
    ]
  };
}

/**
 * Pull the submitted fields out of a Components V2 modal payload.
 * Label (18) rows expose their child at `.component`; selects deliver `values[]`.
 * @param {Array} components - req.body.data.components
 * @returns {{ userIds: string[], mode: string }}
 */
export function parseAddCastSubmission(components) {
  const fields = {};
  for (const row of (components || [])) {
    const child = row?.component || row?.components?.[0];
    if (child?.custom_id) {
      fields[child.custom_id] = Array.isArray(child.values) ? child.values : (child.value != null ? [child.value] : []);
    }
  }
  const mode = fields.add_cast_mode?.[0];
  return {
    userIds: fields.add_cast_users || [],
    // Unknown/missing mode → the safe default (user CAN see their channel). The alternative would
    // silently create channels nobody can access.
    mode: ADD_CAST_MODES[mode] ? mode : DEFAULT_ADD_CAST_MODE
  };
}

/**
 * Which of the selected users already have a live application for this season.
 * Create-only semantics, matching the Sheets sync: an existing application is left completely alone.
 * A record whose channel has since been deleted does NOT count — that's an orphan, and
 * createApplicationChannel cleans it up on the way through.
 * @param {Object} playerData
 * @param {string} guildId
 * @param {string} configId
 * @param {string[]} userIds
 * @param {(channelId: string) => boolean} channelExists
 * @returns {{ toCreate: string[], skipped: Array<{userId: string, channelId: string}> }}
 */
export function splitExistingApplicants(playerData, guildId, configId, userIds, channelExists) {
  const applications = playerData?.[guildId]?.applications || {};
  const existingByUser = new Map();
  for (const [channelId, app] of Object.entries(applications)) {
    if (app?.configId !== configId) continue;
    if (!channelExists(channelId)) continue; // orphan — user may legitimately re-apply
    if (!existingByUser.has(app.userId)) existingByUser.set(app.userId, channelId);
  }

  const toCreate = [];
  const skipped = [];
  const seen = new Set();
  for (const userId of userIds) {
    if (seen.has(userId)) continue; // Discord shouldn't send dupes, but a dupe would double-create
    seen.add(userId);
    if (existingByUser.has(userId)) skipped.push({ userId, channelId: existingByUser.get(userId) });
    else toCreate.push(userId);
  }
  return { toCreate, skipped };
}

/**
 * Result summary card. Every outcome is named — a silent partial success reads as total success.
 * @param {{ created: Array, skipped: Array, failed: Array, mode: string }} r
 */
export function buildAddCastSummary({ created, skipped, failed, mode }) {
  const lines = [];
  const noun = (n) => `${n} cast member${n === 1 ? '' : 's'}`;

  if (created.length) {
    lines.push(`## ✅ Added ${noun(created.length)}`);
    lines.push(created.map(c => `> <@${c.userId}> → <#${c.channelId}>`).join('\n'));
    if (mode === 'create_only') {
      lines.push('-# Channels created WITHOUT applicant access — they can\'t see or answer them yet.');
    }
  } else {
    lines.push('## 👥 Add Cast');
  }

  if (skipped.length) {
    lines.push(`### ⏭️ Skipped ${noun(skipped.length)} — already have an application`);
    lines.push(skipped.map(s => `> <@${s.userId}> → <#${s.channelId}>`).join('\n'));
  }

  if (failed.length) {
    lines.push(`### ❌ Failed for ${noun(failed.length)}`);
    lines.push(failed.map(f => `> <@${f.userId}> — ${f.error}`).join('\n'));
  }

  return lines.join('\n');
}

/**
 * Create the application channels. Discord side effects only — the caller re-renders Marooning.
 *
 * Channel creation is one of Discord's tightest rate-limit buckets, so this runs through runPacedJob
 * (PACE_CREATE) with streamed progress rather than a bare loop, exactly like the bulk channel jobs.
 *
 * @param {Object} p
 * @param {Object} p.guild - fetched discord.js Guild
 * @param {string} p.configId
 * @param {string[]} p.userIds
 * @param {string} p.mode - key of ADD_CAST_MODES
 * @param {Object} [p.progress] - { interactionToken, applicationId } to stream progress into @original
 * @returns {Promise<{ created: Array, skipped: Array, failed: Array, mode: string }>}
 */
export async function addCastMembers({ guild, configId, userIds, mode, progress = null }) {
  const guildId = guild.id;
  const playerData = await loadPlayerData();
  const config = playerData?.[guildId]?.applicationConfigs?.[configId];
  if (!config) return { created: [], skipped: [], failed: [], mode, error: '❌ Season configuration not found.' };
  if (!config.categoryId) {
    return { created: [], skipped: [], failed: [], mode, error: '❌ This season has no application category set — configure it in the Apps tab first.' };
  }

  const { toCreate, skipped } = splitExistingApplicants(
    playerData, guildId, configId, userIds, (channelId) => guild.channels.cache.has(channelId)
  );

  const grantApplicantAccess = ADD_CAST_MODES[mode]?.grantApplicantAccess ?? true;
  const created = [];
  const failed = [];

  await runPacedJob({
    items: toCreate,
    pace: PACE_CREATE,
    progress: progress ? { ...progress, title: '👥 Adding Cast' } : null,
    step: async (userId) => {
      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch {
        failed.push({ userId, error: 'Not a member of this server' });
        return { ok: false, error: 'Not a member of this server' };
      }

      // Same call the Apply button makes — identical channel, permissions, welcome card and record.
      const result = await createApplicationChannel(guild, member, config, configId, { grantApplicantAccess });
      if (!result.success) {
        failed.push({ userId, error: result.error });
        return { ok: false, error: result.error };
      }
      created.push({ userId, channelId: result.channel.id });
      return { ok: true, created: true, label: member.displayName || member.user?.username || userId };
    }
  });

  console.log(`👥 Add Cast [${mode}] guild ${guildId} season ${configId}: created ${created.length}, skipped ${skipped.length}, failed ${failed.length}`);
  return { created, skipped, failed, mode };
}
