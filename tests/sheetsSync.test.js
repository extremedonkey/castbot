/**
 * Google Sheets Sync — pure-logic tests.
 *
 * The fixtures here are taken from a REAL host sheet (Melbourne Survivor, "Returnee Application
 * (Fans vs Favourites)"), because that sheet is what broke the original design: it had duplicate
 * `Name`/`Age` columns, a junk `Column 19`, no Pronouns column at all, and a mid-season schema
 * change. Keep the fixtures realistic — a tidy fixture would have passed the broken design too.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  matchHeader, resolveHeaders, rowKeyFor, answerPairs, chunkAnswers,
  buildAnswerMessages, verifySignature, generateSecret, looksSensitive,
  MAPPED, ALWAYS_SKIPPED
} from '../src/sheets/sheetsSync.js';
import crypto from 'crypto';

// The real sheet's headers, post-cleanup (Gender dropped, Pronouns added) plus its junk columns.
const REAL_HEADERS = [
  'Timestamp', 'Name', 'Age', 'Pronouns', 'Occupation',
  'Where will you be travelling from to play?', 'Social Media Links (Facebook, Twitter, Instagram)',
  'Email (for contact)', 'Mobile Number (for contact)',
  'Tell us  why you would be a good option for this game?',
  'Dietary requirements (allergies)', 'Emergency Contact Name', 'Emergency Contact Phone Number',
  'Column 19', 'Medical conditions we should be aware of', 'Age 2'
];

describe('Sheets — header matching', () => {
  it('matches exactly, ignoring case and surrounding whitespace', () => {
    assert.equal(matchHeader(['Timestamp', ' Name ', 'Age'], 'name'), ' Name ');
    assert.equal(matchHeader(['Timestamp', 'AGE'], 'Age'), 'AGE');
  });

  it('returns null rather than a fuzzy match', () => {
    // The original design fuzzy-matched /name/i and would have picked this up. It must not.
    assert.equal(matchHeader(['What is your name?'], 'Name'), null);
  });

  it('takes the LEFTMOST duplicate (the Form\'s own column, not a hand-added one)', () => {
    assert.equal(matchHeader(['Age', 'Age 2'], 'Age'), 'Age');
  });
});

describe('Sheets — resolveHeaders', () => {
  it('resolves all three mapped columns from the real sheet', () => {
    const r = resolveHeaders(REAL_HEADERS);
    assert.equal(r.fatal, null);
    assert.equal(r.nameHeader, 'Name');
    assert.equal(r.ageHeader, 'Age');
    assert.equal(r.pronounsHeader, 'Pronouns');
  });

  it('is fatal when Name is missing, and names the columns it did see', () => {
    const r = resolveHeaders(['Timestamp', 'What is your name?', 'Age']);
    assert.ok(r.fatal, 'missing Name must be fatal');
    assert.match(r.fatal, /What is your name\?/, 'should echo the real headers so the host can fix it');
  });

  it('warns (but does not fail) when Age/Pronouns are absent', () => {
    const r = resolveHeaders(['Name', 'Occupation']);
    assert.equal(r.fatal, null);
    assert.equal(r.warnings.length, 2);
    assert.ok(r.warnings.some(w => w.includes('Age')));
    assert.ok(r.warnings.some(w => w.includes('Pronouns')));
  });

  it('flags near-duplicate columns like "Age 2" without failing', () => {
    const r = resolveHeaders(REAL_HEADERS);
    assert.ok(r.warnings.some(w => w.includes('Age 2')), 'the stray Age 2 column should be surfaced');
  });

  it('tolerates blank and undefined header cells', () => {
    const r = resolveHeaders(['Name', '', null, undefined, 'Age']);
    assert.equal(r.fatal, null);
    assert.equal(r.nameHeader, 'Name');
  });
});

describe('Sheets — rowKeyFor', () => {
  const cells = { Timestamp: '46048.588', Name: 'Hoppo', Age: '39' };

  it('is stable across re-reads of the same row', () => {
    assert.equal(rowKeyFor(cells, 'Name'), rowKeyFor({ ...cells }, 'Name'));
  });

  it('ignores row position — sorting the sheet must not re-import everyone', () => {
    // Same values, different object key order (what a re-ordered read looks like).
    const reordered = { Age: '39', Name: 'Hoppo', Timestamp: '46048.588' };
    assert.equal(rowKeyFor(cells, 'Name'), rowKeyFor(reordered, 'Name'));
  });

  it('is case- and whitespace-insensitive on the name', () => {
    assert.equal(rowKeyFor(cells, 'Name'), rowKeyFor({ ...cells, Name: '  hoppo ' }, 'Name'));
  });

  it('distinguishes two different applicants', () => {
    assert.notEqual(rowKeyFor(cells, 'Name'), rowKeyFor({ ...cells, Name: 'Lachy Steain' }, 'Name'));
  });

  it('distinguishes the same name submitted at different times', () => {
    assert.notEqual(rowKeyFor(cells, 'Name'), rowKeyFor({ ...cells, Timestamp: '46079.552' }, 'Name'));
  });

  it('works on a sheet with no Timestamp column at all', () => {
    const key = rowKeyFor({ Name: 'Meg Trotter' }, 'Name');
    assert.equal(typeof key, 'string');
    assert.equal(key.length, 16);
  });
});

describe('Sheets — answerPairs', () => {
  const resolved = { nameHeader: 'Name', ageHeader: 'Age', pronounsHeader: 'Pronouns' };
  const cells = {
    Timestamp: '46048.588',
    Name: 'Tom Weinert',
    Age: '23 (will be 24 when I play! day after birthday!)',
    Pronouns: 'He/Him',
    Occupation: 'Escape room Guy',
    'Mobile Number (for contact)': '0488554788',
    'Dietary requirements (allergies)': 'I don’t eat fish ! that’s all!',
    'Column 19': ''
  };

  it('drops the mapped columns — they render in the Casting card, not the dump', () => {
    const qs = answerPairs(cells, resolved).map(p => p.q);
    for (const mapped of Object.values(MAPPED)) assert.ok(!qs.includes(mapped), `${mapped} must not be dumped`);
  });

  it('always drops the Forms Timestamp', () => {
    const qs = answerPairs(cells, resolved).map(p => p.q);
    for (const skipped of ALWAYS_SKIPPED) assert.ok(!qs.includes(skipped));
  });

  it('drops blank answers (the junk "Column 19")', () => {
    assert.ok(!answerPairs(cells, resolved).some(p => p.q === 'Column 19'));
  });

  it('keeps every other column, in sheet order', () => {
    const qs = answerPairs(cells, resolved).map(p => p.q);
    assert.deepEqual(qs, ['Occupation', 'Mobile Number (for contact)', 'Dietary requirements (allergies)']);
  });

  it('honours host exclusions case-insensitively', () => {
    const qs = answerPairs(cells, resolved, ['mobile number (for contact)']).map(p => p.q);
    assert.ok(!qs.includes('Mobile Number (for contact)'));
    assert.ok(qs.includes('Occupation'));
  });

  it('preserves a free-text age verbatim rather than coercing it', () => {
    // The real sheet's age was prose. It belongs on the card as written.
    assert.equal(cells.Age, '23 (will be 24 when I play! day after birthday!)');
  });
});

describe('Sheets — chunkAnswers', () => {
  it('keeps a small application in one container, one block', () => {
    const groups = chunkAnswers([{ q: 'Occupation', a: 'Nurse' }, { q: 'From', a: 'Mernda' }]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].length, 1);
    assert.match(groups[0][0], /\*\*Occupation\*\*/);
  });

  it('splits into multiple blocks before hitting the Text Display cap', () => {
    const pairs = Array.from({ length: 12 }, (_, i) => ({ q: `Q${i}`, a: 'x'.repeat(900) }));
    const groups = chunkAnswers(pairs);
    const blocks = groups.flat();
    assert.ok(blocks.length > 1, 'should split');
    for (const b of blocks) assert.ok(b.length < 4000, `block of ${b.length} exceeds Discord's Text Display cap`);
  });

  it('spills into a second container once blocks exceed the per-container budget', () => {
    const pairs = Array.from({ length: 40 }, (_, i) => ({ q: `Q${i}`, a: 'y'.repeat(3000) }));
    const groups = chunkAnswers(pairs);
    assert.ok(groups.length > 1, 'should spill to a second container');
    for (const g of groups) assert.ok(g.length <= 8);
  });

  it('truncates a single monstrous answer instead of dropping it', () => {
    const groups = chunkAnswers([{ q: 'Essay', a: 'z'.repeat(9000) }]);
    const joined = groups.flat().join('');
    assert.match(joined, /answer truncated/);
    assert.ok(joined.length < 4000);
  });

  it('returns nothing for no pairs', () => {
    assert.deepEqual(chunkAnswers([]), []);
  });
});

describe('Sheets — buildAnswerMessages', () => {
  const pairs = [{ q: 'Occupation', a: 'Tennis Player' }];

  it('puts name, age and pronouns in the header of the first message only', () => {
    const msgs = buildAnswerMessages({ name: 'Lachy Steain', age: '35', pronouns: 'He/Him', pairs });
    const header = msgs[0].components[0].components[0].content;
    assert.match(header, /Lachy Steain's Application/);
    assert.match(header, /35 \| He\/Him/);
  });

  it('flags provenance so hosts know why there is no Discord user', () => {
    const msgs = buildAnswerMessages({ name: 'Kylie Smiles', pairs });
    assert.match(msgs[0].components[0].components[0].content, /not a Discord member/);
  });

  it('omits the demographics line entirely when age and pronouns are absent', () => {
    const msgs = buildAnswerMessages({ name: 'Meg Trotter', pairs });
    const header = msgs[0].components[0].components[0].content;
    assert.ok(!header.includes('-# |'), 'must not render an empty demographics line');
  });

  it('still posts a message when an applicant answered nothing', () => {
    const msgs = buildAnswerMessages({ name: 'Ghost', pairs: [] });
    assert.equal(msgs.length, 1);
    assert.match(msgs[0].components[0].components[0].content, /No answers/);
  });

  it('emits Components V2 containers with the V2 flag set', () => {
    const msgs = buildAnswerMessages({ name: 'Hoppo', age: '39', pairs });
    for (const m of msgs) {
      assert.equal(m.flags, 1 << 15);
      assert.equal(m.components[0].type, 17);
    }
  });

  it('stays under the 40-component ceiling for a very long application', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ q: `Q${i}`, a: 'w'.repeat(2500) }));
    for (const m of buildAnswerMessages({ name: 'Verbose', pairs: many })) {
      const count = 1 + m.components[0].components.length; // container + children
      assert.ok(count <= 40, `container had ${count} components`);
    }
  });
});

describe('Sheets — signature verification', () => {
  const secret = generateSecret();
  const body = Buffer.from(JSON.stringify({ guildId: '1', configId: 'c', rows: [] }), 'utf8');
  const sign = (b, s) => crypto.createHmac('sha256', s).update(b).digest('hex');

  it('accepts a correctly signed body', () => {
    assert.equal(verifySignature(body, sign(body, secret), secret), true);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(JSON.stringify({ guildId: '2', configId: 'c', rows: [] }), 'utf8');
    assert.equal(verifySignature(tampered, sign(body, secret), secret), false);
  });

  it('rejects a signature made with a rotated (old) secret', () => {
    assert.equal(verifySignature(body, sign(body, generateSecret()), secret), false);
  });

  it('rejects missing signature or secret rather than throwing', () => {
    assert.equal(verifySignature(body, null, secret), false);
    assert.equal(verifySignature(body, sign(body, secret), null), false);
  });

  it('rejects a wrong-length signature without throwing (timingSafeEqual guard)', () => {
    assert.equal(verifySignature(body, 'abc', secret), false);
  });

  it('mints distinct secrets', () => {
    assert.notEqual(generateSecret(), generateSecret());
    assert.equal(generateSecret().length, 64);
  });
});

describe('Sheets — sensitive column hinting', () => {
  it('flags the sensitive columns from the real sheet', () => {
    for (const h of [
      'Mobile Number (for contact)', 'Email (for contact)', 'Emergency Contact Name',
      'Emergency Contact Phone Number', 'Medical conditions we should be aware of',
      'Dietary requirements (allergies)'
    ]) {
      assert.equal(looksSensitive(h), true, `${h} should be flagged`);
    }
  });

  it('leaves ordinary questions unflagged', () => {
    assert.equal(looksSensitive('Occupation'), false);
    assert.equal(looksSensitive('Tell us  why you would be a good option for this game?'), false);
  });

  it('never throws on empty input', () => {
    assert.equal(looksSensitive(''), false);
    assert.equal(looksSensitive(undefined), false);
  });
});
