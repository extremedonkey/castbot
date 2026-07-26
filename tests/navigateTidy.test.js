/**
 * navigateTidy.test.js - Navigate Tidy pure helpers (navigateTidy.js is import-free at top,
 * so the real functions are tested directly).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractNavPanels, classifyPanels, presentUserIdsFromOverwrites,
  buildStaleListing, totalStale, buildTidyScanUI, buildTidyResultUI, buildTidyBusyUI
} from '../navigateTidy.js';

const IS_V2 = 1 << 15;
const msg = (id, customId) => ({
  id,
  components: [{ type: 17, components: [
    { type: 10, content: 'x' },
    { type: 1, components: [{ type: 2, custom_id: customId }] }
  ]}]
});

describe('extractNavPanels', () => {
  it('matches arrival cards and admin-move cards, extracting the right userId slot', () => {
    const panels = extractNavPanels([
      msg('1', 'safari_navigate_689666699917787187_C2'),
      msg('2', 'safari_show_movement_405499216044228608_D1')
    ]);
    assert.deepEqual(panels, [
      { messageId: '1', userId: '689666699917787187' },
      { messageId: '2', userId: '405499216044228608' }
    ]);
  });

  it('ignores refresh buttons, other buttons, and malformed messages', () => {
    const panels = extractNavPanels([
      msg('1', 'safari_navigate_refresh_123_C2'),
      msg('2', 'map_location_actions_C2'),
      { id: '3' }, // no components (redacted non-bot message)
      { id: '4', components: [{ type: 1, components: [] }] }, // no container
      null && msg('5', 'x')
    ].filter(Boolean));
    assert.equal(panels.length, 0);
  });

  it('dedupes by messageId', () => {
    const m = msg('1', 'safari_navigate_111_A1');
    m.components[0].components.push({ type: 1, components: [{ type: 2, custom_id: 'safari_navigate_111_A1' }] });
    assert.equal(extractNavPanels([m]).length, 1);
  });
});

describe('classifyPanels / presentUserIdsFromOverwrites', () => {
  it('keeps panels whose owner has an allowing member overwrite, stales the rest', () => {
    const present = presentUserIdsFromOverwrites([
      { id: '111', type: 1, allow: String(1n << 10n) },          // member, ViewChannel allowed
      { id: '222', type: 1, allow: '0' },                        // member, denied (moved away)
      { id: '333', type: 0, allow: String(1n << 10n) }           // role overwrite — ignored
    ]);
    const { stale, kept } = classifyPanels(
      [{ messageId: 'a', userId: '111' }, { messageId: 'b', userId: '222' }, { messageId: 'c', userId: '333' }],
      present
    );
    assert.deepEqual(kept.map(p => p.userId), ['111']);
    assert.deepEqual(stale.map(p => p.userId), ['222', '333']);
  });
});

describe('buildStaleListing', () => {
  it('lists channels with stale owners sorted by coordinate, skipping clean channels', () => {
    const listing = buildStaleListing([
      { coord: 'C2', channelId: '20', stale: [{ userId: '1' }, { userId: '2' }] },
      { coord: 'A1', channelId: '10', stale: [{ userId: '3' }] },
      { coord: 'B9', channelId: '30', stale: [] }
    ]);
    assert.equal(listing, '<#10> → <@3>\n<#20> → <@1>, <@2>');
  });

  it('truncates under the char budget with a "+N more" note', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      coord: `A${i}`, channelId: String(10 ** 17 + i), stale: [{ userId: '689666699917787187' }, { userId: '405499216044228608' }]
    }));
    const listing = buildStaleListing(many);
    assert.ok(listing.length < 2700);
    assert.match(listing, /…plus \d+ more channels/);
  });
});

describe('buildTidyScanUI', () => {
  const scanWith = channels => ({ at: 0, channels });

  it('with stale panels: warning accent, Cancel first, red Delete confirm with count', () => {
    const ui = buildTidyScanUI(scanWith([{ coord: 'C2', channelId: '20', stale: [{ userId: '1' }, { userId: '2' }], keptCount: 1 }]));
    assert.equal(ui.content, undefined);
    assert.ok(ui.flags & IS_V2);
    assert.equal(ui.ephemeral, true);
    const container = ui.components[0];
    assert.equal(container.type, 17);
    assert.equal(container.accent_color, 0xf39c12);
    const row = container.components.findLast(c => c.type === 1);
    assert.equal(row.components[0].custom_id, 'nav_tidy_cancel');
    const confirm = row.components[1];
    assert.equal(confirm.custom_id, 'nav_tidy_confirm');
    assert.equal(confirm.style, 4);
    assert.equal(confirm.label, 'Delete 2 Panels');
    const rowIdx = container.components.findIndex(c => c.type === 1);
    assert.equal(container.components[rowIdx - 1].type, 14, 'separator above buttons');
  });

  it('clean scan: green accent, Close only, no confirm button', () => {
    const ui = buildTidyScanUI(scanWith([{ coord: 'A1', channelId: '10', stale: [], keptCount: 3 }]));
    assert.equal(ui.components[0].accent_color, 0x27ae60);
    const row = ui.components[0].components.findLast(c => c.type === 1);
    assert.equal(row.components.length, 1);
    assert.equal(row.components[0].custom_id, 'nav_tidy_cancel');
    assert.equal(totalStale([{ stale: [] }]), 0);
  });
});

describe('buildTidyResultUI / buildTidyBusyUI', () => {
  it('reports deletions, flags failures red', () => {
    assert.equal(buildTidyResultUI({ deleted: 5, failed: 0, channels: 3 }).components[0].accent_color, 0x27ae60);
    const failed = buildTidyResultUI({ deleted: 4, failed: 2, channels: 3 });
    assert.equal(failed.components[0].accent_color, 0xe74c3c);
    assert.match(failed.components[0].components.at(-1).content, /4.*stale panels.*3.*channels/s);
    assert.match(failed.components[0].components.at(-1).content, /2 could not be deleted/);
  });

  it('busy UI is a valid ephemeral V2 warning', () => {
    const ui = buildTidyBusyUI();
    assert.ok(ui.flags & IS_V2);
    assert.equal(ui.components[0].type, 17);
    assert.match(ui.components[0].components[0].content, /already in progress/);
  });
});
