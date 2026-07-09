// Tests for buildDncSummary (dncManager.js) — the Casting-card DNC list format.
// New format (per Reece): one "* DNC #N: {name} ({userPart}): {issue}" bullet per entry, where userPart is
// the linked-user tag "<@id> - {handle}" when a Discord user was selected, else the typed handle, else omitted.
// Pure logic replicated inline (dncManager imports discord-interactions at load).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function buildDncSummary(entries) {
  if (entries.length === 0) return '**DNC List:** No DNC list provided';
  return entries.map((e, i) => {
    let userPart = '';
    if (e.userId && e.username) userPart = `<@${e.userId}> - ${e.username}`;
    else if (e.userId) userPart = `<@${e.userId}>`;
    else if (e.username) userPart = e.username;
    let line = `* DNC #${i + 1}: ${e.name}`;
    if (userPart) line += ` (${userPart})`;
    if (e.issues) line += `: ${e.issues}`;
    return line;
  }).join('\n');
}

describe('buildDncSummary — new bulleted format', () => {
  it('no entries → placeholder', () => {
    assert.equal(buildDncSummary([]), '**DNC List:** No DNC list provided');
  });

  it("no linked user (handle only) → name (handle): issue — no dash (Reece's ^1 else-branch)", () => {
    assert.equal(
      buildDncSummary([{ name: 'MyDNC', username: 'the_myDNC22', userId: null, issues: "He's a dick" }]),
      "* DNC #1: MyDNC (the_myDNC22): He's a dick"
    );
  });

  it('linked user via select → name (<@id> - handle): issue — tagged with the dash', () => {
    assert.equal(
      buildDncSummary([{ name: 'Reece1234', username: 'extremedonkey', userId: '111', issues: 'Hate his guts' }]),
      '* DNC #1: Reece1234 (<@111> - extremedonkey): Hate his guts'
    );
  });

  it('numbers sequentially across multiple entries', () => {
    const out = buildDncSummary([
      { name: 'MyDNC', username: 'the_myDNC22', userId: null, issues: "He's a dick" },
      { name: 'Reece1234', username: 'extremedonkey', userId: '111', issues: 'Hate his guts' }
    ]);
    assert.equal(out,
      "* DNC #1: MyDNC (the_myDNC22): He's a dick\n" +
      '* DNC #2: Reece1234 (<@111> - extremedonkey): Hate his guts');
  });

  it('linked user but no handle → just the mention, no dash', () => {
    assert.equal(
      buildDncSummary([{ name: 'X', username: '', userId: '222', issues: 'bad' }]),
      '* DNC #1: X (<@222>): bad'
    );
  });

  it('no handle and no user → name only (no parens)', () => {
    assert.equal(buildDncSummary([{ name: 'JustAName', username: '', userId: null, issues: 'reason' }]),
      '* DNC #1: JustAName: reason');
  });

  it('no issue → name (handle) with no trailing colon', () => {
    assert.equal(buildDncSummary([{ name: 'N', username: 'h', userId: null, issues: '' }]),
      '* DNC #1: N (h)');
  });
});
