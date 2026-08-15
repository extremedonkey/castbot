/**
 * 🧭 Menu origin — premium-launched feature screens must return to Premium, not Tools.
 *
 * Reece 2026-08-16: every feature opened from the CastBot Premium menu (Attributes,
 * Archiver, Emoji Editor, Category Post…) hard-codes `castbot_tools` as its back button,
 * so "back" dumped the admin in the legacy Tools menu. The fix is an in-memory origin
 * map (src/ui/menuOrigin.js, channelsOrigin precedent) + one interception in the
 * castbot_tools handler. These tests cover the map's lifecycle and statically pin the
 * three wiring points (menuBuilder set/clear, app.js intercept) so none silently drops.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setPremiumOrigin, clearPremiumOrigin, isFromPremium, __resetMenuOrigins } from '../src/ui/menuOrigin.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('menuOrigin — the map lifecycle', () => {
  beforeEach(() => __resetMenuOrigins());

  it('Premium render marks the user; Tools/Production render clears them', () => {
    setPremiumOrigin('123');
    assert.equal(isFromPremium('123'), true);
    clearPremiumOrigin('123');
    assert.equal(isFromPremium('123'), false);
  });

  it('is per-user — one admin in Premium does not hijack another in Tools', () => {
    setPremiumOrigin('123');
    assert.equal(isFromPremium('456'), false);
  });

  it('tolerates numeric ids and null/undefined without throwing', () => {
    setPremiumOrigin(123);
    assert.equal(isFromPremium('123'), true, 'numeric and string ids are the same user');
    setPremiumOrigin(null);
    clearPremiumOrigin(undefined);
    assert.equal(isFromPremium(null), false);
  });

  it('the intended flow: Premium → feature → back re-enters Premium; after ← Menu, Tools opens Tools', () => {
    // Premium menu renders → origin set
    setPremiumOrigin('u');
    // feature screen → back (castbot_tools) → intercepted → premium re-renders → sets again
    assert.equal(isFromPremium('u'), true);
    setPremiumOrigin('u');
    // ← Menu → production menu renders → clears
    clearPremiumOrigin('u');
    // Tools button now genuinely opens Tools
    assert.equal(isFromPremium('u'), false);
  });
});

describe('menuOrigin — wiring pins (static)', () => {
  const menuBuilderSrc = readFileSync(path.join(REPO, 'menuBuilder.js'), 'utf8');
  const appSrc = readFileSync(path.join(REPO, 'app.js'), 'utf8');

  it('buildPremiumMenu sets the origin', () => {
    const fn = menuBuilderSrc.slice(menuBuilderSrc.indexOf('static async buildPremiumMenu'));
    assert.ok(fn.slice(0, 800).includes('setPremiumOrigin('), 'buildPremiumMenu must mark the premium origin');
  });

  it('buildSetupMenu clears the origin', () => {
    const fn = menuBuilderSrc.slice(menuBuilderSrc.indexOf('static buildSetupMenu'));
    assert.ok(fn.slice(0, 800).includes('clearPremiumOrigin('), 'buildSetupMenu must clear the premium origin');
  });

  it('the castbot_tools handler intercepts premium-origin back-clicks', () => {
    const block = appSrc.slice(appSrc.indexOf("custom_id === 'castbot_tools'"));
    const span = block.slice(0, block.indexOf('})(req, res, client)'));
    assert.ok(span.includes('isFromPremium('), 'castbot_tools must consult the origin map');
    assert.ok(span.includes("'premium_menu'"), 'premium-origin clicks must re-render the Premium menu');
  });

  it('createProductionMenuInterface clears the origin (root render)', () => {
    const fn = appSrc.slice(appSrc.indexOf('async function createProductionMenuInterface'));
    assert.ok(fn.slice(0, 800).includes('clearPremiumOrigin('), 'the Production Menu render must clear the origin');
  });
});
