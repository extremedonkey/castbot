# Streamlined Setup Experience - Implementation Guide

**Status**: Planning & Architecture Phase
**Base Document**: [0966_StreamlinedSetup.md](0966_StreamlinedSetup.md)
**Model**: Haiku 4.5 Thinking-optimized
**Date**: October 23, 2025

---

## 📋 Executive Summary

The Streamlined Setup Experience is a **new user onboarding workflow** that transforms how servers discover and adopt CastBot's full feature set. Current problem: Users only leverage basic Season Castlists (≈15% feature adoption). Solution: Guided, progressive disclosure with hooks at critical moments (install → first use → feature adoption).

**Core Loop**: Identify new server → Send welcome message → Track admin first-use → Guide toward features → Integrate with existing systems

---

## 🎯 Strategic Objectives Unpacked

### 1. **Prepare for CastlistV3 Release Surge** (Business Critical)
- Anticipated user influx from CastlistV3 marketing + advertising
- Without onboarding: New servers become "silent" (bot installed but unused)
- With onboarding: Higher activation rate, lower churn
- **Timeline**: November 2025 (~2 weeks)

### 2. **Increase Feature Adoption** (Long-term Value)
Current ecosystem underutilization:
```
Season Castlists:    ████████████████████ 100% adoption
Safari:              ███░░░░░░░░░░░░░░░░░  15%
Stores/Items:        ██░░░░░░░░░░░░░░░░░░   5%
Winners/Alumni:      ██░░░░░░░░░░░░░░░░░░   5%
```

**Root cause**: Players don't know these features exist. Solution: Show, don't tell.

### 3. **Timezone Architecture Evolution** (Technical Debt Cleanup)
- Current: Separate timezone roles for DST/non-DST (confusing UX)
- Target: Single role that tracks UTC offset based on current calendar
- Deadline: November 2, 2025 (Daylight Savings transition)
- Document reference: [0990_20251010_Timezone_DST_Architecture_Analysis.md](0990_20251010_Timezone_DST_Architecture_Analysis.md)

### 4. **Improve Install→Active Conversion** (Metrics)
Track progression:
- `server_installed` → `welcome_message_sent` → `admin_first_use` → `feature_adoption`
- Current: Unknown what % of installs become active servers
- Target: Visibility into drop-off points

### 5. **Guide to Support Ecosystem** (Community Growth)
- Link to CastBot Support Server
- Reduce "where do I ask for help?" friction
- Encourage community contributions

---

## 🏗️ Technical Architecture Overview

### Data Flow & Detection Model

```
┌─────────────────────────────────────────────────────────┐
│                 Guild Install Event                     │
│  (Discord App Install / OAuth / Invite Flow)            │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│   Detection: First admin interaction detected?          │
│   - /menu command executed                              │
│   - /castlist command executed                          │
│   - Timezone role assigned                              │
│   - Pronoun role assigned                               │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Flag in playerData.json:                               │
│  servers[guildId].first_setup_completed = true/false    │
│  servers[guildId].welcome_message_sent = timestamp      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│   Welcome Message (if not sent)                         │
│   - Components V2 UI with feature gallery              │
│   - Action buttons to key features                      │
│   - Links to support server                             │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
    ┌──────────────────┐    ┌──────────────────────┐
    │ Guided Setup     │    │ Feature Shortcuts    │
    │ (Timezone/       │    │ (Links to Safari,    │
    │  Pronouns)       │    │  Castlist, Stores)   │
    └──────────────────┘    └──────────────────────┘
```

### Key Integration Points

| System | Integration | Status |
|--------|-----------|--------|
| **discordMessenger.js** | Send DMs to admins on first use | Needs enhancement |
| **playerData.json** | Track `servers[guildId].setup_state` | Need schema design |
| **ComponentsV2** | Welcome UI with galleries/buttons | Ready to use |
| **Timezone System** | Integrate new DST-aware architecture | Needs design |
| **Button Handler Factory** | All interactive elements must use factory | Ready |
| **Safari/Castlist/Stores** | Deep-link from welcome → features | Ready to use |

---

## 📦 Breakdown by Requirement Category

### MUST HAVE (Phase 1: Core Onboarding)

#### 1. **Server Installation Detection**

**What**: Identify when a new server installs CastBot

**Current State**: Unknown mechanism - needs research

**Implementation Options**:

**Option A: OAuth Flow Detection** ✅ RECOMMENDED
- Hook into Discord OAuth when bot joins server
- Discord sends `READY` event with guild info
- Store `guild.id` → `first_seen_timestamp` in playerData
- Pro: Accurate, reliable, fires immediately
- Con: Need to handle Discord client events

**Option B: First Command Execution** ❌ Less reliable
- Detect when any admin runs `/menu` or `/castlist`
- Pro: Simple to implement
- Con: Gap if admin never uses bot

**Option C: Hybrid Approach** ✅ BETTER
- Fire on OAuth (if we can hook it)
- Fallback to first command execution
- Record both events for analytics

**Decision Needed**: How does CastBot currently detect guild joins? Are we listening to Discord client `GUILD_CREATE` events?

**Implementation**:
```javascript
// In app.js or Discord client setup
client.on('guildCreate', async (guild) => {
  const playerData = await loadPlayerData();
  if (!playerData.servers[guild.id]) {
    playerData.servers[guild.id] = {
      created_at: Date.now(),
      welcome_message_sent: false,
      setup_state: 'pending_welcome',
      first_admin_use: null
    };
    await savePlayerData(playerData);
    await sendWelcomeMessage(guild);
  }
});
```

---

#### 2. **Welcome Message System**

**What**: Send a rich, interactive welcome message to server when bot joins

**Current State**: POC exists with `discordMessenger.js` for DMs

**Key Decisions**:

1. **Delivery Target**:
   - ❓ Which channel? System channel? DM to server owner?
   - ❓ Can we reliably find/create a channel?
   - **Recommendation**: Try system channel → fallback to owner DM (safer)

2. **Content & Components** (ComponentsV2):
   - **Section 1**: Welcome header + what is CastBot
   - **Section 2**: Feature gallery (4 cards showing Safari/Castlist/Stores/More)
   - **Section 3**: Action buttons (Setup Timezone, Create Castlist, Explore Features, Support)
   - **Section 4**: Links to documentation

3. **Message Persistence**:
   - Should message be editable if sent multiple times?
   - Should we resend on server reboot?
   - **Recommendation**: Send once, track `servers[guildId].welcome_message_sent = timestamp`

**Questions for You**:
- ❓ Should welcome message be sent to **every** new server, or only those with 3+ members?
- ❓ Do you want A/B testing on message variants to measure engagement?
- ❓ Should the message include server-specific stats (e.g., "Your server has 42 members")?

---

#### 3. **First-Use Detection**

**What**: Identify if an admin has actually used the bot (set up roles, created castlist)

**Implementation Strategy**:

**Tracking Flags**:
```javascript
servers[guildId] = {
  // Existing
  roles: { timezone: {...}, pronouns: {...} },

  // New - Setup tracking
  setup_state: 'pending' | 'in_progress' | 'completed',
  admin_first_uses: {
    'userId1': { first_menu: timestamp, first_castlist: timestamp },
    'userId2': { first_menu: timestamp, first_castlist: timestamp }
  },
  setup_components_completed: {
    timezone_roles: false,
    pronoun_roles: false,
    initial_castlist: false
  }
}
```

**Detection Points**:
1. **Admin runs `/menu`** → Record `admin_first_uses[userId].first_menu = now()`
2. **Admin accesses timezone setup** → Mark `setup_components_completed.timezone_roles = true`
3. **Admin creates first castlist** → Mark `setup_components_completed.initial_castlist = true`
4. **All components done** → `setup_state = 'completed'`

**Implementation**:
- Add tracking calls in existing `/menu` handler
- Add tracking calls in castlist creation
- Add tracking calls in timezone role setup

---

#### 4. **Selective Setup Actions**

**What**: Let admins choose which setup steps to perform (don't force all)

**Current Problem**: Existing flow assumes "all timezones + all pronouns"

**New UX Flow**:
```
Welcome message arrives
    ↓
Admin clicks "Setup Timezone"
    ↓
Modal appears with options:
  [ ] Configure Timezone Roles (recommend: 1 per admin + UTC fallback)
  [ ] Configure Pronoun Roles (optional)
  [ ] Create Initial Castlist (recommend: do this)
    ↓
Admin selects checkboxes → "Apply Setup"
    ↓
System creates only selected components
```

**Implementation**:
- Modify existing `/menu` → `setup_castbot` to show checkboxes
- Make timezone/pronoun creation idempotent (only add if missing)
- Track which components were actually set up
- On subsequent runs, show current state ("✅ Timezone: UTC-5" vs "❌ Pronouns: Not set")

**Questions for You**:
- ❓ Should there be a "Recommended Setup" button that auto-selects all?
- ❓ Should we limit timezone roles per admin or per server?
- ❓ Current system creates roles for all timezones in a region (e.g., all US zones). Should this change?

---

### SHOULD HAVE (Phase 2: Progressive Features)

#### 5. **Guided Setup Flow**

**Concept**: Multi-step wizard that walks admin through key setup once

**Progression**:
1. Welcome message (sent automatically)
2. Click "Setup Timezone" → Modal with timezone selector
3. Click "Setup Pronouns" → Modal with pronoun creator
4. Click "Create Castlist" → Castlist builder
5. Completion screen → "You're ready! Explore more in `/menu`"

**Implementation**: Use existing modals, string them together with button callbacks

---

#### 6. **Server Announcement Message**

**What**: Post visible message in server channel (not just DM)

**Challenge**: Which channel?
- System channel (if available)
- First available text channel
- Create new #castbot-info channel

**Content**: Similar to welcome message but briefer

---

#### 7. **Per-Admin First-Use Tracking**

**Concept**: Some servers have multiple admins. Track if each admin has used the bot.

**Data Structure**:
```javascript
admin_interactions: {
  'userId1': { first_interaction: timestamp, features_tried: ['safari', 'castlist'] },
  'userId2': { first_interaction: timestamp, features_tried: ['castlist'] }
}
```

**Benefit**: Can individually encourage admins who haven't used bot yet

---

#### 8. **Feature Tips/Carousel**

**Concept**: In `/menu`, add "CastBot Tips" section that cycles through features

**Implementation**:
- New menu page with buttons: Previous / Next / Help
- Shows feature screenshots + description + "Try it" button
- Rotates through: Safari Basics → Castlist Navigation → Stores → Items → Winners → Alumni

---

### COULD HAVE (Phase 3: Nice-to-Haves)

#### 9. **Redesigned /castlist with String Select**

**Current**: ActionRow with Back/Forward buttons (4 components per castlist)
**Proposed**: Replace with String Select dropdown (2 components: Select + Back)
**Benefit**: Fits more castlists per message

---

#### 10. **"Pick and Mix" Feature Selection**

**Concept**: String select in welcome letting admins choose what to learn first

**Risk**: Scope creep, complex logic, may not be worth it vs guided flow

---

## ⏰ Streamlined Timezone System (Phase 1 Integration)

### Current Problem
- Separate roles for "EST" and "EDT" (confusing when DST changes Nov 2)
- Users manually change roles twice per year
- No awareness of current calendar date

### New Architecture
**Single Role Per Timezone**:
```
Role: "🕐 America/New_York"

Metadata stored in playerData:
servers[guildId].timezones.America_New_York = {
  role_id: "12345...",
  region: "America",
  city: "New_York",
  current_offset: -5,  // Updated Nov 2 based on DST
  is_dst: false,
  utc_offset_standard: -5,
  utc_offset_dst: -4
}
```

**Update Flow**:
- November 2, 2025: Run migration script
- Detect all DST-aware timezones
- Recalculate offsets based on current date
- Update playerData and role descriptions

### Integration with Setup
- Offer users timezone picker (reuse existing component)
- Create new single role per selection
- Store in new format
- Handle backward compatibility

**Questions for You**:
- ❓ Have you designed the timezone picker UI yet? (String Select with 300+ options?)
- ❓ Should we auto-assign timezone based on server location via Discord API?
- ❓ What's the current migration strategy for existing servers?

---

## 🎨 UI/UX Component Strategy

### ComponentsV2 Usage

**Welcome Message Structure**:
```javascript
{
  type: 17,  // Container
  components: [
    // Header section
    { type: 10, text: "Welcome to CastBot! 🎭" },
    { type: 14 },  // Separator

    // Feature gallery (4 cards)
    { type: 9, layout: 'section', child: { /* Feature 1 */ } },
    { type: 9, layout: 'section', child: { /* Feature 2 */ } },
    { type: 9, layout: 'section', child: { /* Feature 3 */ } },
    { type: 9, layout: 'section', child: { /* Feature 4 */ } },

    { type: 14 },  // Separator

    // Action buttons
    {
      type: 1,  // ActionRow
      components: [
        { type: 2, label: 'Setup Timezone', custom_id: 'setup_timezone' },
        { type: 2, label: 'Create Castlist', custom_id: 'create_castlist' },
        { type: 2, label: 'Explore More', custom_id: 'explore_features' }
      ]
    },
    {
      type: 1,
      components: [
        { type: 2, label: 'Support Server', url: 'https://discord.gg/...' },
        { type: 2, label: 'Documentation', url: 'https://...' }
      ]
    }
  ]
}
```

**Alignment with LeanUserInterfaceDesign.md**:
- Minimize visual clutter ✅
- Progressive disclosure (show features, let them choose) ✅
- Clear call-to-action buttons ✅
- Use color & emoji for affordance ✅

---

## 🔌 Integration with Existing Systems

### 1. **discordMessenger.js Enhancement**

**Current Capability**: POC for sending DMs

**Enhancements Needed**:
```javascript
// New function
async function sendServerWelcomeMessage(guild, options = {}) {
  // Build ComponentsV2 welcome UI
  // Attempt to find/use system channel
  // Fallback to owner DM
  // Track in playerData
}
```

**Decision**: Should this be in discordMessenger.js or new file (setupManager.js)?

### 2. **ButtonHandlerFactory Integration**

All new buttons MUST use factory pattern:
```javascript
} else if (custom_id === 'setup_timezone') {
  return ButtonHandlerFactory.create({
    id: 'setup_timezone',
    deferred: false,  // Modal response
    handler: async (context) => {
      // Show timezone picker modal
      return { type: 'modal', ... };
    }
  })(req, res, client);
}
```

### 3. **playerData.json Schema Extension**

Current structure: `servers[guildId].roles`, `servers[guildId].castlists`

New structure:
```javascript
servers[guildId] = {
  // Existing
  roles: {...},
  castlists: {...},
  settings: {...},

  // NEW - Onboarding tracking
  onboarding: {
    status: 'pending' | 'in_progress' | 'completed',
    welcome_message_sent: timestamp,
    welcome_message_id: 'messageId',
    welcome_message_channel: 'channelId',

    // Per-admin tracking
    admins_first_use: {
      'userId': {
        first_interaction: timestamp,
        features_tried: ['safari', 'castlist'],
        setup_completed_items: ['timezone', 'pronouns']
      }
    },

    // Setup completion tracking
    setup_items_completed: {
      timezone_roles: false,
      pronoun_roles: false,
      initial_castlist: false,
      completed_at: null
    }
  },

  // NEW - Timezone redesign
  timezones: {
    'America/New_York': {
      role_id: '...',
      current_offset: -5,
      is_dst: false,
      last_updated: timestamp
    }
  }
}
```

**Migration Strategy**:
- Add optional fields with defaults
- Backfill on first server access
- No need to migrate existing servers immediately

---

## 🚀 Implementation Phases

### Phase 1: Core Onboarding (2 weeks - Target: Nov 1)

**Week 1**:
1. [ ] Implement server install detection (`guildCreate` event)
2. [ ] Design welcome message UI (ComponentsV2)
3. [ ] Implement welcome message sending
4. [ ] Add playerData schema for onboarding state
5. [ ] Build first-use detection system
6. [ ] Button handler for setup timezone (reuse existing logic)
7. [ ] Testing in dev environment

**Week 2**:
1. [ ] Selective setup UI (checkboxes for which components to set up)
2. [ ] Timezone creation idempotency
3. [ ] Pronoun role setup refactor (selective)
4. [ ] Testing in production-like environment
5. [ ] Documentation & release notes

**Deliverables**:
- ✅ Automatic welcome message to new servers
- ✅ Admin can selectively set up timezone/pronouns
- ✅ First-use detection working
- ✅ All integrated with ComponentsV2

---

### Phase 2: Progressive Features (2 weeks - Target: Mid-Nov)

**Week 1**:
1. [ ] Guided setup flow (multi-step wizard)
2. [ ] Per-admin first-use tracking
3. [ ] Feature tips carousel in `/menu`

**Week 2**:
1. [ ] Server announcement message (not just DM)
2. [ ] Polish and edge case handling
3. [ ] Analytics dashboard (track adoption metrics)

---

### Phase 3: Timezone Architecture Evolution (3 weeks - Target: Before Nov 2)

**Week 1**:
1. [ ] Implement single-role timezone system
2. [ ] DST offset calculation
3. [ ] Design migration flow

**Week 2-3**:
1. [ ] Build migration tool for existing servers
2. [ ] Test with real servers
3. [ ] Release with guidance

---

## ❓ Critical Questions for You

### Architecture & Strategy

1. **Guild Detection**: How does CastBot currently detect when it joins a new server?
   - Are we listening to Discord `guildCreate` events?
   - Is there existing infrastructure to hook into?

2. **Message Channel**: Where should welcome message appear?
   - System channel (most reliable)?
   - Create #castbot or #welcome channel?
   - DM to server owner (safest)?
   - Combination / fallback logic?

3. **Timezone Adoption**:
   - Should timezone setup be **mandatory** or optional in onboarding?
   - Current: How many timezones does setup create? (US only? All?)
   - Should we offer "UTC fallback" for non-US servers?

### Metrics & Measurement

4. **Success Criteria**: How will we measure success?
   - Metric: % of new servers that send welcome message
   - Metric: % of admins who complete setup within 7 days
   - Metric: Feature adoption (% using Safari, Stores, etc)

5. **Analytics**: Should welcome message include engagement tracking?
   - Track which buttons are clicked?
   - Track feature adoption after onboarding?

### Feature Scope

6. **Feature Gallery Content**: What 4-5 features should we highlight in welcome?
   - Suggested: Safari, Castlist, Stores, Items, Support
   - Any you'd definitely want/not want?

7. **Guided Setup Complexity**: Should setup be:
   - Linear (follow steps in order)?
   - Modular (pick and choose)?
   - Recommended + optional (default path + explore)?

8. **Timezone Redesign Scope**:
   - Is this part of Phase 1 or separate?
   - Do existing servers need migration before Nov 2?
   - Auto-migration vs guided migration?

### Technical Constraints

9. **discordMessenger.js**: What DM functionality currently works?
   - Can we send DMs with ComponentsV2?
   - Any rate limiting concerns?

10. **Permission Model**: For setup actions, do we assume:
    - Only server admins can set up? (current assumption)
    - Role-based permissions?
    - Guild-level vs per-admin settings?

---

## 🛑 Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Welcome message fails to send | Silent onboarding failure | Log all errors, fallback to DM, retry on error |
| Rate limiting (bulk DMs) | Bot hit rate limits | Stagger messages, cache, use webhooks |
| playerData.json compatibility | Data loss on load/save | Validate schema, migration tests, backups |
| Timezone migration (Nov 2 deadline) | Broken timezones mid-DST | Complete before Nov 1, test extensively |
| Component V2 browser support | Messages don't render | Test on mobile, have text fallback |
| Existing server disruption | Admins confused by changes | Clear release notes, opt-in initial phase |

---

## 📊 Success Metrics

**Track in Discord analytics / PM2 monitoring**:

```javascript
// Metrics to implement
setupMetrics = {
  servers_total: number,
  servers_with_welcome_sent: number,
  servers_setup_completed: number,
  admin_first_uses_detected: number,

  feature_adoption: {
    safari_used: number,
    stores_used: number,
    items_used: number,
    castlist_created: number
  },

  timezone_stats: {
    roles_created: number,
    dst_aware_roles: number,
    timezone_changes_per_week: number
  }
};
```

---

## 📝 Related Documentation

**Must Read Before Implementing**:
- [docs/enablers/DiscordMessenger.md](../../docs/enablers/DiscordMessenger.md) - DM capabilities
- [docs/standards/ComponentsV2.md](../../docs/standards/ComponentsV2.md) - UI framework
- [docs/concepts/SeasonLifecycle.md](../../docs/concepts/SeasonLifecycle.md) - Core concepts
- [0990_20251010_Timezone_DST_Architecture_Analysis.md](0990_20251010_Timezone_DST_Architecture_Analysis.md) - Timezone system
- [docs/features/CastlistV3.md](../../docs/features/CastlistV3.md) - Castlist feature

**Reference**:
- [docs/ui/LeanUserInterfaceDesign.md](../../docs/ui/LeanUserInterfaceDesign.md) - UI/UX principles
- [docs/enablers/ButtonHandlerFactory.md](../../docs/enablers/ButtonHandlerFactory.md) - Button patterns

---

## 🎬 Next Steps

1. **Answer the Critical Questions** (20 min) - Clarify scope & constraints
2. **Review Architecture** (30 min) - Validate data structures & flows
3. **Create Implementation Tasks** - Break Phase 1 into specific PRs/commits
4. **Setup Development Environment** - Clone, test, document
5. **Begin Phase 1** - Start with install detection

---

**Document Status**: ✍️ Awaiting your feedback on critical questions
**Last Updated**: October 23, 2025
**Next Review**: After questions answered
