import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicate pure logic inline to avoid importing heavy modules

function createStaminaSnapshot(before, after, max, regenTime, regenTimeBefore = null) {
    return { before, after, max, regenTime, regenTimeBefore };
}

function formatStaminaTag(snapshot) {
    if (!snapshot) return '';
    const formatRegen = (t) => (!t || t === 'Full' || t === 'Ready!') ? '♻️MAX' : `♻️${t}`;
    const regenAfter = formatRegen(snapshot.regenTime);
    const regenBefore = snapshot.regenTimeBefore ? formatRegen(snapshot.regenTimeBefore) : null;
    const beforePart = regenBefore && regenBefore !== regenAfter
        ? `⚡${snapshot.before}/${snapshot.max} ${regenBefore}`
        : `⚡${snapshot.before}/${snapshot.max}`;
    return `(${beforePart} → ${snapshot.after}/${snapshot.max} ${regenAfter})`;
}

// Replicates pointsManager.latestRegenAnchor: later of last spend / last applied regen.
// lastUse-only re-grants every check in amount mode; lastRegeneration-only regenerates
// instantly after idling at MAX.
function latestRegenAnchor(pointData) {
    const { lastUse, lastRegeneration } = pointData;
    if (lastUse != null && lastRegeneration != null) return Math.max(lastUse, lastRegeneration);
    return lastUse ?? lastRegeneration;
}

// Replicate Phase 1 regen logic inline for testing
function calculatePhase1Regen(pointData, config, now, pointType = 'stamina') {
    let hasChanged = false;
    let newData = { ...pointData };
    const effectiveMax = config.defaultMax + (config.permanentBoost || 0);

    // Reconcile stored max to effectiveMax — STAMINA ONLY (the fix). Attributes preserve a possible
    // admin-set custom max, so they are NOT reconciled here.
    if (pointType === 'stamina' && newData.max !== effectiveMax) {
        newData.max = effectiveMax;
        hasChanged = true;
    }

    const regenAmount = (config.regeneration.amount === 'max' || !config.regeneration.amount)
        ? effectiveMax
        : config.regeneration.amount;

    // MUST match pointsManager.js Phase 1 anchor (see latestRegenAnchor above).
    const regenTimestamp = latestRegenAnchor(newData);
    const timeSinceRegen = now - regenTimestamp;
    const periods = Math.floor(timeSinceRegen / config.regeneration.interval);

    if (periods > 0 && newData.current < effectiveMax) {
        let appliedPeriods = 0;
        for (let p = 0; p < periods && newData.current < effectiveMax; p++) {
            newData.current += regenAmount;
            appliedPeriods++;
        }
        // 'max' mode (full reset) clamps; numeric 'amount' mode intentionally may overshoot.
        if (config.regeneration.amount === 'max' || !config.regeneration.amount) {
            newData.current = Math.min(newData.current, effectiveMax);
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
        assert.deepEqual(snap, { before: 1, after: 0, max: 1, regenTime: '12h 0m', regenTimeBefore: null });
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

    it('formats consumable boost with before regen different from after', () => {
        const snap = createStaminaSnapshot(0, 1, 1, 'Full', '6h 12m');
        assert.equal(formatStaminaTag(snap), '(⚡0/1 ♻️6h 12m → 1/1 ♻️MAX)');
    });

    it('omits before regen when same as after', () => {
        const snap = createStaminaSnapshot(1, 1, 2, 'Full', 'Full');
        assert.equal(formatStaminaTag(snap), '(⚡1/2 → 1/2 ♻️MAX)');
    });

    it('omits before regen when null', () => {
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

    it('shows before regen when movement starts cooldown', () => {
        const snap = createStaminaSnapshot(1, 0, 1, '12h 0m', 'Full');
        assert.equal(formatStaminaTag(snap), '(⚡1/1 ♻️MAX → 0/1 ♻️12h 0m)');
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

    it('FULL RESET fills TO max, never overshoots (regression: 98 must not become 197)', () => {
        // Exact prod repro: admin set 98/99, regen interval elapsed, amount=max.
        const now = 1000000;
        const data = makePointData(98, 99, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(99, 'max'), now);
        assert.equal(result.data.current, 99, 'must clamp to max, not 98+99=197');
    });

    it('max mode from a partial value clamps (6/8 max-mode → 8, not 14)', () => {
        const now = 1000000;
        const data = makePointData(6, 8, now - INTERVAL_30MIN);
        const result = calculatePhase1Regen(data, makeConfig(8, 'max'), now);
        assert.equal(result.data.current, 8);
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

describe('Phase 1 Regen — anchor advances, no re-grant on repeated checks (Hudson repeat-grant bug)', () => {
    const TWELVE_H = 720 * 60000;

    it('amount mode: repeated checks after one interval grant only ONE +1', () => {
        // Kris's exact scenario: max 3, +1 per 12h. Spent last stamina at T0; 12h01m later the
        // map/player-card is opened three times a minute apart. Before the fix this minted
        // 0→1→2→3; each check after the first must be a no-op until T0+24h.
        const T0 = 1000000;
        let now = T0 + TWELVE_H + 60000;
        let data = { current: 0, max: 3, lastUse: T0, lastRegeneration: T0 - 1 };
        const config = makeConfig(3, 1, TWELVE_H);

        let r = calculatePhase1Regen(data, config, now);
        assert.equal(r.data.current, 1, 'first check applies the one elapsed period');

        r = calculatePhase1Regen(r.data, config, now + 60000);
        assert.equal(r.data.current, 1, 'second check must NOT re-grant');
        assert.equal(r.hasChanged, false);

        r = calculatePhase1Regen(r.data, config, now + 120000);
        assert.equal(r.data.current, 1, 'third check must NOT re-grant');
    });

    it('amount mode: next +1 arrives one interval after the previous grant, not after lastUse', () => {
        const T0 = 1000000;
        const config = makeConfig(3, 1, TWELVE_H);
        let data = { current: 0, max: 3, lastUse: T0, lastRegeneration: T0 - 1 };

        let r = calculatePhase1Regen(data, config, T0 + TWELVE_H + 1000); // → 1/3
        r = calculatePhase1Regen(r.data, config, T0 + 2 * TWELVE_H - 1000);
        assert.equal(r.data.current, 1, 'still 1/3 just before T0+24h');
        r = calculatePhase1Regen(r.data, config, T0 + 2 * TWELVE_H + 1000);
        assert.equal(r.data.current, 2, '2/3 just after T0+24h');
    });

    it('idle at MAX then spend does not insta-regen (618737f7 guard)', () => {
        // Player sat at max for 5 days (lastRegeneration ancient), then spent one.
        // usePoints stamps lastUse=now; the next read must see periods=0.
        const now = 1000000;
        const FIVE_DAYS = 5 * 24 * 3600000;
        const data = { current: 2, max: 3, lastUse: now - 1000, lastRegeneration: now - FIVE_DAYS };
        const r = calculatePhase1Regen(data, makeConfig(3, 1, TWELVE_H), now);
        assert.equal(r.data.current, 2, 'no instant regen from the stale lastRegeneration anchor');
        assert.equal(r.hasChanged, false);
    });

    it('offline catchup still applies multiple periods once, then holds', () => {
        const T0 = 1000000;
        const config = makeConfig(3, 1, TWELVE_H);
        const now = T0 + 2 * TWELVE_H + 60000; // 24h01m offline
        let r = calculatePhase1Regen({ current: 0, max: 3, lastUse: T0, lastRegeneration: T0 - 1 }, config, now);
        assert.equal(r.data.current, 2, 'two elapsed periods apply on first check');
        r = calculatePhase1Regen(r.data, config, now + 60000);
        assert.equal(r.data.current, 2, 'no re-grant on the following check');
    });
});

describe('Phase 1 — stored max reconciles to configured max (init settings respected)', () => {
    it('heals a player stuck at max=1 to the configured max even when no regen fires', () => {
        // Repro of the prod bug: player initialized at 1/1 when maxStamina defaulted to 1,
        // admin later configured max=99, regen interval 12h so no period has elapsed.
        const now = 1000000;
        const TWELVE_H = 720 * 60000;
        const data = makePointData(1, 1, now - 1000, now - 1000); // used 1s ago → periods=0
        const result = calculatePhase1Regen(data, makeConfig(99, 'max', TWELVE_H), now);
        assert.equal(result.data.max, 99, 'max should snap to configured value');
        assert.equal(result.data.current, 1, 'current is preserved (regen refills over time)');
        assert.equal(result.hasChanged, true, 'change must persist');
    });

    it('reconciles to a new lower configured max (50/51 case)', () => {
        const now = 1000000;
        const data = makePointData(1, 1, now - 1000, now - 1000);
        const result = calculatePhase1Regen(data, makeConfig(51, 'max', 720 * 60000), now);
        assert.equal(result.data.max, 51);
        assert.equal(result.hasChanged, true);
    });

    it('no spurious change when stored max already matches config', () => {
        const now = 1000000;
        const data = makePointData(99, 99, now - 1000, now - 1000);
        const result = calculatePhase1Regen(data, makeConfig(99, 'max', 720 * 60000), now);
        assert.equal(result.data.max, 99);
        assert.equal(result.hasChanged, false);
    });

    it('includes permanentBoost in the reconciled max', () => {
        const now = 1000000;
        const data = makePointData(1, 1, now - 1000, now - 1000);
        const result = calculatePhase1Regen(data, makeConfig(99, 'max', 720 * 60000, 10), now);
        assert.equal(result.data.max, 109, 'effectiveMax = defaultMax + permanentBoost');
    });

    it('does NOT reconcile non-stamina attributes (preserves admin-set custom max)', () => {
        // Regression guard: an admin-set custom HP max (200) must survive a read even though it
        // differs from the attribute config default (100). Only stamina reconciles.
        const now = 1000000;
        const data = makePointData(150, 200, now - 1000, now - 1000); // current 150, custom max 200
        const result = calculatePhase1Regen(data, makeConfig(100, 'max', 720 * 60000), now, 'hp');
        assert.equal(result.data.max, 200, 'custom attribute max must be preserved');
        assert.equal(result.hasChanged, false, 'no spurious save/clobber for attributes');
    });
});


// ─── setRegenCountdown (Manually Set Refresh) — time-shift semantics ─────────
// Replicates the pure shift math from pointsManager.setRegenCountdown: the whole pending
// timeline moves by delta = (now + D) − currentNextFire, so the outcome matches what would
// have happened had the player simply waited.

function computeRemainingMs(pointData, interval, now) {
    if (pointData.charges) {
        const pending = pointData.charges.filter(c => c);
        if (pending.length === 0) return null;
        return Math.max(0, Math.min(...pending) + interval - now);
    }
    if (pointData.current >= pointData.max) return null;
    return Math.max(0, latestRegenAnchor(pointData) + interval - now);
}

function applyRegenCountdown(pointData, interval, durationMs, now) {
    const remaining = computeRemainingMs(pointData, interval, now);
    if (remaining === null) return { success: false };
    const delta = durationMs - remaining;
    const points = JSON.parse(JSON.stringify(pointData));
    if (points.charges) {
        for (let i = 0; i < points.charges.length; i++) {
            if (points.charges[i]) points.charges[i] += delta;
        }
    } else {
        const anchor = latestRegenAnchor(points) + delta;
        points.lastUse = anchor;
        points.lastRegeneration = anchor;
    }
    return { success: true, points };
}

describe('setRegenCountdown — Phase 1 (full-reset & drip share the lastUse anchor)', () => {
    const HOUR = 3600000;
    const INTERVAL = 12 * HOUR;

    it('sets next fire to exactly now + D', () => {
        const now = 1000000000;
        const data = { current: 0, max: 3, lastUse: now - 4 * HOUR, lastRegeneration: now - 4 * HOUR };
        const { points } = applyRegenCountdown(data, INTERVAL, 2 * HOUR, now);
        assert.equal(points.lastUse + INTERVAL, now + 2 * HOUR, 'next regen lands at now + D');
        assert.equal(points.lastRegeneration, points.lastUse, 'dual-anchor rule');
    });

    it('D = 0 → next fire is now (instant refresh on next read)', () => {
        const now = 1000000000;
        const data = { current: 0, max: 3, lastUse: now - 4 * HOUR, lastRegeneration: now - 4 * HOUR };
        const { points } = applyRegenCountdown(data, INTERVAL, 0, now);
        assert.equal(points.lastUse + INTERVAL, now);
        // The regen loop fires when floor((now − lastUse)/interval) >= 1
        assert.ok(Math.floor((now - points.lastUse) / INTERVAL) >= 1, 'regen fires immediately');
    });

    it('D > interval → anchor in the future, no premature regen (periods <= 0)', () => {
        const now = 1000000000;
        const data = { current: 1, max: 3, lastUse: now - HOUR, lastRegeneration: now - HOUR };
        const { points } = applyRegenCountdown(data, INTERVAL, 20 * HOUR, now);
        assert.equal(points.lastUse + INTERVAL, now + 20 * HOUR);
        const periods = Math.floor((now - points.lastUse) / INTERVAL);
        assert.ok(periods <= 0, 'no regen until now + D');
    });

    it('player at max → success:false (nothing to refresh)', () => {
        const now = 1000000000;
        const data = { current: 3, max: 3, lastUse: now - HOUR, lastRegeneration: now - HOUR };
        assert.equal(applyRegenCountdown(data, INTERVAL, HOUR, now).success, false);
    });
});

describe('setRegenCountdown — Phase 2 (charges) delta-shift preserves stagger', () => {
    const HOUR = 3600000;
    const INTERVAL = 12 * HOUR;

    it('shifts every pending charge by the same delta; null slots untouched', () => {
        const now = 1000000000;
        // Charges due in 8h / 10h / 12h  (ts = due − interval)
        const data = { current: 1, max: 4, charges: [null, now + 8*HOUR - INTERVAL, now + 10*HOUR - INTERVAL, now + 12*HOUR - INTERVAL] };
        const { points } = applyRegenCountdown(data, INTERVAL, 2 * HOUR, now);
        assert.equal(points.charges[0], null, 'available charge untouched');
        assert.equal(points.charges[1] + INTERVAL, now + 2 * HOUR, 'earliest now due in 2h');
        assert.equal(points.charges[2] + INTERVAL, now + 4 * HOUR, 'stagger preserved: 4h');
        assert.equal(points.charges[3] + INTERVAL, now + 6 * HOUR, 'stagger preserved: 6h');
    });

    it('extending works too (refresh pushed later)', () => {
        const now = 1000000000;
        const data = { current: 0, max: 2, charges: [now + 1*HOUR - INTERVAL, now + 3*HOUR - INTERVAL] };
        const { points } = applyRegenCountdown(data, INTERVAL, 20 * HOUR, now);
        assert.equal(points.charges[0] + INTERVAL, now + 20 * HOUR);
        assert.equal(points.charges[1] + INTERVAL, now + 22 * HOUR);
    });

    it('D = 0 → earliest charge fires on next read, later charges keep shifted spacing', () => {
        const now = 1000000000;
        const data = { current: 0, max: 2, charges: [now + 8*HOUR - INTERVAL, now + 10*HOUR - INTERVAL] };
        const { points } = applyRegenCountdown(data, INTERVAL, 0, now);
        assert.ok(now - points.charges[0] >= INTERVAL, 'earliest charge regenerates immediately');
        assert.equal(points.charges[1] + INTERVAL, now + 2 * HOUR, 'second follows 2h later');
    });

    it('no pending charges → success:false', () => {
        const now = 1000000000;
        const data = { current: 2, max: 2, charges: [null, null] };
        assert.equal(applyRegenCountdown(data, INTERVAL, HOUR, now).success, false);
    });
});
