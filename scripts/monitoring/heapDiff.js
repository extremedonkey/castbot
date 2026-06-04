#!/usr/bin/env node
/**
 * heapDiff.js — Compare two V8 heap snapshots and report object growth by
 * constructor/type. This is the CLI equivalent of Chrome DevTools' Memory →
 * "Comparison" view (# Delta / Size Delta columns), for when you want the
 * answer in a terminal or can't open the 100MB+ file in a browser.
 *
 * IMPORTANT: run this on a dev/analysis machine, NOT on the constrained prod
 * box — it JSON.parses the whole snapshot (needs RAM ~= file size).
 *
 * Usage:
 *   node scripts/monitoring/heapDiff.js <baseline.heapsnapshot> <hot.heapsnapshot> [topN]
 *
 * Caveat: aggregates by SELF size (shallow), matching DevTools' Comparison
 * columns. For "retained size" (exclusively-held subgraphs) use the DevTools
 * UI. Self-size growth by constructor is plenty to spot a leak's source.
 */
import fs from 'fs';

function aggregate(path) {
  const snap = JSON.parse(fs.readFileSync(path, 'utf8'));
  const meta = snap.snapshot.meta;
  const nodeFields = meta.node_fields;
  const fieldCount = nodeFields.length;
  const typeIdx = nodeFields.indexOf('type');
  const nameIdx = nodeFields.indexOf('name');
  const sizeIdx = nodeFields.indexOf('self_size');
  const nodeTypes = meta.node_types[typeIdx]; // array of type-name strings
  const nodes = snap.nodes;
  const strings = snap.strings;

  const byName = new Map(); // key -> { count, size }
  let totalSize = 0;
  for (let i = 0; i < nodes.length; i += fieldCount) {
    const typeName = nodeTypes[nodes[i + typeIdx]];
    const size = nodes[i + sizeIdx];
    // For 'object' nodes the name IS the constructor (GuildMember, Object, ...).
    // For others (string/array/closure/etc.) bucket by type so they aggregate.
    let key = strings[nodes[i + nameIdx]] || '';
    if (!key || typeName !== 'object') key = `(${typeName})`;
    const rec = byName.get(key) || { count: 0, size: 0 };
    rec.count++;
    rec.size += size;
    byName.set(key, rec);
    totalSize += size;
  }
  return { byName, totalSize, nodeCount: nodes.length / fieldCount };
}

function fmt(bytes) {
  const mb = bytes / 1048576;
  if (Math.abs(mb) >= 1) return `${mb >= 0 ? '' : '-'}${Math.abs(mb).toFixed(1)}MB`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

const [, , baseP, hotP, topNArg] = process.argv;
const topN = parseInt(topNArg, 10) || 25;
if (!baseP || !hotP) {
  console.error('Usage: node heapDiff.js <baseline.heapsnapshot> <hot.heapsnapshot> [topN]');
  process.exit(1);
}

const t0 = Date.now();
const base = aggregate(baseP);
const hot = aggregate(hotP);
const parseMs = Date.now() - t0;

console.log(`\nBaseline : ${baseP}`);
console.log(`Hot      : ${hotP}`);
console.log(`(parsed both in ${parseMs}ms)\n`);
console.log(`Baseline total: ${fmt(base.totalSize).padStart(8)}  (${base.nodeCount.toLocaleString()} objects)`);
console.log(`Hot total     : ${fmt(hot.totalSize).padStart(8)}  (${hot.nodeCount.toLocaleString()} objects)`);
console.log(`GROWTH        : ${fmt(hot.totalSize - base.totalSize).padStart(8)}\n`);

const names = new Set([...base.byName.keys(), ...hot.byName.keys()]);
const deltas = [];
for (const name of names) {
  const b = base.byName.get(name) || { count: 0, size: 0 };
  const h = hot.byName.get(name) || { count: 0, size: 0 };
  deltas.push({ name, dCount: h.count - b.count, dSize: h.size - b.size, hotSize: h.size });
}
deltas.sort((a, b) => b.dSize - a.dSize);

console.log(`Top ${topN} by SIZE GROWTH (what accumulated):\n`);
console.log('  ' + 'Δsize'.padStart(9) + '  ' + 'Δcount'.padStart(10) + '  ' + 'hot total'.padStart(9) + '  constructor / (type)');
console.log('  ' + '-'.repeat(9) + '  ' + '-'.repeat(10) + '  ' + '-'.repeat(9) + '  ' + '-'.repeat(30));
for (const d of deltas.slice(0, topN)) {
  if (d.dSize <= 0) break;
  const dc = (d.dCount >= 0 ? '+' : '') + d.dCount.toLocaleString();
  console.log('  ' + fmt(d.dSize).padStart(9) + '  ' + dc.padStart(10) + '  ' + fmt(d.hotSize).padStart(9) + '  ' + d.name);
}
console.log('');
