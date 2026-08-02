# 0889 — Driving Carl-bot from CastBot (CastDock integration)

**Status:** Researched, not built. Blocked by Discord architecture — see Verdict.
**Date:** 2026-08-02
**Related:** [CastDock.md](../03-features/CastDock.md) · `src/webhooks/personaWebhook.js` (the PoC built while investigating)

## Trigger Prompt

> So I'm trying to fake simulate a carl-bot command from CastBot, I want to pseudo integrate with carlbot so we can use @castDock.js to plug in carlbot commands, but it looks like carlbot tags block sends from bots or webhook users. Any way you can think of getting around this? Read carl.gg docs and have a look around online

## 🤔 The idea

CastDock already renders a per-player button row in a channel. If those buttons could fire **Carl-bot** commands, an ORG could drive its existing Carl-bot setup (tags, autoresponses, roles) from CastBot's UI without rebuilding any of it.

## 🧱 Verdict: no supported path where CastBot is the actor

Three independent walls, each sufficient on its own:

**1. Bot/webhook filtering.** Carl-bot is discord.py-based; that library's `Bot.process_commands` returns early on `message.author.bot`. **Webhook messages also carry `author.bot === true`**, so a webhook persona is filtered by the same line as an ordinary bot message. Changing the webhook's display name is irrelevant — the flag is what's checked. This is a deliberate anti-loop guard that nearly every bot has, not a Carl-bot quirk, and not something a server setting can disable (`!ar ignore` only *adds* ignores).

**2. No cross-app slash command invocation.** Discord routes interactions only to the owning application. A bot posting `/tag foo` produces inert text. This is by design.

**3. No public Carl-bot API.** carl.gg is a web dashboard, not a documented integration surface.

## 💡 Options, ranked

### 1. Slash-command mention pills — closest to one click
A `</name:id>` in *any* message, including a bot's, renders as a real clickable pill. Clicking pre-fills the **user's** composer with the actual command; they press Enter and Carl-bot sees a genuine human invocation.

- ✅ Fully supported, no ToS grey area, one extra keypress
- ⚠️ Slash commands only — `!prefix` tags cannot be pilled
- ⚠️ Needs the command ID captured once per command by the host (type `/`, pick the command, copy the resulting pill text) and stored per CastDock button

### 2. Copy-ready command text
CastDock renders the exact `!command` in a code block (one-tap copy on mobile). Zero config, works for prefix tags, but two user actions instead of one.

### 3. Replicate natively in CastBot
For most of what an ORG uses Carl-bot for, CastBot has or could have the equivalent — and then the button just works with no bridge at all. Best long-term if the command set is small. **Establish which commands are actually needed before building any bridge.**

### ❌ Rejected: user-token automation
Driving a user account (selfbot) to send the message violates Discord's ToS and risks both the account and CastBot's verification. Not an option at any price.

## 🧪 The open experiment

Autoresponders are typically a **different code path** from command processing. It is plausible — unverified — that Carl-bot's autoresponse matcher runs before the bot-author guard. If it does, a real bridge exists: CastDock posts a trigger phrase via webhook, Carl-bot autoresponds.

**Test:** set a Carl-bot autoresponse on a nonsense trigger word, fire 🐢 Carlbot Test (Reece's Stuff → Experimental) with that word, see whether Carl-bot bites. One result decides between "a bridge exists" and "commit to option 1/2/3".

## 🛠️ What got built along the way

The investigation produced `src/webhooks/personaWebhook.js` — post a message into a channel under an arbitrary display name via a reused channel webhook, giving the APP-tagged "service user" look of `CastBot Health Monitor - Test`. Reece-only PoC behind 🐢 **Carlbot Test**.

It does **not** solve this problem (wall 1 above), but it is a reusable primitive and it is the instrument for the experiment. Notes worth keeping:

- `username`/`avatar_url` are **per-execute overrides**, so one webhook can post under any name — which is why this reuses a single webhook rather than healthMonitor.js's create-post-delete. That pattern also burns an audit-log entry per post and leaks toward Discord's **15-webhook-per-channel cap** on any failed delete.
- Discord silently 400s webhook usernames containing `discord` or `clyde`; validated client-side with an actionable message.
- Mentions are neutralized (`allowed_mentions: { parse: [] }`) — a webhook post is trivially scriptable and would otherwise be an unauthenticated `@everyone`.

## Sources

- [Can a Discord bot trigger another bot's slash commands?](https://community.latenode.com/t/can-a-discord-bot-trigger-another-bots-slash-commands/14553)
- [Carl-bot autoresponses & trigger words](https://github.com/CarlGroth/carlbot-docs/blob/master/tags-and-responses/autoresponses-trigger-words.md)
- [Carl-bot docs](https://docs.carl.gg/)
- [Discord slash command mention format](https://support.discord.com/hc/en-us/community/posts/4407711130775-Mention-format-for-slash-commands)
