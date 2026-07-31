/**
 * Persona webhook — display-name validation.
 *
 * Discord answers a banned webhook username with a bare 400 and no indication of which rule was
 * broken, so these rules are enforced client-side to produce an actionable message instead.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePersonaName, WEBHOOK_NAME } from '../src/webhooks/personaWebhook.js';

describe('Persona webhook — name validation', () => {
  it('accepts an ordinary name', () => {
    const r = validatePersonaName('Melbourne Survivor Production');
    assert.equal(r.ok, true);
    assert.equal(r.name, 'Melbourne Survivor Production');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(validatePersonaName('  Host Team  ').name, 'Host Team');
  });

  it('falls back when blank, whitespace-only, null or undefined', () => {
    for (const input of ['', '   ', null, undefined]) {
      const r = validatePersonaName(input, 'CastBot');
      assert.equal(r.ok, true, `input ${JSON.stringify(input)} should fall back`);
      assert.equal(r.name, 'CastBot');
    }
  });

  it('rejects names containing "discord" in any casing', () => {
    for (const n of ['Discord Staff', 'thediscordteam', 'DISCORD']) {
      const r = validatePersonaName(n);
      assert.equal(r.ok, false, `${n} must be rejected`);
      assert.match(r.error, /discord/i);
    }
  });

  it('rejects names containing "clyde"', () => {
    assert.equal(validatePersonaName('Clyde').ok, false);
    assert.equal(validatePersonaName('notclyde').ok, false);
  });

  it('accepts exactly 80 characters and rejects 81', () => {
    assert.equal(validatePersonaName('a'.repeat(80)).ok, true);
    const over = validatePersonaName('a'.repeat(81));
    assert.equal(over.ok, false);
    assert.match(over.error, /80 characters/);
  });

  it('measures length AFTER trimming, so padding does not push a valid name over', () => {
    assert.equal(validatePersonaName('  ' + 'a'.repeat(80) + '  ').ok, true);
  });

  it('rejects a banned fallback rather than silently posting it', () => {
    // A caller passing a bad default should fail loudly, not have it slip through unchecked.
    assert.equal(validatePersonaName('', 'Discord Bot').ok, false);
  });

  it('never returns a name when validation failed', () => {
    assert.equal(validatePersonaName('Discord').name, undefined);
  });

  it('exports a stable webhook name — it is how we find our own webhook again', () => {
    assert.equal(typeof WEBHOOK_NAME, 'string');
    assert.ok(WEBHOOK_NAME.length > 0 && WEBHOOK_NAME.length <= 80);
    assert.equal(validatePersonaName(WEBHOOK_NAME).ok, true, 'our own webhook name must itself be legal');
  });
});
