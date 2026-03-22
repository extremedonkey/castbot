/**
 * Shared Color Utilities
 * Color presets, validation, and conversion functions used across CastBot.
 * Originally in tribeDataUtils.js — extracted for reuse by tribes, custom reacts, etc.
 */

/**
 * Color presets — mirrors Discord's role color picker palette.
 * Used by any modal StringSelect that needs quick color selection.
 * Last entry 'custom' is a sentinel for freeform hex input.
 */
export const COLOR_PRESETS = [
  { value: '#1ABC9C', label: 'Teal',        emoji: '🩵' },
  { value: '#2ECC71', label: 'Green',       emoji: '🟢' },
  { value: '#3498DB', label: 'Blue',        emoji: '🔵' },
  { value: '#9B59B6', label: 'Purple',      emoji: '🟣' },
  { value: '#E91E63', label: 'Pink',        emoji: '🩷' },
  { value: '#F1C40F', label: 'Yellow',      emoji: '🟡' },
  { value: '#E67E22', label: 'Orange',      emoji: '🟠' },
  { value: '#E74C3C', label: 'Red',         emoji: '🔴' },
  { value: '#95A5A6', label: 'Light Grey',  emoji: '⚪' },
  { value: '#607D8B', label: 'Blue Grey',   emoji: '🔘' },
  { value: '#11806A', label: 'Dark Teal',   emoji: '🌲' },
  { value: '#1F8B4C', label: 'Dark Green',  emoji: '🌿' },
  { value: '#206694', label: 'Dark Blue',   emoji: '🫐' },
  { value: '#71368A', label: 'Dark Purple', emoji: '🍇' },
  { value: '#AD1457', label: 'Dark Pink',   emoji: '🌺' },
  { value: '#C27C0E', label: 'Dark Gold',   emoji: '🥇' },
  { value: '#A84300', label: 'Dark Orange', emoji: '🍂' },
  { value: '#992D22', label: 'Dark Red',    emoji: '🧱' },
  { value: '#FFFFFF', label: 'White',       emoji: '⬜' },
  { value: 'custom',  label: 'Custom...',  emoji: '🎨' },
];

/**
 * Format Discord role color integer to hex string
 * @param {number} color - Discord color integer
 * @returns {string} Hex color string in format #RRGGBB
 */
export function formatRoleColor(color) {
  if (!color || color === 0) return '#000000';
  const hex = color.toString(16).padStart(6, '0');
  return `#${hex}`;
}

/**
 * Validate and format hex color (with or without #)
 * @param {string} color - Color string to validate
 * @returns {string|null} Formatted #RRGGBB color or null if invalid
 */
export function validateHexColor(color) {
  if (!color) return null;
  const hex = color.replace('#', '').trim();
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const fullHex = hex.length === 3
    ? hex.split('').map(c => c + c).join('')
    : hex;
  return `#${fullHex.toUpperCase()}`;
}

/**
 * Convert hex color string to Discord integer
 * @param {string} hex - Hex color string (#RRGGBB or RRGGBB)
 * @returns {number} Integer color value for Discord API
 */
export function hexToColorInt(hex) {
  if (!hex) return 0;
  return parseInt(hex.replace('#', ''), 16) || 0;
}
