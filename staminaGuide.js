/**
 * Safari Guide — Paginated player-friendly guide.
 * Accessible from player menu (🦁 Guide button next to 📜 Logs).
 *
 * Prod Guide — Host-facing guide (configuration, logging, admin tools).
 * Accessible from Settings menu (🦁 Guide button next to ← Back).
 *
 * Pages support:
 *  - content entries that are strings (static) OR functions (cfg) => string, resolved
 *    against getStaminaConfig(guildId) so copy can quote the server's real settings.
 *  - an optional `image` (basename in img/guides/, or (cfg) => basename for dynamic
 *    selection) rendered as a Media Gallery via guideAssets.getGuideImageUrl — omitted
 *    entirely when the URL can't be resolved (never breaks the page).
 * Builders are async and take { guildId, client }; with neither, output degrades to
 * static text only (backward compatible with legacy callers).
 */

const PAGES = [
  // Page 0: Welcome & How to Play
  {
    title: '🦁 Safari Guide',
    subtitle: '-# How Safari works — start here',
    content: [
      `Welcome! Safari is a grid-based exploration game. Each location on the map is its own Discord channel — you occupy one at a time, exploring what's there before moving on.`,
      `### \`\`\`🗺️ The Map & Navigation\`\`\``,
      `The map is a grid of locations you can move through horizontally, vertically, and diagonally. To move, click **🗺️ Explore** in your location channel, then **Navigate** — you'll see a private compass with buttons for each direction.\n\nWhen you arrive somewhere, other players in that channel will see your arrival message. Click **Navigate** on it — the announcement disappears and you'll see your movement controls privately.`,
      `### \`\`\`📍 Location Actions\`\`\``,
      `Each location channel has a pinned message at the top showing where you are, a description, and buttons for things you can do there. All interactions are **private** — other players won't see what you clicked or what happened.`,
      `### \`\`\`📋 Player Menu\`\`\``,
      `Type **\`/menu\`** anywhere to access your menu. The buttons you see depend on what your host has enabled:\n• **🗺️ Safari Map** — Movement controls and map options\n• **🧰 Inventory** — See your items (usable items show a button — your host may rename this)\n• **🪙 Currency** — Check your balance\n• **📜 Logs** — Your activity history\n• **🦁 Guide** — You're reading it!\n\n-# You might also see **🏪 Stores**, **🛠️ Crafting**, or **🏃 Challenges** if your host uses those features.`
    ]
  },
  // Page 1: Stamina & Movement
  {
    title: '⚡ Stamina & Movement',
    subtitle: '-# What limits your exploration',
    content: [
      `Every move costs **1 stamina**. When you run out, you'll need to wait for it to regenerate before you can move again. Your host sets the regen time — it could be hours or minutes.`,
      `### \`\`\`⚡ Reading Your Stamina\`\`\``,
      `Your stamina is shown as \`⚡ 3/5\` — meaning **3 available** out of **5 maximum**.\n\n**Over Max** — Some items can push you *above* your max. \`⚡ 3/1\` means 3 moves available even though your max is 1. This is normal!\n\nThe regen countdown restarts from your **last** move. If you moved at 9:00 PM and regen is 12 hours, your next refill lands at 9:00 AM.\n\n-# In **📜 Logs**, your moves show a stamina tag: \`(⚡1/1 → 0/1 ♻️12hr)\` — stamina before → after, then time until your next regen (\`♻️MAX\` = full).`
    ]
  },
  // Page 2: Regeneration
  {
    title: '♻️ Regeneration',
    subtitle: '-# How stamina comes back',
    image: (cfg) => (cfg.regenerationAmount != null ? 'player-stamina-drip.png' : 'player-stamina-fullreset.png'),
    imageAlt: 'How stamina regeneration works on this server',
    content: [
      `Stamina regenerates automatically — there's no button to press. It's calculated every time the game checks your stamina (when you try to move, use an item, etc.). Servers run one of two styles: **Full refill** or **Drip**.`,
      (cfg) => {
        const mins = cfg.regenerationMinutes;
        const time = mins % 60 === 0 && mins >= 60 ? `${mins / 60} hour${mins === 60 ? '' : 's'}` : `${mins} minutes`;
        const style = cfg.regenerationAmount != null
          ? `**Drip** — +${cfg.regenerationAmount} per cooldown`
          : '**Full refill** — everything back at once';
        return `-# **This server:** max ⚡ ${cfg.maxStamina} · cooldown ${time} · style: ${style}`;
      },
      `### \`\`\`⏰ Full Refill\`\`\``,
      `One cooldown after your **last** move, ALL your stamina resets to max at once.\n\n**Example** (max: 3, regen: 4hr):\n\`\`\`\n⚡ 3/3 → move → ⚡ 2/3 → move → ⚡ 1/3 → move → ⚡ 0/3\n                                                    ↓\n                                              wait 4hr\n                                                    ↓\n                                               ⚡ 3/3\n\`\`\`\n-# The timer runs from your **last** stamina use, not your first — spreading moves out pushes the refill later.`,
      `### \`\`\`💧 Drip\`\`\``,
      `You have **ONE personal timer** (not one per point!). Each completed cooldown hands you a fixed amount, and **every move restarts the countdown**.\n\n**Example** (max: 3, +1 per 12hr):\n\`\`\`\n⚡ 0/3 → wait 12hr → ⚡ 1/3 → move → ⚡ 0/3 → wait 12hr → ⚡ 1/3\n\`\`\`\n-# You do NOT get each point back separately 12hr after you spent it — filling an empty tank takes one full cooldown **per point**. Make your moves in bursts and the timer works for you, not against you.`,
      `### \`\`\`📈 Incremental (Attributes)\`\`\``,
      `Some hosts set up attributes (like HP or Mana) that regenerate gradually — gaining a fixed amount every interval instead of resetting to max.\n\n**Example** (HP, +10 every 30min):\n\`\`\`\n❤️ 60/100  →  30min  →  ❤️ 70/100  →  30min  →  ❤️ 80/100\n\`\`\``
    ]
  },
  // Page 3: Items & Strategy
  {
    title: '🧪 Items & Strategy',
    subtitle: '-# Consumables, permanent items, and smart stamina usage',
    content: [
      `Items can affect your stamina in two ways: **consumable boosts** (instant, used up) and **permanent boosts** (a bigger tank while you own the item).`,
      `### \`\`\`🍎 Consumable Items\`\`\``,
      `Using a consumable stamina item **adds** to your current stamina instantly and **consumes** the item. It always counts — even at full — and can push you above your max.\n\n**Example** — Energy Drink (+2 stamina):\n\`\`\`\n⚡ 0/1  →  use Energy Drink  →  ⚡ 2/1\n\`\`\`\n-# Consumables do NOT touch your regen timer. If you were 5 minutes from a natural regen, it still happens.\n\n-# Over-max stamina works normally — each move costs 1, so \`2/1\` means 2 moves available. But stamina above max won't regenerate until you spend back below max.`,
      `### \`\`\`🐎 Permanent Items\`\`\``,
      `Some non-consumable items (like a Horse) make your tank **bigger** while you own them — your maximum rises by the item's boost.\n\n**Example** — Horse (+3 max stamina):\n\`\`\`\nBase:  ⚡ 1/1\nWith Horse: ⚡ 1/4  (max went from 1 → 4)\n\`\`\`\n-# The extra capacity refills through the **normal cooldown** — same single timer as the rest of your stamina, no separate per-point timers. Lose the item and your max drops back; points above the new max stay spendable but won't regenerate until you're below max again.`,
      `### \`\`\`💡 Optimal Stamina Usage\`\`\``,
      `Two habits save you hours of cooldown:\n\n**1. Make your moves in bursts.** The regen countdown restarts from your last move, so spreading moves out delays your refills.\n\n**2. Natural stamina first, consumables second.** Wait for your regen to fire, spend it, *then* pop the consumable.\n\n**Example** (regen: 12hr):\n\`\`\`\n⚡ 0/1 → wait 12hr → ⚡ 1/1 → move → ⚡ 0/1\n  → use consumable → ⚡ 1/1 → move → ⚡ 0/1\n\`\`\`\n-# If you use the consumable *before* your natural regen, you waste whatever time was left on the timer.`
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
      `**For all players at once (recommended):**\n\`/menu\` → **🗺️ Map** → **🦁 Start Safari** → Select players → **▶️ Start Safari**\n\n**For a single player:**\n\`/menu\` → **🧑‍🤝‍🧑 Players** → Select player → **🗺️ Safari Map** → **🚀 Initialize Safari**\n\n-# Make sure you've set starting locations first (see below).`,
      `### \`\`\`🛬 Removing Players from Safari\`\`\``,
      `**Single player:** \`/menu\` → **🧑‍🤝‍🧑 Players** → Select player → **🗺️ Safari Map** → **🛬 De-initialize from Safari**\n\n**Multiple players:** \`/menu\` → **🗺️ Map** → **🚪 Remove Players**\n\n-# ⚠️ This wipes the player's currency, inventory, stamina, and map location — it cannot be undone. Per-player starting locations are preserved.`,
      `### \`\`\`🪙 Setting Starting Currency\`\`\``,
      `New players start with a default amount of currency. Set this in **⚙️ Settings → 🪙 Currency & Inventory** → **Default Starting Currency**.`,
      `### \`\`\`🚩 Setting Starting Locations\`\`\``,
      `**Server default:** Set in **⚙️ Settings → 📍 Location** → **Starting Coordinate** — all new players spawn here.\n\n**Per-player override:** \`/menu\` → **🧑‍🤝‍🧑 Players** → Select player → **🗺️ Safari Map** → **🚩 Starting Location** → Type in the coordinate.\n\nWhen the game starts, each player lands at their assigned square (or the server default if none is set).`,
      `### \`\`\`📍 Moving a Player Manually\`\`\``,
      `If something goes wrong and a player ends up in the wrong location:\n\`/menu\` → **🧑‍🤝‍🧑 Players** → Select player → **🗺️ Safari Map** → **📍 Move Player**`
    ]
  },
  // Page 1: Managing Players
  {
    title: '👥 Managing Players',
    subtitle: '-# Page 2: Items, currency, and transfers',
    content: [
      `Use **🧑‍🤝‍🧑 Players** (the Player Manager) for all player management tasks. Select the player at the top, then click a category button (🪙 Currency, 🧰 Inventory, 🗺️ Safari Map, ⚡ Stamina) — the select menu at the bottom swaps to show that category's options.`,
      `### \`\`\`🪙 Giving Currency\`\`\``,
      `\`/menu\` → **🧑‍🤝‍🧑 Players** → Select player → **🪙 Currency** → **Edit Currency**\n\nThis shows their current balance. Type a new amount to set it.\n\n-# If you've renamed your currency, the buttons use your custom name.`,
      `### \`\`\`📦 Giving Items\`\`\``,
      `\`/menu\` → **🧑‍🤝‍🧑 Players** → Select player → **🧰 Inventory** → **✏️ Edit Inventory**\n\n1. Search for the item\n2. Set the quantity to give them\n3. Let them know — they can check via \`/menu\` → Inventory`,
      `### \`\`\`💱 Transferring Currency Between Players\`\`\``,
      `There's no direct transfer button — adjust both players manually:\n\n**Sending player:** \`/menu\` → **🧑‍🤝‍🧑 Players** → Select → **🪙 Currency** → **Edit Currency** → Subtract the amount\n**Receiving player:** Same steps → Add the amount`,
      `### \`\`\`⚡ Setting a Player's Stamina\`\`\``,
      `\`/menu\` → **🧑‍🤝‍🧑 Players** → Select player → **⚡ Stamina** → **⚡ Modify Stamina**\n\nYou'll see their current stamina and regen timer. Type a new value to override it.\n\n-# ⚠️ Setting stamina also restarts the player's regen countdown from that moment. If you don't want that side effect, follow up with **♻️ Manually Set Refresh** (below) to put their next refill back where it should be.\n\nThe same menu also has **♻️ Manually Set Refresh** — set exactly when their next stamina refresh lands (days/hours/minutes/seconds; blank = refresh immediately). One-shot: only the current cycle shifts — the next cycle runs on your server's regen time as normal.`,
      `### \`\`\`🗺️ Other Map Tools\`\`\``,
      `The **🗺️ Safari Map** category also has per-player tools:\n• **⏸️ Pause Player** — Temporarily block a player from moving\n• **🔄 Reset Explored Locations** — Clear their fog-of-war progress\n• **🗺️ Show Navigate Pane** — See their movement view`
    ]
  },
  // Page 2: Stamina Settings
  {
    title: '⚡ Stamina Settings',
    subtitle: '-# Page 3: How stamina and regeneration work',
    image: 'host-stamina-options.png',
    imageAlt: 'The stamina settings and both regeneration styles at a glance',
    content: [
      `Stamina controls how many map moves a player can make before waiting. Configure it via **⚙️ Settings → ⚡ Stamina**.`,
      `### \`\`\`⚙️ The Settings\`\`\``,
      `• **Starting Stamina** — What new players begin with (may exceed Max — the excess never regens back)\n• **Max Stamina** — The tank size: how many moves a player can store up (before item boosts)\n• **Regeneration Time (minutes)** — The length of one cooldown\n• **Regeneration Style** — The mode switch: **Full refill** (recommended) or **Drip**\n• **Drip Amount** — Points granted per cooldown (Drip style only — can exceed max)`,
      `### \`\`\`🏕️ Scavenger Mode (Max 0)\`\`\``,
      `Set **Max Stamina to 0** and natural regeneration never fires — players only gain stamina from **⚡ Give Stamina** action outcomes (pair with usage limits like once-per-player-per-period) and items. Permanent items with a Stamina Boost still raise the cap, and that capacity DOES refill on your normal regen settings — a buildable "Shelter" item literally enables resting.\n\n-# ⚠️ Use the **Give Stamina** outcome for stamina, never the legacy points outcomes — those clamp to max and restart the regen timer, which at max 0 wipes a player's stamina to 0.`,
      `### \`\`\`♻️ How Regeneration Works\`\`\``,
      `Every player has **one** regen timer, anchored to their most recent move — moving restarts the countdown.\n\n**Full refill** (default): one cooldown after the player's LAST move, the whole tank snaps back to max. Easy to explain: *"you get everything back one cooldown after your last move."*\n\n**Drip**: each completed cooldown grants +Drip Amount. Filling an empty tank takes one cooldown per missing point.\n\n-# ⚠️ Players usually assume each point refills on its OWN timer — it doesn't. If you run Drip, tell them up front it's one shared timer, or expect "stamina is broken" reports.\n\nThe regen timer shows everywhere stamina appears: \`♻️MAX\` means fully charged, \`♻️2h 15m\` shows time until next regen.`
    ]
  },
  // Page 3: Items & Permanent Boosts
  {
    title: '🧪 Items & Permanent Boosts',
    subtitle: '-# Page 4: How items interact with stamina',
    content: [
      `Items can boost stamina in two ways. Understanding the difference helps with game balance.`,
      `### \`\`\`🍎 Consumable Items\`\`\``,
      `Items marked as **Consumable: Yes** with a **Stamina Boost** value will add stamina when a player uses them. The item is removed from their inventory.\n\n• Works even at full — stamina can go **above max** (e.g. \`5/1\` = 5 moves with max 1)\n• Using a consumable does **NOT** restart the regen timer\n• Moving on bonus stamina also doesn't trigger a cooldown\n\n-# This matters with long regen times. A player 5 minutes from regen who pops a consumable still gets their natural regen on time.`,
      `### \`\`\`🐎 Permanent Items\`\`\``,
      `Items marked as **Consumable: No** with a **Stamina Boost** value give the holder a **bigger tank** — their max rises by the boost while they own the item.\n\n**Example** — Horse (Stamina Boost: 1): player's max goes from 1 → 2. The extra capacity refills through your normal regeneration style — there are **no separate per-item timers**.\n\n**Stacking**: Horse (+1) + Boots (+1) = max 3 (1 base + 2 from items)\n\n-# If the item is removed, max decreases automatically; points above the new max stay spendable but won't regenerate until the player is below max again.`,
      `### \`\`\`⚠️ Over-Max Stamina\`\`\``,
      `Players can go above max via consumables, drip overshoot, or admin overrides. Over-max stamina does **not** regenerate — the player must spend down below max before natural regen kicks in.`
    ]
  },
  // Page 4: Logging & Monitoring
  {
    title: '📊 Safari Log',
    subtitle: '-# Page 5: Setting up and using your server log',
    content: [
      `The **Safari Log** is a per-server activity feed that posts game events to a Discord channel in real time. It's the best way to monitor what your players are doing without watching every channel.`,
      `### \`\`\`🔧 Setting It Up\`\`\``,
      `1. Go to **⚙️ Settings → 📊 Logs**\n2. Click **🟢 Enable Safari Log**\n3. Click **📝 Set Log Channel** and choose the channel\n4. Click **⚙️ Configure Log Types** to choose what gets logged\n5. Click **🧪 Send Test Message** to confirm it's working\n\n-# We recommend a private channel only hosts can see — players don't need to see the log.`,
      `### \`\`\`📋 What Gets Logged\`\`\``,
      `Toggle each event type on or off:\n• **🗺️ Map Movement** — who moved where, with stamina cost\n• **🧰 Item Pickups** — items found and consumables used\n• **🪙 Currency Changes** — currency earned/spent\n• **🛒 Store Purchases** — store transactions\n• **⚔️ Attack Queue** — combat results\n• **🎯 Safari Actions** — button clicks in location channels\n• **⌨️ Custom Actions** — custom action triggers and outcomes\n• **🤫 Whispers** — whisper messages sent\n• **⚡ Stamina Changes** — stamina adjustments and regeneration`,
      `### \`\`\`🏷️ Reading the Stamina Tag\`\`\``,
      `Movement and item logs include a stamina tag:\n\`(⚡1/1 → 0/1 ♻️12h 0m)\`\n\n**⚡1/1** = stamina before the action\n**→ 0/1** = stamina after\n**♻️12h 0m** = time until next regen (\`♻️MAX\` = fully charged)\n\nThis tells you at a glance how much stamina a player had and when they'll be able to move again.`,
      `### \`\`\`📜 Player Activity Log\`\`\``,
      `Each player also has their own **personal activity log** they can view via \`/menu\` → **📜 Logs**. This is always on (max 200 entries) and shows their own movements, item uses, and stamina changes. You don't need to configure anything — it works automatically.`
    ]
  }
];

/**
 * Resolve a page's dynamic pieces: config-driven content entries and the Media Gallery.
 * Never throws — dynamic entries are skipped and the gallery omitted on any failure.
 */
async function resolvePage(current, { guildId = null, client = null } = {}) {
  let cfg = null;
  const needsCfg = current.content.some(c => typeof c === 'function') || typeof current.image === 'function';
  if (needsCfg && guildId) {
    try {
      const { getStaminaConfig } = await import('./safariManager.js');
      cfg = await getStaminaConfig(guildId);
    } catch (e) {
      console.warn(`⚠️ staminaGuide: getStaminaConfig failed for ${guildId}: ${e.message}`);
    }
  }

  const contentBlocks = [];
  for (const entry of current.content) {
    if (typeof entry === 'function') {
      if (cfg) {
        try { contentBlocks.push({ type: 10, content: entry(cfg) }); } catch { /* skip broken dynamic entry */ }
      }
    } else {
      contentBlocks.push({ type: 10, content: entry });
    }
  }

  let gallery = [];
  const imageName = typeof current.image === 'function' ? (cfg ? current.image(cfg) : null) : current.image;
  if (imageName && client) {
    try {
      const { getGuideImageUrl } = await import('./guideAssets.js');
      const url = await getGuideImageUrl(client, imageName);
      if (url) gallery = [{ type: 12, items: [{ media: { url }, description: current.imageAlt || current.title }] }];
    } catch (e) {
      console.warn(`⚠️ staminaGuide: image resolve failed for ${imageName}: ${e.message}`);
    }
  }

  return { contentBlocks, gallery };
}

/**
 * Build a single page of the Safari guide (player-facing).
 * @param {number} page - Page index (0-based)
 * @param {{guildId?: string, client?: import('discord.js').Client}} [options] - enables
 *   config-aware copy and the infographic gallery; omit for static text only.
 * @returns {Promise<Object>} Components V2 response
 */
export async function buildSafariGuidePage(page = 0, options = {}) {
  if (page < 0 || page >= PAGES.length) page = 0;

  const current = PAGES[page];
  const { contentBlocks, gallery } = await resolvePage(current, options);

  const components = [
    { type: 10, content: `## ${current.title}` },
    { type: 10, content: current.subtitle },
    { type: 14 },
    ...contentBlocks,
    ...gallery,
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
 * @param {{guildId?: string, client?: import('discord.js').Client}} [options]
 * @returns {Promise<Object>} Components V2 response
 */
export async function buildProdGuidePage(page = 0, options = {}) {
  if (page < 0 || page >= PROD_PAGES.length) page = 0;

  const current = PROD_PAGES[page];
  const { contentBlocks, gallery } = await resolvePage(current, options);

  const navButtons = [
    { type: 2, custom_id: 'castbot_settings', label: '← Settings', style: 2 },
    { type: 2, custom_id: `prod_guide_${page - 1}`, label: '◀', style: 2, disabled: page === 0 },
    { type: 2, custom_id: 'prod_guide_counter', label: `${page + 1} / ${PROD_PAGES.length}`, style: 2, disabled: true },
    { type: 2, custom_id: `prod_guide_${page + 1}`, label: '▶', style: 2, disabled: page >= PROD_PAGES.length - 1 }
  ];

  const components = [
    { type: 10, content: `## ${current.title}` },
    { type: 10, content: current.subtitle },
    { type: 14 },
    ...contentBlocks,
    ...gallery,
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
