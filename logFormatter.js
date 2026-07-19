/**
 * Log Formatter — the "Enhanced" log format shared by the per-server Safari Log
 * and the environment-level CastBot analytics log (#🪵logs).
 *
 * Mirrors the Player Activity Log style (activityLogger.js formatActivityEntry):
 *   <t:ts:R> 🗺️ **Movement** (A2) — **gabi!** moved from A1 to A2 `⚡0/3` `cd: 11h 59m`
 * with `> • ` bullets for custom-action details and `> ` quotes for whispers.
 *
 * PURE MODULE — zero imports, no I/O, no module-load side effects. This keeps it
 * import-safe under node:test and forces impure work (item-name resolution,
 * display-name lookup) to be injected by callers via opts.
 */

// Mirrors activityLogger.js TYPE_EMOJI / TYPE_LABEL, keyed by Safari Log action
const ACTION_STYLE = {
  SAFARI_MOVEMENT: { emoji: '🗺️', label: 'Movement' },
  SAFARI_WHISPER: { emoji: '🤫', label: 'Whisper' },
  SAFARI_WHISPER_READ: { emoji: '🤫', label: 'Whisper Read' },
  SAFARI_ITEM_PICKUP: { emoji: '🧰', label: 'Item' },
  SAFARI_ITEM_ADMIN_EDIT: { emoji: '🔧', label: 'Admin Edit' },
  SAFARI_STORE_ITEMS_EDIT: { emoji: '🏪', label: 'Store Edit' },
  SAFARI_ITEM_USE: { emoji: '⚡', label: 'Item' },
  SAFARI_CURRENCY: { emoji: '🪙', label: 'Currency' },
  SAFARI_PURCHASE: { emoji: '🛒', label: 'Purchase' },
  SAFARI_BUTTON: { emoji: '🎯', label: 'Action' },
  SAFARI_CUSTOM_ACTION: { emoji: '⚡', label: 'Action' },
  SAFARI_ATTACK: { emoji: '⚔️', label: 'Attack' },
  SAFARI_TEST: { emoji: '🧪', label: 'Test' }
};

/**
 * Discord relative timestamp tag, e.g. "<t:1752561000:R>" → "4 minutes ago".
 */
export function discordRelativeTs(nowMs = Date.now()) {
  return `<t:${Math.floor(nowMs / 1000)}:R>`;
}

/**
 * Stamina snapshot → the player-log code tags.
 * Replicates the safariLogger activityOpts mapping (safariLogger.js) built from
 * pointsManager.formatStaminaTag semantics — NOT imported (pointsManager pulls
 * safariManager, far too heavy for a pure module).
 * @param {Object|null} snapshot - { before, after, max, regenTime, regenTimeBefore }
 * @returns {{stamina: string, cd: string}|null}
 */
export function formatStaminaCodeTags(snapshot) {
  if (!snapshot) return null;
  const cd = (!snapshot.regenTime || snapshot.regenTime === 'Full' || snapshot.regenTime === 'Ready!')
    ? 'MAX' : snapshot.regenTime;
  return { stamina: `${snapshot.after}/${snapshot.max}`, cd };
}

// Paren-style stamina transition tag, e.g. " (⚡2/3 ♻️11h 53m → 1/3 ♻️11h 59m)"
// Same semantics as pointsManager.formatStaminaTag (replicated, see note above).
function staminaParenTag(snapshot) {
  if (!snapshot) return '';
  const fmt = (t) => (!t || t === 'Full' || t === 'Ready!') ? '♻️MAX' : `♻️${t}`;
  const after = fmt(snapshot.regenTime);
  const before = snapshot.regenTimeBefore ? fmt(snapshot.regenTimeBefore) : null;
  const beforePart = before && before !== after
    ? `⚡${snapshot.before}/${snapshot.max} ${before}`
    : `⚡${snapshot.before}/${snapshot.max}`;
  return ` (${beforePart} → ${snapshot.after}/${snapshot.max} ${after})`;
}

function codeTags(snapshot) {
  const tags = formatStaminaCodeTags(snapshot);
  if (!tags) return '';
  return ` \`⚡${tags.stamina}\` \`cd: ${tags.cd}\``;
}

// Quote every line of a message as Discord blockquote
function quoteBlock(text) {
  if (!text) return '';
  return '\n' + String(text).split('\n').map(l => `> ${l}`).join('\n');
}

// Summarize executedActions as "> • " bullets — replicates safariLogger._buildActionActivityDesc's
// switch, with item names via the injected resolver instead of async entityManager calls.
function actionBullets(executedActions, resolveItem) {
  const details = [];
  for (const action of executedActions || []) {
    const cfg = action.config || {};
    switch (action.type) {
      case 'display_text': {
        const text = cfg.text || cfg.content || '';
        const preview = text.length > 60 ? text.slice(0, 57) + '...' : text;
        if (preview) details.push(`Text: "${preview}"`);
        break;
      }
      case 'give_item': {
        const resolved = resolveItem ? resolveItem(cfg.itemId) : null;
        const name = resolved?.name || cfg.itemId;
        const emoji = resolved?.emoji || '📦';
        details.push(`Give Item: ${emoji} ${name} (x${cfg.quantity || 1})`);
        break;
      }
      case 'give_currency': {
        const amt = cfg.amount || 0;
        details.push(`Currency: ${amt > 0 ? '+' : ''}${amt}`);
        break;
      }
      case 'move_player':
        details.push(`Move: → ${cfg.destination || cfg.coordinate || '?'}`);
        break;
      case 'manage_player_state':
        details.push(`Safari State: ${cfg.mode || '?'} → ${cfg.coordinate || 'default'}`);
        break;
      case 'modify_points': {
        const pts = cfg.amount || cfg.points || 0;
        details.push(`Points: ${pts > 0 ? '+' : ''}${pts} (${cfg.entityId || cfg.pointsId || '?'})`);
        break;
      }
      case 'follow_up_button':
      case 'follow_up':
        details.push('Follow-up button');
        break;
      case 'store_display':
        details.push(`Store: ${cfg.storeId || '?'}`);
        break;
      case 'random_outcome':
        details.push('Random outcome');
        break;
      case 'conditional':
        details.push('Conditional check');
        break;
      // Skip unknown types silently (matches _buildActionActivityDesc)
    }
  }
  if (details.length === 0) return '';
  return '\n' + details.map(d => `> • ${d}`).join('\n');
}

/**
 * Format a Safari Log entry in the Enhanced (player-log-style) format.
 *
 * @param {string} action - e.g. 'SAFARI_MOVEMENT'
 * @param {string} userDisplayName - already-resolved display name
 * @param {Object} safariContent - the logger's content payload (plus _buttonLabel/_buttonEmoji for custom actions)
 * @param {string} details - the plain-text summary passed to logInteraction
 * @param {Object} [opts]
 * @param {number} [opts.nowMs] - timestamp override (deterministic tests)
 * @param {Function} [opts.resolveItem] - (itemId) => { name, emoji } | null
 * @returns {string} formatted log line
 */
export function formatEnhancedSafariLog(action, userDisplayName, safariContent = {}, details = '', opts = {}) {
  const ts = discordRelativeTs(opts.nowMs);
  const name = `**${userDisplayName}**`;
  const style = ACTION_STYLE[action] || { emoji: '📝', label: action };
  const loc = safariContent.location ? ` (${safariContent.location})` : '';

  switch (action) {
    case 'SAFARI_MOVEMENT': {
      // Init entries arrive as SAFARI_MOVEMENT with no fromLocation (logPlayerInitialization)
      const isInit = safariContent.fromLocation == null && typeof details === 'string' && details.startsWith('Initialized');
      if (isInit) {
        // details already reads "Initialized at A1 with 100 Coins (⚡0/3 → 3/3 ♻️MAX)" — strip
        // the paren stamina tag (rebuilt as code tags) for the cleaner player-log look
        const desc = details.replace(/\s*\(⚡[^)]*\)\s*$/, '');
        const initLoc = safariContent.toLocation ? ` (${safariContent.toLocation})` : '';
        return `${ts} 🚀 **Init**${initLoc} — ${name} ${desc}${codeTags(safariContent.staminaSnapshot)}`;
      }
      const prefix = safariContent.moveSource === 'admin' ? 'ADMIN '
        : safariContent.moveSource === 'teleport' ? 'TELEPORT ' : '';
      const moveLoc = safariContent.toLocation ? ` (${safariContent.toLocation})` : '';
      let line = `${ts} 🗺️ **${prefix}Movement**${moveLoc} — ${name} moved from ${safariContent.fromLocation} to ${safariContent.toLocation}${staminaParenTag(safariContent.staminaSnapshot)}`;
      if (safariContent.viaPane) line += ` \`via ${safariContent.viaPane} pane\``;
      line += codeTags(safariContent.staminaSnapshot);
      return line;
    }

    case 'SAFARI_WHISPER':
      return `${ts} 🤫 **Whisper**${loc} — ${name} → **${safariContent.recipientName}**${quoteBlock(safariContent.message)}`;

    case 'SAFARI_WHISPER_READ':
      return `${ts} 🤫 **Whisper Read**${loc} — ${name} read a whisper from **${safariContent.senderName}**`;

    case 'SAFARI_ITEM_PICKUP':
      return `${ts} 🧰 **Item**${loc} — ${name} collected ${safariContent.itemEmoji || '📦'} **${safariContent.itemName}** x${safariContent.quantity}`;

    case 'SAFARI_ITEM_ADMIN_EDIT':
      return `${ts} 🔧 **Admin Edit**${loc} — ${name} edited ${safariContent.itemEmoji || '📦'} **${safariContent.itemName}** to x${safariContent.quantity} (was x${safariContent.previousQuantity})`;

    case 'SAFARI_STORE_ITEMS_EDIT': {
      const addedList = (safariContent.itemsAdded || []).map(i => `${i.emoji || '📦'} ${i.name}`).join(', ');
      const removedList = (safariContent.itemsRemoved || []).map(i => `${i.emoji || '📦'} ${i.name}`).join(', ');
      const parts = [];
      if (addedList) parts.push(`Added: ${addedList}`);
      if (removedList) parts.push(`Removed: ${removedList}`);
      return `${ts} 🏪 **Store Edit** — ${name} updated ${safariContent.storeEmoji || '🏪'} **${safariContent.storeName}**${parts.length ? '\n> ' + parts.join('\n> ') : ''}`;
    }

    case 'SAFARI_ITEM_USE': {
      const snapTags = safariContent.staminaSnapshot
        ? codeTags(safariContent.staminaSnapshot)
        : ` (${safariContent.staminaBefore} → ${safariContent.staminaAfter})`;
      return `${ts} ⚡ **Item**${loc} — ${name} used ${safariContent.itemEmoji || '⚡'} **${safariContent.itemName}** x${safariContent.quantity} → +${safariContent.staminaBoost} stamina${snapTags}`;
    }

    case 'SAFARI_CURRENCY': {
      const verb = safariContent.amount > 0 ? 'gained' : 'lost';
      const src = safariContent.source ? ` from "${safariContent.source}"` : '';
      return `${ts} 🪙 **Currency**${loc} — ${name} ${verb} ${Math.abs(safariContent.amount)} ${safariContent.currencyName}${src}`;
    }

    case 'SAFARI_PURCHASE':
      return `${ts} 🛒 **Purchase**${loc} — ${name} bought ${safariContent.itemEmoji || '📦'} **${safariContent.itemName}** x${safariContent.quantity} for ${safariContent.price} ${safariContent.currencyName} at **${safariContent.storeName}**`;

    case 'SAFARI_BUTTON': {
      const result = safariContent.result ? quoteBlock(safariContent.result) : '';
      return `${ts} 🎯 **Action**${loc} — ${name} clicked "${safariContent.buttonLabel}"${result}`;
    }

    case 'SAFARI_CUSTOM_ACTION': {
      const isCommand = safariContent.actionType === 'player_command';
      const emoji = isCommand ? '⌨️' : '⚡';
      let header;
      if (isCommand) {
        header = `Command: "${safariContent.actionId}"`;
      } else if (safariContent._buttonLabel) {
        header = `${safariContent._buttonEmoji ? safariContent._buttonEmoji + ' ' : ''}${safariContent._buttonLabel}`;
      } else {
        header = `Button: ${safariContent.actionId}`;
      }
      let tail;
      if (safariContent.success === false && safariContent.errorMessage) {
        tail = `\n> ❌ ${safariContent.errorMessage}`;
      } else {
        tail = actionBullets(safariContent.executedActions, opts.resolveItem);
      }
      return `${ts} ${emoji} **Action**${loc} — ${name} ${header}${tail}`;
    }

    case 'SAFARI_ATTACK': {
      const roundMatch = safariContent.result?.match(/Round (\d+)/);
      const round = roundMatch ? roundMatch[1] : 'Unknown';
      const result = safariContent.result ? quoteBlock(safariContent.result) : '';
      return `${ts} ⚔️ **Attack**${loc} — ${name} scheduled an attack on **${safariContent.targetName}** (Round ${round})${result}`;
    }

    case 'SAFARI_TEST':
      return `${ts} 🧪 **Test** — ${name} Safari Log test (configured by ${safariContent.configuredBy || 'Unknown'})`;

    default:
      return `${ts} ${style.emoji} **${style.label}** — ${name} ${details}`;
  }
}

// Action-type emoji for the enhanced analytics line
const ANALYTICS_EMOJI = {
  SLASH_COMMAND: '⌨️',
  BUTTON_CLICK: '🔘',
  SELECT_MENU: '📋',
  MODAL_SUBMIT: '📝',
  MODAL_OPEN: '📝'
};

// Same detail-bolding rules as analyticsLogger.formatActionDetails (replicated — pure)
function boldDetails(actionType, details) {
  if (actionType === 'SLASH_COMMAND') return `**${details}**`;
  if (actionType === 'BUTTON_CLICK') {
    const m = details.match(/^(.+?)\s+\((.+)\)$/);
    return m ? `**${m[1]}** (${m[2]})` : `**${details}**`;
  }
  return details;
}

/**
 * Format an environment analytics log line (#🪵logs) in the Enhanced format.
 * Input is the classic pipe-delimited line built in analyticsLogger.logInteraction:
 *   "[8:33AM] Thu 19 Jun 25 | User (username) in Server Name (1234567890) | #channel | ACTION | details"
 * (channel segment optional). Parsed with the same regexes as formatAnalyticsLine.
 * Output drops the text timestamp (→ Discord <t:R>) and the raw server ID.
 * PARSE FAILURE → returns the classic `* ${line}` untouched, so nothing is lost.
 *
 * @param {string} line - classic log line
 * @param {number} [nowMs] - timestamp override for tests
 * @returns {string} formatted line
 */
export function formatEnhancedAnalyticsLine(line, nowMs = Date.now()) {
  const ts = discordRelativeTs(nowMs);

  // With channel segment. Channel = `#` + anything up to the next pipe — safari channel
  // names start with EMOJI (#🍺f4-fraunces-tavern), which `[\w-]` never matched, so every
  // emoji-channel line used to fall through to the raw fallback (prod bug 2026-07-16).
  let match = line.match(/^(\[[\d:APM]+\]\s+\w{3}\s+\d{1,2}\s+\w{3}\s+\d{2})\s+\|\s+(.+?)\s+in\s+(.+?)\s+\((\d+)\)\s+\|\s+(#[^|]+?)\s+\|\s+([\w_]+)\s+\|\s+(.+)$/);
  if (match) {
    const [, , user, serverName, , channel, actionType, details] = match;
    const emoji = ANALYTICS_EMOJI[actionType] || ACTION_STYLE[actionType]?.emoji || '📊';
    return `* ${ts} ${emoji} **\`${user}\`** in __\`${serverName}\`__ **${channel}** — ${boldDetails(actionType, details)}`;
  }

  // Without channel segment
  match = line.match(/^(\[[\d:APM]+\]\s+\w{3}\s+\d{1,2}\s+\w{3}\s+\d{2})\s+\|\s+(.+?)\s+in\s+(.+?)\s+\((\d+)\)\s+\|\s+([\w_]+)\s+\|\s+(.+)$/);
  if (match) {
    const [, , user, serverName, , actionType, details] = match;
    const emoji = ANALYTICS_EMOJI[actionType] || ACTION_STYLE[actionType]?.emoji || '📊';
    return `* ${ts} ${emoji} **\`${user}\`** in __\`${serverName}\`__ — ${boldDetails(actionType, details)}`;
  }

  return `* ${line}`; // unparseable → classic passthrough
}
