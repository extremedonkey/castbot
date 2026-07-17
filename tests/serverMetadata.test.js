import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Replicates src/analytics/serverMetadata.js applyServerMetadata — the pure APPLY phase
// that runs inside withStorageLock against freshly-loaded playerData.
function applyServerMetadata(playerData, guildId, serverMetadata) {
    if (!playerData[guildId]) {
        playerData[guildId] = {
            ...serverMetadata,
            players: {},
            tribes: {},
            timezones: {},
            pronounRoleIDs: [],
            firstInstalled: 1,
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

const meta = (over = {}) => ({ serverName: 'Guild', icon: 'i.png', memberCount: 10, ownerId: '1', lastUpdated: 2, ...over });

describe('serverMetadata.applyServerMetadata (locked apply phase)', () => {
    it('initializes a brand-new guild with core structures', () => {
        const pd = {};
        const r = applyServerMetadata(pd, 'g1', meta());
        assert.deepEqual(r, { updated: true, isNew: true });
        assert.deepEqual(pd.g1.players, {});
        assert.deepEqual(pd.g1.pronounRoleIDs, []);
        assert.equal(pd.g1.serverName, 'Guild');
    });

    it('updates when name/icon/memberCount change, preserving existing data', () => {
        const pd = { g1: { ...meta(), players: { u1: { safari: {} } }, tribes: { r1: {} } } };
        const r = applyServerMetadata(pd, 'g1', meta({ memberCount: 11 }));
        assert.deepEqual(r, { updated: true, isNew: false });
        assert.equal(pd.g1.memberCount, 11);
        assert.ok(pd.g1.players.u1, 'player data preserved through metadata merge');
        assert.ok(pd.g1.tribes.r1, 'tribes preserved');
    });

    it('no-ops (updated: false) when nothing meaningful changed', () => {
        const pd = { g1: { ...meta(), players: {} } };
        const r = applyServerMetadata(pd, 'g1', meta({ lastUpdated: 99 }));
        assert.deepEqual(r, { updated: false, isNew: false });
        assert.equal(pd.g1.lastUpdated, 2, 'untouched when only lastUpdated differs');
    });
});
