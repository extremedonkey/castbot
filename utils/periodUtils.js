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
