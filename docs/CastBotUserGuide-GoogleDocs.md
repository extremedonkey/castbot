# CastBot — The Complete Guide

**How to use this file:** open Google Docs → **Tools → Preferences → tick "Enable Markdown"**, then paste this whole document in. Headings, tables, bold, links and nested bullets all convert automatically. Then **Insert → Table of contents** at the top — the headings below are structured so it builds itself.

*Verified against the live bot on 8 August 2026. Every menu path was read out of the source code, not remembered. Where a feature is hidden or restricted, it says so.*

---

## Symbols used in this guide

| Symbol | Meaning |
|---|---|
| ⚠️ | Destructive or irreversible. Read before clicking. |
| 🔒 | Restricted. Not available to all servers or users yet. |
| 💡 | A genuinely useful thing that isn't obvious. |

---

# Welcome

CastBot runs Online Reality Games (ORGs) on Discord. It covers the whole season, not just the part where people are playing.

| Phase | What CastBot does |
|---|---|
| **Before the game** | Season applications, applicant scoring, casting decisions, do-not-cast conflict checks, importing applicants from a Google Form |
| **The public face** | Castlists — living, sortable, image-backed rosters of who is playing and on which tribe |
| **During the game** | Tribe swaps and merges, player profiles, challenges, and Safari: a full Discord-native game engine with maps, items, stores, crafting, combat and economies |
| **Around the game** | Reaction roles, availability polling, timers, channel archiving, and a pile of admin utilities |

## There are only two slash commands

| Command | What it does |
|---|---|
| `/menu` | Opens everything. Admins get the Production Menu; players get the Player Menu. |
| `/castlist` | Posts a castlist directly. |

That is deliberate. You do not need to memorise command syntax — you need to know where to click. This guide is a map.

## Getting help

* **Support server:** https://discord.gg/H7MpJEjkwT — also reachable from `/menu` → **Support**
* **In-bot:** `/menu` → 🗺️ **Map** → 🦁 **Guide** for the Safari walkthrough

---

# How to read this guide

Menu paths are written as a chain of clicks, like this:

**`/menu` → ⚙️ Settings → 🔐 Roles**

Labels are exactly what you see on the button, including the emoji.

## If a button isn't where the guide says it is

Check these three things, in this order:

1. **You lack the permission.** Most admin surfaces need **Manage Roles**; a few need **Manage Channels**. CastBot hides what you can't use.
2. **The feature isn't configured yet.** Many buttons only appear once there's something behind them — Crafting hides until you create a recipe, Map hides until a map exists. This is intentional: an empty button is a dead end.
3. **It's restricted.** A small number of features are limited to specific users while they're being built. These are flagged 🔒 throughout.

---

# Quick start: your first ten minutes

Adding CastBot to a fresh server and getting to a working castlist.

## 1. Run setup

Type `/menu`. On a brand-new server you get the **Setup Wizard** instead of the Production Menu. Click **Run Setup**.

This creates your pronoun roles and timezone roles. It is idempotent — running it again later is safe, and is how you refresh an old role set.

*You can re-run it any time from `/menu` → ⚙️ Settings → ⚙️ Setup.*

## 2. Make a castlist

**`/menu` → 📋 Castlist Manager**

Pick **Active Castlist** from the dropdown (this is your default castlist), then use 🏕️ **New Tribe** to attach the Discord roles that represent your tribes.

## 3. Post it

Still in the Castlist Manager, with a castlist selected, click **Post Castlist**. That posts a public, always-current roster into the channel.

## 4. Let players fill in their own profiles

**`/menu` → ⚙️ Settings → 💜 Reaction Roles**

Post the pronoun and timezone reaction messages. Players react, they get roles, and the castlist fills itself in.

💡 *This is the highest-value five minutes in CastBot. Every profile field a player sets themselves is one you never have to chase.*

## 5. Set up a season (when you're recruiting)

**`/menu` → 📅 Season Manager** → create a season → 📝 **Apps** tab → build your questions → **Post Apps Button**.

You now have a working server. The rest of this guide is depth.

---

# The menu map

Everything in CastBot hangs off `/menu`. This is the complete, verified navigation tree.

## 📋 Production Menu

*Requires **Manage Channels** OR **Manage Roles**. On a brand-new server the Setup Wizard appears here instead.*

* **🪪 Player Menu** — top-right of the title bar
* **✨ New Features** — the announcement ticker
* **📍 Post Castlists** — one button per castlist, posts it publicly
* **✏️ Castlists, Applications and Season Management**
    * 📋 Castlist Manager
    * 📅 Season Manager
    * 🧑‍🤝‍🧑 Players
    * 🏃‍♀️ Challenges
* **🦁 Idol Hunts, Challenges and Safari**
    * 🏪 Stores
    * 📦 Items
    * 💰 Currency
    * ⚡ Actions
    * 🗺️ Map
* **💎 Advanced**
    * ⭐ CastBot Premium 🔒
    * ⚙️ Settings
    * 🪛 Tools
    * 🧙 Setup — *red until onboarding is complete, then grey*
    * ❓ Support — *link to the support server*

## 📋 Castlist Manager

* Dropdown — select a castlist, or **Create New Castlist**
* 🏕️ **Tribes on Castlist** — each tribe has an Edit button; 🏕️ **New Tribe** adds one
* **Post Castlist** · ✏️ **Edit** · **Placements** · 🔀 **Swap/Merge** · 🍒 **Compact**
* Dropdown — further actions for the selected castlist
* **← Menu** · 🗑️ **Delete** — *disabled on the default castlist*

## 📅 Season Manager

*Pick a season, then work across the tabs. The tab you're on is highlighted blue.*

| Tab | What it's for |
|---|---|
| 📝 **Apps** | Application questions, posting the apply button |
| 📅 **Planner** | Season planning |
| 🏆 **Casting** | Score applicants 1–5, Cast / Tentative / Don't Cast, notes |
| 🚣 **Marooning** | Tribe drafting and the marooning roster |
| 🔐 **Channels** 🔒 | Bulk channel creation — see *Channel Administration* |

*Every tab also carries **← Seasons** and ✏️ **Edit**.*

## ⚙️ Settings

* **🎛️ CastBot-Wide Settings**
    * ⚙️ General — image upload mode
    * 🕹️ Player Menu — which buttons players see
    * 💜 Reaction Roles — pronouns and timezones
    * ⚙️ Setup — re-run the role setup (safe, idempotent)
    * ⏰ Scheduled Jobs
* **🦁 Idol Hunts, Challenges and Safari Settings**
    * 💰 Currency · 🧰 Inventory · 🛠️ Crafting · 📍 Location · ⚡ Stamina · ❗ Commands
* **⚙️ Advanced**
    * 🔐 Roles — which roles get access to bot-made channels
    * 🪵 Logs — Safari logging and whisper log channels
    * 🧮 Data 🔒 · 🐧 Reece's Stuff 🔒
    * 🔄 Reset ⚠️ — resets Safari settings to defaults
* **📼 Legacy**
    * 💼 Tycoons · 🎲 Events · ⏳ Rounds
* **← Back** · 📜 **Policy** — *Terms of Service and Privacy, merged*

## 🪛 Tools

* **🐙 Special Features** — 📊 Attributes · 🖼️ Category Post · 🐙 Enemies
* **👾 Ask CastBot** · **👾 Post Ask CastBot** 🔒
* **🧹 Cleanup** — 🧹 Archiver 🔒 · 🗺️ Navigate Tidy · ☢️ Nuke Category ⚠️ · 💅 Clear Vanity Roles ⚠️
* **🔮 Utilities** — ⏱️ Stopwatch · ❄️ Snowflake · 🕐 Availability · 🎨 Emoji Editor
* **Menu**

## 🗺️ Map Explorer

* The map image, with blacklist and unlock overlays
* 🗺️ **Update Map** · 🗑️ **Delete Map** ⚠️ · 🚫 **Blacklist**
* 🦁 **Start Safari** · ⏸️ **Paused Players** · 🚪 **Remove Players** · 🔄 **Reset Safari** ⚠️
* 🗺️ **Prod Map** · 🚀 **Progress** · 🤫 **Whispers** · ⚓ **Anchors**
* 📥 **Import** · 📤 **Export** · 🦁 **Guide**
* **← Menu**

*Before a map exists you get a single 🗺️ **Create Map** button and instructions instead.*

## 🪪 Player Menu

*The 🪪 button top-right of the Production Menu, or `/menu` for anyone without admin permissions. Buttons appear only when the relevant feature is switched on and has content.*

| Group | Buttons |
|---|---|
| **Profile** | 📋 Castlists · 💜 Pronouns · 🌍 Timezone · 🎂 Age |
| **Safari** | 🪙 Currency · 🧰 Inventory · 🗺️ Map · ⚡ Stamina · 🏃 Challenges · 🛠️ Crafting · ⚡ Actions · 🏪 Stores |
| **Advanced** | 📊 Stats · 🕹️ Commands · 🤝 Alliance 🔒 · CastDock · 🎭 Vanity Roles · 🗺️ Navigate |

*Currency, Inventory and Crafting show your server's **custom names** — if you renamed currency to "Beans", the button says Beans.*

---

# Part 1 — Setup and settings

## The Setup Wizard

New servers see the Setup Wizard instead of the Production Menu. It tracks four things and turns each green as you finish it:

1. **Run Setup** — creates pronoun and timezone roles
2. **Season Manager** — create your first season
3. **Castlist Manager** — build a castlist with tribes in it
4. **Post Castlist** — actually post it

Once all four are done, `/menu` gives you the full Production Menu and the 🧙 **Setup** button in the Advanced row turns from **red to grey**.

💡 *The red Setup button is your onboarding progress bar. If it's still red, something in the list above isn't done.*

## General settings

**`/menu` → ⚙️ Settings → ⚙️ General**

**Image Uploads** controls how CastBot asks you for images:

| Mode | How it works |
|---|---|
| 🔗 **Paste URL** *(classic)* | You upload the image to Discord yourself, copy its link, and paste it in. Works everywhere. |
| 🖼️ **Upload Component** *(newer)* | You attach the file directly in the form. Fewer steps. |

*The switch is being rolled out field by field, so some image fields are still paste-only.*

⚠️ Uploaded images are stored in a `#🗺️castbot-images` channel that CastBot creates. **Do not delete that channel** — it is where the images actually live.

## Roles and security

**`/menu` → ⚙️ Settings → 🔐 Roles**

A whitelist of roles that automatically get access to channels CastBot creates. Add your host and co-host roles here **before** you start creating channels or maps.

| Channel type | What whitelisted roles get |
|---|---|
| Season application channels | View, Send, Read History |
| Safari map locations and categories | View, Send, Manage Channels |
| The image storage channel | View, Send, Manage Channels |

⚠️ **This applies at creation time.** Adding a role here does not retroactively grant access to channels that already exist. Add your hosts first, then create.

## Reaction roles

**`/menu` → ⚙️ Settings → 💜 Reaction Roles**

Two self-service systems, both driven by players reacting to a message you post.

* **🌍 Timezones** — view, bulk modify, add custom timezones, and post the reaction message. CastBot handles daylight saving transitions for you.
* **💜 Pronouns** — view, edit, and post the reaction message. Players can hold several at once.

💡 *Post both in a #roles channel during pre-season. Every player who self-serves is a player you don't have to manually tag, and their castlist entry populates automatically.*

## Scheduled jobs

**`/menu` → ⚙️ Settings → ⏰ Scheduled Jobs** — a dashboard of everything CastBot has queued for your server.

---

# Part 2 — Castlists

A castlist is a live roster: tribes, members, and each player's profile details, rendered as a Discord message that reflects reality whenever it's viewed.

## Creating and editing

**`/menu` → 📋 Castlist Manager**

The dropdown holds **Active Castlist** (your default), any others you've made, and **Create New Castlist**. With a castlist selected:

| Button | What it does |
|---|---|
| **Post Castlist** | Post it publicly in the current channel |
| ✏️ **Edit** | Name, emoji, description, sort order, associated season |
| **Placements** | Record finishing positions |
| 🔀 **Swap/Merge** | Tribe swaps and merges — see below |
| 🍒 **Compact** | A condensed rendering for large casts |
| 🏕️ **New Tribe** | Attach a Discord role as a tribe |
| 🗑️ **Delete** ⚠️ | Removes the castlist (disabled for the default one) |

## Sort orders

Castlists can order members by several strategies, including **vanity role tiers** — a hierarchy of Season → Alphabetical → Numeric → Emoji → Other.

This is what lets you show "Winner", "Runner-Up", "Season 12 Cast" style badges in a sensible order rather than Discord's raw role position.

## Tribe Swap / Merge

**`/menu` → 📋 Castlist Manager → select Active Castlist → 🔀 Swap/Merge**

*Only enabled on the default castlist. If the button is grey, that's why.*

A form with five choices:

| Field | What to pick |
|---|---|
| **New Tribe Roles** | 2+ Discord roles that become the new tribes — pick **one** for a merge |
| **Archive Castlist Name** | Where the old tribes go, e.g. "Pre-Swap Tribes" |
| **Create Vanity Roles?** | Keep old tribes visible alongside the new ones. **Yes** for swaps (shows history), **No** for merges (cleaner) |
| **Have CastBot Randomize?** | **Yes** runs a dramatic reveal, one player every 15 seconds. **No** creates the structure and leaves you to assign roles by hand |
| **Odd Player Number Behaviour** | Randomise the leftovers, or stop and let you place them |

The old tribes are archived into a new castlist, so your pre-swap roster is preserved forever.

### ⚠️ Three things to know before you run this

* **Old Discord roles are not removed.** After a swap a player holds both `@OldTribe` and `@NewTribe`. This is deliberate — it preserves history and powers the vanity display — but if you want a clean member list you must strip the old roles yourself.
* **Channels are not moved.** The swap reassigns roles and rebuilds the castlist. It does not reorganise your confessional or tribe channels.
* **A full dramatic reveal takes (players × 15 seconds).** Sixteen players is four minutes of posting. Start it when you actually want the ceremony to happen.

## Posting castlists

Three ways: the `/castlist` command, **Post Castlist** in the Castlist Manager, or the 📍 **Post Castlists** row at the top of the Production Menu.

## CastDock

**Player Menu → CastDock**

CastDock pins a public `/menu` to a channel and keeps it at the bottom — when someone posts, it reposts itself so it's never scrolled away. Comes in compact and full renderings, and you choose which buttons appear.

💡 *Best use: a #submissions or #bot-commands channel where players constantly need the same three buttons. It removes "where do I click again?" permanently.*

---

# Part 3 — Season Manager

**`/menu` → 📅 Season Manager**

This is the pre-season and casting workspace.

## 📝 Apps — building the application

Define your application as a set of questions. Applicants get a private channel and answer inside Discord — no Google Form, no leaving the server.

* Add questions with **New Question**
* **Post Apps Button** puts the apply button wherever you want it
* Each applicant gets their own channel, created with your host roles already permissioned *(this is what ⚙️ Settings → 🔐 Roles is for)*

Application channels carry their status in the channel name: a **☑️** prefix means submitted, **✖️** means withdrawn.

⚠️ **Do not manually rename application channels.** CastBot reads those emoji prefixes as the authoritative record of whether an application was completed or withdrawn. Renaming destroys the signal.

## 📅 Planner

Season planning surface — schedule and structure for the season.

## 🏆 Casting

Where you decide who plays.

* **Score each applicant 1–5**
* **Mark them Cast, Tentative, or Don't Cast**
* **Leave notes** per applicant
* **Jump-select** between applicants without going back to the list
* Send outcome messages in bulk (everyone / successful / unsuccessful / alternates / a selection) or one at a time, and save them as drafts first

### Do-Not-Cast (DNC) conflict detection

CastBot cross-references DNC entries across the whole season and flags **mutual conflicts** (both players named each other) and **one-way conflicts** (only one did).

💡 *Check DNC **before** you finalise tribes, not after. A mutual conflict discovered post-marooning is a season-management problem; discovered during casting it's a five-second fix.*

## 🚣 Marooning

Roster and tribe drafting for the start of the game. **Draft Tribes** lets you privately assign players to tribes without assigning any Discord roles — so you can plan the marooning without spoiling it.

## Importing applicants from a Google Form

For hosts recruiting **outside Discord** — IRL leagues, Instagram, anywhere your applicants don't already have a Discord account.

CastBot generates a Google Apps Script for your response sheet. Pushing the sheet creates one application channel per row, so Casting and Marooning work normally for people who never touched your server.

| Header | How it's treated |
|---|---|
| `Name`, `Age`, `Pronouns` | Mapped to real CastBot fields |
| Everything else | Stored as question-and-answer pairs |

You can exclude columns for privacy, and a dry-run preview shows you what will be created before anything happens.

⚠️ **Create-only and one-way.** Edits made in the sheet after an import do not propagate. Fix mistakes in Discord, not in the spreadsheet.

## 🔒 Channel Administration

*Restricted — not yet available to all servers.*

Bulk creation of the standard ORG channel set: a confessional per player, a subs channel per player, a 1-on-1 channel per *pair* of players in a tribe, a personal Discord role per player, a Trusted Spectator role, and secret alliance channels.

Every action is **plan → confirm → execute**. Nothing touches Discord until you've seen the exact counts, the server totals afterwards, an estimated runtime, and **a list of every player by name**.

Re-running is safe — it's an upsert, so an interrupted run is resumed simply by running it again.

### Why 1-on-1s need care

They're combinatorial. The channel count grows much faster than the player count:

| Players in a tribe | 1-on-1 channels | Categories | Approximate time |
|---|---|---|---|
| 8 | 28 | 1 | 30 seconds |
| 12 | 66 | 2 | 1 minute |
| 16 | 120 | 3 | 2 minutes |
| 20 | 190 | 4 | 3 minutes |
| 24 | 276 | 6 | 5 minutes |

CastBot refuses any job that would breach Discord's ceilings and tells you which one.

---

# Part 4 — Players

**`/menu` → 🧑‍🤝‍🧑 Players**

Pick a player and manage their profile: pronouns, timezone, age, vanity roles, Safari stats, inventory, and location.

Players manage most of this themselves through the 🪪 **Player Menu** — this screen is for when you need to do it *for* them.

## Vanity roles

Cosmetic roles that display on the castlist — "Winner", "Jury", "Season 12". They participate in castlist sorting and can be bulk-cleared from `/menu` → 🪛 **Tools** → 💅 **Clear Vanity Roles**.

⚠️ *That clears them server-wide.*

---

# Part 5 — Safari

Safari is CastBot's game engine. You can use any part of it on its own — plenty of servers use Stores and Items for a challenge without ever building a map.

## The pieces

| Component | What it is |
|---|---|
| 💰 **Currency** | One economy per server, renameable (Beans, Coins, Sand Dollars…) |
| 📦 **Items** | Things players hold. Can carry earnings values, attack and defence values, be consumable, unlock map locations, or feed recipes |
| 🏪 **Stores** | Buy/sell interfaces. Multiple per server, per-store pricing, stock limits, role-gated access, and global stores that appear in the player menu |
| 🛠️ **Crafting** | Recipes turning items into other items |
| ⚡ **Actions** | The rules engine: triggers, conditions, and branching outcomes |
| 🗺️ **Map** | A real map image cut into a coordinate grid, one Discord channel per cell |
| 🐙 **Enemies** | Entities players fight |
| 📊 **Attributes** | Arbitrary point types (stamina, health, mana) with automatic regeneration |
| 🏃‍♀️ **Challenges** | A configurable rounds system |

## Building a map

**`/menu` → 🗺️ Map → 🗺️ Create Map**

1. Get your map image into Discord (or upload it directly, if Upload Component mode is on)
2. Choose grid dimensions — anything from 1×1 to a 400-cell maximum; rectangular is fine
3. CastBot draws the coordinate grid over your image and creates one channel per cell

Then:

* **🚫 Blacklist** — make cells impassable. The map image gets a red overlay so you can see them
* **Item unlocks** — flag an item as unlocking specific blacklisted cells (a boat for deep water, a key for a locked door). Unlock cells are colour-coded per item on the overlay. You can optionally require **all** listed items rather than any one of them, for multi-key doors
* **⚓ Anchors** — refresh the pinned navigation message in every cell
* **🚀 Progress** — see how far everyone has got
* **🤫 Whispers** — private messages between players standing in the same cell, with an optional spectator-visible log

⚠️ **Maps cannot be resized after creation.** You can swap the image without losing player progress, but the grid dimensions are fixed. Decide the size before you build.

## Running a Safari

**`/menu` → 🗺️ Map**

| Button | What it does |
|---|---|
| 🦁 **Start Safari** | Initialise players |
| ⏸️ **Paused Players** | Freeze individuals |
| 🚪 **Remove Players** | Take someone out |
| 🔄 **Reset Safari** ⚠️ | Clears play state — see below |

### About Reset Safari

Reset clears **play state**: action claims, item-drop claims, world flags, player economy and points, and rounds. It **never** deletes your Actions, Items, Stores or Maps — your build survives.

You get a pre-flight preview first. Read it: it lists the things that **can't** be restored, notably finite store stock (there's no record of what the original level was).

## Actions — the rules engine

**`/menu` → ⚡ Actions**

An Action is: **something happens** → **check some conditions** → **do these things** (or these other things, if the conditions fail).

Conditions can test currency, items held, points, roles, and map location. Outcomes can give and take items and currency, move players, fight enemies, display text, and chain into further actions.

### Usage limits

Any outcome can be claim-gated so it can't be farmed:

| Limit | Behaviour |
|---|---|
| **Unlimited** | No gate |
| **Once per player** | Each player may claim it once |
| **Once globally** | The first player to find it gets it; nobody else ever can |
| **Once per period** | Resets on a schedule |
| **Custom** | Set max claims, scope, uniqueness and reset behaviour independently |

💡 ***Once globally** is how you build a genuine idol hunt. There is exactly one, and it goes to whoever gets there first.*

## Player-facing Safari

Players reach their own Safari through the 🪪 **Player Menu**: Currency, Inventory, Map, Navigate, Crafting, Stores, Challenges and Stats. You control which appear from ⚙️ **Settings** → 🕹️ **Player Menu**.

Text-based commands are also available (⚙️ **Settings** → ❗ **Commands**) if you'd rather players type than click.

## Import / Export

**`/menu` → 🗺️ Map → 📥 Import / 📤 Export**

Export a whole Safari configuration and re-import it into another server. This is how you reuse a build across seasons, share one, or back it up before a big change.

💡 *Export before any large restructure. It costs five seconds and it's the only undo you have.*

---

# Part 6 — Tools and utilities

**`/menu` → 🪛 Tools**

## Special features

| Tool | What it does |
|---|---|
| 📊 **Attributes** | Define point types and how they regenerate |
| 🖼️ **Category Post** | Build a rich card and post it to chosen channels, or every channel in a category. Shows the full blast radius on a confirmation screen first |
| 🐙 **Enemies** | Create enemy entities for combat |

## Cleanup

| Tool | What it does |
|---|---|
| 🧹 **Archiver** 🔒 | Export a channel or an entire category's full history as browsable HTML, stored on Discord itself |
| 🗺️ **Navigate Tidy** | Clean up map navigation messages |
| ☢️ **Nuke Category** ⚠️ | Delete an entire category and its channels |
| 💅 **Clear Vanity Roles** ⚠️ | Strip vanity roles server-wide |

## Utilities

| Tool | What it does |
|---|---|
| ⏱️ **Stopwatch** | Timing tool |
| ❄️ **Snowflake** | Turn a Discord message ID into an exact timestamp, or measure the gap between two messages. Also available by right-clicking a message → **Apps** |
| 🕐 **Availability** | Post an availability poll, collect responses, view who overlaps |
| 🎨 **Emoji Editor** | Manage server emojis |

💡 ***Availability** is the fastest way to schedule a live challenge across timezones. Post it, let players fill it in, read the overlap.*

---

# Part 7 — CastBot Premium

🔒 *Currently restricted while it's being built.*

**`/menu` → ⭐ CastBot Premium**

| Feature | What it does |
|---|---|
| 👾 **Ask CastBot** | Ask questions in plain English and get real answers about the bot and your server's data. Admins in entitled servers can also **make Safari changes by describing them** — CastBot drafts a plan, shows a preview, and applies it only when you click Apply |
| 👾 **Post Ask CastBot** | Put an Ask button in a channel for others to use |
| 📢 **Player Engagement** | 🖼️ Category Post and 📨 Msg Category — broadcast a formatted message to every confessional, or every channel in a category, optionally pinning it |
| 💬 **Channels** 🔒 | The bulk ORG channel tooling described in Part 3 |
| 🧹 **Cleanup** and 🔮 **Utilities** | As in Tools, plus 🧹 Archiver ungated here |
| ☕ **Donate** | Supporting CastBot's running costs |

*Entitlements are granted per server and include a grace period, so a lapsed subscription doesn't cut you off mid-season.*

---

# Permissions

CastBot uses Discord's own permissions rather than inventing its own role system.

| Surface | Requires |
|---|---|
| Production Menu | **Manage Channels** OR **Manage Roles** |
| Most admin actions | **Manage Roles** |
| Bulk channel and role jobs | **Manage Channels** AND **Manage Roles** — checked before the job starts, not halfway through |
| Player Menu | Everyone |
| Restricted features 🔒 | Specific user IDs while in development |

## What the bot itself needs

Give CastBot **Manage Roles** and **Manage Channels**, and make sure **CastBot's own role sits above every role it needs to assign**.

⚠️ Discord will not let any bot manage a role above its own. This is the single most common cause of *"it says it worked but nothing happened"*.

*The Setup Wizard checks role hierarchy and warns you if something is out of order.*

---

# Limits and gotchas

These are Discord's limits, not CastBot's. Knowing them saves you designing something impossible.

## Server ceilings

| Limit | Value |
|---|---|
| Channels per server | **500** *(categories count toward this)* |
| Categories per server | **50** |
| Channels inside one category | **50** |
| Roles per server | **250** |

*CastBot refuses any bulk job that would breach one of these and tells you which.*

## Interface limits

| Limit | Value |
|---|---|
| Buttons per row | **5** |
| Options in a dropdown | **25** |
| Components per message | **40** |

*If a menu looks like it's missing something, it may have hit the component ceiling.*

## Rate limits

| Operation | Limit | What CastBot does about it |
|---|---|---|
| **Channel renames** | 2 per 10 minutes, **per channel** | Bulk renames are best-effort; CastBot reports what it couldn't rename rather than failing the job |
| **Channel creation** | ~1 per second | 190 channels takes about 3 minutes. Jobs too long to finish safely are refused up front rather than timing out halfway |

## Things that surprise people

| Behaviour | Why |
|---|---|
| Tribe swaps don't remove old roles | By design — preserves history and powers vanity display. Strip them manually if you want a clean list |
| Maps can't be resized | Only the image can be replaced |
| Application channel names carry meaning | ☑️ = submitted, ✖️ = withdrawn. Don't rename them |
| Finite store stock can't be restored | Reset Safari has no record of the original level |
| The image storage channel must not be deleted | Deleting `#🗺️castbot-images` breaks the images that reference it |
| 🔐 Roles applies at creation time only | Set it before you create, not after |

---

# Troubleshooting

| Problem | What to do |
|---|---|
| **"This interaction failed"** | Usually a stale message. Re-open with `/menu` and try again. If it persists, report it in the support server with the button you clicked |
| **A button doesn't appear** | Check in order: your permissions → whether the feature is configured → whether it's 🔒 restricted. CastBot hides buttons with nothing behind them rather than showing dead ends |
| **Roles aren't being assigned** | CastBot's role must sit **above** the roles it's assigning, in Server Settings → Roles. This is the most common cause by a distance |
| **A castlist is missing players** | Confirm the player actually holds the tribe's Discord role. The castlist reads live roles |
| **A bulk job stopped partway** | Run it again. Every bulk operation is an upsert — it adopts what already exists rather than duplicating, so re-running *is* the resume |
| **Something looks wrong after a swap** | Check whether old tribe roles are still assigned (they will be — that's intended) and whether the archive castlist was created |

---

# Glossary

| Term | Meaning |
|---|---|
| **Castlist** | A live roster of tribes and players, posted publicly and always current |
| **Tribe** | A Discord role that CastBot treats as a team on a castlist |
| **Season** | A container for applications, casting decisions and planning. A server can hold several; many hosts make a fresh server per season instead |
| **Confessional** | A player's private channel with the hosts. Where votes and thoughts go |
| **Subs** | A player's submission channel, for challenge entries |
| **1-on-1** | A private channel between exactly two players. Combinatorial: n×(n−1)/2 of them |
| **Trusted Spectator** | A role that can read confessionals but not post in them |
| **Vanity role** | A cosmetic role shown on the castlist ("Winner", "Jury") |
| **Marooning** | The start of the game, when tribes are revealed |
| **DNC** | Do Not Cast — a conflict record between two applicants |
| **Safari** | CastBot's game engine: maps, items, stores, economies, combat |
| **Action** | A Safari rule: a trigger, conditions, and branching outcomes |
| **Stamina** | The point type that limits how far a player can move per period |
| **Blacklist** | Map cells players cannot enter, optionally unlockable by holding an item |
| **CastDock** | A public menu pinned to a channel that reposts itself so it's never scrolled away |
| **Snowflake** | A Discord ID. It encodes its own creation timestamp, which is why the Snowflake tool can turn one into an exact time |

---

*CastBot is made by Reece (@extremedonkey). Support: https://discord.gg/H7MpJEjkwT*
