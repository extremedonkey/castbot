// Tests for ⛺ Existing Tribe (Marooning → Tribes) and the shared Add Tribe modal builder.
//
// Two kinds of coverage:
//  1. THE REAL MODAL — buildTribeAddModal was extracted to utils/tribeDataUtils.js precisely so
//     tests can import the actual payload: Discord silently kills a whole modal on any single
//     limit overflow (Label ≤45, description ≤100, ≤5 top-level components — ComponentsV2Issues.md
//     §16), a bug class replica tests can never catch. Both flavors (new/existing) and both
//     origins (hub/marooning) are validated against those limits here.
//  2. SUBMIT LOGIC replicas (registerExistingTribe in castRankingManager.js can't be imported
//     without dragging in the bot): the recolor decision, the association-preservation rule, and
//     the role guards — using the REAL validateHexColor / populateTribeData where possible.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTribeAddModal, validateHexColor, populateTribeData } from '../utils/tribeDataUtils.js';

const ORIGIN = 'marooning_config_1783203296677_391415444084490240';
const fieldIds = (modal) => modal.data.components.map(l => l.component.custom_id);

describe('Existing Tribe modal — real payload shape', () => {
  const m = buildTribeAddModal({ castlistId: 'default', origin: ORIGIN, existing: true });

  it('routes to tribe_existing_modal| with the origin in the tribe_add slot', () => {
    assert.equal(m.type, 9);
    assert.equal(m.data.custom_id, `tribe_existing_modal|default|${ORIGIN}`);
    assert.equal(m.data.title, 'Add Existing Tribe');
  });

  it('leads with a required single Role Select — Tribe Name is gone', () => {
    const first = m.data.components[0];
    assert.equal(first.type, 18);
    assert.equal(first.label, 'Tribe Role');
    assert.deepEqual(
      { type: first.component.type, custom_id: first.component.custom_id, required: first.component.required, min: first.component.min_values, max: first.component.max_values },
      { type: 6, custom_id: 'tribe_role', required: true, min: 1, max: 1 }
    );
    assert.ok(!fieldIds(m).includes('tribe_name'));
  });

  it('explains the role-vs-New-Tribe split in the Role Select description', () => {
    const desc = m.data.components[0].description;
    assert.match(desc, /role this tribe already uses/);
    assert.match(desc, /New Tribe creates it/);
  });

  it('never offers a members select — existing mode assigns nobody, any origin', () => {
    assert.ok(!fieldIds(m).includes('tribe_members'));
    const hubFlavor = buildTribeAddModal({ castlistId: 'default', existing: true });
    assert.ok(!fieldIds(hubFlavor).includes('tribe_members'));
  });

  it('keeps emoji + both color fields', () => {
    assert.deepEqual(fieldIds(m), ['tribe_role', 'tribe_emoji', 'tribe_color_preset', 'tribe_color_custom']);
  });
});

describe('New Tribe modal — refactor to the shared builder changed nothing', () => {
  it('public (Castlist Hub) flavor: name + members, 5 components, old custom_id', () => {
    const m = buildTribeAddModal({ castlistId: 'default' });
    assert.equal(m.data.custom_id, 'tribe_add_modal|default');
    assert.equal(m.data.title, 'Add New Tribe');
    assert.deepEqual(fieldIds(m), ['tribe_name', 'tribe_emoji', 'tribe_members', 'tribe_color_preset', 'tribe_color_custom']);
  });

  it('private (marooning) flavor: members select dropped, origin appended', () => {
    const m = buildTribeAddModal({ castlistId: 'default', origin: ORIGIN });
    assert.equal(m.data.custom_id, `tribe_add_modal|default|${ORIGIN}`);
    assert.deepEqual(fieldIds(m), ['tribe_name', 'tribe_emoji', 'tribe_color_preset', 'tribe_color_custom']);
    assert.match(m.data.components[0].description, /no members assigned/);
  });
});

describe('Add Tribe modals — Discord modal limits (any overflow kills the whole modal)', () => {
  const flavors = [
    ['new/hub', buildTribeAddModal({ castlistId: 'default' })],
    ['new/marooning', buildTribeAddModal({ castlistId: 'default', origin: ORIGIN })],
    ['existing/marooning', buildTribeAddModal({ castlistId: 'default', origin: ORIGIN, existing: true })]
  ];

  for (const [name, m] of flavors) {
    it(`${name}: title ≤45, ≤5 top-level components, custom_id ≤100`, () => {
      assert.ok([...m.data.title].length <= 45, m.data.title);
      assert.ok(m.data.components.length <= 5, `${m.data.components.length} components`);
      assert.ok(m.data.custom_id.length <= 100, m.data.custom_id);
    });

    it(`${name}: every Label ≤45, every description ≤100`, () => {
      for (const l of m.data.components) {
        assert.equal(l.type, 18, 'modal children must be Labels');
        assert.ok([...l.label].length <= 45, l.label);
        if (l.description) assert.ok([...l.description].length <= 100, `${[...l.description].length}: ${l.description}`);
      }
    });
  }

  it('color preset select stays within 25 options, all with component-format emoji', () => {
    const m = buildTribeAddModal({ castlistId: 'default', existing: true });
    const preset = m.data.components.find(l => l.component.custom_id === 'tribe_color_preset').component;
    assert.ok(preset.options.length >= 2 && preset.options.length <= 25, `${preset.options.length} options`);
    for (const o of preset.options) {
      assert.ok(o.emoji?.name, `option ${o.label} needs { name } emoji`);
      assert.ok([...o.label].length <= 100);
    }
    assert.ok(preset.options.some(o => o.value === 'custom'), 'Custom... sentinel present');
  });
});

// ── Replica: registerExistingTribe's recolor decision (castRankingManager.js) ──
// The role is only EDITED when the host actively chose a color; validateHexColor is the REAL one.
function resolveRecolor(colorPreset, colorCustom) {
  let processedColor = null;
  if (colorPreset === 'custom' && colorCustom?.trim()) {
    processedColor = validateHexColor(colorCustom.trim());
  } else if (colorPreset && colorPreset !== 'custom') {
    processedColor = colorPreset.toUpperCase();
  }
  return processedColor; // non-null ⇒ role.edit fires
}

describe('Existing Tribe — recolor only on an active color choice', () => {
  it('a preset from the list recolors', () => {
    assert.equal(resolveRecolor('#e74c3c', ''), '#E74C3C');
  });
  it('Custom... + a valid hex recolors (3-digit shorthand included)', () => {
    assert.equal(resolveRecolor('custom', '#ff5733'), '#FF5733');
    assert.equal(resolveRecolor('custom', 'fff'), '#FFFFFF');
  });
  it('Custom... with an invalid or empty value does NOT recolor', () => {
    assert.equal(resolveRecolor('custom', 'notahex'), null);
    assert.equal(resolveRecolor('custom', ''), null);
    assert.equal(resolveRecolor('custom', '   '), null);
  });
  it('hex typed WITHOUT choosing Custom... does not recolor — the select is the consent', () => {
    assert.equal(resolveRecolor('', '#FF5733'), null);
  });
  it('nothing chosen leaves the role untouched', () => {
    assert.equal(resolveRecolor('', ''), null);
  });
});

// ── Replica: registerExistingTribe's storage write (castRankingManager.js) ──
// populateTribeData is the REAL one; the override afterwards is what's being pinned here.
function registerExistingTribeData(existing, role) {
  const tribe = populateTribeData(existing || {}, role, 'default', 'default');
  tribe.castlistIds = existing?.castlistIds || [];
  if (existing?.castlist) tribe.castlist = existing.castlist; else delete tribe.castlist;
  tribe.tribePlanner = true; // planner eligibility — see getMarooningTribeRoleIds
  return tribe;
}

const role = { id: 'r1', name: 'Balboa', color: 0xE74C3C, managed: false };

describe('Existing Tribe — prior castlist associations are preserved exactly', () => {
  it('a fresh role becomes a PRIVATE tribe: no castlist link, planner flag set', () => {
    const tribe = registerExistingTribeData(undefined, role);
    assert.deepEqual(tribe.castlistIds, []);
    assert.equal('castlist' in tribe, false);
    assert.equal(tribe.tribePlanner, true, 'without the flag a castlist-less tribe is invisible to Marooning');
    assert.equal(tribe.analyticsName, 'Balboa');
    assert.equal(tribe.emoji, '🏕️');
  });

  it('re-registering an archive-only tribe gains the flag — the escape hatch back into the planner', () => {
    const tribe = registerExistingTribeData({ castlistIds: ['castlist_archive_1'] }, role);
    assert.equal(tribe.tribePlanner, true);
    assert.deepEqual(tribe.castlistIds, ['castlist_archive_1'], 'flag added, links still untouched');
  });

  it('a role already on a public castlist keeps its links — re-registering must not un-publish it', () => {
    const existing = { castlistIds: ['season5_cl'], castlist: 'Season 5', emoji: '🔥', color: '#123456' };
    const tribe = registerExistingTribeData(existing, role);
    assert.deepEqual(tribe.castlistIds, ['season5_cl']);
    assert.equal(tribe.castlist, 'Season 5');
    assert.equal(tribe.emoji, '🔥');
    assert.equal(tribe.color, '#123456');
  });

  it("...and never GAINS 'default' — populateTribeData alone would have published it", () => {
    const existing = { castlistIds: ['season5_cl'] };
    // The hazard the override exists for: bare populateTribeData appends the target castlist.
    assert.ok(populateTribeData({ ...existing }, role, 'default', 'default').castlistIds.includes('default'));
    // The actual write does not.
    assert.deepEqual(registerExistingTribeData(existing, role).castlistIds, ['season5_cl']);
  });

  it('a v3-style tribe (castlistIds, no legacy castlist string) does not grow one', () => {
    const tribe = registerExistingTribeData({ castlistIds: ['x'] }, role);
    assert.equal('castlist' in tribe, false);
  });
});

// ── Replica: registerExistingTribe's role guards (castRankingManager.js) ──
function guardRole(roleObj, guildId) {
  if (!roleObj) return 'missing';
  if (roleObj.id === guildId) return 'everyone';
  if (roleObj.managed) return 'managed';
  return null;
}

describe('Existing Tribe — role guards', () => {
  const GUILD = 'g1';
  it('rejects a vanished role', () => assert.equal(guardRole(null, GUILD), 'missing'));
  it('rejects @everyone (role id === guild id)', () => assert.equal(guardRole({ id: 'g1' }, GUILD), 'everyone'));
  it('rejects integration-managed roles — they can never be assigned to players', () =>
    assert.equal(guardRole({ id: 'r2', managed: true }, GUILD), 'managed'));
  it('accepts a normal role, even one that is already a tribe', () =>
    assert.equal(guardRole(role, GUILD), null));
});
