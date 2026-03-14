/**
 * Safari Guide — Paginated player-friendly guide.
 * Accessible from player menu (🦁 Guide button next to 📜 Logs).
 *
 * Prod Guide — Host-facing guide (configuration, logging, admin tools).
 * Accessible from Reece's Stuff menu.
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
      `-# Tap **📜 Logs** in your player menu to see your activity history.\n\nWhen you move or use items, your log shows a stamina tag:\n\`(⚡1/1 → 0/1 ♻️12hr)\`\n\n**⚡1/1** = before (1 of 1) **→ 0/1** = after **♻️12hr** = time until regen\n\nIf you're at or above max, the ♻️ timer is hidden.`
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
 * Prod Guide — Host-facing pages (Reece's Stuff only).
 * Separated from the player-facing Safari Guide.
 */
const PROD_PAGES = [
  // Page 0: Stamina Configuration & Logging
  {
    title: '🛠️ Stamina — For Hosts',
    subtitle: '-# Configuring and monitoring stamina',
    content: [
      `As a host, you control stamina settings per-server and can monitor all stamina changes across three log systems.`,
      `### \`\`\`⚙️ Configuration\`\`\``,
      `Set stamina via **\`/menu\` → Safari Settings → Stamina**:\n• **Max Stamina** — How many moves before regen (default: 1)\n• **Regen Time** — Minutes until full reset (default: 3)\n• **Starting Stamina** — What new players start with`,
      `### \`\`\`📊 Three Log Systems\`\`\``,
      `Every stamina change now shows a **stamina tag** with before/after state:\n\n**Live Discord Logging** (\`#🪵logs\`)\nGlobal audit trail — every server, every event.\n\`\`\`\n[1:21PM] | Nic in Server | SAFARI_MOVEMENT | Moved C3→C4 (⚡1/1 → 0/1 ♻️12hr)\n\`\`\`\n\n**Safari Log** (per-server channel)\nHost-facing, toggled per event type. Enable **Stamina Changes** in log types config.\n\`\`\`\n🗺️ MOVEMENT | [1:21PM] | Nic moved from C3 to C4 (⚡1/1 → 0/1 ♻️12hr)\n\`\`\`\n\n**Player Activity Log** (in-game)\nPersonal history with stamina inline:\n\`\`\`\n9 hours ago 🗺️ Movement — Moved C3 to C4 (⚡1/1 → 0/1 ♻️12hr) ⚡0/1 cd: 12hr\n\`\`\``
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
    { type: 2, custom_id: 'reeces_stuff', label: '← Reece\'s Stuff', style: 2 }
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

// Keep old export name for Reece's Stuff backward compatibility
export const buildStaminaGuidePage = buildSafariGuidePage;
