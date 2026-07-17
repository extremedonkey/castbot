/**
 * Tests for Safari Log configuration logic:
 * - DEFAULT_LOG_TYPES / mergeLogTypes (missing key = enabled, explicit false preserved)
 * - getSafariLogTargets (main-channel gates unchanged, whisper dual delivery,
 *   whisper-channel independence, dedupe, no leakage of non-whisper actions)
 * - buildSafariLogConfigUI / buildWhisperLogConfigUI structure
 *
 * Imports the REAL modules (safe under node:test — storage.js's DST module-load
 * log is guarded by NODE_TEST_CONTEXT).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOG_TYPES, mergeLogTypes, getSafariLogTargets } from '../safariLogger.js';
import { buildSafariLogConfigUI, buildWhisperLogConfigUI } from '../safariConfigUI.js';

describe('mergeLogTypes — defaults', () => {
  it('undefined/null stored → all 10 keys true', () => {
    for (const stored of [undefined, null, {}]) {
      const merged = mergeLogTypes(stored);
      assert.equal(Object.keys(merged).length, 10);
      assert.ok(Object.values(merged).every(v => v === true));
    }
  });

  it('missing keys default true (staminaChanges, customActions, testMessages)', () => {
    // Simulates a legacy guild record created before these keys existed
    const legacy = { whispers: true, itemPickups: true, currencyChanges: true,
      storeTransactions: true, buttonActions: true, mapMovement: true, attacks: true };
    const merged = mergeLogTypes(legacy);
    assert.equal(merged.staminaChanges, true);
    assert.equal(merged.customActions, true);
    assert.equal(merged.testMessages, true);
  });

  it('explicit false is preserved (admin deselection wins over defaults)', () => {
    const merged = mergeLogTypes({ whispers: false, mapMovement: false });
    assert.equal(merged.whispers, false);
    assert.equal(merged.mapMovement, false);
    assert.equal(merged.staminaChanges, true);
  });

  it('DEFAULT_LOG_TYPES includes staminaChanges and hidden testMessages, all true', () => {
    assert.equal(DEFAULT_LOG_TYPES.staminaChanges, true);
    assert.equal(DEFAULT_LOG_TYPES.testMessages, true);
  });
});

describe('getSafariLogTargets — main channel gates (unchanged behavior)', () => {
  it('enabled + channel + type on → main channel', () => {
    const s = { enabled: true, logChannelId: 'A', logTypes: {} };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_MOVEMENT', 'mapMovement'), ['A']);
  });

  it('disabled → nothing (non-whisper)', () => {
    const s = { enabled: false, logChannelId: 'A', logTypes: {} };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_MOVEMENT', 'mapMovement'), []);
  });

  it('no channel → nothing', () => {
    const s = { enabled: true, logChannelId: null, logTypes: {} };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_MOVEMENT', 'mapMovement'), []);
  });

  it('type explicitly disabled → nothing', () => {
    const s = { enabled: true, logChannelId: 'A', logTypes: { mapMovement: false } };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_MOVEMENT', 'mapMovement'), []);
  });

  it('unknown action (no logType) → nothing', () => {
    const s = { enabled: true, logChannelId: 'A', logTypes: {} };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_MYSTERY', undefined), []);
  });

  it('null settings → nothing', () => {
    assert.deepEqual(getSafariLogTargets(null, 'SAFARI_MOVEMENT', 'mapMovement'), []);
  });

  it('legacy record missing testMessages key → SAFARI_TEST now posts (latent fix)', () => {
    const s = { enabled: true, logChannelId: 'A', logTypes: { whispers: true } };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_TEST', 'testMessages'), ['A']);
  });
});

describe('getSafariLogTargets — whisper log channel', () => {
  it('dual delivery: main whispers on + whisper channel set → both, main first', () => {
    const s = { enabled: true, logChannelId: 'A', whisperLogChannelId: 'B', logTypes: { whispers: true } };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_WHISPER', 'whispers'), ['A', 'B']);
  });

  it('independence: main log disabled → whisper channel still receives', () => {
    const s = { enabled: false, logChannelId: 'A', whisperLogChannelId: 'B', logTypes: {} };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_WHISPER', 'whispers'), ['B']);
  });

  it('independence: main whispers type off → whisper channel still receives', () => {
    const s = { enabled: true, logChannelId: 'A', whisperLogChannelId: 'B', logTypes: { whispers: false } };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_WHISPER', 'whispers'), ['B']);
  });

  it('same channel configured for both → exactly one delivery', () => {
    const s = { enabled: true, logChannelId: 'A', whisperLogChannelId: 'A', logTypes: { whispers: true } };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_WHISPER', 'whispers'), ['A']);
  });

  it('whisper channel NEVER receives non-whisper actions', () => {
    const s = { enabled: false, logChannelId: null, whisperLogChannelId: 'B', logTypes: {} };
    for (const [action, type] of [['SAFARI_MOVEMENT', 'mapMovement'], ['SAFARI_CURRENCY', 'currencyChanges'], ['SAFARI_ITEM_PICKUP', 'itemPickups'], ['SAFARI_TEST', 'testMessages']]) {
      assert.deepEqual(getSafariLogTargets(s, action, type), [], `${action} leaked to whisper channel`);
    }
  });

  it('whisper READ events reach the whisper channel (spectator content) with same independence', () => {
    const s = { enabled: false, logChannelId: 'A', whisperLogChannelId: 'B', logTypes: {} };
    assert.deepEqual(getSafariLogTargets(s, 'SAFARI_WHISPER_READ', 'whispers'), ['B']);
    const both = { enabled: true, logChannelId: 'A', whisperLogChannelId: 'B', logTypes: { whispers: true } };
    assert.deepEqual(getSafariLogTargets(both, 'SAFARI_WHISPER_READ', 'whispers'), ['A', 'B']);
  });

  it('no whisper channel set → whisper behaves exactly as before', () => {
    const on = { enabled: true, logChannelId: 'A', logTypes: { whispers: true } };
    const off = { enabled: true, logChannelId: 'A', logTypes: { whispers: false } };
    assert.deepEqual(getSafariLogTargets(on, 'SAFARI_WHISPER', 'whispers'), ['A']);
    assert.deepEqual(getSafariLogTargets(off, 'SAFARI_WHISPER', 'whispers'), []);
  });
});

// --- UI builders ---

function flatten(components, out = []) {
  for (const c of components || []) {
    out.push(c);
    flatten(c.components, out);
  }
  return out;
}

describe('buildSafariLogConfigUI — structure', () => {
  const settings = { enabled: true, logChannelId: 'C1', logTypes: {} };

  it('container has the purple accent color (drift fix)', () => {
    const ui = buildSafariLogConfigUI(settings, { whispersEnabled: true });
    assert.equal(ui.components[0].type, 17);
    assert.equal(ui.components[0].accent_color, 0x9B59B6);
  });

  it('back row has ← Settings; no safari_whisper_-prefixed ids anywhere (route collision guard)', () => {
    const ui = buildSafariLogConfigUI(settings, { whispersEnabled: true });
    const all = flatten(ui.components);
    const ids = all.filter(c => c.type === 2).map(c => c.custom_id);
    assert.ok(ids.includes('castbot_settings'));
    // custom_ids starting with 'safari_whisper_' get swallowed by the player-whisper route
    assert.ok(ids.every(id => !id.startsWith('safari_whisper_')), `collision-prone id found: ${ids}`);
  });

  it('toggle label/style flips with enabled state', () => {
    const on = flatten(buildSafariLogConfigUI({ ...settings, enabled: true }, { whispersEnabled: true }).components)
      .find(c => c.custom_id === 'safari_log_toggle');
    const off = flatten(buildSafariLogConfigUI({ ...settings, enabled: false }, { whispersEnabled: true }).components)
      .find(c => c.custom_id === 'safari_log_toggle');
    assert.equal(on.style, 4);   // Danger = "Disable"
    assert.equal(off.style, 3);  // Success = "Enable"
  });

  it('log format select: Classic default when logFormat absent, Enhanced when set', () => {
    const absent = flatten(buildSafariLogConfigUI(settings, { whispersEnabled: true }).components)
      .find(c => c.custom_id === 'safari_log_format_select');
    assert.equal(absent.placeholder, 'Set Log Type');
    assert.equal(absent.options.find(o => o.value === 'classic').default, true);
    assert.equal(absent.options.find(o => o.value === 'enhanced').default, false);

    const enhanced = flatten(buildSafariLogConfigUI({ ...settings, logFormat: 'enhanced' }, { whispersEnabled: true }).components)
      .find(c => c.custom_id === 'safari_log_format_select');
    assert.equal(enhanced.options.find(o => o.value === 'enhanced').default, true);
    assert.equal(enhanced.options.find(o => o.value === 'classic').default, false);
  });

  it('status text shows the log format', () => {
    const classic = JSON.stringify(buildSafariLogConfigUI(settings, { whispersEnabled: true }));
    assert.ok(classic.includes('Log Format:'));
    assert.ok(classic.includes('Classic'));
    const enhanced = JSON.stringify(buildSafariLogConfigUI({ ...settings, logFormat: 'enhanced' }, { whispersEnabled: true }));
    assert.ok(enhanced.includes('Enhanced'));
  });

  it('never renders a raw testMessages bullet in Active Log Types', () => {
    const ui = buildSafariLogConfigUI({ enabled: true, logChannelId: 'C1', logTypes: { testMessages: true } }, { whispersEnabled: true });
    assert.ok(!JSON.stringify(ui).includes('testMessages'));
  });
});

describe('buildWhisperLogConfigUI — structure', () => {
  it('whispers ON → Danger "Turn Whispers Off" toggle', () => {
    const ui = buildWhisperLogConfigUI({ whispersEnabled: true, whisperLogChannelId: null, mainLogWhispersActive: false });
    const toggle = flatten(ui.components).find(c => c.custom_id === 'safari_whispers_toggle');
    assert.equal(toggle.style, 4);
    assert.ok(toggle.label.includes('Off'));
  });

  it('whispers OFF → Success "Turn Whispers On" toggle', () => {
    const ui = buildWhisperLogConfigUI({ whispersEnabled: false, whisperLogChannelId: null, mainLogWhispersActive: false });
    const toggle = flatten(ui.components).find(c => c.custom_id === 'safari_whispers_toggle');
    assert.equal(toggle.style, 3);
    assert.ok(toggle.label.includes('On'));
  });

  it('channel select allows clearing (min_values 0) and prefills the set channel', () => {
    const ui = buildWhisperLogConfigUI({ whispersEnabled: true, whisperLogChannelId: 'W1', mainLogWhispersActive: true });
    const select = flatten(ui.components).find(c => c.type === 8);
    assert.equal(select.custom_id, 'whisper_log_channel_set');
    assert.equal(select.min_values, 0);
    assert.equal(select.max_values, 1);
    assert.deepEqual(select.default_values, [{ id: 'W1', type: 'channel' }]);
  });

  it('test button disabled without a channel, enabled with one; back button targets Map Explorer', () => {
    const without = flatten(buildWhisperLogConfigUI({ whispersEnabled: true, whisperLogChannelId: null, mainLogWhispersActive: false }).components);
    const withCh = flatten(buildWhisperLogConfigUI({ whispersEnabled: true, whisperLogChannelId: 'W1', mainLogWhispersActive: false }).components);
    assert.equal(without.find(c => c.custom_id === 'whisper_log_test').disabled, true);
    assert.ok(!withCh.find(c => c.custom_id === 'whisper_log_test').disabled);
    assert.ok(withCh.some(c => c.custom_id === 'safari_map_explorer'));
  });

  it('no custom_id on the whisper screen starts with safari_whisper_ (route collision guard)', () => {
    const all = flatten(buildWhisperLogConfigUI({ whispersEnabled: true, whisperLogChannelId: 'W1', mainLogWhispersActive: false }).components);
    const ids = all.map(c => c.custom_id).filter(Boolean);
    assert.ok(ids.every(id => !id.startsWith('safari_whisper_')), `collision-prone id found: ${ids}`);
  });
});
