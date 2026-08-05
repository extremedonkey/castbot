/**
 * General settings (Settings → General) — Image Uploads mode.
 * Pure functions imported directly: src/settings/generalSettings.js keeps all
 * heavy imports (storage, safariConfigUI) dynamic so this is safe.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    IMAGE_UPLOAD_MODES,
    normalizeImageUploadMode,
    buildGeneralSettingsModal,
    parseGeneralSettingsSubmit
} from '../src/settings/generalSettings.js';

describe('General Settings — normalizeImageUploadMode', () => {
    // Default flipped to uploadComponent on 2026-07-26: new servers and guilds that
    // never made an explicit choice get native uploads; explicit textUrl is preserved.
    it('defaults null/undefined/unknown to uploadComponent', () => {
        assert.equal(normalizeImageUploadMode(null), 'uploadComponent');
        assert.equal(normalizeImageUploadMode(undefined), 'uploadComponent');
        assert.equal(normalizeImageUploadMode(''), 'uploadComponent');
        assert.equal(normalizeImageUploadMode('garbage'), 'uploadComponent');
        assert.equal(normalizeImageUploadMode(42), 'uploadComponent');
    });

    it('passes through the two valid modes (explicit textUrl choices are kept)', () => {
        assert.equal(normalizeImageUploadMode('textUrl'), IMAGE_UPLOAD_MODES.TEXT_URL);
        assert.equal(normalizeImageUploadMode('uploadComponent'), IMAGE_UPLOAD_MODES.UPLOAD_COMPONENT);
    });
});

describe('General Settings — buildGeneralSettingsModal', () => {
    function radioOptions(modal) {
        const label = modal.components.find(c => c.type === 18);
        assert.ok(label, 'modal has a Label component');
        assert.equal(label.component.type, 21, 'Label wraps a Radio Group (String Select default is ignored in modals)');
        return label.component.options;
    }

    it('has the expected identities', () => {
        const modal = buildGeneralSettingsModal('textUrl');
        // Nonce suffix defeats Discord's cross-server modal draft cache (2026-08-05):
        // the id must keep the stable prefix (submit routes on startsWith) + trailing digits.
        assert.match(modal.custom_id, /^castbot_general_modal_\d+$/);
        const label = modal.components.find(c => c.type === 18);
        assert.equal(label.component.custom_id, 'image_upload_mode');
        assert.deepEqual(label.component.options.map(o => o.value), ['textUrl', 'uploadComponent']);
    });

    it('pre-selects Upload Component when unset/uploadComponent/garbage (the default)', () => {
        for (const mode of [null, undefined, 'uploadComponent', 'garbage']) {
            const options = radioOptions(buildGeneralSettingsModal(mode));
            assert.equal(options[1].default, true, `Upload Component default for mode=${mode}`);
            assert.ok(!('default' in options[0]), `Paste URL option carries NO default key for mode=${mode}`);
        }
    });

    it('pre-selects Paste URL only when explicitly set', () => {
        const options = radioOptions(buildGeneralSettingsModal('textUrl'));
        assert.equal(options[0].default, true);
        assert.ok(!('default' in options[1]), 'Upload option carries NO default key');
    });

    it('never emits an explicit default:false (suppresses whole-group pre-selection)', () => {
        for (const mode of ['textUrl', 'uploadComponent', null]) {
            for (const option of radioOptions(buildGeneralSettingsModal(mode))) {
                assert.notEqual(option.default, false, `option ${option.value} must not carry default:false`);
            }
        }
    });

    it('always has exactly ONE defaulted option', () => {
        for (const mode of ['textUrl', 'uploadComponent', null, 'junk']) {
            const defaulted = radioOptions(buildGeneralSettingsModal(mode)).filter(o => o.default === true);
            assert.equal(defaulted.length, 1, `mode=${mode}`);
        }
    });
});

describe('General Settings — parseGeneralSettingsSubmit', () => {
    it('reads a Label-wrapped Radio Group value', () => {
        const components = [
            { type: 18, component: { type: 21, custom_id: 'image_upload_mode', value: 'uploadComponent' } }
        ];
        assert.equal(parseGeneralSettingsSubmit(components), 'uploadComponent');
    });

    it('accepts a values[] array form too', () => {
        const components = [
            { type: 18, component: { type: 21, custom_id: 'image_upload_mode', values: ['textUrl'] } }
        ];
        assert.equal(parseGeneralSettingsSubmit(components), 'textUrl');
    });

    it('falls back to the default (uploadComponent) on missing field, empty submit, or garbage value', () => {
        assert.equal(parseGeneralSettingsSubmit([]), 'uploadComponent');
        assert.equal(parseGeneralSettingsSubmit(undefined), 'uploadComponent');
        assert.equal(parseGeneralSettingsSubmit([
            { type: 18, component: { type: 21, custom_id: 'image_upload_mode', value: 'nonsense' } }
        ]), 'uploadComponent');
        assert.equal(parseGeneralSettingsSubmit([
            { type: 18, component: { type: 21, custom_id: 'other_field', value: 'textUrl' } }
        ]), 'uploadComponent');
    });
});
