/**
 * One-shot create modals for Give / Remove Item and Display Text.
 *
 * Both replace multi-screen flows (item: 3-7 interactions, display text: 4) with a single
 * modal. The assertions here cover the three things that silently break a Discord modal with
 * no server-side error at all — a 6th field, a Radio Group whose siblings carry `default:
 * false`, and an over-long Label description — plus the parse rules and the stored shape,
 * which must match byte-for-byte what the Container editor writes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGiveItemModal,
  parseGiveItemFields,
  buildGiveItemOutcome,
  buildItemPickerUI,
  getSortedGuildItems,
  buildDisplayTextModal,
  buildDisplayTextPreview,
  DISPLAY_TEXT_PREVIEW_BUDGET
} from '../customActionUI.js';
import { buildLimitOptions } from '../utils/periodUtils.js';

const LIMITS = buildLimitOptions({ currentLimit: 'once_per_player', includeCustom: false });
const items = n => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, emoji: '🗿' }));
const fieldById = (modal, id) => modal.data.components.find(l => l.component?.custom_id === id);

// ── Discord modal invariants — a breach here is an instant "This interaction failed" ──
function assertModalIsLegal(modal) {
  const fields = modal.data.components;
  assert.ok(fields.length <= 5, `max 5 top-level components (got ${fields.length})`);
  assert.ok(modal.data.title.length <= 45, 'title within 45 chars');
  assert.ok(modal.data.custom_id.length <= 100, 'custom_id within 100 chars');

  for (const f of fields) {
    assert.equal(f.type, 18, 'every field is Label-wrapped');
    assert.ok(f.label.length <= 45, `label "${f.label}" within 45 chars`);
    if (f.description !== undefined) assert.ok(f.description.length <= 100, `description within 100: "${f.description}"`);

    if (f.component.type === 21) {
      const opts = f.component.options;
      assert.ok(opts.length >= 2 && opts.length <= 10, 'Radio Group holds 2-10 options');
      // The killer: an explicit `default: false` on a sibling suppresses the WHOLE group
      const withKey = opts.filter(o => 'default' in o);
      assert.ok(withKey.length <= 1, `at most one option carries \`default\` (got ${withKey.length})`);
      for (const o of withKey) assert.equal(o.default, true, 'a present `default` is always true');
      for (const o of opts) assert.equal('emoji' in o, false, 'Radio Group options carry no emoji field');
    }
  }
}

describe('Give / Remove Item modal — shape', () => {
  it('is a legal 5-field modal whose custom_id round-trips buttonId + executeOn', () => {
    const modal = buildGiveItemModal('stray_dog_102331', 'false', items(10), LIMITS);
    assertModalIsLegal(modal);
    assert.equal(modal.data.custom_id, 'safari_item_quick_stray_dog_102331_false');
    assert.deepEqual(
      modal.data.components.map(f => f.component.custom_id),
      ['item_select', 'quantity', 'operation', 'usage_limit', 'execute_on']
    );
  });

  it('stays legal for every branch and for a guild at the item ceiling', () => {
    for (const executeOn of ['true', 'false', 'always']) {
      for (const n of [0, 1, 25, 79]) {
        assertModalIsLegal(buildGiveItemModal('b_1', executeOn, items(n), LIMITS));
      }
    }
  });

  it('makes the item field optional so a blank submit can reach the search picker', () => {
    const item = fieldById(buildGiveItemModal('b', 'true', items(79), LIMITS), 'item_select');
    assert.equal(item.component.required, false);
    assert.equal(item.component.min_values, 0);
    assert.match(item.description, /79/, 'says how many it could not show');
  });

  it('pre-selects Give, and Once Per Player, via Radio Group defaults that actually work', () => {
    const modal = buildGiveItemModal('b', 'true', items(3), LIMITS);
    assert.equal(fieldById(modal, 'operation').component.options.find(o => o.default).value, 'give');
    assert.equal(fieldById(modal, 'usage_limit').component.options.find(o => o.default).value, 'once_per_player');
  });

  it('defaults Executes-if to the branch the admin clicked Add Outcome under', () => {
    for (const branch of ['true', 'false']) {
      const eo = fieldById(buildGiveItemModal('b', branch, items(3), LIMITS), 'execute_on').component;
      assert.equal(eo.options.find(o => o.default).value, branch);
      assert.equal(eo.options.length, 2, 'Always is hidden for a conditional outcome');
    }
  });

  it('offers Always only when the outcome already lives in that branch', () => {
    const eo = fieldById(buildGiveItemModal('b', 'always', items(3), LIMITS), 'execute_on').component;
    assert.equal(eo.options.length, 3);
    assert.equal(eo.options.find(o => o.default).value, 'always');
  });

  it('excludes Custom… — its sub-screens cannot live inside a modal', () => {
    const limit = fieldById(buildGiveItemModal('b', 'true', items(3), LIMITS), 'usage_limit').component;
    assert.equal(limit.options.some(o => o.value === 'custom'), false);
  });
});

describe('Give / Remove Item modal — parsing', () => {
  const base = { quantity: '1', operation: ['give'], usage_limit: ['once_per_player'], execute_on: ['true'] };

  it('parses a complete submit', () => {
    const r = parseGiveItemFields({ ...base, item_select: ['idol_1'], quantity: '3' }, 'true');
    assert.deepEqual(r, { itemId: 'idol_1', quantity: 3, operation: 'give', limitType: 'once_per_player', executeOn: 'true' });
  });

  it('returns itemId null when the select is left blank — the picker signal', () => {
    assert.equal(parseGiveItemFields(base, 'true').itemId, null);
    assert.equal(parseGiveItemFields({ ...base, item_select: [] }, 'true').itemId, null);
  });

  it('rejects a negative quantity by naming the field that actually controls direction', () => {
    const { error } = parseGiveItemFields({ ...base, quantity: '-3' }, 'true');
    assert.match(error, /1 or more/);
    assert.match(error, /Give or Remove/, 'points at the real control rather than silently removing');
  });

  it('rejects zero, blank and non-numeric quantities', () => {
    assert.ok(parseGiveItemFields({ ...base, quantity: '0' }, 'true').error);
    assert.match(parseGiveItemFields({ ...base, quantity: '  ' }, 'true').error, /blank/);
    assert.match(parseGiveItemFields({ ...base, quantity: 'five' }, 'true').error, /five/);
    assert.ok(parseGiveItemFields({ ...base, quantity: '100000' }, 'true').error);
  });

  it('applies defaults when optional radios come back empty', () => {
    const r = parseGiveItemFields({ quantity: '1' }, 'false');
    assert.equal(r.operation, 'give');
    assert.equal(r.limitType, 'once_per_player');
    assert.equal(r.executeOn, 'false', 'falls back to the custom_id branch');
  });

  it('tolerates bare strings as well as arrays from the modal payload', () => {
    const r = parseGiveItemFields({ quantity: '2', operation: 'remove', usage_limit: 'unlimited', item_select: 'x' }, 'true');
    assert.equal(r.operation, 'remove');
    assert.equal(r.limitType, 'unlimited');
    assert.equal(r.itemId, 'x');
  });
});

describe('Give / Remove Item — stored shape matches the Container editor', () => {
  it('writes itemId, quantity, operation and the same limit shapes', () => {
    const outcome = buildGiveItemOutcome(
      { itemId: 'idol_1', quantity: 2, operation: 'remove', limitType: 'once_per_player', executeOn: 'false' },
      3
    );
    assert.deepEqual(outcome, {
      type: 'give_item',
      order: 3,
      config: { itemId: 'idol_1', quantity: 2, operation: 'remove', limit: { type: 'once_per_player', claimedBy: [] } },
      executeOn: 'false'
    });
  });

  it('keeps quantity positive — direction lives in `operation`, never in the sign', () => {
    const o = buildGiveItemOutcome({ itemId: 'x', quantity: 5, operation: 'remove', limitType: 'unlimited', executeOn: 'true' }, 0);
    assert.equal(o.config.quantity, 5);
    assert.deepEqual(o.config.limit, { type: 'unlimited' });
  });
});

describe('Item picker fallback screen', () => {
  it('offers a search entry only once the list outgrows a single screen', () => {
    const many = buildItemPickerUI('b', Object.fromEntries(items(30).map(i => [i.id, i])));
    const opts = many.components[0].components[2].components[0].options;
    assert.equal(opts[0].value, 'search_entities', 'search leads');
    assert.ok(opts.length <= 25, 'within Discord\'s option cap');

    const few = buildItemPickerUI('b', Object.fromEntries(items(3).map(i => [i.id, i])));
    const fewOpts = few.components[0].components[2].components[0].options;
    assert.equal(fewOpts.some(o => o.value === 'search_entities'), false);
    assert.equal(fewOpts.length, 3);
  });

  const someItems = Object.fromEntries(items(3).map(i => [i.id, i]));

  it('drives the pre-existing select handler, so the search chain is untouched', () => {
    const ui = buildItemPickerUI('stray_dog_102331', someItems);
    assert.equal(ui.components[0].components[2].components[0].custom_id, 'safari_give_item_select_stray_dog_102331');
  });

  it('reassures the admin their other answers survived the detour', () => {
    const ui = buildItemPickerUI('b', someItems, 'Your quantity, limit and condition are kept — just pick the item.');
    assert.match(ui.components[0].components[0].content, /kept/);
  });

  it('sorts newest-first so a just-created item is at the top', () => {
    const sorted = getSortedGuildItems({
      old: { name: 'Old', metadata: { createdAt: 1 } },
      fresh: { name: 'Fresh', metadata: { createdAt: 5 } },
      edited: { name: 'Edited', metadata: { createdAt: 2, lastModified: 9 } }
    });
    assert.deepEqual(sorted.map(i => i.name), ['Edited', 'Fresh', 'Old']);
    assert.equal(sorted.length, 3, 'returns the FULL list — capping is the field builder\'s job');
  });
});

describe('Display Text modal — Executes-if only on create', () => {
  it('create carries the branch as a 5th field', () => {
    const modal = buildDisplayTextModal('b', 0, null, 'textUrl', 'false');
    assertModalIsLegal(modal);
    assert.equal(modal.data.components.length, 5);
    const eo = fieldById(modal, 'execute_on').component;
    assert.equal(eo.type, 21, 'Radio Group — a String Select default is ignored in modals');
    assert.equal(eo.options.find(o => o.default).value, 'false');
  });

  it('edit omits it — the outcome already has a branch, and Move to… owns changing it', () => {
    const modal = buildDisplayTextModal('b', 2, { type: 'display_text', config: { content: 'hi' } }, 'textUrl');
    assertModalIsLegal(modal);
    assert.equal(modal.data.components.length, 4);
    assert.equal(fieldById(modal, 'execute_on'), undefined);
  });

  it('stays legal in upload mode, where the image field becomes a File Upload', () => {
    for (const mode of ['textUrl', 'upload']) {
      assertModalIsLegal(buildDisplayTextModal('b', 0, null, mode, 'always'));
    }
  });
});

describe('Display Text preview — no more premature truncation', () => {
  // 57% of production display_text outcomes exceeded the old 100-char cut; median is 126.
  const mk = (content, title = '') => ({ type: 'display_text', config: { title, content } });

  it('shows a median-length body in full — the case the old cap broke', () => {
    const content = 'b'.repeat(126);
    assert.equal(buildDisplayTextPreview(mk(content)), content);
    assert.doesNotMatch(buildDisplayTextPreview(mk(content)), /\.\.\./);
  });

  it('shows the longest content production actually holds, in full, with a title', () => {
    const content = 'x'.repeat(1984);
    const out = buildDisplayTextPreview(mk(content, 'A Title'));
    assert.ok(out.includes(content), 'complete body');
    assert.ok(out.startsWith('**A Title**'), 'title retained');
  });

  it('shows everything the modal can produce (2000 chars) without cutting', () => {
    const content = 'y'.repeat(2000);
    assert.ok(buildDisplayTextPreview(mk(content)).includes(content));
  });

  it('only cuts beyond the real Discord budget, and says why when it does', () => {
    const content = 'z'.repeat(DISPLAY_TEXT_PREVIEW_BUDGET + 500);
    const out = buildDisplayTextPreview(mk(content));
    assert.ok(out.length <= DISPLAY_TEXT_PREVIEW_BUDGET, `stays in budget (${out.length})`);
    assert.match(out, /truncated for display/, 'explains itself rather than a bare ellipsis');
    assert.match(out, /still runs in-game/, 'reassures that only the preview is cut');
  });

  it('handles the empty and title-only states', () => {
    assert.equal(buildDisplayTextPreview(null), 'No content configured yet');
    assert.equal(buildDisplayTextPreview(mk('')), 'No content configured yet');
    assert.equal(buildDisplayTextPreview({ type: 'give_item', config: {} }), 'No content configured yet');
    assert.equal(buildDisplayTextPreview(mk('', 'Just a title')), '**Just a title**\n*No content*');
  });

  it('reads legacy top-level fields as well as config', () => {
    assert.equal(buildDisplayTextPreview({ type: 'display_text', content: 'legacy body' }), 'legacy body');
  });
});

/**
 * REGRESSION — the period that went missing on the blank-item route.
 *
 * Found by adversarial review and confirmed by three independent verifiers. Choosing "Once Per
 * Period" and leaving the Item select blank sent {limitType:'once_per_period'} to the Container
 * editor with no period. Save & Finish wrote `periodMs: undefined`, JSON.stringify dropped the
 * key, and evaluateClassicGate's nonNeg(undefined) made it 0 — so `now - lastUsed < 0` was never
 * true and the cooldown never blocked. An item the admin believed was on a 24h timer was
 * infinitely farmable, with the config screen still showing "Once Per Period" selected.
 *
 * The invariant: whatever route an admin takes, the SAME modal answers must store the SAME limit.
 */
describe('Give / Remove Item — the blank-item route stores the same limit as the inline route', () => {
  const answers = extra => ({ quantity: '1', operation: ['give'], usage_limit: ['once_per_period'], ...extra });

  it('carries periodMs in the pending so the Container editor can persist it', () => {
    const pending = parseGiveItemFields(answers(), 'true');
    assert.equal(pending.limitType, 'once_per_period');
    assert.ok(pending.periodMs > 0, 'a period the cooldown can actually use');
    assert.equal(pending.periodMs, 86400000, 'same 1d default the inline route applies');
  });

  it('produces an identical stored limit whether the item was picked in the modal or the picker', () => {
    const inline = buildGiveItemOutcome(
      parseGiveItemFields(answers({ item_select: ['idol'] }), 'true'), 0
    ).config.limit;

    // The picker route rebuilds the limit from the carried type + period
    const pending = parseGiveItemFields(answers(), 'true');
    const viaPicker = { type: pending.limitType, periodMs: pending.periodMs, claimedBy: {} };

    assert.deepEqual(viaPicker, inline, 'the two routes must be indistinguishable on disk');
    assert.ok(inline.periodMs > 0, 'and neither may store an unset period');
  });

  it('carries no periodMs for the limit types that have no period', () => {
    for (const limit of ['unlimited', 'once_per_player', 'once_globally']) {
      const pending = parseGiveItemFields(answers({ usage_limit: [limit] }), 'true');
      assert.equal('periodMs' in pending, false, `${limit} carries no stray period`);
    }
  });

  it('never lets a once_per_period limit reach storage with a falsy period', () => {
    for (const route of ['inline', 'picker']) {
      const p = parseGiveItemFields(answers(route === 'inline' ? { item_select: ['x'] } : {}), 'true');
      const limit = route === 'inline'
        ? buildGiveItemOutcome(p, 0).config.limit
        : { type: p.limitType, periodMs: p.periodMs, claimedBy: {} };
      assert.ok(limit.periodMs, `${route}: periodMs is truthy, not undefined/0`);
    }
  });
});

describe('Item picker — an empty guild cannot produce a zero-option select', () => {
  it('shows a helpful dead-end instead of a select Discord would reject', () => {
    const ui = buildItemPickerUI('b', {});
    const rows = ui.components[0].components;
    assert.equal(rows.some(c => c.type === 1 && c.components[0]?.type === 3), false, 'no empty String Select');
    assert.match(rows[0].content, /no items/i);
    assert.equal(rows.at(-1).components[0].custom_id, 'custom_action_editor_b', 'offers a way back');
  });
});
