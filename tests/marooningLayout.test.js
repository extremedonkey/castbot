// Tests for the 2026-08-09 🚣 Marooning rework and the New Tribe privacy fix.
//
// Two things are guarded here:
//  1. LAYOUT — casting decisions lead the tab, Tribes moved below, the SUMMARY block is gone, and
//     [👥 Add Cast][✒️ Bulk Offers] sit in their own row under the planner header.
//  2. PRIVACY — 🏕️ New Tribe launched from Marooning must create the role and NOTHING else: no member
//     role assignment, no castlist link. Before this, both fired from inside the Marooning tab and
//     published in-flux casting decisions to every spectator. That invariant previously had no test at
//     all — only comments and doc prose — which is precisely how it stayed broken.
//
// Pure logic replicated inline (buildMarooningView and the app.js modal handlers can't be imported
// without dragging in the whole bot), matching tests/marooningDraft.test.js.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const CONFIG_ID = 'config_123_456';

// ── Replica: buildMarooningView's copy + container assembly (castRankingManager.js) ──
const PLANNER_INTRO = '### ```🚣‍♀️ Marooning Planner```\n' +
  'Use this tab to review all of your casting decisions, make sure everyone has accepted their ' +
  'placement and plan / balance tribes ahead of marooning.';
const TRIBES_INTRO = 'Use Draft Tribes to play around with different casting combinations and balance ' +
  'as you see fit. Only Prod can see this - tribes only become public when added to a castlist.';

function buildMarooningContainer({ configId = CONFIG_ID, body = '-# No applicants yet for this season.', tribesLine = '**Tribes:** None', canDraft = false, hasRejects = false, showRejects = false } = {}) {
  const addCastButton = { type: 2, custom_id: `marooning_add_cast_${configId}`, label: 'Add Cast', style: 2, emoji: { name: '👥' } };
  const bulkOffersButton = { type: 2, custom_id: `casting_messages_0_${configId}`, label: 'Bulk Offers', style: 2, emoji: { name: '✒️' } };
  const rejectsToggleButton = {
    type: 2,
    custom_id: showRejects ? `marooning_hide_rejects_${configId}` : `marooning_show_rejects_${configId}`,
    label: 'Rejects', style: 2, emoji: { name: '🗑️' }, disabled: !hasRejects
  };
  return {
    type: 17, accent_color: 0x9B59B6,
    components: [
      { type: 10, content: `## 🚣 Marooning\n> ### Season` },
      { type: 1, components: [{ type: 2, custom_id: `season_marooning_${configId}` }] },
      { type: 14 },
      { type: 10, content: PLANNER_INTRO },
      { type: 1, components: [addCastButton, bulkOffersButton] },
      { type: 10, content: body },
      { type: 14 },
      { type: 10, content: `### \`\`\`🏕️ Tribes\`\`\`\n${TRIBES_INTRO}` },
      { type: 1, components: [
        { type: 2, custom_id: `tribe_add_button|default|marooning_${configId}`, label: 'New Tribe', style: 2, emoji: { name: '🏕️' } },
        { type: 2, custom_id: `marooning_draft_tribes_${configId}`, label: 'Draft Tribes', style: 2, emoji: { name: '💭' }, disabled: !canDraft }
      ]},
      { type: 10, content: tribesLine },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'season_manager', label: '← Seasons', style: 2 },
        { type: 2, custom_id: `season_edit_info_marooning_${configId}`, label: 'Edit', style: 2, emoji: { name: '✏️' } },
        rejectsToggleButton
      ]}
    ]
  };
}

const textOf = (c) => c.components.filter(x => x.type === 10).map(x => x.content).join('\n');
const allButtons = (c) => c.components.filter(x => x.type === 1).flatMap(r => r.components);
const countComponents = (c) => 1 + c.components.reduce((n, x) => n + 1 + (x.components?.length || 0), 0);

describe('Marooning layout — casting decisions lead the tab', () => {
  const c = buildMarooningContainer();
  const types = c.components.map(x => x.type);

  it('renders planner intro → action row → roster, before the Tribes block', () => {
    const plannerIdx = c.components.findIndex(x => x.content === PLANNER_INTRO);
    const actionRowIdx = c.components.findIndex(x => x.type === 1 && x.components.some(b => b.label === 'Add Cast'));
    const tribesIdx = c.components.findIndex(x => x.content?.includes('🏕️ Tribes'));
    assert.ok(plannerIdx < actionRowIdx, 'buttons sit under the planner header');
    assert.ok(actionRowIdx < tribesIdx, 'casting section comes before Tribes');
  });

  it('leads with the renamed header — "Casting Decisions" is gone', () => {
    assert.match(textOf(c), /🚣‍♀️ Marooning Planner/);
    assert.doesNotMatch(textOf(c), /Casting Decisions/);
    assert.doesNotMatch(textOf(c), /🎬/);
  });

  it('carries the review-your-decisions copy', () => {
    assert.match(textOf(c), /review all of your casting decisions/);
    assert.match(textOf(c), /plan \/ balance tribes ahead of marooning/);
  });

  it('carries the tribes-are-private copy', () => {
    assert.match(textOf(c), /Only Prod can see this - tribes only become public when added to a castlist/);
    assert.match(textOf(c), /play around with different casting combinations/);
  });

  it('has NO SUMMARY block — every number in it was already above it', () => {
    const t = textOf(c);
    for (const gone of ['SUMMARY', 'Total Applicants', 'Scored:', '📊']) {
      assert.ok(!t.includes(gone), `"${gone}" should be gone`);
    }
  });

  it('never emits an empty Text Display (Discord rejects those)', () => {
    for (const comp of c.components) {
      if (comp.type === 10) assert.ok(comp.content && comp.content.length > 0);
    }
  });

  it('stays well inside the 40-component limit', () => {
    const n = countComponents(c);
    assert.ok(n <= 40, `${n}/40`);
    assert.ok(n > 15, 'sanity — the replica should be roughly the real shape');
  });
});

describe('Marooning buttons — Add Cast left of Bulk Offers', () => {
  const c = buildMarooningContainer();
  const row = c.components.find(x => x.type === 1 && x.components.some(b => b.label === 'Add Cast'));

  it('puts the two actions in their own row, Add Cast first', () => {
    assert.deepEqual(row.components.map(b => b.label), ['Add Cast', 'Bulk Offers']);
  });

  it('renames Bulk Invites → Bulk Offers WITHOUT changing the custom_id', () => {
    const bulk = row.components[1];
    assert.equal(bulk.label, 'Bulk Offers');
    // The id is the contract with app.js's casting_messages handler AND with any message already on
    // screen — renaming it would break in-flight interactions for zero benefit.
    assert.equal(bulk.custom_id, `casting_messages_0_${CONFIG_ID}`);
  });

  it('moves Bulk Offers OUT of the shared bottom row', () => {
    const bottom = c.components[c.components.length - 1];
    assert.deepEqual(bottom.components.map(b => b.label), ['← Seasons', 'Edit', 'Rejects']);
  });

  it('keeps Rejects in the bottom row, disabled when there is nothing to reveal', () => {
    assert.equal(buildMarooningContainer({ hasRejects: false }).components.at(-1).components[2].disabled, true);
    assert.equal(buildMarooningContainer({ hasRejects: true }).components.at(-1).components[2].disabled, false);
  });

  it('gates Draft Tribes on having at least one tribe', () => {
    const draftBtn = (canDraft) => allButtons(buildMarooningContainer({ canDraft })).find(b => b.label === 'Draft Tribes');
    assert.equal(draftBtn(false).disabled, true);
    assert.equal(draftBtn(true).disabled, false);
  });

  it('keeps every custom_id within Discord\'s 100-char cap', () => {
    for (const b of allButtons(c)) {
      if (b.custom_id) assert.ok(b.custom_id.length <= 100, `${b.custom_id} is ${b.custom_id.length}`);
    }
  });

  it('carries the marooning origin on New Tribe — that origin is what makes it private', () => {
    const newTribe = allButtons(c).find(b => b.label === 'New Tribe');
    assert.equal(newTribe.custom_id, `tribe_add_button|default|marooning_${CONFIG_ID}`);
    assert.equal(newTribe.custom_id.split('|')[2], `marooning_${CONFIG_ID}`);
  });
});

// ── Replica: the isPrivateTribe branches in app.js (tribe_add_button + tribe_add_modal) ──
const isPrivateTribe = (origin) => !!origin?.startsWith('marooning_');

function buildTribeModalComponents(origin) {
  const priv = isPrivateTribe(origin);
  return [
    { custom_id: 'tribe_name' },
    { custom_id: 'tribe_emoji' },
    ...(priv ? [] : [{ custom_id: 'tribe_members' }]),
    { custom_id: 'tribe_color_preset' }
  ];
}

// Mirrors the submit: what actually happens to Discord + playerData.
function submitTribe({ origin, submittedMemberIds = [] }) {
  const priv = isPrivateTribe(origin);
  const tribe = { castlistIds: ['default'], castlist: 'default', analyticsName: 'Tribe' }; // populateTribeData output
  const effects = { rolesAssigned: [], castlistLinked: false };
  if (priv) {
    tribe.castlistIds = [];
    delete tribe.castlist;
  } else {
    effects.castlistLinked = true;
    effects.rolesAssigned = [...submittedMemberIds];
  }
  return { tribe, effects };
}

describe('New Tribe from Marooning — private by construction', () => {
  const MAROONING = `marooning_${CONFIG_ID}`;

  it('drops the Tribe Members select from the modal', () => {
    const ids = buildTribeModalComponents(MAROONING).map(c => c.custom_id);
    assert.ok(!ids.includes('tribe_members'), 'no way to pick members from Marooning');
    assert.deepEqual(ids, ['tribe_name', 'tribe_emoji', 'tribe_color_preset']);
  });

  it('assigns ZERO Discord roles', () => {
    const { effects } = submitTribe({ origin: MAROONING });
    assert.deepEqual(effects.rolesAssigned, [], 'a real role would expose the casting decision instantly');
  });

  it('assigns zero roles EVEN IF tribe_members is somehow submitted', () => {
    // Hiding the field is UI; the submit must enforce it too. A replayed or crafted payload must not
    // be able to assign roles just because the handler trusts the modal it thinks it sent.
    const { effects } = submitTribe({ origin: MAROONING, submittedMemberIds: ['u1', 'u2'] });
    assert.deepEqual(effects.rolesAssigned, []);
  });

  it('does NOT link the tribe to a castlist', () => {
    const { tribe, effects } = submitTribe({ origin: MAROONING });
    assert.equal(effects.castlistLinked, false);
    assert.deepEqual(tribe.castlistIds, [], 'a castlist entry makes the tribe public via /castlist');
    assert.equal('castlist' in tribe, false, 'the legacy string field must go too');
  });

  it('still creates the tribe entity, so Marooning lists it and Draft Tribes can use it', () => {
    const { tribe } = submitTribe({ origin: MAROONING });
    assert.equal(tribe.analyticsName, 'Tribe');
  });
});

describe('New Tribe from the Castlist Hub — unchanged, still public', () => {
  it('keeps the Tribe Members select', () => {
    assert.ok(buildTribeModalComponents(undefined).map(c => c.custom_id).includes('tribe_members'));
  });

  it('still assigns roles and links to the castlist', () => {
    const { tribe, effects } = submitTribe({ origin: undefined, submittedMemberIds: ['u1'] });
    assert.deepEqual(effects.rolesAssigned, ['u1']);
    assert.equal(effects.castlistLinked, true);
    assert.deepEqual(tribe.castlistIds, ['default']);
    assert.equal(tribe.castlist, 'default');
  });

  it('only a marooning_ origin triggers private mode', () => {
    for (const origin of [undefined, null, '', 'castlist_hub', 'marooningX', 'not_marooning_123']) {
      assert.equal(isPrivateTribe(origin), false, `origin ${origin}`);
    }
    assert.equal(isPrivateTribe('marooning_config_1'), true);
  });
});

// ── Replica: buildPremiumUpsell's state-conditional copy (menuBuilder.js) ──
function premiumCopy(tierState) {
  const ts = tierState;
  const isEntitled = ts?.state === 'active';
  let stateLine = `**This server doesn't have CastBot Premium yet.**`;
  if (ts?.state === 'lapsed') stateLine = `**This server's premium lapsed** — renew to pick up where you left off.`;
  else if (ts?.state === 'grace') stateLine = `**This server's premium expired** — still working during grace, renew to keep it.`;
  else if (ts?.state === 'active') {
    stateLine = ts.permanent
      ? `**This server has CastBot Premium** (permanent).`
      : `**This server has paid up for CastBot Premium** until <date>. Ko-Fi will attempt to charge you close to the renewal date, to renew CastBot Premium for another month.`;
  }
  const howTo = isEntitled
    ? `**How to transfer Premium to another server**\n1. Simply tap **🎟️ Redeem** below and enter your **Ko-Fi account** email address.\n2. CastBot will then inform you what server you have CastBot Premium on and allow you to transfer.`
    : `**How to get it**\n1. Join the **CastBot Premium** membership at ko-fi.com/CastBot\n2. Come back here and tap **🎟️ Redeem** to link your subscription`;
  return { stateLine, howTo };
}

describe('Premium upsell copy', () => {
  it('an entitled server is told Ko-Fi will auto-charge — not that it simply stops', () => {
    const { stateLine } = premiumCopy({ state: 'active', permanent: false });
    assert.match(stateLine, /has paid up for CastBot Premium/);
    assert.match(stateLine, /Ko-Fi will attempt to charge you close to the renewal date/);
  });

  it('a permanent grant keeps the short line — there is no Ko-Fi charge to warn about', () => {
    const { stateLine } = premiumCopy({ state: 'active', permanent: true });
    assert.match(stateLine, /\(permanent\)/);
    assert.doesNotMatch(stateLine, /Ko-Fi/);
  });

  it('an entitled server sees transfer instructions instead of how to buy', () => {
    const { howTo } = premiumCopy({ state: 'active', permanent: false });
    assert.match(howTo, /How to transfer Premium to another server/);
    assert.doesNotMatch(howTo, /How to get it/);
    assert.match(howTo, /Ko-Fi account.* email address/s);
    assert.doesNotMatch(howTo, /rransfer/, 'the typo in the brief must not ship');
  });

  it('everyone else still gets the purchase path', () => {
    for (const ts of [null, { state: 'lapsed' }, { state: 'grace' }]) {
      const { howTo } = premiumCopy(ts);
      assert.match(howTo, /How to get it/, `state ${ts?.state || 'none'}`);
      assert.doesNotMatch(howTo, /How to transfer/);
    }
  });

  it('lapsed and grace keep their own state lines', () => {
    assert.match(premiumCopy({ state: 'lapsed' }).stateLine, /lapsed/);
    assert.match(premiumCopy({ state: 'grace' }).stateLine, /expired/);
    assert.match(premiumCopy(null).stateLine, /doesn't have CastBot Premium yet/);
  });
});
