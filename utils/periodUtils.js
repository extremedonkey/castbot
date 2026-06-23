/**
 * Shared time period utilities for cooldown periods and scheduling.
 * Used by: once_per_period usage limits, Custom Action scheduling.
 */

/**
 * Format milliseconds to human-readable period string.
 * @param {number} ms - Period in milliseconds
 * @returns {string} e.g. "1d 12h 0m", "12h 30m", "5m"
 */
export function formatPeriod(ms) {
  if (!ms || ms <= 0) return '0m';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

/**
 * Format a *remaining* countdown, rounding UP to the nearest minute.
 * A 11-minute timer should read "11m" the instant it's set (not "10m" because a few ms elapsed),
 * and tick down 11m → 10m → … → 1m → (then "0m" / expired). Use this for "X remaining" displays;
 * use formatPeriod() for fixed durations like "every 5m".
 * @param {number} ms
 * @returns {string} e.g. "11m", "1h 59m", "2d 3h 0m"
 */
export function formatCountdown(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalMinutes = Math.ceil(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

/**
 * Parse period values from modal submit components.
 * Supports both Label (type 18) and legacy ActionRow formats.
 * @param {Array} components - Modal submit components array
 * @param {Object} [fieldIds] - Custom field ID mapping
 * @param {string} [fieldIds.days='period_days']
 * @param {string} [fieldIds.hours='period_hours']
 * @param {string} [fieldIds.minutes='period_minutes']
 * @returns {{ days: number, hours: number, minutes: number, totalMs: number }}
 */
export function parsePeriodFromModal(components, fieldIds = {}) {
  const ids = {
    days: fieldIds.days || 'period_days',
    hours: fieldIds.hours || 'period_hours',
    minutes: fieldIds.minutes || 'period_minutes'
  };
  let days = 0, hours = 0, minutes = 0;
  for (const comp of components) {
    const child = comp.component || comp.components?.[0];
    if (!child) continue;
    if (child.custom_id === ids.days) days = parseInt(child.value?.trim()) || 0;
    if (child.custom_id === ids.hours) hours = parseInt(child.value?.trim()) || 0;
    if (child.custom_id === ids.minutes) minutes = parseInt(child.value?.trim()) || 0;
  }
  const totalMs = (days * 86400000) + (hours * 3600000) + (minutes * 60000);
  return { days, hours, minutes, totalMs };
}

// ─────────────────────────────────────────────────────────────────────────
// Custom usage-limit engine (type: 'custom')
// Orthogonal dimensions: maxClaims (N|null) × scope (per_player|global) ×
// unique (global only) × reset (none|rolling|fixed_window).
// Tracking lives in limit.claims = [{ u: userId, t: claimMs }] — NEVER claimedBy.
// Window index is derived from each claim's timestamp; never stored.
// See RaP docs/01-RaP/0905_20260623_CustomUsageLimits_Analysis.md
// ─────────────────────────────────────────────────────────────────────────

/** Which fixed window a timestamp falls into. Pure integer floor. */
export function windowIndexOf(t, anchorMs, periodMs) {
  if (!periodMs) return 0;
  return Math.floor((t - anchorMs) / periodMs);
}

/** Claims still "live" given the reset mode (lazy reset — stale claims ignored). */
function relevantClaims(limit, nowMs) {
  const claims = Array.isArray(limit.claims) ? limit.claims : [];
  if (limit.reset === 'fixed_window') {
    const cur = windowIndexOf(nowMs, limit.anchorMs || 0, limit.periodMs || 0);
    return claims.filter(c => windowIndexOf(c.t, limit.anchorMs || 0, limit.periodMs || 0) === cur);
  }
  if (limit.reset === 'rolling') {
    return claims.filter(c => (nowMs - c.t) < (limit.periodMs || 0));
  }
  return claims; // reset: 'none'
}

/** Drop stale claims (prior window / older than rolling period). Mutates in place. */
export function pruneCustomClaims(limit, nowMs = Date.now()) {
  if (!limit || limit.type !== 'custom' || !Array.isArray(limit.claims)) return;
  if (limit.reset === 'none' || !limit.reset) return;
  limit.claims = relevantClaims(limit, nowMs);
}

/** ms until the current fixed window ends (next reset boundary). */
function windowResetMs(limit, nowMs) {
  const idx = windowIndexOf(nowMs, limit.anchorMs || 0, limit.periodMs || 0);
  return (limit.anchorMs || 0) + (idx + 1) * (limit.periodMs || 0) - nowMs;
}

/** Public: claims still "live" for a custom limit (lazy-reset view) — used by the admin Claims UI. */
export function relevantCustomClaims(limit, nowMs = Date.now()) {
  return relevantClaims(limit, nowMs);
}

/** Public: ms until the current fixed window resets (0 if not a fixed_window). */
export function customWindowResetMs(limit, nowMs = Date.now()) {
  if (!limit || limit.reset !== 'fixed_window') return 0;
  return windowResetMs(limit, nowMs);
}

/**
 * Evaluate a custom limit. Returns the same verdict shape as checkLimitGate.
 * @returns {{ blocked, reason?, remaining?: {claimsLeft, windowResetMs?, cooldownMs?} }}
 */
function checkCustomGate(limit, userId, nowMs) {
  const max = (limit.maxClaims == null) ? Infinity : limit.maxClaims;
  const rel = relevantClaims(limit, nowMs);
  const timing = () => {
    const r = {};
    if (limit.reset === 'fixed_window' || limit.reset === 'rolling') r.periodMs = limit.periodMs || 0;
    if (limit.reset === 'fixed_window') r.windowResetMs = windowResetMs(limit, nowMs);
    if (limit.reset === 'rolling' && rel.length) r.cooldownMs = Math.min(...rel.map(c => c.t)) + (limit.periodMs || 0) - nowMs;
    return r;
  };

  if (limit.scope === 'per_player') {
    const mine = rel.filter(c => c.u === userId);
    if (mine.length >= max) {
      const r = { claimsLeft: 0, ...timing() };
      // rolling cooldown should reflect THIS player's earliest live claim
      if (limit.reset === 'rolling' && mine.length) r.cooldownMs = Math.min(...mine.map(c => c.t)) + (limit.periodMs || 0) - nowMs;
      return { blocked: true, reason: limit.reset === 'fixed_window' ? 'custom_window' : (limit.reset === 'rolling' ? 'custom_cooldown' : 'custom_exhausted'), remaining: r };
    }
    return { blocked: false, remaining: { claimsLeft: max === Infinity ? Infinity : max - mine.length, ...timing() } };
  }

  // global scope
  if (limit.unique) {
    const distinct = new Set(rel.map(c => c.u));
    if (distinct.has(userId)) {
      return { blocked: true, reason: 'custom_already_claimed', remaining: { claimsLeft: Math.max(0, max - distinct.size), ...timing() } };
    }
    if (distinct.size >= max) {
      return { blocked: true, reason: limit.reset === 'fixed_window' ? 'custom_window' : 'custom_exhausted', remaining: { claimsLeft: 0, ...timing() } };
    }
    return { blocked: false, remaining: { claimsLeft: max === Infinity ? Infinity : max - distinct.size, ...timing() } };
  }
  // global + non-unique: total claims
  if (rel.length >= max) {
    return { blocked: true, reason: limit.reset === 'fixed_window' ? 'custom_window' : 'custom_exhausted', remaining: { claimsLeft: 0, ...timing() } };
  }
  return { blocked: false, remaining: { claimsLeft: max === Infinity ? Infinity : max - rel.length, ...timing() } };
}

/**
 * Check whether a usage limit blocks this user from executing an outcome.
 * Pure read — does NOT mutate. Pair with recordLimitClaim() after a successful execution.
 * Mirrors the inline check semantics in executeGiveCurrency/executeGiveItem/executeModifyAttribute.
 * @param {Object} limit - The config.limit object ({ type, claimedBy, periodMs } or custom shape)
 * @param {string} userId
 * @param {number} [nowMs] - Current time (injectable for tests)
 * @returns {{ blocked: boolean, reason?: string, remainingMs?: number, remaining?: object }}
 */
export function checkLimitGate(limit, userId, nowMs = Date.now()) {
  if (!limit || limit.type === 'unlimited') return { blocked: false };
  if (limit.type === 'custom') return checkCustomGate(limit, userId, nowMs);
  const claimedBy = limit.claimedBy;

  if (limit.type === 'once_per_player') {
    const claimedList = Array.isArray(claimedBy) ? claimedBy : (claimedBy ? [claimedBy] : []);
    if (claimedList.includes(userId)) return { blocked: true, reason: 'once_per_player' };
    return { blocked: false };
  }

  if (limit.type === 'once_globally') {
    // Empty arrays/strings are truthy but mean "no claims" — check actual content.
    const hasClaims = Array.isArray(claimedBy) ? claimedBy.length > 0
      : typeof claimedBy === 'string' ? claimedBy.length > 0
      : false;
    if (hasClaims) return { blocked: true, reason: 'once_globally' };
    return { blocked: false };
  }

  if (limit.type === 'once_per_period') {
    const lastUsed = (typeof claimedBy === 'object' && !Array.isArray(claimedBy)) ? claimedBy?.[userId] : undefined;
    if (lastUsed && (nowMs - lastUsed < limit.periodMs)) {
      return { blocked: true, reason: 'once_per_period', remainingMs: limit.periodMs - (nowMs - lastUsed) };
    }
    return { blocked: false };
  }

  return { blocked: false };
}

/**
 * Record a usage claim on a limit object after a successful execution.
 * Mutates limit.claimedBy in place (polymorphic by type) — caller persists via saveSafariContent().
 * Mirrors the inline claim semantics in executeGiveCurrency/executeGiveItem/executeModifyAttribute.
 * @param {Object} limit - The config.limit object (mutated in place)
 * @param {string} userId
 * @param {number} [nowMs] - Current time (injectable for tests)
 */
export function recordLimitClaim(limit, userId, nowMs = Date.now()) {
  if (!limit || limit.type === 'unlimited') return;

  if (limit.type === 'custom') {
    if (!Array.isArray(limit.claims)) limit.claims = [];
    limit.claims.push({ u: userId, t: nowMs });
    pruneCustomClaims(limit, nowMs);
    return;
  }

  if (limit.type === 'once_per_player') {
    if (!Array.isArray(limit.claimedBy)) limit.claimedBy = [];
    if (!limit.claimedBy.includes(userId)) limit.claimedBy.push(userId);
  } else if (limit.type === 'once_globally') {
    limit.claimedBy = userId;
  } else if (limit.type === 'once_per_period') {
    if (!limit.claimedBy || typeof limit.claimedBy !== 'object' || Array.isArray(limit.claimedBy)) {
      limit.claimedBy = {};
    }
    limit.claimedBy[userId] = nowMs;
  }
}

/**
 * Build usage limit options for string selects and radio groups.
 * Single source of truth — used by all outcome editors and quick create modals.
 * @param {Object} [options]
 * @param {string} [options.currentLimit] - Currently selected limit type (for default marking)
 * @param {number} [options.periodMs] - Period in ms (for dynamic label on once_per_period)
 * @param {string} [options.periodDescription] - Override description for once_per_period option
 * @returns {Array} Array of select option objects
 */
export function buildLimitOptions({ currentLimit, periodMs, periodDescription, includeCustom = true, templates = [], currentTemplateId, customSummary } = {}) {
  const options = [
    { label: 'Unlimited', value: 'unlimited', description: 'Can be used infinite times', emoji: { name: '♾️' }, default: currentLimit === 'unlimited' },
    { label: 'Once Per Player', value: 'once_per_player', description: 'Each player can use once', emoji: { name: '👤' }, default: currentLimit === 'once_per_player' },
    { label: 'Once Globally', value: 'once_globally', description: 'Only one player total can use', emoji: { name: '🌍' }, default: currentLimit === 'once_globally' },
    { label: currentLimit === 'once_per_period' && periodMs ? `Once Per Period (${formatPeriod(periodMs)})` : 'Once Per Period', value: 'once_per_period', description: periodDescription || 'Cooldown period before player can reuse', emoji: { name: '⏱️' }, default: currentLimit === 'once_per_period' }
  ];
  if (includeCustom) {
    // When a Custom limit is already configured on this outcome, surface its summary so the
    // admin can see the current settings without opening the sub-screen.
    const customDesc = (currentLimit === 'custom' && !currentTemplateId && customSummary)
      ? `Current: ${customSummary}`
      : 'N players, global caps, fixed time windows & more';
    options.push({ label: 'Custom…', value: 'custom', description: customDesc.slice(0, 100), emoji: { name: '⚙️' }, default: currentLimit === 'custom' && !currentTemplateId });
  }
  // Saved server templates (max 5) — each a one-click reusable Custom config
  for (const t of (templates || []).slice(0, 5)) {
    options.push({
      label: (t.name || 'Template').slice(0, 100),
      value: `tmpl:${t.id}`,
      description: summarizeLimit({ type: 'custom', ...(t.config || {}) }).slice(0, 100),
      emoji: t.emoji ? { name: t.emoji } : { name: '📋' },
      default: currentLimit === 'custom' && currentTemplateId === t.id
    });
  }
  return options;
}

/**
 * Human-readable one-line summary of any limit object (for UI + claims display).
 * @param {Object} limit
 * @returns {string}
 */
export function summarizeLimit(limit) {
  if (!limit || limit.type === 'unlimited' || !limit.type) return 'Unlimited';
  if (limit.type === 'once_per_player') return 'Once per player';
  if (limit.type === 'once_globally') return 'Once globally (one player total)';
  if (limit.type === 'once_per_period') return `Once per ${formatPeriod(limit.periodMs)} (per player)`;
  if (limit.type === 'custom') {
    const n = (limit.maxClaims == null) ? '∞' : limit.maxClaims;
    const who = limit.scope === 'global'
      ? (limit.unique ? `${n} unique player${n === 1 ? '' : 's'} (global)` : `${n} total claim${n === 1 ? '' : 's'} (global)`)
      : `${n} per player`;
    let when = '';
    if (limit.reset === 'fixed_window') when = `, resets every ${formatPeriod(limit.periodMs)}`;
    else if (limit.reset === 'rolling') when = `, rolling ${formatPeriod(limit.periodMs)} cooldown`;
    return `${who}${when}`;
  }
  return String(limit.type);
}

/**
 * Compute an absolute anchor timestamp from an hh:mm reset time-of-day.
 * Returns the MOST RECENT occurrence of hh:mm at/before nowMs (server-local time),
 * so a fixed window is active immediately on save and we don't care if the time
 * already passed today. Used for reset: 'fixed_window'.
 * @param {number} hours 0-23
 * @param {number} minutes 0-59
 * @param {number} [nowMs]
 * @returns {number} absolute epoch ms of the most-recent hh:mm boundary
 */
export function anchorMsFromHHMM(hours, minutes, nowMs = Date.now()) {
  const d = new Date(nowMs);
  d.setHours(hours, minutes, 0, 0);
  let anchor = d.getTime();
  if (anchor > nowMs) anchor -= 86400000; // hh:mm later today → use yesterday's occurrence
  return anchor;
}

/**
 * Build a Label+TextInput modal component pair for an hh:mm reset time.
 * @param {Object} [opts]
 * @param {string} [opts.fieldPrefix='resettime']
 * @param {number} [opts.currentAnchorMs]
 * @returns {Array} Label components (Hours, Minutes)
 */
export function buildResetTimeModalComponents(opts = {}) {
  const { fieldPrefix = 'resettime', currentAnchorMs } = opts;
  let curH = '', curM = '';
  if (currentAnchorMs) {
    const d = new Date(currentAnchorMs);
    curH = String(d.getHours());
    curM = String(d.getMinutes());
  }
  return [
    {
      type: 18, label: 'Reset Hour (0-23)', description: 'Server-local time-of-day the window resets at',
      component: { type: 4, custom_id: `${fieldPrefix}_hours`, style: 1, placeholder: '9', max_length: 2, required: true, ...(curH !== '' ? { value: curH } : {}) }
    },
    {
      type: 18, label: 'Reset Minute (0-59)', description: 'Leave 0 for on-the-hour',
      component: { type: 4, custom_id: `${fieldPrefix}_minutes`, style: 1, placeholder: '0', max_length: 2, required: false, ...(curM !== '' ? { value: curM } : {}) }
    }
  ];
}

/**
 * Build modal components for period input (Days, Hours, Minutes).
 * @param {Object} [options]
 * @param {string} [options.fieldPrefix='period'] - Prefix for field custom_ids
 * @param {number} [options.currentPeriodMs=0] - Current period for pre-fill
 * @returns {Array} Array of Label+TextInput components for modal
 */
export function buildPeriodModalComponents(options = {}) {
  const { fieldPrefix = 'period', currentPeriodMs = 0 } = options;
  const currentDays = Math.floor(currentPeriodMs / 86400000);
  const currentHours = Math.floor((currentPeriodMs % 86400000) / 3600000);
  const currentMinutes = Math.floor((currentPeriodMs % 3600000) / 60000);

  return [
    {
      type: 18, // Label
      label: 'Days',
      description: '0-30 days (leave empty for 0)',
      component: {
        type: 4, // Text Input
        custom_id: `${fieldPrefix}_days`,
        style: 1,
        placeholder: '0',
        max_length: 2,
        required: false,
        ...(currentDays > 0 ? { value: String(currentDays) } : {})
      }
    },
    {
      type: 18,
      label: 'Hours',
      description: '0-23 hours (leave empty for 0)',
      component: {
        type: 4,
        custom_id: `${fieldPrefix}_hours`,
        style: 1,
        placeholder: '0',
        max_length: 2,
        required: false,
        ...(currentHours > 0 ? { value: String(currentHours) } : {})
      }
    },
    {
      type: 18,
      label: 'Minutes',
      description: '0-59 minutes (leave empty for 0)',
      component: {
        type: 4,
        custom_id: `${fieldPrefix}_minutes`,
        style: 1,
        placeholder: '0',
        max_length: 2,
        required: false,
        ...(currentMinutes > 0 ? { value: String(currentMinutes) } : {})
      }
    }
  ];
}
