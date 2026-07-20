/**
 * Modal image upload (File Upload type 19) — intent extraction, validation,
 * and the shared contextual-filename helpers. All pure, imported directly.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    IMAGE_UPLOAD_COMPONENT_ID,
    MAX_UPLOAD_IMAGE_BYTES,
    findModalComponentByType,
    extractImageUploadIntent,
    validateImageAttachment,
    buildImageStorageFilename,
    buildImageFieldLabel,
    filenameFromImageUrl,
    resolveUploadedImageField
} from '../src/images/modalImageUpload.js';

const ATTACHMENT = {
    id: '111111111111111111',
    filename: 'holiday photo.PNG',
    size: 48291,
    content_type: 'image/png',
    url: 'https://cdn.discordapp.com/attachments/1/2/holiday_photo.png'
};

function uploadSubmit(values) {
    return [
        { type: 18, component: { type: 4, custom_id: 'title', value: 'A2' } },
        { type: 18, component: { type: 19, custom_id: IMAGE_UPLOAD_COMPONENT_ID, values } }
    ];
}

describe('Modal Image Upload — findModalComponentByType', () => {
    it('finds Label-wrapped, ActionRow-wrapped, and top-level components', () => {
        const labelWrapped = [{ type: 18, component: { type: 19, custom_id: 'x' } }];
        assert.equal(findModalComponentByType(labelWrapped, 19).custom_id, 'x');
        const actionRow = [{ type: 1, components: [{ type: 4, custom_id: 'y' }] }];
        assert.equal(findModalComponentByType(actionRow, 4).custom_id, 'y');
        const topLevel = [{ type: 10, content: 'hi' }];
        assert.equal(findModalComponentByType(topLevel, 10).content, 'hi');
    });

    it('returns null when absent or components are missing', () => {
        assert.equal(findModalComponentByType([], 19), null);
        assert.equal(findModalComponentByType(undefined, 19), null);
        assert.equal(findModalComponentByType([{ type: 18, component: { type: 4 } }], 19), null);
    });
});

describe('Modal Image Upload — extractImageUploadIntent', () => {
    it('resolves an uploaded attachment through resolved.attachments', () => {
        const intent = extractImageUploadIntent(uploadSubmit([ATTACHMENT.id]), { [ATTACHMENT.id]: ATTACHMENT });
        assert.equal(intent.action, 'upload');
        assert.equal(intent.attachment, ATTACHMENT);
    });

    it('0 files uploaded = keep current image (action none)', () => {
        assert.deepEqual(extractImageUploadIntent(uploadSubmit([]), {}), { action: 'none' });
        assert.deepEqual(extractImageUploadIntent(uploadSubmit(undefined), {}), { action: 'none' });
    });

    it('is none when the attachment id is not in resolved, or no upload component exists', () => {
        assert.deepEqual(extractImageUploadIntent(uploadSubmit(['999']), {}), { action: 'none' });
        assert.deepEqual(extractImageUploadIntent(uploadSubmit(['999']), undefined), { action: 'none' });
        const textOnly = [{ type: 18, component: { type: 4, custom_id: 'image', value: 'https://x' } }];
        assert.deepEqual(extractImageUploadIntent(textOnly, {}), { action: 'none' });
    });
});

describe('Modal Image Upload — validateImageAttachment', () => {
    it('accepts images within the size cap', () => {
        assert.deepEqual(validateImageAttachment(ATTACHMENT), { ok: true });
        assert.deepEqual(validateImageAttachment({ content_type: 'image/gif', size: MAX_UPLOAD_IMAGE_BYTES }), { ok: true });
    });

    it('rejects non-image content types (no MIME whitelist existed before — incident-01 gap)', () => {
        assert.equal(validateImageAttachment({ content_type: 'application/json', size: 10 }).ok, false);
        assert.equal(validateImageAttachment({ size: 10 }).ok, false);
        assert.equal(validateImageAttachment(null).ok, false);
    });

    it('rejects oversized files using Discord metadata (before any download)', () => {
        const result = validateImageAttachment({ content_type: 'image/png', size: MAX_UPLOAD_IMAGE_BYTES + 1 });
        assert.equal(result.ok, false);
        assert.match(result.error, /too large/i);
    });
});

describe('Modal Image Upload — buildImageStorageFilename', () => {
    it('builds contextual names like the fog-map convention (a2_fogmap.png)', () => {
        assert.equal(buildImageStorageFilename({ context: 'a2_location', originalName: 'photo.jpg' }), 'a2_location.jpg');
        assert.equal(buildImageStorageFilename({ context: 'a2_location', originalName: 'Photo.JPEG' }), 'a2_location.jpeg');
    });

    it('sanitizes hostile context and defaults the extension to png', () => {
        assert.equal(buildImageStorageFilename({ context: 'A2 Location!!' }), 'a2_location.png');
        assert.equal(buildImageStorageFilename({ context: '../../etc/passwd', originalName: 'x' }), 'etc_passwd.png');
        assert.equal(buildImageStorageFilename({ context: '' }), 'image.png');
        assert.equal(buildImageStorageFilename({ context: '!!!' }), 'image.png');
    });
});

describe('Modal Image Upload — buildImageFieldLabel', () => {
    it('text mode (default): Label + Text Input with prefill and custom id', () => {
        const label = buildImageFieldLabel({
            label: 'Image URL', textCustomId: 'result_image', currentUrl: 'https://x/y.png',
            textDescription: 'desc', textStyle: 1
        });
        assert.equal(label.type, 18);
        assert.equal(label.label, 'Image URL');
        assert.equal(label.description, 'desc');
        assert.equal(label.component.type, 4);
        assert.equal(label.component.custom_id, 'result_image');
        assert.equal(label.component.style, 1);
        assert.equal(label.component.value, 'https://x/y.png');
    });

    it('text mode omits value when no current URL; garbage mode falls back to text', () => {
        assert.ok(!('value' in buildImageFieldLabel({ label: 'X' }).component));
        assert.equal(buildImageFieldLabel({ label: 'X', imageUploadMode: 'junk' }).component.type, 4);
    });

    it('upload mode: Label + optional File Upload with Current: filename description', () => {
        const label = buildImageFieldLabel({
            label: 'Image URL', uploadLabel: 'Enemy Image', imageUploadMode: 'uploadComponent',
            currentUrl: 'https://cdn.discordapp.com/attachments/1/2/octopus.png?ex=1'
        });
        assert.equal(label.label, 'Enemy Image');
        assert.match(label.description, /Current: octopus\.png — uploading replaces it\./);
        assert.equal(label.component.type, 19);
        assert.equal(label.component.custom_id, IMAGE_UPLOAD_COMPONENT_ID);
        assert.equal(label.component.min_values, 0);
        assert.equal(label.component.required, false);
    });

    it('upload mode with no current image uses the empty description', () => {
        const label = buildImageFieldLabel({
            label: 'X', imageUploadMode: 'uploadComponent', uploadEmptyDescription: 'Upload one.'
        });
        assert.equal(label.description, 'Upload one.');
    });
});

describe('Modal Image Upload — resolveUploadedImageField (pure paths, no network)', () => {
    const guild = { id: 'g1' }; // never touched on these paths

    it('text mode (no File Upload in modal): returns false, fields untouched', async () => {
        const fields = { image: 'https://pasted' };
        const data = { components: [{ type: 18, component: { type: 4, custom_id: 'image', value: 'https://pasted' } }] };
        const uploaded = await resolveUploadedImageField({ fields, data, guild, context: 'x', currentValue: 'ignored' });
        assert.equal(uploaded, false);
        assert.equal(fields.image, 'https://pasted');
    });

    it('upload mode, 0 files: writes currentValue back (keep-current for \'\'-clears handlers)', async () => {
        const fields = { result_image: '' };
        const data = { components: [{ type: 18, component: { type: 19, custom_id: IMAGE_UPLOAD_COMPONENT_ID, values: [] } }] };
        const uploaded = await resolveUploadedImageField({
            fields, data, guild, context: 'x', fieldKey: 'result_image', currentValue: 'https://keep-me.png'
        });
        assert.equal(uploaded, false);
        assert.equal(fields.result_image, 'https://keep-me.png');
    });

    it('upload mode, 0 files, no currentValue: leaves the field absent (entity keep-current)', async () => {
        const fields = {};
        const data = { components: [{ type: 18, component: { type: 19, custom_id: IMAGE_UPLOAD_COMPONENT_ID, values: [] } }] };
        await resolveUploadedImageField({ fields, data, guild, context: 'x' });
        assert.ok(!('image' in fields));
    });

    it('always strips the raw upload key from fields and fields.extra', async () => {
        const fields = { [IMAGE_UPLOAD_COMPONENT_ID]: '111', extra: { [IMAGE_UPLOAD_COMPONENT_ID]: '111' } };
        await resolveUploadedImageField({ fields, data: { components: [] }, guild, context: 'x' });
        assert.ok(!(IMAGE_UPLOAD_COMPONENT_ID in fields));
        assert.ok(!(IMAGE_UPLOAD_COMPONENT_ID in fields.extra));
    });

    it('rejects a non-image upload before any network work', async () => {
        const fields = {};
        const data = {
            components: [{ type: 18, component: { type: 19, custom_id: IMAGE_UPLOAD_COMPONENT_ID, values: ['1'] } }],
            resolved: { attachments: { 1: { content_type: 'application/zip', size: 10, url: 'https://x' } } }
        };
        await assert.rejects(
            resolveUploadedImageField({ fields, data, guild, context: 'x' }),
            /must be an image/
        );
    });
});

describe('Modal Image Upload — filenameFromImageUrl', () => {
    it('extracts the filename from CDN URLs, ignoring query params', () => {
        const url = 'https://cdn.discordapp.com/attachments/1/2/a2_fogmap.png?ex=6a5b&is=6a5a&hm=0137';
        assert.equal(filenameFromImageUrl(url), 'a2_fogmap.png');
        assert.equal(filenameFromImageUrl('https://example.com/img/pic.jpg'), 'pic.jpg');
    });

    it('decodes percent-encoding and truncates long names with an ellipsis', () => {
        assert.equal(filenameFromImageUrl('https://x.com/my%20photo.png'), 'my photo.png');
        const long = `https://x.com/${'a'.repeat(80)}.png`;
        const out = filenameFromImageUrl(long, 20);
        assert.equal(out.length, 20);
        assert.ok(out.endsWith('…'));
    });

    it('returns null when no filename can be derived', () => {
        assert.equal(filenameFromImageUrl(null), null);
        assert.equal(filenameFromImageUrl(''), null);
        assert.equal(filenameFromImageUrl('https://example.com/'), null);
        assert.equal(filenameFromImageUrl('https://example.com/segment-without-extension'), null);
        assert.equal(filenameFromImageUrl(42), null);
    });
});
