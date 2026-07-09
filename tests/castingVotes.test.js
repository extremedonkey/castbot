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

// Replica of the avgVotesLabel button-label logic.
function avgVotesLabel(rankings) {
  const vals = Object.values(rankings).filter(r => r !== undefined);
  return vals.length > 0 ? `Avg Votes: ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)}/5` : 'No Votes';
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

describe('Casting Votes — ⭐ button label', () => {
  it('shows the average to 1 dp with /5', () => {
    assert.equal(avgVotesLabel({ a: 3, b: 2 }), 'Avg Votes: 2.5/5');
    assert.equal(avgVotesLabel({ a: 4, b: 4, c: 4 }), 'Avg Votes: 4.0/5');
  });
  it('no votes → "No Votes"', () => {
    assert.equal(avgVotesLabel({}), 'No Votes');
  });
});
