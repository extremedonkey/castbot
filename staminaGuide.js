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
 * Comprehensive stamina system reference for hosts.
 */
const PROD_PAGES = [
  // Page 0: Overview & Configuration
  {
    title: '🦁 Host Guide — Stamina System',
    subtitle: '-# Page 1: Configuration & basics',
    content: [
      `This guide covers the full stamina system — how it works under the hood, what each setting does, and how the two regeneration phases interact with items.`,
      `### \`\`\`⚙️ Stamina Settings\`\`\``,
      `Configure via **Settings → ⚡ Stamina Settings**:\n• **Max Stamina** — Base capacity before items (default: 1)\n• **Regen Minutes** — Cooldown per regen cycle (default: 3)\n• **Regen Amount** — How much stamina each regen cycle restores (default: max). Set to a number for incremental regen, or leave as "max" for full reset\n• **Starting Stamina** — What new players begin with\n• **Default Starting Location** — Where new players spawn`,
      `### \`\`\`⚡ How Stamina Works\`\`\``,
      `Every move costs **1 stamina**. Stamina is stored per-player in \`entityPoints\` as:\n\`\`\`\n{ current: 3, max: 5, lastUse: <timestamp>,\n  lastRegeneration: <timestamp> }\n\`\`\`\n\n**current** — available stamina right now\n**max** — base capacity (your config + permanent item boosts)\n**lastUse** — when a charge was last consumed\n**lastRegeneration** — when regen last ticked (for continuous regen)`,
      `### \`\`\`♻️ Regen Timer Display\`\`\``,
      `The regen timer appears everywhere stamina is shown:\n• \`♻️MAX\` — all charges ready, nothing on cooldown\n• \`♻️12h 0m\` — hours and minutes remaining\n• \`♻️45m\` — minutes only (under 1 hour)\n• \`♻️30s\` — seconds (under 1 minute)`
    ]
  },
  // Page 1: Phase 1 vs Phase 2 Regeneration
  {
    title: '🔄 Regeneration Phases',
    subtitle: '-# Page 2: Phase 1 (standard) vs Phase 2 (permanent items)',
    content: [
      `The stamina system has **two regeneration modes** that activate automatically based on whether a player owns permanent stamina items.`,
      `### \`\`\`📗 Phase 1 — Standard Players\`\`\``,
      `Players **without** permanent stamina items use Phase 1. Regen is simple:\n\n1. Player uses stamina → \`lastUse\` updated\n2. Timer counts from \`lastRegeneration\` (or \`lastUse\` for migration)\n3. Each elapsed interval adds **Regen Amount** to current\n4. Stops when current reaches max\n\n**Example** (max: 1, regen: 720min, amount: max):\n\`\`\`\n⚡ 1/1 → move → ⚡ 0/1 → 12hr → ⚡ 1/1\n\`\`\`\n\n**Example** (max: 1, regen: 2min, amount: 5):\n\`\`\`\n⚡ 1/1 → move → ⚡ 0/1 → 2min → ⚡ 5/1\n\`\`\`\n-# When Regen Amount > Max, stamina goes **over max** on regen. This is intentional — the player gets bonus moves every cycle.`,
      `### \`\`\`📘 Phase 2 — Players with Permanent Items\`\`\``,
      `Players who own **non-consumable** stamina items (e.g. Horse +1) automatically upgrade to Phase 2. Each stamina point becomes an independent **charge** with its own cooldown:\n\`\`\`\ncharges: [null, null, 1770491700356]\n           ↑       ↑         ↑\n        ready   ready   on cooldown\n\`\`\`\n\n**null** = charge is available\n**timestamp** = charge is on cooldown (regens when \`now - timestamp ≥ interval\`)\n\nWhen a charge regenerates, it adds the **Regen Amount** (not just +1). So with regen amount 5 and 1 charge regenerating: +5 stamina.`,
      `### \`\`\`🔀 Phase Switching\`\`\``,
      `Phase is determined **on every stamina check** by scanning the player's inventory for non-consumable items with \`staminaBoost\`. If found → Phase 2. If not → Phase 1.\n\n-# Players seamlessly switch phases if they gain or lose permanent items. No manual intervention needed.`
    ]
  },
  // Page 2: Items & Over-Max
  {
    title: '🧪 Items & Over-Max Stamina',
    subtitle: '-# Page 3: Consumables, permanent items, and edge cases',
    content: [
      `Items interact with stamina in two distinct ways. Understanding the difference is key to game balance.`,
      `### \`\`\`🍎 Consumable Items\`\`\``,
      `Consumable items with \`staminaBoost\` add stamina **on use** and are removed from inventory.\n\n**Key behaviors:**\n• Stamina can go **above max** (e.g. 5/1 = 5 moves with max 1)\n• Does **NOT** reset the regen timer — purely additive\n• Moving on bonus stamina (above max) does **NOT** start a cooldown\n• Only consuming a natural charge triggers a cooldown\n\n-# This is critical with long cooldowns. A player 5 minutes from regen who uses a consumable still gets their natural regen in 5 minutes.`,
      `### \`\`\`🐎 Permanent Items\`\`\``,
      `Non-consumable items with \`staminaBoost\` increase the player's **max** stamina permanently:\n\n**Example** — Horse (\`staminaBoost: 1, consumable: "No"\`):\n\`\`\`\nBase max: 1 → With Horse: max 2\ncharges: [null, null]  (2 independent charges)\n\`\`\`\n\n**Stacking:** Multiple items stack additively.\nHorse (+1) + Boots (+1) = max 3 (1 base + 2 boost)\n\n**Losing items:** If removed from inventory, max decreases on next stamina check. Charges array auto-trims.`,
      `### \`\`\`⚠️ Over-Max Scenarios\`\`\``,
      `Stamina can exceed max in these cases:\n• **Consumable use** — \`addBonusPoints()\` allows over-max\n• **Regen Amount > Max** — Phase 1 regen can push above max\n• **Admin set** — Admin can set any value\n\nOver-max stamina does **not** regenerate — regen only activates when \`current < max\`. The player must spend down to below max before natural regen kicks in.\n\n-# The Player Admin screen shows over-max as e.g. \`⚡ 5/1 (♻️ MAX)\` — MAX because all charges are ready even though current > max.`
    ]
  },
  // Page 3: Logging & Monitoring
  {
    title: '📊 Logging & Monitoring',
    subtitle: '-# Page 4: Three log systems and the stamina tag',
    content: [
      `Every stamina change appears across three independent log systems with a consistent **stamina tag** format.`,
      `### \`\`\`🏷️ The Stamina Tag\`\`\``,
      `\`(⚡before/max → after/max ♻️timer)\`\n\n| Event | Tag |\n|---|---|\n| Movement (cost 1) | \`(⚡1/1 → 0/1 ♻️12h 0m)\` |\n| Consumable (+4) | \`(⚡1/1 → 5/1 ♻️MAX)\` |\n| Regen (amount: 5) | \`(⚡0/1 → 5/1 ♻️MAX)\` |\n| Admin set to 3 | \`(⚡1/1 → 3/1 ♻️MAX)\` |`,
      `### \`\`\`📡 Live Discord Logging\`\`\``,
      `-# Global audit trail — every server, every event. Goes to your \`#🪵logs\` channel.\n\n\`\`\`\n[1:21PM] | Nic in Server | SAFARI_MOVEMENT |\nMoved C3→C4 (⚡1/1 → 0/1 ♻️12h 0m)\n\`\`\``,
      `### \`\`\`🦁 Safari Log\`\`\``,
      `-# Per-server log channel. Hosts toggle event types via **Settings → 📊 Logs → ⚙️ Configure Log Types**.\n\n\`\`\`\n🗺️ MOVEMENT | [1:21PM] | Nic moved from C3 to C4\n(⚡1/1 → 0/1 ♻️12h 0m)\n\`\`\`\n\`\`\`\n⚡ ITEM USED | [1:42PM] | Nic at F6 (#f6)\nUsed: 🧪 Potion (x1) → +4 stamina (⚡1/1 → 5/1 ♻️MAX)\n\`\`\``,
      `### \`\`\`📜 Player Activity Log\`\`\``,
      `-# In-game personal history (max 200 entries). Players access via **📜 Logs** in \`/menu\`.\n\n\`\`\`\n9h ago 🗺️ Movement — Moved C3→C4\n(⚡1/1 → 0/1 ♻️12h 0m) ⚡0/1 cd: 12h 0m\n\`\`\`\n\n-# The activity log also shows stamina and cooldown as separate fields for quick scanning.`
    ]
  },
  // Page 4: Admin Tools & Troubleshooting
  {
    title: '🛠️ Admin Tools',
    subtitle: '-# Page 5: Player Admin, diagnostics, and common issues',
    content: [
      `The **Player Admin** screen (Production Menu → 🧭 Player Admin) shows full stamina state including regen countdown.`,
      `### \`\`\`🧭 Player Admin Screen\`\`\``,
      `After selecting a player, you'll see:\n\`\`\`\n⚡ Stamina: 3/5 (♻️ 2h 15m)\n\`\`\`\n\nThe ✏️ **Set Stamina** button lets you override a player's current stamina to any value. This:\n• Sets \`current\` to the new value\n• Syncs the charges array (Phase 2 players)\n• Resets \`lastRegeneration\` to now\n• Logs the change to all three log systems`,
      `### \`\`\`🔍 Diagnostic Logs\`\`\``,
      `Watch for these in your console/PM2 logs:\n\n**⚠️ STAMINA OVER-MAX** — Player's current exceeds max. Normal for consumable use and regen amount > max.\n\n**⚠️ STAMINA CONFIG MISMATCH** — Stored max doesn't match server config. Happens when you change Max Stamina in settings. Auto-corrects on next regen.\n\n**🐎⚡ Charge N regenerated** — Phase 2 charge came off cooldown.\n\n**⚡ Stamina regenerated** — Phase 1 regen fired with before/after values.`,
      `### \`\`\`❓ Common Issues\`\`\``,
      `**"Player shows 1/1 but I set regen amount to 5"**\nCheck if the player has a \`charges\` array (Phase 2). Previously, Phase 2 ignored regen amount — this is now fixed. If issue persists, use Admin Set to reset their stamina.\n\n**"Stamina isn't regenerating"**\nRegen only fires when \`current < max\`. If a player is at or above max (including via consumables), no regen occurs.\n\n**"Timer shows MAX but player has 0 stamina"**\nThe timer is "Ready!" when the cooldown has elapsed. The regen fires on the next stamina check (movement, navigate, etc.) — not in the background.`
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
    { type: 2, custom_id: 'safari_customize_terms', label: '← Settings', style: 2 }
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
