import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESET_SCOPES, RESET_SCOPE_ORDER,
  locateAction, collectClaimTargets, summarizeClaimTargets,
  collectStockedStoreItems, collectPlayerState,
  packLines,
  resetActionClaims, resetSalesCounters, resetRoundState,
  renderResetUI, buildResetResultUI
} from '../safariReset.js';

const G = '111111111111111111';
const U1 = '391415444084490240';
const U2 = '700105131517018182';

/** A guild with one of every claim shape, plus authored content that must survive a reset. */
function fixture() {
  return {
    [G]: {
      items: {
        idol_1: { id: 'idol_1', name: 'Hidden Immunity Idol', emoji: '🗿', metadata: { totalSold: 7 } },
        rock_1: { id: 'rock_1', name: 'Cool Rock', emoji: '🪨', metadata: { totalSold: 0 } }
      },
      enemies: { dig_1: { id: 'dig_1', name: 'Diglett', emoji: '🐹' } },
      attributeDefinitions: { luck: { name: 'Luck', emoji: '🍀' } },
      stores: {
        shop_1: {
          id: 'shop_1', name: 'The Hatchery', emoji: '🥚',
          items: [
            { itemId: 'idol_1', price: 30, stock: 2 },
            { itemId: 'rock_1', price: 5, stock: -1 },      // explicitly unlimited
            { itemId: 'idol_1', price: 99 }                  // no stock field = unlimited
          ],
          metadata: { totalSales: 12 }
        },
        shop_2: {
          id: 'shop_2', name: 'Trader', emoji: '🏪',
          items: [{ itemId: 'rock_1', price: 3, stock: 0 }], // sold out — still finite
          metadata: { totalSales: 0 }
        }
      },
      buttons: {
        pick_up_key: {
          id: 'pick_up_key', name: 'Pick up Key', coordinates: ['D1'],
          actions: [{ type: 'give_item', config: { itemId: 'idol_1', quantity: 1, limit: { type: 'once_globally', claimedBy: U1 } } }]
        },
        vent: {
          id: 'vent', name: 'Vent', coordinates: ['A2'],
          actions: [{ type: 'give_item', config: { itemId: 'rock_1', limit: { type: 'once_globally' } } }]
        },
        ifrit: {
          id: 'ifrit', name: 'IFRIT', coordinates: [], menuVisibility: 'crafting_menu',
          actions: [
            { type: 'display_text', config: {} },                                     // no limit at all
            { type: 'give_item', config: { itemId: 'idol_1', limit: { type: 'unlimited' } } },
            { type: 'give_currency', config: { amount: 50, limit: { type: 'once_per_player', claimedBy: [U1, U2] } } }
          ]
        },
        berries: {
          id: 'berries', name: 'Pick Berries', coordinates: ['F5'],
          actions: [
            { type: 'modify_attribute', config: { attributeId: 'luck', operation: 'add', amount: 1, limit: { type: 'once_per_period', periodMs: 3600000, claimedBy: { [U1]: 5 } } } },
            { type: 'fight_enemy', config: { enemyId: 'dig_1', limit: { type: 'custom', maxClaims: 3, claims: [{ u: U1, t: 1 }, { u: U2, t: 2 }] } } }
          ]
        }
      },
      maps: {
        active: 'map_1',
        map_1: {
          id: 'map_1',
          coordinates: {
            A1: { channelId: '1' },
            B1: { channelId: '2' },
            C1: { channelId: '3' }
          }
        }
      },
      safariConfig: { currentRound: 4, currencyName: 'Gil', currencyEmoji: '💎' },
      attackQueue: { round1: [{ a: 1 }, { a: 2 }], round2: [{ a: 3 }] },
      entityPoints: { [`player_${U1}`]: { stamina: { current: 2, max: 10 } } }
    }
  };
}

const TERMS = { currencyName: 'Gil', currencyEmoji: '💎' };

describe('safariReset — scope ladder', () => {
  it('scopes are ordered least → most destructive and form strict supersets', () => {
    assert.deepEqual(RESET_SCOPE_ORDER, ['testing', 'full', 'wipe']);
    assert.equal(RESET_SCOPES.testing.clearsPlayers, false);
    assert.equal(RESET_SCOPES.testing.deinitializes, false);
    assert.equal(RESET_SCOPES.full.clearsPlayers, true);
    assert.equal(RESET_SCOPES.full.deinitializes, false);
    assert.equal(RESET_SCOPES.wipe.clearsPlayers, true);
    assert.equal(RESET_SCOPES.wipe.deinitializes, true);
  });

  it('every scope has the copy the select menu needs', () => {
    for (const key of RESET_SCOPE_ORDER) {
      const s = RESET_SCOPES[key];
      assert.equal(s.value, key);
      assert.ok(s.label && s.emoji && s.description);
      // Discord String Select limits: label 100, description 100
      assert.ok(s.label.length <= 100, `${key} label too long`);
      assert.ok(s.blurb.length <= 100, `${key} blurb (select description) too long`);
    }
  });
});

describe('safariReset — locateAction', () => {
  it('prefers map coordinates, joined for multi-cell actions', () => {
    assert.equal(locateAction({ coordinates: ['D1'] }), 'D1');
    assert.equal(locateAction({ coordinates: ['F7', 'G7'] }), 'F7, G7');
  });

  it('falls back to the menu it is pinned to, then to a dash', () => {
    assert.equal(locateAction({ coordinates: [], menuVisibility: 'crafting_menu' }), 'Crafting menu');
    assert.equal(locateAction({ menuVisibility: 'player_menu' }), 'Player menu');
    assert.equal(locateAction({ coordinates: [], menuVisibility: 'none' }), '—');
    assert.equal(locateAction({}), '—');
    assert.equal(locateAction(undefined), '—');
  });
});

describe('safariReset — collectClaimTargets', () => {
  it('finds every limited outcome and skips unlimited / limitless ones', () => {
    const targets = collectClaimTargets(fixture(), G, TERMS);
    // 2 globals + once_per_player + once_per_period + custom = 5; display_text and unlimited excluded
    assert.equal(targets.length, 5);
    assert.ok(!targets.some(t => t.limitType === 'unlimited'));
  });

  it('counts claims per limit type', () => {
    const byButton = Object.fromEntries(collectClaimTargets(fixture(), G, TERMS).map(t => [`${t.buttonId}#${t.actionIndex}`, t]));
    assert.equal(byButton['pick_up_key#0'].claimCount, 1);  // once_globally, claimed
    assert.equal(byButton['vent#0'].claimCount, 0);         // once_globally, unclaimed
    assert.equal(byButton['ifrit#2'].claimCount, 2);        // once_per_player array
    assert.equal(byButton['berries#0'].claimCount, 1);      // once_per_period object
    assert.equal(byButton['berries#1'].claimCount, 2);      // custom claims array
  });

  it('exposes the once_globally claimant (and only for that type)', () => {
    const targets = collectClaimTargets(fixture(), G, TERMS);
    assert.equal(targets.find(t => t.buttonId === 'pick_up_key').claimant, U1);
    assert.equal(targets.find(t => t.buttonId === 'vent').claimant, null);
    assert.equal(targets.find(t => t.buttonId === 'ifrit').claimant, null);
  });

  it('describes the outcome and locates it for the preview', () => {
    const t = collectClaimTargets(fixture(), G, TERMS).find(x => x.buttonId === 'pick_up_key');
    assert.equal(t.location, 'D1');
    assert.match(t.outcome, /Hidden Immunity Idol/);
    const c = collectClaimTargets(fixture(), G, TERMS).find(x => x.buttonId === 'ifrit');
    assert.equal(c.location, 'Crafting menu');
    assert.match(c.outcome, /Gil/, 'currency outcomes use the per-server currency name');
  });

  it('tolerates a guild with no buttons', () => {
    assert.deepEqual(collectClaimTargets({}, G, TERMS), []);
    assert.deepEqual(collectClaimTargets({ [G]: {} }, G, TERMS), []);
  });
});

describe('safariReset — summarizeClaimTargets', () => {
  it('totals claims and limited outcomes', () => {
    const s = summarizeClaimTargets(collectClaimTargets(fixture(), G, TERMS));
    assert.equal(s.totalClaims, 6);        // 1 + 0 + 2 + 1 + 2
    assert.equal(s.outcomesWithClaims, 4); // vent has none
    assert.equal(s.limitedOutcomes, 5);
  });

  it('lists once_globally outcomes claimed-first so truncation never hides a claimed one', () => {
    const s = summarizeClaimTargets(collectClaimTargets(fixture(), G, TERMS));
    assert.equal(s.globals.length, 2);
    assert.equal(s.globalsClaimed, 1);
    assert.equal(s.globals[0].claimant, U1, 'claimed global must sort ahead of unclaimed');
    assert.equal(s.globals[1].claimant, null);
  });
});

describe('safariReset — store collectors', () => {
  it('reports only FINITE store stock — undefined/null/-1 all mean unlimited', () => {
    const rows = collectStockedStoreItems(fixture(), G);
    assert.equal(rows.length, 2, 'only the stock:2 and stock:0 rows are finite');
    assert.equal(rows[0].stock, 0, 'sorted lowest stock first — the urgent ones');
    assert.equal(rows[1].stock, 2);
    assert.equal(rows[1].storeName, 'The Hatchery');
    assert.equal(rows[1].itemName, 'Hidden Immunity Idol');
  });
});

describe('safariReset — collectPlayerState', () => {
  const playerData = {
    [G]: {
      players: {
        [U1]: { safari: { currency: 100, inventory: { a: 1, b: 2 }, mapProgress: { map_1: { currentLocation: 'A1' } } } },
        [U2]: { safari: { currency: 50, inventory: {}, isPaused: true, mapProgress: { map_1: { startingLocation: 'B2' } } } },
        '999': { safari: { currency: 1 } },          // not a snowflake — ignored
        admin: { safari: { currency: 9999 } },        // not a snowflake — ignored
        [`${U1.slice(0, 17)}9`]: { pronouns: 'x' }    // no safari — ignored
      }
    }
  };

  it('counts only real players carrying safari data', () => {
    const s = collectPlayerState(playerData, G, 'map_1');
    assert.equal(s.withSafari, 2);
    assert.equal(s.totalCurrency, 150);
    assert.equal(s.totalItems, 2);
    assert.equal(s.paused, 1);
  });

  it('"on map" requires a currentLocation, not merely mapProgress', () => {
    assert.equal(collectPlayerState(playerData, G, 'map_1').onMap, 1);
  });
});

describe('safariReset — packLines', () => {
  it('keeps everything when it fits', () => {
    const r = packLines(['aaa', 'bbb'], 1000);
    assert.equal(r.hidden, 0);
    assert.equal(r.text, 'aaa\nbbb');
  });

  it('truncates to the budget and appends an "…and N more" tail', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `> line number ${i}`);
    const r = packLines(lines, 200);
    assert.ok(r.hidden > 0);
    assert.ok(r.text.includes(`…and **${r.hidden}** more`));
    assert.ok(r.text.length <= 200, `packed text ${r.text.length} exceeded budget`);
  });

  it('a zero budget drops everything but still reports the count', () => {
    const r = packLines(['aaa', 'bbb'], 0);
    assert.equal(r.shown, 0);
    assert.equal(r.hidden, 2);
  });

  it('handles an empty list', () => {
    assert.deepEqual(packLines([], 100), { text: '', shown: 0, hidden: 0 });
  });
});

describe('safariReset — resetActionClaims', () => {
  it('clears every claim shape back to its empty form', () => {
    const data = fixture();
    const r = resetActionClaims(data, G);
    assert.equal(r.claims, 6);
    assert.equal(r.outcomes, 4);

    const b = data[G].buttons;
    assert.equal(b.pick_up_key.actions[0].config.limit.claimedBy, null);
    assert.deepEqual(b.ifrit.actions[2].config.limit.claimedBy, []);
    assert.deepEqual(b.berries.actions[0].config.limit.claimedBy, {});
    assert.deepEqual(b.berries.actions[1].config.limit.claims, []);
  });

  it('is idempotent — a second sweep finds nothing left', () => {
    const data = fixture();
    resetActionClaims(data, G);
    assert.deepEqual(resetActionClaims(data, G), { outcomes: 0, claims: 0 });
  });

  it('leaves the limit CONFIG intact — only the claim state is cleared', () => {
    const data = fixture();
    resetActionClaims(data, G);
    assert.equal(data[G].buttons.berries.actions[0].config.limit.type, 'once_per_period');
    assert.equal(data[G].buttons.berries.actions[0].config.limit.periodMs, 3600000);
    assert.equal(data[G].buttons.berries.actions[1].config.limit.maxClaims, 3);
  });
});

describe('safariReset — sales counters & round state', () => {
  it('zeroes only non-zero sales counters', () => {
    const data = fixture();
    assert.equal(resetSalesCounters(data, G), 2); // shop_1.totalSales + idol_1.totalSold
    assert.equal(data[G].stores.shop_1.metadata.totalSales, 0);
    assert.equal(data[G].items.idol_1.metadata.totalSold, 0);
  });

  it('resets rounds and clears the attack queue', () => {
    const data = fixture();
    resetRoundState(data, G);
    assert.equal(data[G].safariConfig.currentRound, 0);
    assert.deepEqual(data[G].attackQueue, {});
    assert.equal(data[G].safariConfig.currencyName, 'Gil', 'currency config is content, not state');
  });

  it('no-ops on an unknown guild', () => {
    assert.doesNotThrow(() => resetRoundState({}, 'nope'));
  });
});

describe('safariReset — THE INVARIANT: content is never deleted', () => {
  it('a full sweep leaves every authored entity present and unchanged', () => {
    const data = fixture();
    const before = {
      items: Object.keys(data[G].items).sort(),
      stores: Object.keys(data[G].stores).sort(),
      buttons: Object.keys(data[G].buttons).sort(),
      enemies: Object.keys(data[G].enemies).sort(),
      coords: Object.keys(data[G].maps.map_1.coordinates).sort(),
      actionCounts: Object.fromEntries(Object.entries(data[G].buttons).map(([k, b]) => [k, b.actions.length])),
      storeItemCounts: Object.fromEntries(Object.entries(data[G].stores).map(([k, s]) => [k, s.items.length]))
    };

    resetActionClaims(data, G);
    resetSalesCounters(data, G);
    resetRoundState(data, G);

    assert.deepEqual(Object.keys(data[G].items).sort(), before.items);
    assert.deepEqual(Object.keys(data[G].stores).sort(), before.stores);
    assert.deepEqual(Object.keys(data[G].buttons).sort(), before.buttons);
    assert.deepEqual(Object.keys(data[G].enemies).sort(), before.enemies);
    assert.deepEqual(Object.keys(data[G].maps.map_1.coordinates).sort(), before.coords);
    assert.deepEqual(Object.fromEntries(Object.entries(data[G].buttons).map(([k, b]) => [k, b.actions.length])), before.actionCounts);
    assert.deepEqual(Object.fromEntries(Object.entries(data[G].stores).map(([k, s]) => [k, s.items.length])), before.storeItemCounts);
    assert.equal(data[G].items.idol_1.name, 'Hidden Immunity Idol');
    assert.equal(data[G].maps.active, 'map_1');
  });

  it('store STOCK is never touched — it cannot be restored, so it is only reported', () => {
    const data = fixture();
    resetActionClaims(data, G);
    resetSalesCounters(data, G);
    resetRoundState(data, G);
    assert.equal(data[G].stores.shop_1.items[0].stock, 2, 'stock must survive a reset untouched');
    assert.equal(data[G].stores.shop_2.items[0].stock, 0);
    assert.equal(collectStockedStoreItems(data, G).length, 2, 'still reported for manual follow-up');
  });
});

describe('safariReset — buildResetResultUI', () => {
  const tally = {
    scope: 'testing', outcomesReset: 4, claimsCleared: 6,
    salesCountersReset: 0, playersReset: 0, playersRemoved: 0,
    playersFailed: 0, startingCurrency: 0
  };

  it('renders a valid Components V2 container', () => {
    const ui = buildResetResultUI(tally);
    assert.equal(ui.components.length, 1);
    assert.equal(ui.components[0].type, 17);
    assert.ok(ui.components[0].components.some(c => c.type === 10));
    assert.ok(ui.components[0].components.some(c => c.type === 1), 'has a back button row');
  });

  it('reports the tallies the host cares about', () => {
    const text = buildResetResultUI(tally).components[0].components
      .filter(c => c.type === 10).map(c => c.content).join('\n');
    assert.match(text, /\*\*6\*\* claims cleared/);
    assert.match(text, /\*\*4\*\* outcomes/);
    assert.match(text, /store stock/, 'non-wipe scopes remind the host about stock');
  });

  it('the wipe scope points the host at Start Safari instead', () => {
    const text = buildResetResultUI({ ...tally, scope: 'wipe', playersRemoved: 12 }).components[0].components
      .filter(c => c.type === 10).map(c => c.content).join('\n');
    assert.match(text, /\*\*12\*\* players de-initialised/);
    assert.match(text, /Start Safari/);
  });

  it('surfaces partial failures', () => {
    const text = buildResetResultUI({ ...tally, scope: 'full', playersFailed: 3 }).components[0].components
      .filter(c => c.type === 10).map(c => c.content).join('\n');
    assert.match(text, /\*\*3\*\* players could not be processed/);
  });
});

// ─── Screen rendering: the Discord budgets are the thing worth locking in ───

/** A preview bundle shaped exactly like buildResetPreview() returns. */
function preview({ globals = 0, stocked = 0, claimedGlobals = 0 } = {}) {
  return {
    customTerms: TERMS,
    hasMap: true,
    claims: {
      totalClaims: 412, outcomesWithClaims: 63, limitedOutcomes: 80,
      globals: Array.from({ length: globals }, (_, i) => ({
        location: `E${i % 9 + 1}`,
        outcome: `🗿 Give 1x Extremely Long Advantage Item Name Number ${i}`,
        claimant: i < claimedGlobals ? U1 : null
      })),
      globalsClaimed: claimedGlobals
    },
    stocked: Array.from({ length: stocked }, (_, i) => ({
      storeName: `A Store With A Fairly Long Name ${i}`, storeEmoji: '🥚',
      itemName: `An Item With A Fairly Long Name ${i}`, itemEmoji: '📦', stock: i
    })),
    players: { withSafari: 18, onMap: 16, totalItems: 94, totalCurrency: 12500, paused: 2 },
    rounds: { currentRound: 3, queuedAttacks: 9 }
  };
}

/** Discord counts every component recursively, including buttons inside rows. */
function countAll(components) {
  let n = 0;
  for (const c of components) {
    n += 1;
    if (Array.isArray(c.components)) n += countAll(c.components);
    if (c.accessory) n += 1;
  }
  return n;
}

const textChars = (ui) => {
  let total = 0;
  const walk = (cs) => cs.forEach(c => {
    if (c.type === 10) total += c.content.length;
    if (Array.isArray(c.components)) walk(c.components);
  });
  walk(ui.components);
  return total;
};

describe('safariReset — renderResetUI', () => {
  it('with no scope chosen: warning + select + back, no confirm button', () => {
    const ui = renderResetUI({ preview: preview(), scope: null });
    const container = ui.components[0];
    assert.equal(container.type, 17);
    const ids = JSON.stringify(container);
    assert.ok(ids.includes('safari_reset_scope'), 'scope select present');
    assert.ok(!ids.includes('safari_reset_go'), 'no confirm button before a scope is chosen');
    assert.match(JSON.stringify(container), /Nothing is deleted/);
  });

  it('offers all three scopes and marks the chosen one as default', () => {
    const ui = renderResetUI({ preview: preview(), scope: 'full' });
    const select = JSON.parse(JSON.stringify(ui.components[0].components))
      .flatMap(c => c.components || []).find(c => c?.type === 3);
    assert.equal(select.options.length, 3);
    assert.deepEqual(select.options.filter(o => o.default).map(o => o.value), ['full']);
  });

  it('the confirm button carries the scope in its custom_id and is Danger-styled', () => {
    for (const scope of RESET_SCOPE_ORDER) {
      const ui = renderResetUI({ preview: preview(), scope });
      const btn = ui.components[0].components
        .flatMap(c => c.components || []).find(c => c?.custom_id?.startsWith('safari_reset_go:'));
      assert.equal(btn.custom_id, `safari_reset_go:${scope}`);
      assert.equal(btn.style, 4, 'destructive confirm must be red');
      assert.ok(btn.custom_id.length < 100, 'custom_id under Discord limit');
      assert.ok(btn.label.length <= 80, 'button label under Discord limit');
    }
  });

  it('scope copy is honest about what survives', () => {
    const testing = JSON.stringify(renderResetUI({ preview: preview(), scope: 'testing' }));
    assert.match(testing, /Every player keeps their inventory/);
    assert.ok(!testing.includes('de-initialised'), 'testing scope must not claim to de-init');

    const wipe = JSON.stringify(renderResetUI({ preview: preview(), scope: 'wipe' }));
    assert.match(wipe, /de-initialised/);
    assert.match(wipe, /starting locations/i);
  });

  it('lists once_globally outcomes with location, item and claimant', () => {
    const ui = renderResetUI({ preview: preview({ globals: 3, claimedGlobals: 1 }), scope: 'testing' });
    const text = JSON.stringify(ui);
    assert.match(text, /Global Actions \(3\)/);
    assert.match(text, new RegExp(`<@${U1}>`), 'claimant is rendered as a mention');
    assert.match(text, /unclaimed/);
  });

  it('warns about store stock it cannot restore', () => {
    const ui = renderResetUI({ preview: preview({ stocked: 4 }), scope: 'full' });
    const text = JSON.stringify(ui);
    assert.match(text, /store stock \(4\)/);
    assert.match(text, /can’t restore/);
  });

  it('never mentions chests/events/secrets — that state does not exist', () => {
    for (const scope of RESET_SCOPE_ORDER) {
      const text = JSON.stringify(renderResetUI({ preview: preview(), scope }));
      assert.ok(!/opened chest|triggered event|discovered secret/i.test(text));
    }
  });

  it('spells out what a "limited outcome" is instead of using internal jargon', () => {
    const text = JSON.stringify(renderResetUI({ preview: preview(), scope: 'testing' }));
    assert.match(text, /Usage Limit/, 'uses the same words as the outcome editor');
  });

  it('omits the globals / stock sections entirely when there is nothing to say', () => {
    const text = JSON.stringify(renderResetUI({ preview: preview({ globals: 0, stocked: 0 }), scope: 'full' }));
    assert.ok(!text.includes('Global Actions'));
    assert.ok(!text.includes('store stock'));
  });

  it('stays inside Discord budgets for a pathological guild (200 globals, 200 stocked items)', () => {
    for (const scope of RESET_SCOPE_ORDER) {
      const ui = renderResetUI({ preview: preview({ globals: 200, stocked: 200, claimedGlobals: 50 }), scope });
      assert.ok(countAll(ui.components) <= 40, `${scope}: ${countAll(ui.components)} components exceeds 40`);
      assert.ok(textChars(ui) <= 4000, `${scope}: ${textChars(ui)} chars exceeds the 4000 combined limit`);
    }
  });

  it('truncation keeps the CLAIMED globals — those are the ones a host must see', () => {
    const p = preview({ globals: 200, stocked: 200, claimedGlobals: 3 });
    const text = JSON.stringify(renderResetUI({ preview: p, scope: 'testing' }));
    assert.match(text, /…and \*\*\d+\*\* more/, 'truncation tail is shown');
    assert.match(text, /Global Actions \(200\)/, 'the true total is still stated');
    // claimedGlobals sort first in summarizeClaimTargets, so index 0..2 must survive
    assert.ok(text.includes('Advantage Item Name Number 0'), 'first (claimed) global survived truncation');
  });
});
