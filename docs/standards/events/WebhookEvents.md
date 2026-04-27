# Discord Webhook Events Reference

## Overview

**Webhook events** are one-way HTTP POSTs Discord sends to a public URL you configure. They cover a narrow event set but are the **only** way to receive certain events — most importantly `APPLICATION_AUTHORIZED` (fires when a user installs your app).

CastBot does not currently consume webhook events. This document is reference material for the day we want install-time analytics, entitlement tracking, or Social SDK message handling. The plumbing required (public HTTPS URL + Ed25519 verification) is already in place for the interactions endpoint, so adding webhook events is mostly a Developer Portal toggle and a new route.

**Source**: [Discord Developer Documentation - Webhook Events](https://docs.discord.com/developers/events/webhook-events)

## 🚨 CRITICAL: Three "Webhook" Concepts — Do Not Confuse

Discord overloads the word "webhook" three different ways. They use different endpoints, headers, and payloads:

| Concept | Direction | Discord's role | Doc |
|---------|-----------|----------------|-----|
| **Webhook events** (this doc) | Discord → your app (HTTPS POST) | Producer | [WebhookEvents.md](WebhookEvents.md) |
| **Incoming webhooks** | Your app → Discord channel (HTTPS POST) | Consumer | [DiscordWebhookResource.md](../DiscordWebhookResource.md) |
| **Interaction webhooks** | Discord → your app (HTTPS POST) for slash commands / button clicks | Producer | [DiscordInteractionAPI.md](../DiscordInteractionAPI.md) |

Webhook events and interaction webhooks share the same Ed25519 verification scheme but hit different routes and have different payload shapes.

## When to Use Webhook Events

| Need | Use webhook events? |
|------|--------------------|
| React to a message / reaction / channel change | ❌ No — gateway-only |
| Know when a user installs your app | ✅ **Yes** — `APPLICATION_AUTHORIZED` is webhook-only |
| Know when a user uninstalls | ✅ **Yes** — `APPLICATION_DEAUTHORIZED` is webhook-only |
| Track Discord SKU purchases / entitlements | ✅ Either webhook OR gateway — webhook is simpler if you don't already need a gateway |
| Lobby / Social SDK message events | ✅ **Yes** — these are part of the Social SDK toolset |
| Don't want to host a persistent WebSocket | ✅ Webhook is stateless — fits serverless / cron-only deployments |

## Event Types

| Event | Description |
|-------|-------------|
| `APPLICATION_AUTHORIZED` | A user authorized your app — to a server (guild install) or to their own account (user install) |
| `APPLICATION_DEAUTHORIZED` | A user revoked your app's authorization |
| `ENTITLEMENT_CREATE` | Entitlement created from an SKU purchase or grant |
| `ENTITLEMENT_UPDATE` | Entitlement modified (renewed, plan changed) |
| `ENTITLEMENT_DELETE` | Entitlement removed (refund, cancellation) |
| `QUEST_USER_ENROLLMENT` | User joined a Quest *(currently unavailable)* |
| `LOBBY_MESSAGE_CREATE` | Message posted in a Social SDK lobby |
| `LOBBY_MESSAGE_UPDATE` | Lobby message edited |
| `LOBBY_MESSAGE_DELETE` | Lobby message deleted |
| `GAME_DIRECT_MESSAGE_CREATE` | DM created during a Social SDK session |
| `GAME_DIRECT_MESSAGE_UPDATE` | Social SDK session DM edited |
| `GAME_DIRECT_MESSAGE_DELETE` | Social SDK session DM deleted |

## Setup

### 1. Provision a Public HTTPS Endpoint

Discord requires HTTPS. CastBot's existing infrastructure (Apache + Let's Encrypt at `castbotaws.reecewagner.com`) can host the endpoint — add a new route alongside `/interactions`. See [InfrastructureArchitecture.md](../../infrastructure-security/InfrastructureArchitecture.md).

Recommended route: `POST /webhook-events`.

### 2. Configure in Developer Portal

In the Discord Developer Portal → your application → **Webhooks**:

1. Set **Webhook URL** to your endpoint (e.g. `https://castbotaws.reecewagner.com/webhook-events`)
2. Toggle **Events** ON
3. Select the event types you want to receive
4. Save

Alternatively, use the API: `PATCH /applications/@me` with `event_webhooks_url`, `event_webhooks_status`, `event_webhooks_types`.

### 3. Pass the PING Validation

Immediately after you save the URL, Discord sends a `PING` request. Your endpoint **must** respond `204 No Content` or Discord rejects the URL.

### 4. Implement Ed25519 Signature Verification

Every request includes signature headers. Your endpoint **must** verify them and respond `401` on failure, or Discord disables the URL.

## Payload Schema

### Outer envelope

```json
{
  "version": 1,
  "application_id": "1234567890",
  "type": 0,
  "event": {
    "type": "APPLICATION_AUTHORIZED",
    "timestamp": "2026-04-27T12:34:56.789Z",
    "data": { /* event-specific */ }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | integer | Schema version. Currently always `1` |
| `application_id` | snowflake | Your app's ID — useful when one endpoint serves multiple apps |
| `type` | integer | `0` = PING, `1` = Event |
| `event` | object | **Present only when `type === 1`**. Omitted for PING |

### Event body (when `type === 1`)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event name (e.g. `APPLICATION_AUTHORIZED`) |
| `timestamp` | string | ISO8601 timestamp of when the event occurred |
| `data` | object | Event-specific payload — shape varies per event type |

## PING Handshake

When validating your URL (initial config + periodic re-validation), Discord sends:

```http
POST /webhook-events HTTP/1.1
Content-Type: application/json
X-Signature-Ed25519: <hex>
X-Signature-Timestamp: <unix>

{
  "version": 1,
  "application_id": "1234567890",
  "type": 0
}
```

Your endpoint must respond:

```http
HTTP/1.1 204 No Content
```

**Empty body. Status 204. Valid `Content-Type` on the request must still be acknowledged.** No JSON, no `application/json` Content-Type on the response.

### Express handler (CastBot pattern)

```javascript
import express from 'express';
import { verifyKey } from 'discord-interactions';

app.post('/webhook-events',
  express.raw({ type: 'application/json' }),  // raw body needed for verification
  async (req, res) => {
    const signature = req.get('X-Signature-Ed25519');
    const timestamp = req.get('X-Signature-Timestamp');
    const isValid = verifyKey(req.body, signature, timestamp, process.env.PUBLIC_KEY);

    if (!isValid) {
      return res.status(401).send('Bad request signature');
    }

    const payload = JSON.parse(req.body.toString('utf8'));

    // PING handshake
    if (payload.type === 0) {
      return res.status(204).end();
    }

    // Event
    if (payload.type === 1) {
      // Acknowledge IMMEDIATELY — process async
      res.status(204).end();

      // Process after responding (within 3 seconds is recommended)
      handleWebhookEvent(payload.event).catch(err => {
        console.error('[WebhookEvents] Failed to process:', err);
      });
    }
  }
);
```

**Three rules baked in:**
1. `express.raw()` instead of `express.json()` — verification needs the raw bytes
2. Verify signature *before* parsing — `401` on failure
3. Respond `204` *before* doing work — Discord retries on timeout

## Ed25519 Signature Verification

Every webhook event request carries two headers:

| Header | Description |
|--------|-------------|
| `X-Signature-Ed25519` | Hex-encoded signature of `timestamp + body` |
| `X-Signature-Timestamp` | Unix timestamp the signature was generated with |

**Algorithm:** Verify `signature` against `timestamp || body` using your application's **public key** from the Developer Portal (General Information → Public Key).

**Library options:**
- **Node.js**: `discord-interactions` package's `verifyKey(rawBody, signature, timestamp, publicKey)` — already in use for CastBot's `/interactions` endpoint
- **Python**: `pynacl`'s `VerifyKey.verify()`
- **Go**: `crypto/ed25519`'s `Verify()`
- Or any Ed25519 library — Discord uses standard Ed25519 (RFC 8032)

**Failure handling:**
- Invalid signature → respond `401` (Discord performs automated security probes with bad signatures — passing them through to your handler is a logic bug)
- Stale timestamp (>5 minutes old) → reject as replay
- Missing headers → `401`

**Discord enforces this aggressively.** Failed validation triggers automated probes; repeated failures auto-remove your URL and email you.

## Event Response Requirements

| Requirement | Detail |
|-------------|--------|
| Status code | `204 No Content` |
| Body | Empty |
| Response time | Within **3 seconds** |
| On failure | Discord retries with exponential backoff up to **10 minutes** |
| On repeated failure | Webhook URL **suspended** + email notification |

If you need to do real work (database write, external call), respond `204` first and process async — same pattern as Discord interactions.

## Event Type Details

### APPLICATION_AUTHORIZED

Fires when a user installs your app to a server or grants user-install authorization.

`data` shape (representative):

```json
{
  "integration_type": 0,
  "user": { /* user object */ },
  "scopes": ["bot", "applications.commands"],
  "guild": { /* guild object — present for guild installs */ }
}
```

| Field | Description |
|-------|-------------|
| `integration_type` | `0` = guild install, `1` = user install |
| `user` | The authorizing user |
| `scopes` | OAuth2 scopes granted |
| `guild` | Present only for guild installs |

**Why CastBot might want this:** Track install rate, detect when a guild has just added the bot (could trigger automated welcome DM to the installer).

### APPLICATION_DEAUTHORIZED

Fires when a user revokes authorization. `data` is essentially `{ user }`.

**Why CastBot might want this:** Cleanup. If a user with an open `safari` session deauthorizes, mark their data as orphaned. Note that bot removal from a guild fires `GUILD_DELETE` (gateway), not this event — this is for OAuth2 user authorization revocations.

### ENTITLEMENT_CREATE / UPDATE / DELETE

For Discord-monetized apps. `data` is an [Entitlement object](https://discord.com/developers/docs/monetization/entitlements). Not relevant for CastBot today.

### LOBBY_MESSAGE_* / GAME_DIRECT_MESSAGE_*

Social SDK events for game-integrated chat. Not relevant for a Discord bot — these are for SDK-using apps.

## Production Considerations

**One endpoint serves all apps.** The `application_id` in the payload tells you which app the event is for. If you ever run multiple apps from one server, route on this field.

**Discord's automated probes hit your endpoint.** Don't log every failed signature as an error — Discord intentionally sends bad ones to test you. Log + respond `401` quietly.

**Rate-limit-friendly.** Webhook events are not rate-limited like the gateway. Discord may bunch deliveries during incidents.

**No ordering guarantees.** Two `ENTITLEMENT_UPDATE`s for the same entitlement may arrive out of order. Use the `timestamp` field to reconcile.

**No real-time guarantees.** Discord may delay delivery during outages. If you need real-time, use the gateway.

## Comparison: Webhook Events vs Gateway Events

| Aspect | Webhook Events | Gateway Events |
|--------|----------------|----------------|
| Transport | HTTP POST | WebSocket |
| Persistence | Stateless | Persistent connection |
| Coverage | ~12 event types | 60+ event types |
| Ordering | Not guaranteed | Guaranteed (per `s` sequence) |
| Real-time | No (best effort) | Yes |
| Hosting | Anywhere with public HTTPS | Always-on process |
| Rate limits | None on receive | 120 events / 60s send |
| Signature verification | **Required** (Ed25519) | Not needed (token auth at IDENTIFY) |
| Failure handling | Discord retries 10 min, then suspends | Reconnect/resume |
| `APPLICATION_AUTHORIZED` | ✅ Available | ❌ Not delivered |
| Resource events (channels, messages) | ❌ Not delivered | ✅ Available |

## Pitfalls Specific to CastBot

**1. Don't reuse the `/interactions` route.** Tempting because both use Ed25519 — but the payload shapes differ. `/interactions` expects `type: 1` to mean PING; webhook events use `type: 0` for PING and `type: 1` for actual events. Wire to a separate route.

**2. `express.json()` will silently break verification.** Once `express.json()` consumes the request body, it's parsed and the raw bytes are gone. Verification fails. Use `express.raw({ type: 'application/json' })` and parse manually after verifying.

**3. Apache reverse proxy must preserve headers.** Confirm `X-Signature-Ed25519` and `X-Signature-Timestamp` reach the Node app. Apache's default config strips most `X-` headers — see [InfrastructureArchitecture.md](../../infrastructure-security/InfrastructureArchitecture.md) for the existing `/interactions` proxy config to clone.

**4. PUBLIC_KEY env var.** Already set for `/interactions`; the same key validates webhook events.

**5. Logging strategy.** Webhook events fire infrequently (compared to gateway events) but are high-signal. Log every accepted event to the same Discord error/audit channel CastBot's PM2ErrorLogger uses, scoped to a different prefix (e.g. `[📮 WEBHOOK]`).

## Related Documentation

- **[Overview.md](Overview.md)** — Where webhook events sit relative to gateway/SDK
- **[Gateway.md](Gateway.md)** — The alternative transport for events that overlap (entitlements)
- **[GatewayEvents.md](GatewayEvents.md)** — Gateway events that are NOT available via webhook
- **[DiscordInteractionAPI.md](../DiscordInteractionAPI.md)** — Same Ed25519 verification, different route + payload
- **[DiscordWebhookResource.md](../DiscordWebhookResource.md)** — Outgoing webhooks (different concept)
- **[InfrastructureArchitecture.md](../../infrastructure-security/InfrastructureArchitecture.md)** — Apache + Node setup for HTTPS endpoints
