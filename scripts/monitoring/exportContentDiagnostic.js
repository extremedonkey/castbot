/**
 * Export Content Diagnostic — proves whether GET /channels/{id}/messages returns
 * real message content or redacted empties (Message Content Intent test).
 * READ-ONLY. Pure REST (no gateway) — so it isolates the portal-toggle question.
 *
 * Usage: node scripts/monitoring/exportContentDiagnostic.js [channelId|nameFragment]
 *   default nameFragment: "new-features"
 */
import 'dotenv/config';
import fetch from 'node-fetch';

const TOKEN = process.env.DISCORD_TOKEN;
const BASE = 'https://discord.com/api/v10';
const auth = { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' };
const get = (p) => fetch(`${BASE}/${p}`, { headers: auth });

async function main() {
  const arg = process.argv[2] || 'new-features';
  const me = await (await get('users/@me')).json();
  console.log(`🤖 Bot: ${me.username} (${me.id})`);

  let channelId = /^\d+$/.test(arg) ? arg : null;
  let channelName = channelId;
  if (!channelId) {
    const guilds = await (await get('users/@me/guilds')).json();
    outer: for (const g of guilds) {
      const chans = await (await get(`guilds/${g.id}/channels`)).json();
      if (!Array.isArray(chans)) continue;
      for (const c of chans) {
        if (c.type === 0 && c.name && c.name.includes(arg)) {
          channelId = c.id; channelName = c.name;
          console.log(`📍 Found #${c.name} (${c.id}) in "${g.name}"`);
          break outer;
        }
      }
    }
  }
  if (!channelId) { console.error(`No channel matching "${arg}"`); process.exit(1); }

  const res = await get(`channels/${channelId}/messages?limit=10`);
  if (!res.ok) { console.error(`Fetch failed: ${res.status} ${await res.text()}`); process.exit(1); }
  const msgs = await res.json();
  console.log(`\n📥 Fetched ${msgs.length} messages from #${channelName}\n`);

  let emptyContent = 0, hasComponents = 0, hasEmbeds = 0;
  for (const m of msgs) {
    const author = m.author?.global_name || m.author?.username;
    const isBot = m.author?.bot ? '🤖' : '👤';
    const clen = (m.content || '').length;
    if (clen === 0) emptyContent++;
    if (m.components?.length) hasComponents++;
    if (m.embeds?.length) hasEmbeds++;
    console.log(`${isBot} ${author?.padEnd(14)} content=${String(clen).padStart(4)}ch  embeds=${m.embeds?.length||0} components=${m.components?.length||0} attach=${m.attachments?.length||0} reactions=${m.reactions?.length||0}`);
    if (clen > 0) console.log(`     "${m.content.slice(0, 70).replace(/\n/g, ' ')}..."`);
  }
  console.log(`\n📊 ${emptyContent}/${msgs.length} messages have EMPTY content.`);
  console.log(`   ${hasEmbeds} have embeds, ${hasComponents} have components.`);
  if (emptyContent === msgs.length) {
    console.log(`\n🛑 ALL content empty → Message Content Intent is NOT granted (portal toggle OFF).`);
  } else {
    console.log(`\n✅ Content present → Message Content Intent IS active for REST.`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
