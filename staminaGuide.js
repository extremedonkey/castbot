/**
 * Safari Guide — Paginated player-friendly guide.
 * Accessible from player menu (🦁 Guide button next to 📜 Logs).
 *
 * Prod Guide — Host-facing guide (configuration, logging, admin tools).
 * Accessible from Settings menu (🦁 Guide button next to ← Back).
 */

const PAGES = [
  // Page 0: Welcome & How to Play
  {
    title: '🦁 Safari Guide',
    subtitle: '-# How Safari works — start here',
    content: [
      `Welcome! Safari is a grid-based exploration game. Each location on the map is its own Discord channel — you occupy one at a time, exploring what's there before moving on.`,
      `### \`\`\`🗺️ The Map & Navigation\`\`\``,
      `The map is a grid of locations you can move through horizontally, vertically, and diagonally. Click **🗺️ Navigate** in your location channel to see compass directions and move.\n\nWhen you arrive somewhere, other players in that channel will see you. To hide your arrival message, click 🗺️ Navigate — the announcement disappears and you'll see your movement controls privately.`,
      `### \`\`\`📍 Location Actions\`\`\``,
      `Each channel has an **⚓ Anchor Message** at the top showing your location, a description, and buttons for things you can do there. All interactions are **private** — other players won't see what you clicked or what happened.`,
      `### \`\`\`📋 Player Menu\`\`\``,
      `Type **\`/menu\`** anywhere to access:\n• **🗺️ Navigate** — Movement controls (also available in location channels)\n• **⚓ Location** — View the anchor message privately\n• **⛵ Inventory** — See your items (usable items show a button)\n• **📜 Logs** — Your activity history\n• **🦁 Guide** — You're reading it!`
    ]
  },
  // Page 1: Stamina & Movement
  {
    title: '⚡ Stamina & Movement',
    subtitle: '-# What limits your exploration',
    content: [
      `Every move costs **1 stamina**. When you run out, you'll need to wait for it to regenerate before you can move again. Your host sets the regen time — it could be hours or minutes.`,
      `### \`\`\`⚡ Reading Your Stamina\`\`\``,
      `Your stamina is shown as \`⚡ 3/5\` — meaning **3 available** out of **5 maximum**.\n\n**Over Max** — Some items can push you *above* your max. \`⚡ 3/1\` means 3 moves available even though your max is 1. This is normal!\n\nThe regen timer starts from your **last** move. If you moved at 9:00 PM and regen is 12 hours, you can move again at 9:00 AM.`,
      `### \`\`\`📊 Activity Log\`\`\``,
      `-# Tap **📜 Logs** in your player menu to see your activity history.\n\nWhen you move or use items, your log shows a stamina tag:\n\`(⚡1/1 → 0/1 ♻️12hr)\`\n\n**⚡1/1** = before (1 of 1) **→ 0/1** = after **♻️12hr** = time until regen\n\nWhen you're at or above max, you'll see \`♻️MAX\`.`
    ]
  },
  // Page 2: Regeneration
  {
    title: '♻️ Regeneration',
    subtitle: '-# How stamina comes back',
    content: [
      `Stamina regenerates automatically — there's no button to press. It's calculated every time the game checks your stamina (when you try to move, use an item, etc.).`,
      `### \`\`\`⏰ Full Reset (Default)\`\`\``,
      `When you use your last stamina, a cooldown timer starts. After it expires, **all** your stamina resets to max at once.\n\n**Example** (max: 1, regen: 12hr):\n\`\`\`\n⚡ 1/1  →  move  →  ⚡ 0/1  →  wait 12hr  →  ⚡ 1/1\n\`\`\`\n\n**Example** (max: 3, regen: 4hr):\n\`\`\`\n⚡ 3/3 → move → ⚡ 2/3 → move → ⚡ 1/3 → move → ⚡ 0/3\n                                                    ↓\n                                              wait 4hr\n                                                    ↓\n                                               ⚡ 3/3\n\`\`\`\n-# The timer starts from your **last** stamina use, not your first.`,
      `### \`\`\`📈 Incremental (Attributes)\`\`\``,
      `Some hosts set up attributes (like HP or Mana) that regenerate gradually — gaining a fixed amount every interval instead of resetting to max.\n\n**Example** (HP, +10 every 30min):\n\`\`\`\n❤️ 60/100  →  30min  →  ❤️ 70/100  →  30min  →  ❤️ 80/100\n\`\`\``
    ]
  },
  // Page 3: Items & Strategy
  {
    title: '🧪 Items & Strategy',
    subtitle: '-# Consumables, permanent items, and smart stamina usage',
    content: [
      `Items can affect your stamina in two ways: **consumable boosts** (temporary) and **permanent boosts** (as long as you own the item).`,
      `### \`\`\`🍎 Consumable Items\`\`\``,
      `Using a consumable stamina item **adds** to your current stamina and **consumes** the item. It can push you above your max.\n\n**Example** — Energy Drink (+2 stamina):\n\`\`\`\n⚡ 0/1  →  use Energy Drink  →  ⚡ 2/1\n\`\`\`\n-# Consumables do NOT reset your regen timer. If you were 5 minutes from a natural regen, it still happens.\n\n-# Over-max stamina works normally — each move costs 1, so \`2/1\` means 2 moves available.`,
      `### \`\`\`🐎 Permanent Items\`\`\``,
      `Some non-consumable items (like a Horse) increase your **maximum** stamina permanently while you own them. Each bonus point regenerates on its own independent timer.\n\n**Example** — Horse (+3 max stamina):\n\`\`\`\nBase:  ⚡ 1/1\nWith Horse: ⚡ 1/4  (max went from 1 → 4)\n\`\`\`\n-# If you lose the item, your max goes back down. Charges regen individually — you might see \`⚡ 2/4\` while some charges are still on cooldown.`,
      `### \`\`\`💡 Optimal Stamina Usage\`\`\``,
      `If you have a consumable stamina item, **don't use it immediately**. Wait for your natural regen to fire first, use that stamina, *then* pop the consumable. This minimises wasted cooldown time.\n\n**Example** (regen: 12hr):\n\`\`\`\n⚡ 0/1 → wait 12hr → ⚡ 1/1 → move → ⚡ 0/1\n  → use consumable → ⚡ 1/1 → move → ⚡ 0/1\n\`\`\`\n-# If you use the consumable *before* your natural regen, you waste whatever time was left on the timer.`
    ]
  },
];

/**
 * Prod Guide — Host-facing pages (Settings menu).
 * Comprehensive reference for hosts running Safari games.
 */
const PROD_PAGES = [
  // Page 0: Getting Started
  {
    title: '🦁 Host Guide — Getting Started',
    subtitle: '-# Page 1: Setting up and managing your game',
    content: [
      `This guide covers everything you need to run a Safari game — from setting up players to managing stamina and tracking activity.`,
      `### \`\`\`🚀 Starting the Game\`\`\``,
      `**For all players at once (recommended):**\n\`/menu\` → **🗺️ Map Explorer** → **🦁 Start Safari** → Select players → Start\n\n**For a single player:**\n\`/menu\` → **🧭 Player Admin** → Select player → **Initialize Player**\n\n-# Make sure you've set starting locations first (see below).`,
      `### \`\`\`🚩 Setting Starting Locations\`\`\``,
      `**Server default:** Set in **Settings → 🎲 Rounds & Location** — all new players spawn here.\n\n**Per-player override:** \`/menu\` → **🧭 Player Admin** → Select player → **🚩 Starting Info** → Type in the coordinate.\n\nWhen the game starts, each player lands at their assigned square (or the server default if none is set).`,
      `### \`\`\`📍 Moving a Player Manually\`\`\``,
      `If something goes wrong and a player ends up in the wrong location:\n\`/menu\` → **🧭 Player Admin** → Select player → **📍 Location**`
    ]
  },
  // Page 1: Managing Players
  {
    title: '👥 Managing Players',
    subtitle: '-# Page 2: Items, currency, and transfers',
    content: [
      `Use **🧭 Player Admin** (not 🧑‍🤝‍🧑 Players) for all player management tasks.`,
      `### \`\`\`🪙 Giving Currency\`\`\``,
      `\`/menu\` → **🧭 Player Admin** → Select player → **🪙 Edit Gil**\n\nThis shows their current balance. Type a new amount to set it.\n\n-# We recommend Player Admin over the \`/menu\` → Currency option — Player Admin is more reliable and shows the full picture.`,
      `### \`\`\`📦 Giving Items\`\`\``,
      `\`/menu\` → **🧭 Player Admin** → Select player → **📦 Edit Item**\n\n1. Search for the item\n2. Set the quantity to give them\n3. Let them know — they can check via \`/menu\` → Inventory`,
      `### \`\`\`💱 Transferring Currency Between Players\`\`\``,
      `There's no direct transfer button — adjust both players manually:\n\n**Sending player:** \`/menu\` → **🧭 Player Admin** → Select → **🪙 Edit Gil** → Subtract the amount\n**Receiving player:** Same steps → Add the amount`,
      `### \`\`\`⚡ Setting a Player's Stamina\`\`\``,
      `\`/menu\` → **🧭 Player Admin** → Select player → **⚡ Stamina**\n\nYou'll see their current stamina and regen timer. Type a new value to override it.\n\n-# This is useful if something went wrong or you want to give a player bonus moves.`
    ]
  },
  // Page 2: Stamina Settings
  {
    title: '⚡ Stamina Settings',
    subtitle: '-# Page 3: How stamina and regeneration work',
    content: [
      `Stamina controls how many map moves a player can make before waiting. Configure it via **Settings → ⚡ Stamina Settings**.`,
      `### \`\`\`⚙️ The Settings\`\`\``,
      `• **Starting Stamina** — What new players begin with\n• **Max Stamina** — How many moves a player can store up (before items)\n• **Regen Time** — How long until stamina regenerates\n• **Regen Amount** — How much comes back each cycle. Leave blank for "full reset to max". Set a number to give a specific amount (can exceed max!)`,
      `### \`\`\`♻️ How Regeneration Works\`\`\``,
      `When a player moves, they spend 1 stamina. Once they're below max, a cooldown starts. After the regen time elapses, they get stamina back.\n\n**Full Reset** (default): All stamina restores to max at once.\n**Custom Amount**: e.g. "5 per cycle" — the player gets +5 each cooldown, even if max is 1. This lets you give players multiple moves per cycle.\n\nThe regen timer shows everywhere stamina appears: \`♻️MAX\` means fully charged, \`♻️2h 15m\` shows time until next regen.`
    ]
  },
  // Page 3: Items & Advanced Stamina
  {
    title: '🧪 Items & Permanent Boosts',
    subtitle: '-# Page 4: How items interact with stamina',
    content: [
      `Items can boost stamina in two ways. Understanding the difference helps with game balance.`,
      `### \`\`\`🍎 Consumable Items\`\`\``,
      `Items marked as **Consumable: Yes** with a **Stamina Boost** value will add stamina when a player uses them. The item is removed from their inventory.\n\n• Stamina can go **above max** (e.g. \`5/1\` = 5 moves with max 1)\n• Using a consumable does **NOT** restart the regen timer\n• Moving on bonus stamina also doesn't trigger a cooldown\n\n-# This matters with long regen times. A player 5 minutes from regen who pops a consumable still gets their natural regen on time.`,
      `### \`\`\`🐎 Permanent Items\`\`\``,
      `Items marked as **Consumable: No** with a **Stamina Boost** value permanently increase the player's max stamina while they own the item.\n\n**Example** — Horse (Stamina Boost: 1):\nPlayer's max goes from 1 → 2. Each stamina charge regenerates **independently** — so using one charge only puts *that* charge on cooldown.\n\n**Stacking**: Horse (+1) + Boots (+1) = max 3 (1 base + 2 from items)\n\n-# If the item is removed, max decreases automatically. Multiple permanent items stack.`,
      `### \`\`\`⚠️ Over-Max Stamina\`\`\``,
      `Players can go above max via consumables, custom regen amounts, or admin overrides. Over-max stamina does **not** regenerate — the player must spend down below max before natural regen kicks in.`
    ]
  },
  // Page 4: Logging & Monitoring
  {
    title: '📊 Logging & Monitoring',
    subtitle: '-# Page 5: Tracking stamina changes and player activity',
    content: [
      `Every stamina change is tracked across three log systems. Each shows a **stamina tag** so you can see exactly what happened.`,
      `### \`\`\`🏷️ The Stamina Tag\`\`\``,
      `\`(⚡before/max → after/max ♻️timer)\`\n\n| What happened | Tag |\n|---|---|\n| Player moved | \`(⚡1/1 → 0/1 ♻️12h 0m)\` |\n| Used consumable (+4) | \`(⚡1/1 → 5/1 ♻️MAX)\` |\n| Admin set stamina | \`(⚡1/1 → 3/1 ♻️MAX)\` |`,
      `### \`\`\`📡 Three Log Systems\`\`\``,
      `**Live Discord Logging** — Global audit trail across all servers. Goes to your \`#🪵logs\` channel.\n\n**🦁 Safari Log** — Per-server log channel. Toggle event types in **Settings → 📊 Logs → ⚙️ Configure Log Types**.\n\n**📜 Player Activity Log** — Personal history each player sees in \`/menu\` → Logs. Always on, max 200 entries.`,
      `### \`\`\`🧭 Player Admin Screen\`\`\``,
      `The Player Admin shows full stamina state with regen countdown:\n\`\`\`\n⚡ Stamina: 3/5 (♻️ 2h 15m)\n\`\`\`\n\nUse **✏️ Set Stamina** to override values. Changes are logged across all three systems.`
    ]
  }
];

/**
 * Build a single page of the Safari guide.
 * @param {number} page - Page index (0-based)
 * @returns {Object} Components V2 response
 */
export function buildSafariGuidePage(page = 0) {
  if (page < 0 || page >= PAGES.length) page = 0;

  const current = PAGES[page];

  const components = [
    { type: 10, content: `## ${current.title}` },
    { type: 10, content: current.subtitle },
    { type: 14 },
    ...current.content.map(text => ({ type: 10, content: text })),
    { type: 14 },
    {
      type: 1,
      components: [
        { type: 2, custom_id: 'prod_player_menu', label: '← Menu', style: 2 },
        { type: 2, custom_id: `safari_guide_${page - 1}`, label: '◀ Previous', style: 2, disabled: page === 0 },
        { type: 2, custom_id: `safari_guide_${page + 1}`, label: 'Next ▶', style: 2, disabled: page >= PAGES.length - 1 },
        { type: 2, custom_id: 'safari_guide_counter', label: `${page + 1} / ${PAGES.length}`, style: 2, disabled: true }
      ]
    }
  ];

  return {
    components: [{
      type: 17,
      accent_color: 0xf39c12,
      components
    }]
  };
}

/**
 * Build a single page of the Prod Guide (host-facing).
 * @param {number} page - Page index (0-based)
 * @returns {Object} Components V2 response
 */
export function buildProdGuidePage(page = 0) {
  if (page < 0 || page >= PROD_PAGES.length) page = 0;

  const current = PROD_PAGES[page];

  const navButtons = [
    { type: 2, custom_id: 'castbot_settings', label: '← Settings', style: 2 }
  ];

  // Only show pagination when there are multiple pages
  if (PROD_PAGES.length > 1) {
    navButtons.push(
      { type: 2, custom_id: `prod_guide_${page - 1}`, label: '◀ Previous', style: 2, disabled: page === 0 },
      { type: 2, custom_id: `prod_guide_${page + 1}`, label: 'Next ▶', style: 2, disabled: page >= PROD_PAGES.length - 1 },
      { type: 2, custom_id: 'prod_guide_counter', label: `${page + 1} / ${PROD_PAGES.length}`, style: 2, disabled: true }
    );
  }

  const components = [
    { type: 10, content: `## ${current.title}` },
    { type: 10, content: current.subtitle },
    { type: 14 },
    ...current.content.map(text => ({ type: 10, content: text })),
    { type: 14 },
    { type: 1, components: navButtons }
  ];

  return {
    components: [{
      type: 17,
      accent_color: 0xe74c3c,
      components
    }]
  };
}

// Keep old export name for backward compatibility
export const buildStaminaGuidePage = buildSafariGuidePage;
