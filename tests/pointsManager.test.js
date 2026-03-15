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
