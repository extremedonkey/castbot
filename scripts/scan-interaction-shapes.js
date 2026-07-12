#!/usr/bin/env node
/**
 * Interaction Response Shape Scanner
 *
 * Statically detects response shapes Discord silently rejects ("This interaction
 * failed" with NO server-side error). Born from the 2026-07-12 give_item incident:
 * a factory handler with updateMessage:true returned { content } onto a Components
 * V2 message — Discord 400s a content-only update to a V2 message, so the user saw
 * "interaction failed" instead of the error text. See RaP (InteractionShapeFailures).
 *
 * Violation classes:
 *   A  content_only_update   — factory handler with updateMessage:true has a return
 *                              path with top-level `content` and no `components`.
 *                              Fails whenever the parent message is V2 (nearly all
 *                              CastBot UIs). Runtime-mitigated by the sendResponse
 *                              auto-wrap guard, but still latent debt.
 *   B  content_with_v2_flag  — a response object combines `content` with
 *                              IS_COMPONENTS_V2 (1<<15) in `flags`. V2 forbids
 *                              content. Fails on ANY parent.
 *   C  legacy_update_content — direct res.send(UPDATE_MESSAGE) whose data has
 *                              content and no components (legacy handlers).
 *   D  legacy_update_flags   — direct res.send(UPDATE_MESSAGE) whose data carries
 *                              a `flags` field (Discord rejects flags on update).
 *
 * Usage:  node scripts/scan-interaction-shapes.js [--json]
 * Also imported by tests/interactionResponseShape.test.js (ratchet).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Tokenizer helpers ────────────────────────────────────────────────────────

/**
 * Walk source from an opening brace index, returning the index of its matching
 * close brace. String/template/comment aware (template ${} nesting included).
 */
export function matchBrace(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i === -1) return -1; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i); if (i === -1) return -1; i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '`') {
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') break;
        if (src[i] === '$' && src[i + 1] === '{') {
          const end = matchBrace(src, i + 1);
          if (end === -1) return -1;
          i = end + 1; continue;
        }
        i++;
      }
      i++; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

/** Extract depth-1 keys of an object literal given src and its brace span. */
export function topLevelKeys(src, openIdx, closeIdx) {
  const keys = [];
  let depth = 0;
  let i = openIdx;
  while (i <= closeIdx) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i === -1 || i > closeIdx) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i); if (i === -1 || i > closeIdx) break; i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i <= closeIdx && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (c === '`') {
      i++;
      while (i <= closeIdx) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') break;
        if (src[i] === '$' && src[i + 1] === '{') {
          const end = matchBrace(src, i + 1);
          if (end === -1) break;
          i = end + 1; continue;
        }
        i++;
      }
      i++; continue;
    }
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; continue; }
    if (depth === 1) {
      const m = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:/.exec(src.slice(i, Math.min(i + 60, closeIdx)));
      if (m && (i === openIdx + 1 || /[,{\s]/.test(src[i - 1]))) {
        keys.push({ key: m[1], idx: i });
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return keys.map(k => k.key);
}

export function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

// ── Class A: factory handlers with content-only returns under updateMessage ──

export function scanFactoryHandlers(src, file) {
  const violations = [];
  const marker = 'ButtonHandlerFactory.create({';
  let from = 0;
  while (true) {
    const at = src.indexOf(marker, from);
    if (at === -1) break;
    const open = at + marker.length - 1;
    const close = matchBrace(src, open);
    if (close === -1) { from = at + marker.length; continue; }
    const block = src.slice(open, close + 1);

    const idMatch = /id:\s*['"]([^'"]+)['"]/.exec(block);
    const id = idMatch ? idMatch[1] : `anonymous@L${lineOf(src, at)}`;
    const updateMessage = /updateMessage:\s*true/.test(block);
    const isAdmin = /requiresPermission:/.test(block);

    if (updateMessage) {
      // Every `return {` inside the block
      let r = 0;
      while (true) {
        const rAt = block.indexOf('return {', r);
        if (rAt === -1) break;
        const rOpen = rAt + 'return {'.length - 1;
        const rClose = matchBrace(block, rOpen);
        if (rClose === -1) { r = rAt + 8; continue; }
        const keys = topLevelKeys(block, rOpen, rClose);
        if (keys.includes('content') && !keys.includes('components') && !keys.includes('type')) {
          const objSrc = block.slice(rOpen, rClose + 1);
          const contentSample = (/content:\s*(['"`])((?:\\.|(?!\1).){0,80})/.exec(objSrc) || [])[2] || '';
          const isErrorPath = /^\s*[❌⚠️]/.test(contentSample);
          violations.push({
            class: 'A', code: 'content_only_update',
            file, handlerId: id, line: lineOf(src, at) + lineOf(block.slice(0, rAt), block.length) - 1,
            isAdmin, isErrorPath, contentSample: contentSample.slice(0, 60)
          });
        }
        r = rClose + 1;
      }
    }
    from = close + 1;
  }
  return violations;
}

// ── Class B: content combined with IS_COMPONENTS_V2 flag in one object ───────

export function scanContentWithV2Flag(src, file) {
  const violations = [];
  // Find every object literal that sets flags including (1 << 15) — then check for
  // sibling top-level `content`. Heuristic: locate `flags:` mentions with 1 << 15.
  const re = /flags:\s*[^,\n]*1\s*<<\s*15[^,\n]*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    // Walk back to the enclosing '{'
    let i = m.index;
    let depth = 0;
    while (i > 0) {
      const c = src[i];
      if (c === '}' || c === ')' || c === ']') depth++;
      if (c === '{') { if (depth === 0) break; depth--; }
      i--;
    }
    if (src[i] !== '{') continue;
    const close = matchBrace(src, i);
    if (close === -1) continue;
    const keys = topLevelKeys(src, i, close);
    if (keys.includes('content') && keys.includes('flags') && !keys.includes('components')) {
      violations.push({
        class: 'B', code: 'content_with_v2_flag',
        file, handlerId: null, line: lineOf(src, m.index),
        isAdmin: null, isErrorPath: null,
        contentSample: src.slice(m.index, m.index + 60).replace(/\s+/g, ' ')
      });
    }
  }
  return violations;
}

// ── Classes C/D: legacy res.send(UPDATE_MESSAGE) shape problems ──────────────

export function scanLegacyUpdateSends(src, file) {
  const violations = [];
  const re = /type:\s*InteractionResponseType\.UPDATE_MESSAGE/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    // Enclosing object = the res.send({ type, data }) literal
    let i = m.index;
    let depth = 0;
    while (i > 0) {
      const c = src[i];
      if (c === '}' || c === ')' || c === ']') depth++;
      if (c === '{') { if (depth === 0) break; depth--; }
      i--;
    }
    if (src[i] !== '{') continue;
    const close = matchBrace(src, i);
    if (close === -1) continue;
    const body = src.slice(i, close + 1);
    const dataAt = body.indexOf('data:');
    if (dataAt === -1) continue;
    const dataOpen = body.indexOf('{', dataAt);
    if (dataOpen === -1) continue;
    const dataClose = matchBrace(body, dataOpen);
    if (dataClose === -1) continue;
    const keys = topLevelKeys(body, dataOpen, dataClose);
    const line = lineOf(src, m.index);
    if (keys.includes('content') && !keys.includes('components')) {
      violations.push({ class: 'C', code: 'legacy_update_content', file, handlerId: null, line, isAdmin: null, isErrorPath: null, contentSample: '' });
    }
    if (keys.includes('flags') || keys.includes('ephemeral')) {
      violations.push({ class: 'D', code: 'legacy_update_flags', file, handlerId: null, line, isAdmin: null, isErrorPath: null, contentSample: '' });
    }
  }
  return violations;
}

// ── Driver ───────────────────────────────────────────────────────────────────

export const SCAN_FILES = [
  'app.js', 'buttonHandlerFactory.js', 'safariManager.js', 'customActionUI.js',
  'menuBuilder.js', 'playerManagement.js', 'entityManagementUI.js', 'safariMapAdmin.js',
  'castlistV2.js', 'safariConfigUI.js', 'mapExplorer.js', 'scheduledActionManager.js'
];

export function scanAll(root = ROOT) {
  const all = [];
  for (const rel of SCAN_FILES) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf8');
    all.push(...scanFactoryHandlers(src, rel));
    all.push(...scanContentWithV2Flag(src, rel));
    all.push(...scanLegacyUpdateSends(src, rel));
  }
  return all;
}

/** Stable ratchet key: file + handler id (or line-anchored content) + class. */
export function violationKey(v) {
  return `${v.file}::${v.handlerId || 'L' + v.line}::${v.class}`;
}

function main() {
  const violations = scanAll();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(violations, null, 2));
    return;
  }
  const byClass = {};
  for (const v of violations) (byClass[v.class] = byClass[v.class] || []).push(v);
  console.log(`\nInteraction Response Shape Scan — ${violations.length} finding(s)\n`);
  for (const cls of ['A', 'B', 'C', 'D']) {
    const list = byClass[cls] || [];
    if (!list.length) continue;
    console.log(`── Class ${cls} (${list[0].code}) — ${list.length} ──`);
    for (const v of list) {
      const tags = [
        v.isAdmin === false ? 'PLAYER-FACING' : v.isAdmin ? 'admin' : '',
        v.isErrorPath === true ? 'error-path' : v.isErrorPath === false ? 'MAIN-PATH' : ''
      ].filter(Boolean).join(', ');
      console.log(`  ${v.file}:${v.line}  ${v.handlerId || ''}  ${tags}  ${v.contentSample ? JSON.stringify(v.contentSample) : ''}`);
    }
    console.log('');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
