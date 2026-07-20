/**
 * Application Manager — shared season-app question modal (image-upload migration).
 * buildQuestionModal replaced five drifting inline modal copies in app.js (question_add_,
 * question_select_ edit, question_completion_select_ edit + two legacy openers). The image
 * field must honor the guild's imageUploadMode.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildQuestionModal } from '../applicationManager.js';
import { IMAGE_UPLOAD_COMPONENT_ID } from '../src/images/modalImageUpload.js';

const QUESTION = {
    questionTitle: 'Why apply?',
    questionText: 'Tell us why you want to play this season.',
    imageURL: 'https://cdn.discordapp.com/attachments/1/2/season_logo.png'
};

function fieldById(data, customId) {
    return data.components.find(l => l.component?.custom_id === customId);
}

describe('Question Modal — text mode (paste URL, default)', () => {
    it('edit: 3 Labels with prefills, passed custom_id and title', () => {
        const data = buildQuestionModal({
            customId: 'season_edit_question_modal_cfg1_3',
            title: 'Edit Question',
            question: QUESTION,
            imageUploadMode: 'textUrl'
        });
        assert.equal(data.custom_id, 'season_edit_question_modal_cfg1_3');
        assert.equal(data.title, 'Edit Question');
        assert.equal(data.components.length, 3);
        assert.ok(data.components.every(l => l.type === 18));
        assert.equal(fieldById(data, 'questionTitle').component.value, 'Why apply?');
        assert.equal(fieldById(data, 'questionText').component.value, QUESTION.questionText);
        const image = fieldById(data, 'imageURL');
        assert.equal(image.component.type, 4);
        assert.equal(image.component.value, QUESTION.imageURL);
        assert.equal(image.component.required, false);
    });

    it('create: no prefill values, required text fields intact', () => {
        const data = buildQuestionModal({
            customId: 'season_new_question_modal_cfg1_0',
            title: 'New Question',
            imageUploadMode: 'textUrl'
        });
        assert.ok(!('value' in fieldById(data, 'questionTitle').component));
        assert.ok(!('value' in fieldById(data, 'questionText').component));
        assert.ok(!('value' in fieldById(data, 'imageURL').component));
        assert.equal(fieldById(data, 'questionTitle').component.required, true);
        assert.equal(fieldById(data, 'questionText').component.required, true);
    });

    it('honors a stored questionStyle, defaulting to paragraph', () => {
        const styled = buildQuestionModal({ customId: 'x', title: 'T', question: { ...QUESTION, questionStyle: 1 } });
        assert.equal(fieldById(styled, 'questionText').component.style, 1);
        const plain = buildQuestionModal({ customId: 'x', title: 'T', question: QUESTION });
        assert.equal(fieldById(plain, 'questionText').component.style, 2);
    });
});

describe('Question Modal — upload mode', () => {
    it('swaps the image field for a File Upload with a Current: description', () => {
        const data = buildQuestionModal({
            customId: 'x', title: 'Edit Question',
            question: QUESTION, imageUploadMode: 'uploadComponent'
        });
        assert.equal(data.components.length, 3);
        const upload = data.components.find(l => l.component?.type === 19);
        assert.ok(upload, 'expected a File Upload label');
        assert.equal(upload.component.custom_id, IMAGE_UPLOAD_COMPONENT_ID);
        assert.equal(upload.component.min_values, 0);
        assert.match(upload.description, /Current: season_logo\.png — uploading replaces it\./);
        assert.equal(fieldById(data, 'imageURL'), undefined);
    });

    it('create in upload mode uses the empty-state description', () => {
        const data = buildQuestionModal({ customId: 'x', title: 'New', imageUploadMode: 'uploadComponent' });
        const upload = data.components.find(l => l.component?.type === 19);
        assert.match(upload.description, /Upload an image/);
    });
});
