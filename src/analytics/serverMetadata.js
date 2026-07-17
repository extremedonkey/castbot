/**
 * Server metadata analytics — guild name/owner/member-count snapshots stored in playerData.
 *
 * Split into a GATHER phase (Discord fetches, slow, lock-free) and an APPLY phase (pure
 * mutation of a freshly-loaded playerData inside withStorageLock). The old shape — load
 * playerData, await Discord across all ~180 guilds, save the stale snapshot — erased any
 * player write that landed during the loop (docs/incidents/05-LostMovementRace; the
 * Beau/THES 2026-07-17 incident: a map move committed 60s into startup was reverted by
 * this pass's save).
 */
import { loadPlayerData, savePlayerData, withStorageLock } from '../../storage.js';

/**
 * GATHER: build a guild's metadata snapshot. Discord fetches only — no playerData access,
 * so it is safe to run outside the storage lock for any number of guilds.
 */
export async function buildServerMetadata(guild) {
    let ownerInfo = null;
    try {
        const owner = await guild.members.fetch(guild.ownerId);
        ownerInfo = {
            username: owner.user.username,
            globalName: owner.user.globalName || owner.user.username,
            discriminator: owner.user.discriminator,
            tag: owner.user.tag
        };
    } catch (error) {
        // Silently fail - owner might not be in cache or accessible
        console.debug(`Could not fetch owner info for guild ${guild.id}`);
    }

    return {
        serverName: guild.name,
        icon: guild.iconURL(),
        ownerId: guild.ownerId,
        memberCount: guild.memberCount,
        description: guild.description || null,
        vanityURLCode: guild.vanityURLCode || null,
        preferredLocale: guild.preferredLocale,
        partnered: guild.partnered || false,
        verified: guild.verified || false,
        createdTimestamp: guild.createdTimestamp,
        lastUpdated: Date.now(),
        ...(ownerInfo && { ownerInfo }),
        analyticsVersion: '1.0' // For future analytics upgrades
    };
}

/**
 * APPLY: compare/assign a gathered snapshot into playerData. Pure mutation — no I/O —
 * so it belongs INSIDE a withStorageLock cycle against freshly-loaded data.
 * @returns {{updated: boolean, isNew: boolean}}
 */
export function applyServerMetadata(playerData, guildId, serverMetadata) {
    if (!playerData[guildId]) {
        // New server initialization
        playerData[guildId] = {
            ...serverMetadata,
            players: {},
            tribes: {},
            timezones: {},
            pronounRoleIDs: [],
            firstInstalled: Date.now(),
            installationMethod: 'command'
        };
        return { updated: true, isNew: true };
    }

    const existing = playerData[guildId];
    const hasChanges = existing.memberCount !== serverMetadata.memberCount ||
                       existing.serverName !== serverMetadata.serverName ||
                       existing.icon !== serverMetadata.icon;
    if (hasChanges) {
        playerData[guildId] = { ...existing, ...serverMetadata };
        return { updated: true, isNew: false };
    }
    return { updated: false, isNew: false };
}

/**
 * Startup pass: refresh metadata for every guild the client is in.
 * Discord fetches happen OUTSIDE the lock; the locked section is fresh-load → apply-all →
 * one save (milliseconds, not the minutes the guild loop takes).
 * Caller posts new-server announcements from the returned summary — Discord calls must
 * never run inside the lock.
 * @returns {{newServers: string[], updatedServers: string[], unchangedServers: string[],
 *            newGuilds: Array<{guild: import('discord.js').Guild, ownerInfo: Object|null}>}}
 */
export async function syncAllServerMetadata(client) {
    const gathered = [];
    for (const guild of client.guilds.cache.values()) {
        try {
            gathered.push({ guild, metadata: await buildServerMetadata(guild) });
        } catch (error) {
            console.debug(`serverMetadata: gather failed for ${guild.id}: ${error.message}`);
        }
    }

    const summary = { newServers: [], updatedServers: [], unchangedServers: [], newGuilds: [] };
    await withStorageLock(async () => {
        const playerData = await loadPlayerData();
        let changed = false;
        for (const { guild, metadata } of gathered) {
            const result = applyServerMetadata(playerData, guild.id, metadata);
            if (result.updated) changed = true;
            if (result.isNew) {
                summary.newServers.push(guild.name);
                summary.newGuilds.push({ guild, ownerInfo: metadata.ownerInfo || null });
            } else if (result.updated) {
                summary.updatedServers.push(guild.name);
            } else {
                summary.unchangedServers.push(guild.name);
            }
        }
        if (changed) await savePlayerData(playerData);
    });
    return summary;
}

/**
 * guildCreate path: single-guild gather → locked apply/save.
 * @returns {{updated: boolean, isNew: boolean, ownerInfo: Object|null}}
 */
export async function syncGuildMetadata(guild) {
    const metadata = await buildServerMetadata(guild);
    let result = { updated: false, isNew: false };
    await withStorageLock(async () => {
        const playerData = await loadPlayerData();
        result = applyServerMetadata(playerData, guild.id, metadata);
        if (result.updated) await savePlayerData(playerData);
    });
    return { ...result, ownerInfo: metadata.ownerInfo || null };
}
