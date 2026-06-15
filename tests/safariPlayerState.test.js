/**
 * Tests for the canonical player Safari/map state classifier.
 * Pure logic replicated inline (mirrors getPlayerSafariState in safariPlayerUtils.js)
 * to avoid importing modules that touch file I/O at load time.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const STATE = { UNINITIALIZED: 'uninitialized', INITIALIZED: 'initialized', PAUSED: 'paused' };

// Replica of safariPlayerUtils.getPlayerSafariState
function getPlayerSafariState(player, activeMapId) {
  const safari = player?.safari;
  if (!safari) return STATE.UNINITIALIZED;
  const onMap = activeMapId
    ? !!safari.mapProgress?.[activeMapId]?.currentLocation
    : (safari.points !== undefined);
  if (!onMap) return STATE.UNINITIALIZED;
  return safari.isPaused === true ? STATE.PAUSED : STATE.INITIALIZED;
}
const isPlayerInitialized = (p, m) => getPlayerSafariState(p, m) !== STATE.UNINITIALIZED;

const MAP = 'map_2x2_1';

describe('getPlayerSafariState — map presence is the source of truth', () => {
  it('no safari object → uninitialized', () => {
    assert.equal(getPlayerSafariState({}, MAP), STATE.UNINITIALIZED);
    assert.equal(getPlayerSafariState(undefined, MAP), STATE.UNINITIALIZED);
  });

  it('placed on the active map → initialized', () => {
    const p = { safari: { points: { stamina: {} }, mapProgress: { [MAP]: { currentLocation: 'A2' } } } };
    assert.equal(getPlayerSafariState(p, MAP), STATE.INITIALIZED);
    assert.equal(isPlayerInitialized(p, MAP), true);
  });

  it('on the map AND paused → paused', () => {
    const p = { safari: { isPaused: true, mapProgress: { [MAP]: { currentLocation: 'A1' } } } };
    assert.equal(getPlayerSafariState(p, MAP), STATE.PAUSED);
    assert.equal(isPlayerInitialized(p, MAP), true); // paused is still "initialized"
  });

  it('the radicaldinosaur case: stale points + startingLocation only → uninitialized', () => {
    // Has points (stale) but NO currentLocation on the active map — the bug we fixed.
    const p = { safari: { points: { stamina: { current: 1, maximum: 1 } }, mapProgress: { [MAP]: { startingLocation: 'A2' } } } };
    assert.equal(getPlayerSafariState(p, MAP), STATE.UNINITIALIZED);
    assert.equal(isPlayerInitialized(p, MAP), false);
  });

  it('de-initialized shape (startingLocation, no points) → uninitialized', () => {
    const p = { safari: { mapProgress: { [MAP]: { startingLocation: 'B3' } } } };
    assert.equal(getPlayerSafariState(p, MAP), STATE.UNINITIALIZED);
  });

  it('currency/items but never on map → uninitialized', () => {
    const p = { safari: { currency: 500, inventory: { sword: 1 } } };
    assert.equal(getPlayerSafariState(p, MAP), STATE.UNINITIALIZED);
  });

  it('paused flag cannot resurrect a not-on-map player', () => {
    const p = { safari: { isPaused: true, points: { stamina: {} }, mapProgress: { [MAP]: { startingLocation: 'A2' } } } };
    assert.equal(getPlayerSafariState(p, MAP), STATE.UNINITIALIZED);
  });
});

describe('getPlayerSafariState — no active map (lean game) falls back to points', () => {
  it('points present, no active map → initialized', () => {
    const p = { safari: { points: { stamina: {} } } };
    assert.equal(getPlayerSafariState(p, undefined), STATE.INITIALIZED);
  });

  it('no points, no active map → uninitialized', () => {
    const p = { safari: { currency: 10 } };
    assert.equal(getPlayerSafariState(p, undefined), STATE.UNINITIALIZED);
  });
});
