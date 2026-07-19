/**
 * Tests for src/analytics/liveAnalyticsReport.js — extracted from the
 * prod_live_analytics handler in app.js (behavior must match the inline original).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAnalyticsLine,
  isWithinRecentDays,
  buildLiveAnalyticsOutput,
  chunkOutput
} from '../src/analytics/liveAnalyticsReport.js';

describe('Live Analytics Report — formatAnalyticsLine', () => {
  it('bolds slash commands whole', () => {
    const line = '[8:33AM] Thu 19 Jun 25 | Reece (reece) in Test Server (123) | SLASH_COMMAND | /menu';
    assert.match(formatAnalyticsLine(line), /\*\*\/menu\*\*/);
  });

  it('bolds only the button name for BUTTON_CLICK with id in parentheses', () => {
    const line = '[8:33AM] Thu 19 Jun 25 | Reece (reece) in Test Server (123) | BUTTON_CLICK | My Button (my_button_id)';
    const out = formatAnalyticsLine(line);
    assert.match(out, /\*\*My Button\*\* \(my_button_id\)/);
  });

  it('returns unparseable lines unchanged', () => {
    assert.equal(formatAnalyticsLine('garbage line'), 'garbage line');
  });

  it('wraps user in bold code ticks and server in underlined ticks', () => {
    const line = '[8:33AM] Thu 19 Jun 25 | Reece (reece) in Test Server (123) | SAFARI_MOVEMENT | Moved A1 to B2';
    const out = formatAnalyticsLine(line);
    assert.match(out, /\*\*`Reece \(reece\)`\*\*/);
    assert.match(out, /__`Test Server`__/);
    assert.match(out, /Moved A1 to B2/);
  });
});

describe('Live Analytics Report — isWithinRecentDays', () => {
  function stampFor(date) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yy = String(date.getFullYear()).slice(-2);
    return `[8:00AM] ${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${yy}`;
  }

  it('accepts a line stamped today', () => {
    const line = `${stampFor(new Date())} | Reece (reece) in S (1) | SLASH_COMMAND | /menu`;
    assert.equal(isWithinRecentDays(line, 1), true);
  });

  it('rejects a line stamped 10 days ago for a 1-day window', () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    const line = `${stampFor(old)} | Reece (reece) in S (1) | SLASH_COMMAND | /menu`;
    assert.equal(isWithinRecentDays(line, 1), false);
  });

  it('passes through unparseable lines and a falsy days window', () => {
    assert.equal(isWithinRecentDays('no timestamp here', 1), true);
    assert.equal(isWithinRecentDays('anything', 0), true);
  });
});

describe('Live Analytics Report — buildLiveAnalyticsOutput', () => {
  it('null content (missing log) yields the no-data message', () => {
    const out = buildLiveAnalyticsOutput(null, 1);
    assert.match(out, /No analytics data found yet/);
  });

  it('filters default-filtered buttons and counts displayed entries', () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const stamp = `[8:00AM] ${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${String(now.getFullYear()).slice(-2)}`;
    const content = [
      `${stamp} | Reece (reece) in S (1) | SLASH_COMMAND | /menu`,
      `${stamp} | Reece (reece) in S (1) | BUTTON_CLICK | Nav (castlist2_nav_disabled_x)`,
      'not-an-entry line'
    ].join('\n');
    const out = buildLiveAnalyticsOutput(content, 1);
    assert.match(out, /Displayed 1 interactions from last 1 day/);
    assert.doesNotMatch(out, /castlist2_nav_disabled/);
  });

  it('reports the empty-window message when nothing recent', () => {
    const content = '[8:00AM] Thu 19 Jun 25 | Reece (reece) in S (1) | SLASH_COMMAND | /menu';
    const out = buildLiveAnalyticsOutput(content, 1);
    assert.match(out, /No interactions found in the last 1 day\./);
  });
});

describe('Live Analytics Report — chunkOutput', () => {
  it('short text is a single chunk', () => {
    assert.deepEqual(chunkOutput('hello', 1900), ['hello']);
  });

  it('long text splits under the cap, preferring newline breaks, losslessly (modulo the consumed break)', () => {
    const line = 'x'.repeat(100);
    const text = Array.from({ length: 50 }, () => line).join('\n'); // ~5050 chars
    const chunks = chunkOutput(text, 1900);
    assert.ok(chunks.length >= 3);
    for (const c of chunks) assert.ok(c.length <= 1900);
    assert.equal(chunks.join('\n'), text, 'newline-split chunks reassemble exactly');
  });

  it('unbreakable text hard-splits at the cap', () => {
    const text = 'y'.repeat(4000);
    const chunks = chunkOutput(text, 1900);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every(c => c.length <= 1900));
  });
});
