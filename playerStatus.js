/**
 * Player Status Engine — SKELETON (RaP 0905 §9).
 *
 * One registry-driven resolver for a player's status in a season. Today it implements ONLY the 3 Stage-0
 * application statuses that are functional (📝 New, ☑️ Application Complete, ✖️ Withdrawn). Every other
 * status (votes, casting, placement, in-game) is a structural placeholder with NO logic yet — we fill the
 * registry in procedurally, one row per feature, as each ships (see RaP 0905 §4 for the full target table).
 *
 * Additive: the legacy `deriveApplicationStatus` (castRankingManager.js) still powers today's `Status:` line.
 *
 * Pure module — NO top-level console.log (so tests can import it directly; see feedback_node_test_stdout).
 */

/**
 * The single source of truth for status rules. Ordered by precedence — the FIRST matching `test(signals)`
 * wins. Today only 3 rows are active; future rows get added here, never scattered across handlers.
 */
export const STATUS_REGISTRY = [
  { id: 'withdrawn', stage: 0, emoji: '✖️', label: 'Withdrawn',            test: (s) => s.withdrawn },
  { id: 'complete',  stage: 0, emoji: '☑️', label: 'Application Complete', test: (s) => !!s.completedAt },
  { id: 'new',       stage: 0, emoji: '📝', label: 'New',                  test: (s) => s.hasApplication },
  // ── FUTURE ROWS (RaP 0905 §4) — add ONE per feature as it ships. NO logic yet: ──
  //   Stage 0.5 votes:    Awaiting Votes / 🗳️ Scoring / ☑️ Reviewed
  //   Stage 1   casting:  🎬 Cast / 🔄 Alternate / ❓ Tentatively Cast / ❌ Not Cast
  //   Stage 2   response: 🎉 Accepted Placement / 🚫 Declined Placement
  //   Stage 3   in-game:  🟢 Active / 🏁 Voted out
  //   DO NOT implement these here yet — they need the parked design decisions (RaP 0905 §6 Open Qs).
];

/**
 * Build the Stage-0 signal object from an application record + its LIVE channel name.
 * Only Stage-0 signals are populated; future signals stay TODO comments (do NOT guess them).
 * @param {Object} [opts]
 * @param {Object} [opts.app] - the application record (playerData[guild].applications[channelId]), or null
 * @param {string} [opts.liveChannelName] - the channel's CURRENT name (carries the ✖️ withdrawn marker)
 * @returns {Object} signals
 */
export function buildStage0Signals({ app, liveChannelName = '' } = {}) {
  return {
    hasApplication: !!app,
    completedAt: app?.completedAt || null,    // ISO string, written app.js (reaching completion screen)
    withdrawn: /^✖️/.test(liveChannelName),    // channel-name only — there is NO data field for withdrawn
    // TODO (RaP 0905 §4) future signals — NOT resolved yet:
    //   castingStatus: app?.castingStatus, placementResponse: app?.placementResponse,
    //   voteCount: Object.keys(app?.rankings || {}).length, placement: …, activeInGame: …
  };
}

/**
 * Pure registry walk — first matching rule wins. Returns the resolved status (no application → 'none').
 * @param {Object} signals - from buildStage0Signals
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
  const signals = buildStage0Signals({ app, liveChannelName });
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
