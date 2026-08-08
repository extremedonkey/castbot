/**
 * Tests for PM2ErrorLogger tail-read (readNewBytes) — the memory-footprint fix
 * that replaced whole-file readFileSync with positional fd reads (RaP 0903).
 *
 * The module has no top-level Discord/network imports, so we import the real
 * class and exercise readNewBytes against temp files.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PM2ErrorLogger, isCriticalLine, isBenignStderrLine, stripZeroCountTokens, buildErrorLogContainer, classifyStderr, isQuietStdoutLine, stripPm2Timestamp } from '../src/monitoring/pm2ErrorLogger.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm2logger-test-'));
const logger = new PM2ErrorLogger(null);

function tmpFile(name, content) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content);
  return p;
}

describe('PM2ErrorLogger — readNewBytes tail reads', () => {
  it('returns null for a missing file', () => {
    assert.equal(logger.readNewBytes(path.join(tmpDir, 'nope.log'), 0), null);
  });

  it('reads the whole file from position 0', () => {
    const p = tmpFile('a.log', 'line1\nline2\n');
    const r = logger.readNewBytes(p, 0);
    assert.equal(r.text, 'line1\nline2\n');
    assert.equal(r.newPosition, Buffer.byteLength('line1\nline2\n'));
  });

  it('returns only appended bytes on subsequent reads', () => {
    const p = tmpFile('b.log', 'old content\n');
    const first = logger.readNewBytes(p, 0);
    fs.appendFileSync(p, 'NEW ERROR line\n');
    const second = logger.readNewBytes(p, first.newPosition);
    assert.equal(second.text, 'NEW ERROR line\n');
    assert.equal(second.newPosition, fs.statSync(p).size);
  });

  it('returns empty text when nothing was appended', () => {
    const p = tmpFile('c.log', 'stable\n');
    const first = logger.readNewBytes(p, 0);
    const second = logger.readNewBytes(p, first.newPosition);
    assert.equal(second.text, '');
    assert.equal(second.newPosition, first.newPosition);
  });

  it('resets to start when the file shrank (log rotation)', () => {
    const p = tmpFile('d.log', 'after rotation\n');
    // Position from the pre-rotation file was far beyond the new size
    const r = logger.readNewBytes(p, 999999);
    assert.equal(r.text, 'after rotation\n');
    assert.equal(r.newPosition, fs.statSync(p).size);
  });

  it('caps a huge backlog read to the tail (never materializes the whole file)', () => {
    const CAP = 512 * 1024;
    const big = 'x'.repeat(CAP + 10000) + '\nfinal line\n';
    const p = tmpFile('e.log', big);
    const r = logger.readNewBytes(p, 0);
    assert.equal(r.text.length, CAP);
    assert.ok(r.text.endsWith('\nfinal line\n'));
    assert.equal(r.newPosition, Buffer.byteLength(big));
  });

  it('byte positions handle multi-byte emoji content correctly', () => {
    const p = tmpFile('f.log', '🚨 emoji error\n');
    const first = logger.readNewBytes(p, 0);
    assert.equal(first.text, '🚨 emoji error\n');
    fs.appendFileSync(p, '✅ second 🎯 line\n');
    const second = logger.readNewBytes(p, first.newPosition);
    assert.equal(second.text, '✅ second 🎯 line\n');
  });
});

describe('PM2ErrorLogger — readLogsLocal position migration', () => {
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-baselines legacy (string-length) positions to byte offsets and skips the tick', async () => {
    const errPath = tmpFile('mig-error.log', 'PRE-EXISTING ERROR backlog\n');
    const outPath = tmpFile('mig-out.log', 'old output ERROR noise\n');
    const config = { error: errPath, out: outPath };
    const positions = { out: 5, error: 3 }; // legacy positions, no _unit marker

    const logs = await logger.readLogsLocal(config, positions);
    assert.deepEqual(logs, { severe: [], warn: [] }); // migration tick emits nothing (no backlog spam)
    assert.equal(positions._unit, 'bytes');
    assert.equal(positions.error, fs.statSync(errPath).size);
    assert.equal(positions.out, fs.statSync(outPath).size);

    // Next tick picks up only fresh lines
    fs.appendFileSync(errPath, 'FRESH ERROR after migration\n');
    const logs2 = await logger.readLogsLocal(config, positions);
    assert.ok(logs2.severe.some(l => l.includes('FRESH ERROR after migration')));
    const all2 = [...logs2.severe, ...logs2.warn];
    assert.ok(!all2.some(l => l.includes('PRE-EXISTING')));
  });

  it('buckets stderr warn records and stdout keyword hits by severity', async () => {
    const errPath = tmpFile('sev-error.log', '');
    const outPath = tmpFile('sev-out.log', '');
    const config = { error: errPath, out: outPath };
    const positions = { out: 0, error: 0, _unit: 'bytes' };
    await logger.readLogsLocal(config, positions); // baseline at empty files

    fs.appendFileSync(errPath,
      "⚠️ [2026-08-03T16:21:12.889Z] [WHISPER] Read clicked by non-recipient {\n" +
      "  clickerId: '391415444084490240'\n" +
      "}\n" +
      'TypeError: boom is not a function\n' +
      '    at Object.handler (app.js:123:4)\n');
    fs.appendFileSync(outPath,
      'ℹ️ [2026-08-03T16:21:13.000Z] [SYNC] retry failed 3 times, backing off\n' +
      'Failed to fetch guild 12345\n');

    const logs = await logger.readLogsLocal(config, positions);
    assert.ok(logs.warn.some(l => l.includes('non-recipient')));
    assert.ok(logs.warn.some(l => l.includes('clickerId')));
    assert.ok(logs.warn.some(l => l.includes('retry failed 3 times')));
    assert.ok(logs.severe.some(l => l.includes('TypeError: boom')));
    assert.ok(logs.severe.some(l => l.includes('at Object.handler')));
    assert.ok(logs.severe.some(l => l.includes('Failed to fetch guild')));
    assert.ok(!logs.severe.some(l => l.includes('non-recipient')));
  });
});

describe('PM2ErrorLogger — classifyStderr (ping-worthy vs quiet warnings)', () => {
  it('a logger.warn record with its object dump stays quiet, including continuations', () => {
    const { severe, warn } = classifyStderr(
      "⚠️ [2026-08-03T14:18:51.276Z] [WHISPER] Read clicked by non-recipient {\n" +
      "  clickerId: '885136176883839026',\n" +
      "  whisperId: '1785766725216_6jewz4vpe'\n" +
      '}\n');
    assert.equal(severe.length, 0);
    assert.equal(warn.length, 4);
  });

  it('❌ logger.error records are severe', () => {
    const { severe, warn } = classifyStderr('❌ [2026-08-03T14:18:51.276Z] [SAFARI] Failed to resolve outcome\n');
    assert.equal(warn.length, 0);
    assert.equal(severe.length, 1);
  });

  it('unknown formats (raw stack traces) default to severe — fail-loud direction', () => {
    const { severe, warn } = classifyStderr(
      'TypeError: x is not a function\n' +
      '    at handler (app.js:42:1)\n' +
      '    at process.processTicksAndRejections (node:internal:7)\n');
    assert.equal(warn.length, 0);
    assert.equal(severe.length, 3); // stack continuation lines follow their record
  });

  it('a raw error right after a warn record breaks out of the quiet bucket', () => {
    const { severe, warn } = classifyStderr(
      '⚠️ [2026-08-03T14:18:51.276Z] [WHISPER] deliberate warning\n' +
      'ReferenceError: oops is not defined\n');
    assert.equal(warn.length, 1);
    assert.equal(severe.length, 1);
  });

  it('PM2 timestamp prefixes are stripped before marker matching', () => {
    const { severe, warn } = classifyStderr('2026-07-08T03:53:52: ⚠️ [2026-07-08T03:53:52.100Z] [MENU] slow render\n');
    assert.equal(severe.length, 0);
    assert.equal(warn.length, 1);
    assert.equal(stripPm2Timestamp('2026-07-08T03:53:52: ⚠️ hi'), '⚠️ hi');
  });

  it('orphan continuation at a batch boundary stays quiet (opener posted last tick)', () => {
    const { severe, warn } = classifyStderr("  targetUserId: '823354355775438919'\n}\n");
    assert.equal(severe.length, 0);
    assert.equal(warn.length, 2);
  });

  it('benign stderr lines (DEPRECATED / ExperimentalWarning) are dropped entirely', () => {
    const { severe, warn } = classifyStderr(
      '2026-07-08T03:53:52: ⚠️ DEPRECATED season_management_menu hit — redirecting\n' +
      'ExperimentalWarning: buffer.File\n');
    assert.equal(severe.length, 0);
    assert.equal(warn.length, 0);
  });

  it('ℹ️ info records are quiet even when they contain scary words', () => {
    const { severe } = classifyStderr('ℹ️ [2026-08-03T14:18:51.276Z] [SYNC] 3 failed rows skipped\n');
    assert.equal(severe.length, 0);
  });
});

describe('PM2ErrorLogger — isQuietStdoutLine', () => {
  it('deliberate info/warn logs mentioning failure are quiet', () => {
    assert.equal(isQuietStdoutLine('ℹ️ [2026-08-03T16:21:13.000Z] [SYNC] retry failed 3 times'), true);
    assert.equal(isQuietStdoutLine('⚠️ [2026-08-03T16:21:13.000Z] [MAP] render failed, using fallback'), true);
    assert.equal(isQuietStdoutLine('2026-07-08T03:55:08: ℹ️ [SYNC] sendCastingInvites: sent 0, failed 3'), true);
  });

  it('unmarked failure lines are not quiet', () => {
    assert.equal(isQuietStdoutLine('Failed to fetch guild 12345'), false);
    assert.equal(isQuietStdoutLine('❌ setup_castbot background work failed: timeout'), false);
  });
});

describe('PM2ErrorLogger — noise filters (false positives in #error channel)', () => {
  // The three exact lines Reece reported leaking into #error (2026-07-09)
  it('zero-count success summaries are NOT critical', () => {
    assert.equal(isCriticalLine('📨 sendCastingInvites [selected] guild 1512093418602364998: sent 1, failed 0, skippedEmpty 0'), false);
    assert.equal(isCriticalLine('2026-07-08T03:55:08: ✅ Conversion complete: 0 renamed, 16 unchanged, 0 unmapped, 0 failed, 0 orphaned (cleaned up)'), false);
  });

  it('DEPRECATED redirect warnings are benign stderr, real errors are not', () => {
    assert.equal(isBenignStderrLine('2026-07-08T03:53:52: ⚠️ DEPRECATED season_management_menu hit (user 391415444084490240) — redirecting to the Season Manager.'), true);
    assert.equal(isBenignStderrLine('ExperimentalWarning: buffer.File'), true);
    assert.equal(isBenignStderrLine('TypeError: cannot read properties of undefined'), false);
  });

  it('real failures still flagged critical', () => {
    assert.equal(isCriticalLine('📨 sendCastingInvites: sent 0, failed 3, skippedEmpty 0'), true);
    assert.equal(isCriticalLine('Failed to fetch guild 12345'), true);
    assert.equal(isCriticalLine('TypeError: x is not a function'), true);
    assert.equal(isCriticalLine('❌ setup_castbot background work failed: timeout'), true);
  });

  it('a zero-count token does not mask a real error on the same line', () => {
    assert.equal(isCriticalLine('sent 1, failed 0 — but ERROR: webhook rejected'), true);
  });

  it('stripZeroCountTokens handles failed 0 / failed: 0 / 0 failed variants', () => {
    assert.equal(stripZeroCountTokens('failed 0').includes('failed'), false);
    assert.equal(stripZeroCountTokens('failed: 0').includes('failed'), false);
    assert.equal(stripZeroCountTokens('0 failed').includes('failed'), false);
    assert.equal(stripZeroCountTokens('failed 10').includes('failed'), true); // 10 ≠ 0
    assert.equal(stripZeroCountTokens('failed 0, failed 2').includes('failed'), true);
  });

  it('blank lines are never critical', () => {
    assert.equal(isCriticalLine(''), false);
    assert.equal(isCriticalLine('   '), false);
  });
});

describe('PM2ErrorLogger — buildErrorLogContainer (Components V2 card)', () => {
  const base = { env: 'dev', timeString: '10:23 AM', logContent: 'TypeError: boom' };

  it('builds a Container with header, fenced log, and env accent color', () => {
    const c = buildErrorLogContainer({ ...base, askEnabled: false });
    assert.equal(c.type, 17);
    assert.equal(c.accent_color, 0xf1c40f); // dev = yellow
    const [header, log] = c.components;
    assert.equal(header.type, 10);
    assert.ok(header.content.includes('PM2 Errors · DEV'));
    assert.ok(header.content.includes('10:23 AM'));
    assert.equal(log.type, 10);
    assert.ok(log.content.startsWith('```\n'));
    assert.ok(log.content.includes('TypeError: boom'));
  });

  it('prod is red, test is blue, unknown env gets a neutral fallback', () => {
    assert.equal(buildErrorLogContainer({ ...base, env: 'prod', askEnabled: false }).accent_color, 0xe74c3c);
    assert.equal(buildErrorLogContainer({ ...base, env: 'test', askEnabled: false }).accent_color, 0x3498db);
    assert.equal(buildErrorLogContainer({ ...base, env: 'mystery', askEnabled: false }).accent_color, 0x95a5a6);
  });

  it('appends the Ask Moai row only when askEnabled', () => {
    const withAsk = buildErrorLogContainer({ ...base, askEnabled: true });
    const row = withAsk.components.find(c => c.type === 1);
    assert.ok(row, 'expected an Action Row');
    assert.equal(row.components[0].custom_id, 'moai_ask_msg');
    assert.equal(row.components[0].emoji.name, '🗿');

    const withoutAsk = buildErrorLogContainer({ ...base, askEnabled: false });
    assert.equal(withoutAsk.components.some(c => c.type === 1), false);
    assert.equal(withoutAsk.components.some(c => c.type === 14), false); // no orphan separator
  });

  it('askEnabled default mirrors isMoaiEnvironment: on in prod only with CLAUDE_PROD_FEATURES', () => {
    const prevProd = process.env.PRODUCTION;
    const prevFeat = process.env.CLAUDE_PROD_FEATURES;
    try {
      process.env.PRODUCTION = 'TRUE';
      delete process.env.CLAUDE_PROD_FEATURES;
      assert.equal(buildErrorLogContainer({ ...base }).components.some(c => c.type === 1), false, 'prod without opt-in: no button');
      process.env.CLAUDE_PROD_FEATURES = 'TRUE';
      assert.equal(buildErrorLogContainer({ ...base }).components.some(c => c.type === 1), true, 'prod with opt-in: button');
      // warnings-severity cards get it too (severity only changes the card skin)
      assert.equal(buildErrorLogContainer({ ...base, severity: 'warn' }).components.some(c => c.type === 1), true, 'warn cards: button');
      delete process.env.PRODUCTION;
      assert.equal(buildErrorLogContainer({ ...base }).components.some(c => c.type === 1), true, 'dev/test: button');
    } finally {
      if (prevProd === undefined) delete process.env.PRODUCTION; else process.env.PRODUCTION = prevProd;
      if (prevFeat === undefined) delete process.env.CLAUDE_PROD_FEATURES; else process.env.CLAUDE_PROD_FEATURES = prevFeat;
    }
  });

  it('caps the log body inside the 4000-char total Text Display budget', () => {
    const c = buildErrorLogContainer({ ...base, logContent: 'x'.repeat(10000), askEnabled: false });
    const total = c.components.filter(x => x.type === 10).reduce((n, x) => n + x.content.length, 0);
    assert.ok(total <= 4000, `total text ${total} exceeds 4000`);
    assert.ok(c.components[1].content.includes('[truncated]'));
  });

  it('warn severity gets the muted Warnings card regardless of env', () => {
    const c = buildErrorLogContainer({ ...base, env: 'prod', severity: 'warn', askEnabled: false });
    assert.ok(c.components[0].content.includes('🟡 PM2 Warnings · PROD'));
    assert.equal(c.accent_color, 0x95a5a6);
  });

  it('mention prepends Reece and defaults off (channel is @mentions-only notify)', () => {
    const pinged = buildErrorLogContainer({ ...base, env: 'prod', mention: true, askEnabled: false });
    assert.ok(pinged.components[0].content.startsWith('<@391415444084490240>\n'));
    const quiet = buildErrorLogContainer({ ...base, env: 'prod', askEnabled: false });
    assert.ok(!quiet.components[0].content.includes('<@'));
  });
});
