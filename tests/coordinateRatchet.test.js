/**
 * COORDINATE MATH RATCHET (RaP 0894 Phase 0 — the "ZZ bug")
 *
 * Map creation always generated Excel-safe multi-letter columns (A..Z, AA..), but the
 * movement engine and every overlay renderer carried their own single-letter
 * `charCodeAt(0) - 65` copies that silently broke on maps wider than 26 columns
 * (the creation modal allows up to 100). All copies were unified into
 * utils/coordinateParser.js on 2026-09-18.
 *
 * This ratchet statically scans product source and fails if the naive pattern
 * reappears ANYWHERE outside the canonical module. Legacy code is a stronger prompt
 * than CLAUDE.md — agents copy nearby patterns — so the ban is structural, not
 * documentary. If this test fails: import getExcelColumn / parseExcelColumn /
 * generateCoordinate / parseCoordinate / tryParseCoordinate from
 * utils/coordinateParser.js instead of hand-rolling letter math.
 *
 * Scan scope: repo root + src/ + utils/ product .js files. Excluded: node_modules,
 * tests (this file quotes the pattern), scripts (mapGridSystem.js has an unused
 * chess-notation branch; script tools aren't runtime), docs, temp, .git.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const EXCLUDED_DIRS = new Set(['node_modules', 'tests', 'scripts', 'docs', 'temp', '.git', 'img', 'backups', 'logs']);
const ALLOWLIST = new Set([
    'utils/coordinateParser.js'  // the one true home of coordinate letter math
]);

// The naive single-letter column patterns (both -65 col math and -64 1-based variant,
// and letter generation via fromCharCode(65 + ...)).
const NAIVE_PATTERNS = [
    { name: 'charCodeAt(0) - 65/64 column math', re: /charCodeAt\(0\)\s*-\s*6[45]/ },
    { name: 'fromCharCode(65 + …) column letter generation', re: /fromCharCode\(\s*65\s*\+/ },
    // Single-letter validator regexes (/^[A-Z]\d.../ or /^([A-Z])(\d.../) reject AA10 —
    // use COORDINATE_PATTERN from utils/coordinateParser.js instead.
    { name: 'single-letter coordinate regex', re: /\^\(?\[A-Z\]\)?\\d/ }
];

function collectJsFiles(dir, rel = '') {
    const files = [];
    for (const entry of readdirSync(dir)) {
        const abs = path.join(dir, entry);
        const relPath = rel ? `${rel}/${entry}` : entry;
        const st = statSync(abs);
        if (st.isDirectory()) {
            if (EXCLUDED_DIRS.has(entry) || entry.startsWith('.')) continue;
            files.push(...collectJsFiles(abs, relPath));
        } else if (entry.endsWith('.js') && !entry.endsWith('.test.js')) {
            files.push(relPath);
        }
    }
    return files;
}

describe('Coordinate math ratchet — no naive single-letter parsing outside the canon', () => {
    const files = collectJsFiles(REPO_ROOT);

    it('scans a sane number of product files (guard against a broken walk)', () => {
        assert.ok(files.length > 50, `only ${files.length} files found — walk is broken`);
        assert.ok(files.includes('mapMovement.js'), 'mapMovement.js must be in scope');
        assert.ok(files.some(f => f.startsWith('src/')), 'src/ must be in scope');
    });

    it('no product file outside utils/coordinateParser.js contains naive coordinate math', () => {
        const offenders = [];
        for (const file of files) {
            if (ALLOWLIST.has(file)) continue;
            const source = readFileSync(path.join(REPO_ROOT, file), 'utf8');
            for (const { name, re } of NAIVE_PATTERNS) {
                if (re.test(source)) {
                    const line = source.split('\n').findIndex(l => re.test(l)) + 1;
                    offenders.push(`${file}:${line} — ${name}`);
                }
            }
        }
        assert.deepEqual(offenders, [],
            `Naive coordinate math found — use utils/coordinateParser.js instead:\n${offenders.join('\n')}`);
    });
});
