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

describe('Safari Import/Export — item game-mechanics fields survive export (whitelist ratchet)', () => {
  const block = functionBlock('filterItemsForExport');

  for (const field of ['staminaBoost', 'reverseBlacklist', 'attributeModifiers']) {
    it(`filterItemsForExport whitelists ${field}`, () => {
      assert.ok(block.includes(field),
        `${field} missing from filterItemsForExport — stamina consumables / blacklist-bypass / stat items break on import`);
    });
  }
});

describe('Safari Import/Export — map grid safety on import (ratchet)', () => {
  it('import never overwrites an existing map gridSize (drives movement bounds on old maps)', () => {
    assert.ok(/if \(!existingMap\.gridSize\)/.test(SOURCE),
      'gridSize overwrite guard missing — importing a bigger template would let players move into channel-less coordinates');
  });

  it('import validates coordinates and blacklist against the active map grid', () => {
    assert.ok(/isCoordInGrid\(coord, targetDims\)/.test(SOURCE) && /out_of_grid_blacklist/.test(SOURCE),
      'out-of-grid filtering missing — orphan coordinates/blacklist entries would import silently');
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

// Replicated from safariImportExport.js resolveGridDimensions/isCoordInGrid (pure)
function resolveGridDimensions(map) {
  if (!map) return null;
  if (map.gridWidth > 0 && map.gridHeight > 0) return { width: map.gridWidth, height: map.gridHeight };
  if (typeof map.gridSize === 'number' && map.gridSize > 0) return { width: map.gridSize, height: map.gridSize };
  if (typeof map.gridSize === 'string') {
    const match = map.gridSize.match(/^(\d+)x(\d+)$/i);
    if (match) return { width: parseInt(match[1]), height: parseInt(match[2]) };
  }
  return null;
}

function isCoordInGrid(coord, dims) {
  const match = /^([A-Z])(\d+)$/.exec(String(coord).trim().toUpperCase());
  if (!match) return false;
  const col = match[1].charCodeAt(0) - 65;
  const row = parseInt(match[2]);
  return col >= 0 && col < dims.width && row >= 1 && row <= dims.height;
}

describe('Safari Import/Export — grid dimension resolution and coordinate bounds', () => {
  it('prefers gridWidth/gridHeight (modern maps, incl. non-square 7x8)', () => {
    assert.deepEqual(resolveGridDimensions({ gridWidth: 7, gridHeight: 8, gridSize: 8 }), { width: 7, height: 8 });
  });

  it('falls back to numeric gridSize (old maps — the movement-bounds case)', () => {
    assert.deepEqual(resolveGridDimensions({ gridSize: 3 }), { width: 3, height: 3 });
  });

  it('tolerates legacy "7x7" string gridSize', () => {
    assert.deepEqual(resolveGridDimensions({ gridSize: '7x7' }), { width: 7, height: 7 });
  });

  it('returns null for unknown shapes (validation is skipped, never guessed)', () => {
    assert.equal(resolveGridDimensions({}), null);
    assert.equal(resolveGridDimensions(null), null);
    assert.equal(resolveGridDimensions({ gridSize: 'weird' }), null);
  });

  it("the user's scenario: D5 is out of grid on a 3x3 map, C3 is in", () => {
    const dims = resolveGridDimensions({ gridSize: 3 });
    assert.equal(isCoordInGrid('D5', dims), false);
    assert.equal(isCoordInGrid('C3', dims), true);
    assert.equal(isCoordInGrid('A1', dims), true);
    assert.equal(isCoordInGrid('C4', dims), false);  // column in, row out
    assert.equal(isCoordInGrid('D3', dims), false);  // row in, column out
  });

  it('rejects malformed coordinates rather than crashing', () => {
    const dims = { width: 7, height: 7 };
    assert.equal(isCoordInGrid('', dims), false);
    assert.equal(isCoordInGrid('5D', dims), false);
    assert.equal(isCoordInGrid('global', dims), false);
  });
});

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

// ─── v2 export format: envelope, package, replace mode (ratchets) ───

describe('Safari Import/Export v2 — format constants & component map (ratchet)', () => {
  it('declares the export format identifier and version', () => {
    assert.ok(SOURCE.includes("SAFARI_EXPORT_FORMAT = 'castbot-safari-export'"),
      'export format identifier changed/removed — import detection breaks for existing files');
    assert.ok(/SAFARI_EXPORT_VERSION = 2\b/.test(SOURCE),
      'bumping SAFARI_EXPORT_VERSION requires a conscious migration path — see detectImportFormat');
  });

  for (const compId of ['stores', 'items', 'actions', 'settings', 'mapData', 'mapImage']) {
    it(`COMPONENT_MAP declares "${compId}"`, () => {
      assert.ok(new RegExp(`${compId}:\\s*\\{`).test(SOURCE),
        `COMPONENT_MAP lost component "${compId}" — granular export UI and import derivation break`);
    });
  }

  it('actions component maps to the customActions data key (sourced from guildData.buttons)', () => {
    assert.ok(/actions:\s*\{ dataKey: 'customActions'/.test(SOURCE),
      'actions↔customActions mapping is load-bearing for legacy compatibility');
  });
});

describe('Safari Import/Export v2 — replace mode clears the right things (ratchet)', () => {
  const block = functionBlock('applyReplaceClears');

  it('never touches player-progress or out-of-scope sections', () => {
    for (const preserved of ['entityPoints', 'roundHistory', 'priorityRoles', 'attributeDefinitions', 'enemies']) {
      assert.ok(!block.includes(preserved),
        `applyReplaceClears references ${preserved} — replace must never clear player progress / out-of-scope data`);
    }
  });

  it('clears attackQueue when custom actions are replaced (orphaned-attack safety)', () => {
    assert.ok(/attackQueue = \{\}/.test(block),
      'queued attacks referencing replaced items must be reset (same reason Reset Game clears it)');
  });

  it('re-attaches the three runtime config fields exports never carry', () => {
    for (const field of ['currentRound', 'lastRoundTimestamp', 'safariLogChannelId']) {
      assert.ok(block.includes(field),
        `replace-mode config swap must preserve runtime field ${field}`);
    }
  });

  it('preserves per-cell runtime plumbing via spread (channelId/anchorMessageId/navigation/fogMapUrl)', () => {
    assert.ok(/\.\.\.coordData/.test(block),
      'cell reset must spread the existing cell first — otherwise channels/anchors/fog are severed');
  });

  it('importSafariData only enters replace mode on an explicit option', () => {
    assert.ok(/options\.mode === 'replace'/.test(SOURCE),
      "replace must be opt-in — default mode is merge");
  });
});

describe('Safari Import/Export v2 — package image handling (ratchet)', () => {
  it('package image lookup is whitelist-restricted (never arbitrary archive names)', () => {
    assert.ok(/PACKAGE_IMAGE_WHITELIST = \['assets\/map\.png', 'assets\/map\.jpg', 'assets\/map\.jpeg'\]/.test(SOURCE),
      'image asset whitelist changed — arbitrary entry names must never be consulted');
  });

  it('map image resolution probes the _updated variants first (updateMapImage never updates imageFile)', () => {
    const block = functionBlock('resolveMapImage');
    assert.ok(block.includes('_updated.jpg') && block.includes('_updated.png'),
      'resolveMapImage must check _updated.* before imageFile or exports ship a stale map');
  });
});

// ─── v2 behavioral replicas (pure logic, replicated inline per TestingStandards.md) ───

// Replicated from safariImportExport.js detectImportFormat
const FORMAT_ID = 'castbot-safari-export';
const FORMAT_VERSION = 2;
function detectFormat(buffer) {
  const sig = buffer.length >= 4 ? buffer.readUInt32LE(0) : 0;
  if (sig === 0x04034b50 || sig === 0x06054b50) return { format: 'package' };
  let obj;
  try { obj = JSON.parse(buffer.toString('utf8')); }
  catch { throw new Error('This file is not a recognised Safari export (not valid JSON or a ZIP package).'); }
  if (obj && typeof obj === 'object' && obj.format === FORMAT_ID) {
    const v = obj.formatVersion;
    if (!Number.isInteger(v) || v < 1) throw new Error('This Safari export has an invalid format version.');
    if (v > FORMAT_VERSION) throw new Error(`format version ${v} unsupported`);
    return { format: 'envelope', payload: obj };
  }
  const legacyKeys = ['stores', 'items', 'safariConfig', 'maps', 'customActions'];
  if (obj && typeof obj === 'object' && legacyKeys.some(k => obj[k])) return { format: 'legacy', payload: obj };
  throw new Error('This file is not a recognised Safari export.');
}

describe('Safari Import/Export v2 — format detection matrix', () => {
  it('zip magic bytes → package', () => {
    assert.equal(detectFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])).format, 'package');
  });

  it('v2 envelope JSON → envelope', () => {
    const buf = Buffer.from(JSON.stringify({ format: FORMAT_ID, formatVersion: 2, data: { items: {} } }));
    assert.equal(detectFormat(buf).format, 'envelope');
  });

  it('bare 5-key JSON → legacy (v1 files keep importing)', () => {
    const buf = Buffer.from(JSON.stringify({ stores: { s1: {} }, items: { i1: {} } }));
    assert.equal(detectFormat(buf).format, 'legacy');
  });

  it('newer format version → clear unsupported-version error', () => {
    const buf = Buffer.from(JSON.stringify({ format: FORMAT_ID, formatVersion: 4, data: {} }));
    assert.throws(() => detectFormat(buf), /version 4 unsupported/);
  });

  it('unrelated JSON → not-a-safari-export error', () => {
    assert.throws(() => detectFormat(Buffer.from('{"hello":"world"}')), /not a recognised Safari export/);
  });

  it('garbage bytes → clear error, no crash', () => {
    assert.throws(() => detectFormat(Buffer.from('not json at all')), /not a recognised Safari export/);
  });
});

// Replicated from safariImportExport.js planSafariImport sectionPlan
function sectionPlan(importObj, currentObj) {
  const ids = Object.keys(importObj || {});
  const update = ids.filter(id => currentObj?.[id]).length;
  return { incoming: ids.length, create: ids.length - update, update };
}

describe('Safari Import/Export v2 — import planner create/update counting', () => {
  it('splits incoming ids into create vs update by destination intersection', () => {
    const incoming = { a: {}, b: {}, c: {} };
    const dest = { b: {}, z: {} };
    assert.deepEqual(sectionPlan(incoming, dest), { incoming: 3, create: 2, update: 1 });
  });

  it('empty/missing sections plan to zero (partial imports never fail on absent categories)', () => {
    assert.deepEqual(sectionPlan(undefined, { a: {} }), { incoming: 0, create: 0, update: 0 });
    assert.deepEqual(sectionPlan({}, undefined), { incoming: 0, create: 0, update: 0 });
  });
});

// Replicated from safariImportExport.js applyReplaceClears (cell reset semantics)
function replaceClearCell(coord, coordData) {
  return {
    ...coordData,
    baseContent: { title: coord, description: `You are at grid location ${coord}.`, image: null, clues: [] },
    buttons: [],
    stores: [],
    hiddenCommands: {},
    cellType: 'unexplored',
    discovered: false,
    specialEvents: [],
    metadata: { ...coordData.metadata, lastModified: 0 }
  };
}

describe('Safari Import/Export v2 — dynamic-handler routing exclusions (ratchet)', () => {
  // app.js ~4899: the dynamic Custom Action handler catches ANY safari_* custom_id with
  // ≥4 underscore-separated parts unless excluded — every static safari_* id with ≥4
  // parts MUST be in its exclusion list or clicks die with "Button not found"
  // (RaP 0992 organic-growth parsing debt; this bit us on 2026-07-17 with the
  // import preview buttons). These assertions pin the exclusions.
  const APP_SOURCE = readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  for (const prefix of ['safari_import_', 'safari_export_']) {
    it(`dynamic safari handler excludes ${prefix}* ids`, () => {
      assert.ok(APP_SOURCE.includes(`!custom_id.startsWith('${prefix}')`),
        `${prefix}* exclusion missing from the dynamic Custom Action handler — ` +
        `import/export preview buttons would be swallowed and report "Button not found"`);
    });
  }
});

describe('Safari Import/Export v2 — replace-mode cell reset preserves runtime plumbing', () => {
  it('clears content, keeps channelId/anchorMessageId/navigation/fogMapUrl/emoji', () => {
    const live = {
      channelId: '123', anchorMessageId: '456', emoji: '🌴',
      navigation: { north: { to: 'A1' } }, fogMapUrl: 'https://cdn/x.png',
      baseContent: { title: 'Beach', description: 'Sandy', image: 'x', clues: ['c'] },
      buttons: ['btn1'], stores: ['store1'], hiddenCommands: { dig: {} },
      cellType: 'treasure', discovered: true, specialEvents: ['evt'],
      metadata: { createdAt: 1 }
    };
    const cleared = replaceClearCell('A2', live);
    assert.equal(cleared.channelId, '123');
    assert.equal(cleared.anchorMessageId, '456');
    assert.equal(cleared.emoji, '🌴');
    assert.deepEqual(cleared.navigation, { north: { to: 'A1' } });
    assert.equal(cleared.fogMapUrl, 'https://cdn/x.png');
    assert.deepEqual(cleared.buttons, []);
    assert.deepEqual(cleared.stores, []);
    assert.equal(cleared.discovered, false);
    assert.equal(cleared.baseContent.title, 'A2');
    assert.equal(cleared.metadata.createdAt, 1);
  });
});
