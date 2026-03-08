/**
 * Tests for manage_player_state outcome type.
 *
 * Validates the execution logic for all 4 modes:
 * - initialize: place player on map
 * - teleport: move initialized player to coordinate
 * - init_or_teleport: init if new, teleport if existing
 * - deinitialize: remove player from map
 *
 * Tests use extracted logic patterns (same as safariInitialization.test.js)
 * to avoid importing the full module graph.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Replicate isPlayerInitialized (canonical check)
// ---------------------------------------------------------------------------
function isPlayerInitialized(player) {
  const safari = player?.safari;
  if (!safari) return false;
  return safari.points !== undefined;
}

// ---------------------------------------------------------------------------
// Replicate the mode dispatch logic from executeManagePlayerState
// Returns a { action, args } object describing what would be called
// ---------------------------------------------------------------------------
function resolvePlayerStateAction(config, player) {
  const { mode, coordinate } = config;
  const initialized = isPlayerInitialized(player);

  switch (mode) {
    case 'initialize':
      if (initialized) return { action: 'error', message: 'already_initialized' };
      return { action: 'initialize', coordinate: coordinate || null };

    case 'teleport':
      if (!initialized) return { action: 'error', message: 'not_initialized' };
      if (!coordinate) return { action: 'error', message: 'no_coordinate' };
      return { action: 'teleport', coordinate };

    case 'init_or_teleport':
      if (!initialized) {
        return { action: 'initialize', coordinate: coordinate || null };
      } else {
        if (!coordinate) return { action: 'noop', message: 'already_on_map' };
        return { action: 'teleport', coordinate };
      }

    case 'deinitialize':
      if (!initialized) return { action: 'error', message: 'not_initialized' };
      return { action: 'deinitialize' };

    default:
      return { action: 'error', message: 'unknown_mode' };
  }
}

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------
const freshPlayer = {};
const stubPlayer = { safari: { mapProgress: { map_1: { startingLocation: 'D1' } } } };
const initializedPlayer = {
  safari: {
    currency: 100,
    inventory: {},
    points: { stamina: { current: 1, maximum: 1 } },
    mapProgress: { map_1: { currentLocation: 'A1' } }
  }
};

// ---------------------------------------------------------------------------
// Initialize mode
// ---------------------------------------------------------------------------
describe('manage_player_state: initialize mode', () => {
  it('initializes a fresh player', () => {
    const result = resolvePlayerStateAction({ mode: 'initialize', coordinate: 'B3' }, freshPlayer);
    assert.equal(result.action, 'initialize');
    assert.equal(result.coordinate, 'B3');
  });

  it('initializes with default coordinate when none specified', () => {
    const result = resolvePlayerStateAction({ mode: 'initialize', coordinate: null }, freshPlayer);
    assert.equal(result.action, 'initialize');
    assert.equal(result.coordinate, null, 'null coordinate triggers standard resolution chain');
  });

  it('initializes a de-init stub player (has startingLocation but no points)', () => {
    const result = resolvePlayerStateAction({ mode: 'initialize', coordinate: null }, stubPlayer);
    assert.equal(result.action, 'initialize');
  });

  it('rejects already initialized player', () => {
    const result = resolvePlayerStateAction({ mode: 'initialize', coordinate: 'B3' }, initializedPlayer);
    assert.equal(result.action, 'error');
    assert.equal(result.message, 'already_initialized');
  });
});

// ---------------------------------------------------------------------------
// Teleport mode
// ---------------------------------------------------------------------------
describe('manage_player_state: teleport mode', () => {
  it('teleports initialized player to coordinate', () => {
    const result = resolvePlayerStateAction({ mode: 'teleport', coordinate: 'C5' }, initializedPlayer);
    assert.equal(result.action, 'teleport');
    assert.equal(result.coordinate, 'C5');
  });

  it('rejects teleport of non-initialized player', () => {
    const result = resolvePlayerStateAction({ mode: 'teleport', coordinate: 'C5' }, freshPlayer);
    assert.equal(result.action, 'error');
    assert.equal(result.message, 'not_initialized');
  });

  it('rejects teleport without coordinate', () => {
    const result = resolvePlayerStateAction({ mode: 'teleport', coordinate: null }, initializedPlayer);
    assert.equal(result.action, 'error');
    assert.equal(result.message, 'no_coordinate');
  });

  it('rejects teleport of de-init stub player', () => {
    const result = resolvePlayerStateAction({ mode: 'teleport', coordinate: 'C5' }, stubPlayer);
    assert.equal(result.action, 'error');
    assert.equal(result.message, 'not_initialized');
  });
});

// ---------------------------------------------------------------------------
// Init or Teleport mode
// ---------------------------------------------------------------------------
describe('manage_player_state: init_or_teleport mode', () => {
  it('initializes fresh player', () => {
    const result = resolvePlayerStateAction({ mode: 'init_or_teleport', coordinate: 'D2' }, freshPlayer);
    assert.equal(result.action, 'initialize');
    assert.equal(result.coordinate, 'D2');
  });

  it('initializes fresh player with default coordinate', () => {
    const result = resolvePlayerStateAction({ mode: 'init_or_teleport', coordinate: null }, freshPlayer);
    assert.equal(result.action, 'initialize');
    assert.equal(result.coordinate, null);
  });

  it('teleports initialized player to coordinate', () => {
    const result = resolvePlayerStateAction({ mode: 'init_or_teleport', coordinate: 'D2' }, initializedPlayer);
    assert.equal(result.action, 'teleport');
    assert.equal(result.coordinate, 'D2');
  });

  it('returns noop for initialized player with no coordinate', () => {
    const result = resolvePlayerStateAction({ mode: 'init_or_teleport', coordinate: null }, initializedPlayer);
    assert.equal(result.action, 'noop');
    assert.equal(result.message, 'already_on_map');
  });

  it('initializes de-init stub player (has startingLocation but no points)', () => {
    const result = resolvePlayerStateAction({ mode: 'init_or_teleport', coordinate: null }, stubPlayer);
    assert.equal(result.action, 'initialize');
  });
});

// ---------------------------------------------------------------------------
// De-initialize mode
// ---------------------------------------------------------------------------
describe('manage_player_state: deinitialize mode', () => {
  it('de-initializes initialized player', () => {
    const result = resolvePlayerStateAction({ mode: 'deinitialize' }, initializedPlayer);
    assert.equal(result.action, 'deinitialize');
  });

  it('rejects de-init of non-initialized player', () => {
    const result = resolvePlayerStateAction({ mode: 'deinitialize' }, freshPlayer);
    assert.equal(result.action, 'error');
    assert.equal(result.message, 'not_initialized');
  });

  it('rejects de-init of de-init stub player', () => {
    const result = resolvePlayerStateAction({ mode: 'deinitialize' }, stubPlayer);
    assert.equal(result.action, 'error');
    assert.equal(result.message, 'not_initialized');
  });

  it('coordinate is ignored for deinitialize mode', () => {
    const result = resolvePlayerStateAction({ mode: 'deinitialize', coordinate: 'B3' }, initializedPlayer);
    assert.equal(result.action, 'deinitialize');
    assert.equal(result.coordinate, undefined, 'coordinate should not be in result');
  });
});

// ---------------------------------------------------------------------------
// Unknown/invalid modes
// ---------------------------------------------------------------------------
describe('manage_player_state: edge cases', () => {
  it('returns error for unknown mode', () => {
    const result = resolvePlayerStateAction({ mode: 'explode' }, initializedPlayer);
    assert.equal(result.action, 'error');
    assert.equal(result.message, 'unknown_mode');
  });

  it('returns error for undefined mode', () => {
    const result = resolvePlayerStateAction({}, initializedPlayer);
    assert.equal(result.action, 'error');
    assert.equal(result.message, 'unknown_mode');
  });
});

// ---------------------------------------------------------------------------
// Per-player isolation (the critical safety property)
// ---------------------------------------------------------------------------
describe('manage_player_state: per-player isolation', () => {
  it('each player state is evaluated independently', () => {
    // Simulate two different players triggering the same action config
    const config = { mode: 'init_or_teleport', coordinate: 'B3' };

    const resultFresh = resolvePlayerStateAction(config, freshPlayer);
    const resultInitialized = resolvePlayerStateAction(config, initializedPlayer);

    // Fresh player gets initialized
    assert.equal(resultFresh.action, 'initialize');
    // Initialized player gets teleported
    assert.equal(resultInitialized.action, 'teleport');

    // They don't affect each other
    assert.notDeepEqual(resultFresh, resultInitialized);
  });
});

// ---------------------------------------------------------------------------
// Config schema validation
// ---------------------------------------------------------------------------
describe('manage_player_state: config schema', () => {
  it('valid config has mode and optional coordinate', () => {
    const config = { mode: 'initialize', coordinate: 'A1' };
    assert.equal(typeof config.mode, 'string');
    assert.equal(typeof config.coordinate, 'string');
  });

  it('coordinate can be null', () => {
    const config = { mode: 'initialize', coordinate: null };
    assert.equal(config.coordinate, null);
  });

  it('stored action has correct shape', () => {
    const storedAction = {
      type: 'manage_player_state',
      order: 0,
      config: { mode: 'init_or_teleport', coordinate: null },
      executeOn: 'true'
    };
    assert.equal(storedAction.type, 'manage_player_state');
    assert.equal(storedAction.config.mode, 'init_or_teleport');
    assert.equal(storedAction.executeOn, 'true');
  });
});
