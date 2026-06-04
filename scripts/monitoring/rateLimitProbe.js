/**
 * Rate Limit Probe — empirically measure the GET /channels/{id}/messages bucket.
 * READ-ONLY: only issues GET requests. Safe to run against CastBot-Dev.
 *
 * Usage: node scripts/monitoring/rateLimitProbe.js [channelId] [burstCount]
 *
 * Watches x-ratelimit-* headers count down so we learn the real bucket size +
 * reset window without guessing. Stops & reports if a 429 is hit.
 */
import 'dotenv/config';
import fetch from 'node-fetch';

const TOKEN = process.env.DISCORD_TOKEN;
const BASE = 'https://discord.com/api/v10';
const headersAuth = { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' };

async function api(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: headersAuth });
  return res;
}

function snap(res) {
  return {
    status: res.status,
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
    resetAfter: res.headers.get('x-ratelimit-reset-after'),
    bucket: res.headers.get('x-ratelimit-bucket'),
    scope: res.headers.get('x-ratelimit-scope'),
    retryAfter: res.headers.get('retry-after'),
  };
}

async function main() {
  if (!TOKEN) { console.error('No DISCORD_TOKEN in env'); process.exit(1); }

  // Who am I (confirm it's the dev bot, never print token)
  const me = await (await api('users/@me')).json();
  console.log(`🤖 Bot: ${me.username}#${me.discriminator || ''} (${me.id})`);

  let channelId = process.argv[2];
  const burst = parseInt(process.argv[3] || '80', 10);
  const delayMs = parseInt(process.argv[4] || '0', 10);

  // Auto-discover a text channel if none provided
  if (!channelId) {
    const guilds = await (await api('users/@me/guilds')).json();
    console.log(`📋 In ${guilds.length} guild(s). Searching for a text channel...`);
    for (const g of guilds) {
      const chans = await (await api(`guilds/${g.id}/channels`)).json();
      const text = Array.isArray(chans) && chans.find(c => c.type === 0);
      if (text) { channelId = text.id; console.log(`📍 Using #${text.name} (${text.id}) in "${g.name}"`); break; }
    }
  }
  if (!channelId) { console.error('No channel found/provided'); process.exit(1); }

  console.log(`\n🔥 Bursting GET channels/${channelId}/messages?limit=100 x${burst} (no delay)\n`);

  const t0 = Date.now();
  for (let i = 1; i <= burst; i++) {
    const res = await api(`channels/${channelId}/messages?limit=100`);
    const s = snap(res);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`#${String(i).padStart(3)} t=${elapsed}s status=${s.status} limit=${s.limit} remaining=${s.remaining} reset-after=${s.resetAfter} scope=${s.scope || '-'} bucket=${(s.bucket || '').slice(0, 12)}`);

    if (s.status === 429) {
      const body = await res.json().catch(() => ({}));
      console.log(`\n🛑 429 HIT at request #${i}: retry_after=${body.retry_after}s global=${body.global} scope=${s.scope}`);
      console.log(`   → Bucket allowed ${i - 1} requests before limiting.`);
      break;
    }
    if (delayMs > 0 && i < burst) await new Promise(r => setTimeout(r, delayMs));
  }
  console.log(`\n✅ Probe complete in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
}

main().catch(e => { console.error('Probe error:', e); process.exit(1); });
