#!/usr/bin/env node
// Fetches all messages from a Discord channel and saves to JSON
// Usage: node scripts/fetch-channel-messages.js <channelId> [outputFile]

import 'dotenv/config';

const CHANNEL_ID = process.argv[2] || '1453632564563677336';
const OUTPUT_FILE = process.argv[3] || `temp/channel-${CHANNEL_ID}-messages.json`;

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) { console.error('Missing DISCORD_TOKEN in .env'); process.exit(1); }

async function fetchMessages(channelId) {
  let allMessages = [];
  let before = null;
  let batch = 0;

  while (true) {
    const params = new URLSearchParams({ limit: '100' });
    if (before) params.set('before', before);

    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?${params}`, {
      headers: { Authorization: `Bot ${TOKEN}` }
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`API error: ${res.status}`, err);
      break;
    }

    // Rate limit handling
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const resetAfter = parseFloat(res.headers.get('x-ratelimit-reset-after') || '1');
      console.log(`  Rate limited, waiting ${resetAfter}s...`);
      await new Promise(r => setTimeout(r, resetAfter * 1000 + 100));
    }

    const messages = await res.json();
    if (messages.length === 0) break;

    allMessages.push(...messages);
    before = messages[messages.length - 1].id;
    batch++;
    console.log(`  Batch ${batch}: ${messages.length} messages (total: ${allMessages.length})`);

    if (messages.length < 100) break;
  }

  return allMessages;
}

console.log(`Fetching all messages from channel ${CHANNEL_ID}...`);
const messages = await fetchMessages(CHANNEL_ID);

// Sort oldest first
messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

// Also create a readable text version
const textLines = messages.map(m => {
  const date = new Date(m.timestamp).toISOString().slice(0, 19).replace('T', ' ');
  const author = m.author?.global_name || m.author?.username || 'Unknown';
  const content = m.content || (m.embeds?.length ? '[embed]' : (m.components?.length ? '[components]' : '[no content]'));
  const attachments = m.attachments?.length ? ` [${m.attachments.length} attachment(s)]` : '';
  return `[${date}] ${author}: ${content}${attachments}`;
}).join('\n');

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

writeFileSync(OUTPUT_FILE, JSON.stringify(messages, null, 2));
writeFileSync(OUTPUT_FILE.replace('.json', '.txt'), textLines);

console.log(`\nDone! ${messages.length} messages saved to:`);
console.log(`  JSON: ${OUTPUT_FILE}`);
console.log(`  Text: ${OUTPUT_FILE.replace('.json', '.txt')}`);
