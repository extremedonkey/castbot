/**
 * Custom Action UI — Display Text modal builder (image-upload migration).
 * buildDisplayTextModal is the single modal for create + edit (safari_display_text_edit_*
 * and the delegated safari_add_action_*_display_text path). The image field must honor
 * the guild's imageUploadMode: paste-URL text input vs File Upload (type 19).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDisplayTextModal } from '../customActionUI.js';
import { IMAGE_UPLOAD_COMPONENT_ID } from '../src/images/modalImageUpload.js';

const ACTION = {
    type: 'display_text',
    config: {
        title: 'Welcome',
        content: 'Hello there',
        color: '#3498db',
        image: 'https://cdn.discordapp.com/attachments/1/2/beach.png'
    }
};

function fieldById(modal, customId) {
    return modal.data.components.find(l => l.component?.custom_id === customId);
}

describe('Display Text Modal — text mode (paste URL, default)', () => {
    it('builds the 4-Label edit modal with prefills and the save custom_id', () => {
        const modal = buildDisplayTextModal('btn_123', 2, ACTION, 'textUrl');
        assert.equal(modal.type, 9);
        assert.equal(modal.data.custom_id, 'safari_display_text_save_btn_123_2');
        assert.equal(modal.data.title, 'Edit Text Display Action');
        assert.equal(modal.data.components.length, 4);
        assert.ok(modal.data.components.every(l => l.type === 18));

        assert.equal(fieldById(modal, 'action_title').component.value, 'Welcome');
        assert.equal(fieldById(modal, 'action_content').component.value, 'Hello there');
        assert.equal(fieldById(modal, 'action_color').component.value, '#3498db');

        const image = fieldById(modal, 'action_image');
        assert.equal(image.component.type, 4);
        assert.equal(image.component.value, ACTION.config.image);
        assert.equal(image.component.required, false);
        assert.equal(image.component.max_length, 500);
    });

    it('null action = create modal with empty fields', () => {
        const modal = buildDisplayTextModal('btn_9', 0, null, 'textUrl');
        assert.equal(modal.data.title, 'Create Text Display Action');
        assert.ok(!('value' in fieldById(modal, 'action_image').component));
    });

    it('falls back to legacy flat action fields (action.image, not config.image)', () => {
        const legacy = { type: 'display_text', title: 'T', content: 'C', image: 'https://x/y.png' };
        const modal = buildDisplayTextModal('b', 1, legacy, 'textUrl');
        assert.equal(fieldById(modal, 'action_image').component.value, 'https://x/y.png');
    });
});

describe('Display Text Modal — upload mode', () => {
    it('swaps the image field for a File Upload with a Current: description', () => {
        const modal = buildDisplayTextModal('btn_123', 2, ACTION, 'uploadComponent');
        assert.equal(modal.data.components.length, 4);
        const upload = modal.data.components.find(l => l.component?.type === 19);
        assert.ok(upload, 'expected a File Upload label');
        assert.equal(upload.component.custom_id, IMAGE_UPLOAD_COMPONENT_ID);
        assert.equal(upload.component.min_values, 0);
        assert.equal(upload.component.required, false);
        assert.match(upload.description, /Current: beach\.png — uploading replaces it\./);
        // Non-image fields keep their text inputs
        assert.equal(fieldById(modal, 'action_title').component.type, 4);
        assert.equal(fieldById(modal, 'action_content').component.type, 4);
        assert.equal(fieldById(modal, 'action_color').component.type, 4);
    });

    it('no stored image = empty-state upload description, no text image input anywhere', () => {
        const modal = buildDisplayTextModal('b', 0, null, 'uploadComponent');
        const upload = modal.data.components.find(l => l.component?.type === 19);
        assert.match(upload.description, /Upload an image/);
        assert.equal(fieldById(modal, 'action_image'), undefined);
    });
});
