# CastBot: Online Reality Game (ORG) Context Guide

> **Audience**: AI assistants (Claude instances) that need context on what CastBot is, who uses it, and the reality TV game format it supports. This document is designed to be tagged into context windows when game-domain knowledge is needed.

## What is CastBot?

CastBot is a Discord bot purpose-built for **Online Reality Games (ORGs)** — fan-created, multiplayer recreations of reality TV competition shows run entirely through Discord servers. The bot provides tools for both the people running the game ("Production") and the people playing in it ("Players").

The bot manages the full lifecycle of an ORG season: casting players, organizing them into tribes, tracking who's still in the game, running interactive challenges and item hunts, and displaying dynamic castlists.

## What is an ORG?

ORG stands for **Online Reality Game**. An ORG is a game where real people sign up to compete against each other in a structured format modeled after reality TV shows — most commonly **Survivor**, but also **Big Brother**, **The Traitors**, **The Mole**, and others.

ORGs give players the opportunity to play these games without physically being on a deserted island, locked in a house, or traveling the world. Instead, the entire experience takes place on a Discord server over the course of several weeks, with daily gameplay cycles, strategic conversations, and elimination votes all happening through Discord channels, DMs, and bot interactions.

Key characteristics of ORGs:
- **Real people, real strategy**: Players form alliances, make deals, backstab, and politic — just like on the TV shows
- **Structured seasons**: Games have defined start/end dates, episode cycles, and progressive elimination
- **Discord-native**: All communication, challenges, voting, and game mechanics happen within Discord
- **Community-driven**: ORGs are organized by fans of reality TV who want to experience the games themselves
- **Competitive**: Players invest significant personal time and emotional energy into the game

## The Survivor Format (Primary Use Case)

~99% of CastBot's user base runs **Survivor-format ORGs**. Understanding Survivor's game structure is essential to understanding CastBot's features.

### How a Survivor ORG Works

A Survivor ORG follows the general format of the CBS television show "Survivor." The game proceeds through these phases:

#### Phase 1: Tribal Phase

The cast is divided into **tribes** — competing teams of roughly equal size (typically 2-3 tribes of 6-8 players each). Players can only communicate with members of their own tribe through dedicated Discord channels.

Each "episode" (typically a 24-48 hour real-world cycle) follows this pattern:
1. **Challenge**: Tribes compete against each other in an online challenge
2. **Immunity**: The winning tribe(s) are safe — they cannot lose a member this episode
3. **Tribal Council**: The losing tribe must vote one of their own members out of the game

Challenges come in many forms: puzzles, creative tasks, social games, trivia, online board games, timed competitions, or Discord command-based minigames. Hosts design challenges to be accessible on both desktop and mobile, with a typical 24-hour window to complete them.

At **Tribal Council**, players on the losing tribe have 24 hours to strategize, form alliances, and ultimately vote. The player who receives the majority of votes is eliminated from the game. Failure to vote results in a "self-vote" (voting yourself out) and a strike.

#### Phase 2: Tribe Swap

To shake up social dynamics and prevent one dominant tribe from steamrolling, hosts often execute a **Tribe Swap** — players are redistributed into new tribe configurations. Old tribe channels are archived, new ones are created, and the game continues with reshuffled allegiances.

#### Phase 3: The Merge

When approximately 12-14 players remain, all tribes **merge** into a single tribe. The game shifts from team competition to **individual competition**:
- Individual challenges award **Individual Immunity** to the winner — that person cannot be voted out
- All remaining players attend Tribal Council together
- Eliminated players now join the **Jury** — they can no longer play but will ultimately decide the winner

#### Phase 4: Final Tribal Council (FTC)


When 2-3 players remain, **Final Tribal Council** occurs:
1. The finalists give opening speeches about their gameplay
2. Jury members ask questions and interrogate the finalists
3. The jury votes for who they believe played the best game
4. The player with the most jury votes is crowned the **Sole Survivor** (winner)

### Jury and Pre-Jury

Players eliminated **before the merge** become **Pre-Jury** — they leave the game entirely and typically move to a spectator role where they can watch the rest of the game unfold without participating.

Players eliminated **after the merge** become **Jury members** — they are "sequestered" (limited communication with remaining players) but can observe Tribal Councils. Their role is to evaluate the finalists and cast the deciding vote at FTC.

### Confessionals

In the TV show Survivor, players give "confessionals" — private interviews where they share their true thoughts directly with the camera. In ORGs, each player has a private **confessional channel** visible only to them and Production. Players are required to "confess" at least once per episode, sharing their strategy, thoughts, and screenshots of conversations. This serves multiple purposes:
- Production can track what's happening in the game
- Spectators get insight into player strategy
- It creates a record of the season for entertainment value

### Alliances

Players can request **alliance channels** — private group chats with specific other players on their tribe. A player messages Production with the names of who they want in the alliance, and a private channel is created. Alliances are a core strategic element — players coordinate votes, share information, and build trust through these channels.

### Idols and Advantages (Safaris / Idol Hunts)

In Survivor, **Hidden Immunity Idols** are powerful game advantages hidden around the island. In ORGs, the equivalent is the **Safari** or **Idol Hunt** — an interactive, explorable experience within the Discord server where players search for hidden advantages.

CastBot's Safari system provides:
- **Grid-based maps** that players navigate using directional buttons
- **Stamina-based movement** (limited moves per time period, regenerates over time)
- **Hidden items and currency** at specific map coordinates
- **Stores** where players can spend earned currency on advantages
- **Custom Actions** — interactive buttons with conditional logic (e.g., "if player has Key item, reveal secret passage")
- **Whisper system** — players at the same map location can secretly message each other

When a player believes they've found an idol or advantage, they submit a command in their private submissions channel. If correct, they receive the advantage — which can typically be played at Tribal Council to negate votes cast against them.

### Voting Mechanics

Voting in ORGs is typically done through a **parchment** system — players receive a blank image resembling a piece of parchment and write the name of the person they want to vote out using any image editor. The completed parchment is submitted to their private submissions channel. Players can change their vote up until the deadline (when all votes are in, or 24 hours have passed). Votes are then "read" dramatically in the Tribal Council channel, revealing the results.

## Other Supported Game Formats

While Survivor dominates, CastBot's modular architecture supports other reality TV game formats:

### Big Brother
- Players live in a virtual "house" (Discord server)
- Weekly **Head of Household (HoH)** competition determines who nominates players for eviction
- **Power of Veto (PoV)** competition can save a nominee
- Houseguests vote to **evict** one of the nominees
- Similar jury/finale structure to Survivor

### The Traitors
- Players are secretly divided into **Faithfuls** and **Traitors**
- Traitors secretly "murder" (eliminate) a Faithful each round
- Faithfuls vote in a **Round Table** to try to identify and "banish" Traitors
- Game ends when all Traitors are banished or Traitors outnumber Faithfuls

### The Mole
- Players complete cooperative missions to earn money for a group pot
- One player is secretly **The Mole**, sabotaging the group's efforts
- Players take quizzes about The Mole's identity; the worst scorer is eliminated
- Last player standing (besides The Mole) wins the pot

CastBot's feature set (tribes, castlists, seasons, challenges, custom actions, currency, stores, maps) is flexible enough to accommodate any of these formats, though the UI terminology and default workflows are optimized for Survivor.

## Users and Terminology

### Production (Hosts / Admins / "Prod")

**Who they are**: The people who design, organize, and run the ORG. Referred to interchangeably as "Production," "Hosts," "Admins," or "Prod" — all terms borrowed from the teams that produce reality TV shows (think Jeff Probst and the Survivor production crew). In CastBot's permission system, these users have Discord's `MANAGE_CHANNELS` or `MANAGE_ROLES` permission.

**Team size**: Typically 3-10 hosts per Discord server/season. Larger productions may have specialized roles — challenge designers, social media managers, editors who create recap content.

**What they do**:
- **Pre-season (30-90 days before launch)**: Design the season theme, create challenges, plan twists (tribe swaps, special advantages, hidden idols), build Safari maps and content, configure the bot
- **Casting (2-4 weeks)**: Open applications, review and rank applicants using CastBot's Cast Ranking system (multi-admin 1-5 voting scale), select the final cast
- **During the season (~30 days)**: Run daily challenge cycles, manage Tribal Councils, create alliance channels on request, monitor confessionals, handle rule violations, post results and dramatic reveals
- **Post-season**: Archive the season, compile highlights, begin planning the next one

**Why they matter to CastBot**: Production members are the primary decision-makers who choose to install CastBot and leverage its features. They are the bot's core audience. Every admin-facing feature (Production Menu, tribe management, Safari builder, cast ranking, season applications) is designed for their workflow.

**Key terminology they use**:
- **"Episode"**: One game cycle (typically 24-48 real-world hours)
- **"Tribal Council" / "Tribal"**: The elimination ceremony
- **"Parchment"**: The voting ballot
- **"Confessional"**: A player's private diary channel
- **"Submissions channel"**: Where players submit votes, idol plays, and challenge entries
- **"Sequester"**: Restricting eliminated jury members from communicating with active players
- **"Twist"**: An unexpected game mechanic change (hidden idol, tribe swap, exile island, etc.)

### Players (Contestants / Cast Members / Castaways)

**Who they are**: Real people who apply to play in the ORG and are selected by Production to compete. In CastBot's permission system, these are regular Discord users without admin permissions.

**Demographics**:
- Primarily **USA-based**, with some European and Southeast Asian players
- English-speaking only (no non-English ORG support currently)
- Wide age range, but skewing younger (teens to 30s)
- Almost universally fans of Survivor and/or other reality TV competition shows
- Many are experienced ORG players who have competed in multiple seasons across different servers

**Time commitment**: Playing an ORG is a **significant real-life commitment**. Active players typically spend **2-5 hours per day** of personal time on the game — strategizing in DMs, participating in challenges, writing confessionals, managing alliances, and attending Tribal Council. This intensity is part of the appeal but also means players burn out or need to be understanding of each other's real-world schedules (hence the importance of timezone tracking in CastBot).

**Duration of play**: A player's game lasts anywhere from **3 to 30 days** depending on whether they are voted out early or survive to the finale. Early eliminations (pre-jury) typically transition to a spectator role. Even eliminated players often remain engaged as spectators or jury members.

**Social dynamics**: One of the most distinctive aspects of ORGs is the **genuine human relationships** that form. Players build real friendships (and rivalries) over the course of a season through intense daily interaction on Discord. Many ORG communities have tight-knit social scenes where players from past seasons stay connected, return for future seasons, and form lasting friendships. The social/strategic experience — not the prize — is the primary motivation for most players.

**What they interact with in CastBot**:
- **Player Menu** (`/menu`): View their profile, set pronouns/timezone/age, access castlist
- **Castlist** (`/castlist`): See who's on each tribe, player details, game status
- **Safari/Map**: Navigate the interactive map, find items, visit stores, discover hidden advantages
- **Custom Actions**: Interact with host-created buttons and content
- **Player Commands**: Text-based interactions for puzzle solutions, secret codes, Easter eggs

**Key terminology they use**:
- **"Tribe"**: Their team
- **"Alliance"**: A private group chat with trusted players
- **"Immunity"**: Safety from elimination (team or individual)
- **"Idol"**: A hidden advantage that can save them from a vote
- **"Blindside"**: Voting someone out who didn't expect it
- **"Flip"**: Switching allegiance from one alliance to another
- **"Pagonging"**: One alliance systematically eliminating the other
- **"Goat"**: A player perceived as undeserving, dragged to the end as an easy opponent
- **"Sole Survivor"**: The winner of the season

## CastBot Feature Mapping to Game Concepts

| Game Concept | CastBot Feature | Description |
|---|---|---|
| Season | Season Lifecycle System | Planning through archival, with active season context |
| Casting / Auditions | Season Application Builder | Custom application forms, multi-admin ranking (1-5 scale) |
| Cast Roster | Castlist System | Dynamic display of players organized by tribe with avatars, ages, pronouns, timezones |
| Tribes (Teams) | Tribe Management | Discord role-based tribes with emoji, color, channel association |
| Tribe Swap | Tribe Swap/Merge System | Automated player redistribution with castlist archival |
| Merge | Tribe Merge System | Combine all tribes into one, transition to individual phase |
| Player Profiles | Player Management | Age, pronouns, timezone (with live local time), vanity roles, custom emoji |
| Idol Hunts / Safaris | Safari Map System | Grid-based explorable maps with stamina, items, stores, custom actions |
| Currency / Resources | Points System | Stamina, HP, Mana — configurable resource attributes with regeneration |
| Stores / Advantages | Store Management | Location-specific or global shops with inventory, pricing, stock limits |
| Game Items | Item System | Collectible items with usage limits, import/export, stock management |
| Custom Game Mechanics | Custom Actions System | Button-triggered workflows with conditional logic, drops, role grants |
| Secret Communication | Whisper System | Location-based private messaging between players on the same map tile |
| Challenges | Challenges/Rounds System | Configurable competition rounds with yield, attack, and resolution mechanics |
| Player Commands | Player Commands System | Text-based keyword triggers for Easter eggs, puzzles, and secret codes |
| Confessionals | Discord channels (external) | Private channels managed by Production outside CastBot |
| Voting / Tribal Council | Discord channels (external) | Vote submission and reading managed by Production outside CastBot |
| Jury Tracking | Castlist status indicators | Jury emoji and status tracking in castlist display |
| Season Progression | Episode-based lifecycle | Tribe phase -> Swap -> Merge -> Individual -> Finale |

> **Note**: Some core Survivor mechanics (voting, parchments, tribal council ceremonies, confessional channel creation) are managed by Production through Discord's native features or other bots (e.g., Carl Bot for command-based challenges) rather than through CastBot directly. CastBot focuses on casting, player/tribe management, castlist display, and the Safari interactive content system.

## Season Timeline (Real-World)

A typical Survivor ORG season maps to real-world time roughly as follows:

```
Day -90 to -30:  Pre-season planning (Production designs challenges, twists, theme)
Day -30 to -7:   Applications open, casting decisions made
Day -7 to 0:     Pre-game setup (tribes assigned, channels created, rules posted)
Day 1-10:        Tribal phase (2-3 tribes competing, tribal councils every 1-2 days)
Day ~10:         Tribe Swap (players redistributed)
Day 10-18:       Swapped tribal phase
Day ~18:         Merge (all tribes combine into one)
Day 18-28:       Individual phase (individual immunity, jury forming)
Day ~28-30:      Finale (Final Tribal Council, winner crowned)
Day 30+:         Post-season (wrap-up, spectator reveals, next season planning begins)
```

Each "episode" is typically 24-48 real-world hours. A full season runs approximately 30 days, though this varies by ORG. Some run shorter (2-3 weeks) or longer (5-6 weeks).

## Glossary of ORG/Survivor Terms

For quick reference when encountering game-specific terminology in the codebase or user conversations:

- **Alliance**: Private group chat between trusted players on the same tribe
- **Blindside**: Voting out a player who didn't see it coming
- **Cast / Castlist**: The roster of players in a season, organized by tribe
- **Castaway**: A Survivor term for a player/contestant (used interchangeably)
- **Confessional**: A player's private diary channel (only visible to them and Production)
- **Episode**: One game cycle, typically 24-48 real-world hours
- **Exile Island**: A twist where a player is sent away from their tribe temporarily
- **Final Tribal Council (FTC)**: The finale where jury votes for the winner
- **Flip**: Switching alliance loyalty
- **Goat**: A player seen as undeserving, kept around as an easy opponent to beat
- **Hidden Immunity Idol (HII)**: A secret advantage that negates votes at Tribal Council
- **Host / Production / Prod**: The people running the game
- **Idol Hunt / Safari**: An interactive search for hidden advantages
- **Immunity**: Protection from elimination (tribal = team safe; individual = one person safe)
- **Jury**: Eliminated post-merge players who vote for the winner at FTC
- **Merge**: When all remaining tribes combine into one for individual competition
- **ORG**: Online Reality Game
- **Pagonging**: One alliance systematically eliminating the other post-merge
- **Parchment**: The voting ballot (an image players write a name on)
- **Pre-Jury**: Players eliminated before the merge who don't serve on the jury
- **Production Menu**: CastBot's admin interface (for hosts)
- **Safari**: CastBot's interactive map/adventure system for idol hunts and game content
- **Self-Vote**: An automatic vote against yourself for failing to submit a vote
- **Sequester**: Restricting jury members from communicating with active players
- **Sole Survivor**: The winner of a Survivor-format ORG
- **Strike**: A penalty for rule violations (e.g., not voting); multiple strikes = removal
- **Submissions Channel**: A player's private channel for submitting votes, idol plays, etc.
- **Swap / Tribe Swap**: Redistributing players into new tribes mid-season
- **Tribal Council / Tribal**: The elimination ceremony where a player is voted out
- **Tribe**: A team of players who compete together and can communicate in shared channels
- **Twist**: An unexpected rule change or game mechanic (idol, swap, exile, etc.)
- **Vanity Role**: A Discord role showing past season participation (e.g., "S1", "S2")
