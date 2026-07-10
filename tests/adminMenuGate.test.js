/**
 * SECURITY TRIPWIRE — every createProductionMenuInterface() call site must be gated.
 *
 * Born from RaP 0901 (2026-07-11): the Safari anchor "Menu" button (anchor_open_menu)
 * served the full admin Production Menu to EVERY user for 3+ months because its
 * handler called createProductionMenuInterface() with no permission check. The
 * builder itself is unguarded — security is opt-in at each call site — so this
 * test statically scans app.js and fails if any call site lacks a nearby gate.
 *
 * Heuristic: within the 100 lines PRECEDING the call there must be either
 *   - hasAdminPermissions(   (the /menu-style admin/player fork), or
 *   - requiresPermission:    (ButtonHandlerFactory declarative gate)
 * 100 lines covers the widest legitimate gap today (season_delete_confirm: 61).
 * If you add a legitimately-gated call that trips this, tighten the handler or
 * extend the heuristic consciously — do NOT delete the test.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '..', 'app.js');
const GATE_WINDOW = 100;
const GATE_PATTERN = /hasAdminPermissions\s*\(|requiresPermission\s*:/;

function findUngatedCallSites(source) {
  const lines = source.split('\n');
  const ungated = [];
  lines.forEach((line, idx) => {
    if (!line.includes('createProductionMenuInterface(')) return;
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;   // comments
    if (/function createProductionMenuInterface/.test(line)) return;   // definition
    if (/trackLegacyMenu/.test(line)) return;                          // tracking string
    const windowStart = Math.max(0, idx - GATE_WINDOW);
    const preceding = lines.slice(windowStart, idx).join('\n');
    if (!GATE_PATTERN.test(preceding)) {
      ungated.push({ line: idx + 1, code: trimmed.slice(0, 120) });
    }
  });
  return ungated;
}

describe('Security — admin Production Menu gating', () => {
  const source = readFileSync(APP_JS, 'utf8');

  it('app.js actually contains createProductionMenuInterface call sites (scan is live)', () => {
    const calls = source.split('\n').filter(l =>
      l.includes('createProductionMenuInterface(') &&
      !/function createProductionMenuInterface|trackLegacyMenu/.test(l) &&
      !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    assert.ok(calls.length >= 5, `expected >=5 call sites, found ${calls.length} — scan may be broken`);
  });

  it('every createProductionMenuInterface call site has an admin gate within the preceding 100 lines', () => {
    const ungated = findUngatedCallSites(source);
    assert.deepEqual(ungated, [],
      `UNGATED admin-menu call site(s) found — players could open the Production Menu!\n` +
      ungated.map(u => `  app.js:${u.line}: ${u.code}`).join('\n') +
      `\nAdd a hasAdminPermissions() fork or factory requiresPermission gate (see RaP 0901).`);
  });
});
