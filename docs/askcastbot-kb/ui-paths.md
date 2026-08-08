# Ask CastBot KB — Real UI Navigation Paths

> **Purpose**: This is the ONLY source Ask CastBot may use for click-by-click navigation
> instructions. Everything here describes screens admins actually see. Internal docs
> (ButtonHandlerRegistry, framework docs) describe CODE, not screens — navigation built
> from them invents menus that don't exist (e.g. "Entity Management → Movement tab" —
> not a real screen). If a path isn't listed here, say you're not sure of the exact
> menu location and describe the goal instead.
>
> Maintained by hand. When a menu moves, update this file in the same PR.

## The entry point

Everything starts with the `/menu` slash command.

- **Admins** (Manage Channels / Manage Roles) see the **Production Menu**.
- **Players** see the **Player Menu** (profile, vanity roles, and — if the host enabled
  them — inventory, stores, and map controls).

## Production Menu (admins)

Top-level rows:

1. **Castlists, Applications and Season Management**: `📋 Castlist Manager`, `📝 Apps`,
   `🧑‍🤝‍🧑 Players`, `🏃‍♀️ Challenges`
2. **Idol Hunts, Challenges and Safari**: `🏪 Stores`, `📦 Items`, `🧭 Player Admin`,
   `💰 Currency`, `⚙️ Settings`
3. **Advanced Features**: `🗺️ Map Admin`, `⚡ Actions`, `🧮 Analytics` (Reece only),
   `🪛 Tools`

## Common Safari tasks — exact paths

- **Create or edit an item**: `/menu` → `📦 Items` → pick the item from the select (or
  create a new one) → edit its fields via the edit buttons/modals on that screen.
  Item fields include name, emoji, description, price, consumable, attack/defense
  values, stamina boost, and **Reverse Blacklist Coordinates** (the comma-separated
  cells this item unlocks, e.g. `A1, B1`).
- **Create or edit a store / stock items in it**: `/menu` → `🏪 Stores` → pick or
  create the store → manage its items and prices from that screen.
- **Change currency name/emoji and other Safari settings**: `/menu` → `⚙️ Settings`. That screen is buttons only — each group's editor shows its current values when you open it.
- **Give/take a player's currency or items**: `/menu` → `🧭 Player Admin` → pick the
  player.
- **Create or edit Actions** (buttons/commands with outcomes and conditions):
  `/menu` → `⚡ Actions` (the Custom Action Editor). From a map location's channel,
  admins can also use the location's admin buttons to quick-create actions on that
  cell.
- **Map management** (create map, blacklist coordinates, player locations, location
  content): `/menu` → `🗺️ Map Admin`. Location text/images are edited via the
  **Location Editor** inside Map Admin.
- **Refresh location cards** after edits: `/menu` → `🗺️ Map Admin` → `⚓ Anchors`.
- **Re-run CastBot setup** (roles etc.): `/menu` → `⚙️ Settings` → `⚙️ Setup`.
- **See scheduled jobs**: `/menu` → `⚙️ Settings` → `⏰ Scheduled Jobs`.

## Tools Menu (`/menu` → `🪛 Tools`)

- **Special Features**: `📊 Attributes`, `🖼️ Category Post`, `🐙 Enemies`
- **Ask CastBot row** (entitled servers): `👾 Ask CastBot`, `👾 Post Ask CastBot`
- **Cleanup**: `🗺️ Navigate Tidy`, `☢️ Nuke Category`, `💅 Clear Vanity Roles`
- **Utilities**: `⏱️ Stopwatch` (time between two message IDs), `❄️ Snowflake`
  (decode a snowflake ID), `🕐 Availability`, `🎨 Emoji Editor`
- **Info & Support**: Need Help? (support server). Terms of Service + Privacy Policy
  merged into the `📜 Policy` button in `⚙️ Settings` (bottom row).

## CastBot Settings (`/menu` → `⚙️ Settings`)

- **CastBot-Wide Settings**: `⚙️ General`, `🕹️ Player Menu`, `💜 Reaction Roles`,
  `⚙️ Setup` (re-runs setup — idempotent), `⏰ Scheduled Jobs`
- **Idol Hunts, Challenges and Safari Settings**: `🪙 Currency`, `🛠️ Crafting`,
  `📍 Location`, `⚡ Stamina`, `❗ Commands`
- **Advanced**: `🔐 Roles & Security`, `🪵 Logs`, `🔄 Reset`
- **Legacy**: `💼 Tycoons`, `☄️ Events`, `🎲 Rounds`
- **Bottom row**: `← Back`, `📜 Policy` (merged Terms of Service + Privacy Policy)

## Map Admin (`/menu` → `🗺️ Map Admin`)

Map management (create/update/delete), blacklisted coordinates, player locations,
paused players, `📍 Location Editor`, `🚀 Progress`, `🤫 Whispers`, `⚓ Anchors`
(rebuilds every location card), `🗺️ Prod Map`, `📥 Import` / `📤 Export`
(Safari data import/export — moved here from Settings → Advanced), `🦁 Guide`
(host guide — moved here from Settings).

## Things that do NOT exist (never invent these)

- There is no screen called "Entity Management" in the UI — items and stores are
  edited from `📦 Items` and `🏪 Stores` directly.
- There are no "tabs" on item edit screens (no "Movement tab" etc.) — item fields are
  edited via field-group buttons and modals.
- There is no standalone "Safari Menu" anymore — its features were promoted into the
  Production Menu rows above.
