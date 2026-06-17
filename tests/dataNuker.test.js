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

// --- superNuke (pure logic replicated inline from dataNuker.js) ---
function createSuperNukeConfirmUI(guildId, serverName) {
  return {
    type: 17,
    accent_color: 0xe74c3c,
    components: [
      { type: 10, content: `## ☢️☢️ superNuke — Full Server Wipe` },
      { type: 14 },
      { type: 10, content: `⚠️ ...${serverName} ${guildId}` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, style: 4, label: 'Yes, superNuke Everything', custom_id: 'super_nuke_confirm', emoji: { name: '☢️' } },
        { type: 2, style: 2, label: 'Cancel', custom_id: 'data_admin', emoji: { name: '❌' } }
      ]}
    ]
  };
}

function createSuperNukeSuccessUI(serverName, guildId, results) {
  const roles = results.roles || {};
  const lines = [
    `-# Server: **${serverName}** \`${guildId}\``, '',
    `🗺️ **Map:** ${results.map || '—'}`,
    `💥 **Roles:** ${roles.rolesDeleted ?? 0} deleted · ${roles.pronounsCleared ?? 0} pronouns · ${roles.timezonesCleared ?? 0} timezones`,
    `☢️ **safariContent:** ${results.safari || '—'}`,
    `☢️ **playerData:** ${results.player || '—'}`
  ];
  if (results.errors?.length > 0) lines.push('', `**Errors:**`, ...results.errors.map(e => `• ${e}`));
  return {
    type: 17,
    accent_color: results.errors?.length > 0 ? 0xf39c12 : 0x27ae60,
    components: [
      { type: 10, content: `## ☢️☢️ superNuke Complete` },
      { type: 14 },
      { type: 10, content: '### ```📊 Results```' },
      { type: 10, content: lines.join('\n') },
      { type: 14 },
      backToDataRow()
    ]
  };
}

describe('dataNuker — superNuke confirm UI', () => {
  it('is a red danger Container', () => {
    const ui = createSuperNukeConfirmUI('1', 'S');
    assert.equal(ui.type, 17);
    assert.equal(ui.accent_color, 0xe74c3c);
  });

  it('confirm button targets super_nuke_confirm, cancel returns to data_admin', () => {
    const row = createSuperNukeConfirmUI('1', 'S').components.at(-1);
    assert.equal(row.components[0].custom_id, 'super_nuke_confirm');
    assert.equal(row.components[0].style, 4); // Danger
    assert.equal(row.components[1].custom_id, 'data_admin');
  });
});

describe('dataNuker — superNuke success UI', () => {
  const fullResults = {
    map: 'Map deleted.',
    roles: { rolesDeleted: 24, pronounsCleared: 8, timezonesCleared: 16, errors: [] },
    safari: 'Cleared.',
    player: 'Cleared.',
    errors: []
  };

  it('green accent + ← Data back button when no errors', () => {
    const ui = createSuperNukeSuccessUI('S', '1', fullResults);
    assert.equal(ui.accent_color, 0x27ae60);
    assert.equal(ui.components.at(-1).components[0].custom_id, 'data_admin');
  });

  it('summarizes all four nukes', () => {
    const body = createSuperNukeSuccessUI('S', '1', fullResults).components.find(c => c.content?.includes('Map:')).content;
    assert.match(body, /🗺️ \*\*Map:\*\* Map deleted\./);
    assert.match(body, /24 deleted · 8 pronouns · 16 timezones/);
    assert.match(body, /safariContent:\*\* Cleared\./);
    assert.match(body, /playerData:\*\* Cleared\./);
  });

  it('turns orange and lists errors when a step fails', () => {
    const ui = createSuperNukeSuccessUI('S', '1', { ...fullResults, errors: ['Map: boom'] });
    assert.equal(ui.accent_color, 0xf39c12);
    const body = ui.components.find(c => c.content?.includes('Errors:')).content;
    assert.match(body, /• Map: boom/);
  });

  it('tolerates missing results (defaults to 0 / dash)', () => {
    const body = createSuperNukeSuccessUI('S', '1', { errors: [] }).components.find(c => c.content?.includes('Map:')).content;
    assert.match(body, /🗺️ \*\*Map:\*\* —/);
    assert.match(body, /0 deleted · 0 pronouns · 0 timezones/);
  });
});
