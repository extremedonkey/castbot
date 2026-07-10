/**
 * SAFARI IMPORT/EXPORT — CRAFTING + LIMIT FIDELITY RATCHET
 *
 * Born from the 2026-07-11 gap analysis: every export filter in
 * safariImportExport.js is a hard allowlist, so any Action/config field added
 * AFTER a filter was written silently falls out of exports. That is exactly
 * how crafting recipes (menuVisibility: 'crafting_menu', Jan 2026) exported
 * fine but arrived invisible — the whitelist predated the field — and how
 * 'custom' usage limits exported as {type:'custom'} and imported as UNLIMITED
 * (maxClaims null → Infinity in checkCustomGate).
 *
 * Layer 1 (ratchet): statically scan safariImportExport.js and fail if the
 * crafting/menu-surface fields or the custom-limit config fields disappear
 * from their filter functions. If you rename a field, update BOTH the filter
 * and this test consciously — do NOT delete assertions.
 *
 * Layer 2 (behavior): replicate the pure limit filter/init logic inline (repo
 * testing convention — avoids importing safariManager via the module) and
 * verify the export→import round trip preserves the gate while resetting
 * claim tracking.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(__dirname, '..', 'safariImportExport.js'), 'utf8');

/** Slice the body of a top-level function declaration out of the source. */
function functionBlock(name) {
  const start = SOURCE.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `function ${name} not found in safariImportExport.js — scan is broken or function renamed`);
  const rest = SOURCE.slice(start + 1);
  const next = rest.search(/\n(?:export )?(?:async )?function /);
  return next === -1 ? SOURCE.slice(start) : SOURCE.slice(start, start + 1 + next);
}

describe('Safari Import/Export — crafting fields survive export (whitelist ratchet)', () => {
  const block = functionBlock('filterCustomActionsForExport');

  for (const field of ['menuVisibility', 'inventoryConfig', 'linkedItems', 'displayMode']) {
    it(`filterCustomActionsForExport whitelists ${field}`, () => {
      assert.ok(block.includes(field),
        `${field} missing from filterCustomActionsForExport — exported actions will silently lose it ` +
        `(crafting/player-menu placement breaks on import)`);
    });
  }

  it('resolves legacy showInInventory to menuVisibility at export time', () => {
    assert.ok(/showInInventory\s*\?\s*'player_menu'/.test(block),
      'legacy showInInventory resolution missing — pre-menuVisibility actions would export as hidden');
  });
});

describe('Safari Import/Export — safariConfig crafting terms (whitelist ratchet)', () => {
  const block = functionBlock('filterConfigForExport');

  for (const field of ['craftingName', 'craftingEmoji', 'enableGlobalCommands']) {
    it(`filterConfigForExport whitelists ${field}`, () => {
      assert.ok(block.includes(field), `${field} missing from filterConfigForExport`);
    });
  }

  it('does not export the defunct showGlobalCommandsButton field', () => {
    assert.ok(!block.includes('showGlobalCommandsButton'),
      'showGlobalCommandsButton exists nowhere else in the codebase — the live field is enableGlobalCommands');
  });
});

describe('Safari Import/Export — custom usage-limit config survives export (whitelist ratchet)', () => {
  const block = functionBlock('filterActionForExport');

  for (const field of ['maxClaims', 'scope', 'unique', 'reset', 'anchorMs']) {
    it(`filterActionForExport preserves custom limit ${field}`, () => {
      assert.ok(block.includes(field),
        `${field} missing from filterActionForExport — custom limits import as unlimited without it`);
    });
  }

  it('still strips runtime claim tracking (claims/claimedBy must NOT be whitelisted)', () => {
    assert.ok(!/exportLimit\.(claims|claimedBy)\b/.test(block),
      'export must never carry claim tracking — imports would arrive pre-claimed');
  });

  it('initializeActionLimitTracking resets custom limits to an empty claims array', () => {
    const initBlock = functionBlock('initializeActionLimitTracking');
    assert.ok(/limitType === 'custom'/.test(initBlock) && /claims = \[\]/.test(initBlock),
      "custom limit branch missing — imported custom limits need claims: [] initialized");
  });

  it('import update path preserves menuVisibility when the import lacks it (old export formats)', () => {
    assert.ok(/buttonData\.menuVisibility === undefined/.test(SOURCE),
      're-importing an old-format export must not strip actions out of the Crafting/Player menus');
  });
});

// ─── Layer 2: behavioral round trip (logic replicated inline per TestingStandards.md) ───

function filterLimitForExport(limit) {
  const exportLimit = { type: limit.type };
  if (limit.type === 'once_per_period' && limit.periodMs) exportLimit.periodMs = limit.periodMs;
  if (limit.type === 'custom') {
    if (limit.maxClaims !== undefined) exportLimit.maxClaims = limit.maxClaims;
    if (limit.scope !== undefined) exportLimit.scope = limit.scope;
    if (limit.unique !== undefined) exportLimit.unique = limit.unique;
    if (limit.reset !== undefined) exportLimit.reset = limit.reset;
    if (limit.periodMs !== undefined) exportLimit.periodMs = limit.periodMs;
    if (limit.anchorMs !== undefined) exportLimit.anchorMs = limit.anchorMs;
  }
  return exportLimit;
}

function initializeLimitTracking(limit) {
  const l = { ...limit };
  if (l.type === 'once_globally') l.claimedBy = null;
  else if (l.type === 'once_per_player') l.claimedBy = [];
  else if (l.type === 'once_per_period') l.claimedBy = {};
  else if (l.type === 'custom') l.claims = [];
  return l;
}

describe('Safari Import/Export — custom limit round trip behavior', () => {
  it('a "3 per player, rolling 1d" custom limit survives export→import with claims reset', () => {
    const live = {
      type: 'custom', maxClaims: 3, scope: 'per_player', reset: 'rolling',
      periodMs: 86400000, templateId: 'tpl_abc',
      claims: [{ u: '123', t: 1750000000000 }, { u: '456', t: 1750000001000 }]
    };
    const imported = initializeLimitTracking(filterLimitForExport(live));
    assert.deepEqual(imported, {
      type: 'custom', maxClaims: 3, scope: 'per_player', reset: 'rolling',
      periodMs: 86400000, claims: []
    });
  });

  it('a "5 unique players, global, fixed window" custom limit keeps its gate config', () => {
    const live = {
      type: 'custom', maxClaims: 5, scope: 'global', unique: true,
      reset: 'fixed_window', periodMs: 3600000, anchorMs: 1750000000000, claims: []
    };
    const imported = initializeLimitTracking(filterLimitForExport(live));
    assert.equal(imported.maxClaims, 5);
    assert.equal(imported.unique, true);
    assert.equal(imported.reset, 'fixed_window');
    assert.equal(imported.anchorMs, 1750000000000);
    assert.deepEqual(imported.claims, []);
  });

  it('preset limits are unchanged: once_per_player exports type-only, imports with fresh claimedBy', () => {
    const live = { type: 'once_per_player', claimedBy: ['123', '456'] };
    const imported = initializeLimitTracking(filterLimitForExport(live));
    assert.deepEqual(imported, { type: 'once_per_player', claimedBy: [] });
  });

  it('once_per_period keeps periodMs, resets claimedBy map', () => {
    const live = { type: 'once_per_period', periodMs: 7200000, claimedBy: { 123: 1750000000000 } };
    const imported = initializeLimitTracking(filterLimitForExport(live));
    assert.deepEqual(imported, { type: 'once_per_period', periodMs: 7200000, claimedBy: {} });
  });
});
