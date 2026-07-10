/**
 * SECURITY RATCHET — declare-or-deny for ButtonHandlerFactory handlers (RaP 0900 Phase 1).
 *
 * STATIC test: parses app.js / castlistHandlers.js as text. Ships ZERO runtime code —
 * bot behavior is untouched. It only fails the suite (and therefore dev-restart deploys)
 * when a NEW handler block carries no security declaration at all.
 *
 * A handler block is "declared" when the create({...})(req, res, client) span contains ANY of:
 *   - requiresPermission:            (declarative factory gate — preferred)
 *   - an inline gate primitive       (hasAdminPermissions / hasCastRankingPermissions /
 *                                     hasPermission / requirePermission / the owner user-ID)
 *   - security: 'public'             (explicit, reviewable "this is deliberately ungated";
 *                                     the factory ignores unknown config keys, so it is inert)
 *
 * All handlers that were undeclared when this ratchet landed (2026-07-11) are grandfathered
 * in tests/securityDeclarationsBaseline.json. The baseline may ONLY SHRINK:
 *   - new undeclared handler        → test fails; declare it (see above) — do NOT add to baseline
 *   - you gated a baseline handler  → test fails with a "stale entries" list; DELETE those
 *     keys from the baseline JSON (keeps the ratchet honest, Moai-hook style)
 *
 * Origin: docs/01-RaP/0900_20260711_SecurityArchitectureOptions_Analysis.md and
 * docs/incidents/04-AnchorMenuAdminExposure.md (anchor_open_menu served the admin
 * Production Menu to every player for 3.5 months — an omitted gate is invisible;
 * this makes the omission loud at commit time).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const SCANNED_FILES = ['app.js', 'castlistHandlers.js'];
const BASELINE_PATH = path.join(__dirname, 'securityDeclarationsBaseline.json');

// The baseline is a GRANDFATHER LIST and must never grow. This constant is the
// ceiling; additions require editing this test file too — a loud, reviewable diff.
// Lower it freely as the baseline shrinks.
const FROZEN_BASELINE_MAX = 265;

const CREATE_MARKER = 'ButtonHandlerFactory.create({';
const BLOCK_END = '})(req, res, client)';
const GATE_PATTERN = new RegExp([
  'requiresPermission\\s*:',
  "security\\s*:\\s*'public'",
  'hasAdminPermissions\\s*\\(',
  'hasCastRankingPermissions\\s*\\(',
  'hasPermission\\s*\\(',
  'requirePermission\\s*\\(',
  '391415444084490240' // owner-ID hard gate
].join('|'));

/**
 * Stable key for a handler block. Position-independent by design — the original
 * ordinal-based keys for `id: custom_id` blocks shifted whenever ANY handler was
 * inserted earlier in the file, forcing baseline renumber edits on unrelated
 * commits (observed 2026-07-11, first field use). Precedence:
 *   1. literal id                          → file::id (template params → *)
 *   2. id is a variable (`id: custom_id`)  → file::cond:<first quoted string of the
 *      nearest PRECEDING custom_id comparison> — the dispatch condition names it
 *   3. fallback                            → file::hash:<sha1 of normalized block>
 */
function blockKey(file, block, src, blockStart) {
  const idMatch = block.match(/id:\s*['`]([^'`]+)['`]/);
  if (idMatch) {
    return `${file}::${idMatch[1].replace(/\$\{[^}]*\}/g, '*')}`;
  }
  const windowText = src.slice(Math.max(0, blockStart - 1500), blockStart);
  const condRe = /custom_id(?:\s*===\s*|\.startsWith\(\s*|\.includes\(\s*)['"`]([^'"`]+)['"`]/g;
  let cond = null;
  for (const m of windowText.matchAll(condRe)) cond = m[1]; // keep the LAST (nearest) match
  if (cond) {
    return `${file}::cond:${cond}`;
  }
  const normalized = block.replace(/\s+/g, ' ').slice(0, 600);
  return `${file}::hash:${createHash('sha1').update(normalized).digest('hex').slice(0, 10)}`;
}

function scanUndeclared() {
  const undeclared = [];
  let totalBlocks = 0;
  for (const file of SCANNED_FILES) {
    const src = readFileSync(path.join(REPO, file), 'utf8');
    let idx = 0;
    while ((idx = src.indexOf(CREATE_MARKER, idx)) !== -1) {
      const end = src.indexOf(BLOCK_END, idx);
      const block = src.slice(idx, end === -1 ? idx + 4000 : end);
      totalBlocks++;
      if (!GATE_PATTERN.test(block)) {
        undeclared.push(blockKey(file, block, src, idx));
      }
      idx += CREATE_MARKER.length;
    }
  }
  return { undeclared, totalBlocks };
}

describe('Security — declare-or-deny ratchet (RaP 0900 Phase 1)', () => {
  const { undeclared, totalBlocks } = scanUndeclared();
  const baseline = new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')));

  it('parser is live (finds a plausible number of factory blocks)', () => {
    assert.ok(totalBlocks >= 500,
      `expected >=500 ButtonHandlerFactory.create blocks, found ${totalBlocks} — parser may be broken`);
  });

  it('baseline has not grown (grandfather list is frozen — additions are forbidden)', () => {
    assert.ok(baseline.size <= FROZEN_BASELINE_MAX,
      `baseline has ${baseline.size} entries, ceiling is ${FROZEN_BASELINE_MAX}. ` +
      `The baseline may only SHRINK. If you are trying to add a new handler to it: don't — ` +
      `declare the handler instead (requiresPermission / inline gate / security: 'public').`);
  });

  it('no NEW handler ships without a security declaration', () => {
    const fresh = undeclared.filter(k => !baseline.has(k));
    assert.deepEqual(fresh, [],
      `\nNEW handler(s) with NO security declaration:\n` +
      fresh.map(k => `  ${k}`).join('\n') +
      `\n\nFix (pick one — do NOT add to the baseline):\n` +
      `  1. requiresPermission: PermissionFlagsBits.<...> in the create() config (preferred), or\n` +
      `  2. an inline gate (hasAdminPermissions / hasCastRankingPermissions / requirePermission), or\n` +
      `  3. security: 'public' in the config — an explicit, reviewed statement that ANY user may run this.\n` +
      `See docs/01-RaP/0900_20260711_SecurityArchitectureOptions_Analysis.md`);
  });

  it('baseline only shrinks (stale grandfathered entries must be removed)', () => {
    const current = new Set(undeclared);
    const stale = [...baseline].filter(k => !current.has(k));
    assert.deepEqual(stale, [],
      `\nBaseline entries that are no longer undeclared (handler was gated, renamed, or removed).\n` +
      `DELETE these keys from tests/securityDeclarationsBaseline.json:\n` +
      stale.map(k => `  ${k}`).join('\n'));
  });
});
