#!/usr/bin/env node

/**
 * Test Coverage Scanner
 * Scans tests/ directory and compares against source modules.
 * Logs coverage status with icons matching the Button Debug system style.
 *
 * Dev-only: Called at app startup when PRODUCTION !== 'TRUE'
 *
 * Icons:
 *   [🧪 TESTED]    - Has a corresponding test file
 *   [⚠️ UNTESTED]  - No test file found
 *
 * Usage:
 *   import { logTestCoverage } from './scripts/test-coverage-scan.js';
 *   logTestCoverage();  // Logs to console
 *
 *   // Or run directly:
 *   node scripts/test-coverage-scan.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Get all test files and extract the module names they cover.
 * Convention: tests/foo.test.js covers foo.js (or utils/foo.js, etc.)
 * @returns {Map<string, {testFile: string, testCount: number|null}>}
 */
function getTestedModules() {
  const testsDir = path.join(PROJECT_ROOT, 'tests');
  const tested = new Map();

  if (!fs.existsSync(testsDir)) return tested;

  const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));

  for (const testFile of testFiles) {
    // buttonModalTrigger.test.js → buttonModalTrigger
    const moduleName = testFile.replace('.test.js', '');

    // Try to count test cases from the file
    let testCount = null;
    try {
      const content = fs.readFileSync(path.join(testsDir, testFile), 'utf-8');
      const itMatches = content.match(/\bit\s*\(/g);
      testCount = itMatches ? itMatches.length : 0;
    } catch {
      // Silently ignore read errors
    }

    tested.set(moduleName, { testFile, testCount });
  }

  return tested;
}

/**
 * Get all source modules worth tracking.
 * Scans root .js files and utils/*.js, excluding infrastructure/config files.
 * @returns {string[]} Module names (without .js extension)
 */
function getSourceModules() {
  const exclude = new Set([
    'commands',           // Just command registration
    'config',             // Configuration constants
    'deploy-remote-wsl',  // Deployment script
    'selectStressTest',   // Test utility
    'test-restock',       // Test utility
  ]);

  const modules = [];

  // Root .js files
  const rootFiles = fs.readdirSync(PROJECT_ROOT)
    .filter(f => f.endsWith('.js') && !exclude.has(f.replace('.js', '')));

  for (const file of rootFiles) {
    modules.push(file.replace('.js', ''));
  }

  // utils/*.js
  const utilsDir = path.join(PROJECT_ROOT, 'utils');
  if (fs.existsSync(utilsDir)) {
    const utilFiles = fs.readdirSync(utilsDir).filter(f => f.endsWith('.js'));
    for (const file of utilFiles) {
      modules.push(file.replace('.js', ''));
    }
  }

  return modules.sort();
}

/**
 * Log test coverage scan results to console.
 * Designed to match the Button Debug system's visual style.
 */
export function logTestCoverage() {
  const tested = getTestedModules();
  const sourceModules = getSourceModules();

  const testedCount = sourceModules.filter(m => tested.has(m)).length;
  const totalCount = sourceModules.length;

  console.log('');
  console.log('🧪 TEST COVERAGE SCAN:');

  // Show tested modules first
  const testedModules = sourceModules.filter(m => tested.has(m));
  const untestedModules = sourceModules.filter(m => !tested.has(m));

  for (const mod of testedModules) {
    const info = tested.get(mod);
    const countStr = info.testCount !== null ? ` (${info.testCount} cases)` : '';
    console.log(`  ${mod.padEnd(35)} [🧪 TESTED]${countStr}`);
  }

  // Summary separator
  if (testedModules.length > 0 && untestedModules.length > 0) {
    console.log(`  ${'─'.repeat(55)}`);
  }

  for (const mod of untestedModules) {
    console.log(`  ${mod.padEnd(35)} [⚠️ UNTESTED]`);
  }

  console.log('');
  console.log(`  📊 Coverage: ${testedCount}/${totalCount} modules (${Math.round(testedCount / totalCount * 100)}%)`);
  console.log('');
}

// Allow direct execution: node scripts/test-coverage-scan.js
if (process.argv[1] && process.argv[1].includes('test-coverage-scan')) {
  logTestCoverage();
}
