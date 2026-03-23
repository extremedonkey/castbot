# Privileged Intents Analysis — The 100-Server Wall

## Original Context

> discord has an annoying 100 server limit unless you've verified you aren't using a thing called priviledged intents.. which i was told unequivocally by an agent that i wasn't.. so i was like sure.. remove the declaration.. nek minnit.. safari import breaks.. (and all other json imports).. and then im like.. ok but doesn't discord have a new file upload widget (link) and its like no.. thats for hosts TO provide files to download.. and then i check the link later and i was right.. so we could go after that to try and kill the use of priviledged intents so i dont have to do a heap of annoying paperwork and get encryption at rest working on the off chance someone hacks my rando bot on the outer edges of the internet to steal not very secret data..

## 🤔 The Problem

CastBot can't scale past **100 servers** because Discord requires **bot verification** for apps in 100+ guilds. If you use privileged intents, you must **apply for approval at 75+ servers** via a questionnaire on the Developer Portal.

Discord **denied CastBot's MessageContent application** (November 2025).

The alternative to getting approved is to simply **not use privileged intents** — which dramatically simplifies verification. Per Discord's own docs: *"Verified apps will be able to do most of what they can do on our platform without Privileged Intents."*

### What Are Privileged Intents?

Discord gates three intents behind approval. **Under 100 servers, you can use them freely** — just toggle them on in Developer Portal settings. At 75+ servers, a button appears to apply. At 100+, verification is required.

| Intent | What It Does | CastBot Uses It? |
|--------|-------------|-----------------|
| `GuildMembers` | Member join/update/leave events + ability to **request guild member lists** | **YES — 169+ code locations** |
| `MessageContent` | Access to message **content, embeds, attachments, and components** across ALL APIs (not just gateway events) | **YES — 2 code locations** |
| `GuildPresences` | Online/offline/idle status events | **No** |

**Key clarification from Discord docs:** `MessageContent` is unique — unlike the other two, it doesn't correspond to specific events. It controls access to message content data **across all Discord APIs**, including REST. Without it, user-sent message fields return empty (except DMs with the bot, messages mentioning the bot, and messages the bot sent).

### The Incident

An AI agent was asked whether CastBot uses privileged intents. It said **no**. So the intent declarations were removed. Immediately:
- Safari import broke (uses `createMessageCollector` to receive user-uploaded JSON files)
- PlayerData import broke (same pattern)
- The `message.attachments` field came back empty on user messages — Discord strips it without `MessageContent` intent

The declarations were restored, but the 100-server wall remains.

## 📊 Current Intent Configuration

```javascript
// app.js:1390-1396
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,                 // ✅ Standard
    GatewayIntentBits.GuildMembers,            // ⚠️ PRIVILEGED — 169+ uses
    GatewayIntentBits.GuildMessages,           // ✅ Standard
    GatewayIntentBits.GuildMessageReactions,   // ✅ Standard
    GatewayIntentBits.MessageContent           // ⚠️ PRIVILEGED — 2 uses (file imports)
  ]
});
```

---

## 🔍 INTENT #1: MessageContent — CAN BE ELIMINATED

### Where It's Used (2 locations)

Both are identical patterns — admin-only JSON file import via message collector:

#### A. PlayerData Import (`app.js:14893-15052`)
Handler: `playerdata_import`
```javascript
const filter = m => m.author.id === userId && m.attachments.size > 0;
const collector = channel.createMessageCollector({ filter, time: 60000, max: 1 });
collector.on('collect', async (message) => {
  const attachment = message.attachments.first(); // ← Requires MessageContent intent
  // Download JSON, validate, import playerData
});
```

#### B. Safari Data Import (`app.js:15073-15250+`)
Handler: `safari_import_data`
```javascript
const filter = m => m.author.id === userId && m.attachments.size > 0;
const collector = channel.createMessageCollector({ filter, time: 60000, max: 1 });
collector.on('collect', async (message) => {
  const attachment = message.attachments.first(); // ← Requires MessageContent intent
  // Download JSON, validate, import Safari config
});
```

### Why Only These Break

Other `message.attachments` reads in the codebase read from **bot-sent messages** (the bot reading its own uploads back), which don't need `MessageContent` intent:
- `mapExplorer.js:143` — bot uploads image to storage channel, reads back its own attachment URL
- `tipsGalleryManager.js:178` — bot uploads tip images, reads back CDN URL
- `app.js:1830` — same pattern for tip storage
- `activityLogger.js:667` — REST API message fetch (not gateway)
- `mapExplorer.js:1835` — REST API message fetch

### Solutions to Eliminate MessageContent

#### Option A: Modal File Upload (Type 19) — PREFERRED

Discord added a **File Upload** component (Type 19) for modals. This is exactly what Reece suspected existed — a proper file upload widget. It delivers files via the interaction webhook (HTTP), completely bypassing the gateway.

```javascript
// Button click opens modal with file upload
{
  type: 9, // MODAL
  data: {
    custom_id: "safari_import_modal",
    title: "Import Safari Data",
    components: [{
      type: 18, // Label
      label: "Safari Export File",
      description: "Upload the JSON file exported from another server",
      component: {
        type: 19, // File Upload
        custom_id: "import_file",
        min_values: 1,
        max_values: 1,
        required: true
      }
    }]
  }
}

// Modal submit handler receives:
// component.values = ["attachment_snowflake_id"]
// req.body.data.resolved.attachments["attachment_snowflake_id"] = {
//   id, filename, size, url, content_type
// }
```

**Advantages:**
- No gateway intent needed — interaction webhook delivers file data
- Better UX — modal is a guided flow, not "post a file in chat"
- Supports 1-10 files per upload
- File size based on user's channel upload limit
- Consistent with CastBot's modal-first architecture

**Reference:** [Discord File Upload Docs](https://docs.discord.com/developers/components/reference#file-upload), [ComponentsV2.md — File Upload (Type 19)](../standards/ComponentsV2.md)

#### Option B: Slash Command ATTACHMENT Option (Type 11)

Already documented in ComponentsV2.md. Use `/import` command with attachment parameter:

```javascript
{
  name: 'import',
  description: 'Import Safari data from JSON file',
  options: [{
    name: 'file',
    type: 11, // ATTACHMENT
    required: true
  }]
}
```

**Less preferred** because it requires a new slash command rather than fitting into the existing button/modal flow.

### Migration Effort: LOW

Only 2 handlers need changing. Both follow the same pattern. The replacement is straightforward:
1. Change import buttons from "post file in chat" to "open modal with File Upload"
2. Move file processing logic from `collector.on('collect')` to modal submit handler
3. Access file via `req.body.data.resolved.attachments` instead of `message.attachments.first()`
4. Remove `MessageContent` from intent declaration

---

## 🔍 INTENT #2: GuildMembers — DEEPLY EMBEDDED, NEEDS INVESTIGATION

### Reece's Concern

> "i feel like we could be using it extensively"

Correct. **169+ code locations** across 15+ files use `GuildMembers` intent functionality.

### What GuildMembers Intent Enables

Without this intent:
- `guild.members.fetch()` — **may still work** (REST API fallback)
- `guild.members.cache` — **will be mostly empty** (no gateway events populate it)
- `guild.memberCount` — **may still work** (populated by `Guilds` intent)
- Member join/leave events — **will not fire**

**Critical distinction**: `guild.members.fetch(userId)` makes a REST API call — this works **without** the `GuildMembers` intent. But `guild.members.cache` being empty means any code that reads from cache first (before fetching) will silently get empty results.

### Complete Usage Map

#### Tier 1: CRITICAL — Would Break Core Features

| File | Uses | What It Does |
|------|------|-------------|
| **app.js** | 47 | Permission checking, admin operations, castlist member fetch, timezone roles |
| **castlistDataAccess.js** | 6 | Populates member cache before rendering castlist player names |
| **castlistHub.js** | 3 | Uses `guild.members.list()` (REST API — may survive) |
| **roleManager.js** | 11 | Timezone role consolidation fetches ALL members, role assignment |

#### Tier 2: IMPORTANT — Safari & Player Features

| File | Uses | What It Does |
|------|------|-------------|
| **safariManager.js** | 7 | Member display names for Safari logs, validation |
| **castRankingManager.js** | 5 | Ranking display, member verification |
| **playerManagement.js** | 3 | Pronoun roles, timezone, age management |
| **whisperManager.js** | 4 | DM sending, member lookup |
| **playerCardMenu.js** | 3 | Player card rendering |
| **playerLocationManager.js** | 2 | Location display with member names |

#### Tier 3: SUPPORTING — Analytics & Monitoring

| File | Uses | What It Does |
|------|------|-------------|
| **activityLogger.js** | 2 | Member names in activity logs |
| **discordMessenger.js** | 1 | REST API call (would survive) |
| **mapMovement.js** | 1 | Player name in movement logs |
| **safariDeinitialization.js** | 1 | Member name in deinit logs |
| **analyticsLogger.js** | 1 | Member name in analytics |

#### Utility Module: memberFetchUtils.js

CastBot already has a dedicated utility for member fetching. This module could be the centralisation point if we need to migrate away from gateway-based member cache.

### Key Patterns That Would Break

```javascript
// Pattern 1: Cache ratio check (app.js:10243-10259)
const cacheRatio = guild.members.cache.size / guild.memberCount;
if (cacheRatio < 0.8) {
  await guild.members.fetch({ timeout: 10000 }); // Fetches ALL members via gateway
}
// WITHOUT GuildMembers: cache is always near-empty, fetch() may not work as expected

// Pattern 2: Fetch all members for role operations (roleManager.js:959-963)
await guild.members.fetch({ time: 30_000 });
console.log(`✅ Guild members fetched (${guild.members.cache.size} members cached)`);
// WITHOUT GuildMembers: This pattern relies on gateway OP 8 (Request Guild Members)

// Pattern 3: Individual member fetch (used everywhere)
const member = await guild.members.fetch(userId);
const displayName = member.displayName;
// This one might survive — individual fetch can use REST API
```

### Can GuildMembers Be Eliminated?

**Maybe, but it's a much bigger project.** Key questions:

1. **Does `guild.members.fetch(userId)` work without the intent?** — Likely YES (REST API). Need to verify.
2. **Does `guild.members.fetch()` (all members) work without the intent?** — Likely NO. This uses gateway OP 8 which requires the intent.
3. **What breaks if member cache is always empty?** — Any code checking `cache.size`, `cache.filter()`, `cache.find()` before doing a REST fetch.

**The safe path**: Replace all `guild.members.fetch()` (bulk) calls with `guild.members.list({ limit: 1000 })` (REST API) which doesn't need the intent. Replace cache reads with explicit REST fetches. This is a significant refactor touching 15+ files.

---

## 🚪 The Three Doors Past 100 Servers

Discord requires **bot verification** for apps in **100+ guilds**. At **75+ servers**, a button appears on the Developer Portal to apply for privileged intents. Under 100 servers, you can use privileged intents freely by just toggling them on — no application needed.

There are three paths through:

### Door 1: Don't Use Privileged Intents (RECOMMENDED)

If CastBot uses **zero** privileged intents, verification is straightforward — no justification needed, no compliance dance.

**What this means practically:**
- Remove `MessageContent` intent (2 code locations — easy)
- Remove `GuildMembers` intent (169+ code locations — big refactor)
- No encryption requirements beyond standard practice
- No data handling justification questionnaire
- Verification becomes a rubber stamp

### Door 2: Apply for Privileged Intent Approval

At 75+ servers, apply from the Developer Portal bot settings page. Discord redirects to a **questionnaire** asking:

1. **Which intents** you're applying for
2. **Your use case** for those intents
3. **Data security and privacy questions**

A human reviews the application. Screenshots/video demonstrating how the bot uses the intents are "especially valuable."

**For `MessageContent`:**
- Discord **already denied CastBot's application** (November 2025)
- Very strict — Discord actively pushes bots toward their "Message Content Intent Alternatives"
- CastBot only uses it for 2 file import handlers, so the justification is weak

**For `GuildMembers`:**
- CastBot has a stronger case (game management, role assignment, castlist rendering, member name display)
- Approval is not guaranteed but use case is more defensible

**Data handling requirements if approved (from Best Practices doc):**
- **Least privilege**: Only request intents you fundamentally need
- **Individual user data**: Provide clear mechanisms for users to request data deletion
- **30-day deletion**: Discord's recommended maximum retention for user data
- **Encrypt PII**: Always encrypt personally identifiable information (email, phone, address)
  - Note: Discord user IDs and display names are NOT considered PII in this context — PII means email, phone, address etc.
- **Access control**: Limit who on your team can access server data
- **Visibility**: Restrict data visibility based on server roles and permissions
- **Transparency**: Ask yourself "Would users be concerned by how I'm using their data?"

### Door 3: Prove You Don't Store Sensitive Data

This is a hybrid of Door 1 and Door 2. During the questionnaire:
- Declare which intents you use
- Explain what data you access and why
- Demonstrate you don't persist sensitive user data (message content, member PII)
- If you access privileged data but don't store it → lighter requirements

**CastBot's position:** We DO store player data (playerData.json, safariData.json) but it's game state keyed by Discord user IDs, not message content or PII (no emails, phones, addresses). Discord user IDs alone are not PII per Discord's definition. The "encryption at rest" concern from Reece's original context is likely overstated — it applies to PII specifically, not all stored data.

**The real question for Door 3:** Does storing Discord user IDs mapped to game state (tribes, items, currency) count as "sensitive"? Almost certainly not — it's the same as any game bot storing player saves.

---

## 💡 Recommended Plan

### Phase 1: Kill MessageContent Intent (LOW EFFORT, HIGH IMPACT)

**Effort**: ~2-3 hours
**Impact**: Removes 1 of 2 privileged intents. Eliminates the intent Discord already denied us for.

1. Add File Upload (Type 19) modal for Safari import
2. Add File Upload (Type 19) modal for PlayerData import
3. Move file processing from `collector.on('collect')` to modal submit handler
4. Remove `GatewayIntentBits.MessageContent` from client config
5. Test imports work via modal
6. Remove the old `createMessageCollector` code

### Phase 2: Audit GuildMembers Usage (RESEARCH)

**Effort**: ~4-6 hours research
**Impact**: Determines if we can remove the second privileged intent

1. Test what happens when `GuildMembers` is removed in dev
2. Document which features break vs survive
3. Verify `guild.members.fetch(userId)` works via REST without intent
4. Identify all bulk member fetch patterns that need migration
5. Create migration plan if feasible

**Critical finding from Discord docs:** The `GuildMembers` intent is required even for the **REST API** endpoint `List Guild Members` — it's not just a gateway thing. From the docs: *"Calling the List Guild Members endpoint requires the GUILD_MEMBERS intent enabled—regardless of whether it's passed during Gateway identification."*

This means `guild.members.list()` (REST) also needs the intent. The migration path would need to use individual `guild.members.fetch(userId)` calls (which may work without the intent) or find alternatives.

### Phase 3: Migrate GuildMembers (if feasible) (HIGH EFFORT)

**Effort**: ~2-3 days
**Impact**: Removes ALL privileged intents — Door 1 opens fully

1. Replace `guild.members.fetch()` bulk calls with targeted individual fetches
2. Replace `guild.members.cache` reads with explicit REST fetches
3. Add caching layer in `memberFetchUtils.js` to avoid hammering REST API
4. Remove `GatewayIntentBits.GuildMembers` from client config
5. Verify all 169+ usage points work correctly

**Key risk:** If individual `guild.members.fetch(userId)` also requires `GuildMembers` intent (needs testing), then Door 1 may not be viable for CastBot's feature set, and we'd need Door 2 (apply for GuildMembers only, with MessageContent already eliminated).

### Phase 4: Apply for Verification

Once privileged intents are minimized (ideally zero):
1. Apply at [Discord Developer Portal](https://discord.com/developers/applications)
2. Provide bot description, use case, privacy policy
3. If zero privileged intents → straightforward approval
4. If GuildMembers still needed → justify with game management use case
5. Pass 100-server wall

### If Both Intents Are Removed (Door 1)

- No privileged intents = no justification needed
- No encryption-at-rest requirement for privileged data
- No data handling compliance dance
- Verification becomes a formality
- Bot can scale past 100 servers freely
- **This is the path of least resistance**

### If Only GuildMembers Remains (Door 2, Partial)

- Must apply for GuildMembers approval
- Justification: "Game management bot — needs member names for castlist, role assignment, player management"
- Must have privacy policy
- Must encrypt stored member data at rest (playerData.json contains Discord user IDs mapped to game state)
- Stronger case than MessageContent since CastBot genuinely needs member data for core functionality

---

## 📊 CastBot Data Storage Audit

For the verification questionnaire, Discord will ask about data security and privacy. Here's what CastBot actually stores:

| Data File | Contains | PII? (email/phone/address) | Encryption Needed? |
|-----------|----------|---------------------------|-------------------|
| `playerData.json` | Discord user IDs → game roles, tribes, pronouns, timezones | **No** — user IDs + game preferences only | No (not PII) |
| `safariData.json` | Game config, stores, items, map data | **No** — game state only | No |
| `analyticsData.json` | Button click counts, feature usage | **No** — aggregated metrics | No |
| `activityLog.json` | Player game actions with timestamps | **No** — user IDs + game actions | No (not PII) |
| Backup files | Copies of above | Same as source | Same as source |

**Key insight from the actual Discord docs:** The encryption requirement is specifically about **PII (email, phone, address)** — NOT about Discord user IDs or display names. CastBot stores zero PII. We don't collect emails, phone numbers, or physical addresses. The "encryption at rest" concern from Reece's original context was a bigger worry than necessary.

**What we should still do regardless:**
- Provide a way for users to request their data be deleted (e.g., a `/deletedata` command or a button)
- Delete user data within 30 days of request (Discord's recommended maximum)
- These are best practices even without privileged intents

---

## ⚠️ Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| File Upload (Type 19) is new — could have bugs | Medium | Test thoroughly in dev, keep old code commented until verified |
| GuildMembers removal breaks member name resolution | High | Phase 2 research before committing |
| REST API rate limits on individual member fetches | Medium | Centralize through memberFetchUtils.js with caching |
| `guild.members.list()` also needs GuildMembers intent | **High** | Confirmed by Discord docs — need alternative approach |
| Some Discord.js methods silently require GuildMembers | High | Phase 2 testing will surface these |
| Verification denied even without privileged intents | Low | Rare — non-privileged verification is mostly automatic |
| Encryption at rest adds operational complexity | **Low** | Only applies to PII (email/phone/address) — CastBot stores none |

---

## 🔗 Key Finding: REST API ≠ Intent-Free

**From Discord's official Gateway docs (2026):**

> *"Calling the List Guild Members endpoint requires the GUILD_MEMBERS intent enabled—regardless of whether it's passed during Gateway identification."*

This is crucial. The original plan assumed `guild.members.list()` (REST API) would work without the intent. **It won't.** The Phase 3 migration needs to account for this — either:
- Use individual member fetches (test if these work without intent)
- Accept we need GuildMembers and apply for it (Door 2)
- Find creative workarounds (store display names when we receive interactions, since interaction payloads include member data without needing any intent)

**Interaction payloads are the escape hatch:** Every slash command and button interaction includes `req.body.member` with the user's display name, roles, and avatar. CastBot could cache this data from interactions rather than fetching it via the API, reducing or eliminating the need for `GuildMembers` intent.

---

## 📥 Channel Export Feature (Added 2026-03-23)

A channel message export utility was added to Reece's Stuff. This feature:
- Uses **REST API only** (`GET /channels/{id}/messages`) — no Privileged Intents
- The `MessageContent` intent is **NOT** required for REST API message fetching (only for Gateway events)
- Exports as `.txt` file sent back via webhook attachment (stays in Discord ecosystem)
- Restricted to Reece only (Reece's Stuff access control)
- Could be generalized for other hosts if CastBot scales past 100 servers

---

## 📎 Related Documents

- [ComponentsV2.md — File Upload (Type 19)](../standards/ComponentsV2.md) — Component reference
- [ComponentsV2.md — MessageContent Intent & File Uploads](../standards/ComponentsV2.md#messagecontent-intent--file-uploads) — Current documentation
- [SafariImportExport.md](../03-features/SafariImportExport.md) — Import system that needs migration
- [Discord Gateway Docs — Privileged Intents](https://docs.discord.com/developers/events/gateway) — Official intent documentation
- [Discord File Upload Reference](https://docs.discord.com/developers/components/reference#file-upload) — Official docs
- [castlistCrashIssues_cache.md](../incidents/castlistCrashIssues_cache.md) — Documents current intent config
- [RaP 0943: Challenge Actions](0943_20260316_ChallengeActions_Analysis.md) — Already noted "no MessageContent needed" for button-based design
