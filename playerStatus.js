/**
 * Player Status Engine (RaP 0905 §9).
 *
 * One registry-driven resolver for a player's status in a season. Independent stored dimensions
 * (application lifecycle, admin casting decision, player placement response, withdrawal) are collapsed
 * to a SINGLE most-salient status by walking an ordered registry — FIRST matching `test(signals)` wins.
 *
 * Implemented today — the "committed" casting/placement states, byte-matched to the legacy `Status:` line
 * (deriveApplicationStatus in castRankingManager.js) so ÜberStatus and that line agree exactly:
 *   ✖️ Withdrawn · 🎉 Accepted Placement · 🚫 Declined Placement · ✅ Cast · 🔄 Alternate · ❌ Not Cast
 *   · ☑️ Application Complete · 📝 New. (Tentative was removed — RaP 0902.)
 *
 * DELIBERATELY NOT a status row (Reece's call): "Undecided / Still Deciding" (castingStatus = null). It is
 * definitionally the same state as ☑️ Application Complete (submitted, no casting decision), so a submitted-
 * undecided app reads ☑️ Application Complete here; "Undecided" lives only as the Casting Status field + the
 * Marooning UNDECIDED group.
 *
 * Still deferred (RaP 0905 §4/§6) — falls THROUGH to complete/new for now: the vote-progression cluster
 *   (☑️ Reviewed / 🗳️ Scoring / 📝 Awaiting Votes). Add as ONE registry row when its meaning is settled.
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
  // order among these is cosmetic; it only matters relative to the other stages. (Tentative removed — RaP 0902:
  // any legacy castingStatus='tentative' no longer matches here and falls through to complete/new = Undecided.)
  { id: 'cast',      stage: 1, emoji: '✅', label: 'Cast',                test: (s) => s.castingStatus === 'cast' },
  { id: 'alternate', stage: 1, emoji: '🔄', label: 'Alternate',           test: (s) => s.castingStatus === 'alternative' },
  { id: 'reject',    stage: 1, emoji: '❌', label: 'Not Cast',            test: (s) => s.castingStatus === 'reject' },

  // Stage 0 lifecycle (the applicant's own journey) — the fall-through once no decision is set.
  // Complete fires on EITHER signal: the `completedAt` data field (written since 2026-06-27) OR the ☑️ live
  // channel emoji (the completion rename — reliable for the ~2 years of apps that predate completedAt, and
  // for which the stored channelName is stale). Mirrors how `withdrawn` reads the live ✖️ channel emoji.
  { id: 'complete',  stage: 0, emoji: '☑️', label: 'Application Complete', test: (s) => !!s.completedAt || s.submitted },
  { id: 'new',       stage: 0, emoji: '📝', label: 'New',                  test: (s) => s.hasApplication },

  // ── STILL DEFERRED (RaP 0905 §4/§6) — the vote-progression cluster; falls through to complete/new: ──
  //   Stage 0.5 votes: ☑️ Reviewed (≥2 votes) / 🗳️ Scoring (≥1 vote) / 📝 Awaiting Votes.
  //   NOT here on purpose: "Undecided" (castingStatus null) — Reece's call to leave it AS Application
  //   Complete rather than add a same-population row (see the module header).
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
    completedAt: app?.completedAt || null,             // ISO string, written when the completion screen is reached (since 2026-06-27)
    withdrawn: /^✖️/.test(liveChannelName),             // live channel emoji — there is NO data field for withdrawn
    submitted: /^☑/.test(liveChannelName),             // live channel ☑️ = submitted/complete. The reliable signal for
                                                       //   apps completed BEFORE completedAt shipped (the stored
                                                       //   channelName field is stale — not updated on the rename).
    castingStatus: app?.castingStatus || null,         // admin draft: 'cast' | 'alternative' | 'reject' (or null = undecided)
    offerStatus: app?.offerStatus || null,             // Stage 2 (RaP 0902): 'offer' | 'offer_alternative' | 'offer_rejected' — set when the invite is SENT
    placementResponse: app?.placementResponse || null, // player: 'accepted' | 'accepted_alternative' | 'declined'
    voteCount: Object.keys(app?.rankings || {}).length,
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

// ────────────────────────────────────────────────────────────────────────────────────────────────
// Casting Lifecycle Chevron (RaP 0902) — a one-line admin-facing progress bar (NOT applicant-facing).
// Five public-milestone segments: New App → App Submission → Casting Review → Casting Offer → Casting
// Accepted. The PRIVATE casting draft (Cast/Alt/Not-Cast, Stage 1) does NOT advance the chevron —
// only a SENT offer (offerStatus, Stage 2) does. Rendering rules (Reece's spec): the CURRENT segment ONLY
// gets an emoji, as a bold code-chip `**`🎥 Casting Review`**`; reached segments are plain; future segments
// are ||spoiler||; terminal-negative states (Not Cast / Declined / Withdrawn) render NO future (adaptive
// terminal). Separators: ▶ up to & including the current segment, ▷ into the spoilered future.
// ────────────────────────────────────────────────────────────────────────────────────────────────

const CHEVRON_LABELS = ['New App', 'App Submission', 'Casting Review', 'Casting Offer', 'Casting Accepted'];

/**
 * Resolve which chevron segment an application currently occupies, plus how the current segment displays.
 * @param {Object} signals - from buildStatusSignals
 * @returns {null | {withdrawn:true, completed:boolean} | {index:number, emoji:string, label:string, terminal:boolean}}
 */
export function resolveCastingChevron(signals = {}) {
  const { hasApplication, completedAt, submitted, withdrawn, voteCount = 0, offerStatus, placementResponse } = signals;
  if (!hasApplication) return null;
  const completed = !!completedAt || !!submitted;
  if (withdrawn) return { withdrawn: true, completed };
  // Stage 3 — placement response (the PLAYER answered; all terminal)
  if (placementResponse === 'accepted')             return { index: 4, emoji: '🎉', label: 'Casting Accepted',    terminal: true };
  if (placementResponse === 'accepted_alternative') return { index: 4, emoji: '✅', label: 'Accepted (Alternate)', terminal: true };
  if (placementResponse === 'declined')             return { index: 4, emoji: '🚫', label: 'Casting Declined',    terminal: true };
  // Stage 2 — offer sent (the ADMIN messaged them); offer_rejected is terminal
  if (offerStatus === 'offer')             return { index: 3, emoji: '🦸', label: 'Casting Offer',   terminal: false };
  if (offerStatus === 'offer_alternative') return { index: 3, emoji: '🕵️', label: 'Alternate Offer', terminal: false };
  if (offerStatus === 'offer_rejected')    return { index: 3, emoji: '🙅', label: 'Not Cast',        terminal: true };
  // Stage 0.5 — under review (has ≥1 vote)
  if (voteCount >= 1) return { index: 2, emoji: '🎥', label: 'Casting Review', terminal: false };
  // Stage 0 — lifecycle
  if (completed) return { index: 1, emoji: '☑️', label: 'App Submission', terminal: false };
  return { index: 0, emoji: '📝', label: 'New App', terminal: false };
}

/**
 * Render a resolved chevron to a single `-# …` subtext line. Returns '' when there's no application.
 * @param {Object|null} resolved - from resolveCastingChevron
 * @returns {string}
 */
export function renderCastingChevron(resolved) {
  if (!resolved) return '';
  if (resolved.withdrawn) {
    const past = resolved.completed ? [CHEVRON_LABELS[0], CHEVRON_LABELS[1]] : [CHEVRON_LABELS[0]];
    return `-# ${past.join(' ▶ ')} ▶ **\`✖️ Withdrawn\`**`;
  }
  const { index, emoji, label, terminal } = resolved;
  let out = '';
  for (let i = 0; i < CHEVRON_LABELS.length; i++) {
    if (i > index && terminal) break; // adaptive terminal — drop the unreachable future
    let seg;
    if (i === index) seg = `**\`${emoji} ${label}\`**`;
    else if (i < index) seg = CHEVRON_LABELS[i];
    else seg = `||${CHEVRON_LABELS[i]}||`;
    out += i === 0 ? seg : ` ${i <= index ? '▶' : '▷'} ${seg}`;
  }
  return `-# ${out}`;
}

/**
 * Convenience: application record + live channel name → rendered chevron line (or '').
 * @param {Object} app - application record (or null)
 * @param {string} [liveChannelName]
 * @returns {string}
 */
export function getCastingChevron(app, liveChannelName = '') {
  return renderCastingChevron(resolveCastingChevron(buildStatusSignals({ app, liveChannelName })));
}
