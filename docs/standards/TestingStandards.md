# Testing Standards

## Overview

CastBot uses Node.js native test runner (`node:test` + `node:assert/strict`) with zero external test dependencies. Tests are **mandatory on every dev restart** and block deployment if any fail.

## Quick Reference

```bash
# Run tests manually
node --test tests/*.test.js

# Dev restart (tests run automatically)
./scripts/dev/dev-restart.sh "commit message"

# Skip tests (escape hatch only)
./scripts/dev/dev-restart.sh -skip-tests "emergency fix"

# View test coverage scan
node scripts/test-coverage-scan.js
```

## When to Write Tests

**Write tests for every new feature or significant change.** This includes:
- New trigger types, outcome types, or data transforms
- Pure logic functions (filtering, matching, calculation)
- UI builder functions (component construction, modal building)
- Data schema validation
- Utility functions

**Skip tests for:**
- Simple config changes or constant updates
- Pure routing changes in app.js (if/else chain additions)
- Documentation-only changes

## Test File Convention

```
tests/{moduleName}.test.js  →  covers  {moduleName}.js
tests/{featureName}.test.js  →  covers cross-cutting feature logic
```

Examples:
- `tests/safariInitialization.test.js` → covers `safariInitialization.js`
- `tests/buttonModalTrigger.test.js` → covers button_modal logic across modules
- `tests/memberFetchUtils.test.js` → covers `utils/memberFetchUtils.js`

## Test Pattern: Extracted Logic

CastBot's modules have heavy dependencies (Discord client, file I/O, Express). To keep tests fast and dependency-free, **replicate pure logic inline** in test files rather than importing full modules.

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate the function under test to avoid importing full module graph
function matchPhrase(userAnswer, phrases) {
  if (!userAnswer || !phrases || phrases.length === 0) return false;
  return phrases.some(phrase =>
    phrase.toLowerCase().trim() === userAnswer.toLowerCase().trim()
  );
}

describe('Phrase Matching', () => {
  it('matches exact phrase (case-insensitive)', () => {
    assert.ok(matchPhrase('OPEN SESAME', ['open sesame']));
  });

  it('rejects non-matching input', () => {
    assert.ok(!matchPhrase('wrong', ['correct']));
  });
});
```

**Why this pattern:**
- Tests run in ~260ms (no module graph to load)
- Zero external dependencies
- No Discord client or file I/O needed
- Tests are self-contained and portable

**Trade-off:** Tests can drift from actual code. When modifying a function that has extracted test copies, update both places.

## Test Structure

```javascript
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// 1. Replicate logic under test
function myFunction(input) { /* ... */ }

// 2. Group tests by behavior
describe('Feature Name — Behavior Group', () => {
  it('does the expected thing', () => {
    assert.equal(myFunction('input'), 'expected');
  });

  it('handles edge case', () => {
    assert.ok(!myFunction(null));
  });
});
```

## Assertion Patterns

```javascript
// Equality
assert.equal(actual, expected);
assert.notEqual(actual, unexpected);

// Boolean
assert.ok(value);            // truthy
assert.ok(!value);           // falsy

// Objects/Arrays
assert.deepEqual(actual, expected);

// Async errors
await assert.rejects(async () => { throw new Error(); });
```

## What to Test

### Must Test
- **Phrase/pattern matching** — case sensitivity, whitespace, empty inputs
- **Condition evaluation** — pass/fail branching, multi-gate logic
- **Data transforms** — filtering, mapping, schema validation
- **UI component builders** — correct types, structure, round-trip integrity
- **State transitions** — initialized/deinitialized, mode changes

### Test Categories (per test file)

| Category | Example | Priority |
|----------|---------|----------|
| Happy path | Correct input → expected output | High |
| Edge cases | null, undefined, empty arrays, 0 | High |
| Error paths | Invalid input, missing data | Medium |
| Boundary values | Max values, empty strings | Medium |
| State transitions | Before/after, mode switches | Medium |

## Coverage Scan

At dev startup, the app automatically logs test coverage:

```
🧪 TEST COVERAGE SCAN:
  memberFetchUtils                    [🧪 TESTED] (12 cases)
  richCardUI                          [🧪 TESTED] (29 cases)
  safariInitialization                [🧪 TESTED] (26 cases)
  ───────────────────────────────────────────────────────
  safariManager                       [⚠️ UNTESTED]
  playerManagement                    [⚠️ UNTESTED]
  ...

  📊 Coverage: 3/65 modules (5%)
```

**Icons match the Button Debug system style:**
- `[🧪 TESTED]` — Has a corresponding `tests/{name}.test.js` file
- `[⚠️ UNTESTED]` — No test file found

The scan runs dev-only (`PRODUCTION !== 'TRUE'`). Run manually:
```bash
node scripts/test-coverage-scan.js
```

## Dev Restart Integration

Tests are **mandatory** on every `dev-restart.sh` call:

```bash
./scripts/dev/dev-restart.sh "Fix safari buttons"
# Output:
# 🧪 Running unit tests...
# ✅ All tests passed (116 pass, 0 fail)
# ... continues with commit, push, restart
```

If tests fail, the restart **aborts** — no commit, no push, no restart:
```
# ❌ Tests FAILED — aborting restart
```

Use `-skip-tests` only for emergencies:
```bash
./scripts/dev/dev-restart.sh -skip-tests "emergency hotfix"
```

Test results appear in Discord deploy notifications:
```
## :white_check_mark: Unit Tests
`116 pass, 0 fail (27 suites)`
```

## Creating a New Test File

1. Create `tests/{moduleName}.test.js`
2. Import `node:test` and `node:assert/strict`
3. Replicate the pure logic you want to test (don't import the full module)
4. Write tests covering happy path, edge cases, and error paths
5. Run: `node --test tests/{moduleName}.test.js`
6. Verify the coverage scan picks it up: `node scripts/test-coverage-scan.js`

## Files

| File | Purpose |
|------|---------|
| `tests/*.test.js` | Unit test files |
| `scripts/test-coverage-scan.js` | Coverage scanner (startup + CLI) |
| `scripts/dev/dev-restart.sh` | Runs tests before restart (mandatory) |
| `scripts/notify-restart.js` | Reports test results to Discord |

---

*Last Updated: March 2026*
