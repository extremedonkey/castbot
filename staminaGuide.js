/**
 * Stamina Guide — Paginated player-friendly guide to how stamina works.
 * Deployed to Reece's Stuff for now; can be moved to player menu later.
 */

const PAGES = [
  // Page 0: Overview
  {
    title: '⚡ Stamina Guide',
    subtitle: '-# How stamina works in Safari',
    content: [
      `Every time you move on the map, it costs **1 stamina**. When you run out, you'll need to wait for it to regenerate before you can move again.`,
      `### \`\`\`🔑 Key Concepts\`\`\``,
      `**Current / Max** — Your stamina is shown as \`⚡ 3/5\`, meaning 3 available out of 5 maximum.\n\n**Regeneration** — When your stamina hits 0, a cooldown timer starts. After the timer expires, your stamina resets to full. The host sets how long this takes (e.g. 12 hours).\n\n**Over Max** — Consumable items can push you *above* your max. If your max is 1 and you use a stamina potion, you might have \`⚡ 3/1\`. This is normal!`,
      `### \`\`\`📊 Log Format\`\`\``,
      `-# To see your stamina log, use **\`/menu\`** and tap the **📜 Logs** button.\n\nWhen you move or use items, your activity log shows:\n\`(⚡1/1 → 0/1 ♻️12hr)\`\n\n**⚡1/1** = stamina before (1 out of 1)\n**→ 0/1** = stamina after (0 out of 1)\n**♻️12hr** = time until regen\n\nIf you're at or above max, the ♻️ timer is hidden.`
    ]
  },
  // Page 1: Regeneration Deep Dive
  {
    title: '♻️ Regeneration',
    subtitle: '-# How stamina comes back',
    content: [
      `Stamina regenerates automatically — there's no button to press. It's calculated every time the game checks your stamina (when you try to move, use an item, etc.).`,
      `### \`\`\`⏰ Full Reset (Default)\`\`\``,
      `The most common regen type. When you use your last stamina, a timer starts. After it expires, **all** your stamina resets to max at once.\n\n**Example** (max: 1, regen: 12hr):\n\`\`\`\n⚡ 1/1  →  move  →  ⚡ 0/1  →  wait 12hr  →  ⚡ 1/1\n\`\`\`\n\n**Example** (max: 3, regen: 4hr):\n\`\`\`\n⚡ 3/3 → move → ⚡ 2/3 → move → ⚡ 1/3 → move → ⚡ 0/3\n                                                    ↓\n                                              wait 4hr\n                                                    ↓\n                                               ⚡ 3/3\n\`\`\`\n-# The timer starts from your **last** stamina use, not your first.`,
      `### \`\`\`📈 Incremental (Custom Attributes)\`\`\``,
      `Some hosts set up attributes (like HP or Mana) that regenerate gradually — gaining a fixed amount every interval instead of resetting to max.\n\n**Example** (HP, +10 every 30min):\n\`\`\`\n❤️ 60/100  →  30min  →  ❤️ 70/100  →  30min  →  ❤️ 80/100\n\`\`\``
    ]
  },
  // Page 2: Items & Boosts
  {
    title: '🧪 Items & Boosts',
    subtitle: '-# Consumables, permanent items, and going over max',
    content: [
      `Items can affect your stamina in two ways: **consumable boosts** (temporary, one-time) and **permanent boosts** (as long as you own the item).`,
      `### \`\`\`🍎 Consumable Items\`\`\``,
      `Using a consumable stamina item **adds** to your current stamina and **consumes** the item. It can push you above your max.\n\n**Example** — Energy Drink (+2 stamina):\n\`\`\`\n⚡ 0/1  →  use Energy Drink  →  ⚡ 2/1\n\`\`\`\n-# Consumables do NOT reset your regen timer. If you were 5 minutes from a natural regen, it still happens.\n\n-# Over-max stamina works normally — each move costs 1, so \`2/1\` means 2 moves available.`,
      `### \`\`\`🐎 Permanent Items\`\`\``,
      `Some non-consumable items (like a Horse) increase your **maximum** stamina permanently while you own them. Each bonus stamina point regenerates on its own independent timer.\n\n**Example** — Horse (+3 max stamina):\n\`\`\`\nBase:  ⚡ 1/1\nWith Horse: ⚡ 1/4  (max went from 1 → 4)\n\`\`\`\n-# If you lose the item, your max goes back down. Charges regen individually — you might see \`⚡ 2/4\` while some charges are still on cooldown.`
    ]
  },
  // Page 3: For Hosts
  {
    title: '🛠️ For Hosts',
    subtitle: '-# Configuring and monitoring stamina',
    content: [
      `As a host, you control stamina settings per-server and can monitor all stamina changes across three log systems.`,
      `### \`\`\`⚙️ Configuration\`\`\``,
      `Set stamina via **\`/menu\` → Safari Settings → Stamina**:\n• **Max Stamina** — How many moves before regen (default: 1)\n• **Regen Time** — Minutes until full reset (default: 3)\n• **Starting Stamina** — What new players start with`,
      `### \`\`\`📊 Three Log Systems\`\`\``,
      `Every stamina change now shows a **stamina tag** with before/after state:\n\n**Live Discord Logging** (\`#🪵logs\`)\nGlobal audit trail — every server, every event.\n\`\`\`\n[1:21PM] | Nic in Server | SAFARI_MOVEMENT | Moved C3→C4 (⚡1/1 → 0/1 ♻️12hr)\n\`\`\`\n\n**Safari Log** (per-server channel)\nHost-facing, toggled per event type. Enable **Stamina Changes** in log types config.\n\`\`\`\n🗺️ MOVEMENT | [1:21PM] | Nic moved from C3 to C4 (⚡1/1 → 0/1 ♻️12hr)\n\`\`\`\n\n**Player Activity Log** (in-game)\nPersonal history with stamina inline:\n\`\`\`\n9 hours ago 🗺️ Movement — Moved from C3 to C4 (⚡1/1 → 0/1 ♻️12hr) ⚡0/1 cd: 12hr\n\`\`\``
    ]
  }
];

/**
 * Build a single page of the stamina guide.
 * @param {number} page - Page index (0-based)
 * @returns {Object} Components V2 response
 */
export function buildStaminaGuidePage(page = 0) {
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
        { type: 2, custom_id: 'reeces_stuff', label: '← Back', style: 2 },
        { type: 2, custom_id: `stamina_guide_${page - 1}`, label: '◀ Previous', style: 2, disabled: page === 0 },
        { type: 2, custom_id: `stamina_guide_${page + 1}`, label: 'Next ▶', style: 2, disabled: page >= PAGES.length - 1 },
        { type: 2, custom_id: 'stamina_guide_counter', label: `${page + 1} / ${PAGES.length}`, style: 2, disabled: true }
      ]
    }
  ];

  return {
    components: [{
      type: 17,
      accent_color: 0xf39c12, // Orange for guide/info
      components
    }]
  };
}
