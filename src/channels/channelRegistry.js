/**
 * Channel Administration — playerData persistence.
 *
 * The registry is an OPTIMISATION + rename ledger, never the source of truth: channel
 * identity always reconciles against live Discord (channelOps.ensureChannel adopts by name
 * when a registry entry is missing). That's what makes an interrupted run recoverable
 * without a resume state machine — re-running the action IS the resume.
 *
 * Locking: withStorageLock forbids network calls inside fn and is NOT re-entrant. So a bulk
 * run creates channels OUTSIDE the lock and flushes buffered deltas between batches via a
 * short lock that does load → mutate → save and nothing else.
 *
 * Delta shapes (see applyDeltas):
 *   { kind: 'confessional'|'subs', configId, userId, channelId, name, categoryId?, convertedFrom? }
 *   { kind: 'oneonone', pairKey, channelId, name, a, b, tribeRoleId }
 *   { kind: 'category', bucket: 'confessional'|'subs'|'oneonone', configId?, categoryId }
 *   { kind: 'playerRole', userId, roleId }            // roleId null clears a dead role
 *   { kind: 'trustedSpectator', roleId }
 *   { kind: 'appConvert', channelId, completedAt?, preConvertChannelName?, convertedToSubsAt? }
 *   { kind: 'remove', bucket: 'confessional'|'subs'|'oneonone', configId?, key }
 *   { kind: 'lastRun', configId, action, summary }
 */
import { loadPlayerData, savePlayerData, withStorageLock } from '../../storage.js';

/** @returns {Object} the guild's channelAdmin node, creating the scaffold if absent. */
function ensureNode(playerData, guildId) {
  const g = (playerData[guildId] ||= {});
  const node = (g.channelAdmin ||= { version: 1 });
  node.oneOnOnes ||= {};
  node.oneOnOneCategories ||= [];
  return node;
}

function ensureSeason(node, configId) {
  const s = (node[configId] ||= {});
  s.confessionals ||= {};
  s.subs ||= {};
  s.categories ||= {};
  s.lastRun ||= {};
  return s;
}

/**
 * PURE mutator over an already-loaded playerData document. Exported for unit testing and so
 * callers who already own a load/save cycle can reuse it without taking the lock twice.
 *
 * Idempotent: applying the same deltas twice yields the same document.
 *
 * @param {Object} playerData
 * @param {string} guildId
 * @param {Array<Object>} deltas
 * @returns {number} count applied
 */
export function applyDeltas(playerData, guildId, deltas) {
  if (!playerData || !guildId || !deltas?.length) return 0;
  const node = ensureNode(playerData, guildId);
  let applied = 0;

  for (const d of deltas) {
    if (!d?.kind) continue;

    switch (d.kind) {
      case 'confessional':
      case 'subs': {
        const bucket = d.kind === 'subs' ? 'subs' : 'confessionals';
        const season = ensureSeason(node, d.configId);
        season[bucket][d.userId] = {
          ...(season[bucket][d.userId] || {}),
          channelId: d.channelId,
          name: d.name,
          ...(d.categoryId ? { categoryId: d.categoryId } : {}),
          ...(d.convertedFrom ? { convertedFrom: d.convertedFrom } : {}),
          createdAt: season[bucket][d.userId]?.createdAt || d.at || new Date().toISOString()
        };
        applied++;
        break;
      }

      case 'oneonone': {
        // Keyed GLOBALLY by pairKey, not nested under tribeRoleId — the same pair appearing in
        // two tribes after a swap must ADOPT the existing channel, not create a duplicate.
        node.oneOnOnes[d.pairKey] = {
          ...(node.oneOnOnes[d.pairKey] || {}),
          channelId: d.channelId,
          name: d.name,
          a: d.a,
          b: d.b,
          tribeRoleId: d.tribeRoleId,
          createdAt: node.oneOnOnes[d.pairKey]?.createdAt || d.at || new Date().toISOString()
        };
        applied++;
        break;
      }

      case 'category': {
        if (d.bucket === 'oneonone') {
          if (!node.oneOnOneCategories.includes(d.categoryId)) node.oneOnOneCategories.push(d.categoryId);
        } else {
          const season = ensureSeason(node, d.configId);
          const list = (season.categories[d.bucket] ||= []);
          if (!list.includes(d.categoryId)) list.push(d.categoryId);
        }
        applied++;
        break;
      }

      case 'playerRole': {
        const players = ((playerData[guildId].players ||= {}));
        const p = (players[d.userId] ||= {});
        if (d.roleId) p.playerRoleId = d.roleId;
        else delete p.playerRoleId; // the role was deleted in Discord — stop referencing it
        applied++;
        break;
      }

      case 'trustedSpectator': {
        const perms = (playerData[guildId].permissions ||= {});
        if (d.roleId) perms.trustedSpectatorRoleId = d.roleId;
        else delete perms.trustedSpectatorRoleId;
        applied++;
        break;
      }

      case 'appConvert': {
        // Preserves the status signals that a channel rename would otherwise destroy — see
        // channelRoster/subsManager and docs/03-features/ChannelAdministration.md (F2).
        const app = playerData[guildId]?.applications?.[d.channelId];
        if (!app) break;
        if (d.completedAt && !app.completedAt) app.completedAt = d.completedAt;
        if (d.preConvertChannelName && !app.preConvertChannelName) app.preConvertChannelName = d.preConvertChannelName;
        if (d.convertedToSubsAt) app.convertedToSubsAt = d.convertedToSubsAt;
        applied++;
        break;
      }

      case 'remove': {
        if (d.bucket === 'oneonone') {
          delete node.oneOnOnes[d.key];
        } else {
          const season = ensureSeason(node, d.configId);
          const bucket = d.bucket === 'subs' ? 'subs' : 'confessionals';
          delete season[bucket][d.key];
        }
        applied++;
        break;
      }

      case 'lastRun': {
        const season = ensureSeason(node, d.configId);
        season.lastRun[d.action] = d.summary;
        applied++;
        break;
      }

      default:
        break;
    }
  }

  return applied;
}

/**
 * Flush buffered deltas under the storage lock.
 *
 * MUST be called BETWEEN Discord batches, never during one: everything inside the lock is
 * CPU/file work only, and loadPlayerData happens INSIDE fn (a snapshot taken earlier would
 * defeat the lock).
 *
 * @param {string} guildId
 * @param {Array<Object>} deltas
 * @returns {Promise<number>} count applied
 */
export async function flushDeltas(guildId, deltas) {
  if (!deltas?.length) return 0;
  let applied = 0;
  await withStorageLock(async () => {
    const playerData = await loadPlayerData();
    applied = applyDeltas(playerData, guildId, deltas);
    await savePlayerData(playerData);
  });
  return applied;
}

/**
 * A buffer that survives a failed flush: on error the caller re-pushes and the next flush
 * retries. Worst case the final flush catches everything — and even total registry loss is
 * recoverable because ensureChannel adopts by name.
 * @returns {{push: Function, size: Function, drain: Function}}
 */
export function makeDeltaBuffer() {
  let buf = [];
  return {
    push: (...deltas) => buf.push(...deltas.filter(Boolean)),
    size: () => buf.length,
    drain: () => {
      const out = buf;
      buf = [];
      return out;
    }
  };
}

/** Read-only view of the guild's channel-admin registry for a season. No lock needed. */
export async function readRegistry(guildId, configId) {
  const playerData = await loadPlayerData();
  const node = playerData[guildId]?.channelAdmin || {};
  const season = (configId && node[configId]) || {};
  return {
    confessionals: season.confessionals || {},
    subs: season.subs || {},
    categories: season.categories || {},
    lastRun: season.lastRun || {},
    oneOnOnes: node.oneOnOnes || {},
    oneOnOneCategories: node.oneOnOneCategories || [],
    trustedSpectatorRoleId: playerData[guildId]?.permissions?.trustedSpectatorRoleId || null,
    players: playerData[guildId]?.players || {}
  };
}
