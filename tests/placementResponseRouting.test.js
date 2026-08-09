// Tests for the per-response `_newMessage` override (RaP 0968) and the placement_accept/decline
// rejection path that needs it: the casting invite card is a PUBLIC message in the applicant's
// channel, so a non-target clicker (e.g. production) must NOT edit it away. Pure logic replicated
// inline (mirrors buttonHandlerFactory.js response routing + app.js placement_response handler).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Replica: buttonHandlerFactory response routing (immediate path) ──
function routeImmediate(config, result) {
  if (result.type === 9) return { path: 'MODAL' };
  const forceNewMessage = result._newMessage === true;
  delete result._newMessage;
  const shouldUpdateMessage = config.updateMessage && !forceNewMessage;
  if (config.ephemeral && !shouldUpdateMessage) result.ephemeral = true;
  return {
    path: shouldUpdateMessage ? 'UPDATE_MESSAGE' : 'NEW_MESSAGE',
    ephemeral: !!result.ephemeral,
    leaked: '_newMessage' in result
  };
}

// ── Replica: buttonHandlerFactory response routing (deferred path) ──
function routeDeferred(config, result) {
  const webhookData = result.data || result;
  const forceNewMessage = webhookData._newMessage === true;
  delete webhookData._newMessage;
  return {
    path: (config.updateMessage === false || forceNewMessage) ? 'WEBHOOK_POST' : 'WEBHOOK_PATCH',
    leaked: '_newMessage' in webhookData
  };
}

// ── Replica: recordPlacementResponse gate (castRankingManager.js) ──
function recordPlacementResponse(playerData, { guildId, channelId, clickerUserId, offerType, accepted }) {
  const appRec = playerData[guildId]?.applications?.[channelId];
  if (!appRec) return { ok: false, error: '❌ Application not found for this channel.' };
  if (clickerUserId !== appRec.userId) {
    return { ok: false, error: `❌ Only <@${appRec.userId}> can respond to this placement.` };
  }
  appRec.placementResponse = accepted ? (offerType === 'alternative' ? 'accepted_alternative' : 'accepted') : 'declined';
  return { ok: true, applicantUserId: appRec.userId };
}

// ── Replica: app.js placement_response handler shape (Discord side effects omitted) ──
function placementHandler(playerData, args) {
  const rp = recordPlacementResponse(playerData, args);
  if (!rp.ok) return { content: rp.error, ephemeral: true, _newMessage: true };
  return {
    components: [{ type: 17, components: [{ type: 10, content: args.accepted ? '✅ **You accepted this placement.**' : '❌ **You declined this placement.**' }] }]
  };
}

const PLACEMENT_CONFIG = { id: 'placement_response', updateMessage: true };

describe('_newMessage override — immediate path', () => {
  it('absent → honours config.updateMessage (unchanged legacy behaviour)', () => {
    assert.equal(routeImmediate({ updateMessage: true }, { content: 'x' }).path, 'UPDATE_MESSAGE');
    assert.equal(routeImmediate({ updateMessage: false }, { content: 'x' }).path, 'NEW_MESSAGE');
  });
  it('true → forces a NEW message even when config says updateMessage', () => {
    assert.equal(routeImmediate({ updateMessage: true }, { content: 'x', _newMessage: true }).path, 'NEW_MESSAGE');
  });
  it('true on an already-new-message handler is a no-op', () => {
    assert.equal(routeImmediate({ updateMessage: false }, { content: 'x', _newMessage: true }).path, 'NEW_MESSAGE');
  });
  it('only the literal `true` triggers it — truthy values do not', () => {
    assert.equal(routeImmediate({ updateMessage: true }, { content: 'x', _newMessage: 'yes' }).path, 'UPDATE_MESSAGE');
    assert.equal(routeImmediate({ updateMessage: true }, { content: 'x', _newMessage: false }).path, 'UPDATE_MESSAGE');
  });
  it('is stripped before the payload reaches Discord', () => {
    assert.equal(routeImmediate({ updateMessage: true }, { content: 'x', _newMessage: true }).leaked, false);
  });
  it('config.ephemeral now applies on the forced-new branch (it is no longer an update)', () => {
    assert.equal(routeImmediate({ updateMessage: true, ephemeral: true }, { content: 'x', _newMessage: true }).ephemeral, true);
  });
  it('modals still short-circuit ahead of the override', () => {
    assert.equal(routeImmediate({ updateMessage: true }, { type: 9, _newMessage: true }).path, 'MODAL');
  });
});

describe('_newMessage override — deferred path', () => {
  it('absent → PATCHes @original by default, POSTs when updateMessage is false', () => {
    assert.equal(routeDeferred({ updateMessage: true }, { content: 'x' }).path, 'WEBHOOK_PATCH');
    assert.equal(routeDeferred({ updateMessage: false }, { content: 'x' }).path, 'WEBHOOK_POST');
  });
  it('true → POSTs a follow-up instead of PATCHing, and is stripped', () => {
    const r = routeDeferred({ updateMessage: true }, { content: 'x', _newMessage: true });
    assert.equal(r.path, 'WEBHOOK_POST');
    assert.equal(r.leaked, false);
  });
  it('reads through a wrapped { data } result', () => {
    assert.equal(routeDeferred({ updateMessage: true }, { data: { content: 'x', _newMessage: true } }).path, 'WEBHOOK_POST');
  });
});

describe('placement_accept/decline — the public invite card must survive a wrong clicker', () => {
  const APPLICANT = '111', PRODUCTION = '222';
  const fixture = () => ({ g1: { applications: { ch1: { userId: APPLICANT, configId: 'cfg1' } } } });
  const args = (clickerUserId, extra = {}) => ({ guildId: 'g1', channelId: 'ch1', clickerUserId, offerType: 'successful', accepted: true, ...extra });

  it('the applicant accepting still edits the card in place (buttons dropped)', () => {
    const pd = fixture();
    const r = routeImmediate(PLACEMENT_CONFIG, placementHandler(pd, args(APPLICANT)));
    assert.equal(r.path, 'UPDATE_MESSAGE');
    assert.equal(pd.g1.applications.ch1.placementResponse, 'accepted');
  });

  it('a production member clicking gets an ephemeral NEW message — the card is untouched', () => {
    const pd = fixture();
    const result = placementHandler(pd, args(PRODUCTION));
    assert.match(result.content, /Only <@111> can respond/);
    const r = routeImmediate(PLACEMENT_CONFIG, result);
    assert.equal(r.path, 'NEW_MESSAGE', 'must not clobber the public card');
    assert.equal(r.ephemeral, true, 'only the clicker should see the rejection');
    assert.equal(pd.g1.applications.ch1.placementResponse, undefined, 'no write on rejection');
  });

  it('declining follows the same rules', () => {
    assert.equal(routeImmediate(PLACEMENT_CONFIG, placementHandler(fixture(), args(PRODUCTION, { accepted: false }))).path, 'NEW_MESSAGE');
    assert.equal(routeImmediate(PLACEMENT_CONFIG, placementHandler(fixture(), args(APPLICANT, { accepted: false }))).path, 'UPDATE_MESSAGE');
  });

  it('an unknown channel (no application record) also leaves the card alone', () => {
    const r = routeImmediate(PLACEMENT_CONFIG, placementHandler({ g1: { applications: {} } }, args(APPLICANT)));
    assert.equal(r.path, 'NEW_MESSAGE');
    assert.equal(r.ephemeral, true);
  });

  it('the applicant can still accept after N wrong clickers — the buttons are never stripped', () => {
    const pd = fixture();
    for (const spectator of ['222', '333', '444']) {
      assert.equal(routeImmediate(PLACEMENT_CONFIG, placementHandler(pd, args(spectator))).path, 'NEW_MESSAGE');
    }
    assert.equal(routeImmediate(PLACEMENT_CONFIG, placementHandler(pd, args(APPLICANT))).path, 'UPDATE_MESSAGE');
    assert.equal(pd.g1.applications.ch1.placementResponse, 'accepted');
  });
});
