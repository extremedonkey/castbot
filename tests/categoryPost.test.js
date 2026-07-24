/**
 * 🖼️ Category Post — screen builder, post modal shape, plan stash lifecycle, caps.
 * Pure paths only (no network, no storage writes).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildScreenFromPosts,
    buildCatpostCardModal,
    buildCatpostPostModal,
    buildDeleteConfirm,
    stashPlan,
    takePlan,
    newPostId,
    capRefusalMessage,
    MAX_EXPANDED_CHANNELS
} from '../src/posts/categoryPost.js';
import { PLAN_TTL_MS } from '../src/channels/channelAdminConfig.js';
import { IMAGE_UPLOAD_COMPONENT_ID } from '../src/images/modalImageUpload.js';

const POSTS = {
    catpost_aaa111: {
        title: 'Round 3 Results', content: 'The tribe has spoken.', color: '#3498db',
        image: 'https://cdn.discordapp.com/attachments/1/2/round3.png', lastModified: 300
    },
    catpost_bbb222: { title: 'Marooning', content: 'Welcome to the island!', lastModified: 200 }
};

function findRows(screen) {
    const container = screen.components[0];
    return {
        container,
        select: container.components.find(c => c.type === 1 && c.components[0]?.type === 3)?.components[0],
        actionRow: container.components.find(c => c.type === 1 && c.components[0]?.type === 2 && c.components[0].custom_id === 'catpost_new'),
        gallery: container.components.find(c => c.type === 12)
    };
}

describe('Category Post — screen builder', () => {
    it('empty state: no select, New enabled, Edit/Delete/Post disabled', () => {
        const { container, select, actionRow } = findRows(buildScreenFromPosts({}));
        assert.equal(container.type, 17);
        assert.equal(select, undefined);
        const [neu, edit, del, post] = actionRow.components;
        assert.equal(neu.custom_id, 'catpost_new');
        assert.ok(!neu.disabled);
        assert.equal(edit.label, 'Edit');
        assert.equal(del.label, 'Delete');
        assert.equal(post.label, 'Post');
        assert.ok(edit.disabled && del.disabled && post.disabled);
        // Nav back to Tools
        const flat = JSON.stringify(container);
        assert.match(flat, /castbot_tools/);
    });

    it('selected state: default option, id-carrying buttons enabled, preview + gallery, accent from color', () => {
        const screen = buildScreenFromPosts(POSTS, 'catpost_aaa111');
        const { container, select, actionRow, gallery } = findRows(screen);
        const selectedOpt = select.options.find(o => o.value === 'catpost_aaa111');
        assert.equal(selectedOpt.default, true);
        assert.ok(!select.options.find(o => o.value === 'catpost_bbb222')?.default);

        const [, edit, del, post] = actionRow.components;
        assert.equal(edit.custom_id, 'catpost_edit_catpost_aaa111');
        assert.equal(del.custom_id, 'catpost_delete_catpost_aaa111');
        assert.equal(post.custom_id, 'catpost_post_catpost_aaa111');
        assert.ok(!edit.disabled && !del.disabled && !post.disabled);

        assert.ok(gallery, 'expected a Media Gallery for the stored image');
        assert.equal(gallery.items[0].media.url, POSTS.catpost_aaa111.image);
        assert.equal(container.accent_color, 0x3498db);
        assert.match(JSON.stringify(container), /Round 3 Results/);
    });

    it('sorts newest-first and search filters by title/content with sentinels', () => {
        const screen = buildScreenFromPosts(POSTS, null, 'island');
        const { select } = findRows(screen);
        assert.ok(select.options.find(o => o.value === 'catpost_back_to_all'));
        assert.ok(select.options.find(o => o.value === 'catpost_do_search'));
        assert.ok(select.options.find(o => o.value === 'catpost_bbb222'));
        assert.equal(select.options.find(o => o.value === 'catpost_aaa111'), undefined);

        const all = findRows(buildScreenFromPosts(POSTS)).select;
        const ids = all.options.map(o => o.value);
        assert.ok(ids.indexOf('catpost_aaa111') < ids.indexOf('catpost_bbb222'), 'newest lastModified first');
        assert.equal(all.options.find(o => o.value === 'catpost_do_search'), undefined, 'no search sentinel at ≤10 posts');
    });

    it('caps the select at 25 options (search sentinel included above 10 posts)', () => {
        const many = {};
        for (let i = 0; i < 40; i++) many[`catpost_${i}`] = { title: `Post ${i}`, content: 'x', lastModified: i };
        const { select } = findRows(buildScreenFromPosts(many));
        assert.equal(select.options.length, 25);
        assert.ok(select.options.find(o => o.value === 'catpost_do_search'));
    });
});

describe('Category Post — card modal (upload-only image)', () => {
    it('always uses the File Upload image field, even with no mode threading', async () => {
        const modal = await buildCatpostCardModal('catpost_aaa111', POSTS.catpost_aaa111);
        assert.equal(modal.type, 9);
        assert.equal(modal.data.custom_id, 'catpost_save_catpost_aaa111');
        const upload = modal.data.components.find(l => l.component?.type === 19);
        assert.ok(upload, 'image must be a File Upload — the paste-URL format is removed for this feature');
        assert.equal(upload.component.custom_id, IMAGE_UPLOAD_COMPONENT_ID);
        assert.match(upload.description, /Current: round3\.png/);
        // No text input named image anywhere
        assert.equal(modal.data.components.find(l => l.component?.custom_id === 'image'), undefined);
        // Prefills
        assert.equal(modal.data.components.find(l => l.component?.custom_id === 'title').component.value, 'Round 3 Results');
    });

    it('new post: catpost_save_new custom_id, no prefills', async () => {
        const modal = await buildCatpostCardModal(null);
        assert.equal(modal.data.custom_id, 'catpost_save_new');
        assert.equal(modal.data.title, 'New Category Post');
    });
});

describe('Category Post — post modal (channel select w/ categories)', () => {
    it('one Label wrapping a Channel Select: types [0,4,5], 1-25 picks', () => {
        const modal = buildCatpostPostModal('catpost_aaa111', POSTS.catpost_aaa111);
        assert.equal(modal.type, 9);
        assert.equal(modal.data.custom_id, 'catpost_post_modal_catpost_aaa111');
        assert.equal(modal.data.components.length, 1);
        const label = modal.data.components[0];
        assert.equal(label.type, 18);
        assert.match(label.description, /category posts to every text channel/i);
        const select = label.component;
        assert.equal(select.type, 8);
        assert.equal(select.custom_id, 'post_targets');
        assert.deepEqual(select.channel_types, [0, 4, 5]);
        assert.equal(select.min_values, 1);
        assert.equal(select.max_values, 25);
    });
});

describe('Category Post — plan stash (token lifecycle)', () => {
    it('stash → take round-trips once, then the token is dead (double-click guard)', () => {
        const token = stashPlan('42', { postId: 'p', channels: [] }, 1000);
        const plan = takePlan(token, '42', 2000);
        assert.equal(plan.postId, 'p');
        assert.equal(takePlan(token, '42', 2000), null);
    });

    it('a plan is not transferable and expires after the TTL', () => {
        const t1 = stashPlan('42', { postId: 'p' }, 1000);
        assert.equal(takePlan(t1, '999', 2000), null);
        const t2 = stashPlan('42', { postId: 'p' }, 1000);
        assert.equal(takePlan(t2, '42', 1000 + PLAN_TTL_MS + 1), null);
    });
});

describe('Category Post — misc', () => {
    it('ids look like catpost_{12 hex}', () => {
        assert.match(newPostId(), /^catpost_[0-9a-f]{12}$/);
    });

    it('cap refusal names the count and the limit', () => {
        const msg = capRefusalMessage(431);
        assert.match(msg, /431/);
        assert.match(msg, new RegExp(String(MAX_EXPANDED_CHANNELS)));
    });

    it('delete confirm carries the two-step custom_id and a cancel back to the screen', () => {
        const confirm = buildDeleteConfirm('catpost_x', { title: 'Bye' });
        const flat = JSON.stringify(confirm);
        assert.match(flat, /catpost_delete_confirm_catpost_x/);
        assert.match(flat, /"custom_id":"category_post"/);
        assert.match(flat, /Bye/);
    });
});
