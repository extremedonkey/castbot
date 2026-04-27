# Discord Gateway Events Reference

## Overview

This document catalogs every gateway event Discord dispatches over the WebSocket connection. Events are split into:

- **Send events** — payloads your app transmits to Discord (8 total)
- **Receive events** — Dispatch payloads (`op: 0`) Discord sends to your app (60+ total)

For the connection protocol (opcodes, lifecycle, intents) see **[Gateway.md](Gateway.md)**. For the broader transport picture see **[Overview.md](Overview.md)**.

**Source**: [Discord Developer Documentation - Gateway Events](https://docs.discord.com/developers/events/gateway-events)

## 🚨 CRITICAL: Intents Gate Receive Events

**A receive event listed below will NOT fire if the corresponding intent is missing from your IDENTIFY payload.** No error, no warning — just silence. This is the #1 source of "why isn't my handler running?" bugs.

When adding a handler for any event below:
1. Check the **Required Intent** column
2. If the intent isn't already enabled in CastBot's Client constructor, enable it
3. If it's privileged (`GUILD_MEMBERS`, `GUILD_PRESENCES`, `MESSAGE_CONTENT`), also toggle it in the Developer Portal

## Event Naming Convention

All events use `UPPER_CASE_WITH_UNDERSCORES`. discord.js translates these to camelCase event names on the `Client` instance:

| Gateway Event | discord.js Event |
|---------------|------------------|
| `MESSAGE_CREATE` | `messageCreate` |
| `GUILD_MEMBER_ADD` | `guildMemberAdd` |
| `MESSAGE_REACTION_ADD` | `messageReactionAdd` |
| `INTERACTION_CREATE` | `interactionCreate` |

## Payload Envelope

Every receive event is a Dispatch (`op: 0`) with this shape:

```json
{
  "op": 0,
  "d": { /* event-specific payload */ },
  "s": 42,
  "t": "MESSAGE_CREATE"
}
```

`s` (sequence) must be tracked for heartbeats and resumes. discord.js handles this internally.

---

# Send Events

Eight commands you can transmit to Discord. In discord.js, most of these are abstracted (e.g. `client.user.setPresence()` sends `UPDATE_PRESENCE`).

| Event | Opcode | Description |
|-------|--------|-------------|
| `IDENTIFY` | 2 | Initial handshake — token, intents, shard, properties |
| `RESUME` | 6 | Reconnect a dropped session — replays missed events |
| `HEARTBEAT` | 1 | Keep connection alive |
| `REQUEST_GUILD_MEMBERS` | 8 | Fetch member list of a large guild (>50 members) |
| `REQUEST_SOUNDBOARD_SOUNDS` | 31 | Fetch a guild's soundboard catalog |
| `REQUEST_CHANNEL_INFO` | 37 | Get ephemeral channel metadata |
| `UPDATE_VOICE_STATE` | 4 | Join, leave, or move voice channels (mute/deafen) |
| `UPDATE_PRESENCE` | 3 | Set bot status (online/idle/dnd) and activity |

**`REQUEST_GUILD_MEMBERS` is rate-limited.** Recent Discord changes throttle this opcode — see [Discord change log](https://docs.discord.com/developers/change-log) for current limits. If CastBot ever needs full member lists at scale, prefer the REST endpoint `GET /guilds/{id}/members` with cursor pagination.

---

# Receive Events

All events below are Dispatch (`op: 0`) payloads. The `t` field carries the event name.

## Connection Management

These fire during the handshake and lifecycle. discord.js owns these — application code rarely subscribes directly.

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `HELLO` | (handshake) | Sent immediately after connection — contains `heartbeat_interval` |
| `READY` | (handshake) | IDENTIFY succeeded — contains `session_id`, `resume_gateway_url`, bot user, partial guild list |
| `RESUMED` | (handshake) | RESUME succeeded — server has replayed missed events |
| `RECONNECT` | (any) | Server requesting client reconnect (and resume) |
| `INVALID_SESSION` | (any) | Session is invalid — client must re-IDENTIFY |
| `RATE_LIMITED` | (any) | Send-rate exceeded |

**discord.js mapping:** `ready` event corresponds to `READY` (used in CastBot at app.js ~1712 for reaction-mapping reload).

## Application Commands

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `APPLICATION_COMMAND_PERMISSIONS_UPDATE` | (none) | Permissions on a slash command were modified |

## Auto Moderation

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `AUTO_MODERATION_RULE_CREATE` | `AUTO_MODERATION_CONFIGURATION` | New automod rule |
| `AUTO_MODERATION_RULE_UPDATE` | `AUTO_MODERATION_CONFIGURATION` | Rule modified |
| `AUTO_MODERATION_RULE_DELETE` | `AUTO_MODERATION_CONFIGURATION` | Rule deleted |
| `AUTO_MODERATION_ACTION_EXECUTION` | `AUTO_MODERATION_EXECUTION` | A rule fired and an action ran |

## Channels

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `CHANNEL_CREATE` | `GUILDS` | New channel created |
| `CHANNEL_UPDATE` | `GUILDS` | Channel properties changed |
| `CHANNEL_DELETE` | `GUILDS` | Channel deleted |
| `CHANNEL_INFO` | (response to send event) | Response to `REQUEST_CHANNEL_INFO` |
| `CHANNEL_PINS_UPDATE` | `GUILDS` or `DIRECT_MESSAGES` | Pinned messages list changed (no message-level data) |
| `VOICE_CHANNEL_STATUS_UPDATE` | `GUILDS` | Voice channel status text changed |
| `VOICE_CHANNEL_START_TIME_UPDATE` | `GUILDS` | Voice channel session start time changed |

## Threads

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `THREAD_CREATE` | `GUILDS` | Thread created OR you gained access to one |
| `THREAD_UPDATE` | `GUILDS` | Thread properties changed |
| `THREAD_DELETE` | `GUILDS` | Thread deleted |
| `THREAD_LIST_SYNC` | `GUILDS` | Bulk sync when bot gains access to a channel — list of threads |
| `THREAD_MEMBER_UPDATE` | `GUILDS` | The bot's own thread member object changed |
| `THREAD_MEMBERS_UPDATE` | `GUILDS` (+ `GUILD_MEMBERS` for full data) | Members joined/left a thread |

## Entitlements

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `ENTITLEMENT_CREATE` | (none) | User purchased / was granted an entitlement |
| `ENTITLEMENT_UPDATE` | (none) | Entitlement changed (renewed, modified) |
| `ENTITLEMENT_DELETE` | (none) | Entitlement removed |

Entitlements also flow through **[Webhook Events](WebhookEvents.md)** — pick one transport.

## Guilds

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `GUILD_CREATE` | `GUILDS` | Bot joined a guild OR initial guild data after READY |
| `GUILD_UPDATE` | `GUILDS` | Guild properties changed (name, icon, etc.) |
| `GUILD_DELETE` | `GUILDS` | Bot removed from guild OR guild unavailable (outage) |
| `GUILD_AUDIT_LOG_ENTRY_CREATE` | `GUILD_MODERATION` (also requires `VIEW_AUDIT_LOG` permission) | Audit log entry written |
| `GUILD_BAN_ADD` | `GUILD_MODERATION` (also requires `BAN_MEMBERS` or `VIEW_AUDIT_LOG`) | User banned |
| `GUILD_BAN_REMOVE` | `GUILD_MODERATION` (also requires `BAN_MEMBERS` or `VIEW_AUDIT_LOG`) | User unbanned |
| `GUILD_EMOJIS_UPDATE` | `GUILD_EXPRESSIONS` | Emoji list changed (full list sent) |
| `GUILD_STICKERS_UPDATE` | `GUILD_EXPRESSIONS` | Sticker list changed |
| `GUILD_INTEGRATIONS_UPDATE` | `GUILD_INTEGRATIONS` | Integration added/removed/updated |

## Guild Members

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `GUILD_MEMBER_ADD` | `GUILD_MEMBERS` (privileged) | User joined the guild |
| `GUILD_MEMBER_REMOVE` | `GUILD_MEMBERS` (privileged) | User left/kicked from guild |
| `GUILD_MEMBER_UPDATE` | `GUILD_MEMBERS` (privileged) | Member roles, nickname, or timeout changed |
| `GUILD_MEMBERS_CHUNK` | (response to send event) | Response to `REQUEST_GUILD_MEMBERS` — paginated chunk |

## Guild Roles

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `GUILD_ROLE_CREATE` | `GUILDS` | Role created |
| `GUILD_ROLE_UPDATE` | `GUILDS` | Role properties changed |
| `GUILD_ROLE_DELETE` | `GUILDS` | Role deleted |

## Guild Scheduled Events

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `GUILD_SCHEDULED_EVENT_CREATE` | `GUILD_SCHEDULED_EVENTS` | Scheduled event created |
| `GUILD_SCHEDULED_EVENT_UPDATE` | `GUILD_SCHEDULED_EVENTS` | Scheduled event modified |
| `GUILD_SCHEDULED_EVENT_DELETE` | `GUILD_SCHEDULED_EVENTS` | Scheduled event canceled |
| `GUILD_SCHEDULED_EVENT_USER_ADD` | `GUILD_SCHEDULED_EVENTS` | User RSVP'd interested |
| `GUILD_SCHEDULED_EVENT_USER_REMOVE` | `GUILD_SCHEDULED_EVENTS` | User removed RSVP |

## Soundboard

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `GUILD_SOUNDBOARD_SOUND_CREATE` | `GUILD_EXPRESSIONS` | Soundboard sound added |
| `GUILD_SOUNDBOARD_SOUND_UPDATE` | `GUILD_EXPRESSIONS` | Soundboard sound modified |
| `GUILD_SOUNDBOARD_SOUND_DELETE` | `GUILD_EXPRESSIONS` | Soundboard sound deleted |
| `GUILD_SOUNDBOARD_SOUNDS_UPDATE` | `GUILD_EXPRESSIONS` | Bulk soundboard update |
| `SOUNDBOARD_SOUNDS` | (response to send event) | Response to `REQUEST_SOUNDBOARD_SOUNDS` |

## Integrations

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `INTEGRATION_CREATE` | `GUILD_INTEGRATIONS` | Integration added |
| `INTEGRATION_UPDATE` | `GUILD_INTEGRATIONS` | Integration modified |
| `INTEGRATION_DELETE` | `GUILD_INTEGRATIONS` | Integration removed |

## Invites

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `INVITE_CREATE` | `GUILD_INVITES` (also requires `MANAGE_CHANNELS` permission) | Invite created |
| `INVITE_DELETE` | `GUILD_INVITES` (also requires `MANAGE_CHANNELS`) | Invite deleted/expired |

## Messages

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `MESSAGE_CREATE` | `GUILD_MESSAGES` and/or `DIRECT_MESSAGES` | New message posted |
| `MESSAGE_UPDATE` | `GUILD_MESSAGES` and/or `DIRECT_MESSAGES` | Message edited |
| `MESSAGE_DELETE` | `GUILD_MESSAGES` and/or `DIRECT_MESSAGES` | Message deleted |
| `MESSAGE_DELETE_BULK` | `GUILD_MESSAGES` | Multiple messages deleted at once (e.g. via API) |
| `MESSAGE_REACTION_ADD` | `GUILD_MESSAGE_REACTIONS` and/or `DIRECT_MESSAGE_REACTIONS` | Reaction added to a message |
| `MESSAGE_REACTION_REMOVE` | `GUILD_MESSAGE_REACTIONS` and/or `DIRECT_MESSAGE_REACTIONS` | Reaction removed |
| `MESSAGE_REACTION_REMOVE_ALL` | `GUILD_MESSAGE_REACTIONS` and/or `DIRECT_MESSAGE_REACTIONS` | All reactions cleared from a message |
| `MESSAGE_REACTION_REMOVE_EMOJI` | `GUILD_MESSAGE_REACTIONS` and/or `DIRECT_MESSAGE_REACTIONS` | All reactions of one emoji cleared |
| `MESSAGE_POLL_VOTE_ADD` | `GUILD_MESSAGE_POLLS` and/or `DIRECT_MESSAGE_POLLS` | User voted on a poll |
| `MESSAGE_POLL_VOTE_REMOVE` | `GUILD_MESSAGE_POLLS` and/or `DIRECT_MESSAGE_POLLS` | User retracted poll vote |

**`MESSAGE_CONTENT` is required** to read `content`, `embeds`, `attachments`, or `components` from message events. Without it, those fields are empty strings/arrays even though the event fires. CastBot needs this for any feature that inspects message text.

## Presence & Status

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `PRESENCE_UPDATE` | `GUILD_PRESENCES` (privileged) | User's status/activity changed |
| `USER_UPDATE` | (none) | The bot user's own profile changed |
| `TYPING_START` | `GUILD_MESSAGE_TYPING` and/or `DIRECT_MESSAGE_TYPING` | User started typing |

## Voice

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `VOICE_STATE_UPDATE` | `GUILD_VOICE_STATES` | User joined/left/moved voice channel, or muted/deafened |
| `VOICE_SERVER_UPDATE` | (none) | Voice server endpoint info — needed for voice connections |
| `VOICE_CHANNEL_EFFECT_SEND` | `GUILD_VOICE_STATES` | User triggered a voice effect (soundboard, emoji reaction) |

## Interactions

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `INTERACTION_CREATE` | (none) | A user invoked a slash command, button, select, or modal |

**CastBot does NOT use `INTERACTION_CREATE` over the gateway.** CastBot receives interactions via the HTTP endpoint at `/interactions` (POST callbacks). Both delivery methods exist; pick one. See [DiscordInteractionAPI.md](../DiscordInteractionAPI.md).

## Stage Instances

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `STAGE_INSTANCE_CREATE` | `GUILDS` | Stage went live |
| `STAGE_INSTANCE_UPDATE` | `GUILDS` | Stage properties changed |
| `STAGE_INSTANCE_DELETE` | `GUILDS` | Stage ended |

## Subscriptions

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `SUBSCRIPTION_CREATE` | (none) | New SKU subscription started |
| `SUBSCRIPTION_UPDATE` | (none) | Subscription modified (renewed, canceled) |
| `SUBSCRIPTION_DELETE` | (none) | Subscription ended |

## Webhooks

| Event | Required Intent | Description |
|-------|-----------------|-------------|
| `WEBHOOKS_UPDATE` | `GUILD_WEBHOOKS` | A channel's webhook list changed (no webhook detail provided) |

---

# CastBot Event Inventory

Events CastBot currently subscribes to via discord.js, with file/line references:

| discord.js Event | Gateway Event | Handler Location | Purpose |
|------------------|---------------|------------------|---------|
| `ready` | `READY` | `app.js` ~1712 | Reaction-mapping reload, PM2 error logger init |
| `messageReactionAdd` | `MESSAGE_REACTION_ADD` | `app.js` ~42155 | Reaction-role assignment, ban-via-reaction |
| `messageReactionRemove` | `MESSAGE_REACTION_REMOVE` | `app.js` ~42340 | Reaction-role removal |
| `messageDelete` | `MESSAGE_DELETE` | `app.js` ~42455 | Cleanup deleted reaction-mapping messages |

> Line numbers are point-in-time. Verify with `grep -n "client.on" app.js` before referencing.

# CastBot Event Wishlist (Not Yet Wired)

Events that would unlock features but aren't currently consumed:

| Event | Required Intent | Hypothetical Use |
|-------|-----------------|------------------|
| `GUILD_MEMBER_ADD` | `GUILD_MEMBERS` | Auto-DM new joiners with /menu link, auto-apply pronoun roles based on prior data |
| `GUILD_MEMBER_REMOVE` | `GUILD_MEMBERS` | Mark player records as "left server" without deletion |
| `GUILD_BAN_ADD` | `GUILD_MODERATION` | Auto-clean reaction mappings, log to admin channel |
| `MESSAGE_DELETE_BULK` | `GUILD_MESSAGES` | Same cleanup as `messageDelete` for purge operations |
| `GUILD_AUDIT_LOG_ENTRY_CREATE` | `GUILD_MODERATION` | Detect external bans for ban-via-reaction reconciliation |
| `INTERACTION_CREATE` | (none) | Migration target if HTTP interaction endpoint becomes a maintenance burden |

## Common Pitfalls

**1. Missing intent → no event.** Every "why isn't my handler running?" question starts with checking the intent. Use `client.options.intents` at runtime to confirm.

**2. `MESSAGE_CONTENT` truncation.** Without this privileged intent, `MESSAGE_CREATE` still fires but `content`, `embeds`, `attachments`, `components` are empty. Bot mentions and DMs are exempt — your bot's own mentions and DMs always include content.

**3. `GUILD_CREATE` fires twice.** Once during the initial guild streaming after READY, then again any time the bot rejoins. Don't treat the first as "new guild" — check `unavailable` vs the membership cache.

**4. `THREAD_CREATE` fires when you gain access**, not just when threads are created. A bot that joins a guild with existing threads receives a flurry of these.

**5. Reaction events come without message context.** `MESSAGE_REACTION_ADD` only includes `message_id`, not the message itself. If you need message content, fetch it via REST. CastBot's reaction-role system handles this by storing message IDs in `playerData[guildId].reactionMappings` ahead of time.

**6. `GUILD_MEMBERS_CHUNK` is paginated.** A single `REQUEST_GUILD_MEMBERS` for a 10k-member guild produces ~10 chunks. Wait for `chunk_index === chunk_count - 1` before assuming the list is complete.

**7. Privacy-restricted events.** Some endpoints (member list requests, prefix-based searches) have new restrictions due to platform privacy reviews. Check the [Discord change log](https://docs.discord.com/developers/change-log) when planning member-discovery features.

## Related Documentation

- **[Overview.md](Overview.md)** — Where gateway sits relative to webhooks/SDK
- **[Gateway.md](Gateway.md)** — Connection protocol, intents, opcodes, lifecycle
- **[WebhookEvents.md](WebhookEvents.md)** — Events the gateway can't deliver (e.g. `APPLICATION_AUTHORIZED`)
- **[DiscordInteractionAPI.md](../DiscordInteractionAPI.md)** — `INTERACTION_CREATE` via HTTP (CastBot's path)
- **[DiscordPermissions.md](../DiscordPermissions.md)** — Permissions referenced in event requirements
