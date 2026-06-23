/**
 * customUsageLimitUI.js — the ⚙️ Custom usage-limit sub-config screen + Usage Templates.
 *
 * Renders a LEAN Components V2 screen (webhook UPDATE) for editing a custom limit's
 * orthogonal dimensions: maxClaims × scope × unique × reset (none|rolling|fixed_window).
 * Pure-ish: this module RENDERS from a passed-in customConfig and owns template storage;
 * the app.js handlers own the working-state plumbing (deferred dropConfigState for
 * item/currency vs immediate safariContent for attr/enemy) and re-render via these builders.
 *
 * See RaP docs/01-RaP/0905_20260623_CustomUsageLimits_Analysis.md
 */

import { summarizeLimit, formatPeriod } from './utils/periodUtils.js';

export const MAX_USAGE_TEMPLATES = 5;

/** Default custom config for a brand-new Custom limit. */
export function defaultCustomConfig() {
  return { maxClaims: 1, scope: 'per_player', unique: true, reset: 'none' };
}

/** Build the limit object stored on an action from a UI custom config. Always resets claims. */
export function buildCustomLimit(customConfig, templateId = undefined) {
  const c = { ...defaultCustomConfig(), ...(customConfig || {}) };
  const limit = {
    type: 'custom',
    maxClaims: c.maxClaims === undefined ? 1 : c.maxClaims,
    scope: c.scope || 'per_player',
    reset: c.reset || 'none',
    claims: []
  };
  if (limit.scope === 'global') limit.unique = c.unique !== false;
  if (limit.reset === 'rolling' || limit.reset === 'fixed_window') limit.periodMs = c.periodMs || 86400000;
  if (limit.reset === 'fixed_window') limit.anchorMs = c.anchorMs || 0;
  if (templateId) limit.templateId = templateId;
  else if (c.templateId) limit.templateId = c.templateId;
  return limit;
}

/** Extract the editable customConfig (no type/claims) from a stored limit. */
export function customConfigFromLimit(limit) {
  if (!limit || limit.type !== 'custom') return defaultCustomConfig();
  const { maxClaims, scope, unique, reset, periodMs, anchorMs, templateId } = limit;
  return { maxClaims, scope, unique, reset, periodMs, anchorMs, templateId };
}

const MAX_CLAIM_PRESETS = [1, 2, 3, 5, 10, 25];

/**
 * Build the ⚙️ Custom usage-limit config screen (Components V2 container).
 * @param {Object} opts
 * @param {string} opts.ctx - encoded "<type>:<buttonId>:<actionIndex>[:<itemId>]" routing context
 * @param {Object} opts.customConfig - the working config { maxClaims, scope, unique, reset, periodMs, anchorMs, templateId }
 * @param {boolean} [opts.templateMode] - true when editing a saved template (shows Delete)
 * @param {string} [opts.templateId] - the template being edited (for Delete)
 * @param {string} [opts.title] - header title override
 * @param {string} [opts.note] - optional note line (e.g. "Applied template X")
 * @returns {Object} { flags, components }
 */
export function buildCustomLimitConfigUI({ ctx, customConfig, templateMode = false, templateId, title, note }) {
  const c = { ...defaultCustomConfig(), ...(customConfig || {}) };
  const isGlobal = c.scope === 'global';
  const isUnlimited = c.maxClaims == null;
  const previewLimit = buildCustomLimit(c);

  const components = [
    { type: 10, content: `## ⚙️ ${title || 'Custom Usage Limit'}` },
    { type: 14 },
    { type: 10, content: `### \`\`\`📊 Summary\`\`\`\n${summarizeLimit(previewLimit)}` }
  ];
  if (note) components.push({ type: 10, content: `-# ${note}` });
  components.push({ type: 14 });

  // Max Claims select
  const maxOptions = MAX_CLAIM_PRESETS.map(n => ({
    label: `${n} claim${n === 1 ? '' : 's'}`, value: `n:${n}`,
    emoji: { name: '🔢' }, default: !isUnlimited && c.maxClaims === n
  }));
  maxOptions.push({ label: 'Unlimited', value: 'inf', emoji: { name: '♾️' }, default: isUnlimited });
  maxOptions.push({ label: 'Other…', value: 'other', emoji: { name: '✏️' }, description: 'Enter a custom number' });
  components.push({ type: 10, content: `### \`\`\`🔢 How many claims?\`\`\`` });
  components.push({ type: 1, components: [{
    type: 3, custom_id: `cl:mc:${ctx}`,
    placeholder: isUnlimited ? 'Unlimited' : `${c.maxClaims} claim(s)`,
    options: maxOptions
  }]});

  // Scope select
  components.push({ type: 10, content: `### \`\`\`👥 Who shares the cap?\`\`\`` });
  components.push({ type: 1, components: [{
    type: 3, custom_id: `cl:sc:${ctx}`,
    options: [
      { label: 'Per Player', value: 'per_player', emoji: { name: '👤' }, description: 'Each player gets their own allowance', default: c.scope === 'per_player' },
      { label: 'Global (shared)', value: 'global', emoji: { name: '🌍' }, description: 'One shared pool across the whole server', default: c.scope === 'global' }
    ]
  }]});

  // Unique select (global only)
  if (isGlobal) {
    components.push({ type: 1, components: [{
      type: 3, custom_id: `cl:un:${ctx}`,
      options: [
        { label: 'Distinct players (recommended)', value: 'unique', emoji: { name: '🎯' }, description: 'N different players — one claim each', default: c.unique !== false },
        { label: 'Total claims', value: 'any', emoji: { name: '🔁' }, description: 'N claims total — one player could take them all', default: c.unique === false }
      ]
    }]});
  }

  // Reset select
  components.push({ type: 10, content: `### \`\`\`🔄 When does it reset?\`\`\`` });
  components.push({ type: 1, components: [{
    type: 3, custom_id: `cl:rs:${ctx}`,
    options: [
      { label: 'Never', value: 'none', emoji: { name: '🔒' }, description: 'Permanent — claims never come back', default: (c.reset || 'none') === 'none' },
      { label: 'Rolling cooldown', value: 'rolling', emoji: { name: '⏱️' }, description: 'Per-claim sliding window (e.g. N per 12h)', default: c.reset === 'rolling' },
      { label: 'Fixed window', value: 'fixed_window', emoji: { name: '🗓️' }, description: 'Shared recurring reset (e.g. daily)', default: c.reset === 'fixed_window' }
    ]
  }]});

  // Timing buttons (only when a reset mode is active)
  if (c.reset === 'rolling' || c.reset === 'fixed_window') {
    const timingRow = { type: 1, components: [
      { type: 2, style: 2, custom_id: `cl:per:${ctx}`, label: c.periodMs ? `Window: ${formatPeriod(c.periodMs)}` : 'Set Window Length', emoji: { name: '📏' } }
    ]};
    if (c.reset === 'fixed_window') {
      const t = c.anchorMs ? new Date(c.anchorMs) : null;
      const hhmm = t ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : 'not set';
      timingRow.components.push({ type: 2, style: 2, custom_id: `cl:rt:${ctx}`, label: `Reset Time: ${hhmm}`, emoji: { name: '🕘' } });
    }
    components.push(timingRow);
  }

  components.push({ type: 14 });

  // Action buttons
  const actionRow = { type: 1, components: [
    { type: 2, style: 2, custom_id: `cl:save:${ctx}`, label: '← Save & Back' }
  ]};
  if (!templateMode) {
    actionRow.components.push({ type: 2, style: 1, custom_id: `cl:savetmpl:${ctx}`, label: 'Save as Template', emoji: { name: '📋' } });
  } else if (templateId) {
    actionRow.components.push({ type: 2, style: 4, custom_id: `cl:deltmpl:${templateId}`, label: 'Delete Template', emoji: { name: '🗑️' } });
  }
  components.push(actionRow);

  return {
    flags: (1 << 15),
    components: [{ type: 17, accent_color: 0x3498DB, components }]
  };
}

// ─── Usage Template storage (safariData[guildId].usageTemplates) ───────────

/** Returns the guild's usageTemplates object (creating the key in memory if absent). */
export function getUsageTemplates(safariData, guildId) {
  if (!safariData[guildId]) return {};
  if (!safariData[guildId].usageTemplates) safariData[guildId].usageTemplates = {};
  return safariData[guildId].usageTemplates;
}

/** Returns templates as an array (for select rendering). */
export function listUsageTemplates(safariData, guildId) {
  return Object.values(getUsageTemplates(safariData, guildId));
}

/**
 * Build the Usage Limit String Select options for an outcome editor, including the
 * ⚙️ Custom option and the guild's saved templates. Loads safariContent internally.
 */
export async function buildLimitSelectOptions({ guildId, currentLimit, periodMs, currentTemplateId, includeCustom = true, limitObj }) {
  const { buildLimitOptions, summarizeLimit } = await import('./utils/periodUtils.js');
  const { loadSafariContent } = await import('./safariManager.js');
  const sd = await loadSafariContent();
  const templates = listUsageTemplates(sd, guildId);
  const customSummary = (limitObj && limitObj.type === 'custom') ? summarizeLimit(limitObj) : undefined;
  return buildLimitOptions({ currentLimit, periodMs, includeCustom, templates, currentTemplateId, customSummary });
}

/**
 * Find every action that references a given templateId.
 * @returns {Array<{buttonId, buttonName, actionIndex, actionType}>}
 */
export function findTemplateUsages(safariData, guildId, templateId) {
  const usages = [];
  const buttons = safariData[guildId]?.buttons || {};
  for (const [buttonId, button] of Object.entries(buttons)) {
    (button.actions || []).forEach((action, idx) => {
      if (action.config?.limit?.type === 'custom' && action.config.limit.templateId === templateId) {
        usages.push({ buttonId, buttonName: button.name || buttonId, actionIndex: idx, actionType: action.type });
      }
    });
  }
  return usages;
}
