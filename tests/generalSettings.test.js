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
    it('defaults null/undefined/unknown to textUrl', () => {
        assert.equal(normalizeImageUploadMode(null), 'textUrl');
        assert.equal(normalizeImageUploadMode(undefined), 'textUrl');
        assert.equal(normalizeImageUploadMode(''), 'textUrl');
        assert.equal(normalizeImageUploadMode('garbage'), 'textUrl');
        assert.equal(normalizeImageUploadMode(42), 'textUrl');
    });

    it('passes through the two valid modes', () => {
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
        assert.equal(modal.custom_id, 'castbot_general_modal');
        const label = modal.components.find(c => c.type === 18);
        assert.equal(label.component.custom_id, 'image_upload_mode');
        assert.deepEqual(label.component.options.map(o => o.value), ['textUrl', 'uploadComponent']);
    });

    it('pre-selects Paste URL when unset/textUrl/garbage', () => {
        for (const mode of [null, undefined, 'textUrl', 'garbage']) {
            const options = radioOptions(buildGeneralSettingsModal(mode));
            assert.equal(options[0].default, true, `Paste URL default for mode=${mode}`);
            assert.ok(!('default' in options[1]), `Upload option carries NO default key for mode=${mode}`);
        }
    });

    it('pre-selects Upload Component when set', () => {
        const options = radioOptions(buildGeneralSettingsModal('uploadComponent'));
        assert.equal(options[1].default, true);
        assert.ok(!('default' in options[0]), 'Paste URL option carries NO default key');
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

    it('falls back to textUrl on missing field, empty submit, or garbage value', () => {
        assert.equal(parseGeneralSettingsSubmit([]), 'textUrl');
        assert.equal(parseGeneralSettingsSubmit(undefined), 'textUrl');
        assert.equal(parseGeneralSettingsSubmit([
            { type: 18, component: { type: 21, custom_id: 'image_upload_mode', value: 'nonsense' } }
        ]), 'textUrl');
        assert.equal(parseGeneralSettingsSubmit([
            { type: 18, component: { type: 21, custom_id: 'other_field', value: 'uploadComponent' } }
        ]), 'textUrl');
    });
});
