// Tests for 👥 Add Cast — creating application channels for people who never clicked Apply.
// Unlike most suites here, these import the REAL module: src/seasons/addCast.js's pure helpers have
// no Discord/file-I/O dependencies of their own (the heavy imports are only reached by addCastMembers),
// it loads in ~340ms and the process exits cleanly — so there's no reason to test a replica.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADD_CAST_MODES,
  DEFAULT_ADD_CAST_MODE,
  buildAddCastModal,
  parseAddCastSubmission,
  splitExistingApplicants,
  buildAddCastSummary
} from '../src/seasons/addCast.js';

const CONFIG_ID = 'config_1786253994228_1086246253819613274';

describe('Add Cast modal', () => {
  const modal = buildAddCastModal(CONFIG_ID, 'S1 - PremiumVivor');

  it('routes back to the matching submit handler', () => {
    assert.equal(modal.custom_id, `marooning_add_cast_modal|${CONFIG_ID}`);
    assert.ok(modal.custom_id.length <= 100, 'Discord custom_id cap');
  });

  it('offers a multi-user select, required, capped at Discord\'s 25', () => {
    const sel = modal.components[0].component;
    assert.equal(modal.components[0].type, 18); // Label wrapper
    assert.equal(sel.type, 5);                  // User Select
    assert.equal(sel.custom_id, 'add_cast_users');
    assert.equal(sel.required, true);
    assert.equal(sel.min_values, 1);
    assert.equal(sel.max_values, 25);
  });

  it('offers exactly the two modes, with create_and_add pre-selected', () => {
    const sel = modal.components[1].component;
    assert.equal(sel.type, 3); // String Select
    assert.deepEqual(sel.options.map(o => o.value), ['create_and_add', 'create_only']);
    assert.equal(sel.options[0].default, true);
    assert.equal(sel.options[1].default, false);
  });

  it('states the default in the description too — modal select defaults are unreliable in Discord', () => {
    assert.match(modal.components[1].description, /[Dd]efault/);
  });

  it('keeps every Label description within Discord\'s 100-char cap', () => {
    for (const row of modal.components) {
      assert.ok(row.description.length <= 100, `${row.label}: ${row.description.length} chars`);
    }
  });

  it('keeps option labels SHORT enough to survive Discord\'s collapsed-row truncation', () => {
    // The first version used the full sentence as the label; Discord cut both options at
    // "Automatically create application channels and…", making them indistinguishable in the
    // collapsed select. ~45 chars is what actually renders — the detail lives in `description`.
    for (const o of modal.components[1].component.options) {
      assert.ok(o.label.length <= 45, `${o.value}: label is ${o.label.length} chars — will truncate`);
      assert.ok(o.description.length <= 100, `${o.value}: description over Discord's cap`);
    }
  });

  it('makes the two options distinguishable from their labels alone', () => {
    const [a, b] = modal.components[1].component.options;
    assert.notEqual(a.label.slice(0, 30), b.label.slice(0, 30), 'labels must differ before truncation bites');
  });
});

describe('parseAddCastSubmission', () => {
  const row = (custom_id, values) => ({ type: 18, component: { custom_id, values } });

  it('reads users and mode out of Label-wrapped components', () => {
    const r = parseAddCastSubmission([row('add_cast_users', ['1', '2']), row('add_cast_mode', ['create_only'])]);
    assert.deepEqual(r.userIds, ['1', '2']);
    assert.equal(r.mode, 'create_only');
  });

  it('falls back to create_and_add when the mode select comes back empty', () => {
    // The whole reason the default is restated in the Label description — Discord may not pre-select.
    assert.equal(parseAddCastSubmission([row('add_cast_users', ['1'])]).mode, DEFAULT_ADD_CAST_MODE);
    assert.equal(parseAddCastSubmission([row('add_cast_users', ['1']), row('add_cast_mode', [])]).mode, 'create_and_add');
  });

  it('falls back on an unknown mode rather than creating invisible channels', () => {
    assert.equal(parseAddCastSubmission([row('add_cast_mode', ['nonsense'])]).mode, 'create_and_add');
  });

  it('tolerates the legacy ActionRow shape', () => {
    const legacy = [{ type: 1, components: [{ custom_id: 'add_cast_users', values: ['9'] }] }];
    assert.deepEqual(parseAddCastSubmission(legacy).userIds, ['9']);
  });

  it('returns an empty roster rather than throwing on junk input', () => {
    for (const input of [null, undefined, [], [{}], [{ type: 18 }]]) {
      assert.deepEqual(parseAddCastSubmission(input).userIds, []);
    }
  });

  it('the default mode grants the applicant access; the test mode does not', () => {
    assert.equal(ADD_CAST_MODES[DEFAULT_ADD_CAST_MODE].grantApplicantAccess, true);
    assert.equal(ADD_CAST_MODES.create_only.grantApplicantAccess, false);
  });
});

describe('splitExistingApplicants — create-only, never touch an existing application', () => {
  const GUILD = 'g1';
  const live = () => true;
  const pd = (applications) => ({ [GUILD]: { applications } });

  it('skips a user who already has a live application for THIS season', () => {
    const data = pd({ ch1: { userId: 'u1', configId: CONFIG_ID } });
    const r = splitExistingApplicants(data, GUILD, CONFIG_ID, ['u1', 'u2'], live);
    assert.deepEqual(r.toCreate, ['u2']);
    assert.deepEqual(r.skipped, [{ userId: 'u1', channelId: 'ch1' }]);
  });

  it('does NOT skip an application belonging to a different season', () => {
    const data = pd({ ch1: { userId: 'u1', configId: 'config_other' } });
    const r = splitExistingApplicants(data, GUILD, CONFIG_ID, ['u1'], live);
    assert.deepEqual(r.toCreate, ['u1'], 'a past season must not block this season');
    assert.equal(r.skipped.length, 0);
  });

  it('does NOT skip when the recorded channel was deleted — that record is an orphan', () => {
    const data = pd({ ch1: { userId: 'u1', configId: CONFIG_ID } });
    const r = splitExistingApplicants(data, GUILD, CONFIG_ID, ['u1'], () => false);
    assert.deepEqual(r.toCreate, ['u1']);
  });

  it('de-dupes a repeated user so one selection never creates two channels', () => {
    const r = splitExistingApplicants(pd({}), GUILD, CONFIG_ID, ['u1', 'u1', 'u2'], live);
    assert.deepEqual(r.toCreate, ['u1', 'u2']);
  });

  it('handles a guild with no applications at all', () => {
    assert.deepEqual(splitExistingApplicants({}, GUILD, CONFIG_ID, ['u1'], live).toCreate, ['u1']);
    assert.deepEqual(splitExistingApplicants(pd(undefined), GUILD, CONFIG_ID, ['u1'], live).toCreate, ['u1']);
  });

  it('preserves selection order', () => {
    const r = splitExistingApplicants(pd({}), GUILD, CONFIG_ID, ['c', 'a', 'b'], live);
    assert.deepEqual(r.toCreate, ['c', 'a', 'b']);
  });

  it('reports the FIRST live channel when a user somehow has two records', () => {
    const data = pd({ chA: { userId: 'u1', configId: CONFIG_ID }, chB: { userId: 'u1', configId: CONFIG_ID } });
    const r = splitExistingApplicants(data, GUILD, CONFIG_ID, ['u1'], live);
    assert.equal(r.skipped.length, 1);
    assert.equal(r.skipped[0].channelId, 'chA');
  });
});

describe('buildAddCastSummary — every outcome is named', () => {
  const c = (n) => Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, channelId: `ch${i}` }));

  it('lists created members with channel links', () => {
    const s = buildAddCastSummary({ created: c(2), skipped: [], failed: [], mode: 'create_and_add' });
    assert.match(s, /Added 2 cast members/);
    assert.match(s, /<@u0> → <#ch0>/);
  });

  it('uses the singular for one member', () => {
    assert.match(buildAddCastSummary({ created: c(1), skipped: [], failed: [], mode: 'create_and_add' }), /1 cast member\b/);
  });

  it('warns when channels were created without applicant access', () => {
    const s = buildAddCastSummary({ created: c(1), skipped: [], failed: [], mode: 'create_only' });
    assert.match(s, /WITHOUT applicant access/);
  });

  it('does not warn in the normal mode', () => {
    const s = buildAddCastSummary({ created: c(1), skipped: [], failed: [], mode: 'create_and_add' });
    assert.doesNotMatch(s, /WITHOUT applicant access/);
  });

  it('reports skips with the reason, so a silent no-op is impossible', () => {
    const s = buildAddCastSummary({ created: [], skipped: c(1), failed: [], mode: 'create_and_add' });
    assert.match(s, /Skipped 1 cast member — already have an application/);
    assert.match(s, /<@u0> → <#ch0>/);
  });

  it('reports failures with their error text', () => {
    const s = buildAddCastSummary({ created: [], skipped: [], failed: [{ userId: 'u9', error: 'Not a member of this server' }], mode: 'create_and_add' });
    assert.match(s, /Failed for 1 cast member/);
    assert.match(s, /<@u9> — Not a member of this server/);
  });

  it('still renders a header when nothing at all happened', () => {
    const s = buildAddCastSummary({ created: [], skipped: [], failed: [], mode: 'create_and_add' });
    assert.match(s, /## 👥 Add Cast/);
  });

  it('shows created, skipped and failed together in one partial-success card', () => {
    const s = buildAddCastSummary({ created: c(1), skipped: [{ userId: 'us', channelId: 'chs' }], failed: [{ userId: 'uf', error: 'boom' }], mode: 'create_and_add' });
    assert.match(s, /Added 1/);
    assert.match(s, /Skipped 1/);
    assert.match(s, /Failed for 1/);
  });
});
