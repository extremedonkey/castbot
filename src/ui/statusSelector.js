/**
 * StatusSelector — reusable status-picker string select (Components V2).
 *
 * Use for any entity lifecycle where a host picks one of N states (2-25)
 * and the UI needs to UPDATE-in-place. Configurable labels/emojis/descriptions
 * so it isn't challenge-specific.
 *
 * Current consumers:
 *   - Challenge status (src/handlers/... via app.js challenge_status_* handlers)
 *
 * Spec: docs/01-RaP/0918_20260420_RoundStateManagement_Analysis.md
 */

const DEFAULT_ACCENT = 0x5865F2;

/**
 * @typedef {Object} StatusOption
 * @property {string} value - Persisted state value (e.g. 'active')
 * @property {string} label - User-visible label (e.g. 'Start Challenge')
 * @property {string} [emoji] - Unicode emoji; wrapped as { name } at render time
 * @property {string} [description] - Second-line hint shown in select
 */

/**
 * Build a status-picker screen (Container + heading + select + back button).
 *
 * @param {Object} opts
 * @param {string} opts.customId - custom_id for the string select
 * @param {string} opts.title - Heading text (already formatted, e.g. '# ✏️ ...')
 * @param {string} [opts.description] - Optional body text under the title
 * @param {number} [opts.accentColor] - Container accent; defaults to Discord blurple
 * @param {string} [opts.currentValue] - Value to mark `default: true` in the select
 * @param {StatusOption[]} opts.options - 2-25 options
 * @param {string} [opts.placeholder] - Select placeholder text
 * @param {Object} opts.backButton - { customId, label } — Secondary back button
 * @param {boolean} [opts.showCurrentStateBadge=false] - When true, render a code-block heading
 *        labelled by `currentStateLabel` between the description and the select. Useful when the
 *        currently-set value needs to stand out at a glance.
 * @param {string} [opts.currentStateLabel='Current Status'] - Text shown inside the code-block
 *        heading when `showCurrentStateBadge` is true.
 * @returns {{ components: [{ type: 17, accent_color: number, components: object[] }] }}
 */
export function buildStatusSelector({
  customId,
  title,
  description = '',
  accentColor = DEFAULT_ACCENT,
  currentValue = null,
  options,
  placeholder = 'Select a status...',
  backButton,
  showCurrentStateBadge = false,
  currentStateLabel = 'Current Status',
}) {
  if (!Array.isArray(options) || options.length < 2 || options.length > 25) {
    throw new Error(`StatusSelector: options must be 2-25 entries (got ${options?.length})`);
  }
  if (!customId) throw new Error('StatusSelector: customId is required');
  if (!backButton?.customId) throw new Error('StatusSelector: backButton.customId is required');

  const selectOptions = options.map(opt => ({
    label: String(opt.label).slice(0, 100),
    value: opt.value,
    description: opt.description ? String(opt.description).slice(0, 100) : undefined,
    emoji: opt.emoji ? { name: opt.emoji } : undefined,
    ...(opt.value === currentValue ? { default: true } : {}),
  }));

  // Current-state badge: a code-block heading signalling "here's what's set now." Rendered
  // between the description and the first separator. The select itself already shows the
  // current option's emoji via `default: true`, so we don't duplicate the emoji here.
  const components = [
    { type: 10, content: title },
    ...(description ? [{ type: 10, content: description }] : []),
    ...(showCurrentStateBadge ? [
      { type: 10, content: `### \`\`\`${currentStateLabel}\`\`\`` },
    ] : []),
    { type: 14 },
    { type: 1, components: [{
      type: 3,
      custom_id: customId,
      placeholder,
      min_values: 1,
      max_values: 1,
      options: selectOptions,
    }]},
    { type: 14 },
    { type: 1, components: [
      { type: 2, custom_id: backButton.customId, label: backButton.label || '← Back', style: 2 }
    ]},
  ];

  return {
    components: [{
      type: 17,
      accent_color: accentColor,
      components,
    }]
  };
}
