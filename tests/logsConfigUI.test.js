/**
 * Tests for buildCastBotLogsModal (src/analytics/logsConfigUI.js) — pure builder.
 * Key regressions: single-choice fields MUST be Radio Groups (type 21) because
 * String Select option `default` is not honored in modals (caused defaults to be
 * silently re-saved on every submit), and the modal must pre-load current config.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCastBotLogsModal } from '../src/analytics/logsConfigUI.js';

const envConfig = {
  liveDiscordLogging: {
    enabled: true,
    productionChannelId: 'PROD_CH',
    developmentChannelId: 'DEV_CH',
    excludedUserIds: { production: ['REECE'], development: [] },
    format: 'enhanced'
  }
};

const field = (modal, id) => modal.components.find(c => c.component?.custom_id === id)?.component;

describe('buildCastBotLogsModal', () => {
  it('has at most 5 components, all Label-wrapped', () => {
    const modal = buildCastBotLogsModal(envConfig, true);
    assert.ok(modal.components.length <= 5);
    assert.ok(modal.components.every(c => c.type === 18 && c.component));
  });

  it('enabled + format are Radio Groups (type 21) — modal-safe pre-selection', () => {
    const modal = buildCastBotLogsModal(envConfig, true);
    assert.equal(field(modal, 'logs_enabled').type, 21);
    assert.equal(field(modal, 'logs_format').type, 21);
  });

  it('pre-selects current enabled state and format — default:true on exactly ONE option, key ABSENT on siblings', () => {
    // An explicit default:false on a sibling suppresses pre-selection for the whole
    // group (ComponentsV2.md Radio Group gotcha, observed 2026-07-16).
    const on = buildCastBotLogsModal(envConfig, true);
    assert.equal(field(on, 'logs_enabled').options.find(o => o.value === 'enabled').default, true);
    assert.ok(!('default' in field(on, 'logs_enabled').options.find(o => o.value === 'disabled')));
    assert.equal(field(on, 'logs_format').options.find(o => o.value === 'enhanced').default, true);
    assert.ok(!('default' in field(on, 'logs_format').options.find(o => o.value === 'classic')));

    const off = buildCastBotLogsModal({ liveDiscordLogging: { enabled: false } }, true);
    assert.equal(field(off, 'logs_enabled').options.find(o => o.value === 'disabled').default, true);
    assert.ok(!('default' in field(off, 'logs_enabled').options.find(o => o.value === 'enabled')));
    assert.equal(field(off, 'logs_format').options.find(o => o.value === 'classic').default, true);
  });

  it('format option labels use the "Log Format:" prefix', () => {
    const labels = field(buildCastBotLogsModal(envConfig, true), 'logs_format').options.map(o => o.label);
    assert.deepEqual(labels, ['Log Format: Classic', 'Log Format: Enhanced']);
  });

  it('channel select is optional (empty = keep current) and env-keyed', () => {
    const prod = field(buildCastBotLogsModal(envConfig, true), 'logs_channel');
    assert.equal(prod.min_values, 0);
    assert.equal(prod.required, false);
    assert.deepEqual(prod.default_values, [{ id: 'PROD_CH', type: 'channel' }]);

    const dev = field(buildCastBotLogsModal(envConfig, false), 'logs_channel');
    assert.deepEqual(dev.default_values, [{ id: 'DEV_CH', type: 'channel' }]);
  });

  it('ignored users prefill from the current env branch; description shows them', () => {
    const prodModal = buildCastBotLogsModal(envConfig, true);
    assert.deepEqual(field(prodModal, 'logs_ignore').default_values, [{ id: 'REECE', type: 'user' }]);
    const label = prodModal.components.find(c => c.component?.custom_id === 'logs_ignore');
    assert.ok(label.description.includes('@REECE'));

    const devModal = buildCastBotLogsModal(envConfig, false);
    assert.deepEqual(field(devModal, 'logs_ignore').default_values, []);
  });

  it('cache refresh starts empty and optional', () => {
    const refresh = field(buildCastBotLogsModal(envConfig, true), 'logs_cache_refresh');
    assert.equal(refresh.min_values, 0);
    assert.equal(refresh.required, false);
    assert.ok(refresh.options.every(o => !o.default));
  });

  it('handles a completely empty/uninitialised config without throwing', () => {
    const modal = buildCastBotLogsModal({}, false);
    assert.ok(field(modal, 'logs_enabled'));
    assert.deepEqual(field(modal, 'logs_channel').default_values, []);
  });
});
