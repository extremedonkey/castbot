/**
 * Tests for the Tribe Planner mockup module.
 * Pure logic only — no Discord, no file I/O. Inline-replicated per testing standards.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────
// Inline replicas of the module's pure helpers
// ─────────────────────────────────────────────

function safeEmoji(raw, fallback) {
  if (typeof raw !== 'string' || !raw) return fallback;
  if (raw.startsWith('<') || raw.includes(':')) return fallback;
  if (raw.length > 4) return fallback;
  if (!/\p{Extended_Pictographic}/u.test(raw)) return fallback;
  return raw;
}

function classifyRound(r) {
  if (!r) return null;
  if (r.fNumber === 1) return 'reunion';
  if (r.ftcRound)      return 'ftc';
  if (r.mergeRound)    return 'merge';
  if (r.swapRound)     return 'swap';
  if (r.hasMarooning ?? (r.marooningDays > 0)) return 'marooning';
  return null;
}

const PHASE_META = {
  marooning: { label: 'Marooning' }, swap: { label: 'Swap' },
  merge: { label: 'Merge' }, ftc: { label: 'FTC' }, reunion: { label: 'Reunion' },
};

function getGamePhases(rounds) {
  if (!rounds) return [];
  const sorted = Object.entries(rounds).sort((a, b) => (a[1].seasonRoundNo || 0) - (b[1].seasonRoundNo || 0));
  let swapN = 0;
  const out = [];
  for (const [rId, r] of sorted) {
    const type = classifyRound(r);
    if (!type) continue;
    let label = PHASE_META[type].label;
    if (type === 'swap') { swapN++; label = r.eventLabel || `Swap ${swapN}`; }
    else if (r.eventLabel) label = r.eventLabel;
    out.push({ id: rId, type, label, roundNo: r.seasonRoundNo, fNumber: r.fNumber });
  }
  return out;
}

function depth(state) {
  if (state.tribeId) return 4;
  if (state.phaseId) return 3;
  if (state.castlistId) return 2;
  if (state.configId) return 1;
  return 0;
}

function navUp(state) {
  if (state.tribeId) state.tribeId = null;
  else if (state.phaseId) state.phaseId = null;
  else if (state.castlistId) state.castlistId = null;
  return state;
}

function describeAction(action, state) {
  const parts = [];
  if (state.configId) parts.push(`season \`${state.configId}\``);
  if (state.castlistId) parts.push(`castlist \`${state.castlistId}\``);
  if (state.phaseId) parts.push(`phase \`${state.phaseId}\``);
  if (state.tribeId) parts.push(`tribe \`${state.tribeId}\``);
  const scope = parts.length ? parts.join(' / ') : '(no scope)';
  switch (action) {
    case 'create_tribe': return `➕ **Create Tribe** (mockup) — would open a modal under ${scope} to create a new Discord role + tribe entry, then attach it to the selected phase.`;
    case 'edit_tribe':   return `✏️ **Edit Tribe** (mockup) — would open the tribe editor (name/emoji/color/vanity roles) for ${scope}.`;
    case 'assign':       return `👥 **Assign Players** (mockup) — would open a multi-select of cast-ranked applicants to attach to ${scope}. Currently selected applicants would be pre-checked.`;
    case 'clone':        return `📋 **Clone From Previous Phase** (mockup) — would copy the tribe → player composition from the previous game phase into ${scope}.`;
    case 'remove':       return `🗑️ **Remove Tribe** (mockup) — would prompt for confirmation, then detach ${scope} from the phase (Discord role kept).`;
    default:             return `Unknown action \`${action}\` for scope ${scope}.`;
  }
}

// ─────────────────────────────────────────────
// safeEmoji — guards Discord COMPONENT_INVALID_EMOJI
// ─────────────────────────────────────────────

describe('safeEmoji — accepts true emoji', () => {
  it('keeps simple unicode emoji', () => {
    assert.equal(safeEmoji('🏕️', '📦'), '🏕️');
    assert.equal(safeEmoji('📅', '📦'), '📅');
    assert.equal(safeEmoji('🔄', '📦'), '🔄');
    assert.equal(safeEmoji('⚠️', '📦'), '⚠️');
  });
});

describe('safeEmoji — rejects unicode symbols (the bug that caused this test file)', () => {
  it('rejects ↻ U+21BB CLOCKWISE OPEN CIRCLE ARROW (caused COMPONENT_INVALID_EMOJI)', () => {
    assert.equal(safeEmoji('↻', '📦'), '📦');
  });
  it('rejects · U+00B7 MIDDLE DOT (caused COMPONENT_INVALID_EMOJI)', () => {
    assert.equal(safeEmoji('·', '📦'), '📦');
  });
  it('rejects ↑ U+2191 UPWARDS ARROW', () => {
    assert.equal(safeEmoji('↑', '📦'), '📦');
  });
  it('rejects ⏎ U+23CE RETURN SYMBOL', () => {
    assert.equal(safeEmoji('⏎', '📦'), '📦');
  });
});

describe('safeEmoji — rejects non-Unicode forms', () => {
  it('falls back for null/undefined/empty', () => {
    assert.equal(safeEmoji(null, 'X'), 'X');
    assert.equal(safeEmoji(undefined, 'X'), 'X');
    assert.equal(safeEmoji('', 'X'), 'X');
  });
  it('falls back for custom Discord emoji strings (need {id,name} shape)', () => {
    assert.equal(safeEmoji('<:foo:12345>', 'X'), 'X');
    assert.equal(safeEmoji('<a:anim:67890>', 'X'), 'X');
  });
  it('falls back for shortcodes', () => {
    assert.equal(safeEmoji(':apple:', 'X'), 'X');
  });
  it('falls back for plain text', () => {
    assert.equal(safeEmoji('hello', 'X'), 'X');
    assert.equal(safeEmoji('a', 'X'), 'X');
  });
  it('falls back for strings longer than 4 chars (custom emoji refs sneak through otherwise)', () => {
    assert.equal(safeEmoji('🏕️🏕️🏕️', 'X'), 'X');
  });
});

// ─────────────────────────────────────────────
// classifyRound — phase priority order
// ─────────────────────────────────────────────

describe('classifyRound — priority order matters', () => {
  it('null/undefined → null', () => {
    assert.equal(classifyRound(null), null);
    assert.equal(classifyRound(undefined), null);
  });
  it('fNumber 1 → reunion (highest priority)', () => {
    assert.equal(classifyRound({ fNumber: 1, ftcRound: true }), 'reunion');
  });
  it('ftcRound → ftc (overrides merge/swap/marooning)', () => {
    assert.equal(classifyRound({ fNumber: 3, ftcRound: true, mergeRound: true }), 'ftc');
  });
  it('mergeRound → merge (overrides swap/marooning)', () => {
    assert.equal(classifyRound({ fNumber: 10, mergeRound: true, swapRound: true }), 'merge');
  });
  it('swapRound → swap (overrides marooning)', () => {
    assert.equal(classifyRound({ fNumber: 16, swapRound: true, hasMarooning: true }), 'swap');
  });
  it('hasMarooning true → marooning', () => {
    assert.equal(classifyRound({ fNumber: 18, hasMarooning: true }), 'marooning');
  });
  it('legacy: marooningDays > 0 with no hasMarooning → marooning', () => {
    assert.equal(classifyRound({ fNumber: 18, marooningDays: 1 }), 'marooning');
  });
  it('plain challenge round → null (filtered out)', () => {
    assert.equal(classifyRound({ fNumber: 15 }), null);
  });
});

// ─────────────────────────────────────────────
// getGamePhases — swap counter + filtering
// ─────────────────────────────────────────────

describe('getGamePhases — extracts only phase rounds', () => {
  it('returns empty for missing rounds', () => {
    assert.deepEqual(getGamePhases(null), []);
    assert.deepEqual(getGamePhases({}), []);
  });

  it('filters out plain challenge rounds, keeps phases', () => {
    const rounds = {
      r1:  { seasonRoundNo: 1,  fNumber: 18, hasMarooning: true },
      r2:  { seasonRoundNo: 2,  fNumber: 17 },                       // plain — dropped
      r3:  { seasonRoundNo: 3,  fNumber: 16, swapRound: true },
      r4:  { seasonRoundNo: 4,  fNumber: 15 },                       // plain — dropped
      r5:  { seasonRoundNo: 5,  fNumber: 14, swapRound: true },
      r9:  { seasonRoundNo: 9,  fNumber: 10, mergeRound: true },
      r16: { seasonRoundNo: 16, fNumber: 3,  ftcRound: true },
      r17: { seasonRoundNo: 17, fNumber: 1 },                         // reunion
    };
    const phases = getGamePhases(rounds);
    assert.equal(phases.length, 6);
    assert.deepEqual(phases.map(p => p.type), ['marooning', 'swap', 'swap', 'merge', 'ftc', 'reunion']);
  });

  it('numbers swaps in seasonRoundNo order (Swap 1 before Swap 2)', () => {
    const rounds = {
      r5: { seasonRoundNo: 5, fNumber: 14, swapRound: true },  // intentionally out of insertion order
      r3: { seasonRoundNo: 3, fNumber: 16, swapRound: true },
    };
    const phases = getGamePhases(rounds);
    assert.equal(phases[0].id, 'r3');
    assert.equal(phases[0].label, 'Swap 1');
    assert.equal(phases[1].id, 'r5');
    assert.equal(phases[1].label, 'Swap 2');
  });

  it('uses round.eventLabel when set (host can rename "Swap 1" → "The Great Shuffle")', () => {
    const rounds = {
      r3: { seasonRoundNo: 3, fNumber: 16, swapRound: true, eventLabel: 'The Great Shuffle' },
    };
    assert.equal(getGamePhases(rounds)[0].label, 'The Great Shuffle');
  });
});

// ─────────────────────────────────────────────
// State machine: depth + navigation
// ─────────────────────────────────────────────

describe('depth — state level calculation', () => {
  it('empty state → 0', () => assert.equal(depth({}), 0));
  it('configId only → 1 (season)', () => assert.equal(depth({ configId: 'c' }), 1));
  it('+ castlistId → 2 (castlist)', () => assert.equal(depth({ configId: 'c', castlistId: 'cl' }), 2));
  it('+ phaseId → 3 (phase)', () => assert.equal(depth({ configId: 'c', castlistId: 'cl', phaseId: 'r3' }), 3));
  it('+ tribeId → 4 (tribe)', () => assert.equal(depth({ configId: 'c', castlistId: 'cl', phaseId: 'r3', tribeId: 't' }), 4));
});

describe('navUp — pops one level at a time', () => {
  it('tribe → phase', () => {
    const s = navUp({ configId: 'c', castlistId: 'cl', phaseId: 'r3', tribeId: 't' });
    assert.equal(depth(s), 3);
    assert.equal(s.tribeId, null);
    assert.equal(s.phaseId, 'r3');
  });
  it('phase → castlist', () => {
    const s = navUp({ configId: 'c', castlistId: 'cl', phaseId: 'r3' });
    assert.equal(depth(s), 2);
  });
  it('castlist → season (configId stays — only hierarchy clears)', () => {
    const s = navUp({ configId: 'c', castlistId: 'cl' });
    assert.equal(depth(s), 1);
    assert.equal(s.configId, 'c');
  });
  it('season-only → no-op (configId is set via season select, not nav)', () => {
    const s = navUp({ configId: 'c' });
    assert.equal(depth(s), 1);
  });
});

// ─────────────────────────────────────────────
// describeAction — preview surface area
// ─────────────────────────────────────────────

describe('describeAction — ephemeral preview text', () => {
  const fullScope = { configId: 'config_X', castlistId: 'cl_Y', phaseId: 'r3', tribeId: 't1' };

  it('all 5 actions return preview text including the scope', () => {
    for (const action of ['create_tribe', 'edit_tribe', 'assign', 'clone', 'remove']) {
      const out = describeAction(action, fullScope);
      assert.match(out, /mockup/);
      assert.match(out, /config_X/);
      assert.match(out, /t1/);
    }
  });

  it('empty state shows "(no scope)"', () => {
    assert.match(describeAction('create_tribe', {}), /\(no scope\)/);
  });

  it('unknown action falls through to a generic message (not silent failure)', () => {
    assert.match(describeAction('zzz_unknown', { configId: 'c' }), /Unknown action/);
  });
});
