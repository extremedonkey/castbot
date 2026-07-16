/**
 * 🔵 Ask CastBot — trusted super-user Q&A via Claude CLI (MVP)
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
 * CLI_DENY then closes the read side over secrets and player data — see its comment.
 *
 * TWO ROUTES, TWO AUDIENCES:
 *   - Tools menu (`askcb_ask`)        → admins, whitelisted guilds/users only.
 *   - Posted button (`askcb_public_ask`) → ANYONE who can see the channel it was posted
 *     in. Deliberate: Reece posts these into limited areas and lets channel permissions
 *     be the gate. Both routes are DEV/TEST-only and share the concurrency cap.
 *
 * @module askCastBot
 */

import fs from 'fs';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { runClaudeJob, safeDeliver, formatElapsed, HARD_KILL_MS } from './claudeRunner.js';

/** Guilds where any CastBot admin may use Ask CastBot. */
export const ALLOWED_GUILD_IDS = [
  '1331657596087566398',
  '1527107915637588059',
  '1385679393237635122',
  '1524773737973682267',
  '1512093418602364998',
  '974318870057848842',
  '1308581797915005029'
];

/** Users who may use Ask CastBot in any guild (still admin-gated by the Tools menu). */
export const ALLOWED_USER_IDS = [
  '1398896688646590494',
  '909852958525636660',
  '691850627189309492'
];

/** Hard allowlist of built-in tools handed to the CLI. Read-only by construction. */
const CLI_TOOLS = 'Read,Glob,Grep';

/**
 * Deny rules for the files a read-only agent still must never open. The answer is posted
 * PUBLICLY in the asking channel, so a leak here goes straight to every member of that
 * server — the bot token would be a full takeover, and playerData/safariData are other
 * people's data across every guild, which is not ours to risk.
 *
 * These are enforced by the CLI's permission layer, not by the persona doc. Verified
 * 2026-07-16 with a control (agent reads a decoy secret) vs treatment (agent refused:
 * "denied by your permission settings"). `Read(...)` rules cover Glob and Grep too.
 */
const CLI_DENY = [
  'Read(./.env)',
  'Read(./.env.*)',
  'Read(./*.pem)',
  'Read(./playerData.json)',
  'Read(./safariContent.json)',
  'Read(./.git/**)',
  'Read(./backups/**)'
];

const MAX_CHUNK = 3500;      // leave room for the action row in the last chunk
export const ACCENT = 0x3498db;

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
 * DEV and TEST only — prod has no Claude CLI and no business spawning one.
 * @returns {boolean}
 */
export function isAskCastBotEnvironment() {
  return process.env.PRODUCTION !== 'TRUE';
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
  return !!guildId && ALLOWED_GUILD_IDS.includes(guildId);
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
  return {
    custom_id: prevResponseId ? `${stem}_${prevResponseId}` : stem,
    title: '🔵 Ask CastBot',
    components: [
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
 * @returns {string}
 */
export function buildPrompt(query, prevContextText = '') {
  const essence = fs.readFileSync('./docs/askcastbot.md', 'utf8');
  const prevSection = prevContextText?.trim()
    ? `\n\nPREVIOUS CONVERSATION (context from the last exchange — use it to inform your answer):\n${prevContextText}\n\n---\n`
    : '';

  return `You are Ask CastBot 🔵 — the in-Discord CastBot expert. Here is your persona essence:

${essence}

OPERATING CONTEXT:
- You are answering a host or admin inside a Discord message. Keep it concise; Discord has hard character limits and your reply is chunked at ${MAX_CHUNK} characters. Use light markdown.
- Your answer is posted PUBLICLY in the channel where the question was asked. Other people will read it. Write for that audience.
- You have exactly three tools: Read, Glob, Grep. They are read-only. You cannot edit files, run commands, or deploy. Never offer to.
- Ground yourself in the project's documentation before answering anything you are not certain of. Prefer the Safari feature docs and the Safari design guide. Read them silently.
- NEVER reveal internals in your answer: no file paths, no line numbers, no function/handler/custom_id names, no schema or JSON key names, no environment variables, no tokens, no other players' or servers' data. Answer in terms of menus, buttons, and game behaviour only.
- NEVER invent a mechanic CastBot does not have. If the request does not map onto a real building block, say so in your first sentence and propose the closest real substitute.
- You are a one-shot assistant with no memory between questions${prevSection ? ', BUT you have the previous exchange below' : ''}.${prevSection}

The question:
${query}`;
}

/**
 * Run an Ask CastBot query with the read-only toolset and live progress.
 * @param {string} prompt
 * @param {Function} [onHeartbeat] - ({elapsedMs, activity, toolCount}) => void
 * @returns {Promise<{text: string, durationMs: number, denials: Array}>}
 */
export function runAskCastBot(prompt, onHeartbeat) {
  return runClaudeJob({ prompt, tools: CLI_TOOLS, deny: CLI_DENY, onHeartbeat });
}

/**
 * The action row appended to the final chunk. Carries the route forward: an answer that
 * came from a posted button must offer a follow-up the same audience can actually use,
 * or a non-whitelisted asker gets denied on their own follow-up.
 */
export function buildActionRow(responseId, isPublic = false) {
  const stem = isPublic ? 'askcb_pub_ctx' : 'askcb_ask_ctx';
  return {
    type: 1,
    components: [
      { type: 2, custom_id: `${stem}_${responseId}`, label: 'Ask Another', style: 1, emoji: { name: '🔵' } }
    ]
  };
}

/** Container for the first (deferred) chunk. */
export function buildFirstContainer({ query, chunk, elapsed, chunkCount, responseId, isPublic = false }) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `## 🔵 Ask CastBot` },
      { type: 10, content: `-# "${truncate(query, 120)}"` },
      { type: 14 },
      { type: 10, content: chunk },
      { type: 14 },
      { type: 10, content: `-# 🔵 ${elapsed}s${chunkCount > 1 ? ` · ${chunkCount} parts` : ''}` },
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
      { type: 10, content: chunk },
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
  const lines = [{ type: 10, content: `## 🔵 Ask CastBot is thinking...` }];
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
  lines.push({ type: 10, content: `-# "${truncate(query, 80)}"` });
  return { type: 17, accent_color: ACCENT, components: lines };
}

/** Container shown when the CLI fails or times out. */
export function buildErrorContainer(message, isPublic = false) {
  return {
    type: 17,
    accent_color: 0xe74c3c,
    components: [
      { type: 10, content: `## 🔵 Ask CastBot couldn't answer\n\n${(message || 'Unknown error').substring(0, 400)}` },
      { type: 14 },
      { type: 10, content: `-# Nothing was changed. Try rephrasing, or ask again in a moment.` },
      { type: 1, components: [
        { type: 2, custom_id: isPublic ? 'askcb_public_ask' : 'askcb_ask', label: 'Try Again', style: 1, emoji: { name: '🔵' } }
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
      { type: 10, content: `## 🔵 Ask CastBot` },
      { type: 10, content: note || `Got a question about how CastBot works — Safari maps, items, actions, castlists, applications? Ask away.\n\nAnswers post publicly here so everyone can learn from them.` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'askcb_public_ask', label: 'Ask CastBot', style: 1, emoji: { name: '🔵' } }
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
 * Handle the Ask CastBot modal submit end-to-end: gate, defer publicly, run the CLI,
 * post the (possibly chunked) answer back into the channel it was asked in.
 * Lives here rather than app.js so the router stays a router.
 * @param {Object} req - Express request (Discord interaction)
 * @param {Object} res - Express response
 */
export async function handleAskModalSubmit(req, res) {
  const fields = {};
  for (const comp of (req.body.data.components || [])) {
    const inner = comp?.component || comp?.components?.[0];
    if (inner?.custom_id) fields[inner.custom_id] = inner.value;
  }
  const query = fields.askcb_query;
  const userId = req.body.member?.user?.id || req.body.user?.id;
  // A modal opened from a POSTED Ask button is deliberately open to anyone who can see
  // that channel (Reece places them in limited areas). The whitelist only guards the
  // Tools-menu route. The env gate applies to both — see isAskCastBotEnvironment.
  const isPublicRoute = String(req.body.data.custom_id || '').startsWith('askcb_pub_modal');

  if (!isAskCastBotEnvironment()) {
    return denyModal(res, '🔵 Ask CastBot is not available here.');
  }
  if (!isPublicRoute && !hasAskCastBotAccess({ userId, guildId: req.body.guild_id })) {
    return denyModal(res, '🔵 Ask CastBot is not available here.');
  }
  if (!query?.trim()) {
    return denyModal(res, '🔵 Ask CastBot needs a question.');
  }
  if (inFlight >= MAX_CONCURRENT) {
    return denyModal(res, `🔵 Ask CastBot is busy with ${inFlight} question${inFlight === 1 ? '' : 's'} right now. Give it a minute and ask again.`);
  }

  // Deferred PUBLIC — the answer lands in the channel it was asked in.
  res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: {} });

  const token = req.body.token;
  const channelId = req.body.channel_id;
  const { createFollowupMessage } = await import('./buttonHandlerFactory.js');
  const deliver = (data) => safeDeliver({ token, channelId, data, userId });

  inFlight++;
  try {
    console.log(`🔵 Ask CastBot query from ${req.body.member?.user?.username} (${inFlight}/${MAX_CONCURRENT} in flight): "${truncate(query, 80)}"`);

    // Paint the "starting up" state immediately — the deferred spinner is otherwise blank
    // until the first heartbeat, which is the exact silence this redesign removes.
    await deliver({ components: [buildProgressContainer(query)] });

    const { text: answer, durationMs, denials } = await runAskCastBot(
      buildPrompt(query, fields.askcb_prev_context),
      (progress) => deliver({ components: [buildProgressContainer(query, progress)] })
    );

    const elapsed = formatElapsed(durationMs);
    console.log(`🔵 Ask CastBot answered (${answer.length} chars, ${elapsed})`);
    if (denials?.length) console.warn(`🔵 Ask CastBot deny rules fired ${denials.length}x — someone probed a blocked path`);

    const responseId = Date.now().toString(36);
    rememberResponse(responseId, { response: answer, query, elapsed });

    const chunks = chunkResponse(answer);
    await deliver({
      components: [buildFirstContainer({ query, chunk: chunks[0], elapsed, chunkCount: chunks.length, responseId, isPublic: isPublicRoute })]
    });
    for (let i = 1; i < chunks.length; i++) {
      await createFollowupMessage(token, {
        components: [buildChunkContainer({ chunk: chunks[i], isLast: i === chunks.length - 1, responseId, isPublic: isPublicRoute })]
      });
    }
  } catch (error) {
    console.error('🔵 Ask CastBot error:', error.message);
    await deliver({ components: [buildErrorContainer(error.message, isPublicRoute)] });
  } finally {
    inFlight--;
  }
}
