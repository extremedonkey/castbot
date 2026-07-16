/**
 * Channel Administration — the hidden Channels tab's gating + roster resolution.
 *
 * The nav row/gate are imported for real (seasonSelector pulls in storage.js, but only for
 * functions these tests don't call). The roster's ACCEPTED rule is exercised against the REAL
 * status engine, since that engine is the whole reason the roster is correct.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonNavRow, seasonManagerHeader, isChannelAdmin } from '../seasonSelector.js';
import { buildStatusSignals, deriveStatus } from '../playerStatus.js';
import { ACCEPTED_STATUS_IDS } from '../src/channels/channelRoster.js';
import { CHANNEL_ADMIN_USER_IDS } from '../src/channels/channelAdminConfig.js';

const REECE = '391415444084490240';
const OTHER_ADMIN = '1086246253819613274';
const RANDOM = '999999999999999999';
const CID = 'config_123';

describe('Channels tab — isChannelAdmin gate', () => {
  it('admits exactly the two whitelisted IDs', () => {
    assert.equal(isChannelAdmin(REECE), true);
    assert.equal(isChannelAdmin(OTHER_ADMIN), true);
    assert.deepEqual(CHANNEL_ADMIN_USER_IDS, [REECE, OTHER_ADMIN]);
  });

  it('rejects everyone else, including falsy inputs', () => {
    assert.equal(isChannelAdmin(RANDOM), false);
    assert.equal(isChannelAdmin(undefined), false);
    assert.equal(isChannelAdmin(null), false);
    assert.equal(isChannelAdmin(''), false);
    assert.equal(isChannelAdmin('0'), false);
  });

  it('does not admit a numeric near-miss or a substring', () => {
    assert.equal(isChannelAdmin('39141544408449024'), false);  // one digit short
    assert.equal(isChannelAdmin(`${REECE}0`), false);
  });
});

describe('Channels tab — nav row visibility', () => {
  it('renders the classic 4 tabs with no userId (every existing caller)', () => {
    const row = buildSeasonNavRow(CID, 'apps');
    assert.equal(row.components.length, 4);
    assert.deepEqual(row.components.map(b => b.label), ['Apps', 'Planner', 'Casting', 'Marooning']);
  });

  it('hides Channels from a non-whitelisted admin', () => {
    const row = buildSeasonNavRow(CID, 'apps', RANDOM);
    assert.equal(row.components.length, 4);
    assert.ok(!row.components.some(b => b.label === 'Channels'));
  });

  it('shows Channels LAST for a whitelisted user', () => {
    for (const uid of [REECE, OTHER_ADMIN]) {
      const row = buildSeasonNavRow(CID, 'apps', uid);
      assert.equal(row.components.length, 5);
      assert.equal(row.components[4].label, 'Channels');
      assert.equal(row.components[4].custom_id, `season_channels_${CID}`);
      assert.equal(row.components[4].emoji.name, '🔐');
    }
  });

  it('NEVER exceeds Discord\'s hard 5-button ActionRow limit', () => {
    for (const active of ['apps', 'planner', 'ranking', 'marooning', 'channels']) {
      assert.ok(buildSeasonNavRow(CID, active, REECE).components.length <= 5, `${active} row overflowed`);
    }
  });

  it('shades the active Channels tab Primary and the rest Secondary', () => {
    const row = buildSeasonNavRow(CID, 'channels', REECE);
    const channels = row.components.find(b => b.label === 'Channels');
    assert.equal(channels.style, 1, 'active tab is Primary/blue');
    assert.deepEqual(row.components.filter(b => b.label !== 'Channels').map(b => b.style), [2, 2, 2, 2]);
  });

  it('keeps the tab order stable — Channels never displaces an existing tab', () => {
    const four = buildSeasonNavRow(CID, 'apps').components.map(b => b.custom_id);
    const five = buildSeasonNavRow(CID, 'apps', REECE).components.map(b => b.custom_id);
    assert.deepEqual(five.slice(0, 4), four);
  });
});

describe('Channels tab — header', () => {
  it('has its own title (else it falls back to the generic Season Manager)', () => {
    assert.equal(seasonManagerHeader('channels', 'S15').content, '## 🔐 Channels\n> ### S15');
  });

  it('still renders the other tabs\' titles', () => {
    assert.match(seasonManagerHeader('marooning', 'S15').content, /🚣 Marooning/);
  });
});

describe('Channels tab — Edit-origin custom_id round trip', () => {
  // app.js:11743 — if this regex doesn't know 'channels', Edit-from-Channels silently
  // refreshes the Apps tab instead.
  const EDIT_RE = /^(apps|planner|ranking|marooning|channels)_(.+)$/;

  it('parses a channels origin', () => {
    const m = `channels_${CID}`.match(EDIT_RE);
    assert.equal(m[1], 'channels');
    assert.equal(m[2], CID);
  });

  it('still parses every pre-existing origin', () => {
    for (const mode of ['apps', 'planner', 'ranking', 'marooning']) {
      assert.equal(`${mode}_${CID}`.match(EDIT_RE)[1], mode);
    }
  });

  it('a bare configId (legacy button) does not match, falling back to apps', () => {
    assert.equal(CID.match(EDIT_RE), null);
  });

  it('custom_ids stay within Discord\'s 100-char limit at worst case', () => {
    const worst = `config_1751549410029_${'9'.repeat(19)}`;
    assert.ok(`season_channels_${worst}`.length <= 100);
    assert.ok(`season_edit_info_channels_${worst}`.length <= 100);
    assert.ok(`channels_confessionals_${worst}`.length <= 100);
  });
});

describe('Channels roster — ACCEPTED via the real status engine', () => {
  const status = (app, chan = '☑️x-app') => deriveStatus(buildStatusSignals({ app, liveChannelName: chan })).statusId;
  const accepted = (app, chan) => ACCEPTED_STATUS_IDS.has(status(app, chan));

  it('includes a Cast player — the only signal with real production data', () => {
    assert.equal(accepted({ castingStatus: 'cast', completedAt: 'x' }), true);
  });

  it('includes an accepted placement', () => {
    assert.equal(accepted({ placementResponse: 'accepted' }), true);
  });

  it('includes an alternate who ACCEPTED (the accepted_alt row)', () => {
    assert.equal(status({ placementResponse: 'accepted_alternative', castingStatus: 'alternative' }), 'accepted_alt');
    assert.equal(accepted({ placementResponse: 'accepted_alternative', castingStatus: 'alternative' }), true);
  });

  it('EXCLUDES a withdrawn player even when they are Cast — withdrawn wins by precedence', () => {
    // Withdrawal has no data field: it lives only in the ✖️ prefix of the LIVE channel name.
    assert.equal(status({ castingStatus: 'cast', completedAt: 'x' }, '✖️reece-app'), 'withdrawn');
    assert.equal(accepted({ castingStatus: 'cast', completedAt: 'x' }, '✖️reece-app'), false);
  });

  it('excludes rejected, alternate-not-accepted, declined and undecided', () => {
    assert.equal(accepted({ castingStatus: 'reject' }), false);
    assert.equal(accepted({ castingStatus: 'alternative' }), false);
    assert.equal(accepted({ placementResponse: 'declined' }), false);
    assert.equal(accepted({ completedAt: 'x' }), false);
  });

  it('excludes legacy castingStatus:"tentative" (15 such records exist; removed in RaP 0902)', () => {
    assert.equal(accepted({ castingStatus: 'tentative', completedAt: 'x' }), false);
  });

  it('excludes a non-applicant', () => {
    assert.equal(deriveStatus(buildStatusSignals({ app: null })).statusId, 'none');
    assert.equal(accepted(null), false);
  });

  it('survives conversion to subs — a converted channel name still resolves as Cast', () => {
    // After convert-to-subs the live name is "reece-subs" (no ☑️), so `submitted` is false.
    // castingStatus still carries the roster, and completedAt (stamped pre-rename) preserves
    // the lifecycle signal. Without that stamp this player would fall to 'new'.
    assert.equal(status({ castingStatus: 'cast', completedAt: 'T1' }, 'reece-subs'), 'cast');
    assert.equal(status({ completedAt: 'T1' }, 'reece-subs'), 'complete');
    assert.equal(status({}, 'reece-subs'), 'new', 'without completedAt the signal would be lost');
  });
});

describe('Channels modals — Discord structural limits', () => {
  // These are the constraints that SILENTLY reject a modal at runtime — Discord just says
  // "This interaction failed" with no server-side log, so they're pinned here instead.
  const CID = 'config_1751549410029_391415444084490240';

  const allModals = async () => {
    const V = await import('../src/channels/channelsView.js');
    return [
      ['roles', V.buildRolesModal({ configId: CID, currentRoleId: '123', currentRoleName: 'Spec' })],
      ['roles-empty', V.buildRolesModal({ configId: CID, currentRoleId: null, currentRoleName: null })],
      ['playerroles', V.buildPlayerRolesModal({ configId: CID })],
      ['confessionals', V.buildConfessionalsModal({ configId: CID })],
      ['subs', V.buildSubsModal({ configId: CID })],
      ['1on1s', V.buildOneOnOnesModal({ configId: CID, defaultTribeRoleIds: ['r1', 'r2'], tribeNames: 'Kansas, Oregon' })],
      ['1on1s-empty', V.buildOneOnOnesModal({ configId: CID, defaultTribeRoleIds: [], tribeNames: '' })]
    ];
  };

  it('every modal has ≤5 top-level components, all Label (type 18)', async () => {
    for (const [name, m] of await allModals()) {
      assert.ok(m.components.length <= 5, `${name}: ${m.components.length} top-level components`);
      for (const c of m.components) assert.equal(c.type, 18, `${name}: non-Label top-level component`);
    }
  });

  it('every Label description is ≤100 chars (an over-long one rejects the whole modal)', async () => {
    for (const [name, m] of await allModals()) {
      for (const c of m.components) {
        if (c.description) assert.ok(c.description.length <= 100, `${name} / "${c.label}": description ${c.description.length} > 100`);
        assert.ok(c.label.length <= 45, `${name}: label "${c.label}" > 45`);
      }
    }
  });

  it('every custom_id stays within the 100-char limit at a worst-case configId', async () => {
    for (const [name, m] of await allModals()) {
      assert.ok(m.custom_id.length <= 100, `${name}: custom_id ${m.custom_id.length} > 100`);
      for (const c of m.components) {
        assert.ok(c.component.custom_id.length <= 100, `${name}: field custom_id too long`);
      }
    }
  });

  it('every Radio Group puts `default` on EXACTLY ONE option, omitted on siblings', async () => {
    // An explicit `default: false` on a sibling suppresses pre-selection for the WHOLE group.
    for (const [name, m] of await allModals()) {
      for (const c of m.components) {
        const inner = c.component;
        if (inner?.type !== 21) continue;
        const withKey = inner.options.filter(o => 'default' in o);
        assert.equal(withKey.length, 1, `${name} / ${inner.custom_id}: ${withKey.length} options carry a default key`);
        assert.equal(withKey[0].default, true, `${name}: default must be true, never false`);
        assert.ok(inner.options.length >= 2 && inner.options.length <= 10, `${name}: Radio Group needs 2-10 options`);
      }
    }
  });

  it('single-choice fields use Radio Group (21), never String Select (3) — `default` is ignored in modals', async () => {
    for (const [name, m] of await allModals()) {
      for (const c of m.components) {
        assert.notEqual(c.component?.type, 3, `${name}: a String Select in a modal won't honour default`);
      }
    }
  });
});
