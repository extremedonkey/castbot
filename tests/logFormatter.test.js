/**
 * Tests for logFormatter.js — the Enhanced log format (player-log style) for
 * Safari Logs and the environment analytics log. Imports the REAL module
 * (it is pure: zero imports, no side effects).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  discordRelativeTs,
  formatStaminaCodeTags,
  formatEnhancedSafariLog,
  formatEnhancedAnalyticsLine
} from '../logFormatter.js';

const NOW = 1752561000000; // fixed for deterministic <t:...:R> output
const TS = `<t:${Math.floor(NOW / 1000)}:R>`;
const snapshot = { before: 2, after: 1, max: 3, regenTime: '11h 59m', regenTimeBefore: '11h 53m' };

const fmt = (action, content, details = '', opts = {}) =>
  formatEnhancedSafariLog(action, 'gabi!', content, details, { nowMs: NOW, ...opts });

describe('logFormatter — helpers', () => {
  it('discordRelativeTs renders epoch seconds', () => {
    assert.equal(discordRelativeTs(NOW), TS);
  });

  it('formatStaminaCodeTags: null snapshot → null', () => {
    assert.equal(formatStaminaCodeTags(null), null);
  });

  it('formatStaminaCodeTags: Full/Ready! → cd MAX; normal passthrough', () => {
    assert.deepEqual(formatStaminaCodeTags({ after: 3, max: 3, regenTime: 'Full' }), { stamina: '3/3', cd: 'MAX' });
    assert.deepEqual(formatStaminaCodeTags({ after: 3, max: 3, regenTime: 'Ready!' }), { stamina: '3/3', cd: 'MAX' });
    assert.deepEqual(formatStaminaCodeTags(snapshot), { stamina: '1/3', cd: '11h 59m' });
  });
});

describe('logFormatter — Safari movement/init', () => {
  it('normal movement: player-log style with stamina paren + code tags', () => {
    const line = fmt('SAFARI_MOVEMENT', { fromLocation: 'F1', toLocation: 'E2', staminaSnapshot: snapshot });
    assert.equal(line, `${TS} 🗺️ **Movement** (E2) — **gabi!** moved from F1 to E2 (⚡2/3 ♻️11h 53m → 1/3 ♻️11h 59m) \`⚡1/3\` \`cd: 11h 59m\``);
  });

  it('admin/teleport move sources get label prefixes', () => {
    assert.ok(fmt('SAFARI_MOVEMENT', { fromLocation: 'F1', toLocation: 'E2', moveSource: 'admin' }).includes('**ADMIN Movement**'));
    assert.ok(fmt('SAFARI_MOVEMENT', { fromLocation: 'F1', toLocation: 'E2', moveSource: 'teleport' }).includes('**TELEPORT Movement**'));
  });

  it('via pane renders as code tag; no snapshot → no stamina tags', () => {
    const line = fmt('SAFARI_MOVEMENT', { fromLocation: 'F1', toLocation: 'E2', viaPane: 'G1' });
    assert.ok(line.includes('`via G1 pane`'));
    assert.ok(!line.includes('⚡'));
    assert.ok(!line.includes('cd:'));
  });

  it('init entries (fromLocation null + Initialized details) render as 🚀 Init, no "moved from null"', () => {
    const line = fmt('SAFARI_MOVEMENT',
      { fromLocation: null, toLocation: 'A4', staminaSnapshot: { before: 0, after: 3, max: 3, regenTime: 'Full' } },
      'Initialized at A4 with 100 Dollars (total: 100) (⚡0/3 → 3/3 ♻️MAX)');
    assert.ok(line.startsWith(`${TS} 🚀 **Init** (A4) — **gabi!** Initialized at A4 with 100 Dollars (total: 100)`));
    assert.ok(!line.includes('moved from'));
    assert.ok(!line.includes('(⚡0/3 → 3/3'));   // paren tag stripped...
    assert.ok(line.includes('`⚡3/3` `cd: MAX`')); // ...rebuilt as code tags
  });
});

describe('logFormatter — Safari other actions', () => {
  it('whisper keeps full multi-line message as blockquote', () => {
    const line = fmt('SAFARI_WHISPER', { location: 'C3', recipientName: 'Bob', message: 'line one\nline two' });
    assert.equal(line, `${TS} 🤫 **Whisper** (C3) — **gabi!** → **Bob**\n> line one\n> line two`);
  });

  it('item pickup', () => {
    const line = fmt('SAFARI_ITEM_PICKUP', { location: 'B2', itemEmoji: '🪓', itemName: 'Axe', quantity: 2 });
    assert.equal(line, `${TS} 🧰 **Item** (B2) — **gabi!** collected 🪓 **Axe** x2`);
  });

  it('item use with snapshot uses code tags; without falls back to before→after', () => {
    const withSnap = fmt('SAFARI_ITEM_USE', { location: 'B2', itemEmoji: '🍖', itemName: 'Ration', quantity: 1, staminaBoost: 1, staminaSnapshot: { after: 3, max: 3, regenTime: 'Full' } });
    assert.ok(withSnap.includes('used 🍖 **Ration** x1 → +1 stamina `⚡3/3` `cd: MAX`'));
    const noSnap = fmt('SAFARI_ITEM_USE', { location: 'B2', itemName: 'Ration', quantity: 1, staminaBoost: 1, staminaBefore: 2, staminaAfter: 3 });
    assert.ok(noSnap.includes('→ +1 stamina (2 → 3)'));
  });

  it('currency gained/lost with sign and abs', () => {
    assert.ok(fmt('SAFARI_CURRENCY', { location: 'F1', amount: 7, currencyName: 'Coins', source: 'Button: _010807' })
      .includes('**gabi!** gained 7 Coins from "Button: _010807"'));
    assert.ok(fmt('SAFARI_CURRENCY', { location: 'F1', amount: -5, currencyName: 'Coins' })
      .includes('**gabi!** lost 5 Coins'));
  });

  it('purchase', () => {
    const line = fmt('SAFARI_PURCHASE', { location: 'A3', itemEmoji: '🗡️', itemName: 'Sword', quantity: 1, price: 50, currencyName: 'Coins', storeName: 'General Store' });
    assert.equal(line, `${TS} 🛒 **Purchase** (A3) — **gabi!** bought 🗡️ **Sword** x1 for 50 Coins at **General Store**`);
  });

  it('safari button click with result quote', () => {
    const line = fmt('SAFARI_BUTTON', { location: 'A2', buttonLabel: 'Open Chest', result: 'Found a key' });
    assert.equal(line, `${TS} 🎯 **Action** (A2) — **gabi!** clicked "Open Chest"\n> Found a key`);
  });

  it('attack with round extraction; missing round → Unknown', () => {
    assert.ok(fmt('SAFARI_ATTACK', { location: 'D4', targetName: 'Bob', result: 'Queued for Round 3' })
      .includes('scheduled an attack on **Bob** (Round 3)'));
    assert.ok(fmt('SAFARI_ATTACK', { location: 'D4', targetName: 'Bob', result: 'queued' })
      .includes('(Round Unknown)'));
  });

  it('test message + default case', () => {
    assert.ok(fmt('SAFARI_TEST', { configuredBy: 'Reece' }).includes('🧪 **Test** — **gabi!** Safari Log test (configured by Reece)'));
    assert.ok(fmt('SAFARI_MYSTERY', {}, 'something odd').includes('📝 **SAFARI_MYSTERY** — **gabi!** something odd'));
  });
});

describe('logFormatter — custom actions', () => {
  const executedActions = [
    { type: 'display_text', config: { content: 'A very long text that should get truncated because it exceeds sixty characters total' } },
    { type: 'give_item', config: { itemId: 'paper_303083', quantity: 2 } },
    { type: 'give_currency', config: { amount: 7 } },
    { type: 'move_player', config: { coordinate: 'B3' } },
    { type: 'follow_up_button', config: {} },
    { type: 'some_unknown_type', config: {} }
  ];

  it('button header with emoji/label, bullets for each action, unknown skipped', () => {
    const line = fmt('SAFARI_CUSTOM_ACTION',
      { location: 'A2', actionType: 'safari_button', actionId: 'search_alley_902643', _buttonLabel: 'Search Alley', _buttonEmoji: '👀', executedActions, success: true });
    assert.ok(line.startsWith(`${TS} ⚡ **Action** (A2) — **gabi!** 👀 Search Alley`));
    const expectedPreview = 'A very long text that should get truncated because it exceeds sixty characters total'.slice(0, 57) + '...';
    assert.ok(line.includes(`> • Text: "${expectedPreview}"`));
    assert.ok(line.includes('> • Give Item: 📦 paper_303083 (x2)')); // no resolver → raw id
    assert.ok(line.includes('> • Currency: +7'));
    assert.ok(line.includes('> • Move: → B3'));
    assert.ok(line.includes('> • Follow-up button'));
    assert.ok(!line.includes('some_unknown_type'));
  });

  it('injected resolver produces real item names', () => {
    const resolveItem = (id) => id === 'paper_303083' ? { name: 'Paper', emoji: '📜' } : null;
    const line = fmt('SAFARI_CUSTOM_ACTION',
      { actionType: 'safari_button', actionId: 'x', executedActions: [{ type: 'give_item', config: { itemId: 'paper_303083' } }], success: true },
      '', { resolveItem });
    assert.ok(line.includes('> • Give Item: 📜 Paper (x1)'));
  });

  it('player_command header + error case + header-only', () => {
    const cmd = fmt('SAFARI_CUSTOM_ACTION', { actionType: 'player_command', actionId: '!dig', executedActions: [], success: true });
    assert.ok(cmd.includes('⌨️ **Action**') && cmd.includes('Command: "!dig"'));
    const err = fmt('SAFARI_CUSTOM_ACTION', { actionType: 'safari_button', actionId: 'x', success: false, errorMessage: 'boom' });
    assert.ok(err.includes('\n> ❌ boom'));
    const bare = fmt('SAFARI_CUSTOM_ACTION', { actionType: 'safari_button', actionId: 'raw_id_1' });
    assert.ok(bare.endsWith('Button: raw_id_1'));
  });
});

describe('logFormatter — every safari line starts with a Discord timestamp', () => {
  it('all actions match /^<t:\\d+:R> /', () => {
    const cases = [
      ['SAFARI_MOVEMENT', { fromLocation: 'A1', toLocation: 'A2' }],
      ['SAFARI_WHISPER', { recipientName: 'B', message: 'x' }],
      ['SAFARI_ITEM_PICKUP', { itemName: 'X', quantity: 1 }],
      ['SAFARI_CURRENCY', { amount: 1, currencyName: 'C' }],
      ['SAFARI_TEST', {}]
    ];
    for (const [action, content] of cases) {
      assert.match(fmt(action, content), /^<t:\d+:R> /);
    }
  });
});

describe('logFormatter — enhanced analytics line', () => {
  const base = '[8:33AM] Thu 19 Jun 25 | Reece (extremedonkey) in EpochORG (1331657596087566398)';

  it('parses the with-channel format: drops serverId + text timestamp, keeps user/server/channel', () => {
    const out = formatEnhancedAnalyticsLine(`${base} | #safari-a2 | BUTTON_CLICK | Open Chest (btn_1)`, NOW);
    assert.equal(out, `* ${TS} 🔘 **\`Reece (extremedonkey)\`** in __\`EpochORG\`__ **#safari-a2** — **Open Chest** (btn_1)`);
  });

  it('parses the no-channel format', () => {
    const out = formatEnhancedAnalyticsLine(`${base} | SLASH_COMMAND | /menu`, NOW);
    assert.equal(out, `* ${TS} ⌨️ **\`Reece (extremedonkey)\`** in __\`EpochORG\`__ — **/menu**`);
  });

  it('safari actions get safari emojis; unknown actions get 📊', () => {
    assert.ok(formatEnhancedAnalyticsLine(`${base} | SAFARI_MOVEMENT | moved`, NOW).includes('🗺️'));
    assert.ok(formatEnhancedAnalyticsLine(`${base} | WEIRD_ACTION | x`, NOW).includes('📊'));
  });

  it('unparseable input falls back to classic passthrough', () => {
    assert.equal(formatEnhancedAnalyticsLine('total garbage', NOW), '* total garbage');
  });

  it('EMOJI-prefixed channel names parse (prod regression 2026-07-16)', () => {
    // Safari channels are emoji-named (#🍺f4-fraunces-tavern) — the old channel regex
    // ([\w-]) never matched them, so every such line fell through to the raw fallback
    // and "Enhanced" appeared to do nothing on prod.
    const line = `${base} | #🍺f4-fraunces-tavern | SAFARI_CUSTOM_ACTION | Safari button: buy_soulless_a_drink_1783636810969`;
    const out = formatEnhancedAnalyticsLine(line, NOW);
    assert.ok(out.startsWith(`* ${TS} ⚡`), `not enhanced: ${out}`);
    assert.ok(out.includes('**#🍺f4-fraunces-tavern**'));
    assert.ok(!out.includes('1331657596087566398'), 'serverId should be dropped');
  });
});
