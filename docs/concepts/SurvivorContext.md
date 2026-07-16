# Survivor / ORG Context

**What this doc is for**: the domain knowledge you need to understand *why* CastBot is shaped the way it is. If you're implementing a feature and something seems arbitrary ("why does a channel get renamed when someone withdraws?"), the answer is probably a genre convention documented here.

Two halves:
1. **[The ORG Domain](#the-org-domain)** — how online reality games actually run: confessionals, subs, 1on1s, alliances, player roles, trusted spectators.
2. **[Season Lifecycle](#season-lifecycle)** — how CastBot models a season in data.

---

## The ORG Domain

CastBot serves **ORGs** (Online Reality Games) — fan-run Survivor-style games played in Discord servers. A **host** (a.k.a. admin / production member) runs the game; **players** compete; **spectators** watch.

The genre has strong channel conventions. Hosts currently create most of these **by hand**, one channel at a time — a 16-player season is ~150 channels, redone at every tribe swap. Automating this is what [Channel Administration](../03-features/ChannelAdministration.md) exists for.

### 🎙️ Confessionals
A private channel where a player records their thoughts, strategy, and commentary on other players — the Discord equivalent of the Survivor confessional booth. Read by hosts and (usually) trusted spectators; it's the main way an audience follows a player's reasoning.

- **Naming**: `#reece-confessional`, sometimes `#reece-conf`
- **Access**: the player (write) + hosts + trusted spectators (read)

### 🗳️ Subs (submissions)
A private, **player↔host-only** channel for sensitive communication and challenge submissions. Spectators must NOT see these.

- **Naming**: `#reece-subs`, `#reece-submissions`, sometimes emoji-prefixed (`#🗳️reece-subs`)
- **Convention**: a cast player's **application channel is converted into their subs channel** — the channel already exists and already has the right two parties in it.
- ⚠️ **This conversion is destructive to CastBot's status signals** — see [Withdrawal](#-withdrawal-lives-in-the-channel-name) below.

### 👀 Trusted Spectator
A role marking spectators whom known users have vouched for. It generally grants access to player confessionals. There is exactly **one** such role per server.

- **Stored**: `playerData[guildId].permissions.trustedSpectatorRoleId` (beside `globalRoleAccess`)

### 🤝 1on1s
Private player-to-player conversation. Some servers let players use Discord DMs; many instead create **1on1 channels** so hosts can monitor player-to-player chat (usually to watch for rule-breaking — sometimes just curiosity).

- **Rule**: for each pair of players on the same tribe, one channel containing exactly those two.
- **Naming**: `#reece-bob`, `#reece-sarah`, `#sarah-bob`
- ⚠️ **Combinatorial**: n players → n(n−1)/2 channels. A 12-player tribe is 66 channels; 20 players is 190 — against Discord's hard ceiling of **500 channels / 50 categories per guild**.

### 🤐 Alliances
A group of players on the same tribe who have agreed to work together. **The existence of an alliance is extremely sensitive game information** — leaking it can decide a season. Any alliance feature must be very closely guarded. CastBot deliberately does **not** model alliances yet.

### 🎭 Player Roles
A Discord role assigned to exactly one player. Its purpose is *removal*: un-assigning one role instantly strips a voted-out player from every alliance channel, 1on1, and confessional at once — no per-channel cleanup.

- **Stored**: `playerData[guildId].players[userId].playerRoleId`
- Players and hosts like to **customise the role colour** (it colours their name in chat).
- Prefer granting channel access to the *player role* over the user directly — that's what makes the one-click removal work.

### ✖️ Withdrawal lives in the channel name
A player who quits during applications is marked by renaming their application channel with a `✖️` prefix. **There is no `withdrawn` data field** — the emoji prefix on the *live* channel name IS the signal (`playerStatus.js` → `buildStatusSignals`).

Channel-name emoji vocabulary:

| Emoji | Meaning |
|---|---|
| 📝 | Application in progress |
| ☑️ | Application submitted / complete |
| ✖️ | Withdrawn |
| ✅ | Accepted |
| ❌ | Declined |

⚠️ **Consequence**: anything that renames an application channel destroys these signals. This is why converting an app channel to subs must first persist `completedAt` as data — see [ChannelAdministration.md](../03-features/ChannelAdministration.md).

### Admin / Host / Production Member
Used interchangeably for users with elevated permissions. **Required**: `MANAGE_CHANNELS` **OR** `MANAGE_ROLES`.

They can access the Production Menu (`/menu`), manage seasons and castlists, configure tribes/roles, and use administrative features.

---

## Season Lifecycle

Seasons are the core organizing principle in CastBot. They represent discrete casting periods with distinct phases, players, and outcomes. The active season concept allows the entire server to operate within a shared context.

**Note**: Seasons are stored as `applicationConfigs` in `playerData.json` - this is a legacy naming convention that will eventually be refactored.

### 🚨 `configId` vs `seasonId` — the single most confusing thing here

There are **two** ID systems and they are not interchangeable:

| ID | What it is | Keys off it |
|---|---|---|
| **`configId`** | the KEY into `applicationConfigs` (e.g. `config_1751549410029_391415444084490240`) | `applications[].configId`, every Season Manager `custom_id` |
| **`seasonId`** | a FIELD on the config (e.g. `season_03859e4abc554bb5`) | `castlistConfigs.seasonId`, `seasonRounds` |

Multiple configs can share one `seasonId`. `activeSeason.id` is a **configId**, despite the name. `seasonExists(seasonId)` (`seasonSelector.js`) actually expects a configId. The only place that bridges the two is `getPlayerSeasonStatus` (`playerStatus.js`).

## Active Season Concept

### Purpose
The active season serves as the **default context** for all season-related features across the server. Rather than requiring users to select a season for every action, the system maintains a server-wide active season that persists across sessions.

### Storage Structure
```javascript
// In playerData.json at guild level
{
  "1297188286191767603": {  // Guild ID
    "players": { ... },
    "tribes": { ... },
    "applicationConfigs": {  // These ARE the seasons
      "config_1751549410029_391415444084490240": {
        "seasonName": "Season 47: Redemption Island",
        "stage": "applications",   // NOTE: the field is `stage`, not `currentStage`
        // ... other season data
      }
    },
    "activeSeason": {  // NEW: Tracks currently active season
      "id": "config_1751549410029_391415444084490240",
      "name": "Season 47: Redemption Island",
      "stage": "applications"
    }
  }
}
```

### Setting Active Season
Active season is set through the Production Menu header's "Change Szn" button:
1. User clicks "Change Szn" button in Production Menu header
2. Season selector dropdown appears (powered by `seasonSelector.js`)
3. User selects from existing seasons in `applicationConfigs`
4. System saves selection to `playerData.json` at guild level
5. Production Menu header updates to show season name

### Display Behavior
- **No Active Season**: Header shows "CastBot | Production Menu"
- **Active Season Set**: Header shows "CastBot | [Season Name]"
- Example: "CastBot | Season 47: Redemption Island"

## Season Selector Component

### Reusable Component (`seasonSelector.js`)
The season selector is a **reusable UI component** that pulls seasons from `applicationConfigs`:

```javascript
import { createSeasonSelector } from './seasonSelector.js';

// Create selector that reads from applicationConfigs
const selector = await createSeasonSelector(guildId, {
  customId: 'my_season_select',
  placeholder: 'Select your season...',
  includeCreateNew: true,     // Show "Create New Season" option
  showArchived: false,         // Hide archived seasons
  filterStage: 'applications'  // Only show seasons in specific stage
});
```

### Helper Functions
```javascript
// Get emoji for season stage
getSeasonStageEmoji('applications') // Returns 📝

// Get display name for stage  
getSeasonStageName('voting') // Returns "Voting"
```

## Season Stages

Seasons (stored in `applicationConfigs`) progress through distinct stages:

1. **Planning** 🗓️ - Initial setup and configuration
2. **Applications** 📝 - Accepting player applications
3. **Voting** 🗳️ - Cast voting period
4. **Results** 📊 - Results announcement
5. **Active** ▶️ - Season in progress
6. **Complete** ✅ - Season finished
7. **Archived** 📦 - Historical reference

## Integration Points

### Current Integrations
- **Production Menu**: Shows active season in header
- **Season Applications**: Creates and manages seasons in `applicationConfigs`
- **Change Season Button**: Updates `activeSeason` in playerData

### Future Integrations
- **Castlist System**: Will use active season for default cast selection
- **Safari System**: Tie safari rounds to active season
- **Casting**: Default to active season's cast
- **Player Stats**: Filter by active season
- **Whisper System**: Season-specific whisper channels

## Data Architecture

### playerData.json Structure
The main storage file contains all server data:
```javascript
{
  "guildId": {
    "players": {},           // Player-specific data (ages, emojis)
    "tribes": {},           // Tribe/role configurations
    "timezones": {},        // Timezone role mappings
    "pronounRoleIDs": [],   // Pronoun role IDs
    "applicationConfigs": {},  // SEASONS (poorly named)
    "activeSeason": {},     // Currently active season reference
    "castlists": {},        // Castlist configurations
    // ... other guild data
  }
}
```

### Why "applicationConfigs"?
Historical context: Originally designed for application management, but evolved into full season management. The name persists for backwards compatibility but conceptually these **ARE** seasons.

## Technical Implementation

### Data Flow
1. **Selection**: User selects season from `applicationConfigs` via dropdown
2. **Storage**: Handler saves reference to `playerData[guildId].activeSeason`
3. **Display**: Menu generation reads `activeSeason` field
4. **Usage**: Features check `playerData[guildId].activeSeason` for context

### Code Example
```javascript
// Setting active season (written by the Change Szn flow)
playerData[guildId].activeSeason = {
  id: selectedValue,  // References applicationConfigs key
  name: season.seasonName,
  stage: season.stage || 'planning'
};
await savePlayerData(playerData);

// In app.js - Reading active season for display
const activeSeason = playerData[guildId]?.activeSeason;
const menuTitle = activeSeason?.name 
  ? `## CastBot | ${activeSeason.name}`
  : `## CastBot | Production Menu`;
```

### Error Handling
- Missing active season: Features use fallback behavior
- Invalid season ID: Check if still exists in `applicationConfigs`
- Deleted season: Clear active season, notify user

## Migration Strategy

### From Manual Selection
Previous approach required selecting season for every action:
```javascript
// OLD: Every feature asks for season
"Select season for castlist..."
"Select season for applications..."
"Select season for rankings..."

// NEW: Use active season by default
const seasonId = playerData[guildId]?.activeSeason?.id;
const season = playerData[guildId]?.applicationConfigs?.[seasonId];
```

### Backwards Compatibility
- Existing `applicationConfigs` remain unchanged
- Active season is optional - features work without it
- Gradual migration as features are updated

## Terminology

### Admin / Host / Production Member
Throughout CastBot documentation and UI, these terms are used interchangeably to refer to users with elevated permissions:

**Required Permissions**: `MANAGE_CHANNELS` **OR** `MANAGE_ROLES`

Users with either of these Discord permissions can:
- Access Production Menu (`/menu` → Production Menu button)
- Manage seasons and castlists
- Configure tribes and roles
- Access administrative features

**Common Usage**:
- "Admin" - General term for users with permissions
- "Host" - User running the season/game
- "Production Member" - Team member with production access

**Example**: "Production members can add tribes via Tribes > Add Tribe > Select Tribes > Select Castlist"

## Best Practices

### For Developers
1. **Check active season** before prompting for selection
2. **Validate season exists** in `applicationConfigs`
3. **Handle missing season** gracefully with fallbacks
4. **Update displays** when active season changes
5. **Use permission check**: `member.permissions.has(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles)`

### For Admins/Hosts/Production
1. **Set active season** at start of casting period
2. **Change via header button** when switching seasons
3. **All features** will use this as default context
4. **Manage tribes** through Production Menu for active season

## Related Documentation
- [Season Applications](../03-features/SeasonAppBuilder.md) - Creating seasons in applicationConfigs
- [Season Manager](../03-features/SeasonManager.md) - The Apps/Planner/Casting/Marooning tabs + casting status fields
- [Channel Administration](../03-features/ChannelAdministration.md) - Automating the ORG channel conventions above
- [Components V2](../standards/ComponentsV2.md) - UI component structure
- [Menu System Architecture](../enablers/MenuSystemArchitecture.md) - Menu patterns
- [Castlist Architecture](../03-features/CastlistArchitecture.md) - Tribes, castlists, and how members are resolved