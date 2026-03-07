/**
 * Rich Card UI — shared builders for title/content/color/image modals and previews.
 *
 * Use this whenever you need a Discord modal that captures visual card fields
 * (title, content/description, accent color, image URL) and/or a Components V2
 * container that renders them as a rich card preview.
 */

// ---------------------------------------------------------------------------
// Color parsing (consolidates 5+ copies across the codebase)
// ---------------------------------------------------------------------------

/**
 * Parse a user-supplied color string into a Discord accent_color integer.
 * Accepts: "#3498db", "3498db", "0x3498db", 3447003 (number), "3447003" (decimal string).
 * Returns null for invalid/empty input (never throws).
 */
export function parseAccentColor(input) {
  if (input === null || input === undefined) return null;

  // Already an integer
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 && input <= 0xFFFFFF ? input : null;
  }

  const str = String(input).trim();
  if (!str) return null;

  // Hex with or without # / 0x prefix
  const hexMatch = str.replace(/^(#|0x)/i, '');
  if (/^[0-9A-Fa-f]{6}$/.test(hexMatch)) {
    return parseInt(hexMatch, 16);
  }

  // Plain decimal string (e.g. "3447003")
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    return n >= 0 && n <= 0xFFFFFF ? n : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Modal builder
// ---------------------------------------------------------------------------

/**
 * Build a Discord modal (type 9 response) for editing rich card fields.
 *
 * @param {Object} options
 * @param {string}  options.customId    - Modal custom_id
 * @param {string}  options.modalTitle  - Modal title bar text
 * @param {Object}  [options.values]    - Pre-fill values { title, content, color, image }
 * @param {Object}  [options.fields]    - Per-field overrides (label, placeholder, required, maxLength, style)
 * @param {Array}   [options.extraFields] - Additional { customId, label, placeholder, ... } appended after the 4 core fields
 * @param {boolean} [options.useLabelWrap=true] - Use type-18 Label wrapper (Components V2 modal style). Set false for legacy ActionRow+TextInput.
 * @returns {{ type: 9, data: Object }} Ready-to-return modal interaction response
 */
export function buildRichCardModal({
  customId,
  modalTitle,
  values = {},
  fields = {},
  extraFields = [],
  useLabelWrap = true,
}) {
  const fieldDefs = [
    {
      id: 'title',
      label: 'Title',
      placeholder: 'e.g., "Welcome to the Adventure!"',
      required: false,
      maxLength: 100,
      style: 1, // Short
    },
    {
      id: 'content',
      label: 'Content',
      placeholder: 'The text to display...',
      required: true,
      maxLength: 2000,
      style: 2, // Paragraph
    },
    {
      id: 'color',
      label: 'Accent Color (optional)',
      placeholder: 'e.g., #3498db or ff5722',
      required: false,
      maxLength: 10,
      style: 1,
    },
    {
      id: 'image',
      label: 'Image URL (optional)',
      placeholder: 'Enter link of an image you have uploaded to Discord.',
      required: false,
      maxLength: 500,
      style: 1,
    },
  ];

  // Apply per-field overrides
  for (const def of fieldDefs) {
    const overrides = fields[def.id];
    if (overrides) {
      if (overrides.label !== undefined)       def.label       = overrides.label;
      if (overrides.placeholder !== undefined) def.placeholder = overrides.placeholder;
      if (overrides.required !== undefined)    def.required    = overrides.required;
      if (overrides.maxLength !== undefined)   def.maxLength   = overrides.maxLength;
      if (overrides.style !== undefined)       def.style       = overrides.style;
    }
  }

  // Append extra fields
  for (const extra of extraFields) {
    fieldDefs.push({
      id: extra.customId || extra.id,
      label: extra.label,
      placeholder: extra.placeholder || '',
      required: extra.required ?? false,
      maxLength: extra.maxLength || 500,
      style: extra.style || 1,
      value: extra.value || '',
    });
  }

  // Build components
  const components = fieldDefs.map((def) => {
    const val = def.value !== undefined ? def.value : (values[def.id] || '');

    if (useLabelWrap) {
      // Components V2 modal style (type 18 Label)
      const textInput = {
        type: 4,
        custom_id: def.id,
        style: def.style,
        required: def.required,
        max_length: def.maxLength,
        placeholder: def.placeholder,
      };
      if (val) textInput.value = val;
      return { type: 18, label: def.label, component: textInput };
    }

    // Legacy ActionRow + TextInput style (discord.js ModalBuilder compatible)
    const textInput = {
      type: 4,
      custom_id: def.id,
      label: def.label,
      style: def.style,
      required: def.required,
      max_length: def.maxLength,
      placeholder: def.placeholder,
    };
    if (val) textInput.value = val;
    return { type: 1, components: [textInput] };
  });

  return {
    type: 9, // MODAL
    data: {
      custom_id: customId,
      title: modalTitle,
      components,
    },
  };
}

// ---------------------------------------------------------------------------
// Modal response extractor
// ---------------------------------------------------------------------------

/**
 * Extract rich card values from a modal submit interaction's form data.
 * Works with both ActionRow-wrapped and Label-wrapped modal components.
 *
 * @param {Object} formData - The interaction `data` object (has .components)
 * @returns {{ title: string, content: string, color: string, image: string, extra: Object }}
 */
export function extractRichCardValues(formData) {
  const result = { title: '', content: '', color: '', image: '', extra: {} };
  const coreIds = new Set(['title', 'content', 'color', 'image']);

  for (const row of formData.components || []) {
    // ActionRow-wrapped: row.components[0].custom_id / .value
    // Label-wrapped: row.component.custom_id / .value
    const input = row.components?.[0] || row.component;
    if (!input) continue;

    const id = input.custom_id;
    const value = (input.value || '').trim();

    if (coreIds.has(id)) {
      result[id] = value;
    } else {
      result.extra[id] = value;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Container (preview) builder
// ---------------------------------------------------------------------------

/**
 * Build a Components V2 Container that renders a rich card preview.
 *
 * @param {Object} options
 * @param {string}  [options.title]    - Card title (rendered as `# title`)
 * @param {string}  [options.content]  - Card body text (markdown)
 * @param {string|number} [options.color] - Accent color (hex string or integer)
 * @param {string}  [options.image]    - Image URL for Media Gallery
 * @param {Array}   [options.extraComponents] - Additional components inserted before the end
 * @returns {{ type: 17, components: Array, accent_color?: number }} Container object
 */
export function buildRichCardContainer({ title, content, color, image, extraComponents = [] }) {
  const components = [];

  if (title) {
    components.push({ type: 10, content: `# ${title}` });
  }

  if (content) {
    components.push({ type: 10, content });
  }

  if (image && image.trim()) {
    try {
      new URL(image); // Validate URL format
      components.push({
        type: 12, // Media Gallery
        items: [{ media: { url: image }, description: title || 'Image' }],
      });
    } catch {
      // Invalid URL — skip silently rather than showing "Image failed to load"
    }
  }

  // Insert any extra components (buttons, separators, etc.)
  components.push(...extraComponents);

  const container = { type: 17, components };

  const parsed = parseAccentColor(color);
  if (parsed !== null) {
    container.accent_color = parsed;
  }

  return container;
}

/**
 * Build a full interaction response wrapping a rich card container.
 * Convenience wrapper that adds the IS_COMPONENTS_V2 flag.
 *
 * @param {Object} cardOptions - Same options as buildRichCardContainer
 * @param {Object} [responseOptions]
 * @param {boolean} [responseOptions.ephemeral=false] - Add ephemeral flag
 * @returns {{ flags: number, components: Array }}
 */
export function buildRichCardResponse(cardOptions, responseOptions = {}) {
  const container = buildRichCardContainer(cardOptions);
  let flags = 1 << 15; // IS_COMPONENTS_V2
  if (responseOptions.ephemeral) {
    flags |= 1 << 6; // EPHEMERAL
  }
  return { flags, components: [container] };
}
