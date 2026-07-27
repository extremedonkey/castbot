/**
 * ⭐ CastBot Premium mockup — gating and placement tests.
 *
 * The Premium button is a Reece-only entry point in the Production Menu's
 * Advanced row (in front of Donate). Because the Production Menu can be posted
 * PUBLICLY via viral_menu, render-time hiding is not security: the handler in
 * app.js must keep its ID-array gate BEFORE ButtonHandlerFactory.create (same
 * pattern as reeces_stuff). The tripwire below fails if that gate is removed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', 'app.js');
const MENU_BUILDER_JS = path.join(__dirname, '..', 'menuBuilder.js');

const GATED_IDS = ['391415444084490240', '1086246253819613274'];

// Replicated from createProductionMenuInterface (app.js) — Advanced row build.
function advancedRowIds(userId) {
  return [
    ...(GATED_IDS.includes(userId) ? ['castbot_premium'] : []),
    'prod_donate', 'castbot_settings', 'castbot_tools', 'prod_setup_wizard'
  ];
}

describe('prod /menu Advanced row — ⭐ CastBot Premium placement', () => {
  it('Premium is first (in front of Donate) for both gated IDs', () => {
    for (const id of GATED_IDS) {
      const row = advancedRowIds(id);
      assert.equal(row[0], 'castbot_premium', `gated ID ${id} → Premium at index 0`);
      assert.equal(row[1], 'prod_donate', 'Donate immediately after Premium');
      assert.equal(row.length, 5);
    }
  });

  it('Premium is absent for everyone else', () => {
    for (const userId of ['123456789012345678', undefined, null, '']) {
      const row = advancedRowIds(userId);
      assert.ok(!row.includes('castbot_premium'), `userId ${userId} must not see Premium`);
      assert.equal(row[0], 'prod_donate');
      assert.equal(row.length, 4);
    }
  });

  it('row never exceeds the Discord 5-button ActionRow cap', () => {
    assert.ok(advancedRowIds(GATED_IDS[0]).length <= 5);
    assert.ok(advancedRowIds('someone-else').length <= 5);
  });
});

describe('Security tripwire — castbot_premium handler gate', () => {
  const source = readFileSync(APP_JS, 'utf8');

  it('handler keeps the ID-array gate BEFORE ButtonHandlerFactory.create', () => {
    const lines = source.split('\n');
    const handlerIdx = lines.findIndex(l => l.includes("custom_id === 'castbot_premium'"));
    assert.ok(handlerIdx >= 0, 'castbot_premium handler not found in app.js');
    const factoryOffset = lines.slice(handlerIdx).findIndex(l => l.includes('ButtonHandlerFactory.create'));
    assert.ok(factoryOffset > 0, 'castbot_premium handler no longer uses ButtonHandlerFactory');
    const beforeFactory = lines.slice(handlerIdx, handlerIdx + factoryOffset).join('\n');
    assert.ok(GATED_IDS.every(id => beforeFactory.includes(id)),
      'castbot_premium lost its pre-factory ID gate — the prod menu can be PUBLIC via viral_menu, ' +
      'so anyone could open Premium. Restore the reeces_stuff-style gate before ButtonHandlerFactory.create.');
  });
});

describe('Premium menu clone — stays wired in menuBuilder.js', () => {
  const source = readFileSync(MENU_BUILDER_JS, 'utf8');

  it('premium_menu registry entry points at a defined buildPremiumMenu builder', () => {
    assert.ok(source.includes("'premium_menu'"), 'premium_menu missing from MENU_REGISTRY');
    assert.ok(/builder:\s*'buildPremiumMenu'/.test(source), 'premium_menu registry entry lost its builder');
    assert.ok(/static buildPremiumMenu\s*\(/.test(source), 'buildPremiumMenu static not defined');
  });

  it('premium clone keeps its own title, distinct from Tools', () => {
    assert.ok(source.includes('⭐ CastBot | Premium'), 'premium title changed/missing');
    assert.ok(source.includes('🪛 CastBot | Tools'), 'tools title changed/missing — clone test assumptions stale');
  });
});
