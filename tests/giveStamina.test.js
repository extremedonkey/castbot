/**
 * Tests for the give_stamina Custom Action outcome (safariManager.executeGiveStamina).
 *
 * The executor's pure decision logic is replicated inline (per TestingStandards — the
 * real module is heavy); the usage-limit gate and claim recorder are imported for REAL
 * from utils/periodUtils.js (pure, no side effects — same approach as periodUtils.test.js).
 *
 * Semantics under test (the consumable pattern):
 * - Signed amount: positive grants may exceed max (the normal state in max-0 scavenger
 *   mode); negative drains floor at 0.
 * - Regen anchors are NEVER touched — a grant must not restart the cooldown, a drain
 *   must not hand out a fresh timer.
 * - Every limit type gates through checkLimitGate and records through recordLimitClaim.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkLimitGate, recordLimitClaim } from '../utils/periodUtils.js';

// Replica of the executor's amount parse: parseInt, with NaN/0 meaning "unconfigured, skip".
function parseAmount(config) {
    return parseInt(config?.amount) || 0;
}

// Replica of addBonusPoints' core (pointsManager.js): over-max allowed, floors at 0,
// lastUse/lastRegeneration untouched.
function applyBonus(points, amount) {
    return { ...points, current: Math.max(0, points.current + amount) };
}

// Replica of the executor's feedback message (default + placeholder substitution).
function buildMessage(config, amountLabel, points) {
    return config.message
        ? config.message
            .replace('{amount}', amountLabel)
            .replace('{current}', String(points.current))
            .replace('{max}', String(points.max))
        : `⚡ **${amountLabel} Stamina** (${points.current}/${points.max})`;
}

const NOW = 1752561000000;

describe('give_stamina — signed amount application (consumable pattern)', () => {
    it('+2 from 0/0 → 2/0: over-max is the normal state in scavenger mode', () => {
        const points = applyBonus({ current: 0, max: 0, lastUse: 1, lastRegeneration: 1 }, 2);
        assert.equal(points.current, 2);
        assert.equal(points.max, 0);
    });

    it('-3 from 2 floors at 0, never negative', () => {
        assert.equal(applyBonus({ current: 2, max: 5 }, -3).current, 0);
    });

    it('regen anchors are untouched by grants AND drains (no timer restart)', () => {
        const before = { current: 1, max: 3, lastUse: 111, lastRegeneration: 222 };
        const granted = applyBonus(before, 2);
        const drained = applyBonus(before, -1);
        assert.equal(granted.lastUse, 111);
        assert.equal(granted.lastRegeneration, 222);
        assert.equal(drained.lastUse, 111);
        assert.equal(drained.lastRegeneration, 222);
    });

    it('amount 0, missing, or garbage → 0 (executor skips as unconfigured)', () => {
        assert.equal(parseAmount({ amount: 0 }), 0);
        assert.equal(parseAmount({}), 0);
        assert.equal(parseAmount({ amount: 'abc' }), 0);
        assert.equal(parseAmount(undefined), 0);
    });

    it('string amounts from hand-authored configs parse with sign', () => {
        assert.equal(parseAmount({ amount: '2' }), 2);
        assert.equal(parseAmount({ amount: '-1' }), -1);
    });
});

describe('give_stamina — usage limit gating (real periodUtils gate)', () => {
    it('no limit / unlimited → never blocked', () => {
        assert.equal(checkLimitGate(null, 'u1', NOW).blocked, false);
        assert.equal(checkLimitGate({ type: 'unlimited' }, 'u1', NOW).blocked, false);
    });

    it('once_per_player blocks only prior claimants', () => {
        const limit = { type: 'once_per_player', claimedBy: ['u1'] };
        const blocked = checkLimitGate(limit, 'u1', NOW);
        assert.equal(blocked.blocked, true);
        assert.equal(blocked.reason, 'once_per_player');
        assert.equal(checkLimitGate(limit, 'u2', NOW).blocked, false);
    });

    it('once_globally blocks everyone after the first claim', () => {
        const limit = { type: 'once_globally', claimedBy: 'u1' };
        assert.equal(checkLimitGate(limit, 'u1', NOW).blocked, true);
        assert.equal(checkLimitGate(limit, 'u2', NOW).blocked, true);
        assert.equal(checkLimitGate(limit, 'u2', NOW).reason, 'once_globally');
    });

    it('once_per_period blocks inside the window with a countdown, reopens after', () => {
        const HOUR = 3600000;
        const limit = { type: 'once_per_period', periodMs: HOUR, claimedBy: { u1: NOW - 1000 } };
        const inWindow = checkLimitGate(limit, 'u1', NOW);
        assert.equal(inWindow.blocked, true);
        assert.equal(inWindow.reason, 'once_per_period');
        assert.ok(inWindow.remainingMs > 0 && inWindow.remainingMs <= HOUR, 'countdown present');
        assert.equal(checkLimitGate(limit, 'u1', NOW + HOUR + 1).blocked, false, 'window reopens');
        assert.equal(checkLimitGate(limit, 'u2', NOW).blocked, false, 'other players unaffected');
    });

    it('custom per_player (the once-per-player-per-period shelter config) blocks re-claims', () => {
        const limit = { type: 'custom', maxClaims: 1, scope: 'per_player', reset: 'none', claims: [{ u: 'u1', t: NOW - 1000 }] };
        const verdict = checkLimitGate(limit, 'u1', NOW);
        assert.equal(verdict.blocked, true);
        assert.ok(String(verdict.reason).startsWith('custom'), 'custom reasons route to buildCustomLimitRejection');
        assert.equal(checkLimitGate(limit, 'u2', NOW).blocked, false);
    });
});

describe('give_stamina — claim recording per limit type (real recorder)', () => {
    it('once_per_player appends to the claimedBy array', () => {
        const limit = { type: 'once_per_player', claimedBy: [] };
        recordLimitClaim(limit, 'u1', NOW);
        assert.deepEqual(limit.claimedBy, ['u1']);
    });

    it('once_globally stores the claimant userId', () => {
        const limit = { type: 'once_globally', claimedBy: null };
        recordLimitClaim(limit, 'u1', NOW);
        assert.equal(limit.claimedBy, 'u1');
    });

    it('once_per_period stamps the claim time per user', () => {
        const limit = { type: 'once_per_period', periodMs: 3600000, claimedBy: {} };
        recordLimitClaim(limit, 'u1', NOW);
        assert.equal(limit.claimedBy.u1, NOW);
    });

    it('custom pushes a {u, t} claim record', () => {
        const limit = { type: 'custom', maxClaims: 1, scope: 'per_player', reset: 'none', claims: [] };
        recordLimitClaim(limit, 'u1', NOW);
        assert.deepEqual(limit.claims, [{ u: 'u1', t: NOW }]);
    });

    it('record → gate round trip: a recorded claim blocks the next attempt', () => {
        const limit = { type: 'once_per_period', periodMs: 3600000, claimedBy: {} };
        assert.equal(checkLimitGate(limit, 'u1', NOW).blocked, false);
        recordLimitClaim(limit, 'u1', NOW);
        assert.equal(checkLimitGate(limit, 'u1', NOW + 1000).blocked, true);
    });
});

describe('give_stamina — feedback message', () => {
    it('default message shows signed amount and current/max', () => {
        assert.equal(
            buildMessage({}, '+2', { current: 3, max: 0 }),
            '⚡ **+2 Stamina** (3/0)'
        );
        assert.equal(
            buildMessage({}, '-1', { current: 0, max: 5 }),
            '⚡ **-1 Stamina** (0/5)'
        );
    });

    it('custom message substitutes {amount}/{current}/{max}', () => {
        const msg = buildMessage(
            { message: 'You rest in the shelter: {amount} energy ({current}/{max})' },
            '+1',
            { current: 1, max: 0 }
        );
        assert.equal(msg, 'You rest in the shelter: +1 energy (1/0)');
    });
});
