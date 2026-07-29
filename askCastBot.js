/**
 * 👾 Ask CastBot — trusted super-user Q&A via Claude CLI (MVP)
 *
 * The Moai's brother. Same plumbing (modal → deferred public reply → chunked response),
 * different audience and a hard read-only toolset.
 *
 * WHY A CLI SPAWN AND NOT THE API: this is an MVP for trusted super-users only. The
 * durable answer is a tools-less Anthropic API call whose knowledge lives in a cached
 * system prompt — then "cannot touch the repo" is architecture, not configuration.
 * See the access gate below for who can reach this in the meantime.
 *
 * TOOL RESTRICTION IS STRUCTURAL, NOT PROMPTED: CLI_TOOLS is a hard allowlist passed to
 * `claude --tools`. The agent gets Read/Glob/Grep and nothing else — no Bash, no Write,
 * no Edit, and critically no Agent/Task, which would otherwise let it spawn a subagent
 * with full tool access and route around the restriction (verified 2026-07-16). The
 * persona doc also says "never change code"; the allowlist is what makes that true.
 * CLI_DENY then closes the read side over secrets always, and over player data everywhere
 * except SUPER_READ_GUILD_IDS on the Tools-menu route — see resolveDenyRules().
 *
 * TWO ROUTES, TWO AUDIENCES:
 *   - Tools menu (`askcb_ask`)        → admins, whitelisted guilds/users only.
 *   - Posted button (`askcb_public_ask`) → ANYONE who can see the channel it was posted
 *     in. Deliberate: Reece posts these into limited areas and lets channel permissions
 *     be the gate. Both routes run on DEV/TEST and (since 2026-07-28, behind the
 *     CLAUDE_PROD_FEATURES=TRUE opt-in) on PROD; they share the concurrency cap.
 *
 * @module askCastBot
 */

import fs from 'fs';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { runClaudeJob, safeDeliver, formatElapsed, HARD_KILL_MS, buildModelSelectField, resolveModelChoice, modelLabel, canUseModel, DEFAULT_MODEL } from './claudeRunner.js';
import { hasFeatureSync, FEATURES, SEED_GUILD_IDS } from './entitlements.js';
import { logAskEvent } from './src/analytics/askLog.js';

/**
 * Guilds where any CastBot admin may use Ask CastBot.
 * @deprecated Runtime access now comes from the entitlements registry (🎟️ Entitlements
 * in Reece's Stuff → add/revoke by guild ID, no deploy needed). This array only SEEDS
 * that registry on first run. Kept exported for back-compat.
 */
export const ALLOWED_GUILD_IDS = SEED_GUILD_IDS;

/** Users who may use Ask CastBot in any guild (still admin-gated by the Tools menu). */
export const ALLOWED_USER_IDS = [
  '1398896688646590494',
  '909852958525636660',
  '691850627189309492'
];

/**
 * Guilds whose admins (via the Tools-menu route ONLY, never the posted public route) may
 * additionally have the CLI read playerData.json / safariContent.json — cross-guild, since
 * both files hold every guild's data in one JSON. Deliberately narrow: these are Reece's
 * own dev/test servers, used for cross-guild support debugging, not a general capability.
 */
export const SUPER_READ_GUILD_IDS = [
  '1524773737973682267',
  '1331657596087566398'
];

/** Hard allowlist of built-in tools handed to the CLI. Read-only by construction. */
const CLI_TOOLS = 'Read,Glob,Grep';

/**
 * Deny rules for the files a read-only agent still must never open, regardless of guild.
 * The answer is posted PUBLICLY in the asking channel, so a leak here goes straight to
 * every member of that server — the bot token would be a full takeover.
 *
 * These are enforced by the CLI's permission layer, not by the persona doc. Verified
 * 2026-07-16 with a control (agent reads a decoy secret) vs treatment (agent refused:
 * "denied by your permission settings"). `Read(...)` rules cover Glob and Grep too.
 */
const CLI_DENY = [
  'Read(./.env)',
  'Read(./.env.*)',
  'Read(./*.pem)',
  'Read(./.git/**)',
  'Read(./backups/**)',
  // Absolute/global variants (added with the prod rollout 2026-07-28): the './' rules
  // only match repo-relative paths, but Read accepts absolute paths too — and on prod a
  // leak of /opt/.../.env (bot token) or /home/bitnami (SSH keys, Claude creds, Bitnami
  // passwords) posts straight into a public channel. Same hardening protects blue.
  'Read(**/.env)',
  'Read(**/.env.*)',
  'Read(**/*.pem)',
  'Read(/home/bitnami/**)',
  'Read(/home/ubuntu/**)'
];

/** Additional deny rules for player data — lifted only for SUPER_READ_GUILD_IDS. */
const PLAYER_DATA_DENY = [
  'Read(./playerData.json)',
  'Read(./safariContent.json)'
];

/**
 * Resolve the deny list for a given request. Player data stays blocked everywhere except
 * the Tools-menu route in a SUPER_READ_GUILD_IDS guild — the posted public route is open
 * to anyone who can see the channel, so it never gets this regardless of guild.
 * @param {string} guildId
 * @param {boolean} isPublicRoute
 * @returns {string[]}
 */
export function resolveDenyRules(guildId, isPublicRoute) {
  const superRead = !isPublicRoute && SUPER_READ_GUILD_IDS.includes(guildId);
  return superRead ? CLI_DENY : [...CLI_DENY, ...PLAYER_DATA_DENY];
}

/**
 * Deny rules for Edit mode (askCastBotWrite.js). The data files hold EVERY guild's data
 * in one JSON, so lifting the player-data deny is a cross-guild read grant — it stays
 * restricted to SUPER_READ_GUILD_IDS exactly like the read route. Every other entitled
 * guild's model plans from the injected guild digest, which already carries that guild's
 * full state (items, stores, actions, map, players). The secrets denies are never
 * lifted, for anything, ever.
 * @param {string} guildId
 * @returns {string[]}
 */
export function resolveWriteDenyRules(guildId) {
  const superRead = SUPER_READ_GUILD_IDS.includes(guildId);
  return superRead ? [...CLI_DENY] : [...CLI_DENY, ...PLAYER_DATA_DENY];
}

const MAX_CHUNK = 3500;      // leave room for the action row in the last chunk
export const ACCENT = 0x3498db;

/**
 * Response Complexity — how much CastBot fluency to assume in the answer.
 *
 * Ordered as a ramp (novice → expert) rather than default-first: it's a spectrum, and a
 * scale reads better in a select than an arbitrary order. Balanced is the default.
 * `value` is what reaches the prompt; keep these stable — they're persisted with a
 * remembered response so a Follow Up re-defaults to the same level.
 */
export const COMPLEXITY_LEVELS = [
  {
    value: 'eli5',
    label: 'ELI5',
    description: "I got no idea what I'm doing here",
    emoji: { name: '🐣' }
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'I know enough about CastBot to be dangerous',
    emoji: { name: '⚖️' },
    default: true
  },
  {
    value: 'wizard',
    label: 'Wizard',
    description: "I'm a CastBot legend",
    emoji: { name: '🧙' }
  }
];

export const DEFAULT_COMPLEXITY = 'balanced';

/** Prompt guidance per complexity level. */
const COMPLEXITY_GUIDANCE = {
  wizard: `RESPONSE COMPLEXITY: **Wizard** — the asker is a CastBot expert. Treat them as a peer.
- Use CastBot's own vocabulary heavily and precisely: Actions, triggers, outcomes, conditions, blacklist/reverse blacklist, flag items, usage limits and claims, stamina, drops, crafting recipes.
- Be direct and information-dense. Get to the mechanism immediately.
- No analogies, no teaching fundamentals, no "as you may know" scaffolding, no encouragement padding.
- The valuable part is the subtlety: gotchas, ordering constraints, interactions between systems, the thing that silently doesn't work. Lead with that, not the happy path they already know.`,

  balanced: `RESPONSE COMPLEXITY: **Balanced** — the asker knows CastBot reasonably well but isn't an expert.
- Use CastBot's terminology, but gloss anything niche in a few words the first time it appears.
- Assume they can find their way around the menus without hand-holding.
- Name the buttons and settings that matter; don't narrate every click.`,

  eli5: `RESPONSE COMPLEXITY: **ELI5** — the asker is new and may be overwhelmed. Two rules that pull in opposite directions; honour both.
- BE MORE PRECISE ABOUT THE UI, NOT LESS. Exact button, menu and setting names matter *more* for a beginner, because they can't fill gaps themselves. Never wave at "the item settings" — say what to click.
- BE MUCH LIGHTER ON JARGON. Do not stack CastBot terms like "Outcomes", "Conditions", "Actions", "reverse blacklist" as if they explain themselves. Say what the thing *does* in plain words. When a term is genuinely unavoidable, introduce it once, in passing, with a short plain-English gloss — then use plain words again.
- Short sentences. One idea at a time. Assume no prior knowledge — but never talk down to them.`
};

/**
 * @param {string} [level] @returns {string} guidance block for the prompt
 * Uses hasOwn, not `[level] || default`: a bare lookup for '__proto__' returns
 * Object.prototype, which is truthy, and would splice "[object Object]" into the prompt.
 */
export function complexityGuidance(level) {
  return Object.hasOwn(COMPLEXITY_GUIDANCE, level ?? '')
    ? COMPLEXITY_GUIDANCE[level]
    : COMPLEXITY_GUIDANCE[DEFAULT_COMPLEXITY];
}

/**
 * Concurrent CLI jobs allowed. Each one is a full Claude Code process — real memory on a
 * small Lightsail box (prod already OOMs on its own; see RaP 0915). The posted Ask button
 * is clickable by anyone who can see the channel, so without a cap a handful of curious
 * players could knock the box over. Rejections are friendly and immediate.
 */
const MAX_CONCURRENT = 2;
let inFlight = 0;

/**
 * Is this instance allowed to run Ask CastBot at all?
 * DEV and TEST always; PROD only with the explicit CLAUDE_PROD_FEATURES=TRUE opt-in
 * (added 2026-07-28 after the 2GB migration — the old 512MB box genuinely couldn't
 * afford a CLI spawn; the new one can, and the CLI + auth are installed on it).
 * @returns {boolean}
 */
export function isAskCastBotEnvironment() {
  return process.env.PRODUCTION !== 'TRUE' || process.env.CLAUDE_PROD_FEATURES === 'TRUE';
}

/**
 * Access gate. Callers must ALSO be admins — the Tools menu enforces Manage Roles,
 * and the handlers re-declare it, so this only answers "which admins, where".
 * @param {{userId?: string, guildId?: string}} ctx
 * @returns {boolean}
 */
export function hasAskCastBotAccess({ userId, guildId } = {}) {
  if (!isAskCastBotEnvironment()) return false;
  if (userId && ALLOWED_USER_IDS.includes(userId)) return true;
  // Runtime-configurable: 🎟️ Entitlements (Reece's Stuff) grants/revokes guilds without
  // a deploy. SEED_GUILD_IDS only populates the registry the first time it's read.
  return hasFeatureSync(guildId, FEATURES.ASK_CASTBOT);
}

/**
 * Split a long response on newlines where possible, hard-cut where not.
 * @param {string} response
 * @returns {string[]} at least one chunk
 */
export function chunkResponse(response) {
  const chunks = [];
  let remaining = response;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', MAX_CHUNK);
    if (splitAt < MAX_CHUNK * 0.5) splitAt = MAX_CHUNK;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }
  return chunks;
}

/** Trim a string for display, appending an ellipsis when cut. */
export function truncate(text, max) {
  return `${text.substring(0, max)}${text.length > max ? '...' : ''}`;
}

/**
 * Defuse mass mentions before the bot echoes user- or model-authored text.
 *
 * The posted Ask button is clickable by anyone who can see the channel, and whatever they
 * type is republished by the BOT — which usually out-ranks them on permissions. Without
 * this, "@everyone" in a question turns the feature into an @everyone cannon for any
 * player who finds it. Answers get the same treatment: "repeat after me: @everyone" is a
 * one-line jailbreak of a persona-doc rule.
 *
 * A zero-width space after the "@" kills the ping while reading identically. Real user
 * mentions (<@id>) are left alone — those are bounded and usually intentional.
 * @param {string} text
 * @returns {string}
 */
export function neutralizeMentions(text) {
  return String(text ?? '')
    .replace(/@(everyone|here)/gi, '@​$1')
    .replace(/<@&(\d+)>/g, '<@​&$1>');
}

/**
 * Message 1: the question, on its own card, in full.
 *
 * Split out from the answer card because a truncated snippet hid the actual question from
 * everyone reading along — the point of a public answer is that the thread is legible.
 * @param {{askerName: string, query: string}} opts
 */
export function buildQuestionContainer({ askerName, query }) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `### 👾 *${neutralizeMentions(askerName)}* asked` },
      { type: 10, content: neutralizeMentions(query) }
    ]
  };
}

/**
 * Build the Ask CastBot modal.
 * @param {{query: string, response: string}} [prevContext] - prior Q&A for follow-ups
 * @param {string|null} [prevResponseId]
 * @returns {Object} modal data
 */
export function buildAskModal(prevContext = null, prevResponseId = null, isPublic = false) {
  // The route lives in the custom_id — modals have no hidden fields, and a visible
  // "Source" input would be both ugly and no more trustworthy. Forging `pub` grants
  // nothing anyway: it only selects the same gate a posted button already offers.
  const stem = isPublic ? 'askcb_pub_modal' : 'askcb_ask_modal';
  // A Follow Up re-defaults to the level the asker picked last time — re-choosing it on
  // every turn would be busywork. Falls back to Balanced for a fresh question.
  const chosen = prevContext?.complexity || DEFAULT_COMPLEXITY;
  const chosenModel = prevContext?.model || DEFAULT_MODEL;
  return {
    custom_id: prevResponseId ? `${stem}_${prevResponseId}` : stem,
    title: '👾 Ask CastBot',
    components: [
      buildModelSelectField('askcb_model', chosenModel),
      {
        type: 18,
        label: 'Response Complexity',
        description: 'How much CastBot jargon should the answer assume?',
        component: {
          type: 3,
          custom_id: 'askcb_complexity',
          required: false,
          options: COMPLEXITY_LEVELS.map(({ value, label, description, emoji }) => ({
            value, label, description, emoji, default: value === chosen
          }))
        }
      },
      ...(prevContext ? [{
        type: 18,
        label: 'Previous conversation (context)',
        component: {
          type: 4,
          custom_id: 'askcb_prev_context',
          style: 2,
          required: false,
          max_length: 1000,
          value: `Q: ${prevContext.query.substring(0, 200)}\nA: ${prevContext.response.substring(0, 700)}`,
          placeholder: 'Edit or clear this if not relevant'
        }
      }] : []),
      {
        type: 18,
        label: prevContext ? 'Follow-up question or new topic' : 'Your question',
        description: 'Ask about Safari, castlists, applications — anything CastBot',
        component: {
          type: 4,
          custom_id: 'askcb_query',
          style: 2,
          required: true,
          max_length: 2000,
          placeholder: prevContext
            ? 'e.g., "Can you explain that further?" or "How would I gate that room?"'
            : 'e.g., "How do I make a door that needs a key?" or "Can items have images?"'
        }
      }
    ]
  };
}

/**
 * Assemble the full prompt: persona + guardrails + optional prior turn + question.
 * @param {string} query
 * @param {string} [prevContextText]
 * @param {boolean} [superRead] - true when playerData.json/safariContent.json are readable
 * @param {string} [complexity] - one of COMPLEXITY_LEVELS' values
 * @param {boolean} [editAvailable] - true when this guild holds the safari_edit entitlement
 * @param {string} [editSection] - the armed edit-capability section (admin askers in
 *   entitled guilds — from askCastBotWrite.buildEditCapabilitySection). When present it
 *   REPLACES the "go click Edit Safari" steering: the model proposes the plan itself.
 * @param {string} [playerDigest] - THIS guild's player roster (admin askers only). The
 *   CLI never reads playerData.json — the parent extracts and injects, so a cross-guild
 *   leak is impossible by construction.
 * @returns {string}
 */
export function buildPrompt(query, prevContextText = '', superRead = false, complexity = DEFAULT_COMPLEXITY, editAvailable = false, editSection = '', playerDigest = '') {
  const essence = fs.readFileSync('./docs/askcastbot.md', 'utf8');
  // Inlined rather than "go Read it": the model demonstrably skips the file read and
  // invents menu paths (2026-07-29: answered "Safari menu → Manage Items", a screen
  // removed in 2025). ~2.5KB of prompt buys unconditional grounding.
  let uiPaths = '';
  try {
    uiPaths = fs.readFileSync('./docs/askcastbot-kb/ui-paths.md', 'utf8');
  } catch { /* KB missing — the prompt rule below degrades to "say you are unsure" */ }
  const prevSection = prevContextText?.trim()
    ? `\n\nPREVIOUS CONVERSATION (context from the last exchange — use it to inform your answer):\n${prevContextText}\n\n---\n`
    : '';
  // Overrides the persona doc's "no player data belonging to anyone" (line 33) and "never
  // touch other people's games / no speculating about inventory" (line 41) rules — this
  // asker is trusted (whitelisted guild admin, Tools-menu route) and the read is scoped
  // to answering their question, not dumping records. Named explicitly and placed up front
  // because a quiet one-line override lost to those two repeated, specific restrictions in
  // practice (see incident 2026-07-16: bot refused to check a whitelisted guild's
  // inventory, citing "between the host and their players").
  const superReadSection = superRead
    ? `\n\nSPECIAL OVERRIDE FOR THIS REQUEST — read carefully, it supersedes lines in the persona essence above:\nThe persona essence tells you to never reveal "player data belonging to anyone" and to never speculate about "what a specific player has in their inventory." For THIS request only, both of those rules are lifted. The asker is a trusted, whitelisted admin using this for cross-guild support debugging, and you have read access to playerData.json and safariContent.json (every guild's data lives in these two files, keyed by guild ID). Use them: look up the actual player, inventory, currency, or game state the question asks about — for ANY guild, including this one — and answer with what you find. Do not fall back on "I can't look that up" or "that's between the host and their players"; you can, and that is the point of this override. Still never print raw file contents, tokens, or secrets verbatim — summarize what's relevant to the question.\n\n---\n`
    : '';

  return `You are Ask CastBot 👾 — the in-Discord CastBot expert. Here is your persona essence:

${essence}

OPERATING CONTEXT:
- You are answering a host or admin inside a Discord message. Keep it concise; Discord has hard character limits and your reply is chunked at ${MAX_CHUNK} characters. Use light markdown.
- Your answer is posted PUBLICLY in the channel where the question was asked. Other people will read it. Write for that audience.
- You have exactly three tools: Read, Glob, Grep. They are read-only. You cannot edit files, run commands, or deploy. Never offer to.
- Ground yourself in the project's documentation before answering anything you are not certain of. Prefer the Safari feature docs and the Safari design guide. Read them silently.
- When giving click-by-click navigation, use ONLY menu paths from the UI NAVIGATION REFERENCE below. If the screen you need isn't listed there, describe the goal and say you're not sure of the exact menu location — NEVER invent menu, screen, or tab names. Internal docs describe code, not what admins actually see.${editAvailable && !editSection ? `
- THIS SERVER HAS EDIT SAFARI 🛠️: when the asker is REQUESTING a change (create/rename/delete an item, store, action, setting, etc.) rather than asking how something works, lead with this: an admin can click 🛠️ Edit Safari (in /menu → Tools, or on a posted Edit Safari card), describe the change in plain English, review the preview, and hit Apply — CastBot makes the change itself. Offer the manual menu route only as the alternative afterwards. You still cannot make the change from THIS conversation; Edit Safari is its own button.` : ''}
- NEVER reveal internals in your answer: no file paths, no line numbers, no function/handler/custom_id names, no schema or JSON key names, no environment variables, no tokens${superRead || playerDigest ? '' : ', no other players\' or servers\' data'}. Answer in terms of menus, buttons, and game behaviour only.
- NEVER invent a mechanic CastBot does not have. If the request does not map onto a real building block, say so in your first sentence and propose the closest real substitute.${superReadSection}
- You are a one-shot assistant with no memory between questions${prevSection ? ', BUT you have the previous exchange below' : ''}.${prevSection}
${uiPaths ? `
UI NAVIGATION REFERENCE (the ONLY source for click-by-click paths):
${uiPaths}
` : ''}${playerDigest ? `
THIS SERVER'S PLAYERS — read carefully, this SUPERSEDES the persona essence:
The essence tells you never to reveal "player data belonging to anyone" and never to speculate about "what a specific player has in their inventory". For THIS request both rules are lifted, for THIS SERVER ONLY. The asker is an admin of this server asking about their own game, and the roster below is the authoritative, complete answer — you are not guessing. Answer questions like "who has the most items", "how much does X have", "where is everyone" directly and by name, using this data. Do NOT refuse, do NOT tell them to click through Player Admin, and do NOT claim you can't look it up — you can, and that is the point.
Still refuse anything about OTHER servers, and anything outside this roster (application answers, casting scores or notes, private messages) — you genuinely don't have those.
Your answer is PUBLIC in the channel, so lead with what was asked rather than dumping the whole roster.

${playerDigest}
` : ''}${editSection}
${complexityGuidance(complexity)}

The question:
${query}`;
}

/**
 * Run an Ask CastBot query with the read-only toolset and live progress.
 * @param {string} prompt
 * @param {string[]} deny - resolved via resolveDenyRules()
 * @param {Function} [onHeartbeat] - ({elapsedMs, activity, toolCount}) => void
 * @param {string} [model] - CLI --model value; omit for CLI default
 * @returns {Promise<{text: string, durationMs: number, denials: Array}>}
 */
export function runAskCastBot(prompt, deny, onHeartbeat, model) {
  return runClaudeJob({ prompt, tools: CLI_TOOLS, deny, onHeartbeat, model });
}

/**
 * The action row appended to the final chunk. Carries the route forward: an answer that
 * came from a posted button must offer a follow-up the same audience can actually use,
 * or a non-whitelisted asker gets denied on their own follow-up.
 */
export function buildActionRow(responseId, isPublic = false) {
  const stem = isPublic ? 'askcb_pub_ctx' : 'askcb_ask_ctx';
  // "New Question" needs no new handler: askcb_ask / askcb_public_ask already open a
  // blank modal when there's no context id to recall. Same gate, same route, zero plumbing.
  const blankStem = isPublic ? 'askcb_public_ask' : 'askcb_ask';
  return {
    type: 1,
    components: [
      { type: 2, custom_id: `${stem}_${responseId}`, label: 'Follow Up', style: 1, emoji: { name: '👾' } },
      { type: 2, custom_id: blankStem, label: 'New Question', style: 1, emoji: { name: '💭' } }
    ]
  };
}

/** Container for the first (deferred) chunk. */
export function buildFirstContainer({ query, chunk, elapsed, chunkCount, responseId, isPublic = false, model }) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `## 👾 Ask CastBot` },
      { type: 10, content: `-# "${neutralizeMentions(truncate(query, 120))}"` },
      { type: 14 },
      { type: 10, content: neutralizeMentions(chunk) },
      { type: 14 },
      { type: 10, content: `-# 👾 ${elapsed}${chunkCount > 1 ? ` · ${chunkCount} parts` : ''} · ${modelLabel(model)}` },
      ...(chunkCount === 1 ? [buildActionRow(responseId, isPublic)] : [])
    ]
  };
}

/** Container for a follow-up chunk. */
export function buildChunkContainer({ chunk, isLast, responseId, isPublic = false }) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: neutralizeMentions(chunk) },
      ...(isLast ? [
        { type: 14 },
        { type: 10, content: `-# continued` },
        buildActionRow(responseId, isPublic)
      ] : [])
    ]
  };
}

/**
 * Container shown while the CLI works. Refreshed on every heartbeat so the user sees
 * what's actually happening (which file it's reading) rather than a silent spinner.
 * @param {string} query
 * @param {{elapsedMs: number, activity: string, toolCount: number}} [progress]
 */
export function buildProgressContainer(query, progress = null) {
  const lines = [{ type: 10, content: `## 👾 Ask CastBot is thinking...` }];
  if (progress) {
    const budget = formatElapsed(HARD_KILL_MS);
    lines.push(
      { type: 10, content: `${progress.activity}` },
      { type: 14 },
      { type: 10, content: `-# ⏳ ${formatElapsed(progress.elapsedMs)} elapsed of ${budget} · ${progress.toolCount} doc${progress.toolCount === 1 ? '' : 's'} checked` }
    );
  } else {
    lines.push({ type: 10, content: `🚀 Starting up` }, { type: 14 });
  }
  lines.push({ type: 10, content: `-# "${neutralizeMentions(truncate(query, 80))}"` });
  return { type: 17, accent_color: ACCENT, components: lines };
}

/**
 * Shown when someone picks a model they're not cleared for. Public, like every other
 * read-mode reply — the question card is already in the channel, so a silent or
 * ephemeral refusal would leave it hanging unanswered.
 */
export function buildModelUnavailableContainer(model, isPublic = false) {
  return {
    type: 17,
    accent_color: 0xe74c3c,
    components: [
      { type: 10, content: `## ⛔ ${modelLabel(model)} is unavailable` },
      { type: 10, content: `${modelLabel(model)} isn't available for general usage at this time — so this question wasn't answered.\n\nPick **Sonnet**, **Haiku** or **Opus** and ask again. If you're interested in the details, contact Reece.` },
      { type: 1, components: [
        { type: 2, custom_id: isPublic ? 'askcb_public_ask' : 'askcb_ask', label: 'Ask Again', style: 1, emoji: { name: '👾' } }
      ]}
    ]
  };
}

/** Container shown when the CLI fails or times out. */
export function buildErrorContainer(message, isPublic = false) {
  return {
    type: 17,
    accent_color: 0xe74c3c,
    components: [
      { type: 10, content: `## 👾 Ask CastBot couldn't answer\n\n${(message || 'Unknown error').substring(0, 400)}` },
      { type: 14 },
      { type: 10, content: `-# Nothing was changed. Try rephrasing, or ask again in a moment.` },
      { type: 1, components: [
        { type: 2, custom_id: isPublic ? 'askcb_public_ask' : 'askcb_ask', label: 'Try Again', style: 1, emoji: { name: '👾' } }
      ]}
    ]
  };
}

/**
 * The standing container posted by "Post Ask" — a permanent Ask button anyone in the
 * channel can press. Channel permissions are the access control here, by design.
 * @param {string} [note] - optional custom blurb
 */
export function buildPostedAskContainer(note) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `## 👾 Ask CastBot` },
      { type: 10, content: note || `Got a question about how CastBot works — Safari maps, items, actions, castlists, applications? Ask away.\n\nAnswers post publicly here so everyone can learn from them.` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'askcb_public_ask', label: 'Ask CastBot', style: 1, emoji: { name: '👾' } }
      ]}
    ]
  };
}

/** In-memory response cache for the Ask Another button (last 10, mirrors the Moai). */
export function rememberResponse(responseId, payload) {
  if (!global.askCastBotResponses) global.askCastBotResponses = new Map();
  global.askCastBotResponses.set(responseId, payload);
  if (global.askCastBotResponses.size > 10) {
    const oldest = global.askCastBotResponses.keys().next().value;
    global.askCastBotResponses.delete(oldest);
  }
}

/** @returns {{query: string, response: string, elapsed: string}|null} */
export function recallResponse(responseId) {
  return (responseId && global.askCastBotResponses?.get(responseId)) || null;
}

/** Reject a modal submit with an ephemeral note. */
function denyModal(res, message) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content: message, flags: InteractionResponseFlags.EPHEMERAL }
  });
}

/**
 * Handle the Ask CastBot modal submit end-to-end: gate, post the question card, run the
 * CLI with live progress, then turn the progress message into the (possibly chunked)
 * answer — all public, in the channel it was asked from.
 * Lives here rather than app.js so the router stays a router.
 * @param {Object} req - Express request (Discord interaction)
 * @param {Object} res - Express response
 */
export async function handleAskModalSubmit(req, res, client = null) {
  const fields = {};
  for (const comp of (req.body.data.components || [])) {
    const inner = comp?.component || comp?.components?.[0];
    // Text inputs carry `value`; String Selects carry `values: [...]`.
    if (inner?.custom_id) fields[inner.custom_id] = inner.value ?? inner.values?.[0];
  }
  const query = fields.askcb_query;
  const complexity = fields.askcb_complexity || DEFAULT_COMPLEXITY;
  const model = resolveModelChoice(fields.askcb_model);
  const userId = req.body.member?.user?.id || req.body.user?.id;
  // A modal opened from a POSTED Ask button is deliberately open to anyone who can see
  // that channel (Reece places them in limited areas). The whitelist only guards the
  // Tools-menu route. The env gate applies to both — see isAskCastBotEnvironment.
  const modalId = String(req.body.data.custom_id || '');
  const isPublicRoute = modalId.startsWith('askcb_pub_modal');
  // A Follow Up carries the parent answer's id in the modal custom_id — the conversation
  // tree is already in the payload and was being thrown away. Recovering it here is what
  // lets multi-turn exchanges be reconstructed offline.
  const parentRid = /^askcb_(?:ask|pub)_modal_(.+)$/.exec(modalId)?.[1] || null;

  // Built from req.body BEFORE anything can throw and before res.send fires — every
  // event in this handler carries it, so a failure can never be an orphan row.
  const ctx = {
    eid: req.body.id,
    cid: recallResponse(parentRid)?.cid || req.body.id,
    gid: req.body.guild_id,
    uid: userId,
    chan: req.body.channel_id,
    route: isPublicRoute ? 'ask_public' : 'ask',
    model,
    complexity,
    parent_rid: parentRid
  };
  const deny = (reason, message) => {
    logAskEvent('ask.denied', { ...ctx, reason, in_flight: inFlight });
    return denyModal(res, message);
  };

  if (!isAskCastBotEnvironment()) {
    return deny('env', '👾 Ask CastBot is not available here.');
  }
  if (!isPublicRoute && !hasAskCastBotAccess({ userId, guildId: req.body.guild_id })) {
    return deny('access', '👾 Ask CastBot is not available here.');
  }
  if (!query?.trim()) {
    return deny('empty_query', '👾 Ask CastBot needs a question.');
  }
  if (inFlight >= MAX_CONCURRENT) {
    return deny('busy', `👾 Ask CastBot is busy with ${inFlight} question${inFlight === 1 ? '' : 's'} right now. Give it a minute and ask again.`);
  }

  // TWO MESSAGES, NOT ONE:
  //   1. the question, in full, as the immediate response — so everyone reading the
  //      channel can see what was actually asked (a truncated snippet hid it);
  //   2. a follow-up that carries live progress and then becomes the answer.
  // The question card is the INITIAL response rather than a channel post because Discord
  // renders the interaction's own message first — a channel post would land underneath
  // the answer and read backwards.
  const askerName = req.body.member?.nick
    || req.body.member?.user?.global_name
    || req.body.member?.user?.username
    || 'Someone';
  res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { components: [buildQuestionContainer({ askerName, query })], flags: (1 << 15) }
  });

  const token = req.body.token;
  const channelId = req.body.channel_id;
  const { createFollowupMessage } = await import('./buttonHandlerFactory.js');

  // Restricted model: the question card above still posts (the ask is legitimate and the
  // channel should see it), but we don't spend a run — the asker gets a plain refusal.
  if (!canUseModel(model, userId)) {
    logAskEvent('ask.denied', { ...ctx, reason: 'restricted_model' });
    await createFollowupMessage(token, { components: [buildModelUnavailableContainer(model, isPublicRoute)] });
    return;
  }

  inFlight++;
  let progressMsgId = null;
  // Heartbeats never fall back to a channel post — that would spam a new progress message
  // every 20s. Only the final answer is worth a fallback message.
  const beat = (data) => safeDeliver({ token, channelId, data, messageId: progressMsgId, userId, fallback: false });
  const deliver = (data) => safeDeliver({ token, channelId, data, messageId: progressMsgId, userId });

  // Hoisted so the finally block can tell a logged outcome from a silent escape.
  let terminalLogged = false;
  let answerText = null;

  try {
    console.log(`👾 Ask CastBot query from ${req.body.member?.user?.username} (${inFlight}/${MAX_CONCURRENT} in flight, ${complexity}, ${model}): "${truncate(query, 80)}"`);
    logAskEvent('ask.request', {
      ...ctx, query,
      prev_ctx_len: (fields.askcb_prev_context || '').length,
      locale: req.body.locale
    });

    // Message 2 starts as "starting up" so there's never a silent gap.
    const progressMsg = await createFollowupMessage(token, { components: [buildProgressContainer(query)] });
    progressMsgId = progressMsg?.id || null;

    const guildId = req.body.guild_id;
    const superRead = !isPublicRoute && SUPER_READ_GUILD_IDS.includes(guildId);
    // Dynamic imports: entitlements.js and askCastBotWrite.js statically import this
    // module, so static imports here would be cycles. Best-effort — an edit-side
    // hiccup must not take down read-mode answers.
    const editAvailable = await import('./entitlements.js')
      .then(({ hasFeature, FEATURES }) => hasFeature(guildId, FEATURES.SAFARI_EDIT))
      .catch(() => false);
    // Admin asker in an entitled guild → the 👾 button itself carries edit capability:
    // the model emits a plan, the asker gets a private preview + Apply (the original
    // requirement — Ask CastBot MAKES the change, it doesn't point at another button).
    const writeMod = editAvailable ? await import('./askCastBotWrite.js').catch(() => null) : null;
    const canEdit = !!(writeMod?.isAdminMember(req.body.member));
    const editSection = canEdit
      ? await writeMod.buildEditCapabilitySection(guildId, client).catch(() => '')
      : '';
    // Admin askers get this server's player roster injected (never file access — the
    // data files are multi-tenant). Skipped when editSection already carries the digest.
    const playerDigest = (canEdit && !editSection)
      ? await writeMod.buildPlayerDigestSection(guildId, client).catch(() => '')
      : '';

    const { text: answer, durationMs, denials, numTurns, costUsd, usage, sessionId,
            apiDurationMs, toolTrace, modelUsed, fellBack } = await runAskCastBot(
      buildPrompt(query, fields.askcb_prev_context, superRead, complexity, editAvailable, editSection, playerDigest),
      editSection ? resolveWriteDenyRules(guildId) : resolveDenyRules(guildId, isPublicRoute),
      (progress) => beat({ components: [buildProgressContainer(query, progress)] }),
      model
    );

    const elapsed = formatElapsed(durationMs);
    console.log(`👾 Ask CastBot answered (${answer.length} chars, ${elapsed})`);
    if (denials?.length) console.warn(`👾 Ask CastBot deny rules fired ${denials.length}x — someone probed a blocked path`);

    // Strip any inline plan out of the public answer; the asker gets the ephemeral
    // preview with Apply/Cancel as follow-ups (requester-bound, one-shot, re-gated).
    let publicAnswer = answer;
    if (editSection) {
      const result = await writeMod.processInlinePlan({
        answer, guildId, userId, channelId, isPublicRoute, model, token, query, elapsed,
        logCtx: { eid: ctx.eid, cid: ctx.cid, route: ctx.route, query }
      });
      publicAnswer = result.publicAnswer;
    }

    const responseId = Date.now().toString(36);
    // cid rides along so a Follow Up inherits the conversation id (see ctx above).
    rememberResponse(responseId, { response: publicAnswer, query, elapsed, complexity, model, cid: ctx.cid });

    answerText = publicAnswer;
    const chunks = chunkResponse(publicAnswer);
    // safeDeliver's 'token'|'channel'|'failed' was discarded at every call site — it's
    // the difference between "the answer was bad" and "the user never saw it".
    const deliveryOutcome = await deliver({
      components: [buildFirstContainer({ query, chunk: chunks[0], elapsed, chunkCount: chunks.length, responseId, isPublic: isPublicRoute, model })]
    });
    for (let i = 1; i < chunks.length; i++) {
      await createFollowupMessage(token, {
        components: [buildChunkContainer({ chunk: chunks[i], isLast: i === chunks.length - 1, responseId, isPublic: isPublicRoute })]
      });
    }

    logAskEvent('ask.answer', {
      ...ctx, rid: responseId, response: publicAnswer,
      duration_ms: durationMs, api_duration_ms: apiDurationMs,
      usage, session_id: sessionId, num_turns: numTurns, cost_usd: costUsd,
      model_used: modelUsed, fell_back: fellBack,
      denials_n: denials?.length || 0, tool_trace: toolTrace,
      chunks: chunks.length, delivery: deliveryOutcome,
      had_plan: publicAnswer !== answer,
      edit_armed: !!editSection, super_read: superRead
    });
    terminalLogged = true;
  } catch (error) {
    console.error('👾 Ask CastBot error:', error.message);
    logAskEvent('ask.error', { ...ctx, phase: answerText ? 'deliver' : 'run', message: error.message });
    terminalLogged = true;
    await deliver({ components: [buildErrorContainer(error.message, isPublicRoute)] });
  } finally {
    // A request row with no terminal row would silently corrupt every rate metric.
    if (!terminalLogged) logAskEvent('ask.error', { ...ctx, phase: 'unknown', message: 'no terminal event' });
    inFlight--;
  }
}
