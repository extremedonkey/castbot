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

/**
 * Check whether a usage limit blocks this user from executing an outcome.
 * Pure read — does NOT mutate. Pair with recordLimitClaim() after a successful execution.
 * Mirrors the inline check semantics in executeGiveCurrency/executeGiveItem/executeModifyAttribute.
 * @param {Object} limit - The config.limit object ({ type, claimedBy, periodMs })
 * @param {string} userId
 * @param {number} [nowMs] - Current time (injectable for tests)
 * @returns {{ blocked: boolean, reason?: 'once_per_player'|'once_globally'|'once_per_period', remainingMs?: number }}
 */
export function checkLimitGate(limit, userId, nowMs = Date.now()) {
  if (!limit || limit.type === 'unlimited') return { blocked: false };
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
export function buildLimitOptions({ currentLimit, periodMs, periodDescription } = {}) {
  return [
    { label: 'Unlimited', value: 'unlimited', description: 'Can be used infinite times', emoji: { name: '♾️' }, default: currentLimit === 'unlimited' },
    { label: 'Once Per Player', value: 'once_per_player', description: 'Each player can use once', emoji: { name: '👤' }, default: currentLimit === 'once_per_player' },
    { label: 'Once Globally', value: 'once_globally', description: 'Only one player total can use', emoji: { name: '🌍' }, default: currentLimit === 'once_globally' },
    { label: currentLimit === 'once_per_period' && periodMs ? `Once Per Period (${formatPeriod(periodMs)})` : 'Once Per Period', value: 'once_per_period', description: periodDescription || 'Cooldown period before player can reuse', emoji: { name: '⏱️' }, default: currentLimit === 'once_per_period' }
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
