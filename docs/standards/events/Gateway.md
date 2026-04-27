# Discord Gateway Reference

## Overview

The **Gateway** is Discord's WebSocket API for receiving real-time events. CastBot's reaction handlers, ready-state initialization, and any future "react to a message" features ride on this connection.

CastBot uses **discord.js** as its gateway client, so most of the protocol concerns below (heartbeats, identify, resume, sharding) are handled by the library. This document is a reference for understanding what discord.js is doing under the hood and for diagnosing connection-related production issues.

**Source**: [Discord Developer Documentation - Gateway](https://docs.discord.com/developers/events/gateway)

## 🚨 CRITICAL: What CastBot Cares About

1. **Intents must be declared at IDENTIFY time** — adding a new gateway-event-driven feature without enabling its intent silently delivers no events. Verify in `app.js` where the discord.js Client is constructed.
2. **`MESSAGE_CONTENT` is privileged** — required to read message text in `messageCreate`/`messageUpdate`. Must be enabled in the Developer Portal AND the Client constructor.
3. **`GUILD_MEMBERS` is privileged** — required for `GUILD_MEMBER_ADD/UPDATE/REMOVE`. Without it, member events never fire.
4. **Production sharding kicks in at 2500+ guilds** — Discord rejects IDENTIFY without sharding above that threshold. Plan sharding before hitting the limit.
5. **`IDENTIFY` is rate-limited to 1000/day globally** — restart loops in PM2 can burn this quota. If you see `4004` close codes (auth failures) cascading, check if you're identifying repeatedly.

## Gateway Payload Format

Every message in either direction has the same envelope:

```json
{
  "op": 0,
  "d": { /* payload data */ },
  "s": 42,
  "t": "MESSAGE_CREATE"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `op` | integer | **Opcode** — what kind of payload this is |
| `d` | mixed | **Data** — payload-specific (event data, heartbeat ack, etc.) |
| `s` | integer? | **Sequence** — monotonic counter; non-null only for opcode `0` (Dispatch). Used for resume + heartbeat |
| `t` | string? | **Type** — event name (e.g. `MESSAGE_CREATE`); non-null only for opcode `0` |

## Gateway Opcodes

| Opcode | Name | Direction | Description |
|--------|------|-----------|-------------|
| **0** | Dispatch | Receive | An event was dispatched (the `t` field tells you which one) |
| **1** | Heartbeat | Send/Receive | Keepalive ping; client sends, but server may also request one |
| **2** | Identify | Send | Initial handshake — token + intents |
| **3** | Presence Update | Send | Update bot's status/activity |
| **4** | Voice State Update | Send | Join/leave/move voice channel |
| **6** | Resume | Send | Resume a dropped session |
| **7** | Reconnect | Receive | Server tells client to reconnect (and resume) |
| **8** | Request Guild Members | Send | Ask for member list of a guild |
| **9** | Invalid Session | Receive | Session is invalid; client must re-IDENTIFY |
| **10** | Hello | Receive | First message after connection — contains `heartbeat_interval` |
| **11** | Heartbeat ACK | Receive | Server acknowledging your heartbeat |
| **31** | Request Soundboard Sounds | Send | Ask for soundboard sounds |
| **37** | Request Channel Info | Send | Ask for ephemeral channel metadata |

**Reference**: full list at [Opcodes and Status Codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes#gateway-gateway-opcodes).

## Connection Lifecycle

The seven-step handshake every gateway client (including discord.js) follows:

```
1. GET /gateway/bot                  → returns wss:// URL + shard info
2. Open WebSocket to that URL
3. Receive HELLO (op 10)             → contains heartbeat_interval
4. Send IDENTIFY (op 2)              → token + intents
   ── OR ──
   Send RESUME (op 6)                → if recovering an existing session
5. Begin sending HEARTBEAT (op 1)    → every heartbeat_interval ms
6. Receive READY (Dispatch)          → contains session_id + resume_gateway_url
7. Stream of Dispatch (op 0) events  → every gateway event flows here
```

**Disconnection handling:**
- If the close code is **resumable** (4000-series, see Close Codes table), reopen WebSocket to `resume_gateway_url` and send RESUME with last `s` (sequence)
- If non-resumable (e.g. `4004` Authentication failed, `4014` Disallowed intents), do NOT auto-reconnect — surface the error

discord.js handles all of this automatically. Code-level concern is only the constructor:

```javascript
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,  // privileged
    GatewayIntentBits.GuildMembers,    // privileged
  ]
});
```

## Heartbeating

After receiving `HELLO`, the client must send opcode `1` (Heartbeat) every `heartbeat_interval` ms (typically ~41250). The payload is the last sequence number received:

```json
{ "op": 1, "d": 42 }
```

The server replies with opcode `11` (Heartbeat ACK). **If two consecutive heartbeats are sent without an ACK, the connection is "zombied" — close it (with code `4000`-`4999`) and resume.**

discord.js detects zombied connections and auto-reconnects. CastBot has historically had no heartbeat issues; if production logs show repeated reconnects, this is the first thing to check.

## Identifying

The `IDENTIFY` payload (opcode 2):

```json
{
  "op": 2,
  "d": {
    "token": "Bot ...",
    "intents": 33281,
    "properties": {
      "os": "linux",
      "browser": "discord.js",
      "device": "discord.js"
    },
    "shard": [0, 1],
    "presence": { /* optional initial presence */ }
  }
}
```

Server responds with `READY` (Dispatch event), which contains:
- `session_id` — needed for RESUME
- `resume_gateway_url` — different from initial gateway URL; use this for resumes
- `user` — your bot's user object
- `guilds` — partial guild objects (guild data streams via `GUILD_CREATE` after)

**Privileged intent rejection:** if you request `GUILD_MEMBERS`, `GUILD_PRESENCES`, or `MESSAGE_CONTENT` without enabling them in the Developer Portal, the connection closes with `4014` (Disallowed intents).

## Resuming

When disconnected with a resumable close code, reconnect to `resume_gateway_url` and send `RESUME` (op 6):

```json
{
  "op": 6,
  "d": {
    "token": "Bot ...",
    "session_id": "abc123",
    "seq": 42
  }
}
```

The server replays missed events and sends `RESUMED` (Dispatch). If the session is too old or invalidated, the server sends `INVALID_SESSION` (op 9) and you must re-`IDENTIFY` from scratch.

## Gateway Intents

**Intents** are bitwise flags declaring which event categories you want delivered. Without an intent, the corresponding events are simply not sent — no error, just silence.

| Intent | Bit | Description | Privileged |
|---|---|---|---|
| `GUILDS` | `1 << 0` | Guild lifecycle, roles, channels, threads, stages, voice metadata | No |
| `GUILD_MEMBERS` | `1 << 1` | Member add/update/remove | **Yes** |
| `GUILD_MODERATION` | `1 << 2` | Audit log entries, bans | No |
| `GUILD_EXPRESSIONS` | `1 << 3` | Emoji, sticker, soundboard updates | No |
| `GUILD_INTEGRATIONS` | `1 << 4` | Integration create/update/delete | No |
| `GUILD_WEBHOOKS` | `1 << 5` | Webhook updates | No |
| `GUILD_INVITES` | `1 << 6` | Invite create/delete | No |
| `GUILD_VOICE_STATES` | `1 << 7` | Voice state + voice channel effects | No |
| `GUILD_PRESENCES` | `1 << 8` | Presence updates | **Yes** |
| `GUILD_MESSAGES` | `1 << 9` | Message create/update/delete in guilds | No |
| `GUILD_MESSAGE_REACTIONS` | `1 << 10` | Reaction add/remove in guilds | No |
| `GUILD_MESSAGE_TYPING` | `1 << 11` | Typing indicators in guilds | No |
| `DIRECT_MESSAGES` | `1 << 12` | DM message + pin events | No |
| `DIRECT_MESSAGE_REACTIONS` | `1 << 13` | DM reaction events | No |
| `DIRECT_MESSAGE_TYPING` | `1 << 14` | DM typing | No |
| `MESSAGE_CONTENT` | `1 << 15` | Read `content`/`embeds`/`attachments`/`components` of messages | **Yes** |
| `GUILD_SCHEDULED_EVENTS` | `1 << 16` | Scheduled event lifecycle | No |
| `AUTO_MODERATION_CONFIGURATION` | `1 << 20` | Automod rule changes | No |
| `AUTO_MODERATION_EXECUTION` | `1 << 21` | Automod action triggered | No |
| `GUILD_MESSAGE_POLLS` | `1 << 24` | Poll vote add/remove in guilds | No |
| `DIRECT_MESSAGE_POLLS` | `1 << 25` | Poll vote add/remove in DMs | No |

**Privileged intents** require:
1. Toggled ON in the Developer Portal under Bot → Privileged Gateway Intents
2. **For 100+ guilds: Discord verification approval** — submit Bot Verification with justification
3. Without both, the gateway rejects the connection with close code `4014`

**CastBot intent calculation:**

```javascript
// CastBot's reaction-role + member-event needs
const intents = (1 << 0)   // GUILDS
              | (1 << 1)   // GUILD_MEMBERS (privileged)
              | (1 << 9)   // GUILD_MESSAGES
              | (1 << 10)  // GUILD_MESSAGE_REACTIONS
              | (1 << 15); // MESSAGE_CONTENT (privileged)
// = 33283
```

In discord.js, use the `GatewayIntentBits` enum instead of computing manually.

## Rate Limits & Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| Gateway events sent | 120 / 60s | Per connection |
| Payload size | 4096 bytes | Per payload |
| `IDENTIFY` calls | 1000 / 24h | Global, across all shards |
| Concurrent identifies | Per `max_concurrency` bucket | 5-second windows |

**The 1000 IDENTIFY/day limit** is the one that bites in production:
- Each PM2 restart costs one IDENTIFY
- Each gateway disconnect that requires re-IDENTIFY (rare with proper resume) costs one
- A crash loop can burn the full quota in minutes — if you see `4004` errors after a deploy, check this first

## Sharding

Required at 2500+ guilds. Discord splits guilds across multiple gateway connections using:

```
shard_id = (guild_id >> 22) % num_shards
```

**Max Concurrency**: `GET /gateway/bot` returns `session_start_limit.max_concurrency` indicating how many shards can identify simultaneously per 5-second bucket. Identify shards in bucket order: bucket `n` = `shard_id % max_concurrency`.

discord.js handles sharding via `ShardingManager` — out of scope for current CastBot scale but documented for future growth.

## Close Event Codes

Common close codes that affect resume behavior:

| Code | Description | Reconnect? |
|------|-------------|------------|
| 4000 | Unknown error | Yes |
| 4001 | Unknown opcode | Yes |
| 4002 | Decode error | Yes |
| 4003 | Not authenticated (sent before IDENTIFY) | Yes |
| **4004** | **Authentication failed** (bad token) | **No** |
| 4005 | Already authenticated | Yes |
| 4007 | Invalid sequence (resume failed) | Yes (re-IDENTIFY) |
| 4008 | Rate limited | Yes |
| 4009 | Session timed out | Yes |
| 4010 | Invalid shard | No |
| 4011 | Sharding required (2500+ guilds) | No |
| 4012 | Invalid API version | No |
| **4013** | **Invalid intents** (malformed value) | **No** |
| **4014** | **Disallowed intents** (privileged not approved) | **No** |

**No-reconnect codes are configuration errors** — the bot needs a fix before restart. discord.js surfaces these via the `error`/`shardError` events.

**Reference**: [Opcodes and Status Codes](https://docs.discord.com/developers/topics/opcodes-and-status-codes#gateway-gateway-close-event-codes).

## Encoding & Compression

**JSON** (default) — human-readable, optional zlib or zstd transport compression.

**ETF** (Erlang Term Format) — binary, requires string keys. Snowflake IDs come as 64-bit integers, not strings — JavaScript loses precision past 2^53, so JSON is preferred for Node.js bots.

discord.js uses JSON with zlib by default. No reason for CastBot to change this.

## Endpoints

| Endpoint | Auth | Use |
|----------|------|-----|
| `GET /gateway` | None | Get gateway URL (unauthenticated, rarely used) |
| `GET /gateway/bot` | Bot token | Get gateway URL + recommended shard count + session start limits |

**`/gateway/bot` response shape:**

```json
{
  "url": "wss://gateway.discord.gg",
  "shards": 1,
  "session_start_limit": {
    "total": 1000,
    "remaining": 999,
    "reset_after": 86400000,
    "max_concurrency": 1
  }
}
```

`session_start_limit.remaining` is the IDENTIFY budget you have left for the day. Worth logging on startup if you suspect quota issues.

## Production Diagnostics

**Symptom: bot connects but no events fire** → intent missing. Check Client constructor `intents` array.

**Symptom: bot fails to connect with `4014`** → privileged intent toggled in code but not in Developer Portal.

**Symptom: bot reconnects every few minutes** → zombied connection (heartbeat ACK not received). Check network reliability between Lightsail and `gateway.discord.gg`.

**Symptom: `4004` after deploy** → token in `.env` not loaded (PM2 env not preserved). See [InfrastructureArchitecture.md](../../infrastructure-security/InfrastructureArchitecture.md).

**Symptom: `4011` Sharding required** → CastBot has crossed 2500 guilds. Implement `ShardingManager`.

## Related Documentation

- **[Overview.md](Overview.md)** — Gateway vs Webhook vs SDK transports
- **[GatewayEvents.md](GatewayEvents.md)** — Catalog of every dispatchable event
- **[WebhookEvents.md](WebhookEvents.md)** — Alternative for events the gateway can't deliver
- **[DiscordRateLimits.md](../DiscordRateLimits.md)** — REST rate limits (separate from gateway limits)
- **[InfrastructureArchitecture.md](../../infrastructure-security/InfrastructureArchitecture.md)** — Production deployment context
