/**
 * claimsManager.js — atomic, reusable logic for Safari outcome claim limits.
 *
 * An outcome's claim state lives in `limit = { type, claimedBy, periodMs }` where
 * `type ∈ {unlimited, once_per_player, once_globally, once_per_period}` and `claimedBy` is:
 *   - once_per_player → array of userIds
 *   - once_globally   → single userId string (or null/absent when unclaimed)
 *   - once_per_period → object { userId: lastClaimTimestampMs }
 *
 * All functions that mutate operate on the `limit` object directly (caller saves safariContent).
 * Pure logic only — no Discord/file I/O — so it is fully unit-testable. The one async helper
 * (`resolveNames`) only reads from a passed-in guild object.
 */

import { formatCountdown } from './utils/periodUtils.js';

/** Coerce to a non-negative number (cooldown remaining can exceed the period — admin override). */
function nonNeg(n, fallback = 0) {
  n = Number(n);
  return Number.isNaN(n) ? fallback : Math.max(0, n);
}

/** True when the outcome uses a time-based (cooldown) limit. */
export function isTimed(limit) {
  return limit?.type === 'once_per_period';
}

/**
 * Normalise claimedBy into a list of claimant entries for rendering.
 * @returns {Array<{userId:string, claimedAt:number|null, remainingMs:number|null, onCooldown:boolean}>}
 */
export function getClaimants(limit, now = Date.now()) {
  if (!limit || limit.type === 'unlimited') return [];
  const cb = limit.claimedBy;

  if (limit.type === 'once_per_player') {
    const arr = Array.isArray(cb) ? cb : (typeof cb === 'string' && cb ? [cb] : []);
    return arr.map(userId => ({ userId, claimedAt: null, remainingMs: null, onCooldown: false }));
  }

  if (limit.type === 'once_globally') {
    if (typeof cb === 'string' && cb.length > 0) {
      return [{ userId: cb, claimedAt: null, remainingMs: null, onCooldown: false }];
    }
    return [];
  }

  if (limit.type === 'once_per_period') {
    const obj = (cb && typeof cb === 'object' && !Array.isArray(cb)) ? cb : {};
    const periodMs = limit.periodMs || 0;
    return Object.entries(obj).map(([userId, ts]) => {
      const remaining = periodMs - (now - ts);
      return {
        userId,
        claimedAt: ts,
        remainingMs: remaining > 0 ? remaining : 0,
        onCooldown: remaining > 0
      };
    });
  }

  return [];
}

/** Human-readable status line for a claimant (used as the select's placeholder/summary). */
export function claimStatusLine(claimant, limit) {
  if (limit?.type === 'once_per_period') {
    return claimant.onCooldown
      ? `🧊 On Cooldown | ${formatCountdown(claimant.remainingMs)} remaining`
      : '✅ Available';
  }
  return '🔒 Claimed';
}

/**
 * Add a claim for a player (type-aware). For timed outcomes, `remainingMs` controls how much
 * cooldown is left (defaults to the full period — i.e. "just claimed now").
 */
export function addClaim(limit, userId, { remainingMs, now = Date.now() } = {}) {
  if (!limit) return limit;

  if (limit.type === 'once_per_player') {
    if (!Array.isArray(limit.claimedBy)) limit.claimedBy = limit.claimedBy ? [limit.claimedBy] : [];
    if (!limit.claimedBy.includes(userId)) limit.claimedBy.push(userId);
  } else if (limit.type === 'once_globally') {
    limit.claimedBy = userId;
  } else if (limit.type === 'once_per_period') {
    if (!limit.claimedBy || typeof limit.claimedBy !== 'object' || Array.isArray(limit.claimedBy)) {
      limit.claimedBy = {};
    }
    const periodMs = limit.periodMs || 0;
    // Remaining defaults to the full period; admin may set more (future timestamp = extended cooldown)
    const rem = (remainingMs === undefined || remainingMs === null) ? periodMs : nonNeg(remainingMs);
    limit.claimedBy[userId] = now - periodMs + rem;
  }

  return limit;
}

/** Remove a single player's claim (type-aware). */
export function clearClaim(limit, userId) {
  if (!limit) return limit;

  if (limit.type === 'once_per_player') {
    limit.claimedBy = Array.isArray(limit.claimedBy) ? limit.claimedBy.filter(id => id !== userId) : [];
  } else if (limit.type === 'once_globally') {
    if (limit.claimedBy === userId) limit.claimedBy = null;
  } else if (limit.type === 'once_per_period') {
    if (limit.claimedBy && typeof limit.claimedBy === 'object' && !Array.isArray(limit.claimedBy)) {
      delete limit.claimedBy[userId];
    } else {
      limit.claimedBy = {};
    }
  }

  return limit;
}

/**
 * Set a player's remaining cooldown (timed outcomes only). `remainingMs` is the time left until
 * they can re-claim; clamped to [0, periodMs]. 0 means they may claim immediately.
 */
export function setCooldown(limit, userId, remainingMs, now = Date.now()) {
  if (!limit || limit.type !== 'once_per_period') return limit;
  if (!limit.claimedBy || typeof limit.claimedBy !== 'object' || Array.isArray(limit.claimedBy)) {
    limit.claimedBy = {};
  }
  const periodMs = limit.periodMs || 0;
  // Allow remaining > period (admin override): stores a future timestamp the cooldown counts down from
  limit.claimedBy[userId] = now - periodMs + nonNeg(remainingMs);
  return limit;
}

/** Reset all claims for an outcome to its empty state (standardises once_globally → null). */
export function clearAllClaims(limit) {
  if (!limit) return limit;
  if (limit.type === 'once_per_player') limit.claimedBy = [];
  else if (limit.type === 'once_globally') limit.claimedBy = null;
  else if (limit.type === 'once_per_period') limit.claimedBy = {};
  return limit;
}

/**
 * Resolve userIds to display names. Cache-first; optionally fetch missing from the network.
 * Always returns a name for every id (falls back to "Player <last4>").
 * @param {object} guild - Discord.js Guild
 * @param {string[]} userIds
 * @param {{fetch?: boolean}} [opts]
 * @returns {Promise<Record<string,string>>}
 */
export async function resolveNames(guild, userIds, { fetch = false } = {}) {
  const names = {};
  const missing = [];

  for (const id of userIds) {
    const cached = guild?.members?.cache?.get(id);
    if (cached) names[id] = cached.displayName;
    else missing.push(id);
  }

  if (fetch && missing.length && typeof guild?.members?.fetch === 'function') {
    try {
      const fetched = await guild.members.fetch({ user: missing });
      if (fetched && typeof fetched.forEach === 'function') {
        fetched.forEach((m, id) => { names[id] = m.displayName; });
      }
    } catch {
      // ignore — fall through to fallback below
    }
  }

  for (const id of userIds) {
    if (!names[id]) names[id] = `Player ${String(id).slice(-4)}`;
  }
  return names;
}
