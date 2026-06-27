// Tests for buildRoleErrorResponse — the standardised Components V2 error for role-management failures.
// The whole point: it must NEVER return a plain { content } (which can't UPDATE a V2 message → "interaction
// failed"); it must always be a type-17 Container. Mirrors utils/roleUtils.js. See ComponentsV2Issues.md §7.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoleErrorResponse } from '../utils/roleUtils.js';

const IS_V2 = 1 << 15;
const EPHEMERAL = 1 << 6;

describe('buildRoleErrorResponse — always a valid Components V2 container', () => {
  it('returns a type-17 Container, never plain content', () => {
    const r = buildRoleErrorResponse({ roleType: 'pronoun', code: 50013 });
    assert.equal(r.content, undefined, 'must NOT use the plain content field');
    assert.equal(r.components[0].type, 17);
    assert.equal(r.components[0].components[0].type, 10); // Text Display
    assert.ok(r.flags & IS_V2, 'must set IS_COMPONENTS_V2');
  });

  it('50013 → role-hierarchy guidance ("above")', () => {
    const r = buildRoleErrorResponse({ roleType: 'timezone', code: 50013 });
    const text = r.components[0].components[0].content;
    assert.match(text, /below/);
    assert.match(text, /above/);
    assert.match(text, /timezone/);
  });

  it('non-50013 → generic "couldn\'t update" message', () => {
    const r = buildRoleErrorResponse({ roleType: 'pronoun', code: 10011 });
    const text = r.components[0].components[0].content;
    assert.match(text, /Couldn't update/i);
    assert.doesNotMatch(text, /drag the/i);
  });

  it('includes the specific role name when provided', () => {
    const r = buildRoleErrorResponse({ roleType: 'pronoun', roleName: 'He/Him', code: 50013 });
    assert.match(r.components[0].components[0].content, /He\/Him/);
  });

  it('ephemeral:true adds the EPHEMERAL flag; default omits it', () => {
    assert.ok(buildRoleErrorResponse({ ephemeral: true, code: 50013 }).flags & EPHEMERAL);
    assert.equal(buildRoleErrorResponse({ code: 50013 }).flags & EPHEMERAL, 0);
  });
});
