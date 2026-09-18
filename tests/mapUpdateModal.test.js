/**
 * Map create/update modal (Image Uploads "download-source" archetype) —
 * modal builder branches + the custom_id field walk that replaced positional
 * parsing in the map_update_modal submit handler.
 * src/maps/mapUpdateModal.js is a pure module — direct import is safe.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildMapUpdateModal, buildSectionAddModal } from '../src/maps/mapUpdateModal.js';
import { collectModalFields, IMAGE_UPLOAD_COMPONENT_ID } from '../src/images/modalImageUpload.js';

function fieldById(modal, customId) {
    return modal.components.map(l => l.component).find(c => c.custom_id === customId);
}

describe('Map Update Modal — builder branches', () => {
    it('textUrl mode keeps a URL text input; upload mode swaps in a required File Upload', () => {
        const text = buildMapUpdateModal(false, null, 'textUrl');
        assert.equal(fieldById(text, 'map_url').type, 4);
        assert.equal(fieldById(text, IMAGE_UPLOAD_COMPONENT_ID), undefined);

        const upload = buildMapUpdateModal(false, null, 'uploadComponent');
        const fileUpload = fieldById(upload, IMAGE_UPLOAD_COMPONENT_ID);
        assert.equal(fileUpload.type, 19);
        assert.equal(fileUpload.required, true, 'a map build requires an image — no keep-current semantics');
        assert.equal(fileUpload.min_values, 1);
        assert.equal(fieldById(upload, 'map_url'), undefined);
    });

    it('defaults to textUrl when mode is omitted or garbage', () => {
        assert.equal(fieldById(buildMapUpdateModal(false, null), 'map_url').type, 4);
        assert.equal(fieldById(buildMapUpdateModal(false, null, 'junk'), 'map_url').type, 4);
    });

    it('create vs update: title, emoji field presence, dimension prefill', () => {
        const create = buildMapUpdateModal(false, null, 'textUrl');
        assert.equal(create.title, 'Upload New Safari Map');
        assert.equal(fieldById(create, 'map_emoji').value, '📍');
        assert.equal(fieldById(create, 'map_rows').value, '7');

        const update = buildMapUpdateModal(true, { gridWidth: 3, gridHeight: 5 }, 'uploadComponent');
        assert.equal(update.title, 'Update Map Image');
        assert.equal(fieldById(update, 'map_emoji'), undefined, 'updates keep existing emojis');
        assert.equal(fieldById(update, 'map_rows').value, '5');
        assert.equal(fieldById(update, 'map_columns').value, '3');
    });

    it('legacy gridSize fallback prefills both dimensions', () => {
        const modal = buildMapUpdateModal(true, { gridSize: 9 }, 'textUrl');
        assert.equal(fieldById(modal, 'map_rows').value, '9');
        assert.equal(fieldById(modal, 'map_columns').value, '9');
    });

    it('always emits Label wrappers (modern pattern), custom_id modal identity', () => {
        for (const mode of ['textUrl', 'uploadComponent']) {
            const modal = buildMapUpdateModal(false, null, mode);
            assert.equal(modal.custom_id, 'map_update_modal');
            assert.ok(modal.components.every(row => row.type === 18), `all rows are Labels (${mode})`);
            assert.ok(modal.components.length <= 5, 'within modal component cap');
        }
    });
});

describe('Map Update Modal — collectModalFields (replaces positional parsing)', () => {
    it('collects from Label-wrapped components', () => {
        const fields = collectModalFields([
            { type: 18, component: { type: 4, custom_id: 'map_url', value: ' https://cdn.discordapp.com/attachments/1/2/x.png ' } },
            { type: 18, component: { type: 4, custom_id: 'map_rows', value: '5' } },
            { type: 18, component: { type: 19, custom_id: IMAGE_UPLOAD_COMPONENT_ID, values: ['111'] } }
        ]);
        assert.equal(fields.map_url.trim(), 'https://cdn.discordapp.com/attachments/1/2/x.png');
        assert.equal(fields.map_rows, '5');
        assert.deepEqual(fields[IMAGE_UPLOAD_COMPONENT_ID], ['111']);
    });

    it('collects from legacy ActionRow-wrapped components (old modal submissions in flight)', () => {
        const fields = collectModalFields([
            { type: 1, components: [{ type: 4, custom_id: 'map_url', value: 'https://x' }] },
            { type: 1, components: [{ type: 4, custom_id: 'map_columns', value: '4' }] }
        ]);
        assert.equal(fields.map_url, 'https://x');
        assert.equal(fields.map_columns, '4');
    });

    it('tolerates empty/missing input and components without custom_id', () => {
        assert.deepEqual(collectModalFields([]), {});
        assert.deepEqual(collectModalFields(undefined), {});
        assert.deepEqual(collectModalFields([{ type: 10, content: 'hi' }]), {});
    });
});

// ── Replicated from app.js map_update_modal URL guard ──
// Pasted URLs must be cdn.discordapp.com/attachments; upload-derived URLs skip the
// prefix check because modal File Uploads resolve to /ephemeral-attachments/ (found
// the hard way on TEST 2026-07-20 — the unforked guard rejected every upload).
function mapUrlRejected(mapUrl, intentAction) {
    return !mapUrl || (intentAction !== 'upload' && !mapUrl.startsWith('https://cdn.discordapp.com/attachments/'));
}

describe('Map Update Modal — URL guard fork (pasted vs upload)', () => {
    it('pasted URLs still require the /attachments/ CDN prefix', () => {
        assert.equal(mapUrlRejected('https://cdn.discordapp.com/attachments/1/2/map.png', 'none'), false);
        assert.equal(mapUrlRejected('https://example.com/map.png', 'none'), true);
        assert.equal(mapUrlRejected('https://cdn.discordapp.com/ephemeral-attachments/1/2/map.png', 'none'), true,
            'a hand-pasted ephemeral URL is still rejected (it will dangle after the source interaction)');
    });

    it('upload-derived URLs pass despite the /ephemeral-attachments/ path', () => {
        assert.equal(mapUrlRejected('https://cdn.discordapp.com/ephemeral-attachments/1/2/DEVMap.png?ex=6a5f&is=6a5e&hm=d1d1', 'upload'), false);
        assert.equal(mapUrlRejected('https://cdn.discordapp.com/attachments/1/2/map.png', 'upload'), false);
    });

    it('a missing URL is rejected in either mode', () => {
        assert.equal(mapUrlRejected(undefined, 'upload'), true);
        assert.equal(mapUrlRejected('', 'none'), true);
    });
});

describe('Add Section Modal (RaP 0894 Phase 2) — builder contract', () => {
    const anchor = { name: 'Base Camp', colStart: 0, rowStart: 0, colEnd: 6, rowEnd: 6 };

    it('sits exactly AT the 5-component modal cap, all Labels, indexed custom_id', () => {
        for (const mode of ['textUrl', 'uploadComponent']) {
            const modal = buildSectionAddModal(2, anchor, mode);
            assert.equal(modal.custom_id, 'map_section_add_modal_2');
            assert.equal(modal.components.length, 5, 'the next field added breaks the modal');
            assert.ok(modal.components.every(row => row.type === 18));
            assert.ok(modal.title.length <= 45);
        }
    });

    it('placement Radio Group follows the ComponentsV2 gotchas (one default, no emoji, plain text)', () => {
        const radio = fieldById(buildSectionAddModal(0, anchor), 'section_direction');
        assert.equal(radio.type, 21);
        assert.equal(radio.options.filter(o => o.default === true).length, 1, 'exactly ONE default');
        assert.ok(radio.options.every(o => !('emoji' in o)), 'Radio Group options take NO emoji field');
        assert.ok(radio.options.every(o => o.default !== false), 'no explicit default:false (suppresses pre-selection)');
        assert.deepEqual(radio.options.map(o => o.value), ['right', 'below']);
        assert.ok(radio.options.every(o => /^[\x20-\x7E]+$/.test(o.label)), 'plain-text labels');
    });

    it('anchor name flows into placement labels; anonymous anchors fall back to Section N', () => {
        const named = fieldById(buildSectionAddModal(0, anchor), 'section_direction');
        assert.ok(named.options[0].label.includes('Base Camp'));
        const anon = fieldById(buildSectionAddModal(1, { name: null }), 'section_direction');
        assert.ok(anon.options[0].label.includes('Section 2'));
    });

    it('image field swaps by upload mode like the map modal (section_url vs File Upload)', () => {
        assert.equal(fieldById(buildSectionAddModal(0, anchor, 'textUrl'), 'section_url').type, 4);
        const upload = fieldById(buildSectionAddModal(0, anchor, 'uploadComponent'), IMAGE_UPLOAD_COMPONENT_ID);
        assert.equal(upload.type, 19);
        assert.equal(upload.required, true);
    });

    it('every Label/description respects Discord limits (45/100 chars)', () => {
        for (const mode of ['textUrl', 'uploadComponent']) {
            for (const row of buildSectionAddModal(3, anchor, mode).components) {
                assert.ok(row.label.length <= 45, row.label);
                if (row.description) assert.ok(row.description.length <= 100, row.description);
            }
        }
    });
});
