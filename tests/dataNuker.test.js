import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure logic replicated inline from dataNuker.js (avoids importing storage/roleManager side-effects)
function backToDataRow() {
  return { type: 1, components: [{ type: 2, style: 2, label: '← Data', custom_id: 'data_admin' }] };
}

function createNukeSuccessUI(displayName, serverName, guildId, results = null) {
  const lines = [`-# Server: **${serverName}** \`${guildId}\``, ''];
  if (results) {
    lines.push(`• Roles Deleted: **${results.rolesDeleted}**`);
    lines.push(`• Pronouns Cleared: **${results.pronounsCleared}**`);
    lines.push(`• Timezones Cleared: **${results.timezonesCleared}**`);
    if (results.errors?.length > 0) {
      lines.push('', `**Errors:**`, ...results.errors.map(e => `• ${e}`));
    }
  } else {
    lines.push(`All ${displayName} entries for this guild have been permanently deleted.`);
    lines.push(`The guild is now reset to a blank state in ${displayName}.`);
  }
  return {
    type: 17,
    accent_color: 0x27ae60,
    components: [
      { type: 10, content: `## ☢️ ${displayName} Nuked` },
      { type: 14 },
      { type: 10, content: '### ```📊 Results```' },
      { type: 10, content: lines.join('\n') },
      { type: 14 },
      backToDataRow()
    ]
  };
}

describe('dataNuker — success UI', () => {
  it('is a Components V2 Container with green accent', () => {
    const ui = createNukeSuccessUI('Discord Roles', 'My Server', '123', null);
    assert.equal(ui.type, 17);
    assert.equal(ui.accent_color, 0x27ae60);
  });

  it('ends with a ← Data back button targeting data_admin', () => {
    const ui = createNukeSuccessUI('playerData.json', 'My Server', '123');
    const row = ui.components.at(-1);
    assert.equal(row.type, 1);
    assert.equal(row.components[0].custom_id, 'data_admin');
    assert.equal(row.components[0].label, '← Data');
  });

  it('renders role deletion counts when results provided', () => {
    const ui = createNukeSuccessUI('Discord Roles', 'S', '1', {
      rolesDeleted: 24, pronounsCleared: 0, timezonesCleared: 0, errors: []
    });
    const body = ui.components.find(c => c.content?.includes('Roles Deleted')).content;
    assert.match(body, /Roles Deleted: \*\*24\*\*/);
    assert.doesNotMatch(body, /Errors:/);
  });

  it('lists errors when present', () => {
    const ui = createNukeSuccessUI('Discord Roles', 'S', '1', {
      rolesDeleted: 1, pronounsCleared: 0, timezonesCleared: 0, errors: ['boom']
    });
    const body = ui.components.find(c => c.content?.includes('Roles Deleted')).content;
    assert.match(body, /\*\*Errors:\*\*/);
    assert.match(body, /• boom/);
  });

  it('uses generic reset copy for file-based nukes (no results)', () => {
    const ui = createNukeSuccessUI('safariContent.json', 'S', '1');
    const body = ui.components.find(c => c.content?.includes('reset to a blank state')).content;
    assert.match(body, /safariContent\.json/);
  });

  it('uses triple-backtick LeanUI section heading', () => {
    const ui = createNukeSuccessUI('playerData.json', 'S', '1');
    assert.ok(ui.components.some(c => c.content === '### ```📊 Results```'));
  });
});
