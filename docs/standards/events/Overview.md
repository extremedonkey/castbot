# Discord Events Overview

## Overview

Apps monitor Discord occurrences (server changes, user actions, application updates) by subscribing to **events**. Discord delivers events through three transport channels — choosing the right one depends on what your app needs to react to and how it's hosted.

This document is the entry point for CastBot's event subscriptions. For specific transports see:
- **[Gateway](Gateway.md)** — WebSocket connection (CastBot's primary channel via discord.js)
- **[Gateway Events](GatewayEvents.md)** — every event Discord sends over the gateway
- **[Webhook Events](WebhookEvents.md)** — HTTP-delivered events to a public URL

**Source**: [Discord Developer Documentation - Events Overview](https://docs.discord.com/developers/events/overview)

## 🚨 CRITICAL: Three Event Transports — They Are Not Interchangeable

| Transport | Connection | Coverage | CastBot Usage |
|-----------|------------|----------|---------------|
| **Gateway** | Persistent WebSocket | Most Discord resource events (channels, guilds, roles, messages, reactions, voice, presence) | ✅ Primary — via discord.js `client.on(...)` |
| **Webhook Events** | One-way HTTP POST to your URL | Limited subset (app auth, entitlements, lobby/SDK DMs) | ⚠️ Not currently configured — would unlock `APPLICATION_AUTHORIZED` |
| **Embedded App SDK** | In-Activity messaging | Voice status, screen orientation, Activity-specific | ❌ N/A — CastBot is not an Activity |

**Resource updates (channel/guild/role/message changes) are gateway-only.** You cannot receive `MESSAGE_CREATE` or `GUILD_MEMBER_ADD` over a webhook. If you need those, you need a gateway connection.

**Some events are webhook-only.** `APPLICATION_AUTHORIZED` (fires when a user installs your app to a server or their account) is **not deliverable over the gateway** — without a webhook URL configured, you have no way to know your app was installed. This is the main gap to flag if CastBot ever wants install-time analytics.

## Gateway Transport

Gateway is a WebSocket protocol. Your bot opens a persistent connection, identifies with a token + intents, and receives a stream of events for as long as the connection is alive. Discord libraries (discord.js, discord.py, etc.) handle the protocol — opcodes, heartbeats, resuming, sharding — so application code only sees the dispatched events.

**Why CastBot uses gateway:**
- Reactive features (reaction roles, message reactions, ban-via-reaction) require real-time message and reaction events
- `client.on('ready')` is the lifecycle hook that drives reaction-mapping reload at startup (see app.js ~1712)
- discord.js abstracts every gateway concern except picking intents

**Trade-offs:**
- Requires an always-on process (CastBot's PM2-managed `castbot-pm` in prod)
- Subject to per-connection rate limits (120 events / 60s) and `IDENTIFY` quotas (1000/day)
- Sharding required at 2500+ guilds — not a current concern but documented in [Gateway.md](Gateway.md)

See **[Gateway.md](Gateway.md)** for the full connection lifecycle and **[GatewayEvents.md](GatewayEvents.md)** for the dispatched-event catalog.

## Webhook Events Transport

Webhook events are one-way HTTP POSTs from Discord to a public URL you configure in the Developer Portal. They cover a narrow event set but are the **only** way to receive a few important events.

**Note:** "Webhook events" are confusingly named — they are NOT the same as:
- **Incoming webhooks** (external services posting to a Discord channel) — covered in [DiscordWebhookResource.md](../DiscordWebhookResource.md)
- **Interaction webhooks** (`POST /interactions/{id}/{token}/callback`) — covered in [DiscordInteractionAPI.md](../DiscordInteractionAPI.md)

Webhook events are **outgoing** webhooks: Discord acts as the client, your app as the server.

**Why CastBot might add webhook events:**
- `APPLICATION_AUTHORIZED` for install-time analytics (number of guilds the bot has been added to, user installs)
- `ENTITLEMENT_CREATE` / `ENTITLEMENT_UPDATE` if CastBot ever monetizes via Discord SKUs
- `APPLICATION_DEAUTHORIZED` for clean up when a user removes the bot

**Trade-offs:**
- No real-time guarantees, no event ordering
- Requires a publicly-routable HTTPS endpoint (CastBot already has `castbotaws.reecewagner.com/interactions` — could be reused)
- Mandatory Ed25519 signature verification (same crypto as the interactions endpoint)
- Discord auto-disables your URL if it fails validation or repeatedly returns non-204

See **[WebhookEvents.md](WebhookEvents.md)** for setup, payload schema, and signature verification.

## Embedded App SDK Transport (Not Applicable to CastBot)

The Embedded App SDK delivers events to Discord Activities — Activities are in-Discord apps (games, watch-together, etc.) running in an iframe. SDK events cover voice status, screen orientation, layout changes, etc. and use `subscribe(eventName, handler)`.

**CastBot is a server-side bot, not an Activity, so this transport is N/A.** Documented here only for completeness.

## Decision: Which Transport for a New Feature?

Use this table when designing a new feature:

| Need to react to... | Use | Why |
|---------------------|-----|-----|
| A user clicking a button / running a command | **Interactions** ([DiscordInteractionAPI.md](../DiscordInteractionAPI.md)) | Not a "Discord event" — this is the interaction request/response cycle |
| A message, reaction, role, channel, member change | **Gateway** | Resource events are gateway-only |
| Bot voice connection state | **Gateway** (`VOICE_STATE_UPDATE`) | Gateway-only |
| Your app being installed / uninstalled | **Webhook Events** (`APPLICATION_AUTHORIZED`/`DEAUTHORIZED`) | Webhook-only |
| A Discord SKU purchase / entitlement | **Webhook Events** OR **Gateway** (`ENTITLEMENT_CREATE`) | Both transports deliver entitlements; webhook is simpler if you don't need a gateway anyway |
| In-Activity events | **Embedded App SDK** | N/A for CastBot |

## CastBot Event Inventory

These are the events CastBot currently subscribes to, all via discord.js gateway connection:

| discord.js Event | Gateway Event | Required Intent | Used For |
|------------------|---------------|-----------------|----------|
| `ready` | `READY` | (none) | Reaction-mapping reload at startup |
| `messageReactionAdd` | `MESSAGE_REACTION_ADD` | `GUILD_MESSAGE_REACTIONS` | Reaction-role assignment, ban-via-reaction |
| `messageReactionRemove` | `MESSAGE_REACTION_REMOVE` | `GUILD_MESSAGE_REACTIONS` | Reaction-role removal |
| `messageDelete` | `MESSAGE_DELETE` | `GUILD_MESSAGES` | Cleanup of deleted reaction-mapping messages |

For the full catalog of what's available (but not yet wired up), see **[GatewayEvents.md](GatewayEvents.md)**.

## Related Documentation

- **[Gateway.md](Gateway.md)** — Connection lifecycle, opcodes, intents, sharding
- **[GatewayEvents.md](GatewayEvents.md)** — Catalog of every gateway event
- **[WebhookEvents.md](WebhookEvents.md)** — Webhook setup, payload schema, signature verification
- **[DiscordInteractionAPI.md](../DiscordInteractionAPI.md)** — Interactions are NOT events (separate request/response system)
- **[DiscordWebhookResource.md](../DiscordWebhookResource.md)** — Outgoing webhooks (your app posting to channels) — different from webhook events
