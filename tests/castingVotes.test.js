// Format guard for the ⭐ Avg Votes tally (buildCastingVotesDisplay in castRankingManager.js) + the button
// label. Pure formatting replicated inline (the real fn is async + fetches members) — the user requires the
// popup to be byte-identical to the old inline Votes block.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replica of buildCastingVotesDisplay's pure formatting (member names passed in instead of fetched).
function votesText(applicantDisplayName, voters /* [{name, score}] sorted desc */) {
  const header = `### \`\`\`🗳️ Votes for ${applicantDisplayName}\`\`\``;
  if (voters.length === 0) return `${header}\n-# No scores yet — click 1–5 on the Casting card to rate this applicant.`;
  const scores = voters.map(v => v.score);
  const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  let text = `${header}\n> **Average:** ${avg}/5.0 (${scores.length} vote${scores.length !== 1 ? 's' : ''})\n`;
  for (const v of voters) text += `• ${v.name}: ${'⭐'.repeat(v.score)} (${v.score}/5)\n`;
  return text;
}

// Replica of the avgVotesLabel button-label logic. Compact: no "Votes:" word (the ⭐ emoji is the button's
// emoji, rendered before the label → "⭐ 5/5"). Trailing ".0" stripped: 5.0 → 5. No votes → "No Votes".
function avgVotesLabel(rankings) {
  const vals = Object.values(rankings).filter(r => r !== undefined);
  if (vals.length === 0) return 'No Votes';
  let s = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  if (s.endsWith('.0')) s = s.slice(0, -2);
  return `${s}/5`;
}

describe('Casting Votes — tally text (identical to the old inline block)', () => {
  it('renders header, average line, and star rows', () => {
    const out = votesText('Long Shlong Silvers', [{ name: 'AJ', score: 3 }, { name: 'Reece', score: 2 }]);
    assert.equal(out,
      '### ```🗳️ Votes for Long Shlong Silvers```\n' +
      '> **Average:** 2.5/5.0 (2 votes)\n' +
      '• AJ: ⭐⭐⭐ (3/5)\n' +
      '• Reece: ⭐⭐ (2/5)\n');
  });
  it('singular vote count', () => {
    const out = votesText('X', [{ name: 'A', score: 5 }]);
    assert.ok(out.includes('(1 vote)') && !out.includes('(1 votes)'));
  });
  it('no votes → empty-state line, no average', () => {
    const out = votesText('X', []);
    assert.equal(out, '### ```🗳️ Votes for X```\n-# No scores yet — click 1–5 on the Casting card to rate this applicant.');
  });
});

describe('Casting Votes — ⭐ button label (compact, no "Votes:" word)', () => {
  it('shows a non-integer average to 1 dp with /5', () => {
    assert.equal(avgVotesLabel({ a: 3, b: 2 }), '2.5/5');
  });
  it('strips trailing .0 for whole averages (5.0 → 5, matches the screenshot)', () => {
    assert.equal(avgVotesLabel({ a: 5, b: 5 }), '5/5');
    assert.equal(avgVotesLabel({ a: 4, b: 4, c: 4 }), '4/5');
  });
  it('strips .0 even when rounding produces it (avg 4.96 → "5.0" → "5")', () => {
    // 25 votes: 24 fives + 1 four = 124/25 = 4.96 → toFixed(1) = "5.0" → "5"
    const r = {}; for (let i = 0; i < 24; i++) r['u' + i] = 5; r.z = 4;
    assert.equal(avgVotesLabel(r), '5/5');
  });
  it('no votes → "No Votes"', () => {
    assert.equal(avgVotesLabel({}), 'No Votes');
  });
});
