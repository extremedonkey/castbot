/**
 * Heap Dump Handler — installs a SIGUSR2 signal handler that writes a V8 heap
 * snapshot to disk on demand. Trigger from outside the process with:
 *
 *     kill -SIGUSR2 <pid>
 *
 * Snapshots are written **synchronously** and pause the event loop for several
 * seconds (proportional to heap size — ~5-15s for a 90MB heap). Use only as an
 * ops diagnostic, not during peak usage. The serialization also briefly spikes
 * memory by ~50% of heap size, so avoid triggering near the OOM threshold.
 *
 * Output: `/tmp/castbot-heap-{ISO-timestamp}.heapsnapshot`
 * Load in Chrome DevTools → Memory tab → "Load Profile" to analyze.
 *
 * Diff two snapshots taken at different uptimes to find retained references —
 * see docs/01-RaP/0915_20260603_MemoryLeakOOM_Analysis.md for the investigation
 * workflow this exists to support.
 */
import v8 from 'v8';
import path from 'path';

let installed = false;

/**
 * Install the SIGUSR2 → heap snapshot handler. Idempotent: subsequent calls
 * are no-ops, so it's safe to import-and-call once at app startup.
 *
 * @param {Object} [options]
 * @param {string} [options.outDir='/tmp'] Directory to write snapshots into.
 */
export function installHeapDumpHandler({ outDir = '/tmp' } = {}) {
  if (installed) return;
  installed = true;

  process.on('SIGUSR2', () => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(outDir, `castbot-heap-${ts}.heapsnapshot`);
    console.log(`[HeapDump] 📸 SIGUSR2 received — writing snapshot to ${outPath}`);
    console.log(`[HeapDump] ⚠️  Event loop will pause for several seconds during write.`);
    try {
      const start = Date.now();
      const writtenPath = v8.writeHeapSnapshot(outPath);
      const ms = Date.now() - start;
      console.log(`[HeapDump] ✅ Wrote ${writtenPath} in ${ms}ms`);
    } catch (err) {
      console.error(`[HeapDump] ❌ Failed to write snapshot:`, err.message);
    }
  });

  console.log(`[HeapDump] Installed SIGUSR2 handler. Trigger with: kill -SIGUSR2 ${process.pid}`);
}
