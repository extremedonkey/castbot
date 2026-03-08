import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Replicated logic from customActionUI.js ───

/**
 * Build the channel card posted when an action is "Posted to Channel"
 */
function buildActionChannelCard(action, guildId, actionId) {
  const styleMap = { 'Primary': 1, 'Secondary': 2, 'Success': 3, 'Danger': 4 };
  const buttonStyle = styleMap[action.trigger?.button?.style] || action.style || 1;
  const isModalTrigger = action.trigger?.type === 'button_modal';

  return {
    type: 17,
    accent_color: 0x3498db,
    components: [
      { type: 10, content: `## ${action.emoji || '⚡'} ${action.name || action.label || 'Custom Action'}` },
      { type: 14 },
      {
        type: 1,
        components: [{
          type: 2,
          custom_id: isModalTrigger
            ? `modal_launcher_${guildId}_${actionId}_${Date.now()}`
            : `safari_${guildId}_${actionId}`,
          label: action.name || action.label || 'Activate',
          style: buttonStyle,
          ...(action.emoji ? { emoji: { name: action.emoji } } : {})
        }]
      }
    ]
  };
}

/**
 * Track a channel ID against an action's postedChannels array (deduplicates)
 */
function trackPostedChannel(action, channelId) {
  if (!action.postedChannels) action.postedChannels = [];
  if (action.postedChannels.includes(channelId)) return false;
  action.postedChannels.push(channelId);
  return true;
}

/**
 * Build the "Post to Channel" select UI
 */
function buildPostToChannelUI(action, actionId, selectCustomId, backCustomId) {
  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      accent_color: 0x3498db,
      components: [
        { type: 10, content: `## Post to Channel\n\n**${action.emoji || '⚡'} ${action.name || action.label || 'Custom Action'}**\n\nSelect a channel to post this action button to.` },
        { type: 14 },
        { type: 1, components: [{ type: 8, custom_id: selectCustomId, placeholder: 'Select channel...', channel_types: [0, 5] }] },
        { type: 14 },
        { type: 1, components: [{ type: 2, custom_id: backCustomId, label: '← Back', style: 2 }] }
      ]
    }]
  };
}

// ─── Tests ───

describe('buildActionChannelCard — Structure', () => {
  const baseAction = {
    name: 'Test Action',
    emoji: '🔒',
    trigger: { type: 'button', button: { style: 'Primary' } }
  };

  it('returns a Container (type 17) with 3 children', () => {
    const card = buildActionChannelCard(baseAction, 'guild1', 'action1');
    assert.equal(card.type, 17);
    assert.equal(card.components.length, 3);
  });

  it('header shows action emoji and name', () => {
    const card = buildActionChannelCard(baseAction, 'guild1', 'action1');
    assert.equal(card.components[0].type, 10);
    assert.ok(card.components[0].content.includes('🔒'));
    assert.ok(card.components[0].content.includes('Test Action'));
  });

  it('separator is type 14', () => {
    const card = buildActionChannelCard(baseAction, 'guild1', 'action1');
    assert.equal(card.components[1].type, 14);
  });

  it('button uses safari_ prefix for standard trigger', () => {
    const card = buildActionChannelCard(baseAction, 'guild1', 'action1');
    const button = card.components[2].components[0];
    assert.equal(button.custom_id, 'safari_guild1_action1');
  });

  it('button uses modal_launcher_ prefix for button_modal trigger', () => {
    const modalAction = { ...baseAction, trigger: { type: 'button_modal', button: { style: 'Danger' } } };
    const card = buildActionChannelCard(modalAction, 'guild1', 'action1');
    const button = card.components[2].components[0];
    assert.ok(button.custom_id.startsWith('modal_launcher_guild1_action1_'));
  });
});

describe('buildActionChannelCard — Button Styling', () => {
  it('maps Primary to style 1', () => {
    const action = { name: 'A', trigger: { type: 'button', button: { style: 'Primary' } } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.style, 1);
  });

  it('maps Secondary to style 2', () => {
    const action = { name: 'A', trigger: { type: 'button', button: { style: 'Secondary' } } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.style, 2);
  });

  it('maps Success to style 3', () => {
    const action = { name: 'A', trigger: { type: 'button', button: { style: 'Success' } } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.style, 3);
  });

  it('maps Danger to style 4', () => {
    const action = { name: 'A', trigger: { type: 'button', button: { style: 'Danger' } } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.style, 4);
  });

  it('defaults to style 1 when no style set', () => {
    const action = { name: 'A', trigger: { type: 'button' } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.style, 1);
  });

  it('falls back to action.style for legacy actions', () => {
    const action = { name: 'A', style: 3 };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.style, 3);
  });
});

describe('buildActionChannelCard — Emoji Handling', () => {
  it('includes emoji when action has one', () => {
    const action = { name: 'A', emoji: '🎯', trigger: { type: 'button' } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.deepEqual(button.emoji, { name: '🎯' });
  });

  it('omits emoji property when action has none', () => {
    const action = { name: 'A', trigger: { type: 'button' } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.emoji, undefined);
  });

  it('uses ⚡ fallback in header when no emoji', () => {
    const action = { name: 'A', trigger: { type: 'button' } };
    const card = buildActionChannelCard(action, 'g', 'a');
    assert.ok(card.components[0].content.includes('⚡'));
  });
});

describe('buildActionChannelCard — Label Fallbacks', () => {
  it('uses action.name as button label', () => {
    const action = { name: 'My Action', trigger: { type: 'button' } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.label, 'My Action');
  });

  it('falls back to action.label', () => {
    const action = { label: 'Legacy Label', trigger: { type: 'button' } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.label, 'Legacy Label');
  });

  it('falls back to Activate when no name or label', () => {
    const action = { trigger: { type: 'button' } };
    const button = buildActionChannelCard(action, 'g', 'a').components[2].components[0];
    assert.equal(button.label, 'Activate');
  });
});

describe('trackPostedChannel — Tracking Logic', () => {
  it('adds channelId to empty action', () => {
    const action = {};
    const result = trackPostedChannel(action, '123');
    assert.ok(result);
    assert.deepEqual(action.postedChannels, ['123']);
  });

  it('adds to existing array', () => {
    const action = { postedChannels: ['111'] };
    const result = trackPostedChannel(action, '222');
    assert.ok(result);
    assert.deepEqual(action.postedChannels, ['111', '222']);
  });

  it('returns false for duplicate', () => {
    const action = { postedChannels: ['123'] };
    const result = trackPostedChannel(action, '123');
    assert.equal(result, false);
    assert.deepEqual(action.postedChannels, ['123']);
  });

  it('initializes postedChannels if undefined', () => {
    const action = {};
    trackPostedChannel(action, '456');
    assert.ok(Array.isArray(action.postedChannels));
  });

  it('handles multiple sequential adds', () => {
    const action = {};
    trackPostedChannel(action, 'a');
    trackPostedChannel(action, 'b');
    trackPostedChannel(action, 'c');
    assert.deepEqual(action.postedChannels, ['a', 'b', 'c']);
  });

  it('deduplicates across multiple calls', () => {
    const action = {};
    trackPostedChannel(action, 'a');
    trackPostedChannel(action, 'b');
    trackPostedChannel(action, 'a');
    assert.deepEqual(action.postedChannels, ['a', 'b']);
  });
});

describe('buildPostToChannelUI — Structure', () => {
  const action = { name: 'Test', emoji: '🔒' };

  it('returns IS_COMPONENTS_V2 flag', () => {
    const ui = buildPostToChannelUI(action, 'act1', 'select_act1', 'back_act1');
    assert.equal(ui.flags, 1 << 15);
  });

  it('container has 5 children (text, sep, select, sep, back)', () => {
    const ui = buildPostToChannelUI(action, 'act1', 'select_act1', 'back_act1');
    assert.equal(ui.components[0].components.length, 5);
  });

  it('channel select uses provided custom_id', () => {
    const ui = buildPostToChannelUI(action, 'act1', 'my_select_id', 'back_act1');
    const select = ui.components[0].components[2].components[0];
    assert.equal(select.custom_id, 'my_select_id');
  });

  it('channel select supports text and forum channels', () => {
    const ui = buildPostToChannelUI(action, 'act1', 'sel', 'back');
    const select = ui.components[0].components[2].components[0];
    assert.deepEqual(select.channel_types, [0, 5]);
  });

  it('back button uses provided custom_id', () => {
    const ui = buildPostToChannelUI(action, 'act1', 'sel', 'my_back_id');
    const backBtn = ui.components[0].components[4].components[0];
    assert.equal(backBtn.custom_id, 'my_back_id');
    assert.equal(backBtn.label, '← Back');
    assert.equal(backBtn.style, 2);
  });

  it('header includes action name and emoji', () => {
    const ui = buildPostToChannelUI(action, 'act1', 'sel', 'back');
    assert.ok(ui.components[0].components[0].content.includes('🔒'));
    assert.ok(ui.components[0].components[0].content.includes('Test'));
  });

  it('falls back to ⚡ and Custom Action for bare action', () => {
    const ui = buildPostToChannelUI({}, 'act1', 'sel', 'back');
    assert.ok(ui.components[0].components[0].content.includes('⚡'));
    assert.ok(ui.components[0].components[0].content.includes('Custom Action'));
  });
});
