/**
 * Player Status Engine (RaP 0905 §9).
 *
 * One registry-driven resolver for a player's status in a season. Independent stored dimensions
 * (application lifecycle, admin casting decision, player placement response, withdrawal) are collapsed
 * to a SINGLE most-salient status by walking an ordered registry — FIRST matching `test(signals)` wins.
 *
 * Implemented today — the "committed" states, byte-matched to the legacy `Status:` line
 * (deriveApplicationStatus in castRankingManager.js) so ÜberStatus and that line agree exactly:
 *   ✖️ Withdrawn · 🎉 Accepted Placement · 🚫 Declined Placement · ✅ Cast · 🔄 Alternate · ❌ Not Cast
 *   · ☑️ Application Complete · 📝 New.
 *
 * Still deferred (parked judgment calls, RaP 0905 §4/§6) — they fall THROUGH to complete/new for now:
 *   ❓ Tentative, and the "still deciding" vote-progression cluster (☑️ Reviewed / 🗳️ Scoring / 📝 Awaiting
 *   Votes). Add each as ONE registry row (in its precedence slot) when its meaning is settled — never
 *   scatter status logic back into handlers.
 *
 * Additive: the legacy `deriveApplicationStatus` still powers today's `Status:` line; this engine only
 * drives the 🌈 ÜberStatus scaffold line until it's proven at parity and that line is retired.
 *
 * Pure module — NO top-level console.log (so tests can import it directly; see feedback_node_test_stdout).
 */

/**
 * The single source of truth for status rules. Ordered by precedence — the FIRST matching `test(signals)`
 * wins. This order mirrors deriveApplicationStatus (castRankingManager.js:122): withdrawn ▸ placement ▸
 * casting ▸ lifecycle — a recency/commitment gradient (latest/most-committing action is most salient).
 * `emoji`/`label` are kept byte-identical to that function's `icon`/`name` so the two lines can't disagree;
 * if you change one, change both.
 */
export const STATUS_REGISTRY = [
  // Stage 0 lifecycle override — the ✖️ channel marker is the latest lifecycle action, trumps everything.
  { id: 'withdrawn', stage: 0, emoji: '✖️', label: 'Withdrawn',            test: (s) => s.withdrawn },

  // Stage 2 placement response (the PLAYER committed) — outranks the admin's casting decision.
  { id: 'accepted',  stage: 2, emoji: '🎉', label: 'Accepted Placement',  test: (s) => s.placementResponse === 'accepted' },
  { id: 'declined',  stage: 2, emoji: '🚫', label: 'Declined Placement',  test: (s) => s.placementResponse === 'declined' },

  // Stage 1 casting decision (the ADMIN committed). Mutually exclusive — one `castingStatus` field, so the
  // order among these three is cosmetic; it only matters relative to the other stages.
  { id: 'cast',      stage: 1, emoji: '✅', label: 'Cast',                test: (s) => s.castingStatus === 'cast' },
  { id: 'alternate', stage: 1, emoji: '🔄', label: 'Alternate',           test: (s) => s.castingStatus === 'alternative' },
  // ❓ tentative (Stage 1) is DEFERRED — it slots HERE (between alternate and reject, mirroring
  //   deriveApplicationStatus) once its meaning is settled. Do NOT add a row until then.
  { id: 'reject',    stage: 1, emoji: '❌', label: 'Not Cast',            test: (s) => s.castingStatus === 'reject' },

  // Stage 0 lifecycle (the applicant's own journey) — the fall-through once no decision is set.
  { id: 'complete',  stage: 0, emoji: '☑️', label: 'Application Complete', test: (s) => !!s.completedAt },
  { id: 'new',       stage: 0, emoji: '📝', label: 'New',                  test: (s) => s.hasApplication },

  // ── STILL DEFERRED (RaP 0905 §4/§6) — the "Still Deciding" cluster; falls through to complete/new: ──
  //   Stage 0.5 votes: ☑️ Reviewed (≥2 votes) / 🗳️ Scoring (≥1 vote) / 📝 Awaiting Votes.
  //   These + ❓ Tentative are the parked judgment calls — implement one row each when decided.
];

/**
 * Build the signal object from an application record + its LIVE channel name. Populates every signal the
 * IMPLEMENTED rows read (lifecycle + casting + placement). Deferred rows' signals stay TODO comments.
 * @param {Object} [opts]
 * @param {Object} [opts.app] - the application record (playerData[guild].applications[channelId]), or null
 * @param {string} [opts.liveChannelName] - the channel's CURRENT name (carries the ✖️ withdrawn marker)
 * @returns {Object} signals
 */
export function buildStatusSignals({ app, liveChannelName = '' } = {}) {
  return {
    hasApplication: !!app,
    completedAt: app?.completedAt || null,             // ISO string, written when the completion screen is reached
    withdrawn: /^✖️/.test(liveChannelName),             // channel-name only — there is NO data field for withdrawn
    castingStatus: app?.castingStatus || null,         // admin draft: 'cast' | 'alternative' | 'reject' | 'tentative'
    placementResponse: app?.placementResponse || null, // player: 'accepted' | 'declined'
    // TODO (RaP 0905 §4) deferred vote signals — NOT resolved yet:
    //   voteCount: Object.keys(app?.rankings || {}).length,
  };
}

/**
 * Pure registry walk — first matching rule wins. Returns the resolved status (no application → 'none').
 * @param {Object} signals - from buildStatusSignals
 * @returns {{statusId:string, label:string, emoji:string, stage:(number|null), matched:(string|null)}}
 */
export function deriveStatus(signals = {}) {
  for (const rule of STATUS_REGISTRY) {
    if (rule.test(signals)) {
      return { statusId: rule.id, label: rule.label, emoji: rule.emoji, stage: rule.stage, matched: rule.id };
    }
  }
  return { statusId: 'none', label: 'No application', emoji: '—', stage: null, matched: null };
}

/**
 * Convenience for consumers that ALREADY hold the application + its live channel name (e.g. the Casting card).
 * Reflects exactly the app passed in — no lookup.
 * @param {Object} app - application record (or null)
 * @param {string} [liveChannelName]
 * @returns {Object} status result (deriveStatus shape) + the raw `signals` it saw
 */
export function getApplicationStatus(app, liveChannelName = '') {
  const signals = buildStatusSignals({ app, liveChannelName });
  return { ...deriveStatus(signals), signals };
}

/**
 * The frame's season-scoped public API (RaP 0905 §9). Sync — the caller passes already-loaded playerData
 * and the live guild. Finds the application via seasonId → configId[] → app(userId) (no existing helper
 * does this lookup — composed inline here). For consumers that have (seasonId, userId) but not the app.
 * @param {string} guildId
 * @param {string} seasonId - the canonical season id (applicationConfigs[configId].seasonId)
 * @param {string} userId
 * @param {Object} [opts] - { playerData, guild }
 * @returns {Object} status result (getApplicationStatus shape)
 */
export function getPlayerSeasonStatus(guildId, seasonId, userId, { playerData, guild } = {}) {
  const gd = playerData?.[guildId] || {};
  const configIds = Object.entries(gd.applicationConfigs || {})
    .filter(([, cfg]) => cfg.seasonId === seasonId)
    .map(([id]) => id);
  const app = Object.values(gd.applications || {})
    .find((a) => a.userId === userId && configIds.includes(a.configId)) || null;
  const liveChannelName = app ? (guild?.channels?.cache?.get(app.channelId)?.name || '') : '';
  return getApplicationStatus(app, liveChannelName);
}
