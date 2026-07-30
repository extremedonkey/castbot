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
  buildAnswerMessages, verifySignature, generateSecret, looksSensitive, diagnoseSignature,
  buildSheetsScreen, generateAppsScript,
  MAPPED, ALWAYS_SKIPPED
} from '../src/sheets/sheetsSync.js';
import { NO_CATEGORY } from '../src/sheets/sheetsIngest.js';
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

describe('Sheets — raw body requirement (regression: "Malformed request body")', () => {
  // The global body-parser in app.js runs express.json() on every path except an explicit skip
  // list. /api/sheets-sync was missing from it, so req.body arrived as a parsed OBJECT; the route's
  // `body.toString('utf8')` then produced "[object Object]" and every sync died at JSON.parse.
  // Signature verification needs the raw bytes anyway — re-serializing can reorder keys.
  const secret = generateSecret();
  const payload = { guildId: '1', configId: 'c', rows: [] };

  it('a signature over raw bytes verifies', () => {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    assert.equal(verifySignature(raw, sig, secret), true);
  });

  it('a pre-parsed body stringifies to garbage — proving it must never reach JSON.parse', () => {
    // This is precisely what the endpoint received before the fix.
    assert.equal(Object.prototype.toString.call(payload), '[object Object]');
    assert.equal(String(payload), '[object Object]');
    assert.throws(() => JSON.parse(String(payload)), SyntaxError);
  });

  it('re-serializing with reordered keys breaks the signature (why raw bytes matter)', () => {
    const raw = Buffer.from(JSON.stringify({ a: 1, b: 2 }), 'utf8');
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const reserialized = Buffer.from(JSON.stringify({ b: 2, a: 1 }), 'utf8');
    assert.equal(verifySignature(reserialized, sig, secret), false);
  });
});

describe('Sheets — signature diagnosis (regression: Apps Script charset)', () => {
  // Apps Script's computeHmacSha256Signature(String, String) does not encode non-ASCII as UTF-8, so
  // every real application (emoji, curly apostrophes from Forms autocorrect) signed bytes the server
  // could never reproduce. The generated script now hashes newBlob().getBytes(). diagnoseSignature
  // exists to tell that failure apart from a genuinely stale key in the logs.
  const secret = generateSecret();
  const body = Buffer.from(JSON.stringify({ rows: [{ cells: { Name: 'Chloe', Job: 'Nurse🎀 — “hi”' } }] }), 'utf8');
  const hmac = (buf) => crypto.createHmac('sha256', secret).update(buf).digest('hex');

  it('identifies a charset bug when the client hashed non-UTF-8 bytes', () => {
    const wrong = hmac(Buffer.from(body.toString('utf8'), 'latin1'));
    const d = diagnoseSignature(body, wrong, secret);
    assert.equal(d.matchesLatin1, true);
    assert.match(d.verdict, /CLIENT CHARSET BUG/);
  });

  it('identifies a stale key when the signature matches neither encoding', () => {
    const d = diagnoseSignature(body, hmac.call(null, body).replace(/^./, 'f'), secret);
    assert.equal(d.matchesLatin1, false);
    assert.match(d.verdict, /KEY MISMATCH/);
  });

  it('flags that the payload contained non-ASCII, and that bytes exceed chars', () => {
    const d = diagnoseSignature(body, 'x', secret);
    assert.equal(d.nonAscii, true);
    assert.ok(d.bytes > d.chars, 'multi-byte characters must make the byte length exceed the char length');
  });

  it('never leaks the secret or a full signature into the log', () => {
    const d = diagnoseSignature(body, hmac(body), secret);
    const dump = JSON.stringify(d);
    assert.ok(!dump.includes(secret), 'secret must not appear');
    assert.equal(d.received.length, 12);
    assert.equal(d.expectedUtf8.length, 12);
  });

  it('a correctly UTF-8-signed body still verifies', () => {
    assert.equal(verifySignature(body, hmac(body), secret), true);
  });
});

describe('Sheets — missing application category (regression: silent "Failed: 1")', () => {
  // A season with no Apply button has categoryId null, so there's nowhere to create applicant
  // channels. The first version refused with a bare ok:false, logged nothing, and the Apps Script
  // rendered it as "Failed: 1" — the reason existed nowhere. The warning must be reachable from
  // the screen itself, before a script is ever generated.
  const navRow = { type: 1, components: [] };
  const bottomRow = { type: 1, components: [] };
  const render = (hasCategory) => JSON.stringify(
    buildSheetsScreen({ configId: 'c1', seasonName: 'Melbourne Survivor', sync: null, hasCategory }, navRow, bottomRow)
  );

  it('warns on the screen when the season has no category', () => {
    assert.match(render(false), /Set up the Apply button first/);
  });

  it('shows no warning once a category exists', () => {
    assert.ok(!render(true).includes('Set up the Apply button first'));
  });

  it('defaults to no warning when the flag is omitted (never scare a configured season)', () => {
    const out = JSON.stringify(buildSheetsScreen({ configId: 'c1', seasonName: 'S', sync: null }, navRow, bottomRow));
    assert.ok(!out.includes('Set up the Apply button first'));
  });

  it('the how-to lists the Apply button as step 1, ticked or flagged', () => {
    assert.match(render(false), /1\. \*\*Set up the Apply button\*\*.*Not done/);
    assert.match(render(true), /1\. \*\*Set up the Apply button\*\*.*✅/);
  });

  it('the generated script warns in its own header when the season is not ready', () => {
    const args = { baseUrl: 'https://x/api/sheets-sync', guildId: 'g', configId: 'c', secret: 's', seasonName: 'S' };
    assert.match(generateAppsScript({ ...args, hasCategory: false }), /BEFORE YOU START\s+<-- NOT DONE YET/);
    assert.match(generateAppsScript({ ...args, hasCategory: true }), /BEFORE YOU START\n/);
    assert.ok(!generateAppsScript({ ...args, hasCategory: true }).includes('NOT DONE YET'));
  });

  it('the script header explains the prerequisite even when it is already satisfied', () => {
    // A host who tears the season down later still needs to know the ordering.
    const s = generateAppsScript({ baseUrl: 'u', guildId: 'g', configId: 'c', secret: 's', seasonName: 'S', hasCategory: true });
    assert.match(s, /Season Manager -> Apps/);
  });

  it('the refusal text tells the host exactly where to go', () => {
    assert.match(NO_CATEGORY, /Season Manager/);
    assert.match(NO_CATEGORY, /Apps/);
    // Rendered inside a Google Sheets ui.alert, which is plain text — markdown would show as noise.
    assert.ok(!NO_CATEGORY.includes('**'), 'must not contain markdown');
    assert.ok(!NO_CATEGORY.includes('`'), 'must not contain backticks');
  });
});

describe('Sheets — sync semantics documented on-screen', () => {
  // The two surprising behaviours (an edit after import never reaching Discord, a rename creating a
  // duplicate) both fall out of rowKeyFor keying on Name+Timestamp. If that key ever changes, these
  // assertions should fail and force the screen copy to be rewritten with it.
  const screen = JSON.stringify(buildSheetsScreen(
    { configId: 'c1', seasonName: 'S', sync: { secret: 'x', rowKeys: {} }, hasCategory: true },
    { type: 1, components: [] }, { type: 1, components: [] }
  ));

  it('states the matching key', () => assert.match(screen, /Name \+ Timestamp/));
  it('warns that post-import edits do not propagate', () => assert.match(screen, /does \*\*not\*\* reach Discord/));
  it('warns that renaming creates a duplicate', () => assert.match(screen, /second channel/));
  it('states that deleting a row removes nothing', () => assert.match(screen, /nothing is removed from Discord/));
  it('sits above the Privacy section', () => {
    assert.ok(screen.indexOf('How records sync') < screen.indexOf('🔒 Privacy'));
  });

  it('the described behaviour matches rowKeyFor: same row re-reads to the same key', () => {
    const row = { Timestamp: '26/01/2026 14:08:09', Name: 'Hoppo', Why: 'original answer' };
    const edited = { ...row, Why: 'edited answer' };
    assert.equal(rowKeyFor(row, 'Name'), rowKeyFor(edited, 'Name'), 'editing an answer must NOT change the key (→ skipped)');
  });

  it('the described behaviour matches rowKeyFor: a rename yields a new key', () => {
    const row = { Timestamp: '26/01/2026 14:08:09', Name: 'Hoppo' };
    assert.notEqual(rowKeyFor(row, 'Name'), rowKeyFor({ ...row, Name: 'Brendan' }, 'Name'), 'a rename must produce a new key (→ duplicate)');
  });

  it('screen stays within the component budget', () => {
    const c = buildSheetsScreen(
      { configId: 'c1', seasonName: 'S', sync: { secret: 'x', rowKeys: {}, excludeHeaders: ['Email'] }, hasCategory: false },
      { type: 1, components: [] }, { type: 1, components: [] }
    );
    assert.ok(1 + c.components.length <= 40, `screen had ${1 + c.components.length} top-level components`);
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
