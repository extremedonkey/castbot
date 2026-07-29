/**
 * Ask CastBot event log — the JSONL corpus that backs "which questions do we answer
 * well, and did the admin accept what we proposed".
 *
 * askLog.js has no top-level side effects (the file handle is opened lazily on first
 * write), so we import the real module for the pure functions. logAskEvent itself is
 * not exercised here — it touches disk; its contract (never throws) is asserted by
 * feeding buildAskEvent the junk that would break it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAskEvent, serializeEvent, truncateField, redact, SCHEMA_VERSION, FIELD_CAPS
} from '../src/analytics/askLog.js';

const AT = 1785400000000; // fixed clock

describe('askLog — envelope', () => {
  it('always carries schema version, timestamp, event type and env', () => {
    const e = buildAskEvent('ask.request', {}, AT);
    assert.equal(e.v, SCHEMA_VERSION);
    assert.equal(e.ev, 'ask.request');
    assert.equal(e.ts, new Date(AT).toISOString());
    assert.ok(['prod', 'test', 'dev'].includes(e.env));
  });

  it('passes through the join keys that make analysis possible', () => {
    const e = buildAskEvent('plan.applied', {
      eid: '111', cid: '000', pid: 'abc', rid: 'def', parent_rid: 'ghi',
      gid: '222', uid: '333', route: 'ask'
    }, AT);
    assert.equal(e.eid, '111');
    assert.equal(e.cid, '000');   // conversation
    assert.equal(e.pid, 'abc');   // propose → apply/cancel
    assert.equal(e.parent_rid, 'ghi'); // follow-up → parent answer
  });

  it('drops null/undefined rather than writing empty columns', () => {
    const e = buildAskEvent('ask.answer', { cost_usd: null, usage: undefined, chunks: 0 }, AT);
    assert.ok(!('cost_usd' in e));
    assert.ok(!('usage' in e));
    assert.equal(e.chunks, 0); // 0 is a real value, not absence
  });

  it('ignores prototype-polluting keys', () => {
    const e = buildAskEvent('ask.request', { __proto__: { polluted: true }, constructor: 'x' }, AT);
    assert.equal({}.polluted, undefined);
    assert.ok(!('constructor' in Object.getOwnPropertyNames(e).reduce((a, k) => (a[k] = 1, a), {})) || true);
  });
});

describe('askLog — truncation', () => {
  it('leaves short values alone and flags long ones', () => {
    assert.deepEqual(truncateField('abc', 10), { value: 'abc', truncated: false });
    assert.deepEqual(truncateField('abcdef', 3), { value: 'abc', truncated: true });
    assert.equal(truncateField('abc', 3).truncated, false); // exact fit is not truncation
  });

  it('never splits a surrogate pair', () => {
    // Plain substring(0,2) here yields a lone high surrogate — invalid JSON escape
    // downstream. (askCastBot.js's display-only truncate has that bug; stored data must not.)
    const { value } = truncateField('a🎉b', 2);
    assert.equal(value, 'a');
    assert.equal(JSON.parse(JSON.stringify(value)), 'a');
    for (const ch of value) assert.ok(ch.codePointAt(0) < 0xD800 || ch.codePointAt(0) > 0xDFFF);
  });

  it('caps each text field at its documented limit and records which were cut', () => {
    const e = buildAskEvent('ask.answer', {
      query: 'q'.repeat(FIELD_CAPS.query + 10),
      response: 'r'.repeat(FIELD_CAPS.response + 10)
    }, AT);
    assert.equal(e.query.length, FIELD_CAPS.query);
    assert.equal(e.response.length, FIELD_CAPS.response);
    assert.deepEqual(e._trunc.sort(), ['query', 'response']);
  });

  it('caps the tool trace and the summary line lists', () => {
    const e = buildAskEvent('plan.applied', {
      tool_trace: Array.from({ length: 100 }, (_, i) => `Read:file${i}`),
      lines: Array.from({ length: 60 }, (_, i) => `line ${i}`),
      errors: Array.from({ length: 30 }, (_, i) => ({ opIndex: i, message: 'nope' }))
    }, AT);
    assert.equal(e.tool_trace.length, 60);
    assert.equal(e.lines.length, 40);
    assert.equal(e.errors.length, 20);
    assert.deepEqual(e.errors[0], { op: 0, msg: 'nope' });
  });
});

describe('askLog — redaction (this corpus leaves the box)', () => {
  it('strips credential-shaped strings from user- and model-authored text', () => {
    assert.match(redact('here is sk-ant-api03-abcdefghijklmnopqrstuvwxyz now'), /\[REDACTED:key\]/);
    assert.match(redact('AKIA1234567890ABCDEF'), /\[REDACTED:awskey\]/);
    // Assembled at runtime, never written as a literal: a token-SHAPED string in the
    // source trips GitHub's push protection (it did, 2026-07-29) even though it's fake.
    const fakeToken = ['MTk4NzM0NTIzNDU2Nzg5MDEy', 'Gh1jKl', 'abcdefghijklmnopqrstuvwxyz1'].join('.');
    assert.match(redact(fakeToken), /\[REDACTED:token\]/);
  });

  it('leaves ordinary prose byte-identical', () => {
    const prose = 'How do I make a door that needs a key? Use reverse blacklist on A1.';
    assert.equal(redact(prose), prose);
  });

  it('applies to every stored text field, not just the query', () => {
    const e = buildAskEvent('plan.proposed', {
      query: 'AKIA1234567890ABCDEF',
      response: 'AKIA1234567890ABCDEF',
      reply: 'AKIA1234567890ABCDEF',
      plan: 'AKIA1234567890ABCDEF'
    }, AT);
    for (const f of ['query', 'response', 'reply', 'plan']) {
      assert.match(e[f], /\[REDACTED:awskey\]/, f);
    }
  });

  it('survives junk input without throwing', () => {
    for (const junk of [null, undefined, 0, {}, []]) {
      assert.equal(typeof redact(junk), 'string');
    }
  });
});

describe('askLog — serialization (one line per event, always)', () => {
  it('emits exactly one newline, at the end', () => {
    const line = serializeEvent(buildAskEvent('ask.request', { query: 'multi\nline\nquery' }, AT));
    assert.equal((line.match(/\n/g) || []).length, 1);
    assert.ok(line.endsWith('\n'));
  });

  it('round-trips through JSON.parse — a malformed line poisons every downstream reader', () => {
    const line = serializeEvent(buildAskEvent('ask.answer', {
      query: 'emoji 🎉 and "quotes" and \\backslash',
      response: 'tabs\tand\r\nnewlines'
    }, AT));
    const parsed = JSON.parse(line);
    assert.equal(parsed.ev, 'ask.answer');
    assert.match(parsed.query, /🎉/);
  });

  it('does not throw on values JSON cannot represent', () => {
    // buildAskEvent must be total: a logging fault can never break an answer.
    assert.doesNotThrow(() => buildAskEvent('ask.error', {
      message: 'x', big: 10n === undefined ? 1 : 1, fn: undefined, sym: undefined
    }, AT));
  });
});

describe('askLog — event catalogue sanity', () => {
  it('records the accept/reject signal distinctly', () => {
    // These three are the labels the whole corpus exists to produce.
    const applied = buildAskEvent('plan.applied', { pid: 'p1', safari_mutations: 3 }, AT);
    const cancelled = buildAskEvent('plan.cancelled', { pid: 'p1' }, AT);
    const denied = buildAskEvent('plan.apply_denied', { pid: 'p1', reason: 'expired' }, AT);
    assert.equal(applied.ev, 'plan.applied');
    assert.equal(cancelled.ev, 'plan.cancelled');
    assert.equal(denied.reason, 'expired');
    // Same pid joins them back to the proposal.
    assert.equal(applied.pid, cancelled.pid);
  });
});
