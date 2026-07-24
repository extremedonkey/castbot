/**
 * SECURITY — Location Manager (map_cell) admin/player gating.
 *
 * createEntityManagementUI({ entityType: 'map_cell', member, ... }) computes
 * isAdmin from `member` and fails CLOSED (player view) when member is omitted
 * — see docs/incidents/04-AnchorMenuAdminExposure.md ("guard the builder, not
 * just the callers"). That means every *admin* return-flow call site (post-edit
 * "return to Location Manager" screens) MUST explicitly pass `member`, or it
 * silently downgrades to the restricted player view instead of leaking data.
 * Not a security hole, but a real functional regression — this tripwire catches
 * it at test time instead of "an admin discovers their own screen is broken."
 *
 * Mirrors the tripwire pattern in tests/adminMenuGate.test.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const SCAN_FILES = ['app.js', 'storeSelector.js', 'entityManagementUI.js'];
const GATE_WINDOW = 5;

function findUngatedCallSites(filename, source) {
  const lines = source.split('\n');
  const ungated = [];
  lines.forEach((line, idx) => {
    if (!/entityType:\s*['"]map_cell['"]/.test(line)) return;
    const windowEnd = Math.min(lines.length, idx + 1 + GATE_WINDOW);
    const following = lines.slice(idx, windowEnd).join('\n');
    // Either an explicit member: field, or a destructured `member` passed
    // straight through (buildLocationManagerUI's own internal call).
    if (!/member(:|,|\s*$)/.test(following) && !/\bmember\b/.test(following)) {
      ungated.push({ file: filename, line: idx + 1, code: line.trim() });
    }
  });
  return ungated;
}

describe('Security — Location Manager (map_cell) admin gating', () => {
  const sources = SCAN_FILES.map(f => ({ file: f, text: readFileSync(path.join(REPO_ROOT, f), 'utf8') }));

  it('scan target files actually contain map_cell entityType call sites (scan is live)', () => {
    const total = sources.reduce((sum, { text }) => sum + (text.match(/entityType:\s*['"]map_cell['"]/g) || []).length, 0);
    assert.ok(total >= 10, `expected >=10 map_cell call sites across ${SCAN_FILES.join(', ')}, found ${total} — scan may be broken`);
  });

  it('every map_cell entityType call site threads member through within the next few lines', () => {
    const ungated = sources.flatMap(({ file, text }) => findUngatedCallSites(file, text));
    assert.deepEqual(ungated, [],
      `map_cell call site(s) missing \`member\` — they will silently render the PLAYER view for admins:\n` +
      ungated.map(u => `  ${u.file}:${u.line}: ${u.code}`).join('\n') +
      `\nPass \`member: context.member\` (or \`req.body.member\` in modal-submit handlers) — see docs/incidents/04-AnchorMenuAdminExposure.md.`);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Pure isAdmin decision logic — replicated from entityManagementUI.js so this
// stays importable without loading discord.js/safariManager.js (Testing
// Standards: "Replicate pure logic inline to avoid importing heavy modules").
// ─────────────────────────────────────────────────────────────────────────

const MANAGE_ROLES = 1n << 28n; // PermissionFlagsBits.ManageRoles

function hasPermissionInline(member, requiredPermission) {
  return member?.permissions && (BigInt(member.permissions) & requiredPermission);
}

function computeIsAdmin(entityType, member) {
  return entityType === 'map_cell' ? !!hasPermissionInline(member, MANAGE_ROLES) : true;
}

describe('createEntityManagementUI isAdmin computation (map_cell)', () => {
  it('admin member (has ManageRoles) → isAdmin true', () => {
    const member = { permissions: (MANAGE_ROLES | (1n << 4n)).toString() };
    assert.equal(computeIsAdmin('map_cell', member), true);
  });

  it('non-admin member (lacks ManageRoles) → isAdmin false', () => {
    const member = { permissions: (1n << 10n).toString() }; // some unrelated permission bit
    assert.equal(computeIsAdmin('map_cell', member), false);
  });

  it('member omitted entirely → fails CLOSED to isAdmin false, not true', () => {
    assert.equal(computeIsAdmin('map_cell', null), false);
    assert.equal(computeIsAdmin('map_cell', undefined), false);
  });

  it('member with no permissions field → isAdmin false', () => {
    assert.equal(computeIsAdmin('map_cell', {}), false);
  });

  it('non-map_cell entity types are always isAdmin true, regardless of member', () => {
    assert.equal(computeIsAdmin('item', null), true);
    assert.equal(computeIsAdmin('store', undefined), true);
    assert.equal(computeIsAdmin('enemy', {}), true);
    assert.equal(computeIsAdmin('safari_button', { permissions: '0' }), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Exploration Options row ordering — Navigate, Enter Command, Whisper,
// Inventory (last), for both admin and player renders.
// ─────────────────────────────────────────────────────────────────────────

function buildExplorationOptionsRow({ hasEnterCommand, hasWhisper }) {
  const navigateButton = { custom_id: 'safari_navigate_x' };
  const inventoryButton = { custom_id: 'safari_player_inventory' };
  const enterCommandButton = hasEnterCommand ? { custom_id: 'player_enter_command_x' } : null;
  const whisperButton = hasWhisper ? { custom_id: 'safari_whisper_x' } : null;

  const row = [];
  row.push(navigateButton);
  if (enterCommandButton) row.push(enterCommandButton);
  if (whisperButton) row.push(whisperButton);
  row.push(inventoryButton);
  return row;
}

describe('Exploration Options row ordering', () => {
  it('Inventory is always last, Navigate is always first', () => {
    const row = buildExplorationOptionsRow({ hasEnterCommand: true, hasWhisper: true });
    assert.equal(row[0].custom_id, 'safari_navigate_x');
    assert.equal(row[row.length - 1].custom_id, 'safari_player_inventory');
    assert.deepEqual(row.map(b => b.custom_id), [
      'safari_navigate_x', 'player_enter_command_x', 'safari_whisper_x', 'safari_player_inventory'
    ]);
  });

  it('omits Whisper when disabled but still ends with Inventory', () => {
    const row = buildExplorationOptionsRow({ hasEnterCommand: true, hasWhisper: false });
    assert.deepEqual(row.map(b => b.custom_id), [
      'safari_navigate_x', 'player_enter_command_x', 'safari_player_inventory'
    ]);
  });
});
