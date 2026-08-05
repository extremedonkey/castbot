import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRelevantIncident, diffIncidents, publicIncidentText, publicResolvedText } from '../src/monitoring/discordStatusWatchdog.js';

const incident = (id, name, opts = {}) => ({ id, name, impact: opts.impact || 'minor', components: opts.components || [] });

describe('DiscordStatusWatchdog — isRelevantIncident', () => {
  it('matches API/gateway/messaging component names', () => {
    assert.equal(isRelevantIncident(incident('a', 'Degraded performance', { components: [{ name: 'API' }] })), true);
    assert.equal(isRelevantIncident(incident('b', 'Issues', { components: [{ name: 'Gateway' }] })), true);
    assert.equal(isRelevantIncident(incident('c', 'Issues', { components: [{ name: 'Media Proxy' }] })), true);
  });

  it('matches keywords in the incident name', () => {
    assert.equal(isRelevantIncident(incident('a', 'API errors on message send')), true);
    assert.equal(isRelevantIncident(incident('b', 'Interaction failures')), true);
  });

  it('ignores unrelated minor incidents but keeps major/critical ones', () => {
    assert.equal(isRelevantIncident(incident('a', 'Billing page slow', { components: [{ name: 'Billing' }] })), false);
    assert.equal(isRelevantIncident(incident('b', 'Billing page down', { impact: 'major' })), true);
    assert.equal(isRelevantIncident(incident('c', 'Widespread outage', { impact: 'critical' })), true);
  });

  it('does not treat "capital" or similar as an API match (word boundary)', () => {
    assert.equal(isRelevantIncident(incident('a', 'Capital letters broken', { components: [{ name: 'Website' }] })), false);
  });

  it('is safe on malformed input', () => {
    assert.equal(isRelevantIncident(null), false);
    assert.equal(isRelevantIncident({}), false);
    assert.equal(isRelevantIncident({ name: 'API down', components: [null] }), true);
  });
});

describe('DiscordStatusWatchdog — diffIncidents', () => {
  it('flags unseen relevant incidents as new', () => {
    const { newIncidents, resolved, nextKnown } = diffIncidents({}, [incident('a', 'API errors')]);
    assert.equal(newIncidents.length, 1);
    assert.equal(resolved.length, 0);
    assert.deepEqual(Object.keys(nextKnown), ['a']);
  });

  it('does not re-announce known incidents', () => {
    const { newIncidents } = diffIncidents({ a: { name: 'API errors' } }, [incident('a', 'API errors')]);
    assert.equal(newIncidents.length, 0);
  });

  it('resolves incidents that disappear from the unresolved list', () => {
    const { newIncidents, resolved, nextKnown } = diffIncidents({ a: { name: 'API errors' } }, []);
    assert.equal(newIncidents.length, 0);
    assert.deepEqual(resolved, [{ id: 'a', name: 'API errors' }]);
    assert.deepEqual(nextKnown, {});
  });

  it('filters irrelevant incidents entirely — never announced, never resolved', () => {
    const r1 = diffIncidents({}, [incident('x', 'Billing slow', { components: [{ name: 'Billing' }] })]);
    assert.equal(r1.newIncidents.length, 0);
    assert.deepEqual(r1.nextKnown, {});
  });

  it('handles simultaneous new + resolved', () => {
    const { newIncidents, resolved } = diffIncidents({ a: { name: 'Old API issue' } }, [incident('b', 'Gateway degraded')]);
    assert.equal(newIncidents[0].id, 'b');
    assert.equal(resolved[0].id, 'a');
  });
});

describe('DiscordStatusWatchdog — public copy', () => {
  it('incident copy is neutral and includes the incident title', () => {
    const text = publicIncidentText('API errors');
    assert.match(text, /\*\*API errors\*\*/);
    assert.match(text, /CastBot itself is online/);
    assert.match(text, /This interaction failed/);
    assert.match(text, /No action needed/);
  });

  it('resolved copy names the incident', () => {
    assert.match(publicResolvedText('API errors'), /\*\*API errors\*\*/);
  });
});
