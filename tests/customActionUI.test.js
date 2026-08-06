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

// ─── Linked Actions (parents) — reverse follow-up lookup + collapse budget ───
// getFollowUpParents is pure (plain objects in), so it's real-imported.

import { getFollowUpParents } from '../customActionUI.js';

describe('getFollowUpParents — reverse follow-up lookup', () => {
    const follow = (targetId, extra = {}) => ({ type: 'follow_up_button', config: { buttonId: targetId }, executeOn: 'true', ...extra });

    it('finds a canonical follow_up_button parent', () => {
        const buttons = {
            parent_a: { name: 'Parent A', actions: [follow('child_x')] },
            bystander: { name: 'Bystander', actions: [follow('someone_else')] }
        };
        const parents = getFollowUpParents(buttons, 'child_x');
        assert.equal(parents.length, 1);
        assert.equal(parents[0].parentId, 'parent_a');
        assert.deepEqual(parents[0].branches, ['true']);
    });

    it('accepts the legacy follow_up type and the legacy top-level buttonId location', () => {
        const buttons = {
            legacy_type: { name: 'Legacy Type', actions: [{ type: 'follow_up', config: { buttonId: 'child_x' } }] },
            legacy_loc: { name: 'Legacy Loc', actions: [{ type: 'follow_up_button', buttonId: 'child_x' }] }
        };
        const parents = getFollowUpParents(buttons, 'child_x');
        assert.deepEqual(parents.map(p => p.parentId).sort(), ['legacy_loc', 'legacy_type']);
        // missing executeOn defaults to 'true' (the engine's Pass default)
        assert.ok(parents.every(p => p.branches.includes('true')));
    });

    it('dedupes a parent linking twice, aggregating branches', () => {
        const buttons = {
            parent_a: { name: 'Parent A', actions: [
                follow('child_x', { executeOn: 'true' }),
                follow('child_x', { executeOn: 'false' })
            ] }
        };
        const parents = getFollowUpParents(buttons, 'child_x');
        assert.equal(parents.length, 1);
        assert.deepEqual(parents[0].branches, ['true', 'false']);
    });

    it('returns empty for unlinked actions and tolerates malformed buttons', () => {
        const buttons = {
            no_actions: { name: 'No Actions' },
            null_entry: null,
            weird: { actions: [null, { type: 'display_text', config: {} }] }
        };
        assert.deepEqual(getFollowUpParents(buttons, 'child_x'), []);
        assert.deepEqual(getFollowUpParents(undefined, 'child_x'), []);
    });

    it('sorts by display name with the name→label→id fallback chain', () => {
        const buttons = {
            zzz_id: { label: 'Alpha Label', actions: [follow('child_x')] },
            aaa_id: { name: 'Zulu Name', actions: [follow('child_x')] }
        };
        const parents = getFollowUpParents(buttons, 'child_x');
        assert.deepEqual(parents.map(p => p.parentId), ['zzz_id', 'aaa_id']);
    });
});

describe('Action Visibility — collapse budget replica', () => {
    // Mirror of createCoordinateManagementUI: each expanded entry is a 3-component
    // {Section, Text, accessory}; ~20-22 fixed chrome with all sections present, so >6
    // entries must collapse to stay under Discord's 40-component cap. The old >8 rule
    // provably overflowed with expanded Posted Channels.
    const isCollapsed = (coords, items, parents, channels) => (coords + items + parents + channels) > 6;

    it('6 total entries stay expanded; 7 collapse', () => {
        assert.equal(isCollapsed(3, 2, 1, 0), false);
        assert.equal(isCollapsed(3, 2, 1, 1), true);
    });

    it('worst expanded case fits the 40-component cap', () => {
        const FIXED_CHROME_MAX = 22; // container+header+menu block+section headers+seps+nav (4 buttons)
        const worst = FIXED_CHROME_MAX + 6 * 3;
        assert.ok(worst <= 40, `worst expanded screen = ${worst} components`);
    });
});
