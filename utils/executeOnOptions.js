/**
 * executeOnOptions.js — the single source of truth for the "when does this outcome run?"
 * vocabulary (`action.executeOn` on a Safari outcome).
 *
 * WHY THIS EXISTS: the same three-way choice was hand-written at 6+ call sites with three
 * different wordings ("Execute if all conditions are true", "…are TRUE", "Outcome runs when
 * player passes conditions") and two different emoji sets (✅/❌ vs 🟢/🔴). Terminology here
 * is expected to change again, so every screen composes its select from these builders
 * rather than restating the copy.
 *
 * Pure — no I/O, no Discord imports. Safe to unit test and to call from modal builders.
 */

/** Canonical `action.executeOn` values. */
export const EXECUTE_ON = {
  TRUE: 'true',
  FALSE: 'false',
  ALWAYS: 'always'
};

/** The default when an outcome doesn't specify one (legacy outcomes have no field at all). */
export const DEFAULT_EXECUTE_ON = EXECUTE_ON.TRUE;

/**
 * The user-facing terminology. Change copy HERE and every screen follows.
 * `short` is for dense contexts (action list rows, summaries); `label` is for select options.
 */
export const EXECUTE_ON_TERMS = {
  [EXECUTE_ON.TRUE]: {
    emoji: '🟢',
    label: 'All conditions are true',
    short: 'conditions true',
    description: 'Runs only when this action\'s conditions pass'
  },
  [EXECUTE_ON.FALSE]: {
    emoji: '🔴',
    label: 'All conditions are false',
    short: 'conditions false',
    description: 'Runs only when this action\'s conditions fail'
  },
  [EXECUTE_ON.ALWAYS]: {
    emoji: '🔵',
    label: 'Always, regardless of conditions',
    short: 'always',
    description: 'Runs on every trigger, before the pass/fail outcomes'
  }
};

/**
 * Coerce any stored/incoming value to a valid executeOn. Anything unrecognised (including
 * `undefined` on pre-executeOn outcomes) becomes the default, matching the runtime engine's
 * `action.executeOn || 'true'` behaviour in executeButtonActions().
 * @param {*} value
 * @returns {'true'|'false'|'always'}
 */
export function normalizeExecuteOn(value) {
  return value === EXECUTE_ON.FALSE || value === EXECUTE_ON.ALWAYS ? value : DEFAULT_EXECUTE_ON;
}

/** The emoji for an executeOn value — used to tag outcome rows and config headers. */
export function executeOnEmoji(value) {
  return EXECUTE_ON_TERMS[normalizeExecuteOn(value)].emoji;
}

/** Short label ("conditions true") for dense summaries. */
export function executeOnShortLabel(value) {
  return EXECUTE_ON_TERMS[normalizeExecuteOn(value)].short;
}

/**
 * Build the String Select options for choosing an outcome's executeOn.
 *
 * @param {Object}  [opts]
 * @param {string}  [opts.current='true']      Currently-selected value (gets `default: true`).
 * @param {boolean} [opts.includeAlways=false] Offer the "always" branch. Pass true when the
 *   outcome already lives in the Always section, so rendering a two-option select can't
 *   silently demote it to a conditional outcome.
 * @param {boolean} [opts.markDefault=true]    Suffix " (default)" on the default option.
 * @returns {Array<Object>} Discord String Select options
 */
export function buildExecuteOnOptions({ current = DEFAULT_EXECUTE_ON, includeAlways = false, markDefault = true } = {}) {
  const selected = normalizeExecuteOn(current);
  const values = includeAlways || selected === EXECUTE_ON.ALWAYS
    ? [EXECUTE_ON.TRUE, EXECUTE_ON.FALSE, EXECUTE_ON.ALWAYS]
    : [EXECUTE_ON.TRUE, EXECUTE_ON.FALSE];

  return values.map(value => {
    const term = EXECUTE_ON_TERMS[value];
    const isDefault = value === DEFAULT_EXECUTE_ON;
    return {
      label: markDefault && isDefault ? `${term.label} (default)` : term.label,
      value,
      description: term.description,
      emoji: { name: term.emoji },
      default: value === selected
    };
  });
}

/**
 * Radio Group (type 21) options for the SAME choice, for use inside modals.
 *
 * Why a separate builder rather than reusing the select options — two documented modal
 * behaviours make them incompatible (docs/standards/ComponentsV2.md):
 *   1. A String Select's option `default` is IGNORED in modals, so nothing pre-selects.
 *      A Radio Group's `default` DOES work — it's the only way to show the current value.
 *   2. A Radio Group pre-selects only if exactly ONE option carries `default` and the
 *      siblings OMIT the key entirely. An explicit `default: false` on a sibling silently
 *      suppresses pre-selection for the whole group.
 * Radio options also carry no `emoji` field (no working example in the codebase uses one,
 * and an unsupported field rejects the entire modal), so the emoji rides in the label.
 *
 * @param {Object}  [opts] — same shape as buildExecuteOnOptions
 * @returns {Array<Object>} Radio Group options
 */
export function buildExecuteOnRadioOptions({ current = DEFAULT_EXECUTE_ON, includeAlways = false, markDefault = true } = {}) {
  return buildExecuteOnOptions({ current, includeAlways, markDefault }).map(opt => ({
    label: `${EXECUTE_ON_TERMS[opt.value].emoji} ${opt.label}`.slice(0, 100),
    value: opt.value,
    description: opt.description,
    // ONLY the selected option may carry the key — see (2) above
    ...(opt.default ? { default: true } : {})
  }));
}

/**
 * Convert any String Select option list into Radio Group options, applying the same two
 * rules as above. Used for the usage-limit field, whose options come from periodUtils.
 * @param {Array<Object>} options - select options (may carry emoji and default: false)
 * @returns {Array<Object>} Radio Group options (max 10 — Discord's cap)
 */
export function toRadioOptions(options) {
  return (options || []).slice(0, 10).map(opt => ({
    label: `${opt.emoji?.name ? `${opt.emoji.name} ` : ''}${opt.label}`.slice(0, 100),
    value: opt.value,
    ...(opt.description ? { description: String(opt.description).slice(0, 100) } : {}),
    ...(opt.default ? { default: true } : {})
  }));
}
