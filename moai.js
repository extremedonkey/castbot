/**
 * 🗿 The Moai — Claude Code integration via Discord (Reece only).
 *
 * Extracted from app.js 2026-07-16 so the router stays a router, and so the Moai and
 * Ask CastBot share one timing model instead of drifting apart. See claudeRunner.js for
 * why the old 2-min-nudge / 4-min-kill pair was both too short and too quiet.
 *
 * WHAT THE MOAI KEEPS THAT ASK CASTBOT DOESN'T: the full toolset. The Moai's whole job is
 * to change code when Reece asks — no `tools` allowlist, no deny rules. That asymmetry is
 * the point, and it's why the Moai stays behind the Reece-only menu.
 *
 * @module moai
 */

import fs from 'fs';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { runClaudeJob, safeDeliver, formatElapsed, HARD_KILL_MS } from './claudeRunner.js';

const MAX_CHUNK = 3500;
const ACCENT = 0x808080;

const FORTUNES = [
  '🥠 *Legacy code is a stronger prompt than any document.*',
  '🥠 *The pre-commit hook is the bouncer. The docs are the dress code nobody reads.*',
  '🥠 *A gas station in Denmark from 1932 is still standing because someone decided the mundane deserves craft.*',
  '🥠 *Documentation is aspiration. The codebase is the truth.*',
  '🥠 *Stone doesn\'t lose. Stone also doesn\'t win. Stone endures.*',
  '🥠 *The agent is writing itself a permission slip.*',
  '🥠 *Don\'t say "net reduction" when the file is still 21,000 lines.*',
  '🥠 *Rules on paper get ignored. Rules in hooks get followed.*',
  '🥠 *The exchange rate is approximately 1 Reece Credit = 1 moment where the code worked and both of us knew it.*'
];

/** Trim for display. */
function truncate(text, max) {
  return `${text.substring(0, max)}${text.length > max ? '...' : ''}`;
}

/** Split a long response, preferring newline boundaries. */
export function chunkResponse(response) {
  const chunks = [];
  let remaining = response;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK) { chunks.push(remaining); break; }
    let splitAt = remaining.lastIndexOf('\n', MAX_CHUNK);
    if (splitAt < MAX_CHUNK * 0.5) splitAt = MAX_CHUNK;
    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }
  return chunks;
}

/** Build the Moai prompt: essence + context + question. */
export function buildPrompt(query, prevContextText = '') {
  const moaiEssence = fs.readFileSync('./docs/moai.md', 'utf8');
  const prevSection = prevContextText?.trim()
    ? `\n\nPREVIOUS CONVERSATION (context from the last Moai interaction — use this to inform your response):\n${prevContextText}\n\n---\n`
    : '';
  return `You are the Moai 🗿 — CastBot's stone advisor. Here is your personality essence:\n\n${moaiEssence}\n\nYou are responding via Discord to Reece. Keep responses concise (Discord has character limits). Use markdown formatting.\n\nIMPORTANT CONTEXT:\n- You are running in the CastBot project directory via claude --print\n- You have access to the full codebase and can read files\n- If Reece asks you to make code changes, you CAN — but tell him to click the 🔄 Restart Dev button after to apply them\n- Dev restart command: ./scripts/dev/dev-restart.sh "commit message"\n- You are a one-shot agent (no conversation memory between queries)${prevSection ? ' BUT you have context from the previous question below' : ''}${prevSection}\n\nReece asks:\n${query}`;
}

const actionRow = (responseId) => ({
  type: 1,
  components: [
    { type: 2, custom_id: `moai_ask_ctx_${responseId}`, label: 'Ask Another', style: 2, emoji: { name: '🗿' } },
    { type: 2, custom_id: 'moai_restart_dev', label: 'Restart Dev', style: 4, emoji: { name: '🔄' } }
  ]
});

/** Live progress — real activity from the CLI stream, refreshed on each heartbeat. */
export function buildProgressContainer(query, progress = null) {
  const lines = [{ type: 10, content: `## 🗿 The Moai is Carving...` }];
  if (progress) {
    lines.push(
      { type: 10, content: `${progress.activity}` },
      { type: 14 },
      { type: 10, content: `-# ⏳ ${formatElapsed(progress.elapsedMs)} of ${formatElapsed(HARD_KILL_MS)} · ${progress.toolCount} tool call${progress.toolCount === 1 ? '' : 's'}` }
    );
  } else {
    lines.push({ type: 10, content: `🚀 Starting up` }, { type: 14 });
  }
  lines.push({ type: 10, content: `-# "${truncate(query, 80)}"` });
  return { type: 17, accent_color: ACCENT, components: lines };
}

export function buildFirstContainer({ query, chunk, elapsed, chunkCount, responseId }) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `## 🗿 The Moai Speaks` },
      { type: 10, content: `-# "${truncate(query, 120)}"` },
      { type: 14 },
      { type: 10, content: chunk },
      { type: 14 },
      { type: 10, content: `-# 🗿 ${elapsed}${chunkCount > 1 ? ` · ${chunkCount} parts` : ''}` },
      ...(chunkCount === 1 ? [actionRow(responseId)] : [])
    ]
  };
}

export function buildChunkContainer({ chunk, isLast, responseId }) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: chunk },
      ...(isLast ? [{ type: 14 }, { type: 10, content: `-# continued` }, actionRow(responseId)] : [])
    ]
  };
}

export function buildErrorContainer(message) {
  return {
    type: 17,
    accent_color: 0xe74c3c,
    components: [
      { type: 10, content: `## 🗿 The Moai is Silent\n\n${(message || 'Unknown error').substring(0, 400)}` },
      { type: 14 },
      { type: 10, content: `-# The stone endures. Try again.` },
      { type: 1, components: [
        { type: 2, custom_id: 'moai_ask', label: 'Try Again', style: 2, emoji: { name: '🗿' } }
      ]}
    ]
  };
}

/** Response cache for the Ask Another button (last 10). */
export function rememberResponse(responseId, payload) {
  if (!global.moaiResponses) global.moaiResponses = new Map();
  global.moaiResponses.set(responseId, payload);
  if (global.moaiResponses.size > 10) {
    global.moaiResponses.delete(global.moaiResponses.keys().next().value);
  }
}

/**
 * Handle the Moai modal submit: defer, run with live progress, deliver.
 * @param {Object} req
 * @param {Object} res
 */
export async function handleMoaiModalSubmit(req, res) {
  const fields = {};
  for (const comp of (req.body.data.components || [])) {
    const inner = comp?.component || comp?.components?.[0];
    if (inner?.custom_id) fields[inner.custom_id] = inner.value;
  }
  const query = fields.moai_query;

  if (!query?.trim()) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '🗿 The Moai requires a question.', flags: InteractionResponseFlags.EPHEMERAL }
    });
  }

  // Deferred PUBLIC — responses persist in channel history (ephemeral dies on restart).
  res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: {} });

  const token = req.body.token;
  const channelId = req.body.channel_id;
  const userId = req.body.member?.user?.id;
  const { createFollowupMessage } = await import('./buttonHandlerFactory.js');
  const deliver = (data) => safeDeliver({ token, channelId, data, userId });

  try {
    console.log(`🗿 Moai query from ${req.body.member?.user?.username}: "${truncate(query, 80)}"`);
    await deliver({ components: [buildProgressContainer(query)] });

    // No tools/deny: the Moai is allowed to change code. That's its job.
    const { text: response, durationMs } = await runClaudeJob({
      prompt: buildPrompt(query, fields.moai_prev_context),
      onHeartbeat: (progress) => deliver({ components: [buildProgressContainer(query, progress)] })
    });

    const elapsed = formatElapsed(durationMs);
    console.log(`🗿 Moai responded (${response.length} chars, ${elapsed})`);

    const responseId = Date.now().toString(36);
    rememberResponse(responseId, { response, query, elapsed });

    const chunks = chunkResponse(response);
    await deliver({
      components: [buildFirstContainer({ query, chunk: chunks[0], elapsed, chunkCount: chunks.length, responseId })]
    });
    for (let i = 1; i < chunks.length; i++) {
      await createFollowupMessage(token, {
        components: [buildChunkContainer({ chunk: chunks[i], isLast: i === chunks.length - 1, responseId })]
      });
    }

    // 🎲 Fortune cookie — 1 in 10
    if (Math.random() < 0.1) {
      await createFollowupMessage(token, {
        components: [{ type: 17, accent_color: 0xf39c12, components: [
          { type: 10, content: FORTUNES[Math.floor(Math.random() * FORTUNES.length)] }
        ]}]
      });
    }
  } catch (error) {
    console.error('🗿 Moai error:', error.message);
    await deliver({ components: [buildErrorContainer(error.message)] });
  }
}
