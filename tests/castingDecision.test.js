// Tests for the Casting Decision TOGGLE BUTTONS (RaP 0902) — replaced the string select in
// castRankingManager.js / app.js. Pure logic replicated inline (Discord/I-O-free).
// Covers: the char↔status map, the toggle rule (click active → undecided; else set), the grey/blue
// style selection, and the custom_id format + 100-char safety.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replicas of the shipped pure logic ──

// app.js handler: single-char status → canonical castingStatus value.
const CHAR_TO_STATUS = { c: 'cast', n: 'reject', a: 'alternative' };

// app.js handler: toggle rule — clicking the ACTIVE status clears it (→ undecided); else set the clicked status.
function toggleValue(current, clicked) {
  return current === clicked ? 'undecided' : clicked;
}

// castRankingManager render: active style is per-decision (Cast=Success/green, Don't Cast=Danger/red,
// Alternate=Primary/blue); inactive = Secondary (grey).
const STYLE = { Primary: 1, Secondary: 2, Success: 3, Danger: 4 }; // discord.js ButtonStyle
const ACTIVE_STYLE = { cast: STYLE.Success, reject: STYLE.Danger, alternative: STYLE.Primary };
function buttonStyle(castingStatus, value) {
  return castingStatus === value ? ACTIVE_STYLE[value] : STYLE.Secondary;
}

// castRankingManager render: the button custom_id.
function decisionCustomId(char, channelId, appIndex, configId) {
  return `castdec_${char}_${channelId}_${appIndex}_${configId}`;
}
// app.js handler: the parse regex.
const RE = /^castdec_([cna])_(\d+)_(\d+)_(.+)$/;

describe('Casting Decision — char ↔ status map', () => {
  it('maps c/n/a to cast/reject/alternative and nothing else', () => {
    assert.equal(CHAR_TO_STATUS.c, 'cast');
    assert.equal(CHAR_TO_STATUS.n, 'reject');
    assert.equal(CHAR_TO_STATUS.a, 'alternative');
    assert.equal(Object.keys(CHAR_TO_STATUS).length, 3); // tentative is gone
    assert.equal(CHAR_TO_STATUS.t, undefined);
  });
});

describe('Casting Decision — toggle rule', () => {
  it('clicking a NEW status sets it', () => {
    assert.equal(toggleValue(undefined, 'cast'), 'cast');
    assert.equal(toggleValue('reject', 'cast'), 'cast');
    assert.equal(toggleValue('alternative', 'reject'), 'reject');
  });
  it('clicking the ACTIVE status clears it (→ undecided)', () => {
    assert.equal(toggleValue('cast', 'cast'), 'undecided');
    assert.equal(toggleValue('reject', 'reject'), 'undecided');
    assert.equal(toggleValue('alternative', 'alternative'), 'undecided');
  });
});

describe('Casting Decision — per-decision active colours', () => {
  it('the active button is coloured by decision; the rest Secondary (grey)', () => {
    assert.equal(buttonStyle('cast', 'cast'), STYLE.Success);          // Cast → green
    assert.equal(buttonStyle('reject', 'reject'), STYLE.Danger);       // Don't Cast → red
    assert.equal(buttonStyle('alternative', 'alternative'), STYLE.Primary); // Alternate → blue
    assert.equal(buttonStyle('cast', 'reject'), STYLE.Secondary);
    assert.equal(buttonStyle('cast', 'alternative'), STYLE.Secondary);
  });
  it('no status set → all three grey (default state of a new app)', () => {
    for (const v of ['cast', 'reject', 'alternative']) {
      assert.equal(buttonStyle(undefined, v), STYLE.Secondary);
    }
  });
});

describe('Casting Decision — custom_id format + parse + length', () => {
  it('round-trips char / channelId / appIndex / underscore-laden configId', () => {
    const id = decisionCustomId('a', '454453967309504512', '25', 'config_1781015852414_454453967309504512');
    const m = id.match(RE);
    assert.ok(m, 'matches the handler regex');
    assert.equal(CHAR_TO_STATUS[m[1]], 'alternative');
    assert.equal(m[2], '454453967309504512');
    assert.equal(parseInt(m[3]), 25);
    assert.equal(m[4], 'config_1781015852414_454453967309504512');
  });
  it('worst-case custom_id stays well under Discord\'s 100-char limit', () => {
    const id = decisionCustomId('a', '454453967309504512', '999', 'config_1781015852414_454453967309504512');
    assert.ok(id.length < 100, `len ${id.length}`);
  });
});
