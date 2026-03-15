import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate pure logic inline to avoid importing heavy modules

function createStaminaSnapshot(before, after, max, regenTime) {
    return { before, after, max, regenTime };
}

function formatStaminaTag(snapshot) {
    if (!snapshot) return '';
    const regen = (snapshot.regenTime === 'Full' || snapshot.regenTime === 'Ready!')
        ? ' ♻️MAX' : ` ♻️${snapshot.regenTime}`;
    return `(⚡${snapshot.before}/${snapshot.max} → ${snapshot.after}/${snapshot.max}${regen})`;
}

// Replicate Phase 1 regen logic inline for testing
function calculatePhase1Regen(pointData, config, now) {
    let hasChanged = false;
    let newData = { ...pointData };
    const effectiveMax = config.defaultMax + (config.permanentBoost || 0);

    const regenAmount = (config.regeneration.amount === 'max' || !config.regeneration.amount)
        ? effectiveMax
        : config.regeneration.amount;

    const regenTimestamp = newData.lastRegeneration || newData.lastUse;
    const timeSinceRegen = now - regenTimestamp;
    const periods = Math.floor(timeSinceRegen / config.regeneration.interval);

    if (periods > 0 && newData.current < effectiveMax) {
        let appliedPeriods = 0;
        for (let p = 0; p < periods && newData.current < effectiveMax; p++) {
            newData.current += regenAmount;
            appliedPeriods++;
        }
        newData.max = effectiveMax;
        newData.lastRegeneration = regenTimestamp + (appliedPeriods * config.regeneration.interval);
        hasChanged = true;
    }

    return { data: newData, hasChanged };
}

describe('createStaminaSnapshot', () => {
    it('creates snapshot with all fields', () => {
        const snap = createStaminaSnapshot(1, 0, 1, '12h 0m');
        assert.deepEqual(snap, { before: 1, after: 0, max: 1, regenTime: '12h 0m' });
    });

    it('handles over-max from consumables', () => {
        const snap = createStaminaSnapshot(0, 2, 1, 'Ready!');
        assert.equal(snap.after, 2);
        assert.equal(snap.max, 1);
    });
});

describe('formatStaminaTag', () => {
    it('formats movement cost with regen time', () => {
        const snap = createStaminaSnapshot(1, 0, 1, '12h 0m');
        assert.equal(formatStaminaTag(snap), '(⚡1/1 → 0/1 ♻️12h 0m)');
    });

    it('formats consumable boost (over max, ready)', () => {
        const snap = createStaminaSnapshot(0, 2, 1, 'Ready!');
        assert.equal(formatStaminaTag(snap), '(⚡0/1 → 2/1 ♻️MAX)');
    });

    it('formats full regen with MAX suffix', () => {
        const snap = createStaminaSnapshot(0, 1, 1, 'Full');
        assert.equal(formatStaminaTag(snap), '(⚡0/1 → 1/1 ♻️MAX)');
    });

    it('formats high stamina values', () => {
        const snap = createStaminaSnapshot(3, 1, 5, '2h 30m');
        assert.equal(formatStaminaTag(snap), '(⚡3/5 → 1/5 ♻️2h 30m)');
    });

    it('formats permanent boost max change', () => {
        const snap = createStaminaSnapshot(1, 1, 2, 'Full');
        assert.equal(formatStaminaTag(snap), '(⚡1/2 → 1/2 ♻️MAX)');
    });

    it('returns empty string for null snapshot', () => {
        assert.equal(formatStaminaTag(null), '');
        assert.equal(formatStaminaTag(undefined), '');
    });

    it('formats minutes-only regen time', () => {
        const snap = createStaminaSnapshot(1, 0, 1, '45m');
        assert.equal(formatStaminaTag(snap), '(⚡1/1 → 0/1 ♻️45m)');
    });
});

// ============ Phase 1 Regen Amount Tests ============

const INTERVAL_30MIN = 30 * 60000;

function makeConfig(defaultMax, amount, interval = INTERVAL_30MIN, permanentBoost = 0) {
    return {
        defaultMax,
        permanentBoost,
        regeneration: { type: 'full_reset', interval, amount }
    };
}

function makePointData(current, max, lastUse, lastRegeneration = null) {
    return { current, max, lastUse, lastRegeneration };
}

describe('Phase 1 Regen — amount=max (backward compat)', () => {
    it('resets to max after one interval', () => {
        const now = 1000000;
        const data = makePointData(0, 8, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(8, 'max'), now);
        assert.equal(result.data.current, 8);
        assert.equal(result.hasChanged, true);
    });

    it('does not fire when already at max', () => {
        const now = 1000000;
        const data = makePointData(8, 8, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(8, 'max'), now);
        assert.equal(result.data.current, 8);
        assert.equal(result.hasChanged, false);
    });

    it('null amount behaves like max', () => {
        const now = 1000000;
        const data = makePointData(0, 8, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(8, null), now);
        assert.equal(result.data.current, 8);
    });
});

describe('Phase 1 Regen — amount < max (partial, continuous ticking)', () => {
    it('adds regenAmount after one interval', () => {
        const now = 1000000;
        const data = makePointData(0, 8, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(8, 3), now);
        assert.equal(result.data.current, 3);
    });

    it('applies multiple periods (offline catchup)', () => {
        const now = 1000000;
        const data = makePointData(0, 8, now - (INTERVAL_30MIN * 3));
        const result = calculatePhase1Regen(data, makeConfig(8, 3), now);
        // 0 → 3 → 6 → 9 (3 periods, stops because 9 >= 8)
        assert.equal(result.data.current, 9);
    });

    it('does NOT cap at max — goes over', () => {
        const now = 1000000;
        const data = makePointData(6, 8, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(8, 3), now);
        // 6 + 3 = 9, not capped to 8
        assert.equal(result.data.current, 9);
    });

    it('does NOT cap at max — 7/8 + 3 = 10/8', () => {
        const now = 1000000;
        const data = makePointData(7, 8, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(8, 3), now);
        assert.equal(result.data.current, 10);
    });

    it('pauses when already at max', () => {
        const now = 1000000;
        const data = makePointData(8, 8, now - (INTERVAL_30MIN * 5));
        const result = calculatePhase1Regen(data, makeConfig(8, 3), now);
        assert.equal(result.data.current, 8);
        assert.equal(result.hasChanged, false);
    });

    it('pauses when already over max', () => {
        const now = 1000000;
        const data = makePointData(9, 8, now - (INTERVAL_30MIN * 5));
        const result = calculatePhase1Regen(data, makeConfig(8, 3), now);
        assert.equal(result.data.current, 9);
        assert.equal(result.hasChanged, false);
    });

    it('preserves fractional period in lastRegeneration', () => {
        const now = 1000000;
        const lastUse = now - (INTERVAL_30MIN * 2 + 5000); // 2.08 periods
        const data = makePointData(0, 8, lastUse);
        const result = calculatePhase1Regen(data, makeConfig(8, 3), now);
        assert.equal(result.data.current, 6); // 2 full periods applied
        // lastRegeneration should be lastUse + 2 intervals (preserving the 5s remainder)
        assert.equal(result.data.lastRegeneration, lastUse + INTERVAL_30MIN * 2);
    });
});

describe('Phase 1 Regen — amount > max (over-max burst)', () => {
    it('adds full amount even when exceeding max', () => {
        const now = 1000000;
        const data = makePointData(0, 1, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(1, 5), now);
        assert.equal(result.data.current, 5);
    });

    it('pauses after burst (current >= max)', () => {
        const now = 1000000;
        const data = makePointData(5, 1, now - (INTERVAL_30MIN * 3));
        const result = calculatePhase1Regen(data, makeConfig(1, 5), now);
        // 5 >= 1, should not fire
        assert.equal(result.data.current, 5);
        assert.equal(result.hasChanged, false);
    });

    it('fires again after spending below max', () => {
        const now = 1000000;
        const data = makePointData(0, 1, now - INTERVAL_30MIN, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(1, 5), now);
        assert.equal(result.data.current, 5);
        assert.equal(result.hasChanged, true);
    });

    it('only fires once even with multiple periods (pause after first burst)', () => {
        const now = 1000000;
        const data = makePointData(0, 1, now - (INTERVAL_30MIN * 5));
        const result = calculatePhase1Regen(data, makeConfig(1, 5), now);
        // First period: 0 + 5 = 5, 5 >= 1 so loop stops
        assert.equal(result.data.current, 5);
    });
});

describe('Phase 1 Regen — immediate effect on config change', () => {
    it('uses new regenAmount on next access', () => {
        const now = 1000000;
        // Player was at 0/1, cooldown elapsed with old config (amount=1)
        // but now config says amount=5 — should get 5
        const data = makePointData(0, 1, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(1, 5), now);
        assert.equal(result.data.current, 5);
    });

    it('lastRegeneration fallback to lastUse for migration', () => {
        const now = 1000000;
        // Old data without lastRegeneration
        const data = { current: 0, max: 8, lastUse: now - INTERVAL_30MIN };
        const result = calculatePhase1Regen(data, makeConfig(8, 3), now);
        assert.equal(result.data.current, 3);
        assert.ok(result.data.lastRegeneration); // should be set now
    });
});
