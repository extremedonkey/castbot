/**
 * PREMIUM RATCHET — the `premium:` config gate stays coherent (RaP 0891 lapse architecture).
 *
 * STATIC test in the securityDeclarations.test.js mold: parses source as text, ships no
 * runtime code. Three guarantees:
 *
 *   1. Every `premium: '<key>'` declaration names a REAL entitlements FEATURES key —
 *      a typo'd key would silently deny (fail-closed) forever.
 *   2. The handlers that MUST be premium-declared are (REQUIRED_PREMIUM_IDS). Removing
 *      a declaration is a loud, reviewed act — not an accidental drop during a refactor.
 *   3. The PREMIUM LAUNCH SWITCH (askCastBot.js PUBLIC_ASK_REQUIRES_ENTITLEMENT) exists.
 *      While false, POSTED Ask buttons deliberately bypass the guild entitlement
 *      (Reece 2026-08-08: posted buttons stay open until premium launches). The switch
 *      being a named export means the launch flip is a one-word diff — this test only
 *      asserts it EXISTS with a boolean literal, so flipping it never breaks the suite.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FEATURES } from '../entitlements.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const SCANNED_FILES = ['app.js', 'castlistHandlers.js'];

/** Handlers that must carry a `premium:` declaration in their create({...}) block. */
const REQUIRED_PREMIUM_IDS = ['askcb_ask', 'askcb_post'];

const CREATE_MARKER = 'ButtonHandlerFactory.create({';
const BLOCK_END = '})(req, res, client)';

function collectBlocks() {
  const blocks = [];
  for (const file of SCANNED_FILES) {
    const src = readFileSync(path.join(REPO, file), 'utf8');
    let idx = 0;
    while ((idx = src.indexOf(CREATE_MARKER, idx)) !== -1) {
      const end = src.indexOf(BLOCK_END, idx);
      blocks.push({ file, block: src.slice(idx, end === -1 ? idx + 4000 : end) });
      idx += CREATE_MARKER.length;
    }
  }
  return blocks;
}

describe('Premium — declaration ratchet (RaP 0891)', () => {
  const blocks = collectBlocks();
  const validKeys = new Set(Object.values(FEATURES));

  it('every premium: declaration names a real FEATURES key (typos would deny forever)', () => {
    const bad = [];
    for (const { file, block } of blocks) {
      for (const m of block.matchAll(/premium:\s*['"]([^'"]+)['"]/g)) {
        if (!validKeys.has(m[1])) {
          const id = block.match(/id:\s*['`]([^'`]+)['`]/)?.[1] || '(unknown id)';
          bad.push(`${file}::${id} → premium: '${m[1]}'`);
        }
      }
    }
    assert.deepEqual(bad, [],
      `\npremium: declarations naming unknown FEATURES keys:\n${bad.map(b => `  ${b}`).join('\n')}\n` +
      `Valid keys: ${[...validKeys].join(', ')} (entitlements.js FEATURES)`);
  });

  it('required handlers carry the premium declaration (dropping one is a reviewed act)', () => {
    const missing = [];
    for (const id of REQUIRED_PREMIUM_IDS) {
      const block = blocks.find(b => b.block.includes(`id: '${id}'`));
      if (!block) missing.push(`${id} (create block not found at all)`);
      else if (!/premium:\s*['"]/.test(block.block)) missing.push(id);
    }
    assert.deepEqual(missing, [],
      `\nHandler(s) missing their premium: declaration:\n${missing.map(m => `  ${m}`).join('\n')}\n` +
      `These are premium-gated features — if the gate is REALLY meant to go, update ` +
      `REQUIRED_PREMIUM_IDS in this test in the same commit (loud, reviewable).`);
  });

  it('the factory enforces premium: centrally (gate code present)', () => {
    const factorySrc = readFileSync(path.join(REPO, 'buttonHandlerFactory.js'), 'utf8');
    assert.ok(factorySrc.includes('config.premium') && factorySrc.includes('sendPremiumDenied'),
      'buttonHandlerFactory.js no longer contains the premium gate (config.premium / sendPremiumDenied)');
  });

  it('the premium launch switch exists in askCastBot.js (either value is fine)', () => {
    const src = readFileSync(path.join(REPO, 'askCastBot.js'), 'utf8');
    assert.match(src, /export const PUBLIC_ASK_REQUIRES_ENTITLEMENT = (true|false);/,
      'PUBLIC_ASK_REQUIRES_ENTITLEMENT is gone or no longer a boolean literal — ' +
      'the posted-Ask premium launch switch must stay a named, greppable constant');
  });
});
