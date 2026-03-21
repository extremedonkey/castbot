# Incident 02: Production OOM Crash — Map Image Memory Exhaustion

**Date**: 2026-03-20 (Friday)
**Duration**: ~62 minutes (16:58 — 18:00 AWST)
**Severity**: P1 — Full production outage, all 140+ servers affected
**Detected by**: Reece (on phone, hosting work event)
**Root Cause**: Rapid Safari map image generation exhausted 447MB server RAM
**Recovery**: Manual SSH intervention from phone (AWS Console restart did NOT recover)

## Timeline (AWST = UTC+8)

| Time | Event |
|---|---|
| 15:20 | Oreo (oreo_stars) begins playing Safari in EmeraldORG test server |
| 15:20–15:39 | Rapid gameplay: 20+ movements, custom actions, map refreshes in 19 minutes |
| 15:39 | Last logged Oreo interaction |
| ~16:50 | Memory guard fires: `🚨 Low memory: 70MB free of 448MB — refusing map creation` |
| 16:58 | First crash — PM2 restarts process (PID 33692) |
| 17:13 | Second crash — PM2 restarts (PID 1388) |
| 17:15 | Third crash — PM2 restarts (PID 4001) |
| 17:22 | Fourth crash — PM2 restarts (PID 6280, 6837, 7064, 7303) |
| ~17:30 | Reece attempts AWS Console "Restart" — instance reboots |
| ~17:35 | Instance back up, Apache running, but PM2 NOT running (no systemd service) |
| ~17:45 | Reece SSHs from phone via AWS Console web terminal, manually starts PM2 |
| 18:00 | Bot recovered, fifth successful start (PID 7616) |

## Root Cause Analysis

### Primary: Memory Exhaustion from Map Image Generation

The production server is an AWS Lightsail instance with **447MB total RAM**. Each Sharp map image generation consumes ~30-50MB temporarily. Oreo's rapid clicking generated **44 map_update requests** in the March 20 log, many of which would have been concurrent.

With the bot already using ~250MB baseline, 3-4 concurrent map renders would push the server past its physical memory limit, triggering the Linux OOM killer which terminates the Node.js process.

**Evidence**:
- `🚨 Low memory: 70MB free of 448MB — refusing map creation` — memory guard caught ONE request, but previous requests had already consumed the RAM
- 44 `map_update` calls in the log (some concurrent based on timestamps)
- PM2 restart history shows 7+ restarts in rapid succession (crash loop)
- Each restart loads playerData (2.9MB JSON parse) + Discord.js client — consuming ~250MB before any user interaction

### Secondary: AWS Restart Didn't Recover

When Reece restarted the Lightsail instance from the AWS Console:
1. Apache auto-started (correctly — `systemctl enable bitnami` was configured)
2. PM2 did NOT auto-start — **`pm2 startup` was never configured**
3. No systemd service exists at `/etc/systemd/system/pm2-bitnami.service`
4. Bot was down even though the server was up

### Contributing Factors

1. **No request-level throttling on map generation** — concurrent Sharp renders are not queued
2. **No per-user rate limit on Safari interactions** — a single user can trigger unlimited concurrent operations
3. **Server undersized** — 447MB is marginal for a Node.js app with Sharp image processing
4. **`console.error` for expected conditions** — "Player not found for condition evaluation" floods stderr, making it harder to spot real errors

## What Already Existed (and Partially Helped)

- **Memory guard in mapExplorer.js** — refuses map creation when <80MB free. This caught the LAST request but not the ones already in-flight.
- **PM2 auto-restart** — correctly restarted the process after each crash. But with insufficient memory, each restart crashed again (OOM crash loop).

## Immediate Fixes Required

### Fix 1: PM2 Startup (CRITICAL — prevents AWS restart failure)

```bash
# Run on prod server (requires sudo):
sudo env PATH=$PATH:/opt/bitnami/node/bin /opt/bitnami/node/lib/node_modules/pm2/bin/pm2 startup systemd -u bitnami --hp /home/bitnami
pm2 save
```

This creates a systemd service that auto-starts PM2 on instance reboot.

### Fix 2: PM2 Memory Limit (prevents OOM crash loop)

```bash
# Set max memory restart threshold
pm2 restart castbot-pm --max-memory-restart 350M
pm2 save
```

When memory exceeds 350MB, PM2 gracefully restarts instead of waiting for OOM killer.

### Fix 3: Concurrent Map Generation Queue

Add a semaphore/mutex to limit concurrent Sharp operations to 1 at a time. This is the highest-leverage code fix — it prevents the memory spike that caused the crash.

```javascript
// In mapExplorer.js or a shared utility
let mapRenderInProgress = false;

export async function generateMapImage(...args) {
  if (mapRenderInProgress) {
    console.log('[MAP] Skipping concurrent render — another in progress');
    return null; // or return cached image
  }
  mapRenderInProgress = true;
  try {
    // ... existing Sharp logic ...
  } finally {
    mapRenderInProgress = false;
  }
}
```

## Future Resilience Improvements

| Improvement | Effort | Impact | Priority |
|---|---|---|---|
| PM2 startup systemd service | 5 min (prod SSH) | Prevents AWS restart failure | P0 — do NOW |
| PM2 max-memory-restart | 1 min (prod SSH) | Graceful restart before OOM | P0 — do NOW |
| Map render mutex/semaphore | 30 min | Prevents concurrent Sharp OOM | P1 — this session |
| Per-user interaction rate limit | 2 hours | Prevents rapid-fire abuse | P2 — next session |
| Server RAM upgrade (1GB) | $5/mo | Doubles headroom | P2 — evaluate |
| Health check endpoint | 1 hour | Auto-detect unhealthy state | P3 — future |
| Discord alert on PM2 crash | 30 min | Immediate notification | P2 — next session |

## Lessons Learned

1. **A single enthusiastic user can crash the entire bot** — no rate limiting means no protection
2. **AWS Console restart ≠ bot restart** — PM2 startup configuration is a hard requirement, not a nice-to-have
3. **Memory guards that refuse new work don't help with work already in-flight** — need to limit concurrency, not just refuse at the door
4. **447MB is too tight for Sharp** — the baseline Node.js + Discord.js footprint is ~250MB, leaving only ~200MB for actual work. One large image or two concurrent renders can tip it over.

## Related Incidents

- [01-MapImageOversizeOOM.md](01-MapImageOversizeOOM.md) — Previous map image incident (16MB PNG, fixed with compression)
- CLAUDE.md "Production Infrastructure Troubleshooting" — Apache/nginx restart procedure

## Action Items

- [ ] Run `pm2 startup` on prod (requires Reece's sudo password)
- [ ] Set `--max-memory-restart 350M` on prod
- [ ] Add map render mutex to prevent concurrent Sharp operations
- [ ] Downgrade "Player not found for condition evaluation" from `console.error` to `console.log`
- [ ] Add per-user interaction cooldown (future)
