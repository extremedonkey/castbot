/**
 * 📜 Policy screen (merged ToS + Privacy) — imports the REAL module (pure UI builder).
 *
 * Locks in two hard requirements:
 * 1. Discord compliance: an explicit "Privacy Policy" heading must exist (it was
 *    lost once in the 2026-08-08 text merge and had to be restored).
 * 2. The 4000-char combined Text Display cap — the two original screens totalled
 *    4293 and had to be condensed; this stops copy edits from creeping back over.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyScreen } from '../src/ui/policyScreen.js';

const container = buildPolicyScreen().components[0];
const textBlocks = container.components.filter(c => c.type === 10).map(c => c.content);

describe('Policy screen — merged ToS + Privacy', () => {
  it('is a single Container of Text Displays, Separators and one Action Row', () => {
    assert.equal(container.type, 17);
    const types = new Set(container.components.map(c => c.type));
    assert.deepEqual([...types].sort(), [1, 10, 14]);
  });

  it('carries explicit h1 headings for BOTH documents (Discord compliance callout)', () => {
    const all = textBlocks.join('\n');
    assert.match(all, /^# 📜 Terms of Service$/m);
    assert.match(all, /^# 🔒 Privacy Policy$/m);
  });

  it('total displayable text stays under the 4000-char Components V2 cap (with headroom)', () => {
    const total = textBlocks.reduce((sum, t) => sum + t.length, 0);
    assert.ok(total <= 3900, `Policy text is ${total} chars — cap is 4000 and headroom is required`);
  });

  it('back button returns to Settings (its parent menu)', () => {
    const row = container.components.find(c => c.type === 1);
    assert.equal(row.components[0].custom_id, 'castbot_settings');
  });

  it('stays within the 40-component limit by a wide margin', () => {
    assert.ok(container.components.length + 1 <= 20);
  });
});
