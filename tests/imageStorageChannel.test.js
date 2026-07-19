/**
 * Image storage channel (#🗺️castbot-images) — name matching & cache lookup.
 * The module keeps discord.js/roleAccessUtils imports dynamic, so the pure parts
 * import cleanly here. Guild is faked with an array-backed channel cache (.find).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    IMAGE_STORAGE_CHANNEL_NAME,
    LEGACY_IMAGE_STORAGE_CHANNEL_NAMES,
    IMAGE_STORAGE_CHANNEL_BANNER,
    isImageStorageChannelName,
    findImageStorageChannel
} from '../src/images/imageStorageChannel.js';

function fakeGuild(channels) {
    return { channels: { cache: channels } }; // arrays provide .find like a Collection
}

describe('Image Storage Channel — name predicate', () => {
    it('matches the current name and both legacy names', () => {
        assert.equal(isImageStorageChannelName(IMAGE_STORAGE_CHANNEL_NAME), true);
        for (const legacy of LEGACY_IMAGE_STORAGE_CHANNEL_NAMES) {
            assert.equal(isImageStorageChannelName(legacy), true, legacy);
        }
        assert.equal(isImageStorageChannelName('🗺️map-storage'), true);
        assert.equal(isImageStorageChannelName('map-storage'), true);
    });

    it('rejects unrelated names, null, and near-misses', () => {
        assert.equal(isImageStorageChannelName('general'), false);
        assert.equal(isImageStorageChannelName('castbot-images'), false); // missing 🗺️ prefix
        assert.equal(isImageStorageChannelName('safari-storage'), false); // only via extraNames
        assert.equal(isImageStorageChannelName(null), false);
        assert.equal(isImageStorageChannelName(''), false);
    });

    it('accepts extraNames only when supplied (safariImportExport audit trail)', () => {
        assert.equal(isImageStorageChannelName('safari-storage', { extraNames: ['safari-storage'] }), true);
    });
});

describe('Image Storage Channel — cache lookup', () => {
    it('finds by current name, text channels only', () => {
        const target = { name: IMAGE_STORAGE_CHANNEL_NAME, type: 0 };
        const guild = fakeGuild([
            { name: 'general', type: 0 },
            { name: IMAGE_STORAGE_CHANNEL_NAME, type: 2 }, // voice channel decoy
            target
        ]);
        assert.equal(findImageStorageChannel(guild), target);
    });

    it('finds legacy-named channels', () => {
        const legacy = { name: '🗺️map-storage', type: 0 };
        assert.equal(findImageStorageChannel(fakeGuild([legacy])), legacy);
        const bare = { name: 'map-storage', type: 0 };
        assert.equal(findImageStorageChannel(fakeGuild([bare])), bare);
    });

    it('prefers an exact new-name match when a legacy channel also exists', () => {
        const legacy = { name: '🗺️map-storage', type: 0 };
        const renamed = { name: IMAGE_STORAGE_CHANNEL_NAME, type: 0 };
        assert.equal(findImageStorageChannel(fakeGuild([legacy, renamed])), renamed);
    });

    it('returns null when nothing matches', () => {
        assert.equal(findImageStorageChannel(fakeGuild([{ name: 'general', type: 0 }])), null);
        assert.equal(findImageStorageChannel(fakeGuild([])), null);
    });

    it('honors extraNames for find-only callers', () => {
        const old = { name: 'safari-storage', type: 0 };
        assert.equal(findImageStorageChannel(fakeGuild([old])), null);
        assert.equal(findImageStorageChannel(fakeGuild([old]), { extraNames: ['safari-storage'] }), old);
    });
});

describe('Image Storage Channel — banner', () => {
    it('is loud and explains the stakes', () => {
        assert.match(IMAGE_STORAGE_CHANNEL_BANNER, /DO NOT DELETE/);
        assert.match(IMAGE_STORAGE_CHANNEL_BANNER, /🚨/);
        assert.match(IMAGE_STORAGE_CHANNEL_BANNER, /permanently break/);
    });
});
