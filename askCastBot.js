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
 *
 * KNOWN AND ACCEPTED RISK: Read still reaches .env and playerData.json. Reece accepted
 * this explicitly for a trusted-user MVP. Do NOT widen access without revisiting it.
 *
 * @module askCastBot
 */

import { spawn } from 'child_process';
import fs from 'fs';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';

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

const PROGRESS_MS = 120000;  // "still thinking" nudge
const TIMEOUT_MS = 240000;   // hard kill
const MAX_CHUNK = 3500;      // leave room for the action row in the last chunk
export const ACCENT = 0x3498db;

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
export function buildAskModal(prevContext = null, prevResponseId = null) {
  return {
    custom_id: prevResponseId ? `askcb_ask_modal_${prevResponseId}` : 'askcb_ask_modal',
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
 * Run the Claude CLI with a hard read-only toolset.
 * @param {string} prompt
 * @param {Function} [onProgress] - called once at the 2-minute mark
 * @returns {Promise<string>} trimmed stdout
 */
export function runAskCastBot(prompt, onProgress) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['--print', '--tools', CLI_TOOLS, '--disallowed-tools', ...CLI_DENY, '-p', prompt], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: process.env.HOME || '/home/reece' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    const progressTimer = setTimeout(() => {
      Promise.resolve(onProgress?.()).catch(e =>
        console.error('🔵 Ask CastBot progress update failed:', e.message));
    }, PROGRESS_MS);

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Claude CLI timed out after 4 minutes'));
    }, TIMEOUT_MS);

    const done = () => { clearTimeout(timeout); clearTimeout(progressTimer); };

    child.on('close', code => {
      done();
      if (code !== 0) reject(new Error(stderr || `Exit code ${code}`));
      else resolve(stdout.trim());
    });
    child.on('error', err => { done(); reject(err); });
  });
}

/** The action row appended to the final chunk. */
export function buildActionRow(responseId) {
  return {
    type: 1,
    components: [
      { type: 2, custom_id: `askcb_ask_ctx_${responseId}`, label: 'Ask Another', style: 1, emoji: { name: '🔵' } }
    ]
  };
}

/** Container for the first (deferred) chunk. */
export function buildFirstContainer({ query, chunk, elapsed, chunkCount, responseId }) {
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
      ...(chunkCount === 1 ? [buildActionRow(responseId)] : [])
    ]
  };
}

/** Container for a follow-up chunk. */
export function buildChunkContainer({ chunk, isLast, responseId }) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: chunk },
      ...(isLast ? [
        { type: 14 },
        { type: 10, content: `-# continued` },
        buildActionRow(responseId)
      ] : [])
    ]
  };
}

/** Container shown while the CLI is still working. */
export function buildProgressContainer(query) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `## 🔵 Ask CastBot is Thinking...\n\nStill reading the docs. Hang tight.` },
      { type: 14 },
      { type: 10, content: `-# ⏳ 2 minutes elapsed — "${truncate(query, 80)}"` }
    ]
  };
}

/** Container shown when the CLI fails or times out. */
export function buildErrorContainer(message, elapsed) {
  return {
    type: 17,
    accent_color: 0xe74c3c,
    components: [
      { type: 10, content: `## 🔵 Ask CastBot Couldn't Answer\n\n\`\`\`${(message || 'Unknown error').substring(0, 300)}\`\`\`` },
      { type: 14 },
      { type: 10, content: `-# Claude CLI may be unavailable or timed out. (${elapsed}s)` },
      { type: 1, components: [
        { type: 2, custom_id: 'askcb_ask', label: 'Try Again', style: 1, emoji: { name: '🔵' } }
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

  if (!hasAskCastBotAccess({ userId, guildId: req.body.guild_id })) {
    return denyModal(res, '🔵 Ask CastBot is not available here.');
  }
  if (!query?.trim()) {
    return denyModal(res, '🔵 Ask CastBot needs a question.');
  }

  // Deferred PUBLIC — the answer lands in the channel it was asked in.
  res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: {} });

  const startTime = Date.now();
  const { updateDeferredResponse, createFollowupMessage } = await import('./buttonHandlerFactory.js');
  const token = req.body.token;

  try {
    console.log(`🔵 Ask CastBot query from ${req.body.member?.user?.username}: "${truncate(query, 80)}"`);

    const answer = await runAskCastBot(
      buildPrompt(query, fields.askcb_prev_context),
      () => updateDeferredResponse(token, { components: [buildProgressContainer(query)] })
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🔵 Ask CastBot answered (${answer.length} chars, ${elapsed}s)`);

    const responseId = Date.now().toString(36);
    rememberResponse(responseId, { response: answer, query, elapsed });

    const chunks = chunkResponse(answer);
    await updateDeferredResponse(token, {
      components: [buildFirstContainer({ query, chunk: chunks[0], elapsed, chunkCount: chunks.length, responseId })]
    });
    for (let i = 1; i < chunks.length; i++) {
      await createFollowupMessage(token, {
        components: [buildChunkContainer({ chunk: chunks[i], isLast: i === chunks.length - 1, responseId })]
      });
    }
  } catch (error) {
    console.error('🔵 Ask CastBot error:', error.message);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await updateDeferredResponse(token, {
      components: [buildErrorContainer(error.message, elapsed)]
    });
  }
}
