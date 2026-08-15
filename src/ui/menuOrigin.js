/**
 * 🧭 Menu origin tracking — which surface did this admin launch features FROM?
 *
 * The CastBot Premium menu (menuBuilder.buildPremiumMenu) renders the SAME feature
 * buttons as the legacy Tools menu (Attributes, Archiver, Emoji Editor, Category Post,
 * Nuke/category screens…). Those features' screens all hard-code `castbot_tools` as
 * their back button, so a feature opened FROM Premium dumped the admin back in Tools
 * (reported by Reece 2026-08-16).
 *
 * Same pattern and same accepted limitation as `channelsOrigin`
 * (src/channels/channelsHandlers.js, ChannelAdministration.md §Return targets):
 * in-memory, keyed by userId, LAST RENDER WINS — rendering the Premium menu marks the
 * user as "in the premium world"; rendering the Tools menu or the Production Menu
 * clears it. The `castbot_tools` handler consults this and re-renders Premium instead
 * of Tools when the user came from Premium. Restart resets the map (worst case: one
 * back-click lands on Tools, exactly the old behaviour).
 *
 * Deliberately its own tiny module: imported by both menuBuilder.js and app.js without
 * dragging either's import graph into the other (and unit-testable in isolation).
 */

const origins = new Map(); // userId → 'premium'

/** Premium menu rendered — feature back-navigation should return here. */
export function setPremiumOrigin(userId) {
  if (userId) origins.set(String(userId), 'premium');
}

/** Tools/Production menu rendered — the user has left the premium world. */
export function clearPremiumOrigin(userId) {
  if (userId) origins.delete(String(userId));
}

/** Should a `castbot_tools` back-click land on the Premium menu instead? */
export function isFromPremium(userId) {
  return origins.get(String(userId)) === 'premium';
}

/** Test seam. */
export function __resetMenuOrigins() {
  origins.clear();
}
