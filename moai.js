/**
 * 🗿 The Moai — Claude Code integration via Discord (Reece only).
 *
 * Extracted from app.js 2026-07-16 so the router stays a router, and so the Moai and
 * Ask CastBot share one timing model instead of drifting apart. See claudeRunner.js for
 * why the old 2-min-nudge / 4-min-kill pair was both too short and too quiet.
 *
 * WHAT THE MOAI KEEPS THAT ASK CASTBOT DOESN'T: the full toolset — on DEV and TEST. The
 * Moai's whole job there is to change code when Reece asks, and that asymmetry is why it
 * stays behind the Reece-only menu. On PROD the same Moai is a READ-ONLY advisor: its cwd
 * is the LIVE tree, so writes are hard-blocked at the CLI layer (see moaiToolset()) and
 * change requests are routed to the TEST Moai + the 🚀 Deploy Prod button.
 *
 * @module moai
 */

import fs from 'fs';
import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { runClaudeJob, formatElapsed, HARD_KILL_MS, buildModelSelectField, resolveModelChoice, modelLabel, DEFAULT_MODEL, chunkResponse, resolveAskerName, createProgressReporter } from './claudeRunner.js';

export { chunkResponse };

const ACCENT = 0x808080;

// Reece + test user — same trust boundary as the reeces_stuff menu itself. Unlike Ask
// CastBot (restricted toolset, meant to go public), the Moai has full tool access and
// stays gated even when posted as a standing channel button.
const KEEPER_IDS = ['391415444084490240', '1086246253819613274'];

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

/**
 * Is the Moai present on this box at all? DEV and TEST always; PROD only with the
 * CLAUDE_PROD_FEATURES=TRUE opt-in ("maybe in the future" arrived 2026-07-28, when the
 * 2GB migration made CLI spawns affordable and the CLI + auth were installed on prod).
 * Same gate as Ask CastBot's environment check. Access stays KEEPER_IDS-only regardless.
 * @returns {boolean}
 */
export function isMoaiEnvironment() {
  return process.env.PRODUCTION !== 'TRUE' || process.env.CLAUDE_PROD_FEATURES === 'TRUE';
}

/** Is THIS process the live production bot? (test box sets INSTANCE_ROLE=test, not PRODUCTION) */
export function isProdMoai() {
  return process.env.PRODUCTION === 'TRUE';
}

/**
 * CLI tool allowlist per instance. On PROD the Moai is a READ-ONLY advisor — its cwd is
 * the LIVE tree, where code edits are inert-until-restart, invisible to git, erased by
 * the next deploy's auto-stash, and data-file writes race the live bot's own save cycles
 * (the lost-move incident class). This is a HARD fence at the CLI layer (same mechanism
 * as Ask CastBot's toolset), not a prompt request — rules in prompts get ignored, rules
 * in enforcement get followed. DEV and TEST keep the full toolset: changing code there
 * is the Moai's job.
 * @returns {string|undefined} comma-list for `claude --tools`, or undefined for full access
 */
export function moaiToolset() {
  return isProdMoai() ? 'Read,Glob,Grep' : undefined;
}

/** The IMPORTANT CONTEXT bullets that differ per instance — see moaiToolset() for why. */
function instanceGuidance() {
  if (isProdMoai()) {
    return `- ⛔ YOU ARE ON THE LIVE PRODUCTION BOX. You are a READ-ONLY advisor here: your tools are Read/Glob/Grep only — you cannot edit files, run commands, or deploy, and you must never offer to.
- Your working directory is the LIVE prod tree. This is why writes are blocked: an edit here would be inert until a restart, invisible to git, erased by the next deploy's auto-stash — and a data-file write would race the live bot and could destroy player data.
- If Reece asks for a change: give your analysis, then tell him to ask the TEST Moai (castbot-blue) to make it, verify on CastBot Test, and ship it with the 🚀 Deploy Prod button. That is the only path from idea to prod.`;
  }
  if (process.env.INSTANCE_ROLE === 'test') {
    return `- You are on the TEST box (castbot-blue), in the test working tree. If Reece asks you to make code changes, you CAN — that is your job here.
- After editing, run ./scripts/dev/box-restart.sh "commit message" as your VERY LAST action (it commits → pushes → tests → restarts CastBot Test; the restart may cut off your own reply mid-delivery, but the work is already pushed — say goodbye before you run it). Never leave edits uncommitted.
- NEVER deploy to prod or touch the prod box. Prod ships one way only: Reece clicks the 🚀 Deploy Prod button after verifying your change on CastBot Test.`;
  }
  return `- If Reece asks you to make code changes, you CAN — but tell him to click the 🔄 Restart Dev button after to apply them
- Dev restart command: ./scripts/dev/dev-restart.sh "commit message"`;
}

/**
 * Collect all visible text out of a Discord message (Components V2 aware).
 *
 * This is what makes the context-aware Ask Moai button restart-proof: the message the
 * button sits on IS the store. No in-memory cache to lose on restart, no 100-char
 * custom_id to squeeze an error log into — just read the card back at click time.
 * @param {Object} message - req.body.message from the interaction
 * @returns {string}
 */
export function extractMessageText(message) {
  const out = message?.content ? [message.content] : [];
  const walk = (comps) => {
    for (const c of comps || []) {
      if (c?.type === 10 && typeof c.content === 'string') out.push(c.content);
      if (Array.isArray(c?.components)) walk(c.components);
    }
  };
  walk(message?.components);
  const text = out.join('\n').trim();
  // Strip the Test Steps checklist — it's a manual QA aid for Reece, not context the Moai
  // needs. Cutting it frees up the 4000-char modal cap for the change/error text that matters.
  return text.replace(/\n### ```🧪 Test Steps```[\s\S]*?(?=\n\n|$)/, '').trim();
}

/** Modal text inputs cap at 4000 chars; leave room for the truncation ellipsis. */
const MODAL_CONTEXT_MAX = 3500;

/**
 * The Ask Moai modal with the clicked message prefilled as editable context.
 * custom_id reuses `moai_ask_modal` so the existing MODAL_SUBMIT route handles it —
 * the field scrape there picks up `moai_msg_context` with zero new routing.
 * @param {string} contextText - output of extractMessageText()
 * @param {string} [chosenModel] - re-selects the prior pick on a Follow Up
 * @returns {Object} modal `data` payload
 */
export function buildContextAskModal(contextText, chosenModel = DEFAULT_MODEL) {
  const value = truncate(String(contextText || ''), MODAL_CONTEXT_MAX);
  return {
    custom_id: 'moai_ask_modal',
    title: '🗿 Ask The Moai',
    components: [
      buildModelSelectField('moai_model', chosenModel),
      {
        type: 18,
        label: 'Context (auto-filled from the message)',
        description: 'Trim this down if only part of it matters',
        component: {
          type: 4,
          custom_id: 'moai_msg_context',
          style: 2,
          required: false,
          max_length: 4000,
          ...(value ? { value } : { placeholder: 'No text found on that message' })
        }
      },
      {
        type: 18,
        label: 'Your question',
        description: 'The Moai reads the codebase — ask what happened, why, or what to do',
        component: {
          type: 4,
          custom_id: 'moai_query',
          style: 2,
          required: true,
          max_length: 2000,
          placeholder: 'e.g., "What caused this error and where?" or "Anything risky in this deploy?"'
        }
      }
    ]
  };
}

/**
 * Message 1: the question, on its own card, in full — the same two-message pattern as
 * Ask CastBot. Before this, the Moai's only record of what was asked was an 80-char
 * footnote on the eventual answer, and the channel showed Discord's generic "thinking..."
 * placeholder until the first progress edit landed.
 * @param {{askerName: string, query: string, hasMsgContext?: boolean}} opts
 */
export function buildQuestionContainer({ askerName, query, hasMsgContext = false }) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `### 🗿 *${askerName}* asked` },
      { type: 10, content: query },
      ...(hasMsgContext ? [{ type: 10, content: `-# 📎 with message context attached` }] : [])
    ]
  };
}

/** Build the Moai prompt: essence + context + question. */
export function buildPrompt(query, prevContextText = '', msgContextText = '') {
  const moaiEssence = fs.readFileSync('./docs/moai.md', 'utf8');
  const prevSection = prevContextText?.trim()
    ? `\n\nPREVIOUS CONVERSATION (context from the last Moai interaction — use this to inform your response):\n${prevContextText}\n\n---\n`
    : '';
  // The message the Ask Moai button was clicked on (a PM2 error post, a deploy
  // notification) — it is the SUBJECT of the question, not conversational history.
  const msgSection = msgContextText?.trim()
    ? `\n\nATTACHED MESSAGE (Reece clicked "Ask Moai" on this Discord message — usually a PM2 error post or a deploy notification; treat it as the subject of the question):\n${msgContextText}\n\n---\n`
    : '';
  return `You are the Moai 🗿 — CastBot's stone advisor. Here is your personality essence:\n\n${moaiEssence}\n\nYou are responding via Discord to Reece. Keep responses concise (Discord has character limits). Use markdown formatting.\n\nIMPORTANT CONTEXT:\n- You are running in the CastBot project directory via claude --print\n- You have access to the full codebase and can read files\n${instanceGuidance()}\n- You are a one-shot agent (no conversation memory between queries)${prevSection ? ' BUT you have context from the previous question below' : ''}${prevSection}${msgSection}\n\nReece asks:\n${query}`;
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

export function buildFirstContainer({ query, chunk, elapsed, chunkCount, responseId, model }) {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `## 🗿 The Moai Speaks` },
      { type: 10, content: `-# "${truncate(query, 120)}"` },
      { type: 14 },
      { type: 10, content: chunk },
      { type: 14 },
      { type: 10, content: `-# 🗿 ${elapsed}${chunkCount > 1 ? ` · ${chunkCount} parts` : ''} · ${modelLabel(model)}` },
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

/**
 * The standing container posted by "Post Moai" — a permanent Ask The Moai button in this
 * channel. Unlike Ask CastBot's posted button, this does NOT open access to everyone —
 * the click still routes through the moai_ask handler / handleMoaiModalSubmit's KEEPER_IDS
 * gate, so only Reece + test user can actually use it. Anyone else gets turned away.
 */
export function buildPostedMoaiContainer() {
  return {
    type: 17,
    accent_color: ACCENT,
    components: [
      { type: 10, content: `## 🗿 Ask The Moai` },
      { type: 10, content: `A standing button for the Moai — CastBot's stone advisor. Full codebase context, full tool access, keeper-only.` },
      { type: 14 },
      { type: 1, components: [
        { type: 2, custom_id: 'moai_ask', label: 'Ask The Moai', style: 2, emoji: { name: '🗿' } }
      ]}
    ]
  };
}

/** Response cache for the Ask Another button (last 10). */
/** moai_post button body — drops the standing Moai button into the channel (app.js stays a router). */
export async function postMoaiHandler(context) {
  if (!isMoaiEnvironment()) {
    return { content: '🗿 The Moai does not dwell in production.', ephemeral: true };
  }
  const { DiscordRequest } = await import('./utils.js');
  await DiscordRequest(`channels/${context.channelId}/messages`, {
    method: 'POST',
    body: { components: [buildPostedMoaiContainer()], flags: (1 << 15) }
  });
  return {
    components: [{ type: 17, accent_color: 0x2ecc71, components: [
      { type: 10, content: `✅ Moai posted to <#${context.channelId}>` },
      { type: 10, content: `-# Still keeper-only — everyone else who clicks it gets turned away.` }
    ]}],
    ephemeral: true
  };
}

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
    // Text inputs carry `value`; String Selects (the model picker) carry `values: [...]`.
    if (inner?.custom_id) fields[inner.custom_id] = inner.value ?? inner.values?.[0];
  }
  const query = fields.moai_query;
  const model = resolveModelChoice(fields.moai_model);

  if (!isMoaiEnvironment()) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '🗿 The Moai does not dwell in production.', flags: InteractionResponseFlags.EPHEMERAL }
    });
  }
  if (!query?.trim()) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '🗿 The Moai requires a question.', flags: InteractionResponseFlags.EPHEMERAL }
    });
  }
  if (!KEEPER_IDS.includes(req.body.member?.user?.id)) {
    // Authoritative gate — covers every path into this handler (menu button, posted
    // standing button, message-context button), not just whichever button triggered it.
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '🗿 The Moai listens only to its keeper.', flags: InteractionResponseFlags.EPHEMERAL }
    });
  }

  // TWO MESSAGES, NOT ONE — same pattern as Ask CastBot's handleAskModalSubmit:
  //   1. the question card as the immediate PUBLIC response, so the channel can read
  //      what was asked (the old bare deferred left only Discord's generic placeholder,
  //      and the question survived only as a truncated footnote on the answer);
  //   2. a follow-up that carries live progress and then becomes the answer.
  // Public rather than ephemeral because responses must persist in channel history
  // (ephemeral dies on restart).
  const askerName = resolveAskerName(req.body);
  res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      components: [buildQuestionContainer({ askerName, query, hasMsgContext: !!fields.moai_msg_context?.trim() })],
      flags: (1 << 15)  // IS_COMPONENTS_V2
    }
  });

  const token = req.body.token;
  const channelId = req.body.channel_id;
  const userId = req.body.member?.user?.id;
  const { createFollowupMessage } = await import('./buttonHandlerFactory.js');
  // Heartbeats edit the progress follow-up in place and never fall back to a channel
  // post (the old code reused the fallback-enabled deliver for heartbeats — a token
  // hiccup could spam a new progress message every 20s).
  const reporter = createProgressReporter({ token, channelId, userId });

  try {
    console.log(`🗿 Moai query from ${req.body.member?.user?.username}: "${truncate(query, 80)}"`);
    await reporter.start({ components: [buildProgressContainer(query)] });

    // Full toolset on DEV/TEST (changing code is the Moai's job there); hard read-only
    // allowlist on PROD (live tree — see moaiToolset()).
    const { text: response, durationMs } = await runClaudeJob({
      prompt: buildPrompt(query, fields.moai_prev_context, fields.moai_msg_context),
      tools: moaiToolset(),
      model,
      onHeartbeat: (progress) => reporter.beat({ components: [buildProgressContainer(query, progress)] })
    });

    const elapsed = formatElapsed(durationMs);
    console.log(`🗿 Moai responded (${response.length} chars, ${elapsed}, ${model})`);

    const responseId = Date.now().toString(36);
    rememberResponse(responseId, { response, query, elapsed, model });

    const chunks = chunkResponse(response);
    await reporter.deliver({
      components: [buildFirstContainer({ query, chunk: chunks[0], elapsed, chunkCount: chunks.length, responseId, model })]
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
    await reporter.deliver({ components: [buildErrorContainer(error.message)] });
  }
}
