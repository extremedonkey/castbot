/**
 * claimsUI.js — builds the interactive per-player Claims manager (Components V2).
 *
 * Modelled on the Season Planner: one String Select per claimant (paginated), default option shows
 * the player's status, selecting reveals Clear / Set Cooldown. Footer hosts Add Manual Claim + Reset All.
 *
 * All claim state mutation lives in claimsManager.js; this module only renders.
 */

import { formatPeriod, summarizeLimit } from './utils/periodUtils.js';
import { getClaimants, claimStatusLine, isTimed, resolveNames } from './claimsManager.js';

const CLAIMANTS_PER_PAGE = 10;

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/** Warn (don't throw) if a generated custom_id approaches Discord's 100-char hard limit. */
function checkId(id) {
  if (id.length >= 90) console.warn(`⚠️ Claims custom_id near 100-char limit (${id.length}): ${id}`);
  return id;
}

/** Resolve the outcome's human description (matches the legacy view's switch). */
async function describeOutcome(safariData, guildId, action, actionIndex) {
  const items = safariData[guildId]?.items || {};
  const enemies = safariData[guildId]?.enemies || {};
  const { getCustomTerms } = await import('./safariManager.js');
  const customTerms = await getCustomTerms(guildId);

  switch (action.type) {
    case 'give_item': {
      const item = items[action.config.itemId];
      const qty = action.config.quantity || 1;
      const op = action.config.operation === 'remove' ? 'Remove' : 'Give';
      return `${item?.emoji || '📦'} ${op} ${qty}x ${item?.name || action.config.itemId || 'Unknown Item'}`;
    }
    case 'give_currency': {
      const amt = action.config.amount || 0;
      return `${customTerms.currencyEmoji || '🪙'} ${amt > 0 ? '+' : ''}${amt} ${customTerms.currencyName || 'Currency'}`;
    }
    case 'modify_attribute': {
      const attrDefs = safariData[guildId]?.attributeDefinitions || {};
      const attrDef = attrDefs[action.config.attributeId];
      const op = action.config.operation === 'add' ? '+' : action.config.operation === 'subtract' ? '-' : '=';
      return `${attrDef?.emoji || '📊'} ${op}${action.config.amount || 0} ${attrDef?.name || action.config.attributeId || 'Unknown Attribute'}`;
    }
    case 'fight_enemy': {
      const enemy = enemies[action.config.enemyId];
      return `${enemy?.emoji || '🐙'} Fight ${enemy?.name || 'Unknown Enemy'}`;
    }
    default:
      return `Outcome #${actionIndex + 1}`;
  }
}

function errorContainer(message, buttonId) {
  return { components: [{ type: 17, accent_color: 0x3498DB, components: [
    { type: 10, content: `## 👥 Player Claims\n-# ${message}` },
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: `custom_action_editor_${buttonId}`, label: '← Back', style: 2, emoji: { name: '⚡' } }
    ]}
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

  if (!action?.config?.limit) return errorContainer('No claim limit configured for this outcome', buttonId);

  const limit = action.config.limit;
  const limitType = limit.type || 'unlimited';
  const timed = isTimed(limit);

  const limitLabels = {
    unlimited: '♾️ **Unlimited** — no claim restrictions',
    once_per_player: '👤 **Once Per Player** — each player can claim once',
    once_globally: '🌍 **Once Globally** — first player to claim gets it, nobody else can',
    once_per_period: `⏱️ **Once Per Period** — every **${formatPeriod(limit.periodMs || 0)}**`,
    custom: `⚙️ **Custom** — ${summarizeLimit(limit)}`
  };
  const outcomeDesc = await describeOutcome(safariData, guildId, action, actionIndex);

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

  // Footer — navigation row (Back + pagination) then actions row (Add / Refresh / Reset All)
  components.push({ type: 14 });
  const navRow = [
    { type: 2, custom_id: `custom_action_editor_${buttonId}`, label: '← Back', style: 2, emoji: { name: '⚡' } }
  ];
  if (totalPages > 1) {
    navRow.push(
      { type: 2, custom_id: checkId(`safari_claims_page:${safePage - 1}:${buttonId}:${actionIndex}`), label: '◀', style: 2, disabled: safePage === 0 },
      { type: 2, custom_id: checkId(`safari_claims_page:${safePage + 1}:${buttonId}:${actionIndex}`), label: '▶', style: 2, disabled: safePage >= totalPages - 1 }
    );
  }
  components.push({ type: 1, components: navRow });
  components.push({ type: 1, components: [
    { type: 2, custom_id: checkId(`safari_claim_add:${buttonId}:${actionIndex}`), label: 'Manual Claim', style: 2, emoji: { name: '👤' } },
    { type: 2, custom_id: checkId(`safari_claims_refresh:${buttonId}:${actionIndex}`), label: 'Refresh', style: 2, emoji: { name: '🔄' } },
    { type: 2, custom_id: checkId(`safari_claims_reset_all:${buttonId}:${actionIndex}`), label: 'Reset All', style: 4, emoji: { name: '🗑️' }, disabled: claimants.length === 0 }
  ]});

  const container = { type: 17, accent_color: 0x3498DB, components };
  const { countComponents } = await import('./utils.js');
  countComponents([container], { verbosity: 'summary', label: 'Claims Manager' });
  return { components: [container] };
}
