import "dotenv/config";
const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.APP_ID;
const API = "https://discord.com/api/v10";
// name -> source (dev) emoji id to copy the image from
const SRC = {
  castbot_logo:      "1487709952662573091",
  castbot_logo_full: "1421388843654975599",
  command:           "1396095623815495700",
  reece:             "1436850201158483968",
  cb_transparent:    "1487709952662573091",
  cb_blue:           "1495983773379199056",
};
const auth = { Authorization: `Bot ${TOKEN}` };

async function fetchImageDataUri(id) {
  for (const ext of ["png", "gif"]) {
    const r = await fetch(`https://cdn.discordapp.com/emojis/${id}.${ext}`);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      const mime = ext === "gif" ? "image/gif" : "image/png";
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
  }
  throw new Error(`could not fetch source emoji ${id}`);
}

async function existingEmojis() {
  const r = await fetch(`${API}/applications/${APP_ID}/emojis`, { headers: auth });
  if (!r.ok) throw new Error(`list failed ${r.status} ${await r.text()}`);
  const data = await r.json();
  const items = data.items || data; // app emojis come under {items:[...]}
  const map = {};
  for (const e of items) map[e.name] = e.id;
  return map;
}

const result = {};
const existing = await existingEmojis();
for (const [name, srcId] of Object.entries(SRC)) {
  if (existing[name]) { result[name] = existing[name]; console.error(`= ${name} already exists ${existing[name]}`); continue; }
  const image = await fetchImageDataUri(srcId);
  const r = await fetch(`${API}/applications/${APP_ID}/emojis`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name, image }),
  });
  if (!r.ok) { console.error(`! ${name} upload failed ${r.status} ${await r.text()}`); continue; }
  const e = await r.json();
  result[name] = e.id;
  console.error(`+ ${name} -> ${e.id}`);
  await new Promise(s => setTimeout(s, 600)); // gentle on rate limits
}
console.log(JSON.stringify(result, null, 2));
