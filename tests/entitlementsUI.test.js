/**
 * Entitlements UI — pure helper coverage for the single-screen panel (2026-08-16
 * redesign). All helpers under test are pure exports (no fs at import time); the async
 * builders are Discord-I/O and covered structurally via buildDetailLines.
 *
 * The panel's promise: Reece can see WHO has premium, UNTIL WHEN, and HOW IT WAS SET
 * (🖐️ manual vs 💳 Ko-fi) — these tests pin exactly those three facts into every surface
 * (list line, select description, detail pane).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatGuildLine, describeOption, sortGuilds, stateEmoji, sourceLabel, summarizeGuilds,
  buildDetailLines, selectExpiringSoon, formatExpiringLine, EXPIRING_SOON_MS
} from '../entitlementsUI.js';

const base = { guildId: '1234567890', displayName: 'EpochORG', features: [], effectiveFeatures: [], source: null };

const NOW = 1_800_000_000_000;
const days = n => n * 24 * 60 * 60 * 1000;
const guild = (name, tierState, extra = {}) => ({ ...base, displayName: name, tierState, ...extra });
const active = (validUntil) => ({ state: 'active', tier: 'premium', permanent: false, validUntil, graceUntil: validUntil + days(7) });
const PERM = { state: 'active', tier: 'premium', permanent: true, validUntil: null, graceUntil: null };

describe('EntitlementsUI — formatGuildLine (who · until when · how set)', () => {
  it('permanent manual premium: state emoji, no date, manual source', () => {
    const line = formatGuildLine(guild('EpochORG', PERM, { source: 'manual' }));
    assert.ok(line.startsWith('⭐'));
    assert.ok(line.includes('**EpochORG**'));
    assert.ok(line.includes('permanent'));
    assert.ok(line.includes('🖐️ manual'));
    assert.ok(!line.includes('until <t:'));
  });

  it('dated Ko-fi premium shows the expiry AND the Ko-fi source', () => {
    const line = formatGuildLine(guild('EpochORG', active(1785103200000), { source: 'subscription' }));
    assert.ok(line.includes('until <t:1785103200:d>'));
    assert.ok(line.includes('💳 Ko-fi'));
  });

  it('grace and lapsed get their own emoji + relative deadline', () => {
    const grace = formatGuildLine(guild('G', { state: 'grace', tier: 'premium', permanent: false, validUntil: 1000, graceUntil: 604801000 }));
    assert.ok(grace.startsWith('🕒'));
    assert.ok(grace.includes('grace ends <t:604801:R>'));
    const lapsed = formatGuildLine(guild('L', { state: 'lapsed', tier: 'premium', permanent: false, validUntil: 1000, graceUntil: 2000 }));
    assert.ok(lapsed.startsWith('💀'));
    assert.ok(lapsed.includes('lapsed <t:1:R>'));
  });

  it('no tier shows ➖ and names legacy features when they exist, with NO source', () => {
    const legacy = formatGuildLine(guild('Old', { state: 'none', tier: null }, { features: ['ask_castbot'] }));
    assert.ok(legacy.startsWith('➖'));
    assert.ok(legacy.includes('legacy features'));
    assert.ok(!legacy.includes('manual') && !legacy.includes('Ko-fi'));
    const bare = formatGuildLine(guild('Bare', { state: 'none', tier: null }));
    assert.ok(bare.includes('no premium'));
    assert.ok(!bare.includes('legacy'));
  });

  it('flags guilds the bot is no longer in (displayName fell back to the id)', () => {
    const line = formatGuildLine({ ...base, displayName: base.guildId, tierState: { state: 'none', tier: null } });
    assert.ok(line.includes('bot not in this server'));
  });
});

describe('EntitlementsUI — describeOption (select descriptions render NO markdown)', () => {
  it('never emits Discord timestamp/markdown syntax', () => {
    for (const g of [
      guild('A', PERM, { source: 'manual' }),
      guild('B', active(NOW), { source: 'subscription' }),
      guild('C', { state: 'grace', tier: 'premium', permanent: false, validUntil: NOW, graceUntil: NOW + days(7) }),
      guild('D', { state: 'lapsed', tier: 'premium', permanent: false, validUntil: NOW, graceUntil: NOW }),
      guild('E', { state: 'none', tier: null })
    ]) {
      const d = describeOption(g, NOW);
      assert.ok(!d.includes('<t:') && !d.includes('**'), `"${d}" leaks markdown`);
      assert.ok(d.length <= 100);
    }
  });

  it('carries the source (manual vs Ko-fi) on every tiered state', () => {
    assert.ok(describeOption(guild('A', PERM, { source: 'manual' })).includes('manual'));
    assert.ok(describeOption(guild('B', active(NOW), { source: 'subscription' })).includes('Ko-fi'));
    assert.ok(describeOption(guild('C', { state: 'grace', tier: 'premium', permanent: false, validUntil: NOW, graceUntil: NOW + days(7) }, { source: 'subscription' })).startsWith('GRACE'));
  });

  it('distinguishes legacy-features-only from a bare no-premium entry', () => {
    assert.equal(describeOption(guild('X', { state: 'none', tier: null }, { features: ['safari_edit'] })), 'No premium (legacy features only)');
    assert.equal(describeOption(guild('Y', { state: 'none', tier: null })), 'No premium');
  });
});

describe('EntitlementsUI — sortGuilds (urgency order, list === select)', () => {
  it('grace → active dated (soonest first) → permanent → lapsed → none', () => {
    const guilds = [
      guild('None', { state: 'none', tier: null }),
      guild('Perm', PERM),
      guild('Lapsed', { state: 'lapsed', tier: 'premium', permanent: false, validUntil: 1, graceUntil: 2 }),
      guild('DatedLate', active(NOW + days(20))),
      guild('Grace', { state: 'grace', tier: 'premium', permanent: false, validUntil: NOW - days(1), graceUntil: NOW + days(6) }),
      guild('DatedSoon', active(NOW + days(2)))
    ];
    assert.deepEqual(sortGuilds(guilds).map(g => g.displayName),
      ['Grace', 'DatedSoon', 'DatedLate', 'Perm', 'Lapsed', 'None']);
  });

  it('is a copy — never mutates the input array', () => {
    const input = [guild('B', PERM), guild('A', PERM)];
    const out = sortGuilds(input);
    assert.notEqual(out, input);
    assert.deepEqual(input.map(g => g.displayName), ['B', 'A']);
  });
});

describe('EntitlementsUI — small pure helpers', () => {
  it('stateEmoji covers every state including missing', () => {
    assert.equal(stateEmoji(PERM), '⭐');
    assert.equal(stateEmoji({ state: 'grace' }), '🕒');
    assert.equal(stateEmoji({ state: 'lapsed' }), '💀');
    assert.equal(stateEmoji({ state: 'none' }), '➖');
    assert.equal(stateEmoji(undefined), '➖');
  });

  it('sourceLabel: only tiered guilds have a source', () => {
    assert.equal(sourceLabel(guild('A', PERM, { source: 'subscription' })), '💳 Ko-fi');
    assert.equal(sourceLabel(guild('B', PERM, { source: 'manual' })), '🖐️ manual');
    assert.equal(sourceLabel(guild('C', { state: 'none', tier: null })), null);
  });

  it('summarizeGuilds counts states and omits empty buckets', () => {
    const s = summarizeGuilds([guild('A', PERM), guild('B', PERM), guild('C', { state: 'grace', tier: 'premium' })]);
    assert.ok(s.includes('3 servers'));
    assert.ok(s.includes('⭐ 2 premium'));
    assert.ok(s.includes('🕒 1 in grace'));
    assert.ok(!s.includes('lapsed') && !s.includes('none'));
    assert.ok(summarizeGuilds([guild('A', PERM)]).includes('1 server ·'));
  });
});

describe('EntitlementsUI — buildDetailLines (the detail pane)', () => {
  const ent = (tierState, extra = {}) => ({
    guildId: '1234567890', exists: true, name: 'EpochORG', features: [],
    tierState, effectiveFeatures: [], source: null, grantedBy: null, grantedAt: null,
    reason: null, kofiEmail: null, ...extra
  });

  it('manual grant shows who granted it, when, and the reason', () => {
    const lines = buildDetailLines(ent(PERM, { source: 'manual', grantedBy: '391415444084490240', grantedAt: NOW, reason: 'comp for S14' }), 'EpochORG').join('\n');
    assert.ok(lines.includes('🟢 Active — permanent'));
    assert.ok(lines.includes('🖐️ Manual — <@391415444084490240>'));
    assert.ok(lines.includes(`<t:${Math.floor(NOW / 1000)}:d>`));
    assert.ok(lines.includes('"comp for S14"'));
  });

  it('Ko-fi grant says renewals auto-extend when the email is linked', () => {
    const lines = buildDetailLines(ent(active(NOW + days(20)), { source: 'subscription', kofiEmail: 'x@y.z' }), 'EpochORG').join('\n');
    assert.ok(lines.includes('💳 Ko-fi subscription'));
    assert.ok(lines.includes('renewals extend automatically'));
    assert.ok(lines.includes('**Grace ends:**'));
  });

  it('no tier renders ➖ none and NO source line', () => {
    const lines = buildDetailLines(ent({ state: 'none', tier: null }), 'EpochORG').join('\n');
    assert.ok(lines.includes('**Premium:** ➖ none'));
    assert.ok(!lines.includes('**Source:**'));
  });

  it('legacy features render as small print only when present', () => {
    const withF = buildDetailLines(ent(PERM, { features: ['ask_castbot'] }), 'E').join('\n');
    assert.ok(withF.includes('-# Legacy feature grants'));
    const without = buildDetailLines(ent(PERM), 'E').join('\n');
    assert.ok(!without.includes('Legacy feature grants'));
  });
});

// ── Expiring Soon (unchanged behaviour — regression pins) ────────────────────

describe('EntitlementsUI — selectExpiringSoon', () => {
  it('includes a dated tier inside the two-week window, excludes one beyond it', () => {
    const soon = guild('Soon', active(NOW + days(3)));
    const later = guild('Later', active(NOW + days(40)));
    assert.deepEqual(selectExpiringSoon([soon, later], NOW).map(g => g.displayName), ['Soon']);
  });

  it('includes grace regardless of how far past expiry it is — most urgent case', () => {
    const grace = guild('Grace', { state: 'grace', tier: 'premium', permanent: false, validUntil: NOW - days(3), graceUntil: NOW + days(4) });
    assert.equal(selectExpiringSoon([grace], NOW).length, 1);
  });

  it('excludes permanent, no-tier, and fully-lapsed guilds', () => {
    const perm = guild('Perm', PERM);
    const none = guild('None', { state: 'none', tier: null });
    const lapsed = guild('Lapsed', { state: 'lapsed', tier: 'premium', permanent: false, validUntil: NOW - days(30), graceUntil: NOW - days(23) });
    assert.deepEqual(selectExpiringSoon([perm, none, lapsed, guild('NoState', undefined)], NOW), []);
  });

  it('sorts soonest-first so the top line is the most urgent', () => {
    const a = guild('A', active(NOW + days(10)));
    const b = guild('B', active(NOW + days(1)));
    const c = guild('C', active(NOW + days(5)));
    assert.deepEqual(selectExpiringSoon([a, b, c], NOW).map(g => g.displayName), ['B', 'C', 'A']);
  });

  it('treats the window edge inclusively and tolerates an empty/missing list', () => {
    const edge = guild('Edge', active(NOW + EXPIRING_SOON_MS));
    assert.equal(selectExpiringSoon([edge], NOW).length, 1);
    assert.deepEqual(selectExpiringSoon([], NOW), []);
    assert.deepEqual(selectExpiringSoon(undefined, NOW), []);
  });
});

describe('EntitlementsUI — formatExpiringLine', () => {
  it('active renders an expiry countdown', () => {
    const line = formatExpiringLine(guild('EpochORG', active(NOW + days(2))));
    assert.ok(line.startsWith('⏳'));
    assert.ok(line.includes(`expires <t:${Math.floor((NOW + days(2)) / 1000)}:R>`));
  });

  it('grace names both the expiry and the grace deadline', () => {
    const line = formatExpiringLine(guild('EpochORG', { state: 'grace', tier: 'premium', permanent: false, validUntil: NOW - days(1), graceUntil: NOW + days(6) }));
    assert.ok(line.startsWith('🕒'));
    assert.ok(line.includes('grace ends <t:'));
  });
});

// ── Review-driven fixes (2026-08-16 adversarial review) ──────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { capLinesToBudget, safeTruncate, buildDestructiveWarning, buildEntitlementsTierModal } from '../entitlementsUI.js';

describe('EntitlementsUI — panel() ephemeral pin (public-registry-leak regression)', () => {
  // entitlements_manage is a NEW message; without ephemeral:true the whole premium
  // registry posts publicly. Static pin: the panel helper must carry the flag.
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'entitlementsUI.js'), 'utf8');

  it('the panel helper returns ephemeral: true', () => {
    const m = src.match(/const panel = async[\s\S]{0,400}?ephemeral: true/);
    assert.ok(m, 'panel() must include ephemeral: true — dropping it posts the premium registry publicly');
  });

  it('remove/revoke confirm prefixes are dispatched before their bare prefixes', () => {
    const order = (a, b) => {
      const ia = src.indexOf(`id.startsWith('${a}')`);
      const ib = src.indexOf(`id.startsWith('${b}')`);
      assert.ok(ia !== -1 && ib !== -1, `${a} / ${b} must both be dispatched`);
      assert.ok(ia < ib, `${a} must be checked BEFORE ${b}`);
    };
    order('entitlements_remove_confirm_', 'entitlements_remove_');
    order('entitlements_remove_cancel_', 'entitlements_remove_');
  });
});

describe('EntitlementsUI — capLinesToBudget (4000-char Text Display cap)', () => {
  it('keeps everything when under both budgets, with no sentinel', () => {
    const r = capLinesToBudget(['a', 'b', 'c']);
    assert.deepEqual(r.lines, ['a', 'b', 'c']);
    assert.equal(r.hidden, 0);
  });

  it('caps at maxLines with an honest "+N more" sentinel', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `guild ${i}`);
    const r = capLinesToBudget(lines, { maxLines: 25, maxChars: 100000 });
    assert.equal(r.hidden, 15);
    assert.equal(r.lines.length, 26, '25 kept + 1 sentinel');
    assert.ok(r.lines[25].includes('…and 15 more'));
  });

  it('caps at the char budget even when under maxLines — the real 4000-char guard', () => {
    const long = 'x'.repeat(400);
    const r = capLinesToBudget(Array.from({ length: 20 }, () => long), { maxLines: 25, maxChars: 2800 });
    assert.ok(r.hidden > 0);
    const total = r.lines.slice(0, -1).reduce((n, l) => n + l.length + 1, 0);
    assert.ok(total <= 2800, `kept ${total} chars > 2800 budget`);
  });

  it('tolerates empty/missing input', () => {
    assert.deepEqual(capLinesToBudget([]).lines, []);
    assert.deepEqual(capLinesToBudget(undefined).lines, []);
  });
});

describe('EntitlementsUI — safeTruncate (surrogate-safe modal titles)', () => {
  it('never splits an astral-plane emoji into a lone surrogate', () => {
    const name = '🦍'.repeat(30); // 60 UTF-16 units, 30 code points
    const out = safeTruncate(`⭐ Premium — ${name}`, 45);
    assert.ok([...out].length <= 45);
    // A lone surrogate round-trips to U+FFFD through encode/decode — assert none.
    assert.ok(!out.includes('�'));
    assert.ok(!/[\uD800-\uDBFF]$/.test(out), 'must not end on an unpaired high surrogate');
  });

  it('returns short strings untouched and handles null', () => {
    assert.equal(safeTruncate('short', 45), 'short');
    assert.equal(safeTruncate(null, 5), '');
  });

  it('the tier modal title survives an emoji-heavy guild name', () => {
    const modal = buildEntitlementsTierModal('123456789012345678', '🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁🦁 Safari Server');
    assert.ok([...modal.title].length <= 45);
    assert.ok(!/[\uD800-\uDBFF]$/.test(modal.title));
  });
});

describe('EntitlementsUI — buildDestructiveWarning (computed facts, not disclaimers)', () => {
  const ent = (tierState, extra = {}) => ({
    guildId: '1234567890', exists: true, name: 'E', features: [], tierState,
    effectiveFeatures: [], source: null, grantedBy: null, grantedAt: null, reason: null, kofiEmail: null, ...extra
  });
  const PERM = { state: 'active', tier: 'premium', permanent: true, validUntil: null, graceUntil: null };

  it('remove names exactly what the entry holds — premium, Ko-fi link, feature count', () => {
    const w = buildDestructiveWarning('remove', ent(PERM, { source: 'subscription', kofiEmail: 'a@b.c', features: ['ask_castbot', 'safari_edit'] }), 'EpochORG');
    assert.ok(w.includes('Remove **EpochORG**'));
    assert.ok(w.includes('Premium (permanent, Ko-fi)'));
    assert.ok(w.includes('Ko-fi billing link'));
    assert.ok(w.includes('2 legacy feature grants'));
    assert.ok(w.includes('audit trail'));
  });

  it('revoke says legacy features STAY and omits them from the removed list', () => {
    const w = buildDestructiveWarning('revoke', ent(PERM, { source: 'manual', features: ['ask_castbot'] }), 'E');
    assert.ok(w.includes('Revoke Premium'));
    assert.ok(w.includes('stay'));
    assert.ok(!w.includes('legacy feature grants ·'), 'features are not in the removed list for revoke');
  });

  it('an empty entry is called an empty entry — no invented stakes', () => {
    const w = buildDestructiveWarning('remove', ent({ state: 'none', tier: null }), 'E');
    assert.ok(w.includes('an empty entry'));
  });
});
