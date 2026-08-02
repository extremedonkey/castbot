/**
 * claimsUI.js — builds the interactive per-player Claims manager (Components V2).
 *
 * Modelled on the Season Planner: one String Select per claimant (paginated), default option shows
 * the player's status, selecting reveals Clear / Set Cooldown. Footer hosts Add Manual Claim + Reset All.
 *
 * All claim state mutation lives in claimsManager.js; this module only renders.
 */

import { formatPeriod, summarizeLimit } from './utils/periodUtils.js';
import { getClaimants, claimStatusLine, isTimed, resolveNames, describeOutcome } from './claimsManager.js';

const CLAIMANTS_PER_PAGE = 10;

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/** Warn (don't throw) if a generated custom_id approaches Discord's 100-char hard limit. */
function checkId(id) {
  if (id.length >= 90) console.warn(`⚠️ Claims custom_id near 100-char limit (${id.length}): ${id}`);
  return id;
}

/**
 * Pure — the Claims manager footer rows.
 *
 * LEAN (docs/ui/LeanUserInterfaceDesign.md): the back button gets its own ActionRow as the
 * LAST row, alone — like the `[← Menu]` row in the Analytics example. It used to share a row
 * with the pagination arrows, which put page controls above the action buttons they don't
 * relate to and buried Back mid-screen.
 *
 * Row order: pagination (only when there's more than one page, directly under the claimant
 * list it pages) → actions → Back alone.
 *
 * @param {object} args
 * @param {string} args.buttonId @param {number} args.actionIndex
 * @param {number} args.page - current (already clamped) page index
 * @param {number} args.totalPages
 * @param {boolean} args.hasClaims - false disables Reset All
 * @returns {Array<object>} ActionRows
 */
export function buildClaimsFooterRows({ buttonId, actionIndex, page, totalPages, hasClaims }) {
  const rows = [];

  if (totalPages > 1) {
    rows.push({ type: 1, components: [
      { type: 2, custom_id: checkId(`safari_claims_page:${page - 1}:${buttonId}:${actionIndex}`), label: '◀', style: 2, disabled: page === 0 },
      { type: 2, custom_id: checkId(`safari_claims_page:${page + 1}:${buttonId}:${actionIndex}`), label: '▶', style: 2, disabled: page >= totalPages - 1 }
    ]});
  }

  rows.push({ type: 1, components: [
    { type: 2, custom_id: checkId(`safari_claim_add:${buttonId}:${actionIndex}`), label: 'Manual Claim', style: 2, emoji: { name: '👤' } },
    { type: 2, custom_id: checkId(`safari_claims_refresh:${buttonId}:${actionIndex}`), label: 'Refresh', style: 2, emoji: { name: '🔄' } },
    { type: 2, custom_id: checkId(`safari_claims_reset_all:${buttonId}:${actionIndex}`), label: 'Reset All', style: 4, emoji: { name: '🗑️' }, disabled: !hasClaims }
  ]});

  rows.push(buildClaimsBackRow(buttonId));
  return rows;
}

/** The Back row — its own ActionRow, one button, always last. Shared by every claims screen. */
export function buildClaimsBackRow(buttonId) {
  return { type: 1, components: [
    { type: 2, custom_id: `custom_action_editor_${buttonId}`, label: '← Back', style: 2, emoji: { name: '⚡' } }
  ]};
}

function errorContainer(message, buttonId) {
  return { components: [{ type: 17, accent_color: 0x3498DB, components: [
    { type: 10, content: `## 👥 Player Claims\n-# ${message}` },
    { type: 14 },
    buildClaimsBackRow(buttonId)
  ]}]};
}

/**
 * Build the Claims manager container.
 * @param {object} args
 * @param {object} args.client - Discord client (for guild/member resolution)
 * @param {string} args.guildId
 * @param {string} args.buttonId - action (entity) id
 * @param {number} args.actionIndex - outcome index
 * @param {number} [args.page=0]
 * @param {boolean} [args.fetchNames=true] - allow network member fetch (false on non-deferred paths)
 * @returns {Promise<{components: object[]}>}
 */
export async function buildClaimsManagerUI({ client, guildId, buttonId, actionIndex, page = 0, fetchNames = true }) {
  const { loadSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  const button = safariData[guildId]?.buttons?.[buttonId];
  const action = button?.actions?.[actionIndex];

  if (!action) return errorContainer('Outcome not found', buttonId);

  // An outcome with no limit object IS unlimited at runtime (evaluateClassicGate returns
  // not-blocked for a missing limit), so render it as such rather than erroring — the menu
  // now offers Player Claims for every claim-capable outcome, including unconfigured ones.
  const limit = action.config?.limit || { type: 'unlimited' };
  const limitType = limit.type || 'unlimited';
  const timed = isTimed(limit);

  const limitLabels = {
    unlimited: '♾️ **Unlimited** — no claim restrictions',
    once_per_player: '👤 **Once Per Player** — each player can claim once',
    once_globally: '🌍 **Once Globally** — first player to claim gets it, nobody else can',
    once_per_period: `⏱️ **Once Per Period** — every **${formatPeriod(limit.periodMs || 0)}**`,
    custom: `⚙️ **Custom** — ${summarizeLimit(limit)}`
  };
  const { getCustomTerms } = await import('./safariManager.js');
  const outcomeDesc = describeOutcome(safariData, guildId, action, actionIndex, await getCustomTerms(guildId));

  const components = [
    { type: 10, content: `## 👥 Player Claims | ${button.name || buttonId}` },
    { type: 14 },
    { type: 10, content: `### \`\`\`📋 Limit Type\`\`\`\n${limitLabels[limitType] || limitType}` },
    { type: 10, content: `-# ${outcomeDesc} | Outcome #${actionIndex + 1}` },
    { type: 14 }
  ];

  // Claimants (paginated)
  const claimants = getClaimants(limit, Date.now());
  const totalPages = Math.max(1, Math.ceil(claimants.length / CLAIMANTS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageClaimants = claimants.slice(safePage * CLAIMANTS_PER_PAGE, (safePage + 1) * CLAIMANTS_PER_PAGE);

  if (claimants.length === 0) {
    const empty = limitType === 'unlimited'
      ? '✅ No restrictions — all players can claim freely'
      : '🔓 **No claims yet** — use **➕ Add Manual Claim** to grant one';
    components.push({ type: 10, content: `### \`\`\`📊 Status\`\`\`\n${empty}` });
  } else {
    const guild = await client.guilds.fetch(guildId);
    const names = await resolveNames(guild, pageClaimants.map(c => c.userId), { fetch: fetchNames });

    components.push({ type: 10, content: `### \`\`\`📊 Status\`\`\`\n-# ${claimants.length} player${claimants.length === 1 ? '' : 's'} claimed${totalPages > 1 ? ` · page ${safePage + 1}/${totalPages}` : ''} — select a player to manage` });

    for (const c of pageClaimants) {
      const name = names[c.userId] || `Player ${c.userId.slice(-4)}`;
      const status = claimStatusLine(c, limit);
      const summary = truncate(`${name} | ${status}`, 100);
      const options = [
        { label: summary, value: 'summary', default: true, emoji: { name: '▫️' } },
        { label: 'Clear', value: 'clear', emoji: { name: '🔥' }, description: "Remove this player's claim" }
      ];
      if (limit.type === 'once_per_period') {
        options.push({ label: 'Set Cooldown', value: 'set_cooldown', emoji: { name: '⏲️' }, description: 'Set remaining cooldown time' });
      }
      components.push({ type: 1, components: [{
        type: 3,
        custom_id: checkId(`safari_claim_p:${buttonId}:${actionIndex}:${c.userId}`),
        placeholder: truncate(`▫️ ${name} | ${status}`, 150),
        options
      }]});
    }
  }

  components.push({ type: 14 });
  components.push(...buildClaimsFooterRows({
    buttonId,
    actionIndex,
    page: safePage,
    totalPages,
    hasClaims: claimants.length > 0
  }));

  const container = { type: 17, accent_color: 0x3498DB, components };
  const { countComponents } = await import('./utils.js');
  countComponents([container], { verbosity: 'summary', label: 'Claims Manager' });
  return { components: [container] };
}
