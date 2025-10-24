# Streamlined Setup Experience - Unified Implementation Guide

**Created:** 2025-10-23
**Updated:** 2025-01-26 - **MAJOR ARCHITECTURE UPDATE: Reusable Wizard Pattern**
**Status:** Ready for Implementation
**Complexity:** MEDIUM-LOW - Reusable architecture simplifies implementation
**Risk Level:** LOW - Proven with msg_test PoC, delivery-agnostic pattern
**Models Combined:** Sonnet (depth), Haiku (strategy), Opus (architecture) + User Requirements + **Reusable Wizard Discovery**

---

## 🎯 Executive Summary

### The Problem (From Haiku's Clear Visualization)

```
Current Feature Adoption:
Season Castlists:    ████████████████████ 100% adoption
Safari:              ███░░░░░░░░░░░░░░░░░  15%
Stores/Items:        ██░░░░░░░░░░░░░░░░░░   5%
Winners/Alumni:      ██░░░░░░░░░░░░░░░░░░   5%
```

**Root Cause:** New servers install CastBot → see complex /menu → don't know where to start → only use basic castlist feature → never discover Safari/Applications/Rankings

### The Solution (UPDATED: Reusable Wizard Pattern)

Transform CastBot from "complex bot with many features" to "welcoming guide that helps you get started" through a **reusable, delivery-agnostic wizard system**:

1. **Auto-welcome DM** on server join (original requirement)
2. **/setup command** for on-demand wizard (any context)
3. **Button in /menu** for easy access anytime
4. **Tips system** using same Media Gallery pattern
5. **DST-aware timezone** system (deadline: Nov 2, 2025)

### 🚨 CRITICAL DISCOVERY #1: Existing Infrastructure

**The welcome message infrastructure ALREADY EXISTS and is production-ready!**

```javascript
// discordMessenger.js:142-150
static async sendWelcomePackage(client, guild) {
  // TEMPORARILY DISABLED - Welcome messages are ready but not launched yet
  console.log(`🔕 Welcome messages temporarily disabled for ${guild.name}`);
  return { success: true, dmSent: false, note: 'Welcome messages temporarily disabled' };

  /* READY FOR LAUNCH - Uncomment when ready to enable welcome messages */
}
```

### 🚨 CRITICAL DISCOVERY #2: Reusable Wizard Pattern

**The wizard pattern works EVERYWHERE - not just DMs!**

**msg_test PoC Validated:**
- ✅ Media Gallery (type 12) with 10 screenshots works perfectly
- ✅ UPDATE_MESSAGE navigation works in DMs, channels, ephemeral
- ✅ Same content can be delivered via REST API (DMs) or interaction response (channels)
- ✅ Single wizard engine serves multiple entry points

**What This Means:**
- Build wizard ONCE, use EVERYWHERE
- Auto-DM still works (original requirement)
- Add /setup command, button in /menu, tips system - all use same code
- Easy testing (button in Analytics Menu)
- Better UX (users choose where to see wizard)

---

## 📋 Complete Requirements Specification

### MUST Have Requirements

#### CastBot Setup
- **Multi-Entry Point System:** (NEW - UPGRADED FROM DM-ONLY)
  - **Auto-welcome DM** on bot install (original requirement)
  - **/setup command** for on-demand wizard
  - **Button in /menu** for easy access
  - All use same wizard engine (delivery-agnostic)
- **First-Time Detection:** Identify when bot is newly installed to a server
- **Welcome DM:** Send personalized welcome message to server owner/installer
- **Setup Detection:** Determine if ANY administrator has run `/menu` or `/castlist`
  - Check for existing timezone/pronoun roles
  - Track in playerData.json for persistence
- **Role Hierarchy Validation:** (CRITICAL)
  - Check if CastBot's role is positioned above pronoun/timezone roles
  - Provide visual guide showing how to fix hierarchy issues
  - Test role management capabilities before proceeding
  - Block setup continuation if hierarchy is incorrect
  - Explanation: Discord bots can only manage roles BELOW their position
- **Selective Setup:** Allow users to choose setup options:
  - Timezones only
  - Pronouns only
  - Both
  - Skip entirely
- **Testing Framework:** Easy mechanism to test first-time flow repeatedly (SOLVED: Button in /menu)

#### Streamlined Timezone Roles
- **Single Role System:** One "CT" role instead of CST/CDT pairs
- **DST Tracking:** Store current offset and DST status in playerData.json
- **Manual Toggle:** Button to switch all servers between DST/Standard time
- **Role Updates:** Update role names/labels when DST changes
- **Conversion Process:** Guided migration from dual-role to single-role system
- **Backward Compatibility:** Support existing dual-role servers during transition

### SHOULD Have Requirements

#### Enhanced Setup Experience
- **Tips System:** Rotating tips/suggestions accessible from /menu (UPGRADED: Uses same wizard pattern!)
  - **Media Gallery carousel** with CastBot feature screenshots
  - Same 10-screenshot gallery from msg_test PoC
  - Accessible from button in /menu
  - Same navigation patterns as wizard
- **Per-Admin Tracking:** Detect when EACH admin first uses features (not just server-level)
- **Season Creation Prompt:** Guide to create first season with reusable components
- **Application Builder Hook:** Suggest Season Application setup after first season
- **Donate Button:** Link to paypal.me or similar service
- **Multi-Delivery Options:** (NEW - BONUS FROM REUSABLE PATTERN)
  - Users can choose: DM, channel, or ephemeral
  - /setup command includes delivery option
  - Same content, different delivery

### COULD Have Requirements

- **Pick & Mix Interface:** String select for users to choose interests (complexity concern)
- **Redesigned /castlist:** Replace Back/Forward buttons with String Select navigation
  - Saves 2 component slots per page
  - Allows one additional player per page
- **Compact Castlist Mode:** Condensed view option
- **Castlist Configuration:** Settings for default view (user vs production perspective)

---

## 🏗️ New Architecture: Reusable Wizard Pattern

### Discovery: Delivery-Agnostic Design

**msg_test PoC proved this pattern:**

```mermaid
flowchart TD
    A[Multiple Entry Points] --> B{SetupWizard Engine}

    A1[guildCreate Event] --> B
    A2[/setup Command] --> B
    A3[Button in /menu] --> B
    A4[Tips Button] --> B

    B --> C{Content Generation}
    C --> C1[Welcome Screen]
    C --> C2[Tips Gallery 10 screenshots]
    C --> C3[Timezone Setup]
    C --> C4[Pronoun Setup]

    C1 --> D{Delivery Method}
    C2 --> D
    C3 --> D
    C4 --> D

    D --> D1[DM REST API]
    D --> D2[Channel Interaction]
    D --> D3[Ephemeral Interaction]

    D1 --> E[User Sees Wizard]
    D2 --> E
    D3 --> E

    E --> F[Button Click]
    F --> G[UPDATE_MESSAGE]
    G --> C

    style B fill:#51cf66
    style C fill:#ffd43b
    style D fill:#3498DB
    style G fill:#9b59b6
```

### Key Architectural Insight

**Content Generation ≠ Delivery Mechanism**

| Component | Responsibility | Reusable? |
|-----------|---------------|-----------|
| **Content Screens** | Generate Components V2 structures | ✅ Yes - Same everywhere |
| **Navigation Logic** | Handle button clicks, state transitions | ✅ Yes - UPDATE_MESSAGE works everywhere |
| **Delivery Method** | Send initial message (DM/channel/ephemeral) | ❌ No - Context-specific |

**Result:** Build screens ONCE, deliver MANY ways!

### System Flow (Updated with Multiple Entry Points)

```mermaid
flowchart TD
    subgraph Entry Points
        EP1[Bot Added: guildCreate] --> SM[SetupWizard Manager]
        EP2[/setup Command] --> SM
        EP3[Menu Button] --> SM
        EP4[Tips Button] --> SM
    end

    subgraph Wizard Engine
        SM --> Check{Check Context}
        Check -->|DM Delivery| DM[REST API Send]
        Check -->|Channel/Ephemeral| IR[Interaction Response]

        DM --> Welcome[Welcome Screen]
        IR --> Welcome

        Welcome --> Nav{Navigation}
        Nav -->|View Tips| Tips[Media Gallery 10 screenshots]
        Nav -->|Start Setup| Hierarchy[Role Hierarchy Check]
        Nav -->|Skip| Skip[Mark Skipped]

        Tips --> Nav
        Hierarchy --> Timezone[Timezone Setup]
        Timezone --> Pronoun[Pronoun Setup]
        Pronoun --> Complete[Setup Complete]
    end

    subgraph Data Persistence
        Complete --> PD[(playerData.json)]
        PD --> Track[Track: setupCompleted, version, timestamp]
    end

    style SM fill:#51cf66
    style Welcome fill:#ffd43b
    style Tips fill:#9b59b6
    style Complete fill:#339af0
```

---

## 🎨 Functional UI Specification

**⚠️ CRITICAL**: All UI MUST follow [Components V2](../docs/standards/ComponentsV2.md) patterns with proper [LEAN design](../docs/ui/LeanUserInterfaceDesign.md) standards.

### Architecture Alignment
- **Components V2**: See [ComponentsV2.md](../docs/standards/ComponentsV2.md) - Type 17 Container, Type 10 Text Display mandatory
- **Button Patterns**: See [ButtonHandlerFactory.md](../docs/enablers/ButtonHandlerFactory.md) - All buttons MUST use factory pattern
- **Menu Standards**: See [MenuSystemArchitecture.md](../docs/enablers/MenuSystemArchitecture.md) - Use MenuBuilder.create()
- **Visual Standards**: See [LeanUserInterfaceDesign.md](../docs/ui/LeanUserInterfaceDesign.md) - Icon + Title | Subtitle format
- **Common Pitfalls**: See [ComponentsV2Issues.md](../docs/troubleshooting/ComponentsV2Issues.md) - Avoid "This interaction failed" errors

---

## 🚨 CRITICAL: Components V2 Delivery Patterns

### Pattern 1: DM Delivery (REST API)

**MUST READ BEFORE IMPLEMENTING DM WIZARD:**

Discord.js's `user.send()` **DOES NOT SUPPORT** raw Components V2 JSON. You MUST use Discord REST API directly.

**Required Pattern:**
```javascript
// ✅ CORRECT: Use REST API for Components V2 in DMs
const dmChannel = await user.createDM();
await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
  method: 'POST',
  headers: {
    'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    flags: 1 << 15, // IS_COMPONENTS_V2 - MANDATORY!
    components: [{ type: 17, ... }]
  })
});

// ❌ WRONG: This fails with "component.toJSON is not a function"
await user.send({ components: [{ type: 17, ... }] });
```

**Complete Implementation Guide:** [DiscordMessenger.md - Components V2 in Direct Messages](../docs/enablers/DiscordMessenger.md#components-v2-in-direct-messages-critical)

**Why This Matters:**
- Discord.js expects builder objects (ActionRowBuilder, etc.)
- Raw JSON doesn't have `.toJSON()` method that Discord.js calls internally
- REST API accepts raw JSON structures directly
- Without `flags: 1 << 15`, Discord rejects Container (type 17) as invalid

### Pattern 2: Channel/Ephemeral Delivery (Interaction Response)

**Use standard interaction responses:**

```javascript
// ✅ CORRECT: Use interaction response for channels/ephemeral
return {
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: {
    flags: (1 << 15) | (ephemeral ? InteractionResponseFlags.EPHEMERAL : 0),
    components: [{ type: 17, ... }]
  }
};
```

### Pattern 3: Navigation (UPDATE_MESSAGE - Works Everywhere!)

**After the initial message is sent, ALL navigation uses UPDATE_MESSAGE:**

```javascript
// Button click handlers use UPDATE_MESSAGE (Type 7)
// This EDITS the existing message (same message ID)
// Works identically in DMs, channels, and ephemeral messages!
} else if (custom_id === 'wizard_continue') {
  return ButtonHandlerFactory.create({
    id: 'wizard_continue',
    handler: async (context) => {
      return {
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {
          components: [{ type: 17, ... }] // Next wizard screen
        }
      };
    }
  })(req, res, client);
}
```

**Critical Rules:**
1. **NO FLAGS in UPDATE_MESSAGE** - Discord rejects them (see ComponentsV2.md #1)
2. **Components V2 works natively** - Inherits from original message
3. **ButtonHandlerFactory auto-strips flags** - Safe to include in return object

**Wizard Flow Pattern:**
```
Step 1 (REST API or Interaction):  Send initial message with buttons
       ↓ user clicks
Step 2 (UPDATE_MESSAGE): Same message → new screen
       ↓ user clicks
Step 3 (UPDATE_MESSAGE): Same message → new screen
       ↓ continues...
```

**Result:** One message that morphs through wizard steps. Clean UX everywhere!

**Reference:** [DiscordMessenger.md - Button Interactions](../docs/enablers/DiscordMessenger.md#button-interactions-in-dms-update_message)

---

## 📸 Media Gallery Integration (Validated by msg_test PoC)

### Discovery: 10-Screenshot Carousel Works Perfectly

**msg_test PoC Results:**
- ✅ Media Gallery (type 12) supports 1-10 images
- ✅ Native Discord carousel/swipe (no custom code needed)
- ✅ Smooth performance at maximum capacity
- ✅ Works identically in DMs and channels
- ✅ Perfect for feature showcase

### Tips Screen (Using Media Gallery)

```javascript
// Validated pattern from msg_test PoC
{
  type: 17, // Container
  accent_color: 0x9b59b6, // Purple for tips
  components: [
    {
      type: 10,
      content: '## 💡 CastBot Features - Complete Tour\n\n**Swipe through all 10 screenshots to explore everything you can do!**\n\n📱 Mobile: Swipe left/right\n🖥️ Desktop: Click images to view'
    },
    { type: 14 }, // Separator
    {
      type: 12, // Media Gallery - CAROUSEL!
      items: [
        {
          media: { url: 'https://cdn.discordapp.com/...' },
          description: '🦁 Safari System - Create adventure challenges with maps, items, and player progression'
        },
        {
          media: { url: 'https://cdn.discordapp.com/...' },
          description: '📋 Dynamic Castlists - Organize cast members with placements, alumni, and custom formatting'
        },
        // ... 8 more screenshots (10 total)
      ]
    },
    { type: 14 },
    {
      type: 10,
      content: '> **`📸 Media Gallery Demo - MAX CAPACITY!`**\n• 10 real CastBot screenshots (Discord maximum!)\n• Native Discord carousel/swipe\n• Smooth performance at full capacity'
    },
    {
      type: 1, // Action Row
      components: [
        {
          type: 2,
          custom_id: 'wizard_back_to_welcome',
          label: '← Back to Welcome',
          style: 2,
          emoji: { name: '🏠' }
        }
      ]
    }
  ]
}
```

**10 CastBot Feature Screenshots:**
1. 🦁 Safari System
2. 📋 Dynamic Castlists
3. 📊 Production Menu
4. 🏆 Cast Rankings
5. 🎬 Season Management
6. 📱 Mobile View
7. 🎮 Player Menu
8. 🗺️ Safari Map Explorer
9. 📝 Application Builder
10. ⚙️ Settings & Configuration

---

## 📦 Implementation: setupWizard.js Module

### Reusable Wizard Engine

```javascript
// setupWizard.js - DELIVERY-AGNOSTIC WIZARD ENGINE
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';

export class SetupWizard {
  constructor(context) {
    // Context: where/how wizard is being used
    this.context = {
      guildId: context.guildId,
      userId: context.userId,
      guildName: context.guildName,
      deliveryMethod: context.deliveryMethod, // 'dm' | 'channel' | 'ephemeral'
      triggeredBy: context.triggeredBy // 'guildCreate' | 'command' | 'button'
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CONTENT GENERATION (Same for all contexts!)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  getWelcomeScreen() {
    const greeting = this.context.triggeredBy === 'guildCreate'
      ? `Thank you for adding CastBot to **${this.context.guildName}**!`
      : 'Thank you for using CastBot!';

    return {
      type: 17, // Container
      accent_color: 0x3498DB, // Blue
      components: [
        {
          type: 10,
          content: `## 🎭 Welcome to CastBot!\n\n${greeting}\n\nCastBot helps you run online reality game seasons with powerful features.`
        },
        { type: 14 },
        {
          type: 10,
          content: '> **`💚 Key Features`**\n• 🎬 Season management & applications\n• 🏆 Cast rankings & voting systems\n• 🦁 Safari adventure challenges\n• 📋 Dynamic castlist displays\n• ⏰ Timezone & pronoun roles'
        },
        { type: 14 },
        {
          type: 10,
          content: '> **`💬 Need Help?`**\nJoin our support server for:\n• ✅ Feature tutorials & guides\n• 🔧 Technical support\n• 🎯 New feature announcements\n• 👥 Community discussions'
        },
        { type: 14 },
        {
          type: 1, // Action Row
          components: [
            {
              type: 2,
              custom_id: 'wizard_view_tips',
              label: 'View Tips',
              style: 1, // Primary (blue)
              emoji: { name: '💡' }
            },
            {
              type: 2,
              custom_id: 'wizard_start_setup',
              label: 'Start Setup',
              style: 3, // Success (green)
              emoji: { name: '🚀' }
            },
            {
              type: 2,
              label: 'Join CastBot Server',
              style: 5, // Link
              url: 'https://discord.gg/H7MpJEjkwT',
              emoji: { name: '💬' }
            }
          ]
        }
      ]
    };
  }

  getTipsScreen() {
    // 10-screenshot Media Gallery (from msg_test PoC)
    return {
      type: 17,
      accent_color: 0x9b59b6, // Purple for tips
      components: [
        {
          type: 10,
          content: '## 💡 CastBot Features - Complete Tour\n\n**Swipe through all 10 screenshots to explore everything you can do!**\n\n📱 Mobile: Swipe left/right\n🖥️ Desktop: Click images to view\n🎯 Testing maximum Media Gallery capacity (10 items)'
        },
        { type: 14 },
        {
          type: 12, // Media Gallery
          items: [
            // Safari System
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1393487920886845482/1395848590521536543/image.png'
              },
              description: '🦁 Safari System - Create adventure challenges with maps, items, and player progression'
            },
            // Dynamic Castlists
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1395819813640601742/1395845331568165027/image.png'
              },
              description: '📋 Dynamic Castlists - Organize cast members with placements, alumni, and custom formatting'
            },
            // Production Menu
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1395819813640601742/1395844571656884364/image.png'
              },
              description: '📊 Production Menu - Comprehensive admin interface for managing all CastBot features'
            },
            // Cast Rankings
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1395819813640601742/1395844807884144640/image.png'
              },
              description: '🏆 Cast Rankings - Let players anonymously vote on applicants with visual ranking interface'
            },
            // Season Management
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1396857713165602867/1396858075406930000/image.png'
              },
              description: '🎬 Season Management - Configure applications, questions, and production workflows'
            },
            // Mobile View
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1424036358522933268/1424037413315149894/Screenshot_20251004-221110.png'
              },
              description: '📱 Mobile View - CastBot works seamlessly on mobile devices with responsive design'
            },
            // Player Menu
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1413166085347217529/1413332595613372597/Screenshot_20250905-091814.png'
              },
              description: '🎮 Player Menu - Access your profile, seasons, and interactive features from one place'
            },
            // Safari Map Explorer
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1413166085347217529/1413331729095196732/Screenshot_20250905-091519.png'
              },
              description: '🗺️ Safari Map Explorer - Interactive map system with fog of war and location tracking'
            },
            // Application Builder
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1412433607137427596/1414027501461569568/image.png'
              },
              description: '📝 Application Builder - Create custom season applications with multiple question types'
            },
            // Settings & Configuration
            {
              media: {
                url: 'https://cdn.discordapp.com/attachments/1412433607137427596/1413213874995597402/image.png'
              },
              description: '⚙️ Settings & Configuration - Fine-tune CastBot behavior for your server needs'
            }
          ]
        },
        { type: 14 },
        {
          type: 10,
          content: '> **`📸 Media Gallery Demo - MAX CAPACITY!`**\n• 10 real CastBot screenshots (Discord maximum!)\n• Native Discord carousel/swipe\n• Works in DMs and channels\n• UPDATE_MESSAGE (no REST API!)\n• Smooth performance at full capacity'
        },
        { type: 14 },
        {
          type: 1,
          components: [
            {
              type: 2,
              custom_id: 'wizard_back_to_welcome',
              label: '← Back to Welcome',
              style: 2,
              emoji: { name: '🏠' }
            }
          ]
        }
      ]
    };
  }

  getTimezoneSetupScreen() {
    // From StreamlinedSetup_All.md original spec
    return {
      type: 17,
      accent_color: 0x3498DB,
      components: [
        {
          type: 10,
          content: '## 🌍 Timezone Setup (NEW DST System!)\n\n**Step 1 of 3**'
        },
        { type: 14 },
        {
          type: 10,
          content: '**✨ NEW: Single-role timezone system**\n• One "CT" role instead of separate CST/CDT\n• Automatically adjusts for daylight saving\n• No more manual role switching!\n\n**Timezones to create:**\nPT, MT, CT, ET, AT, GMT, CET, AEST, NZST, and more'
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              custom_id: 'wizard_run_timezone_setup',
              label: 'Create Timezone Roles',
              style: 3,
              emoji: { name: '✅' }
            },
            {
              type: 2,
              custom_id: 'wizard_skip_timezones',
              label: 'Skip',
              style: 2,
              emoji: { name: '⏭️' }
            }
          ]
        }
      ]
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // DELIVERY (Context-aware!)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async sendInitialMessage(client, target) {
    const screen = this.getWelcomeScreen();

    if (this.context.deliveryMethod === 'dm') {
      // DM: Use REST API (requires client + user)
      return await this.sendViaDM(client, target.user, screen);
    } else if (this.context.deliveryMethod === 'ephemeral') {
      // Ephemeral: Use interaction response
      return this.sendViaInteraction(target.interaction, screen, true);
    } else {
      // Channel: Use interaction response
      return this.sendViaInteraction(target.interaction, screen, false);
    }
  }

  async sendViaDM(client, user, screen) {
    // REST API method (proven in msg_test PoC!)
    const dmChannel = await user.createDM();

    const response = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        flags: 1 << 15, // IS_COMPONENTS_V2
        components: [screen]
      })
    });

    return {
      success: response.ok,
      method: 'dm',
      channelId: dmChannel.id
    };
  }

  sendViaInteraction(interaction, screen, ephemeral = false) {
    // Standard interaction response (for commands/buttons in channels)
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: (1 << 15) | (ephemeral ? InteractionResponseFlags.EPHEMERAL : 0),
        components: [screen]
      }
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NAVIGATION (Always UPDATE_MESSAGE - works everywhere!)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  handleNavigation(buttonId) {
    let screen;

    switch (buttonId) {
      case 'wizard_view_tips':
        screen = this.getTipsScreen();
        break;
      case 'wizard_back_to_welcome':
        screen = this.getWelcomeScreen();
        break;
      case 'wizard_start_setup':
        screen = this.getTimezoneSetupScreen();
        break;
      default:
        return null;
    }

    // UPDATE_MESSAGE works in DMs, channels, ephemeral - everywhere!
    return {
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: {
        components: [screen]
      }
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONVENIENCE FUNCTIONS FOR COMMON USE CASES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Example 1: Auto-welcome DM (guildCreate event)
export async function sendWelcomeDM(client, guild, owner) {
  const wizard = new SetupWizard({
    guildId: guild.id,
    userId: owner.id,
    guildName: guild.name,
    deliveryMethod: 'dm',
    triggeredBy: 'guildCreate'
  });

  return await wizard.sendInitialMessage(client, { user: owner });
}

// Example 2: /setup command in channel
export function handleSetupCommand(interaction, deliveryMethod = 'ephemeral') {
  const wizard = new SetupWizard({
    guildId: interaction.guild_id,
    userId: interaction.member.user.id,
    guildName: interaction.guild?.name,
    deliveryMethod: deliveryMethod,
    triggeredBy: 'command'
  });

  return wizard.sendInitialMessage(null, { interaction });
}

// Example 3: Button in /menu (ephemeral)
export function handleMenuSetupButton(interaction) {
  const wizard = new SetupWizard({
    guildId: interaction.guild_id,
    userId: interaction.member.user.id,
    guildName: interaction.guild?.name,
    deliveryMethod: 'ephemeral',
    triggeredBy: 'button'
  });

  return wizard.sendInitialMessage(null, { interaction });
}

// Example 4: Navigation (works everywhere!)
export function handleWizardNavigation(interaction, buttonId) {
  const wizard = new SetupWizard({
    guildId: interaction.guild_id,
    userId: interaction.member.user.id,
    guildName: interaction.guild?.name,
    deliveryMethod: 'any', // Doesn't matter for UPDATE_MESSAGE!
    triggeredBy: 'navigation'
  });

  return wizard.handleNavigation(buttonId);
}
```

---

## 🎯 Multiple Entry Points Integration

### Entry Point 1: Auto-Welcome DM (guildCreate Event)

```javascript
// app.js - guildCreate event handler
client.on('guildCreate', async (guild) => {
  console.log(`✅ Bot added to new server: ${guild.name} (${guild.id})`);

  try {
    // Initialize server data
    await ensureServerData(guild);

    // Send welcome DM using wizard
    const owner = await guild.fetchOwner();
    const result = await sendWelcomeDM(client, guild, owner);

    if (result.success) {
      console.log(`✅ Welcome DM sent to ${owner.user.username}`);
    } else {
      console.warn(`⚠️ Could not send welcome DM (owner has DMs disabled)`);
    }
  } catch (error) {
    console.error(`❌ Error in guildCreate handler:`, error);
  }
});
```

### Entry Point 2: /setup Slash Command

```javascript
// Register slash command
{
  name: 'setup',
  description: 'Run CastBot setup wizard',
  options: [
    {
      name: 'location',
      description: 'Where to show wizard',
      type: 3, // String
      choices: [
        { name: 'Here (visible to everyone)', value: 'channel' },
        { name: 'DM me privately', value: 'dm' },
        { name: 'Here (only I can see)', value: 'ephemeral' }
      ]
    }
  ]
}

// Handler in app.js
if (interaction.data.name === 'setup') {
  const location = interaction.data.options?.[0]?.value || 'ephemeral';

  if (location === 'dm') {
    // Send to DM
    const user = await client.users.fetch(interaction.member.user.id);
    const guild = await client.guilds.fetch(interaction.guild_id);
    await sendWelcomeDM(client, guild, user);

    return {
      type: 4,
      data: {
        content: '✅ Setup wizard sent to your DMs!',
        flags: 64 // Ephemeral
      }
    };
  } else {
    // Show in channel or ephemeral
    return handleSetupCommand(req.body, location);
  }
}
```

### Entry Point 3: Button in /menu

```javascript
// Add to Production Menu or Player Menu
{
  type: 2,
  custom_id: 'menu_setup_wizard',
  label: 'Setup Wizard',
  style: 1, // Primary (blue)
  emoji: { name: '🚀' }
}

// Handler in app.js
} else if (custom_id === 'menu_setup_wizard') {
  return ButtonHandlerFactory.create({
    id: 'menu_setup_wizard',
    ephemeral: true,
    handler: async (context) => {
      return handleMenuSetupButton(req.body);
    }
  })(req, res, client);
}

// Register in BUTTON_REGISTRY
'menu_setup_wizard': {
  label: 'Setup Wizard',
  description: 'Launch CastBot setup wizard',
  emoji: '🚀',
  style: 'Primary',
  category: 'setup'
}
```

### Entry Point 4: Tips Button (Anywhere)

```javascript
// Add "View Tips" button to any menu
{
  type: 2,
  custom_id: 'show_tips',
  label: 'Tips',
  style: 2,
  emoji: { name: '💡' }
}

// Handler - jumps directly to tips screen
} else if (custom_id === 'show_tips') {
  return ButtonHandlerFactory.create({
    id: 'show_tips',
    ephemeral: true,
    handler: async (context) => {
      const wizard = new SetupWizard({
        guildId: req.body.guild_id,
        userId: req.body.member.user.id,
        deliveryMethod: 'ephemeral',
        triggeredBy: 'button'
      });

      // Jump directly to tips screen
      return {
        type: 7, // UPDATE_MESSAGE (if from menu) or 4 (if new message)
        data: {
          flags: (1 << 15) | 64, // Components V2 + Ephemeral
          components: [wizard.getTipsScreen()]
        }
      };
    }
  })(req, res, client);
}
```

### Universal Navigation Handlers

```javascript
// All wizard navigation buttons use the same handler pattern
const wizardButtons = [
  'wizard_view_tips',
  'wizard_back_to_welcome',
  'wizard_start_setup',
  'wizard_run_timezone_setup',
  'wizard_skip_timezones'
];

// In button routing section
if (wizardButtons.includes(custom_id)) {
  return ButtonHandlerFactory.create({
    id: custom_id,
    handler: async (context) => {
      return handleWizardNavigation(req.body, custom_id);
    }
  })(req, res, client);
}
```

---

## 📊 Implementation Phases (UPDATED)

### 🚀 PHASE 1: Create Reusable Wizard Engine (3-4 hours)

**Priority:** CRITICAL - Foundation for everything
**Complexity:** LOW-MEDIUM - Migrate msg_test PoC patterns

#### Tasks:

1. **Create setupWizard.js** (2 hours)
   - SetupWizard class with content generation methods
   - getWelcomeScreen(), getTipsScreen(), getTimezoneSetupScreen()
   - Delivery methods: sendViaDM(), sendViaInteraction()
   - Navigation handler: handleNavigation()
   - Convenience functions for common use cases

2. **Migrate msg_test PoC Content** (1 hour)
   - Copy 10-screenshot Media Gallery from msg_test
   - Adapt welcome message content
   - Add button configurations
   - Test in isolation

3. **Button Registration** (30 min)
   - Register all wizard buttons in BUTTON_REGISTRY
   - Add to buttonHandlerFactory.js
   - Document button patterns

4. **Testing** (30 min)
   - Unit test content generation
   - Test delivery methods independently
   - Verify UPDATE_MESSAGE navigation

**Deliverable:** Working SetupWizard class ready for integration

---

### 🎯 PHASE 2: Add Entry Points (2-3 hours)

**Priority:** HIGH - Enable multiple access patterns
**Complexity:** LOW - Reuse wizard engine

#### Tasks:

1. **Enable guildCreate Auto-DM** (30 min)
   - Add guildCreate event handler
   - Call sendWelcomeDM()
   - Test with test server

2. **Add Test Button to Analytics Menu** (30 min)
   - Add "Wizard Test" button
   - Test ephemeral delivery
   - Validate navigation

3. **Register /setup Slash Command** (1 hour)
   - Define command structure
   - Add delivery location option
   - Implement handler with 3 delivery methods

4. **Add Setup Button to /menu** (30 min)
   - Add to Production Menu
   - Add to Player Menu (optional)
   - Test ephemeral delivery

5. **Add Tips Button** (30 min)
   - Add to Production Menu
   - Jump directly to tips screen
   - Test Media Gallery display

**Deliverable:** Multiple working entry points

---

### 🌍 PHASE 3: DST Timezone System (4-6 hours)

**Priority:** CRITICAL - Nov 2 deadline
**Complexity:** MEDIUM - Role management + data migration

#### Tasks:

1. **Implement Manual DST Toggle** (2 hours)
   - See original StreamlinedSetup_All.md Phase 3 section
   - Add admin button in Reece Stuff Menu
   - toggleDSTForAllServers() function

2. **Add Timezone Setup Screen** (2 hours)
   - Single-role creation logic
   - Integration with wizard
   - Testing with sample data

3. **Migration Path** (2 hours)
   - Convert existing dual-role servers
   - Backward compatibility
   - Data structure updates

**Deliverable:** Working DST-aware timezone system

---

### ✨ PHASE 4: Polish & Enhancement (2-3 hours)

**Priority:** MEDIUM - UX improvements
**Complexity:** LOW - Refinements

#### Tasks:

1. **Role Hierarchy Check Screen** (1 hour)
   - From StreamlinedSetup_All.md original spec
   - Visual guide for fixing hierarchy
   - Test/retry logic

2. **Tracking & Analytics** (1 hour)
   - Per-admin tracking in playerData
   - Setup completion metrics
   - Drop-off analysis

3. **Tips System Enhancements** (1 hour)
   - Add tips to Production Menu
   - Rotating tip selection
   - Context-aware tips

**Deliverable:** Production-ready wizard system

---

## 📊 Comparison: Before vs After

| Aspect | Original Plan (DM-Only) | New Plan (Reusable) |
|--------|-------------------------|---------------------|
| **Entry Points** | 1 (guildCreate) | 4+ (event, command, buttons) |
| **Delivery** | DM only | DM, channel, ephemeral |
| **Users** | Owner only | Any admin, any user |
| **Re-runnable** | ❌ No | ✅ Yes, anytime |
| **Testing** | Hard (add/remove bot) | Easy (button in /menu) |
| **Code Reuse** | Low | High (tips, help, onboarding) |
| **Maintenance** | Duplicate code | Single source of truth |
| **Tips System** | Separate implementation | Same wizard engine |
| **Implementation Time** | 12-16 hours | 9-13 hours (faster!) |
| **Future Features** | Requires refactoring | Drop-in additions |

---

## 🏗️ Technical Architecture (Updated)

### Data Structure (Enhanced with Reusable Pattern)

```javascript
// playerData.json additions
{
  "guildId": {
    // NEW: Setup tracking (per-server)
    "setupCompleted": true,
    "setupVersion": "2.0.0", // Updated for reusable wizard
    "setupCompletedAt": 1729699200000,
    "setupCompletedBy": "userId",
    "setupMethod": "guildCreate", // "guildCreate" | "command" | "button"

    // NEW: Admin tracking (per-admin)
    "adminTracking": {
      "userId1": {
        "firstInteraction": 1729699200000,
        "lastInteraction": 1729699999999,
        "setupCompleted": true,
        "setupCompletedAt": 1729699300000,
        "interactions": [
          { "action": "opened_menu", "timestamp": 1729699200000 },
          { "action": "viewed_tips", "timestamp": 1729699250000 },
          { "action": "completed_setup", "timestamp": 1729699300000 }
        ]
      }
    },

    // NEW: Tips tracking
    "tipsViewed": {
      "userId1": {
        "count": 5,
        "lastViewed": 1729699400000,
        "viewedScreenshots": [0, 1, 2, 3, 4] // Indices of screenshots seen
      }
    },

    // NEW: Timezone V2 (single-role DST)
    "timezones": {
      "CT": {  // Single role instead of CST/CDT
        "roleId": "...",
        "displayName": "Central Time",
        "standardOffset": -6,
        "dstOffset": -5,
        "currentOffset": -6,  // Updated on DST changes
        "isDST": false,
        "lastUpdated": 1729699200000
      }
    }
  }
}
```

---

## 🔑 Key Architectural Insights

### 1. Separation of Concerns

```
┌────────────────────────────────────────┐
│         CONTENT GENERATION             │
│  (What to show - reusable everywhere)  │
│  • Welcome Screen                      │
│  • Tips Gallery (10 screenshots)       │
│  • Timezone Setup                      │
│  • Pronoun Setup                       │
└───────────┬────────────────────────────┘
            │
            ↓
┌────────────────────────────────────────┐
│       DELIVERY MECHANISM               │
│  (How to show - context-specific)      │
│  • DM: REST API                        │
│  • Channel: Interaction Response       │
│  • Ephemeral: Interaction + Flag       │
└───────────┬────────────────────────────┘
            │
            ↓
┌────────────────────────────────────────┐
│         NAVIGATION                     │
│  (Moving between screens - universal)  │
│  • UPDATE_MESSAGE                      │
│  • Works identically everywhere        │
└────────────────────────────────────────┘
```

### 2. Single Source of Truth

**Before (DM-Only):**
- Welcome message in discordMessenger.js
- Tips system would be separate module
- Help flows would duplicate content
- Testing requires add/remove bot

**After (Reusable):**
- Welcome message in setupWizard.js
- Tips system uses same Media Gallery
- Help flows reference same screens
- Testing via button in /menu

### 3. Progressive Enhancement

**Users can discover features at their own pace:**

```
New User Journey:
  1. Install bot → Auto-DM with welcome
  2. Click "View Tips" → See 10 screenshots
  3. Later: /menu → Click "Setup Wizard" → Re-run setup
  4. Much later: /setup command → Show wizard to new admin

All use same code, same UX, consistent experience!
```

---

## 💡 Additional Benefits

### 1. Built-in Testing

**Before:**
- Test by adding/removing bot from server
- Can't iterate quickly
- Hard to debug issues

**After:**
- Test button in Analytics Menu
- Iterate in seconds
- Easy to debug with console logs

### 2. Multi-Admin Support

**Before:**
- Only owner sees auto-DM
- Other admins never get onboarded
- Production teams miss features

**After:**
- Each admin can run /setup or click button
- Track per-admin progress
- Entire team gets onboarded

### 3. Tips System (Should Have Requirement)

**Before:**
- Would need separate implementation
- Duplicate Media Gallery code
- Different navigation patterns

**After:**
- Reuses wizard engine
- Same 10-screenshot gallery
- Consistent navigation UX
- Zero duplicate code!

### 4. Future Features (Bonus)

**These become trivial to add:**
- Help flows ("Need help with Safari?" → Show Safari screenshot)
- Contextual tips (First time in Production Menu → Show tip)
- Onboarding flows (New season created → Show application builder)
- Feature announcements (New feature → Show screenshot in tips)

All use the same SetupWizard class!

---

## 🎯 Success Metrics

### Pre-Launch Checklist

**Technical Validation:**
- [ ] SetupWizard class passes unit tests
- [ ] All 4 entry points work (guildCreate, /setup, menu button, tips button)
- [ ] Navigation works in all contexts (DM, channel, ephemeral)
- [ ] Media Gallery displays all 10 screenshots
- [ ] Mobile and desktop UX tested

**Content Validation:**
- [ ] Welcome message uses correct branding
- [ ] All 10 screenshots are current and accurate
- [ ] Button labels follow LEAN design standards
- [ ] Alt text for all screenshots (accessibility)
- [ ] Support server link works

**Integration Validation:**
- [ ] BUTTON_REGISTRY entries complete
- [ ] ButtonHandlerFactory patterns followed
- [ ] Components V2 compliance verified
- [ ] No "This interaction failed" errors
- [ ] Logging standards followed

### Post-Launch Metrics

**Quantitative:**
- **Welcome DM delivery rate:** Target >85% (owner has DMs enabled)
- **Setup wizard start rate:** Target >60% of new servers
- **Setup completion rate:** Target >40% of starters
- **Tips view rate:** Target >30% of admins view tips
- **Feature adoption:** Target 2x baseline (Safari 30%, Stores 10%)

**Qualitative:**
- User feedback on wizard UX
- Support tickets related to setup
- Feature discovery patterns
- Admin satisfaction scores

---

## ⚠️ Risk Assessment (Updated)

### Low Risk (Reduced from Original)

#### Risk 1: Testing Difficulty
**Original:** High risk - hard to test DM-only system
**Updated:** Low risk - button in /menu enables easy testing
**Mitigation:** Test button added in Phase 2, continuous iteration

#### Risk 2: Multi-Admin Support
**Original:** Medium risk - only owner gets onboarded
**Updated:** Low risk - any admin can access wizard
**Mitigation:** /setup command and menu button serve all admins

#### Risk 3: Tips System Implementation
**Original:** High risk - separate implementation needed
**Updated:** Low risk - reuses wizard engine
**Mitigation:** Same code, tested patterns

### Medium Risk (Unchanged)

#### Risk 4: DST Transition (Nov 2)
**Impact:** All timezone roles show wrong time
**Likelihood:** Medium (new system, limited testing time)
**Mitigation:**
- Manual toggle as primary approach
- Keep dual-role system as fallback
- Test on subset of servers first

### Eliminated Risks

#### ~~Risk: Welcome Message Spam~~
**Status:** Eliminated by reusable pattern
**Why:** Users can choose delivery method (DM/channel/ephemeral)

#### ~~Risk: Abandonment (No Re-run)~~
**Status:** Eliminated by reusable pattern
**Why:** Users can re-run wizard anytime via /setup or menu button

---

## 🚀 Recommended Implementation Sequence

### Week 1: Foundation (Phase 1)
**Days 1-2:** Build SetupWizard class
- Day 1: Content generation methods
- Day 2: Delivery methods + navigation

**Days 3-4:** Migrate msg_test content
- Day 3: 10-screenshot Media Gallery
- Day 4: Welcome screen + button registration

**Day 5:** Testing & polish
- Unit tests
- Integration tests
- Bug fixes

### Week 2: Entry Points (Phase 2)
**Days 1-2:** Multiple entry points
- Day 1: guildCreate + test button
- Day 2: /setup command + menu button

**Days 3-4:** Tips system
- Day 3: Tips button integration
- Day 4: Tips tracking

**Day 5:** Testing & refinement
- Test all entry points
- UX polish
- Documentation

### Week 3: DST System (Phase 3)
**Days 1-3:** DST implementation (CRITICAL for Nov 2!)
- Day 1: Manual toggle button
- Day 2: Single-role timezone logic
- Day 3: Migration path

**Days 4-5:** Testing & validation
- Test with multiple servers
- Verify DST toggle works
- Document rollback plan

### Week 4: Polish (Phase 4)
**Days 1-2:** Role hierarchy check
**Days 3-4:** Analytics & tracking
**Day 5:** Production deploy

**Total:** 4 weeks to complete system

---

## 💾 Rollback Plan

### If Critical Issue Found

**Step 1: Disable Auto-Welcome**
```javascript
// In discordMessenger.js
static async sendWelcomePackage(client, guild) {
  console.log(`🔕 Welcome messages temporarily disabled`);
  return { success: true, dmSent: false, note: 'Disabled' };
}
```

**Step 2: Remove Entry Points**
- Comment out guildCreate handler
- Disable /setup command
- Hide menu buttons temporarily

**Step 3: Deploy Hotfix**
```bash
npm run deploy-remote-wsl
```

**Step 4: Investigate & Fix**
- Review error logs
- Fix issue in setupWizard.js
- Test thoroughly
- Re-enable incrementally

### Gradual Rollout Strategy

**Phase A: Internal Testing (Week 1)**
- Enable test button in Analytics Menu only
- Test with development server
- Iterate on content/UX

**Phase B: Limited Release (Week 2)**
- Enable for 2-3 trusted servers
- Monitor error logs
- Gather feedback

**Phase C: Full Release (Week 3)**
- Enable guildCreate auto-DM
- Enable /setup command
- Add menu buttons
- Monitor metrics

---

## 📚 Key Technical References

### Must Read Before Implementation

1. **[ComponentsV2.md](../docs/standards/ComponentsV2.md)** - Type 17 Container, Type 10 Text Display, Type 12 Media Gallery
2. **[DiscordMessenger.md](../docs/enablers/DiscordMessenger.md)** - Components V2 in DMs, UPDATE_MESSAGE patterns
3. **[ButtonHandlerFactory.md](../docs/enablers/ButtonHandlerFactory.md)** - Button registration, factory pattern
4. **[LeanUserInterfaceDesign.md](../docs/ui/LeanUserInterfaceDesign.md)** - Visual standards, icon usage
5. **[ComponentsV2Issues.md](../docs/troubleshooting/ComponentsV2Issues.md)** - Common pitfalls, error prevention

### Related Documentation

6. **[DiscordEmojiResource.md](../docs/standards/DiscordEmojiResource.md)** - CastBot emoji system (🎭🦁🏆📋)
7. **[MenuSystemArchitecture.md](../docs/enablers/MenuSystemArchitecture.md)** - Menu building patterns
8. **[DiscordInteractionPatterns.md](../docs/standards/DiscordInteractionPatterns.md)** - Interaction handling
9. **[LoggingStandards.md](../docs/standards/LoggingStandards.md)** - Console logging patterns
10. **[ButtonInteractionLogging.md](../docs/standards/ButtonInteractionLogging.md)** - Button analytics

---

## 📝 Next Actions (Immediate)

### Start Implementation

**Today:**
1. ✅ Create setupWizard.js file
2. ✅ Migrate msg_test PoC content
3. ✅ Test content generation methods

**This Week:**
1. Add guildCreate handler
2. Add test button to Analytics Menu
3. Test auto-welcome + manual trigger
4. Register all buttons in BUTTON_REGISTRY

**Next Week:**
1. Add /setup slash command
2. Add menu buttons
3. Implement DST toggle (Nov 2 deadline!)
4. Production deploy

---

## 🎭 Conclusion: A Better Architecture

The reusable wizard pattern discovered through msg_test PoC fundamentally changes the implementation approach:

### What Changed

**Before:** Build a DM-only welcome wizard
**After:** Build a delivery-agnostic wizard engine

**Before:** One entry point (guildCreate)
**After:** Multiple entry points (event, command, buttons)

**Before:** Hard to test and iterate
**After:** Easy testing via menu button

**Before:** Tips system needs separate implementation
**After:** Tips system reuses wizard engine

### Why This Matters

**For Users:**
- ✅ Discover features at their own pace
- ✅ Access wizard anytime, anywhere
- ✅ Choose delivery method (DM/channel/ephemeral)
- ✅ Consistent UX across all touchpoints

**For Development:**
- ✅ Single source of truth
- ✅ Less code, less maintenance
- ✅ Easy to add new features
- ✅ Fast iteration cycles

**For Product:**
- ✅ Meets all original requirements
- ✅ Adds bonus features (tips, multi-admin)
- ✅ Future-proofs architecture
- ✅ Reduces implementation time!

### The Power of Discovery

This reusable pattern wasn't in the original plan. It emerged from:
1. Building msg_test PoC to validate Components V2 in DMs
2. Realizing Media Gallery + UPDATE_MESSAGE works everywhere
3. Questioning: "Why limit this to DMs only?"
4. Recognizing: Content generation ≠ Delivery mechanism

**This is emergent design in action!** 🎉

---

**Document Status:** ✅ Ready for implementation with reusable wizard pattern
**Next Review:** After Phase 1 completion (setupWizard.js built)
**Architecture:** Validated by msg_test PoC, delivery-agnostic, production-ready

---

## 📎 APPENDIX A: Original User Requirements (Preserved)

*The following is the exact, unmodified content from the original requirements:*

```markdown
# Streamlined Setup Experience

Reece's Preferred Feature Implementation Approach: High Level Design, then incrementally tick off requirements below (bias to 'start' and emergent design, no Big Design Up Front). Let's build this out in order of a 'new user'

## Overview
I want to create a new 'welcome' install experience for new servers of my bot, help me brainstorm features and a robust technical design that re-uses our core features to maximise usage of our features.

## Objectives
* Get the bot ready for an anticipated increase in users based on release of the new CastlistV3 feature (+ advertising) with the Streamlined Setup and Welcome Messages in place already
* Increase adoption of CastBot features (most users only leverage the basic 'Season Castlists' feature and don't use Safari / Stores / Items / Winners / Alumni Castlists)
* Implement timezone changes simplifying timezone management and enabling to prepare for Daylight Savings timezones changes on Sun Nov 2nd 2025 (today is Monday 20 October 2025), making it easier for users to understand and select their own timezones and reduce number of roles taken
* Improve 'converted' users from those just prospectively installing the app to their servers
* Guide users toward CastBot Support Server and other resources to get them started.

[... rest of original requirements preserved for historical context ...]
```

---

*The theater masks 🎭 represent both analysis and storytelling - good documentation needs both. The reusable wizard pattern adds 🎨 (design) and 🔄 (iteration)!*
