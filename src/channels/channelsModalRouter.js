/**
 * Channel Administration — maps the 5 action buttons to their modals.
 *
 * Split out so app.js stays a router: one thin block there delegates every
 * `channels_{action}_{configId}` button here.
 */
import { loadPlayerData } from '../../storage.js';
import {
  buildRolesModal, buildPlayerRolesModal, buildConfessionalsModal, buildSubsModal, buildOneOnOnesModal
} from './channelsView.js';

/**
 * @param {Object} p - { customId, guildId, client }
 * @returns {Promise<Object>} a full { type: 9, data } MODAL response — the shape
 *   ButtonHandlerFactory detects (it checks `result.type === 9`); returning bare modal data
 *   would be sent as a normal message and fail.
 */
export async function buildChannelsModal({ customId, guildId, client }) {
  const modal = (data) => ({ type: 9, data });
  const parsed = customId.match(/^channels_(roles|playerroles|confessionals|subs|1on1s)_(.+)$/);
  const kind = parsed?.[1];
  const configId = parsed?.[2];

  if (!kind || !configId) throw new Error(`buildChannelsModal: unparseable custom_id '${customId}'`);

  if (kind === 'roles') {
    const playerData = await loadPlayerData();
    const currentRoleId = playerData[guildId]?.permissions?.trustedSpectatorRoleId || null;
    let currentRoleName = null;
    if (currentRoleId) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      currentRoleName = guild?.roles.cache.get(currentRoleId)?.name
        || (await guild?.roles.fetch(currentRoleId).catch(() => null))?.name
        || null;
    }
    return modal(buildRolesModal({ configId, currentRoleId, currentRoleName }));
  }

  if (kind === 'playerroles') return modal(buildPlayerRolesModal({ configId }));
  if (kind === 'confessionals') return modal(buildConfessionalsModal({ configId }));
  if (kind === 'subs') return modal(buildSubsModal({ configId }));

  // 1on1s — pre-fill the tribes of the default castlist. default_values is unreliable in modals,
  // so the tribe names also go in the Label description.
  const { getDefaultCastlistTribeRoleIds } = await import('./channelRoster.js');
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const tribeRoleIds = await getDefaultCastlistTribeRoleIds(guildId, client).catch(() => []);
  const tribeNames = tribeRoleIds
    .map((id) => guild?.roles.cache.get(id)?.name)
    .filter(Boolean)
    .join(', ');
  return modal(buildOneOnOnesModal({ configId, defaultTribeRoleIds: tribeRoleIds, tribeNames }));
}
